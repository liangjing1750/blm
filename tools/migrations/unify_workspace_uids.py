from __future__ import annotations

import argparse
import json
import shutil
import sys
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from blm_core.merge import validate_document
from blm_core.storage import WorkspaceStorage
from tools.migrations.upgrade_workspace_documents import find_legacy_model_fields


AUTO_COLLECTIONS = ("roles", "stages", "processes", "entities", "businessComponents")
REVIEW_ONLY_COLLECTIONS = ("businessConstructs", "taskDefinitions")


def normalize_text(value: object) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def item_label(item: dict) -> str:
    return str(item.get("name") or item.get("term") or "").strip()


@dataclass(frozen=True)
class IdentityItem:
    key: str
    uid: str
    label: str
    path: str
    item_type: str


def _append_index(index: dict[str, list[IdentityItem]], item: IdentityItem) -> None:
    if not item.uid or not item.key:
        return
    index.setdefault(item.key, []).append(item)


def build_identity_index(document: dict) -> dict[str, list[IdentityItem]]:
    index: dict[str, list[IdentityItem]] = {}
    for collection in AUTO_COLLECTIONS:
        for item_index, item in enumerate(document.get(collection, []) if isinstance(document.get(collection), list) else []):
            if not isinstance(item, dict):
                continue
            label = item_label(item)
            _append_index(
                index,
                IdentityItem(
                    key=f"{collection}::{normalize_text(label)}",
                    uid=str(item.get("uid", "")).strip(),
                    label=label,
                    path=f"{collection}[{item_index}]",
                    item_type=collection,
                ),
            )

    for process_index, process in enumerate(document.get("processes", []) if isinstance(document.get("processes"), list) else []):
        if not isinstance(process, dict):
            continue
        process_name = item_label(process)
        for node_index, node in enumerate(process.get("nodes", []) if isinstance(process.get("nodes"), list) else []):
            if not isinstance(node, dict):
                continue
            label = item_label(node)
            _append_index(
                index,
                IdentityItem(
                    key=f"nodes::{normalize_text(process_name)}::{normalize_text(label)}",
                    uid=str(node.get("uid", "")).strip(),
                    label=f"{process_name} / {label}",
                    path=f"processes[{process_index}].nodes[{node_index}]",
                    item_type="nodes",
                ),
            )
    return index


def build_collection_name_index(document: dict, collections: tuple[str, ...]) -> dict[str, list[IdentityItem]]:
    index: dict[str, list[IdentityItem]] = {}
    for collection in collections:
        for item_index, item in enumerate(document.get(collection, []) if isinstance(document.get(collection), list) else []):
            if not isinstance(item, dict):
                continue
            label = item_label(item)
            _append_index(
                index,
                IdentityItem(
                    key=f"{collection}::{normalize_text(label)}",
                    uid=str(item.get("uid", "")).strip(),
                    label=label,
                    path=f"{collection}[{item_index}]",
                    item_type=collection,
                ),
            )
    return index


def _unique_item(items: list[IdentityItem]) -> IdentityItem | None:
    if len(items) != 1:
        return None
    return items[0]


