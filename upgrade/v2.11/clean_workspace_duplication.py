#!/usr/bin/env python3
"""
批量清理 workspace 下所有文档中 businessRules 等列表字段的重复数据。
覆盖：manifest、submits、history。
默认 dry-run 模式，加 --apply 才实际写入。
"""
import os, json, sys
from collections import defaultdict

WORKSPACE = os.path.join(os.path.dirname(__file__), "..", "workspace")
SUB_LIST_FIELDS = ["businessRules", "userSteps", "orchestrationTasks", "forms"]


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def dedup_items(items, uid_key="uid"):
    """按 uid 去重，保留首次出现的顺序"""
    seen = set()
    result = []
    removed = 0
    for item in items:
        if not isinstance(item, dict):
            result.append(item)
            continue
        uid = str(item.get(uid_key, "")).strip()
        if not uid or uid not in seen:
            if uid:
                seen.add(uid)
            result.append(item)
        else:
            removed += 1
    return result, removed


def clean_document(doc):
    """清理一个文档对象中所有节点的重复，返回 (doc, total_removed)"""
    total = 0
    for proc in doc.get("processes", []) if isinstance(doc, dict) else []:
        for node in proc.get("nodes", []) if isinstance(proc, dict) else []:
            for field in SUB_LIST_FIELDS:
                items = node.get(field, [])
                if not items:
                    continue
                cleaned, removed = dedup_items(items)
                node[field] = cleaned
                total += removed
    return doc, total


def clean_file(path, dry_run=True):
    """清理一个 JSON 文件"""
    data = load_json(path)
    if data is None:
        return 0

    # 判断是 submit record 还是 manifest
    if "document" in data and isinstance(data.get("document"), dict):
        # Submit record
        cleaned_doc, removed = clean_document(data["document"])
        if removed > 0:
            data["document"] = cleaned_doc
            if not dry_run:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
        return removed
    else:
        # Manifest
        cleaned_doc, removed = clean_document(data)
        if removed > 0:
            if not dry_run:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(cleaned_doc, f, ensure_ascii=False, indent=2)
        return removed


def main():
    dry_run = "--apply" not in sys.argv
    mode = "DRY-RUN (预览模式)" if dry_run else "APPLY (执行清理)"
    print(f"模式: {mode}")
    print(f"范围: {WORKSPACE}")
    print()

    grand_total = 0
    for doc_name in sorted(os.listdir(WORKSPACE)):
        doc_dir = os.path.join(WORKSPACE, doc_name)
        if doc_name.startswith(".") or not os.path.isdir(doc_dir):
            continue

        doc_total = 0
        cleaned_files = []

        # Manifest
        for mp in ["manifest/manifest.json", "manifest.json"]:
            mp = os.path.join(doc_dir, mp)
            if os.path.exists(mp):
                removed = clean_file(mp, dry_run)
                if removed > 0:
                    cleaned_files.append(f"manifest: -{removed}")
                    doc_total += removed
                break

        # Submits
        submits_dir = os.path.join(doc_dir, "collab", "submits")
        if os.path.isdir(submits_dir):
            for fn in sorted(os.listdir(submits_dir)):
                if not fn.endswith(".json"):
                    continue
                removed = clean_file(os.path.join(submits_dir, fn), dry_run)
                if removed > 0:
                    cleaned_files.append(f"submit/{fn[:30]}: -{removed}")
                    doc_total += removed

        # History
        hist_dir = os.path.join(doc_dir, "history")
        if os.path.isdir(hist_dir):
            for snap in sorted(os.listdir(hist_dir)):
                hm = os.path.join(hist_dir, snap, "manifest.json")
                if not os.path.exists(hm):
                    continue
                removed = clean_file(hm, dry_run)
                if removed > 0:
                    cleaned_files.append(f"history/{snap[:20]}: -{removed}")
                    doc_total += removed

        if doc_total > 0:
            print(f"  {doc_name}: -{doc_total} 条")
            for cf in cleaned_files:
                print(f"    {cf}")
            grand_total += doc_total

    print()
    if grand_total == 0:
        print("所有文档均无重复数据。")
    elif dry_run:
        print(f"以上共 {grand_total} 条重复。加 --apply 执行实际清理。")
    else:
        print(f"已清理 {grand_total} 条重复。")


if __name__ == "__main__":
    main()
