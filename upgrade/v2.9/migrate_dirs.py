#!/usr/bin/env python3
"""
BLM 目录结构迁移：将 workspace 级的 .history 和 .versions
迁移到每个文档目录下的 history/ 和 versions/。

用法：
  python migrate_dirs.py --dry-run    # 试运行，查看将要做什么
  python migrate_dirs.py              # 执行真实迁移

安全措施：
  - 只移动（move），不复制不删除源数据外的任何内容
  - 目标已存在同名快照时跳过，不覆盖
  - 回收站条目自动解析原始文档名（去掉时间戳后缀）
  - 旧目录仅在所有快照移走后删除，非空目录不删
"""

import re
import shutil
import sys
from pathlib import Path

WORKSPACE = Path(__file__).parent / "workspace"

SKIP_PREFIXES = {".", "__"}
# 回收站条目命名格式: DOCNAME-YYYYMMDD-HHMMSS-microseconds
TRASH_RE = re.compile(r"^(.+)-(\d{8}-\d{6}-\d{6})$")


def trash_original_name(entry_name: str) -> str | None:
    m = TRASH_RE.match(entry_name)
    return m.group(1) if m else None


def iter_documents(workspace: Path):
    """扫描所有文档目录及其（回收站中）对应的原始文档名。"""
    pairs: list[tuple[Path, str]] = []
    # 普通文档
    for entry in workspace.iterdir():
        if not entry.is_dir() or entry.name.startswith(tuple(SKIP_PREFIXES)):
            continue
        pairs.append((entry, entry.name))
    # 回收站条目
    trash_dir = workspace / ".trash"
    if trash_dir.is_dir():
        for entry in trash_dir.iterdir():
            if not entry.is_dir():
                continue
            orig = trash_original_name(entry.name)
            if orig:
                pairs.append((entry, orig))
    return pairs


def migrate(workspace: Path, dry_run: bool = False):
    old_history = workspace / ".history"
    old_versions = workspace / ".versions"

    moved = 0
    skipped = 0

    for doc_dir, doc_name in iter_documents(workspace):
        for old_root, sub_dir in [(old_history, "history"), (old_versions, "versions")]:
            src = old_root / doc_name
            if not src.is_dir():
                continue
            dst = doc_dir / sub_dir

            existing = set()
            if dst.is_dir():
                existing = {p.name for p in dst.iterdir()}

            snapshot_count = 0
            for snapshot in src.iterdir():
                if snapshot.name in existing:
                    print(f"  SKIP {doc_name}/{sub_dir}/{snapshot.name} (目标已存在，不覆盖)")
                    skipped += 1
                    continue
                if dry_run:
                    snapshot_count += 1
                else:
                    dst.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(snapshot), str(dst / snapshot.name))
                    snapshot_count += 1

            if snapshot_count:
                print(f"  {'[DRY] ' if dry_run else ''}MOVE {doc_name}: {snapshot_count} -> {sub_dir}/")
                moved += snapshot_count

            # 清空源目录（仅在无剩余内容时）
            if not dry_run and src.is_dir() and not any(src.iterdir()):
                src.rmdir()

    # 清理顶层空目录
    for d in (old_history, old_versions):
        if not dry_run and d.is_dir() and not any(d.iterdir()):
            d.rmdir()
            print(f"  REMOVED empty {d.name}/")

    print(f"\n迁移 {moved} 个快照, 跳过 {skipped} 个（已存在）")
    if dry_run:
        print("试运行完毕，未实际移动。去掉 --dry-run 执行真实迁移。")
    else:
        print("请手动确认后删除 .history/ 和 .versions/ 顶层目录。")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    if dry:
        print("=== DRY RUN（试运行）===\n")
    migrate(WORKSPACE, dry_run=dry)