def build_uid_alignment_plan(
    baseline_document: dict,
    target_documents: dict[str, dict],
) -> dict:
    baseline_index = build_identity_index(baseline_document)
    replacements_by_document: dict[str, dict[str, str]] = {}
    aligned: list[dict] = []
    skipped: list[dict] = []

    for doc_name, document in target_documents.items():
        target_index = build_identity_index(document)
        review_target_index = build_collection_name_index(document, REVIEW_ONLY_COLLECTIONS)
        review_baseline_index = build_collection_name_index(baseline_document, REVIEW_ONLY_COLLECTIONS)
        replacements: dict[str, str] = {}
        for key, target_items in sorted(target_index.items()):
            baseline_items = baseline_index.get(key, [])
            if not baseline_items:
                continue
            baseline_item = _unique_item(baseline_items)
            target_item = _unique_item(target_items)
            if not baseline_item:
                skipped.append(
                    {
                        "document": doc_name,
                        "key": key,
                        "reason": "baseline-duplicate",
                        "baselineUids": [item.uid for item in baseline_items],
                    }
                )
                continue
            if not target_item:
                skipped.append(
                    {
                        "document": doc_name,
                        "key": key,
                        "reason": "target-duplicate",
                        "targetUids": [item.uid for item in target_items],
                    }
                )
                continue
            if target_item.uid == baseline_item.uid:
                continue
            if target_item.uid in replacements and replacements[target_item.uid] != baseline_item.uid:
                skipped.append(
                    {
                        "document": doc_name,
                        "key": key,
                        "reason": "replacement-conflict",
                        "fromUid": target_item.uid,
                        "existingToUid": replacements[target_item.uid],
                        "nextToUid": baseline_item.uid,
                    }
                )
                continue
            replacements[target_item.uid] = baseline_item.uid
            aligned.append(
                {
                    "document": doc_name,
                    "key": key,
                    "type": target_item.item_type,
                    "label": target_item.label,
                    "fromUid": target_item.uid,
                    "toUid": baseline_item.uid,
                    "targetPath": target_item.path,
                    "baselinePath": baseline_item.path,
                }
            )
        for key, target_items in sorted(review_target_index.items()):
            baseline_items = review_baseline_index.get(key, [])
            if not baseline_items:
                continue
            if len(baseline_items) == 1 and len(target_items) == 1 and target_items[0].uid == baseline_items[0].uid:
                continue
            if len(baseline_items) != 1:
                reason = "baseline-duplicate"
            elif len(target_items) != 1:
                reason = "target-duplicate"
            else:
                reason = "manual-review"
            skipped.append(
                {
                    "document": doc_name,
                    "key": key,
                    "reason": reason,
                    "baselineUids": [item.uid for item in baseline_items],
                    "targetUids": [item.uid for item in target_items],
                }
            )
        replacements_by_document[doc_name] = replacements

    return {
        "replacementCount": sum(len(items) for items in replacements_by_document.values()),
        "aligned": aligned,
        "skipped": skipped,
        "replacementsByDocument": replacements_by_document,
    }


def replace_uid_strings(value: Any, replacements: dict[str, str]) -> Any:
    if isinstance(value, str):
        return replacements.get(value, value)
    if isinstance(value, list):
        return [replace_uid_strings(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: replace_uid_strings(child, replacements) for key, child in value.items()}
    return value


def apply_uid_alignment(document: dict, replacements: dict[str, str]) -> dict:
    return replace_uid_strings(deepcopy(document), replacements)


def copy_workspace_entry(workspace: Path, name: str, backup_root: Path) -> None:
    source = workspace / name
    if source.is_dir():
        backup_root.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, backup_root / name, dirs_exist_ok=True)


def unify_workspace_uids(
    workspace: Path,
    *,
    baseline: str,
    documents: list[str],
    apply: bool = False,
) -> dict:
    storage = WorkspaceStorage(workspace)
    baseline_document = storage.load(baseline)
    target_documents = {name: storage.load(name) for name in documents}
    plan = build_uid_alignment_plan(baseline_document, target_documents)
    backup_root = workspace / ".uid-unify-backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
    document_results = []

    for name, document in target_documents.items():
        replacements = plan["replacementsByDocument"].get(name, {})
        next_document = apply_uid_alignment(document, replacements)
        issues_before = validate_document(document)
        issues_after = validate_document(next_document)
        legacy_after = find_legacy_model_fields(next_document)
        if apply and replacements:
            copy_workspace_entry(workspace, name, backup_root)
            saved = storage.save(name, next_document)
            issues_after = validate_document(saved)
            manifest_path = workspace / name / "manifest.json"
            manifest_document = json.loads(manifest_path.read_text("utf-8")) if manifest_path.is_file() else saved
            legacy_after = find_legacy_model_fields(manifest_document)
        document_results.append(
            {
                "name": name,
                "replacementCount": len(replacements),
                "validationIssuesBefore": len(issues_before),
                "validationIssuesAfter": len(issues_after),
                "legacyFieldCountAfter": len(legacy_after),
            }
        )

    return {
        "workspace": str(workspace),
        "baseline": baseline,
        "documents": documents,
        "apply": apply,
        "backup": str(backup_root) if apply else "",
        "summary": {
            "replacementCount": plan["replacementCount"],
            "alignedCount": len(plan["aligned"]),
            "skippedCount": len(plan["skipped"]),
        },
        "documentResults": document_results,
        "aligned": plan["aligned"],
        "skipped": plan["skipped"],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Align upgraded BLM document UIDs to a baseline document.")
    parser.add_argument("--workspace", default="workspace", help="Workspace directory. Default: workspace")
    parser.add_argument("--baseline", required=True, help="Baseline document name whose UIDs should be kept.")
    parser.add_argument("--document", action="append", dest="documents", required=True, help="Target document to align. Repeatable.")
    parser.add_argument("--apply", action="store_true", help="Write aligned documents. Default is dry-run.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = unify_workspace_uids(
        Path(args.workspace).resolve(),
        baseline=args.baseline,
        documents=args.documents,
        apply=args.apply,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
