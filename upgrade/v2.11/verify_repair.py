#!/usr/bin/env python3
"""验证 repair_workspace.py 修复结果"""
import json, os

WORKSPACE = os.path.join(os.path.dirname(__file__), "..", "..", "workspace")

def check_doc(doc):
    td = 0; dup = 0; rn = 0
    for proc in doc.get("processes", []):
        for node in proc.get("nodes", []):
            # TD-xxx残留
            for task in node.get("orchestrationTasks", []):
                tid = str(task.get("taskDefinitionUid", "")).strip()
                if tid.startswith("TD-"):
                    td += 1
            # 数组重复
            for field in ["businessRules", "userSteps", "orchestrationTasks", "forms"]:
                seen = set()
                for item in node.get(field, []):
                    uid = str(item.get("uid", "")).strip()
                    if not uid: continue
                    if uid in seen:
                        dup += 1
                    seen.add(uid)
            # rules_note过期
            rnote = str(node.get("rules_note", "") or "")
            rules_count = len(node.get("businessRules", []))
            if len(rnote) > 1000 and rules_count < 20:
                rn += 1
    return td, dup, rn

td_total = 0; dup_total = 0; rn_total = 0
for dn in sorted(os.listdir(WORKSPACE)):
    d = os.path.join(WORKSPACE, dn)
    if dn.startswith(".") or not os.path.isdir(d): continue

    for mp in ["manifest/manifest.json", "manifest.json"]:
        mp = os.path.join(d, mp)
        if not os.path.exists(mp): continue
        with open(mp, encoding="utf-8") as f:
            td, dup, rn = check_doc(json.load(f))
        td_total += td; dup_total += dup; rn_total += rn
        break

    sd = os.path.join(d, "collab", "submits")
    if os.path.isdir(sd):
        for fn in os.listdir(sd):
            if not fn.endswith(".json"): continue
            with open(os.path.join(sd, fn), encoding="utf-8") as f:
                data = json.load(f)
            doc = data.get("document", {})
            td, dup, rn = check_doc(doc)
            td_total += td; dup_total += dup; rn_total += rn

    hd = os.path.join(d, "history")
    if os.path.isdir(hd):
        for snap in os.listdir(hd):
            hm = os.path.join(hd, snap, "manifest", "manifest.json")
            if not os.path.exists(hm):
                hm = os.path.join(hd, snap, "manifest.json")
            if not os.path.exists(hm): continue
            with open(hm, encoding="utf-8") as f:
                td, dup, rn = check_doc(json.load(f))
            td_total += td; dup_total += dup; rn_total += rn

print(f"TD-xxx残留: {td_total}")
print(f"数组uid重复: {dup_total}")
print(f"rules_note过期: {rn_total}")
if td_total == 0 and dup_total == 0 and rn_total == 0:
    print("\n[PASS] 全部通过!")
else:
    print("\n✗ 仍有残留")
