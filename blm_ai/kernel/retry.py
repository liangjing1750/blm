"""错误恢复链 — s11 三级恢复模式 + fallback model。

s11 模式: max_tokens 升级 → reactive compact → fallback model。
"Errors aren't the end, they're the start of a retry."

错误分类:
  - TRANSIENT: 网络超时/连接重置 → 指数退避重试
  - CONTEXT_OVERFLOW: prompt too long → reactive compact 后重试
  - MAX_TOKENS: 输出被截断 → 8K→64K 升级 + continuation prompt
  - OVERLOADED: 服务端过载 (429/529) → 退避 + fallback model
  - FATAL: 认证/权限错误 → 不重试
"""

import asyncio
import logging
import random
from dataclasses import dataclass
from enum import Enum
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)


class ErrorCategory(Enum):
    TRANSIENT = "transient"
    PROVIDER = "provider"
    CONTEXT_OVERFLOW = "context_overflow"
    MAX_TOKENS = "max_tokens"
    OVERLOADED = "overloaded"
    FATAL = "fatal"


@dataclass
class RetryConfig:
    max_retries: int = 3
    base_delay: float = 0.5
    max_delay: float = 32.0
    backoff_multiplier: float = 2.0
    jitter: bool = True  # s11: 500*2^attempt+随机抖动


@dataclass
class FallbackConfig:
    """s11 fallback model 配置。"""
    enabled: bool = True
    fallback_model: str = ""  # 降级模型名称（空 = 与原模型相同但无 tools）
    consecutive_overloaded_threshold: int = 3  # 连续 529 后触发
    remove_tools_on_fallback: bool = True  # fallback 时移除工具


# ---- 错误分类 ----

def classify_error(exc: Exception) -> ErrorCategory:
    msg = str(exc).lower()

    if any(kw in msg for kw in ("authentication", "unauthorized", "invalid api key", "401", "403")):
        return ErrorCategory.FATAL

    if any(kw in msg for kw in ("prompt too long", "context length", "token limit", "413", "reduce the length", "4001")):
        return ErrorCategory.CONTEXT_OVERFLOW

    if any(kw in msg for kw in ("max_tokens", "maximum context length", "stop_reason", "max_output_tokens", "truncated")):
        return ErrorCategory.MAX_TOKENS

    if any(kw in msg for kw in ("overloaded", "rate limit", "429", "529", "503", "500", "internal server error", "service unavailable")):
        return ErrorCategory.OVERLOADED

    if any(kw in msg for kw in ("timeout", "connection", "network", "reset", "refused", "unreachable")):
        return ErrorCategory.TRANSIENT

    return ErrorCategory.FATAL


# ---- 重试 + 退避 ----

async def retry_with_backoff(
    fn: Callable[[], Awaitable[Any]],
    config: RetryConfig | None = None,
    on_retry: Callable[[int, Exception], None] | None = None,
) -> Any:
    cfg = config or RetryConfig()
    last_error: Exception | None = None

    for attempt in range(cfg.max_retries + 1):
        try:
            return await fn()
        except Exception as exc:
            last_error = exc
            cat = classify_error(exc)
            if cat == ErrorCategory.FATAL or attempt == cfg.max_retries:
                raise
            delay = min(cfg.base_delay * (cfg.backoff_multiplier ** attempt), cfg.max_delay)
            if cfg.jitter:
                delay += random.uniform(0, delay * 0.5)  # s11: 500*2^attempt + 随机抖动
            if on_retry:
                on_retry(attempt + 1, exc)
            logger.debug("Retry %d/%d after %.1fs (%s)", attempt + 1, cfg.max_retries, delay, cat.value)
            await asyncio.sleep(delay)

    raise last_error  # type: ignore


# ---- Max Tokens 升级 ----

MAX_TOKENS_TIERS = [8000, 16000, 32000, 64000]
MAX_CONTINUATIONS = 3


def escalate_max_tokens(current: int) -> int | None:
    """s11: 8K→16K→32K→64K 升级链。返回下一个 tier 或 None（已达上限）。"""
    for i, tier in enumerate(MAX_TOKENS_TIERS):
        if current < tier:
            return tier
    return None  # 已经最大


def make_continuation_prompt(attempt: int) -> str:
    """s11: continuation prompt — 模型截断后让它继续。"""
    if attempt >= MAX_CONTINUATIONS:
        return "Please provide your final answer now."
    return (
        f"Your previous response was truncated. Continue exactly where you left off. "
        f"Do not repeat or summarize — pick up from the last complete sentence. "
        f"(Continuation {attempt + 1}/{MAX_CONTINUATIONS})"
    )


# ---- Fallback Model ----

class FallbackTracker:
    """s11: 追踪服务端过载，触发模型降级。"""

    def __init__(self, config: FallbackConfig | None = None):
        self.config = config or FallbackConfig()
        self.consecutive_overloaded: int = 0
        self.fallback_active: bool = False
        self.total_fallbacks: int = 0

    def record_overloaded(self) -> bool:
        """记录一次服务端过载。返回 True 表示应触发 fallback。"""
        self.consecutive_overloaded += 1
        if self.consecutive_overloaded >= self.config.consecutive_overloaded_threshold:
            self.fallback_active = True
            self.total_fallbacks += 1
            logger.warning("Fallback model triggered after %d consecutive overloads",
                           self.consecutive_overloaded)
            return True
        return False

    def record_success(self) -> None:
        """成功调用后重置过载计数。"""
        self.consecutive_overloaded = 0
        if self.fallback_active:
            self.fallback_active = False
            logger.info("Fallback model deactivated after successful call")

    def should_use_fallback(self) -> bool:
        return self.config.enabled and self.fallback_active

    def should_remove_tools(self) -> bool:
        return self.config.remove_tools_on_fallback and self.fallback_active
