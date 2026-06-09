#!/usr/bin/env python3
"""
全量审计 workspace 下所有文档的所有数据层（manifest / submits / history）。
扫描 businessRules、userSteps、orchestrationTasks、forms 等所有列表型字段的重复情况。
"""
import os, json, sys
from collections import defaultdict, Counter

WORKSPACE = os.path.join(os.path.dirname(__file__), "..", "workspace")

# 需要审计的嵌套路径: (top_list, nested_key, sub_list_key)
# sub_list_key 是节点下可能重复的列表字段
SUB_LIST_FIELDS = ["businessRules", "userSteps", "orchestrationTasks", "forms"]


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def audit_items(items, label, uid_key="uid"):
    """审计一个数组的重复情况，返回 (total, unique, dup_count, dup_samples)

    只统计有效 uid 的重复，忽略空 uid（可能是未注册的新项）。
    """
    if not items:
        return 0, 0, 0, []
    total = len(items)
    seen = {}
    dup_uids = []
    has_uid = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        uid = str(item.get(uid_key, "")).strip()
        if not uid:
            continue
        has_uid += 1
        if uid in seen:
            dup_uids.append((uid, item))
        else:
            seen[uid] = item
    unique = len(seen)
    dup = has_uid - unique  # 只统计有 uid 的项目中的重复
    # 最重复的 3 个 uid
    uid_counts = Counter(str(item.get(uid_key, "")).strip() for item in items if isinstance(item, dict) and str(item.get(uid_key, "")).strip())
    top_dups = [(uid, cnt) for uid, cnt in uid_counts.most_common(5) if cnt > 1]
    return total, unique, dup, top_dups


def audit_document(doc, label=""):
    """审计单个 JSON 文档"""
    results = []
    for pi, proc in enumerate(doc.get("processes", []) if isinstance(doc, dict) else []):
        proc_name = proc.get("name", f"P{pi+1}")[:20]
        for ni, node in enumerate(proc.get("nodes", []) if isinstance(proc, dict) else []):
            node_name = node.get("name", f"N{ni+1}")[:20]
            for field in SUB_LIST_FIELDS:
                items = node.get(field, [])
                if not items:
                    continue
                total, unique, dup, top = audit_items(items, field)
                if dup > 0:
                    results.append({
                        "proc": f"{proc_name}(P{pi+1})",
                        "node": f"{node_name}(N{ni+1})",
                        "field": field,
                        "total": total,
                        "unique": unique,
                        "dup": dup,
                        "top_dups": top,
                    })
    return results


def audit_all():
    report = []
    for doc_name in sorted(os.listdir(WORKSPACE)):
        doc_dir = os.path.join(WORKSPACE, doc_name)
        if doc_name.startswith(".") or not os.path.isdir(doc_dir):
            continue

        doc_report = {"name": doc_name, "manifest": None, "submits": [], "history": []}

        # 1. Manifest
        for mp in ["manifest/manifest.json", "manifest.json"]:
            mp = os.path.join(doc_dir, mp)
            if os.path.exists(mp):
                doc = load_json(mp)
                if doc:
                    results = audit_document(doc, "manifest")
                    size_mb = os.path.getsize(mp) / (1024 * 1024)
                    doc_report["manifest"] = {
                        "size_mb": round(size_mb, 2),
                        "issues": results,
                    }
                break

        # 2. Submits
        submits_dir = os.path.join(doc_dir, "collab", "submits")
        if os.path.isdir(submits_dir):
            for fn in sorted(os.listdir(submits_dir)):
                if not fn.endswith(".json"):
                    continue
                fp = os.path.join(submits_dir, fn)
                submit = load_json(fp)
                if not submit:
                    continue
                doc = submit.get("document", {})
                if not doc:
                    continue
                results = audit_document(doc, "submit")
                if results:
                    doc_report["submits"].append({"file": fn, "issues": results})

        # 3. History
        hist_dir = os.path.join(doc_dir, "history")
        if os.path.isdir(hist_dir):
            for snap in sorted(os.listdir(hist_dir)):
                hm = os.path.join(hist_dir, snap, "manifest.json")
                if not os.path.exists(hm):
                    continue
                doc = load_json(hm)
                if not doc:
                    continue
                results = audit_document(doc, "history")
                if results:
                    doc_report["history"].append({"snapshot": snap, "issues": results})

        report.append(doc_report)

    # 输出报告
    total_dup = 0
    for dr in report:
        m = dr["manifest"]
        has_issues = (m and m["issues"]) or dr["submits"] or dr["history"]

        if not has_issues:
            continue

        print(f"\n{'='*60}")
        print(f"  文档: {dr['name']}")
        print(f"{'='*60}")

        if m:
            size = m["size_mb"]
            dup_count = sum(issue["dup"] for issue in m["issues"])
            if m["issues"]:
                print(f"  [manifest] {size}MB - {dup_count} 条重复:")
                for issue in m["issues"]:
                    print(f"    {issue['proc']} / {issue['node']} / {issue['field']}")
                    print(f"      总数: {issue['total']}  唯一: {issue['unique']}  重复: {issue['dup']}")
                    for uid, cnt in issue["top_dups"]:
                        print(f"        uid={uid[:40]}  {cnt}x")
                total_dup += dup_count

        for s in dr["submits"]:
            dup_count = sum(issue["dup"] for issue in s["issues"])
            print(f"  [submit] {s['file']}: {dup_count} 条重复")
            total_dup += dup_count

        for h in dr["history"]:
            dup_count = sum(issue["dup"] for issue in h["issues"])
            print(f"  [history] {h['snapshot']}: {dup_count} 条重复")
            total_dup += dup_count

    print(f"\n{'='*60}")
    print(f"  总计: {total_dup} 条重复 (workspace 全量)")
    print(f"{'='*60}")


if __name__ == "__main__":
    audit_all()
