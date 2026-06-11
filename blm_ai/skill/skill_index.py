"""Skill index — scans skills directory, builds compact system prompt injection."""

from pathlib import Path

from blm_ai.skill.skill_manager import SKILL_FILE, _parse_frontmatter

# Guidance injected into the system prompt — tells the agent when to use/create skills.
SKILLS_GUIDANCE = """## 技能系统

下方是可用技能列表。遇到匹配的任务时，使用 skill_view 工具加载技能的完整内容。
加载后严格按技能的步骤执行。

**沉淀新技能：** 完成一个 ≥5 步工具调用、有复用价值的复杂任务后，
调用 skill_manage(action="create", ...) 将流程沉淀为新技能。
使用已有技能时如发现内容过时或错误，立即调用 skill_manage(action="patch", ...) 修正。"""


def build_skills_index(skills_dir: Path) -> str:
    """Scan all SKILL.md files and produce a compact index for the system prompt."""
    parts: list[str] = []
    skills_dir = Path(skills_dir)
    if not skills_dir.exists():
        return ""

    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        skill_file = entry / SKILL_FILE
        if not skill_file.exists():
            continue
        try:
            meta, _ = _parse_frontmatter(skill_file.read_text("utf-8"))
        except Exception:
            continue
        name = meta.get("name", entry.name)
        desc = meta.get("description", "")
        tags = meta.get("tags", [])
        tag_str = f" [{', '.join(tags)}]" if tags else ""
        parts.append(f"  - **{name}**: {desc}{tag_str}")

    if not parts:
        return ""

    return SKILLS_GUIDANCE + "\n\n" + "\n".join(parts)


def get_skill_names(skills_dir: Path) -> list[str]:
    """Return just the list of skill names (for the skill_list tool)."""
    names = []
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        skill_file = entry / SKILL_FILE
        if not skill_file.exists():
            continue
        try:
            meta, _ = _parse_frontmatter(skill_file.read_text("utf-8"))
            names.append(meta.get("name", entry.name))
        except Exception:
            continue
    return names
