"""权限管线 — 5 门策略评估 + Plan 模式守卫 + 安全路径不可旁路。

融合 cc 的 deny→rule→tool-specific→safety guard 链
+ reasonix 的 plan-mode 写阻止 + bash 只读分类。

参考来源:
  - cc permissions.ts: checkRuleBasedPermissions 5 步评估链
  - reasonix permission.go: 三态决策 (Deny/Ask/Allow) + Gate 接口
  - pi-mono 权限模式: default/acceptEdits/plan/bypass

数据流:
  Gate 0: Plan 模式 → 阻止所有非只读工具
  Gate 1: 内置危险模式 → bash deny list
  Gate 2: 工具自身 check_permissions()
  Gate 3: 用户策略规则评估
  Gate 4: 安全路径守卫（永不旁路，即使 bypass 模式）
"""

import json
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional


class PermissionGate(Enum):
    """权限门控结果 — 三态决策。"""
    DENY = "deny"   # 直接拒绝
    ALLOW = "allow"  # 直接允许
    ASK = "ask"     # 需要用户确认


class PermissionMode(Enum):
    """Agent 运行模式 — 影响默认权限策略。"""
    DEFAULT = "default"           # 每步询问
    PLAN = "plan"                 # 只读模式（阻止所有写操作）
    ACCEPT_EDITS = "accept_edits"  # 自动接受文件修改
    BYPASS = "bypass"             # 跳过所有提示
    HEADLESS = "headless"         # 无人值守自动允许

# ---- 权限规则 ----

@dataclass
class PermissionRule:
    """单条权限规则 — 匹配工具名称和可选内容 glob。

    模式: "bash" 匹配精确工具名, "mcp__server1__*" 匹配 MCP 前缀。
    content_glob 用于工具特定的子规则匹配（如 bash(rm -rf*)）。
    """
    tool_pattern: str
    behavior: PermissionGate
    content_glob: Optional[str] = None

    def matches_tool(self, tool_name: str) -> bool:
        """检查此规则是否匹配给定工具名。"""
        if self.tool_pattern.endswith("__*"):
            return tool_name.startswith(self.tool_pattern[:-3])
        return tool_name == self.tool_pattern

# ---- 策略 ----

@dataclass
class PermissionPolicy:
    """权限策略 — 规则按优先级排序（deny > allow > ask）。"""
    deny_rules: list[PermissionRule] = field(default_factory=list)
    ask_rules: list[PermissionRule] = field(default_factory=list)
    allow_rules: list[PermissionRule] = field(default_factory=list)
    mode: PermissionMode = PermissionMode.DEFAULT

    def evaluate(self, tool_name: str, tool_input: dict) -> PermissionGate:
        """按优先级评估策略规则 — deny 优先于 allow 优先于 ask。

        评估步骤:
          1. 遍历 deny 规则 → 匹配则返回 DENY
          2. 遍历 allow 规则 → 匹配则返回 ALLOW
          3. 模式旁路 → BYPASS/HEADLESS 返回 ALLOW
          4. 遍历 ask 规则 → 匹配则返回 ASK
          5. 默认 → HEADLESS 返回 ALLOW，否则 ASK
        """
        # 1. Deny 规则优先
        for rule in self.deny_rules:
            if rule.matches_tool(tool_name):
                if rule.content_glob:
                    if _glob_match(rule.content_glob, _extract_subject(tool_name, tool_input)):
                        return PermissionGate.DENY
                else:
                    return PermissionGate.DENY

        # 2. 显式 allow 规则
        for rule in self.allow_rules:
            if rule.matches_tool(tool_name):
                if rule.content_glob:
                    if _glob_match(rule.content_glob, _extract_subject(tool_name, tool_input)):
                        return PermissionGate.ALLOW
                else:
                    return PermissionGate.ALLOW

        # 3. 模式旁路
        if self.mode in (PermissionMode.BYPASS, PermissionMode.HEADLESS):
            return PermissionGate.ALLOW

        # 4. Ask 规则
        for rule in self.ask_rules:
            if rule.matches_tool(tool_name):
                return PermissionGate.ASK

        # 5. 默认
        return PermissionGate.ALLOW if self.mode == PermissionMode.HEADLESS else PermissionGate.ASK

# ---- 权限管线 ----

