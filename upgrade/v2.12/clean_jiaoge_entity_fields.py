#!/usr/bin/env python3
"""
Clean duplicated nested fields for the specific workspace document.

Default mode is dry-run. Pass --apply to write changes.
Scope:
- manifest/manifest.json
- manifest.json
- collab/submits/*.json
- history/**/manifest.json
- history/**/manifest/manifest.json
- collab/submits/archive.zip
- history/archive.zip
"""
from __future__ import annotations

import argparse
import json
import tempfile
import zipfile
from pathlib import Path
from typing import Any


TARGET_DOCUMENT = "\u4ea4\u5272\u667a\u6167\u76d1\u7ba1\u5e73\u53f0"
ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = ROOT / "workspace"
TARGET_DIR = WORKSPACE / TARGET_DOCUMENT


def load_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"SKIP invalid json: {path} ({exc})", flush=True)
        return None


def write_json(path: Path, data: Any) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def dedup_items(items: list[Any]) -> tuple[list[Any], int]:
    seen: set[str] = set()
    result: list[Any] = []
    removed = 0
    for item in items:
        if not isinstance(item, dict):
            result.append(item)
            continue
        uid = str(item.get("uid") or item.get("id") or "").strip()
        if uid:
            key = f"uid:{uid}"
        else:
            name = str(item.get("name") or "").strip()
            key = f"name:{name}" if name else ""
        if key and key in seen:
            removed += 1
            continue
        if key:
            seen.add(key)
        result.append(item)
    return result, removed


def clean_document(doc: dict[str, Any]) -> tuple[dict[str, Any], int]:
    total_removed = 0

    def walk(value: Any) -> None:
        nonlocal total_removed
        if isinstance(value, dict):
            for key, child in list(value.items()):
                if key == "fields" and isinstance(child, list):
                    cleaned, removed = dedup_items(child)
                    if removed:
                        value[key] = cleaned
                        total_removed += removed
                    walk(value[key])
                else:
                    walk(child)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    if isinstance(doc, dict):
        walk(doc)
    return doc, total_removed


def clean_json_payload(data: Any) -> tuple[Any, int]:
    if isinstance(data, dict) and isinstance(data.get("document"), dict):
        data["document"], removed = clean_document(data["document"])
        return data, removed
    if isinstance(data, dict):
        return clean_document(data)
    return data, 0


def candidate_files() -> list[Path]:
    files: list[Path] = []
    for rel in ("manifest/manifest.json", "manifest.json"):
        path = TARGET_DIR / rel
        if path.exists():
            files.append(path)

    submits_dir = TARGET_DIR / "collab" / "submits"
    if submits_dir.exists():
        files.extend(sorted(submits_dir.glob("*.json")))

    history_dir = TARGET_DIR / "history"
    if history_dir.exists():
        files.extend(sorted(history_dir.glob("*/manifest.json")))
        files.extend(sorted(history_dir.glob("*/manifest/manifest.json")))

    seen: set[Path] = set()
    unique_files: list[Path] = []
    for path in files:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique_files.append(path)
    return unique_files


def candidate_archives() -> list[Path]:
    archives: list[Path] = []
    for rel in ("collab/submits/archive.zip", "history/archive.zip"):
        path = TARGET_DIR / rel
        if path.exists():
            archives.append(path)
    return archives


def clean_archive(path: Path, apply: bool) -> tuple[int, int]:
    changed_members = 0
    removed_total = 0
    rewritten_members: dict[str, bytes] = {}

    with zipfile.ZipFile(path, "r") as source:
        for info in source.infolist():
            raw = source.read(info.filename)
            if info.is_dir() or not info.filename.endswith(".json"):
                continue
            try:
                data = json.loads(raw.decode("utf-8"))
            except Exception:
                continue
            cleaned, removed = clean_json_payload(data)
            if not removed:
                continue
            changed_members += 1
            removed_total += removed
            rewritten_members[info.filename] = (
                json.dumps(cleaned, ensure_ascii=False, indent=2) + "\n"
            ).encode("utf-8")

    if not apply or not rewritten_members:
        return changed_members, removed_total

    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_file:
        temp_path = Path(temp_file.name)

    try:
        with zipfile.ZipFile(path, "r") as source, zipfile.ZipFile(temp_path, "w") as target:
            for info in source.infolist():
                data = rewritten_members.get(info.filename)
                if data is None:
                    data = source.read(info.filename)
                target.writestr(info, data)
        temp_path.replace(path)
    finally:
        if temp_path.exists():
            temp_path.unlink()

    return changed_members, removed_total


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write cleaned files")
    args = parser.parse_args()

    if not TARGET_DIR.exists():
        print(f"Target document not found: {TARGET_DIR}")
        return 1

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"Mode: {mode}", flush=True)
    print(f"Target: {TARGET_DIR}", flush=True)

    grand_total = 0
    changed_files = 0
    files = candidate_files()
    archives = candidate_archives()
    print(f"Scanning {len(files)} json files and {len(archives)} archives.", flush=True)
    for index, path in enumerate(files, start=1):
        if index == 1 or index == len(files) or index % 50 == 0:
            print(f"[{index}/{len(files)}] check {path.relative_to(ROOT)}", flush=True)
        data = load_json(path)
        if data is None:
            continue
        cleaned, removed = clean_json_payload(data)
        if not removed:
            continue
        changed_files += 1
        grand_total += removed
        print(f"- {path.relative_to(ROOT)}: remove {removed}", flush=True)
        if args.apply:
            write_json(path, cleaned)

    for index, path in enumerate(archives, start=1):
        print(f"[archive {index}/{len(archives)}] check {path.relative_to(ROOT)}", flush=True)
        member_count, removed = clean_archive(path, args.apply)
        if not removed:
            continue
        changed_files += member_count
        grand_total += removed
        print(f"- {path.relative_to(ROOT)}: remove {removed} from {member_count} archived json files", flush=True)

    if grand_total:
        action = "Removed" if args.apply else "Would remove"
        print(f"{action} {grand_total} duplicated nested fields from {changed_files} files.", flush=True)
        if not args.apply:
            print("Run again with --apply to write changes.", flush=True)
    else:
        print("No duplicated nested fields found.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
