"""Token estimation and budget tracking.

Uses char-to-token heuristic calibrated from actual API responses.
cc-style budget tracker for turn continuation decisions.
"""

from dataclasses import dataclass, field


# Conservative estimate: ~3.5 chars per token for CJK text
CHARS_PER_TOKEN_CJK = 1.8
CHARS_PER_TOKEN_LATIN = 3.5


@dataclass
class BudgetTracker:
    """Tracks tokens across continuation calls within one turn."""
    continuation_count: int = 0
    last_delta_tokens: int = 0
    last_global_turn_tokens: int = 0
    started_at: float = 0.0
    total_budget: int = 0

    def check(self, turn_tokens: int) -> str:
        """Return 'continue', 'stop', or 'done'.

        Diminishing returns: if 3+ continuations and last 2 deltas < 500,
        the model is running out of output.
        """
        if self.total_budget <= 0:
            return "done"

        pct = turn_tokens / self.total_budget
        delta = turn_tokens - self.last_global_turn_tokens
        self.last_global_turn_tokens = turn_tokens
        self.last_delta_tokens = delta
        self.continuation_count += 1

        # Diminishing returns
        if self.continuation_count >= 3 and self.last_delta_tokens < 500:
            # Check last two deltas
            return "stop"

        if turn_tokens < self.total_budget * 0.85:
            return "continue"

        return "stop"


def estimate_tokens(text: str) -> int:
    """Estimate token count from string length using char ratio heuristics."""
    if not text:
        return 0
    cjk = sum(1 for c in text if '一' <= c <= '鿿' or '　' <= c <= '〿')
    latin = len(text) - cjk
    return int(cjk / CHARS_PER_TOKEN_CJK + latin / CHARS_PER_TOKEN_LATIN)


def estimate_message_tokens(message: dict) -> int:
    """Estimate tokens for a single message dict."""
    content = message.get("content", "")
    if isinstance(content, str):
        return estimate_tokens(content)
    if isinstance(content, list):
        total = 0
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    total += estimate_tokens(str(block.get("text", "")))
                elif block.get("type") == "tool_use":
                    total += estimate_tokens(str(block.get("input", {})))
                elif block.get("type") == "tool_result":
                    total += estimate_tokens(str(block.get("content", "")))
        return total
    return 0


def estimate_total_tokens(messages: list[dict]) -> int:
    """Estimate total tokens for a message list (1.1x padding for overhead)."""
    total = sum(estimate_message_tokens(m) for m in messages)
    return int(total * 1.1)


def calibrate_from_usage(actual_tokens: int, text_length: int) -> float:
    """Return calibrated chars-per-token from actual API usage."""
    if actual_tokens <= 0 or text_length <= 0:
        return CHARS_PER_TOKEN_LATIN
    return text_length / actual_tokens
