"""L3 预算压缩 — 大工具结果持久化到磁盘，仅保留摘要（免费，无 API 调用）。

s08 模式: 有些工具结果非常大（如 read_workspace 返回 50KB 的 markdown），
但这些内容不需要完整保留在对话上下文中 — 可以保存到磁盘，
在消息中仅保留一行引用和摘要。

算法:
  1. 遍历消息，找到超过阈值大小的 tool_result 块
  2. 将完整内容写入 .blm_ai_temp/budget/ 目录
  3. 在原消息中替换为摘要引用（"Full output persisted to: ..."）
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

TOOL_RESULT_BUDGET_BYTES = 2000  # 工具结果超过此大小考虑持久化
FULL_RESULT_EXT = ".tool_result.txt"


def budget_compact(
    messages: list[dict],
    storage_dir: str | Path,
    max_bytes_per_result: int = TOOL_RESULT_BUDGET_BYTES,
) -> list[dict]:
    """将大型工具结果持久化到磁盘 — L3 免费压缩。

    参数:
        messages: 完整消息列表
        storage_dir: 持久化目录（.blm_ai_temp/budget/）
        max_bytes_per_result: 工具结果超过此字节数时才持久化
    返回:
        处理后的消息列表（大型结果替换为引用）
    """
    storage = Path(storage_dir) / "budget"
    storage.mkdir(parents=True, exist_ok=True)

    total_saved = 0
    for msg in messages:
        if msg.get("role") != "user":
            continue

        content = msg.get("content")
        if not isinstance(content, list):
            continue

        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") != "tool_result":
                continue

            result_text = block.get("content", "")
            if not isinstance(result_text, str) or len(result_text.encode("utf-8")) < max_bytes_per_result:
                continue

            # 持久化完整结果
            tool_id = block.get("tool_use_id", "unknown")
            filename = f"{tool_id}{FULL_RESULT_EXT}"
            filepath = storage / filename
            try:
                filepath.write_text(result_text, "utf-8")
            except Exception:
                continue

            # 替换为摘要引用（保留头部和尾部）
            head = result_text[:500]
            tail = result_text[-200:] if len(result_text) > 700 else ""
            saved = len(result_text.encode("utf-8"))
            total_saved += saved

            block["content"] = (
                f"{head}\n\n"
                f"[Full output ({saved:,} bytes) persisted to: {filepath}]\n"
                f"{tail if tail else ''}"
            ).strip()

    if total_saved > 0:
        logger.debug("Budget compact: persisted %d bytes of tool results", total_saved)

    return messages
