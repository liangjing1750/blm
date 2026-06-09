#!/usr/bin/env python3
"""
归档压缩脚本：将 history 和 collab/submits 中超过保留数量的条目移入 archive.zip。

用法：
  python tools/compact_workspace.py                # dry-run 预览
  python tools/compact_workspace.py --apply        # 执行压缩
  python tools/compact_workspace.py --keep 50      # 保留 50 条（默认 100）
  python tools/compact_workspace.py --doc CMC      # 仅处理指定文档
"""
import json, os, sys, zipfile
from pathlib import Path

WORKSPACE = os.path.join(os.path.dirname(__file__), "..", "workspace")
DEFAULT_KEEP = 100


def compact_dir(target_dir: Path, keep: int, dry_run: bool) -> tuple[int, int, int]:
    """压缩目录中超过 keep 条的文件到 archive.zip。返回 (kept, archived, before_bytes, after_bytes)"""
    if not target_dir.is_dir():
        return 0, 0, 0, 0

    # 收集所有条目
    entries = []
    for child in target_dir.iterdir():
        if child.name == "archive.zip":
            continue
        if child.is_dir():
            key = child.name
            entries.append((key, child, True))
        elif child.is_file() and child.suffix == ".json":
            key = child.stem
            entries.append((key, child, False))

    if len(entries) <= keep:
        return len(entries), 0, 0, 0

    # 按名称排序（时间戳在前）
    entries.sort(key=lambda e: e[0])

    keep_entries = entries[-keep:]
    archive_entries = entries[:-keep]

    before_size = sum(e[1].stat().st_size for e in entries)

    if dry_run:
        total_size = sum(e[1].stat().st_size for e in archive_entries)
        return len(keep_entries), len(archive_entries), before_size, total_size

    # 写入 archive.zip
    archive_path = target_dir / "archive.zip"
    # 如果已有 archive.zip，先读取已有条目
    existing_names = set()
    if archive_path.is_file():
        try:
            with zipfile.ZipFile(str(archive_path), "r") as zf:
                existing_names = set(zf.namelist())
        except zipfile.BadZipFile:
            archive_path.unlink(missing_ok=True)

    # 追加模式下重新写入（Python zipfile 不支持真正追加，需要重建）
    mode = "a" if archive_path.is_file() else "w"
    with zipfile.ZipFile(str(archive_path), mode, zipfile.ZIP_DEFLATED) as zf:
        for key, child, is_dir in archive_entries:
            if is_dir:
                # 目录格式: history/TIMESTAMP/manifest.json → 压缩为 TIMESTAMP/manifest.json
                manifest = child / "manifest" / "manifest.json"
                if not manifest.is_file():
                    manifest = child / "manifest.json"
                if manifest.is_file():
                    zip_name = f"{key}/manifest.json"
                    if zip_name in existing_names:
                        continue
                    zf.write(str(manifest), zip_name)
            else:
                zip_name = f"{key}.json"
                if zip_name in existing_names:
                    continue
                zf.write(str(child), zip_name)

    # 删除已归档的条目
    if not dry_run:
        for key, child, is_dir in archive_entries:
            if is_dir:
                import shutil
                shutil.rmtree(str(child), ignore_errors=True)
            else:
                child.unlink(missing_ok=True)

    after_size = sum(e[1].stat().st_size for e in keep_entries) + (archive_path.stat().st_size if archive_path.is_file() else 0)
    return len(keep_entries), len(archive_entries), before_size, after_size


def main():
    dry_run = "--apply" not in sys.argv
    keep = DEFAULT_KEEP
    doc_filter = None

    for arg in sys.argv[1:]:
        if arg.startswith("--keep="):
            keep = int(arg.split("=", 1)[1])
        elif arg.startswith("--doc="):
            doc_filter = arg.split("=", 1)[1]

    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"归档压缩 ({mode})  保留: {keep} 条")
    print()

    grand_kept = 0
    grand_archived = 0
    grand_before = 0
    grand_after = 0

    for doc_name in sorted(os.listdir(WORKSPACE)):
        if doc_name.startswith("."):
            continue
        if doc_filter and doc_filter not in doc_name:
            continue

        doc_dir = Path(WORKSPACE) / doc_name
        if not doc_dir.is_dir():
            continue

        doc_archived = 0
        lines = []

        # History
        hist_dir = doc_dir / "history"
        kept, archived, before, after = compact_dir(hist_dir, keep, dry_run)
        if archived > 0:
            lines.append(f"  history: 保留 {kept}, 归档 {archived}, "
                         f"{before/1024/1024:.1f}MB → {after/1024/1024:.1f}MB")
            doc_archived += archived
            grand_before += before
            grand_after += after

        # Submits
        submits_dir = doc_dir / "collab" / "submits"
        kept, archived, before, after = compact_dir(submits_dir, keep, dry_run)
        if archived > 0:
            lines.append(f"  submits: 保留 {kept}, 归档 {archived}, "
                         f"{before/1024/1024:.1f}MB → {after/1024/1024:.1f}MB")
            doc_archived += archived
            grand_before += before
            grand_after += after

        if lines:
            print(f"  {doc_name}: {doc_archived} 条归档")
            for line in lines:
                print(line)
            grand_kept += kept
            grand_archived += doc_archived

    print()
    if grand_archived == 0:
        print("无需归档（所有文档未超过保留阈值）。")
    elif dry_run:
        print(f"预览: {grand_archived} 条待归档, "
              f"{grand_before/1024/1024:.0f}MB → ~{grand_after/1024/1024:.0f}MB")
        print("加 --apply 执行实际压缩。")
    else:
        print(f"完成: {grand_archived} 条已归档, "
              f"{grand_before/1024/1024:.0f}MB → {grand_after/1024/1024:.0f}MB")


if __name__ == "__main__":
    main()
