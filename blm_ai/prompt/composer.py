"""系统提示词组装器 — 8层文件式架构，参考 claw0 s06_intelligence。

每层对应工作区 `.blm/` 下的一个文件。文件即提示词——修改文件即可改变 Agent 行为，
无需改代码。层序决定影响力——越靠前的层对模型行为影响越强。

8 层结构:
  L1: Identity   — IDENTITY.md   (你是谁)
  L2: Soul       — SOUL.md       (性格+能力边界+诚实准则)
  L3: Tool Guide — TOOLS.md      (工具使用规范)
  L4: Skills     — skills/*/SKILL.md (可用技能索引)
  L5: Memory     — MEMORY.md     (团队记忆)
  L6: Bootstrap  — BOOTSTRAP.md  (项目背景+约定)
  L7: Runtime    — (动态生成)     (时间/模型/会话)
  L8: Channel    — (动态生成)     (CLI/Web/API)
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from blm_ai.skill.skill_index import build_skills_index

logger = logging.getLogger(__name__)

MAX_FILE_CHARS = 20_000
MAX_TOTAL_CHARS = 150_000

# ---- 各层加载 ----

def _load_file(path: Path) -> str:
    """安全加载文件 — 截断到 MAX_FILE_CHARS。"""
    if not path.exists():
        return ""
    return path.read_text("utf-8").strip()[:MAX_FILE_CHARS]


def layer_identity(blm_dir: Path) -> str:
    """L1: 身份声明。"""
    content = _load_file(blm_dir / "IDENTITY.md")
    if content:
        return f"## Identity\n\n{content}"
    return "## Identity\n\nYou are BLM Agent, a business language modeling assistant."


def layer_soul(blm_dir: Path) -> str:
    """L2: 灵魂/人格 — 能力边界 + 诚实准则。"""
    content = _load_file(blm_dir / "SOUL.md")
    if content:
        return f"## Personality\n\n{content}"
    from blm_ai.service.personality import DEFAULT_SOUL
    return f"## Personality\n\n{DEFAULT_SOUL.strip()}"


def layer_tool_guide(blm_dir: Path) -> str:
    """L3: 工具使用规范。"""
    content = _load_file(blm_dir / "TOOLS.md")
    if content:
        return f"## Tool Usage\n\n{content}"
    return _default_tool_guide()


def _default_tool_guide() -> str:
    return """## Tool Usage

- Use `list_workspaces` to see available workspaces before reading
- Use `read_workspace` to load document content before analyzing
- Use `read_workspace_json` when you need the exact document structure
- Use `save_workspace` to persist changes (creates parent directories)
- Use `skill_manage` to list/view/create/patch skills
- Use `memory` to save and recall team conventions
- Use `bash` for file operations only — it runs in the workspace directory
- Tool errors are shown to you — adapt and retry if recoverable"""


def layer_skills(skills_dir: Path) -> str:
    """L4: 技能索引 — 两层加载（索引→完整内容）。"""
    idx = build_skills_index(skills_dir)
    return idx if idx else ""


def layer_memory(memory_path: Path) -> str:
    """L5: 团队记忆 — 冻结快照（会话期间不变）。"""
    content = _load_file(memory_path)
    if content:
        return f"## Team Memory\n\n{content}\n\nFollow these team conventions and facts."
    return ""


def layer_bootstrap(blm_dir: Path) -> str:
    """L6: 项目引导 — BOOTSTRAP.md + AGENTS.md。"""
    parts = []
    for name in ("BOOTSTRAP.md", "AGENTS.md"):
        content = _load_file(blm_dir / name)
        if content:
            parts.append(f"## {name.replace('.md', '')}\n\n{content}")
    return "\n\n".join(parts)


def layer_runtime(model_id: str = "", session_id: str = "", channel: str = "cli") -> str:
    """L7: 运行时上下文 — 动态生成，每次可能变化。"""
    now = datetime.now(timezone.utc)
    return (
        f"## Runtime\n\n"
        f"- Model: {model_id}\n"
        f"- Channel: {channel}\n"
        f"- Current time: {now.strftime('%Y-%m-%d %H:%M UTC')}\n"
    )


def layer_channel(channel: str = "cli") -> str:
    """L8: 通道提示 — 根据通信渠道调整行为。"""
    hints = {
        "cli": "## Channel\nYou are responding via CLI. Use Chinese. Be concise.",
        "web": "## Channel\nYou are responding via Web UI. Use Chinese. Rich formatting supported.",
        "api": "## Channel\nYou are responding via API. Output will be streamed as SSE events.",
    }
    return hints.get(channel, hints["cli"])


# ---- 组装入口 ----

def assemble(
    blm_dir: str | Path,
    skills_dir: str | Path | None = None,
    memory_path: str | Path | None = None,
    model_id: str = "",
    session_id: str = "",
    channel: str = "cli",
) -> str:
    """组装完整的 8 层系统提示词。

    参数:
        blm_dir: .blm 目录路径
        skills_dir: 技能目录（默认: blm_dir/skills）
        memory_path: 记忆文件路径（默认: blm_dir/MEMORY.md）
        model_id: 模型名称
        session_id: 会话 ID
        channel: 通道类型 ("cli"/"web"/"api")
    返回:
        完整系统提示词字符串
    """
    bd = Path(blm_dir)
    sd = Path(skills_dir) if skills_dir else (bd / "skills")
    mp = Path(memory_path) if memory_path else (bd / "MEMORY.md")

    layers = [
        layer_identity(bd),
        layer_soul(bd),
        layer_tool_guide(bd),
        layer_skills(sd),
        layer_memory(mp),
        layer_bootstrap(bd),
        layer_runtime(model_id, session_id, channel),
        layer_channel(channel),
    ]

    prompt = "\n\n".join(l for l in layers if l)
    total = len(prompt)

    if total > MAX_TOTAL_CHARS:
        logger.warning("System prompt exceeds max (%d > %d chars), truncating", total, MAX_TOTAL_CHARS)
        prompt = prompt[:MAX_TOTAL_CHARS]

    logger.debug("Assembled system prompt: %d chars, %d layers", total, sum(1 for l in layers if l))
    return prompt
