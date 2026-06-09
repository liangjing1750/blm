#!/usr/bin/env python3
"""
检查：如果移除 defineModelUidAliasDeep 的 Id→Uid getter 别名，
还有哪些 .FooId 读取会变成 undefined。
"""
import re, os

APP = os.path.join(os.path.dirname(__file__), "..", "app")

ID_TO_UID = {
    "stageId": "stageUid", "processId": "processUid", "constructId": "constructUid",
    "businessConstructId": "businessConstructUid", "businessComponentId": "businessComponentUid",
    "taskDefinitionId": "taskDefinitionUid", "entityId": "entityUid",
    "fromRefId": "fromRefUid", "toRefId": "toRefUid",
    "fromStageId": "fromStageUid", "toStageId": "toStageUid",
    "fromProcessId": "fromProcessUid", "toProcessId": "toProcessUid",
    "columnId": "columnUid", "laneId": "laneUid",
    "panoramaColumnId": "panoramaColumnUid", "panoramaLaneId": "panoramaLaneUid",
}

# 安全跳过模式
SAFE_PATTERNS = [
    r'S\.ui\.',           # UI 状态
    r'\.draft\.',         # 草稿状态
    r'\.dialog\.',        # 对话框状态
    r'data-',             # HTML 属性
    r'\.dataset\.',       # DOM dataset
    r'normalized\.',      # 规范化输入（有回退）
    r'testId',            # 测试属性
    r'esc\(',             # HTML 转义
    r'jsString\(',        # JS 字符串转义
    r'//',                # 注释
    r'\* ',               # JSDoc
    r'function\s+\w+\([^)]*' + 'stageId' + r'[^)]*\)',  # 函数参数
    r'const\s+' + 'stageId',  # 局部变量声明
    r'let\s+' + 'stageId',
    r'\w+Id\s*:',          # 对象字面量键定义
    r'data-testid',        # 测试属性
]

def is_safe(stripped):
    for pat in SAFE_PATTERNS:
        if re.search(pat, stripped):
            return True
    return False

def main():
    results = []
    for root, dirs, files in os.walk(APP):
        dirs[:] = [d for d in dirs if d != "vendor"]
        for fn in sorted(files):
            if not fn.endswith(".js"):
                continue
            path = os.path.join(root, fn)
            rel = os.path.relpath(path, APP)
            lines = open(path, encoding="utf-8").readlines()
            for i, line in enumerate(lines, 1):
                stripped = line.strip()
                if is_safe(stripped):
                    continue
                for id_key, uid_key in ID_TO_UID.items():
                    # 找 .idKey 但不含 .uidKey 的行
                    read_pat = re.compile(r'\.' + id_key + r'\b')
                    uid_pat = re.compile(r'\.' + uid_key + r'\b')
                    if read_pat.search(stripped) and not uid_pat.search(stripped):
                        results.append((rel, i, id_key, stripped[:120]))

    if results:
        print(f"=== 移除别名后会失效的 .*Id 读取 ({len(results)} 处) ===\n")
        for rel, lineno, id_key, text in results:
            print(f"  {rel}:{lineno}  .{id_key}  {text}")
    else:
        print("未发现会失效的 .*Id 读取")

    # 统计
    total = 0
    for root, dirs, files in os.walk(APP):
        dirs[:] = [d for d in dirs if d != "vendor"]
        for fn in files:
            if not fn.endswith(".js"):
                continue
            path = os.path.join(root, fn)
            text = open(path, encoding="utf-8").read()
            for id_key in ID_TO_UID:
                count = len(re.findall(r'\.' + id_key + r'\b', text))
                total += count
    print(f"\n总计 .*Id 读取（含安全类）: {total} 处")

if __name__ == "__main__":
    main()
