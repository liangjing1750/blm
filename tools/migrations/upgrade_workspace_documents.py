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


LEGACY_FIELD_PATTERNS = ("Id", "Ids", "_id", "_ids")


def find_legacy_model_fields(value, path: str = "") -> list[str]:
    result: list[str] = []
    if isinstance(value, list):
        for index, item in enumerate(value):
            result.extend(find_legacy_model_fields(item, f"{path}[{index}]"))
        return result
    if not isinstance(value, dict):
        return result
    for key, child in value.items():
        child_path = f"{path}.{key}" if path else key
        if (
            key == "id"
            or key == "ownerId"
            or key == "applies_to"
            or any(key.endswith(suffix) for suffix in LEGACY_FIELD_PATTERNS)
        ):
            result.append(child_path)
        result.extend(find_legacy_model_fields(child, child_path))
    return result


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


def load_manifest(package_dir: Path) -> dict:
    manifest_path = package_dir / "manifest.json"
    if not manifest_path.is_file():
        return {}
    try:
        payload = json.loads(manifest_path.read_text("utf-8"))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def count_dirty_stage_flow_entries(document: dict) -> dict[str, int]:
    dirty_refs = 0
    for ref in document.get("stageFlowRefs", []) if isinstance(document.get("stageFlowRefs"), list) else []:
        if not isinstance(ref, dict):
            continue
        if not str(ref.get("stageUid") or ref.get("stageId") or "").strip():
            dirty_refs += 1
            continue
        if not str(ref.get("processUid") or ref.get("processId") or "").strip():
            dirty_refs += 1
    dirty_links = 0
    for link in document.get("stageFlowLinks", []) if isinstance(document.get("stageFlowLinks"), list) else []:
        if not isinstance(link, dict):
            continue
        if not str(link.get("stageUid") or link.get("stageId") or "").strip():
            dirty_links += 1
            continue
        if not str(link.get("fromRefUid") or link.get("fromRefId") or "").strip():
            dirty_links += 1
            continue
        if not str(link.get("toRefUid") or link.get("toRefId") or "").strip():
            dirty_links += 1
    return {"stageFlowRefs": dirty_refs, "stageFlowLinks": dirty_links}


def upgrade_package_dir(storage: WorkspaceStorage, package_dir: Path, document_name: str, *, dry_run: bool) -> dict:
    raw_before = load_manifest(package_dir)
    document = storage._load_package_dir(package_dir)
    issues_before = validate_document(document)
    legacy_before = find_legacy_model_fields(document)
    dirty_before = count_dirty_stage_flow_entries(raw_before)
    if dry_run:
        saved = document
    else:
        saved = storage._write_package_dir(package_dir, document_name, document, source_package_dir=package_dir)
    raw_after = load_manifest(package_dir) if package_dir.is_dir() else saved
    issues_after = validate_document(saved)
    legacy_after = find_legacy_model_fields(raw_after)
    dirty_after = count_dirty_stage_flow_entries(raw_after)
    return {
        "validationIssuesBefore": len(issues_before),
        "validationIssuesAfter": len(issues_after),
        "legacyFieldCountBefore": len(legacy_before),
        "legacyFieldCountAfter": len(legacy_after),
        "legacyFieldSamplesAfter": legacy_after[:10],
        "dirtyStageFlowBefore": dirty_before,
        "dirtyStageFlowAfter": dirty_after,
    }


def history_snapshot_dirs(workspace: Path, document_name: str) -> list[Path]:
    history_root = workspace / ".history" / document_name
    if not history_root.is_dir():
        return []
    return sorted(path for path in history_root.iterdir() if path.is_dir() and (path / "manifest.json").is_file())


def upgrade_workspace_documents(
    workspace: Path,
    *,
    dry_run: bool = False,
    clear_history_trash: bool = False,
    include_history: bool = True,
    documents: list[str] | None = None,
) -> dict:
    storage = WorkspaceStorage(workspace)
    names = documents or storage.list_documents()
    backup_root = workspace / ".migration-backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
    results = []

    for name in names:
        package_dir = workspace / name
        if not dry_run:
            copy_workspace_entry(workspace, name, backup_root)
            history_root = workspace / ".history" / name
            if include_history and history_root.is_dir():
                shutil.copytree(history_root, backup_root / ".history" / name, dirs_exist_ok=True)
        document_result = upgrade_package_dir(storage, package_dir, name, dry_run=dry_run)
        history_results = []
        if include_history:
            for snapshot_dir in history_snapshot_dirs(workspace, name):
                history_results.append(
                    {
                        "id": snapshot_dir.name,
                        **upgrade_package_dir(storage, snapshot_dir, name, dry_run=dry_run),
                    }
                )
        saved_manifest = load_manifest(package_dir)
        results.append(
            {
                "name": name,
                "dry_run": dry_run,
                "counts": {
                    "stages": len(saved_manifest.get("stages", [])),
                    "processes": len(saved_manifest.get("processes", [])),
                    "entities": len(saved_manifest.get("entities", [])),
                    "businessComponents": len(saved_manifest.get("businessComponents", [])),
                    "businessConstructs": len(saved_manifest.get("businessConstructs", [])),
                    "taskDefinitions": len(saved_manifest.get("taskDefinitions", [])),
                },
                **document_result,
                "historySnapshots": history_results,
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
    parser.add_argument("--skip-history", action="store_true", help="Only upgrade current workspace documents, not .history snapshots.")
    parser.add_argument("--document", action="append", dest="documents", help="Document name to upgrade. Repeatable.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = upgrade_workspace_documents(
        Path(args.workspace).resolve(),
        dry_run=args.dry_run,
        clear_history_trash=args.clear_history_trash,
        include_history=not args.skip_history,
        documents=args.documents,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
