#!/usr/bin/env python3
"""
Id→Uid 字段名不匹配审计脚本。

扫描 app/*.js 中所有对象字面量的 Id/Ids 键（生产者）
和 .FooUid/.FooUids 属性读取（消费者），
找出生产者和消费者之间可能存在的键名不一致。
"""

import re
import os
from collections import defaultdict

APP_DIR = os.path.join(os.path.dirname(__file__), "..", "app")

# 排除的目录
EXCLUDE_DIRS = {"vendor"}

# UI 状态前缀：这些对象上的 Id 键是 UI 状态，不需要改
UI_STATE_KEYS = {
    "stageId", "entityId", "procId", "taskId", "constructId",
    "capabilityId", "taskDefinitionId", "stageNameEditId",
    "entityRelationEditorCollapsed",
}

# 文档字段映射：Id → Uid
ID_TO_UID = {
    "constructId": "constructUid",
    "constructIds": "constructUids",
    "businessConstructId": "businessConstructUid",
    "businessConstructIds": "businessConstructUids",
    "businessComponentId": "businessComponentUid",
    "businessComponentIds": "businessComponentUids",
    "taskDefinitionId": "taskDefinitionUid",
    "taskDefinitionIds": "taskDefinitionUids",
    "entityId": "entityUid",
    "entityIds": "entityUids",
    "processId": "processUid",
    "processIds": "processUids",
    "stageId": "stageUid",
    "stageIds": "stageUids",
    "fromProcessId": "fromProcessUid",
    "toProcessId": "toProcessUid",
    "fromStageId": "fromStageUid",
    "toStageId": "toStageUid",
    "fromRefId": "fromRefUid",
    "toRefId": "toRefUid",
    "relatedProcessIds": "relatedProcessUids",
    "panoramaColumnId": "panoramaColumnUid",
    "panoramaLaneId": "panoramaLaneUid",
    "columnId": "columnUid",
    "laneId": "laneUid",
}