class PermissionPipeline:
    """5 门权限管线 — 组合策略、Plan 模式、安全守卫。

    门控顺序（cc 模式）:
      Gate 0: Plan 模式 — 阻止非只读工具
      Gate 1: 内置危险模式 — 硬编码 deny list
      Gate 2: 工具自身检查 — tool.check_permissions()
      Gate 3: 策略评估 — 用户配置的规则
      Gate 4: 安全路径守卫 — 永不旁路的系统保护

    交互模式: ASK = 弹出审批对话框
    无头模式: ASK = ALLOW（自动允许）
    """

    # 内置危险模式（cc 的 deny list）
    DEFAULT_DENY_PATTERNS: list[str] = [
        r"rm\s+-rf\s+/",
        r"sudo\b",
        r"shutdown\b", r"reboot\b", r"halt\b",
        r">\s*/dev/sd[a-z]",
        r"mkfs\.[a-z]+\s+/dev/",
        r"dd\s+if=/dev/(?:zero|random|urandom)",
        r"chmod\s+777\s+/",
        r":\(\)\s*\{\s*:\|:&\s*\}",
        r"wget\s+.*\|\s*(?:ba)?sh",
        r"curl\s+.*\|\s*(?:ba)?sh",
    ]

    # 安全路径 — 即使在 bypass 模式下也必须询问
    SAFETY_PATHS: list[str] = [
        r"\.git/", r"\.git\\",
        r"\.claude/", r"\.codex/",
        r"\.env$", r"\.env\.",
        r"\.bashrc$", r"\.zshrc$", r"\.profile$",
        r"\.ssh/", r"\.gnupg/",
    ]

    def __init__(
        self,
        policy: Optional[PermissionPolicy] = None,
        plan_mode: bool = False,
        interactive: bool = True,
    ):
        self.policy = policy or PermissionPolicy()
        self.plan_mode = plan_mode
        self.interactive = interactive
        self._deny_regexes = [re.compile(p) for p in self.DEFAULT_DENY_PATTERNS]
        self._safety_regexes = [re.compile(p) for p in self.SAFETY_PATHS]
        self._denial_count: int = 0  # 连续拒绝计数

    def check(
        self,
        tool_name: str,
        tool_input: dict,
        is_read_only: bool = False,
        tool_check: Optional[Callable] = None,
    ) -> PermissionGate:
        """5 门权限检查 — 返回最终的权限决策。

        参数:
            tool_name: 工具名称
            tool_input: 工具参数
            is_read_only: 工具是否只读
            tool_check: 工具自身的 check_permissions 方法
        返回:
            ALLOW / DENY / ASK
        """
        # Gate 0: Plan 模式阻止写操作
        if self.plan_mode and not is_read_only:
            return PermissionGate.DENY

        # Gate 1: 内置危险模式（仅 bash 工具）
        if tool_name == "bash":
            cmd = tool_input.get("command", "")
            for regex in self._deny_regexes:
                if regex.search(cmd):
                    return PermissionGate.DENY

        # Gate 2: 工具自身权限检查
        if tool_check:
            try:
                result = tool_check(tool_input)
                if result == PermissionGate.DENY:
                    return PermissionGate.DENY
            except Exception:
                pass

        # Gate 3: 策略评估
        gate = self.policy.evaluate(tool_name, tool_input)
        if gate == PermissionGate.DENY:
            self._denial_count += 1
            return PermissionGate.DENY
        if gate == PermissionGate.ALLOW:
            self._denial_count = 0
            return PermissionGate.ALLOW

        # Gate 4: 安全路径守卫（永不旁路）
        if tool_name == "bash":
            cmd = tool_input.get("command", "")
            for regex in self._safety_regexes:
                if regex.search(cmd):
                    return PermissionGate.ASK

        # 非交互模式自动允许
        if not self.interactive:
            return PermissionGate.ALLOW

        return PermissionGate.ASK

    def switch_mode(self, mode: str) -> None:
        """运行时切换权限模式。"""
        mode_map = {
            "default": PermissionMode.DEFAULT,
            "plan": PermissionMode.PLAN,
            "accept_edits": PermissionMode.ACCEPT_EDITS,
            "bypass": PermissionMode.BYPASS,
            "headless": PermissionMode.HEADLESS,
        }
        self.policy.mode = mode_map.get(mode, PermissionMode.DEFAULT)

    def load_rules_from_file(self, path: str | Path) -> None:
        """从 JSON 文件加载用户配置的权限规则。

        文件格式:
        {
          "deny": [{"tool": "bash", "content": "rm -rf*"}],
          "allow": [{"tool": "bash(ls *)"}],
          "ask": [{"tool": "mcp__*"}]
        }
        """
        path = Path(path)
        if not path.exists():
            return
        data = json.loads(path.read_text("utf-8"))
        for list_name, rule_list in [("deny", self.policy.deny_rules),
                                       ("allow", self.policy.allow_rules),
                                       ("ask", self.policy.ask_rules)]:
            for entry in data.get(list_name, []):
                rule_list.append(PermissionRule(
                    tool_pattern=entry.get("tool", ""),
                    behavior=PermissionGate.DENY if list_name == "deny"
                    else PermissionGate.ALLOW if list_name == "allow"
                    else PermissionGate.ASK,
                    content_glob=entry.get("content"),
                ))

# ---- 辅助函数 ----

def _extract_subject(tool_name: str, args: dict) -> str:
    """从工具参数提取"主体"用于 content_glob 匹配。"""
    if tool_name == "bash":
        return args.get("command", "")
    for key in ("file_path", "path", "pattern"):
        if key in args:
            return str(args[key])
    return ""


def _glob_match(glob: str, subject: str) -> bool:
    """简单 glob 匹配 — * 匹配任意序列。"""
    regex = re.escape(glob).replace(r"\*", ".*")
    return bool(re.match(f"^{regex}$", subject))
