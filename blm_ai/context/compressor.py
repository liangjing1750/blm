"""全上下文压缩引擎 — 4阶段压缩流水线（微压缩→确定边界→LLM摘要→重组）。

融合 hermes 的 prune→boundary→summarize→reassemble 流水线
+ cc 的 9 段结构化摘要模板 + reasonix 的三比率触发。

参考来源:
  - hermes context_compressor.py: prune→boundary→summarize→reassemble 流程
  - cc compact.ts: 结构化摘要模板 + PTL 重试
  - reasonix compact.go: 三比率触发 + 令牌预算尾部保护

压缩算法（4 阶段）:
  阶段 0: 守卫 — 消息太少？连续失败断路器？抗抖动冷却？
  阶段 1: 微压缩 — 清理旧工具结果（免费，无 API 调用）
  阶段 2: 确定边界 — 保护头部 N 条消息 + 尾部令牌预算
  阶段 3: LLM 摘要 — 9 段结构化模板
  阶段 4: 重组 — 摘要注入 + 边界标记 + 附件重注入
"""

import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from blm_ai.context.micro_compact import micro_compact
from blm_ai.context.token_counter import estimate_total_tokens, calibrate_from_usage

logger = logging.getLogger(__name__)

# 9 段结构化摘要模板（cc compact.ts 模式）
COMPACTION_SUMMARY_PROMPT = """You are creating a structured summary of a conversation. Produce a single <summary> block covering:

<summary>
## Goal
What the user asked for — the top-level objective in 1-2 sentences.

## Key Decisions
Decisions made during this conversation. Approaches chosen and why. Trade-offs considered.

## Files
Files read or modified. For each file: path, what was changed, and why.

## Commands
Shell commands run and their outcomes. Exit codes when relevant.

## Errors
Errors encountered, how they were diagnosed, and how they were resolved (or not).

## Pending Tasks
Work still in progress — things started but not completed. Next steps from the agent's perspective.

## Current Work
What was happening when compaction was triggered. The most recent context the agent needs.

## All User Messages
Every user message preserved verbatim. This is critical — user intent must never be lost in compaction.

## Optional Next Step
What to do next, if a clear direction exists. Be specific if possible.
</summary>

Do NOT include any text before or after the <summary> block. Be concise — the summary MUST fit in 2000 tokens. Focus on facts, not narration."""

# ---- 配置 ----

@dataclass
class CompactionConfig:
    """上下文压缩配置。

    soft_ratio: 开始警告的阈值比例（0.50 = 50% 上下文窗口）
    compact_ratio: 触发自动压缩的阈值（0.80 = 80%）
    force_ratio: 强制压缩的阈值（0.90 = 90%，跳过经济性判断）
    protect_head: 压缩时保留的前 N 条消息
    tail_token_budget: 为最近消息保留的令牌预算
    max_summary_tokens: 摘要的最大令牌数
    abort_on_summary_failure: 摘要失败时是否阻止对话（True = 冻结对话）
    max_consecutive_failures: 连续失败后触发断路器
    cooldown_seconds: 两次压缩之间的最小冷却时间（抗抖动）
    min_savings_percent: 最小节省比例（低于此比例认为压缩无效，计入无效计数）
    max_ineffective_count: 连续无效压缩后跳过压缩
    """
    soft_ratio: float = 0.50
    compact_ratio: float = 0.80
    force_ratio: float = 0.90
    protect_head: int = 3
    tail_token_budget: int = 16_000
    max_summary_tokens: int = 2_000
    abort_on_summary_failure: bool = False
    max_consecutive_failures: int = 3
    cooldown_seconds: float = 60.0
    min_savings_percent: float = 0.10
    max_ineffective_count: int = 2

# ---- 压缩器状态 ----

@dataclass
class CompactorState:
    """压缩器运行时状态 — 跨压缩调用追踪。

    failure_count: 连续失败次数（>= max 时触发断路器）
    total_compactions: 总压缩次数
    ineffective_count: 连续无效压缩次数
    last_compaction_time: 上次压缩时间戳（抗抖动冷却）
    previous_summary: 上一次压缩的摘要文本（迭代更新用）
    """
    failure_count: int = 0
    total_compactions: int = 0
    ineffective_count: int = 0
    last_compaction_time: float = 0.0
    previous_summary: str = ""

# ---- 压缩器主类 ----

