#!/usr/bin/env python3
"""
BLM v2.9 目录结构迁移：
  1. 文档内容移入 manifest/ 子目录
  2. workspace 级 .history 和 .versions 移到文档级目录

用法：
  python migrate_dirs.py --dry-run    # 试运行
  python migrate_dirs.py              # 执行迁移
"""

import json
import re
import shutil
import sys
from pathlib import Path

WORKSPACE = Path(__file__).parent.parent.parent / "workspace"
SKIP_PREFIXES = {".", "__"}
TRASH_RE = re.compile(r"^(.+)-(\d{8}-\d{6}-\d{6})$")
MANIFEST_JSON = "manifest.json"


def trash_original_name(entry_name: str) -> str | None:
    m = TRASH_RE.match(entry_name)
    return m.group(1) if m else None


def iter_documents(workspace: Path):
    pairs: list[tuple[Path, str]] = []
    for entry in workspace.iterdir():
        if not entry.is_dir() or entry.name.startswith(tuple(SKIP_PREFIXES)):
            continue
        pairs.append((entry, entry.name))
    trash_dir = workspace / ".trash"
    if trash_dir.is_dir():
        for entry in trash_dir.iterdir():
            if not entry.is_dir():
                continue
            orig = trash_original_name(entry.name)
            if orig:
                pairs.append((entry, orig))
    return pairs


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def move_if_exists(src: Path, dst: Path, dry: bool) -> bool:
    if not src.exists():
        return False
    if dst.exists():
        return False
    if dry:
        print(f"    [DRY] would move {src.name} -> {dst}")
        return True
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    print(f"    moved {src.name} -> {dst}")
    return True


def migrate(workspace: Path, dry_run: bool = False):
    old_history = workspace / ".history"
    old_versions = workspace / ".versions"
    moved = 0
    skipped = 0

    for doc_dir, doc_name in iter_documents(workspace):
        print(f"\n{doc_name}:")

        # Phase 1: 文档内容移入 manifest/ 子目录
        manifest_dir = ensure_dir(doc_dir / "manifest")
        root_json = doc_dir / MANIFEST_JSON
        if move_if_exists(root_json, manifest_dir / MANIFEST_JSON, dry_run):
            moved += 1
        for md_file in doc_dir.glob("*.md"):
            if md_file.parent != doc_dir:
                continue
            if move_if_exists(md_file, manifest_dir / md_file.name, dry_run):
                moved += 1

        # Phase 2: history/versions 从 workspace 级移到文档级
        for old_root, sub_dir in [(old_history, "history"), (old_versions, "versions")]:
            src = old_root / doc_name
            if not src.is_dir():
                continue
            dst = doc_dir / sub_dir
            existing = set(p.name for p in dst.iterdir()) if dst.is_dir() else set()
            count = 0
            for snapshot in src.iterdir():
                if snapshot.name in existing:
                    skipped += 1
                    continue
                if dry_run:
                    count += 1
                else:
                    ensure_dir(dst)
                    shutil.move(str(snapshot), str(dst / snapshot.name))
                    count += 1
            if count:
                print(f"  {'[DRY] ' if dry_run else ''}history→{sub_dir}/: {count}")
                moved += count
            # 清理空源目录
            if not dry_run and src.is_dir() and not any(src.iterdir()):
                src.rmdir()

    # 清理顶层空目录
    for d in (old_history, old_versions):
        if not dry_run and d.is_dir() and not any(d.iterdir()):
            d.rmdir()

    print(f"\n完成: 迁移 {moved} 项, 跳过 {skipped} 项")
    if dry_run:
        print("试运行完毕，去掉 --dry-run 执行真实迁移。")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    if dry:
        print("=== DRY RUN ===\n")
    migrate(WORKSPACE, dry_run=dry)
