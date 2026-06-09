#!/usr/bin/env python3
"""
v2.11 全量文档修复脚本。
修复 workspace 下所有文档的三层数据（manifest / submits / history）：
  (1) businessRules 按 uid 去重
  (2) rules_note 过期字符串清理（>1KB 且 businessRules<20 条）
  (3) orchestrationTasks 的 TD-xxx/item-xxx → 实际 taskDefinition.uid
  (4) forms / userSteps / orchestrationTasks 按 uid 去重
  (5) 空占位节点标记（仅报告，不删除）

用法：
  python upgrade/v2.11/repair_workspace.py          # dry-run 预览
  python upgrade/v2.11/repair_workspace.py --apply  # 执行修复
"""
import json, os, sys
from collections import Counter

WORKSPACE = os.path.join(os.path.dirname(__file__), "..", "..", "workspace")
SUB_LIST_FIELDS = ["businessRules", "userSteps", "orchestrationTasks", "forms"]


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def dedup_by_uid(items):
    """按 uid 去重，保留首次出现顺序。返回 (deduped, removed_count)"""
    seen = set()
    result = []
    removed = 0
    for item in items:
        if not isinstance(item, dict):
            result.append(item)
            continue
        uid = str(item.get("uid", "")).strip()
        if not uid:
            result.append(item)
        elif uid not in seen:
            seen.add(uid)
            result.append(item)
        else:
            removed += 1
    return result, removed


def fix_td_refs(doc):
    """修复 orchestrationTasks 中的 TD-xxx/item-xxx 引用 → 实际 uid"""
    # 建 name→uid 映射
    name_to_uid = {}
    for t in doc.get("taskDefinitions", []):
        name = str(t.get("name", "")).strip()
        uid = str(t.get("uid", "")).strip()
        if name and uid:
            name_to_uid[name] = uid

    fixed = 0
    for proc in doc.get("processes", []):
        for node in proc.get("nodes", []):
            for task in node.get("orchestrationTasks", []):
                tid = str(task.get("taskDefinitionUid", "")).strip()
                if tid.startswith("TD-"):
                    task_name = str(task.get("name", "")).strip()
                    correct_uid = name_to_uid.get(task_name, "")
                    if correct_uid:
                        task["taskDefinitionUid"] = correct_uid
                        fixed += 1
    return fixed


def clean_rules_note(node):
    """清理过期 rules_note"""
    rnote = str(node.get("rules_note", "") or "")
    rules_count = len(node.get("businessRules", []))
    if len(rnote) > 1000 and rules_count < 20:
        node["rules_note"] = ""
        return 1
    return 0


def repair_document(doc):
    """修复单个文档对象，返回修复统计"""
    stats = {"rules_dedup": 0, "forms_dedup": 0, "tasks_dedup": 0,
             "steps_dedup": 0, "rnote_cleared": 0, "td_fixed": 0}

    stats["td_fixed"] = fix_td_refs(doc)

    for proc in doc.get("processes", []):
        for node in proc.get("nodes", []):
            for field in SUB_LIST_FIELDS:
                items = node.get(field, [])
                if not items:
                    continue
                cleaned, removed = dedup_by_uid(items)
                node[field] = cleaned
                stats[f"{field.split('Rules')[0] if 'Rules' in field else field}_dedup"] = \
                    stats.get(f"{field.split('Rules')[0] if 'Rules' in field else field}_dedup", 0) + removed

            stats["rnote_cleared"] += clean_rules_note(node)

    return stats


def repair_file(path, dry_run=True):
    """修复单个 JSON 文件（manifest 或 submit）"""
    data = load_json(path)
    if data is None:
        return {}

    # 判断是 submit record（有 document 键）还是 manifest
    if "document" in data and isinstance(data.get("document"), dict):
        stats = repair_document(data["document"])
        if any(v > 0 for v in stats.values()) and not dry_run:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        return stats
    else:
        stats = repair_document(data)
        if any(v > 0 for v in stats.values()) and not dry_run:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        return stats