def find_js_files():
    """收集所有 JS 文件"""
    files = []
    for root, dirs, filenames in os.walk(APP_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for fn in filenames:
            if fn.endswith(".js"):
                files.append(os.path.join(root, fn))
    return files


def extract_object_literal_keys(line):
    """从一行代码中提取对象字面量的键名。

    匹配模式: `key:` 在对象字面量中（{ key: value } 或 { key, }）
    不匹配: 函数参数, 变量赋值左侧, 属性访问
    """
    keys = set()
    # 匹配对象字面量中的 key: value 模式
    for m in re.finditer(r'(?:\{|,\s*)(\w+Id)\s*:', line):
        keys.add(m.group(1))
    for m in re.finditer(r'(?:\{|,\s*)(\w+Ids)\s*:', line):
        keys.add(m.group(1))
    return keys


def extract_property_reads(line):
    """从一行代码中提取 .FooUid / .FooUids / .FooId / .FooIds 属性读取"""
    reads = set()
    for m in re.finditer(r'\.(\w+Id)\b', line):
        reads.add(m.group(1))
    for m in re.finditer(r'\.(\w+Ids)\b', line):
        reads.add(m.group(1))
    for m in re.finditer(r'\.(\w+Uid)\b', line):
        reads.add(m.group(1))
    for m in re.finditer(r'\.(\w+Uids)\b', line):
        reads.add(m.group(1))
    return reads


def should_skip_line(line):
    """跳过注释、字符串、UI 状态等"""
    stripped = line.strip()
    if stripped.startswith("//") or stripped.startswith("*"):
        return True
    # 跳过 HTML 模板字符串中的 data-testid 等
    if "data-testid" in stripped or "data-" in stripped:
        return True
    return False


def audit():
    files = find_js_files()
    print(f"扫描 {len(files)} 个 JS 文件...\n")

    # 每个文件的生产者和消费者
    file_producers = defaultdict(list)   # (filename, key, line)
    file_consumers_id = defaultdict(list)  # (filename, key, line)
    file_consumers_uid = defaultdict(list) # (filename, key, line)

    for filepath in sorted(files):
        rel = os.path.relpath(filepath, APP_DIR)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except Exception:
            continue

        for lineno, line in enumerate(lines, start=1):
            if should_skip_line(line):
                continue

            # 提取对象字面量键（生产者）
            lit_keys = extract_object_literal_keys(line)
            for key in lit_keys:
                if key not in UI_STATE_KEYS:
                    file_producers[key].append((rel, lineno, line.strip()[:120]))

            # 提取属性读取（消费者）
            reads = extract_property_reads(line)
            for key in reads:
                if key.endswith("Id") or key.endswith("Ids"):
                    file_consumers_id[key].append((rel, lineno, line.strip()[:120]))
                elif key.endswith("Uid") or key.endswith("Uids"):
                    file_consumers_uid[key].append((rel, lineno, line.strip()[:120]))

    # === 报告1：每个文件中的 Id 键生产者（对象字面量） ===
    print("=" * 70)
    print("一、对象字面量中的 Id/Ids 键（生产者）")
    print("   这些键可能被消费者以 Uid 形式读取，需要检查")
    print("=" * 70)

    by_file = defaultdict(list)
    for key, entries in file_producers.items():
        for rel, lineno, text in entries:
            by_file[rel].append((lineno, key, text))

    for filename in sorted(by_file):
        entries = sorted(by_file[filename])
        print(f"\n  {filename}:")
        for lineno, key, text in entries:
            uid_key = ID_TO_UID.get(key, "???")
            print(f"    L{lineno:>5d}  {key:>25s}  →  {uid_key}  |  {text}")

    # === 报告2：跨文件键名不匹配 ===
    print("\n\n" + "=" * 70)
    print("二、潜在不匹配：生产者用 Id 键，同文件消费者读 Uid 键")
    print("=" * 70)

    mismatches = []
    for key, prod_entries in file_producers.items():
        uid_key = ID_TO_UID.get(key)
        if not uid_key:
            continue

        # 获取生产者和消费者的文件集合
        prod_files = {entry[0] for entry in prod_entries}

        # 检查消费者（读 Uid）
        consumer_uid_entries = file_consumers_uid.get(uid_key, [])
        consumer_uid_files = {entry[0] for entry in consumer_uid_entries}

        # 同文件内：生产者在某文件写了 Id 键，同一文件里消费者读 Uid 键
        common_files = prod_files & consumer_uid_files
        if common_files:
            for f in sorted(common_files):
                prod_lines = [e for e in prod_entries if e[0] == f]
                cons_lines = [e for e in consumer_uid_entries if e[0] == f]
                mismatches.append((f, key, uid_key, prod_lines, cons_lines))

    if mismatches:
        for filename, id_key, uid_key, prod_lines, cons_lines in mismatches:
            print(f"\n  [{filename}]")
            print(f"    生产者写: {id_key}")
            for _, lineno, text in prod_lines:
                print(f"      L{lineno:>5d}  {text}")
            print(f"    消费者读: {uid_key}")
            for _, lineno, text in cons_lines:
                print(f"      L{lineno:>5d}  {text}")
    else:
        print("  未发现同文件内不一致。")

    # === 报告3：仍使用 Id 后缀读取的消费者 ===
    print("\n\n" + "=" * 70)
    print("三、消费者仍以 Id 后缀读取的属性（可能读到 undefined）")
    print("   注意：这些可能已被 defineModelUidAliasDeep 的 getter 别名覆盖")
    print("=" * 70)

    for key in sorted(ID_TO_UID.keys()):
        entries = file_consumers_id.get(key, [])
        if not entries:
            continue
        # 过滤掉 UI 状态
        uid_key = ID_TO_UID[key]
        print(f"\n  .{key} (应改用 .{uid_key}):")
        for rel, lineno, text in entries[:5]:
            print(f"    {rel}:{lineno}  {text}")
        if len(entries) > 5:
            print(f"    ... (共 {len(entries)} 处)")

    # === 报告4：生产者的 Id 键数量统计 ===
    print("\n\n" + "=" * 70)
    print("四、生产者 Id 键统计（按键名）")
    print("=" * 70)
    for key in sorted(file_producers.keys()):
        entries = file_producers[key]
        uid_key = ID_TO_UID.get(key)
        status = "✓ 已映射" if uid_key else "? 未映射"
        print(f"  {key:>25s}  →  {uid_key or '---':>25s}  {status:>10s}  ({len(entries)} 处)")


if __name__ == "__main__":
    audit()
