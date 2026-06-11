"""BLM workspace tools — read/write/list workspace documents."""

import json
import sys
from pathlib import Path

from blm_ai.kernel.tool import Tool, ToolContext


def create_blm_tools(workspace_dir: Path) -> list[Tool]:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from blm_core.storage import WorkspaceStorage
    storage = WorkspaceStorage(workspace_dir)

    class ListWorkspaces(Tool):
        name = "list_workspaces"
        description = "List all BLM workspace documents with titles and tags."
        parameters = {"type": "object", "properties": {}, "required": []}
        read_only = True

        async def execute(self, args: dict, ctx: ToolContext) -> str:
            try:
                docs = storage.list_documents()
                sums = storage.list_document_summaries()
                lines = [f"- **{s['name']}**: {s['title']} [{s['space']}] "
                         f"{', '.join(s.get('tags', []))}" for s in sums]
                return "\n".join(lines) if lines else "(no workspaces)"
            except Exception as exc:
                return f"Error: {exc}"

    class ReadWorkspace(Tool):
        name = "read_workspace"
        description = "Read a workspace document as formatted markdown."
        parameters = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }
        read_only = True

        async def execute(self, args: dict, ctx: ToolContext) -> str:
            try:
                return storage.export_markdown(args["name"])[:50000]
            except FileNotFoundError:
                return f"Workspace '{args.get('name')}' not found"
            except Exception as exc:
                return f"Error: {exc}"

    class ReadWorkspaceJson(Tool):
        name = "read_workspace_json"
        description = "Read a workspace document as raw JSON."
        parameters = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }
        read_only = True

        async def execute(self, args: dict, ctx: ToolContext) -> str:
            try:
                doc = storage.load(args["name"])
                return json.dumps(doc, ensure_ascii=False, indent=2)[:50000]
            except Exception as exc:
                return f"Error: {exc}"

    class SaveWorkspace(Tool):
        name = "save_workspace"
        description = "Save (create or update) a workspace document."
        parameters = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "document": {"type": "object"},
            },
            "required": ["name", "document"],
        }
        read_only = False

        async def execute(self, args: dict, ctx: ToolContext) -> str:
            try:
                doc = args["document"]
                if isinstance(doc, str):
                    doc = json.loads(doc)
                storage.save(args["name"], doc)
                return f"Saved workspace '{args['name']}'"
            except Exception as exc:
                return f"Error: {exc}"

    class CreateWorkspace(Tool):
        name = "create_workspace"
        description = "Create a new empty workspace document."
        parameters = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }
        read_only = False

        async def execute(self, args: dict, ctx: ToolContext) -> str:
            try:
                from blm_core.document import create_empty_document
                doc = create_empty_document()
                doc["meta"]["domain"] = args["name"]
                storage.save(args["name"], doc)
                return f"Created workspace '{args['name']}'"
            except Exception as exc:
                return f"Error: {exc}"

    return [
        ListWorkspaces(), ReadWorkspace(), ReadWorkspaceJson(),
        SaveWorkspace(), CreateWorkspace(),
    ]
