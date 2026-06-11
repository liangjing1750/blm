"""Three-tier system prompt assembly.

Adapted from hermes' system_prompt.py:
  Stable tier  — identity, tool guidance, skills index (cache-friendly)
  Context tier — caller message + project files (AGENTS.md, .blm/SOUL.md)
  Volatile tier — memory snapshot, timestamp (never cached)
"""

from datetime import datetime, timezone

SKILLS_GUIDANCE = """## Skill System

Available skills are listed below. When a task matches a skill's description,
use skill_manage(action="view") to load its full content, then follow it exactly.

**Create new skills:** After completing a non-trivial task (5+ tool calls) that
has reuse value, call skill_manage(action="create") to save the workflow.
If you find a skill outdated or wrong, call skill_manage(action="patch") to fix it."""

MEMORY_GUIDANCE = """## Memory

The "Team Memory" section contains facts the team wants you to remember.
These are authoritative — follow them. Use memory_tool to add important facts
(user preferences, project conventions, environment details).

Do NOT save task progress or session outcomes — those belong in session history."""


def build_stable_prompt(identity_block: str, skills_index: str) -> str:
    """Stable tier — cached across turns."""
    parts = [identity_block, SKILLS_GUIDANCE]
    if skills_index:
        parts.append(skills_index)
    parts.append(MEMORY_GUIDANCE)
    return "\n\n".join(parts)


def build_context_prompt(
    system_message: str = "",
    project_files: list[tuple[str, str]] | None = None,
) -> str:
    """Context tier — injected once per session, depends on CWD."""
    parts = []
    if system_message:
        parts.append(system_message)
    if project_files:
        for name, content in project_files:
            parts.append(f"## {name}\n\n{content[:20000]}")
    return "\n\n".join(parts)


def build_volatile_prompt(memory_block: str = "") -> str:
    """Volatile tier — never cached, rebuilt each turn."""
    parts = []
    if memory_block:
        parts.append(memory_block)
    now = datetime.now(timezone.utc)
    parts.append(
        f"Session started: {now.strftime('%A, %B %d, %Y')}\n"
        f"Current time: {now.strftime('%Y-%m-%d %H:%M UTC')}"
    )
    return "\n\n".join(parts)


def assemble_system_prompt(
    identity: str,
    skills_index: str = "",
    system_message: str = "",
    project_files: list[tuple[str, str]] | None = None,
    memory_block: str = "",
) -> str:
    """Assemble the full three-tier system prompt."""
    stable = build_stable_prompt(identity, skills_index)
    context = build_context_prompt(system_message, project_files)
    volatile = build_volatile_prompt(memory_block)

    parts = [p for p in (stable, context, volatile) if p]
    return "\n\n---\n\n".join(parts)
