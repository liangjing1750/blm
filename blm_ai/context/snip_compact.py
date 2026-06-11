"""L1 修剪压缩 — 删除中间的过渡性消息（免费，无 API 调用）。

s08 模式: 对话中有些消息只是过渡性的（"Let me check..."、
"Looking at the file..."），这些消息在上下文窗口紧张时可以安全删除。
L1 是压缩层级中最便宜的 — 不需要 API 调用，不会丢失重要信息。

算法:
  1. 从尾部向前遍历，保留最近的 N 条消息
  2. 从头部向后遍历，保留最早的 M 条消息
  3. 删除中间区域中只有一句话的过渡性消息
  4. 保留所有工具调用和工具结果（它们是上下文的关键部分）
"""

import logging

logger = logging.getLogger(__name__)


def snip_compact(
    messages: list[dict],
    keep_head: int = 3,
    keep_tail: int = 10,
    min_content_length: int = 30,
) -> list[dict]:
    """修剪中间区域的短消息 — L1 最便宜的压缩。

    参数:
        messages: 完整消息列表
        keep_head: 保留开头 N 条消息（通常包含用户目标和初始上下文）
        keep_tail: 保留末尾 N 条消息（最近的对话状态）
        min_content_length: 少于这个字符数的文本消息被认为是"过渡性"的
    返回:
        修剪后的消息列表
    """
    if len(messages) <= keep_head + keep_tail:
        return messages  # 消息太少，不需要修剪

    # 保护区域
    head = messages[:keep_head]
    tail = messages[-keep_tail:]
    middle = messages[keep_head:-keep_tail] if len(messages) > keep_head + keep_tail else []

    # 修剪中间区域的短消息
    kept_middle = []
    trimmed = 0
    for msg in middle:
        content = msg.get("content", "")
        role = msg.get("role", "")

        # 始终保留工具相关消息（tool_use 在 assistant 中，tool_result 在 user 中）
        if isinstance(content, list):
            # tool_use 或 tool_result 块 — 始终保留
            kept_middle.append(msg)
            continue

        # 文本消息：如果太短且不包含关键信息，跳过
        if isinstance(content, str) and role == "assistant":
            if len(content.strip()) < min_content_length:
                trimmed += 1
                continue

        # 用户消息通常都重要，保留
        kept_middle.append(msg)

    if trimmed > 0:
        logger.debug("Snip compact: trimmed %d short messages (kept %d head + %d middle + %d tail)",
                     trimmed, len(head), len(kept_middle), len(tail))

    return head + kept_middle + tail