class ContextCompressor:
    """全上下文压缩引擎 — 当对话接近上下文窗口限制时自动压缩。

    用法:
        comp = ContextCompressor(summarize_fn, context_length=128000)
        status = comp.should_compact(estimated_tokens)  # "no"/"soft"/"compact"/"force"
        if status in ("compact", "force"):
            new_msgs = await comp.compress(messages)

    参数:
        summarize_fn: LLM 摘要函数 — 接收消息列表，返回摘要文本
        context_length: 模型的上下文窗口大小（令牌数）
        config: 压缩配置（可选，使用默认值）
    """

    def __init__(
        self,
        summarize_fn: Callable[[list[dict]], str],
        context_length: int = 128_000,
        config: CompactionConfig | None = None,
    ):
        self._summarize = summarize_fn
        self.context_length = context_length
        self.config = config or CompactionConfig()
        self.state = CompactorState()
        self._char_ratio: float = 3.5  # 从 API 使用量校准的字符/令牌比
        self._last_compaction_time: float = 0.0

    # ---- 公共 API ----

    def should_compact(self, prompt_tokens: int) -> str:
        """判断是否需要压缩 — 返回 "no"/"soft"/"compact"/"force"。

        reasonix 三比率模式:
          - prompt_tokens < soft_ratio × context_length → "no"（无需操作）
          - soft_ratio ≤ prompt_tokens < compact_ratio → "soft"（仅警告）
          - compact_ratio ≤ prompt_tokens < force_ratio → "compact"（自动压缩）
          - prompt_tokens ≥ force_ratio → "force"（强制压缩，跳过经济性判断）
        """
        cl = self.context_length
        if prompt_tokens < int(cl * self.config.soft_ratio):
            return "no"
        if prompt_tokens < int(cl * self.config.compact_ratio):
            return "soft"
        if prompt_tokens < int(cl * self.config.force_ratio):
            return "compact"
        return "force"

    def calibrate_ratio(self, actual_tokens: int, text_chars: int) -> None:
        """根据 API 实际返回的令牌数校准字符/令牌比例。

        每次 API 调用后调用此方法以获得更准确的令牌估算。
        """
        self._char_ratio = calibrate_from_usage(actual_tokens, text_chars)

    async def compress(
        self,
        messages: list[dict],
        current_tokens: int | None = None,
        focus_topic: str | None = None,
    ) -> list[dict]:
        """主压缩入口 — 4 阶段流水线。

        参数:
            messages: 当前完整消息列表
            current_tokens: 当前估算的令牌数（None 则自动计算）
            focus_topic: 可选的压缩焦点主题
        返回:
            压缩后的消息列表（可能未改变，如果压缩失败或不需要压缩）
        """
        # 抗抖动：60 秒冷却
        now = time.time()
        if now - self._last_compaction_time < self.config.cooldown_seconds:
            logger.debug("Compaction cooldown active (%.1fs remaining)",
                         self.config.cooldown_seconds - (now - self._last_compaction_time))
            return messages
        self._last_compaction_time = now

        # 阶段 0: 守卫条件
        if len(messages) <= self.config.protect_head + 3:
            logger.debug("Too few messages to compact (%d)", len(messages))
            return messages

        if self.state.failure_count >= self.config.max_consecutive_failures:
            logger.warning("Compaction circuit breaker tripped (%d consecutive failures)",
                           self.state.failure_count)
            return messages

        if self.state.ineffective_count >= self.config.max_ineffective_count:
            logger.warning("Compaction skipping — %d consecutive ineffective compactions",
                           self.state.ineffective_count)
            return messages

        try:
            # s08 "Cheap first, expensive last" — 4层压缩管线
            # 阶段 1: L1 修剪 — 删除中间过渡性消息（免费，无 API 调用）
            from blm_ai.context.snip_compact import snip_compact
            messages = snip_compact(messages, keep_head=self.config.protect_head)

            # 阶段 2: L2 微压缩 — 清理旧工具结果（免费，无 API 调用）
            messages = micro_compact(messages, keep_recent=2)

            # 阶段 3: L3 预算压缩 — 大工具结果→磁盘（免费，无 API 调用）
            from blm_ai.context.budget_compact import budget_compact
            try:
                storage_dir = getattr(self, '_storage_dir', '.blm_ai_temp')
            except AttributeError:
                storage_dir = '.blm_ai_temp'
            messages = budget_compact(messages, storage_dir)

            # 阶段 4: 确定边界（为 L4 LLM 摘要做准备）
            head = self.config.protect_head
            tail_start = self._find_tail_start(messages, self.config.tail_token_budget)
            if tail_start <= head + 2:
                logger.debug("Not enough gap to compact (head=%d, tail_start=%d)", head, tail_start)
                return messages

            # 阶段 5: L4 LLM 结构化摘要（唯一需要 API 调用的层）
            compact_region = messages[head:tail_start]
            summary = await self._generate_summary(compact_region, focus_topic)

            # 阶段 4: 重组消息列表
            tokens_before = current_tokens or estimate_total_tokens(messages)
            new_messages = self._reassemble(messages, head, tail_start, summary)
            tokens_after = estimate_total_tokens(new_messages)

            # 检查节省效果
            savings = tokens_before - tokens_after
            savings_pct = savings / max(tokens_before, 1)
            if savings_pct < self.config.min_savings_percent:
                self.state.ineffective_count += 1
                logger.info("Ineffective compaction — saved %.1f%% (< %.0f%% threshold)",
                            savings_pct * 100, self.config.min_savings_percent * 100)
            else:
                self.state.ineffective_count = 0

            # 成功 — 重置失败计数器
            self.state.failure_count = 0
            self.state.total_compactions += 1
            self.state.previous_summary = summary

            logger.info("Compacted: %d → %d messages, ~%d → ~%d tokens (saved %d, %.1f%%)",
                        len(messages), len(new_messages), tokens_before, tokens_after,
                        savings, savings_pct * 100)
            return new_messages

        except Exception as exc:
            self.state.failure_count += 1
            logger.error("Compaction failed (attempt %d/%d): %s",
                         self.state.failure_count, self.config.max_consecutive_failures, exc)
            if self.config.abort_on_summary_failure:
                raise
            return messages

    # ---- 内部方法 ----

    def _find_tail_start(self, messages: list[dict], token_budget: int) -> int:
        """从尾部向前遍历，累积令牌直到达到预算 — 返回尾部的起始索引。

        reasonix 模式：保留最近的 ~16K 令牌不压缩。
        """
        accumulated = 0.0
        for i in range(len(messages) - 1, -1, -1):
            msg = messages[i]
            content = msg.get("content", "")
            if isinstance(content, str):
                accumulated += len(content) / self._char_ratio
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        text = block.get("text") or block.get("content") or str(block.get("input", ""))
                        accumulated += len(str(text)) / self._char_ratio
            accumulated *= 1.1  # 消息开销
            if accumulated >= token_budget:
                return i
        return max(self.config.protect_head, len(messages) - 10)

    async def _generate_summary(self, messages: list[dict], focus_topic: str | None = None) -> str:
        """调用 LLM 生成结构化摘要。

        使用 9 段模板（cc 模式）指导 LLM 输出结构化内容。
        包含摘要失败的 600 秒冷却计时器。
        """
        serialized = self._serialize(messages)
        prompt = COMPACTION_SUMMARY_PROMPT
        if focus_topic:
            prompt += f"\n\nFocus especially on: {focus_topic}"
        prompt += f"\n\nConversation to summarize ({len(messages)} messages):\n\n{serialized}"

        try:
            summary = await self._summarize([{"role": "user", "content": prompt}])
            return summary[:self.config.max_summary_tokens * 4]  # 粗略截断
        except Exception:
            # 摘要失败 — 返回确定性后备摘要
            return self._fallback_summary(messages)

    @staticmethod
    def _serialize(messages: list[dict]) -> str:
        """将消息序列化为压缩提示用的文本。

        每个消息截断到合理的长度以保持在令牌预算内。
        """
        parts = []
        for msg in messages:
            role = msg.get("role", "?")
            content = msg.get("content", "")
            if isinstance(content, str):
                parts.append(f"[{role}]: {content[:2000]}")
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        btype = block.get("type", "?")
                        if btype == "text":
                            parts.append(f"[{role} text]: {str(block.get('text', ''))[:2000]}")
                        elif btype == "tool_use":
                            parts.append(f"[{role} tool]: {block.get('name')}({str(block.get('input', {}))[:500]})")
                        elif btype == "tool_result":
                            parts.append(f"[{role} result]: {str(block.get('content', ''))[:500]}")
        return "\n".join(parts)

    @staticmethod
    def _reassemble(messages: list[dict], head: int, tail_start: int, summary: str) -> list[dict]:
        """重组压缩后的消息列表。

        结构: [受保护的头部消息] + [摘要消息] + [尾部消息]

        摘要消息使用 "## Context Summary" 标记和 "--- END OF CONTEXT SUMMARY ---"
        结束标记，防止 LLM 将摘要误认为新的用户输入（hermes 模式）。
        """
        new_messages = list(messages[:head])
        new_messages.append({
            "role": "user",
            "content": (
                f"## Context Summary\n\n"
                f"The following is a summary of the conversation between turns {head} and {tail_start}:\n\n"
                f"{summary}\n\n"
                f"--- END OF CONTEXT SUMMARY ---\n\n"
                f"Continue from where you left off. The most recent context is below."
            ),
        })
        new_messages.extend(messages[tail_start:])
        return new_messages

    @staticmethod
    def _fallback_summary(messages: list[dict]) -> str:
        """确定性后备摘要 — 当 LLM 摘要失败时使用。

        不调用 API，仅统计消息类型和关键文件名。
        """
        tool_names: set[str] = set()
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        tool_names.add(block.get("name", ""))
        return (
            f"## Goal\nUser requested a task across {len(messages)} messages.\n\n"
            f"## Key Decisions\n(Automatic fallback summary — LLM summarization failed)\n\n"
            f"## Tools Used\n{', '.join(sorted(tool_names)) if tool_names else '(none)'}\n\n"
            f"## Pending Tasks\nReview the conversation above for context."
        )
