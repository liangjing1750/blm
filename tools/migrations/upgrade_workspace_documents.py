from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from blm_core.merge import validate_document
from blm_core.storage import WorkspaceStorage


def copy_workspace_entry(workspace: Path, name: str, backup_root: Path) -> None:
    package_dir = workspace / name
    json_path = workspace / f"{name}.json"
    md_path = workspace / f"{name}.md"
    backup_root.mkdir(parents=True, exist_ok=True)
    if package_dir.is_dir():
        shutil.copytree(package_dir, backup_root / name, dirs_exist_ok=True)
    if json_path.is_file():
        shutil.copy2(json_path, backup_root / json_path.name)
    if md_path.is_file():
        shutil.copy2(md_path, backup_root / md_path.name)


def remove_children(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
        count += 1
    return count


def upgrade_workspace_documents(
    workspace: Path,
    *,
    dry_run: bool = False,
    clear_history_trash: bool = False,
    documents: list[str] | None = None,
) -> dict:
    storage = WorkspaceStorage(workspace)
    names = documents or storage.list_documents()
    backup_root = workspace / ".migration-backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
    results = []

    for name in names:
        document = storage.load(name)
        issues_before = validate_document(document)
        if not dry_run:
            copy_workspace_entry(workspace, name, backup_root)
            saved = storage.save(name, document)
            issues_after = validate_document(saved)
        else:
            issues_after = issues_before
        results.append(
            {
                "name": name,
                "dry_run": dry_run,
                "counts": {
                    "stages": len(document.get("stages", [])),
                    "processes": len(document.get("processes", [])),
                    "entities": len(document.get("entities", [])),
                    "businessComponents": len(document.get("businessComponents", [])),
                    "businessConstructs": len(document.get("businessConstructs", [])),
                    "taskDefinitions": len(document.get("taskDefinitions", [])),
                },
                "validationIssuesBefore": len(issues_before),
                "validationIssuesAfter": len(issues_after),
            }
        )

    cleanup = {"history": 0, "trash": 0}
    if clear_history_trash and not dry_run:
        cleanup["history"] = remove_children(workspace / ".history")
        cleanup["trash"] = remove_children(workspace / ".trash")

    return {
        "workspace": str(workspace),
        "dry_run": dry_run,
        "backup": "" if dry_run else str(backup_root),
        "documents": results,
        "cleanup": cleanup,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upgrade BLM workspace documents to the current schema.")
    parser.add_argument("--workspace", default="workspace", help="Workspace directory. Default: workspace")
    parser.add_argument("--dry-run", action="store_true", help="Load and validate without writing files.")
    parser.add_argument("--clear-history-trash", action="store_true", help="Clear .history and .trash after successful upgrade.")
    parser.add_argument("--document", action="append", dest="documents", help="Document name to upgrade. Repeatable.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = upgrade_workspace_documents(
        Path(args.workspace).resolve(),
        dry_run=args.dry_run,
        clear_history_trash=args.clear_history_trash,
        documents=args.documents,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
