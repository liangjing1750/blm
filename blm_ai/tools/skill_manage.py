"""skill_manage tool — exposed to the Agent for skill CRUD operations."""

from pathlib import Path

from blm_ai.kernel.tool import Tool, ToolContext
from blm_ai.skill.skill_manager import SkillError, SkillManager
from blm_ai.skill.skill_index import get_skill_names
from blm_ai.skill.skill_telemetry import bump_patch, bump_use, bump_view


class SkillManageTool(Tool):
    name = "skill_manage"
    description = (
        "Manage skills: list, view, create, patch, edit, delete, restore. "
        "Use 'list' to see all skills. 'view' to load full content. "
        "'create' to save a new skill (provide name, description, content as markdown). "
        "'patch' to fix a small part (old_string + new_string). "
        "'delete' to archive a skill."
    )
    parameters = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["list", "view", "create", "patch", "edit", "delete", "restore"],
                "description": "The action to perform"
            },
            "name": {"type": "string"},
            "description": {"type": "string"},
            "content": {"type": "string"},
            "old_string": {"type": "string"},
            "new_string": {"type": "string"},
            "permanent": {"type": "boolean"},
        },
        "required": ["action"],
    }
    read_only = False

    def __init__(self, skills_dir: Path):
        super().__init__()
        self._mgr = SkillManager(skills_dir)
        self._skills_dir = skills_dir

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        action = args.get("action", "")
        name = args.get("name", "")
        try:
            if action == "list":
                skills = self._mgr.list_all()
                if not skills:
                    return "(no skills yet)"
                return "\n".join(f"- {s['name']}: {s['description']}" for s in skills)

            if action == "view":
                content = self._mgr.view(name)
                if content is None:
                    names = get_skill_names(self._skills_dir)
                    return f"Skill '{name}' not found. Available: {', '.join(names)}"
                bump_view(self._skills_dir, name)
                return content

            if action == "create":
                return self._do_create(args, name)

            if action == "patch":
                return self._do_patch(args, name)

            if action == "edit":
                return self._do_edit(args, name)

            if action == "delete":
                return self._do_delete(args, name)

            if action == "restore":
                return self._do_restore(args, name)

            return f"Unknown action: {action}"
        except SkillError as exc:
            return f"Skill error: {exc}"
        except Exception as exc:
            return f"Error: {exc}"

    def _do_create(self, args: dict, name: str) -> str:
        desc = args.get("description", "")
        content = args.get("content", "")
        path = self._mgr.create(name, desc, content)
        bump_use(self._skills_dir, name)
        return f"Skill '{name}' created at {path}"

    def _do_patch(self, args: dict, name: str) -> str:
        old, new = args.get("old_string", ""), args.get("new_string", "")
        if self._mgr.patch(name, old, new):
            bump_patch(self._skills_dir, name)
            return f"Skill '{name}' patched"
        return f"Patch failed: text not found in '{name}'"

    def _do_edit(self, args: dict, name: str) -> str:
        content = args.get("content", "")
        if self._mgr.edit(name, content):
            bump_patch(self._skills_dir, name)
            return f"Skill '{name}' updated"
        return f"Skill '{name}' not found"

    def _do_delete(self, args: dict, name: str) -> str:
        permanent = args.get("permanent", False)
        if self._mgr.delete(name, permanent=permanent):
            return f"Skill '{name}' {'deleted' if permanent else 'archived'}"
        return f"Skill '{name}' not found"

    def _do_restore(self, args: dict, name: str) -> str:
        archived = self._mgr._archive_dir / name
        if archived.is_dir():
            import shutil
            dest = self._skills_dir / name
            if dest.exists():
                shutil.rmtree(dest)
            shutil.move(str(archived), str(dest))
            return f"Skill '{name}' restored"
        return f"Skill '{name}' not found in archive"


def create_skill_manage_tool(skills_dir: Path) -> Tool:
    return SkillManageTool(skills_dir)
