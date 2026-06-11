"""L2 微压缩 — 清理旧工具结果（免费，无 API 调用）。

s08 模式: 遍历可压缩工具的历史结果，只保留最近 N 个，
旧结果替换为 sentinel 字符串。OpenAI 原生格式。
"""

import logging

logger = logging.getLogger(__name__)

COMPACTABLE_TOOLS = {"read_workspace", "read_workspace_json", "list_workspaces", "skill_manage", "grep", "glob", "ls", "read_file", "web_fetch"}
PRESERVE_TOOLS = {"save_workspace", "create_workspace", "write_file", "edit_file", "bash"}
SENTINEL = "[Old tool result content cleared]"


def micro_compact(messages: list[dict], keep_recent: int = 3, compactable: set[str] | None = None) -> list[dict]:
    compactable = compactable or COMPACTABLE_TOOLS
    messages = list(messages)

    # 收集每个工具类型的结果计数
    tool_counts: dict[str, int] = {}
    for msg in messages:
        if msg.get("role") == "tool":
            tid = msg.get("tool_call_id", "")
            name = _resolve_tool_name(tid, messages)
            tool_counts[name] = tool_counts.get(name, 0) + 1

    # 清理旧结果
    kept_counts: dict[str, int] = {}
    cleared = 0
    for msg in messages:
        if msg.get("role") != "tool":
            continue
        tid = msg.get("tool_call_id", "")
        name = _resolve_tool_name(tid, messages)
        if name not in compactable:
            continue
        kept_counts[name] = kept_counts.get(name, 0) + 1
        keep_threshold = max(tool_counts.get(name, 0) - keep_recent, 0)
        if kept_counts[name] <= keep_threshold:
            msg["content"] = SENTINEL
            cleared += 1

    if cleared:
        logger.debug("Micro-compact: cleared %d tool results", cleared)
    return messages


def _resolve_tool_name(tool_call_id: str, messages: list[dict]) -> str:
    for msg in messages:
        if msg.get("role") == "assistant":
            tcs = msg.get("tool_calls") or []
            for tc in tcs:
                if tc.get("id") == tool_call_id:
                    return tc.get("function", {}).get("name", "")
    return ""
