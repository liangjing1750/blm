"""钩子系统 — PreToolUse / PostToolUse / Stop / UserSubmit 生命周期钩子。

reasonix hook.go 模式：用户可配置的 shell 脚本在工具执行前后触发。
安全：项目级钩子需要显式信任后才能首次执行。

参考来源:
  - reasonix hook/hook.go: PreToolUse/PostToolUse/Stop 钩子接口
  - cc hook system: 用户配置的 shell 钩子，exit 2 = block
"""

import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

# ---- 类型定义 ----

HookFn = Callable[[str, dict], "HookResult"]


@dataclass
class HookResult:
    """钩子执行结果。

    block=True 阻止工具执行，reasonix 模式 exit 2 = block。
    message 给用户的解释文本，output 是 shell 钩子的 stdout。
    """
    block: bool = False
    message: str = ""
    output: str = ""


@dataclass
class HookConfig:
    """单个事件的钩子配置 — 包含 shell 命令列表和信任状态。"""
    commands: list[str] = field(default_factory=list)
    trusted: bool = False
    enabled: bool = True

# ---- 钩子管理器 ----

class HookManager:
    """管理 Agent 生命周期四个阶段的钩子：pre_tool, post_tool, stop, submit。

    每个阶段可以有多个钩子（Python 函数 + shell 脚本）。
    钩子按注册顺序链式执行，第一个 block=True 的结果终止后续钩子。

    用法:
        hm = HookManager(workspace_dir)
        hm.on_pre_tool(lambda name, args: HookResult())
        hm.load_shell_hooks(project_dir, trusted=True)
    """

    def __init__(self, workspace_dir: Path):
        self.workspace_dir = Path(workspace_dir)
        self._pre_tool: list[HookFn] = []
        self._post_tool: list[HookFn] = []
        self._on_stop: list[HookFn] = []
        self._on_submit: list[HookFn] = []

    # ---- 注册 Python 钩子 ----

    def on_pre_tool(self, fn: HookFn) -> None:
        """注册工具执行前钩子 — 可阻止工具执行。"""
        self._pre_tool.append(fn)

    def on_post_tool(self, fn: HookFn) -> None:
        """注册工具执行后钩子 — 可追加输出。"""
        self._post_tool.append(fn)

    def on_stop(self, fn: HookFn) -> None:
        """注册 Agent 停止钩子 — 清理或通知。"""
        self._on_stop.append(fn)

    def on_user_submit(self, fn: HookFn) -> None:
        """注册用户提交钩子 — 用户每次发送消息时触发。"""
        self._on_submit.append(fn)

    # ---- 执行 ----

    def run_pre_tool(self, tool_name: str, args: dict) -> HookResult:
        """执行所有 pre_tool 钩子链，返回第一个阻止结果。"""
        return self._run_chain(self._pre_tool, tool_name, args)

    def run_post_tool(self, tool_name: str, args: dict) -> HookResult:
        """执行所有 post_tool 钩子链，收集所有输出。"""
        return self._run_chain(self._post_tool, tool_name, args)

    def run_on_stop(self, tool_name: str = "", args: dict | None = None) -> HookResult:
        """执行所有 stop 钩子链。"""
        return self._run_chain(self._on_stop, tool_name, args or {})

    def run_on_submit(self, prompt: str, args: dict | None = None) -> HookResult:
        """执行所有 submit 钩子链。"""
        return self._run_chain(self._on_submit, "user_submit",
                               {"prompt": prompt, **(args or {})})

    @staticmethod
    def _run_chain(hooks: list[HookFn], tool_name: str, args: dict) -> HookResult:
        """按注册顺序链式执行钩子 — 阻止结果短路。"""
        combined_output = ""
        for hook in hooks:
            try:
                result = hook(tool_name, args)
                if result.block:
                    return result
                if result.output:
                    combined_output += ("\n" + result.output) if combined_output else result.output
            except Exception:
                pass  # 单个钩子失败不中断链
        return HookResult(output=combined_output)

    # ---- Shell 钩子加载 ----

    def load_shell_hooks(self, project_dir: Path, trusted: bool = False) -> None:
        """从 .blm/hooks/ 目录加载 shell 脚本钩子。

        目录结构:
          .blm/hooks/
            pre_tool.sh    — 工具执行前运行
            post_tool.sh   — 工具执行后运行
            stop.sh        — Agent 停止时运行

        Shell 退出码语义（reasonix 模式）:
          exit 0 = 成功
          exit 1 = 非致命错误（输出仍传递）
          exit 2 = BLOCK（阻止工具执行）

        参数:
            project_dir: 项目根目录
            trusted: 是否信任这些钩子（首次使用需用户确认）
        """
        hooks_dir = Path(project_dir) / ".blm" / "hooks"
        if not hooks_dir.exists():
            return

        mapping = [
            ("pre_tool.sh", self._pre_tool),
            ("post_tool.sh", self._post_tool),
            ("stop.sh", self._on_stop),
        ]
        for hook_name, hook_list in mapping:
            script = hooks_dir / hook_name
            if script.exists() and script.is_file():
                if trusted or _is_trusted(hooks_dir, hook_name):
                    fn = _make_shell_hook(str(script))
                    hook_list.append(fn)


def _make_shell_hook(script_path: str) -> HookFn:
    """创建 shell 钩子的 Python 包装器。

    通过环境变量 BLM_TOOL_NAME 和 BLM_TOOL_ARGS 传递上下文给 shell 脚本。
    30 秒超时防止钩子挂起。
    """
    def shell_hook(tool_name: str, args: dict) -> HookResult:
        env = os.environ.copy()
        env["BLM_TOOL_NAME"] = tool_name
        env["BLM_TOOL_ARGS"] = str(args)
        try:
            result = subprocess.run(
                ["bash", script_path],
                input=str(args),
                capture_output=True,
                text=True,
                timeout=30,
                env=env,
            )
            return HookResult(
                block=result.returncode == 2,  # exit 2 = block（reasonix 模式）
                output=result.stdout.strip(),
                message=result.stderr.strip(),
            )
        except subprocess.TimeoutExpired:
            return HookResult(message=f"Hook timed out: {script_path}")
        except FileNotFoundError:
            return HookResult(message=f"Hook not found: {script_path}")
        except Exception as exc:
            return HookResult(message=str(exc))

    return shell_hook


def _is_trusted(hooks_dir: Path, name: str) -> bool:
    """检查钩子是否已被信任 — 读取 .blm/hooks/.trusted 文件。"""
    trust_file = hooks_dir / ".trusted"
    if not trust_file.exists():
        return False
    trusted = trust_file.read_text("utf-8").strip().splitlines()
    return name in trusted