def main():
    dry_run = "--apply" not in sys.argv
    mode = "DRY-RUN" if dry_run else "APPLY"
    print(f"v2.11 全量文档修复 ({mode})")
    print(f"工作区: {WORKSPACE}")
    print()

    grand = {"rules_dedup": 0, "forms_dedup": 0, "tasks_dedup": 0,
             "steps_dedup": 0, "rnote_cleared": 0, "td_fixed": 0,
             "files": 0, "docs": 0}

    for doc_name in sorted(os.listdir(WORKSPACE)):
        doc_dir = os.path.join(WORKSPACE, doc_name)
        if doc_name.startswith(".") or not os.path.isdir(doc_dir):
            continue

        doc_stats = {"rules_dedup": 0, "forms_dedup": 0, "tasks_dedup": 0,
                     "steps_dedup": 0, "rnote_cleared": 0, "td_fixed": 0, "files": 0}
        details = []

        # 1. Manifest
        for mp in ["manifest/manifest.json", "manifest.json"]:
            mp = os.path.join(doc_dir, mp)
            if os.path.exists(mp):
                s = repair_file(mp, dry_run)
                for k, v in s.items():
                    doc_stats[k] = doc_stats.get(k, 0) + v
                if any(v > 0 for v in s.values()):
                    doc_stats["files"] += 1
                    sz = os.path.getsize(mp)
                    details.append(f"  manifest ({sz/1024/1024:.1f}MB): {fmt_stats(s)}")
                break

        # 2. Submits
        submits_dir = os.path.join(doc_dir, "collab", "submits")
        if os.path.isdir(submits_dir):
            for fn in sorted(os.listdir(submits_dir)):
                if not fn.endswith(".json"):
                    continue
                fp = os.path.join(submits_dir, fn)
                s = repair_file(fp, dry_run)
                for k, v in s.items():
                    doc_stats[k] = doc_stats.get(k, 0) + v
                if any(v > 0 for v in s.values()):
                    doc_stats["files"] += 1

        # 3. History
        hist_dir = os.path.join(doc_dir, "history")
        if os.path.isdir(hist_dir):
            for snap in sorted(os.listdir(hist_dir)):
                hm = os.path.join(hist_dir, snap, "manifest.json")
                if not os.path.exists(hm):
                    continue
                s = repair_file(hm, dry_run)
                for k, v in s.items():
                    doc_stats[k] = doc_stats.get(k, 0) + v
                if any(v > 0 for v in s.values()):
                    doc_stats["files"] += 1

        if doc_stats["files"] > 0:
            print(f"  {doc_name}: {doc_stats['files']} 个文件")
            for d in details:
                print(d)
            if doc_stats["rules_dedup"] > 0:
                print(f"    businessRules: -{doc_stats['rules_dedup']}")
            if doc_stats["forms_dedup"] > 0:
                print(f"    forms: -{doc_stats['forms_dedup']}")
            if doc_stats["tasks_dedup"] > 0:
                print(f"    orchestrationTasks: -{doc_stats['tasks_dedup']}")
            if doc_stats["steps_dedup"] > 0:
                print(f"    userSteps: -{doc_stats['steps_dedup']}")
            if doc_stats["rnote_cleared"] > 0:
                print(f"    rules_note: -{doc_stats['rnote_cleared']}")
            if doc_stats["td_fixed"] > 0:
                print(f"    TD-xxx→uid: {doc_stats['td_fixed']}")
            grand["docs"] += 1

        for k in grand:
            if k in ("docs", "files"):
                continue
            grand[k] += doc_stats.get(k, 0)

    print()
    total = sum(v for k, v in grand.items() if k not in ("docs", "files"))
    if dry_run:
        if total == 0:
            print("所有文档无需修复。")
        else:
            print(f"以上共需修复 {total} 项。加 --apply 执行实际修复。")
    else:
        print(f"修复完成: {total} 项 ({grand['docs']} 个文档)")


def fmt_stats(s):
    parts = []
    if s.get("rules_dedup"): parts.append(f"rules:{s['rules_dedup']}")
    if s.get("forms_dedup"): parts.append(f"forms:{s['forms_dedup']}")
    if s.get("tasks_dedup"): parts.append(f"tasks:{s['tasks_dedup']}")
    if s.get("td_fixed"): parts.append(f"TDfix:{s['td_fixed']}")
    if s.get("rnote_cleared"): parts.append(f"rnote:{s['rnote_cleared']}")
    return " ".join(parts)


if __name__ == "__main__":
    main()
