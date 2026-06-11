"""可插拔上下文引擎抽象 — 定义压缩策略的标准接口。

直接移植自 hermes-agent 的 context_engine.py。
支持多种压缩策略: Noop（不压缩）、Compressor（全压缩）、MicroCompact（仅微压缩）。

参考来源:
  - hermes context_engine.py: ContextEngine ABC + 生命周期钩子
  - cc contextCollapse: collapse 驱动型压缩（可选替代策略）

设计原则:
  - 上下文引擎是可插拔的 — 通过配置切换，不影响 Agent 循环核心逻辑
  - 每个引擎持有自己的状态（令牌计数、压缩统计等）
  - 生命周期钩子允许引擎在会话边界执行清理操作
"""

from abc import ABC, abstractmethod
from typing import Any


class ContextEngine(ABC):
    """可插拔上下文压缩策略的抽象基类。

    子类必须实现: name, update_from_response, should_compress, compress。
    可选择性覆盖: on_session_start, on_session_end, on_session_reset, update_model。

    令牌追踪字段由 Agent 循环直接读取，因此必须作为实例属性暴露。
    """

    # ---- 抽象接口 ----

    @property
    @abstractmethod
    def name(self) -> str:
        """引擎名称 — 用于配置和日志。"""
        ...

    @abstractmethod
    def update_from_response(self, usage: dict[str, Any]) -> None:
        """从最新的 API 响应更新令牌计数器。

        Agent 循环在每次 LLM 调用后调用此方法。
        usage 格式: {"input_tokens": N, "output_tokens": N, ...}
        """
        ...

    @abstractmethod
    def should_compress(self, prompt_tokens: int | None = None) -> bool:
        """判断当前上下文是否需要压缩。

        返回 True 表示 Agent 循环应在下一轮前调用 compress()。
        """
        ...

    @abstractmethod
    def compress(
        self,
        messages: list[dict[str, Any]],
        current_tokens: int | None = None,
        focus_topic: str | None = None,
    ) -> list[dict[str, Any]]:
        """压缩消息列表 — 返回更短但仍有效的消息序列。

        返回的列表必须保持消息角色交替（user/assistant/user/...）。
        不能破坏工具调用/结果配对。
        """
        ...

    # ---- 令牌追踪（Agent 循环直接读取） ----

    last_prompt_tokens: int = 0
    last_completion_tokens: int = 0
    last_total_tokens: int = 0
    context_length: int = 128_000
    compression_count: int = 0

    # ---- 阈值（子类可覆盖） ----

    threshold_percent: float = 0.75
    soft_ratio: float = 0.50
    compact_ratio: float = 0.80
    force_ratio: float = 0.90
    protect_first_n: int = 3
    protect_last_n: int = 20
    token_budget_tail: int = 16_000

    # ---- 可选生命周期钩子 ----

    def on_session_start(self, session_id: str, **kwargs: Any) -> None:
        """会话开始 — 初始化引擎状态。"""

    def on_session_end(self, session_id: str, messages: list[dict[str, Any]]) -> None:
        """会话结束 — 清理资源。"""

    def on_session_reset(self) -> None:
        """会话重置 — 清空计数器和状态。"""
        self.last_prompt_tokens = 0
        self.last_completion_tokens = 0
        self.last_total_tokens = 0
        self.compression_count = 0

    def update_model(self, model: str, context_length: int, **kwargs: Any) -> None:
        """模型切换时更新上下文窗口大小。"""
        self.context_length = context_length


class NoopEngine(ContextEngine):
    """空操作引擎 — 永不压缩（适合短对话和测试）。"""

    name = "noop"

    def update_from_response(self, usage: dict[str, Any]) -> None:
        """从 API 响应更新令牌计数。"""
        u = usage.get("usage", usage)
        self.last_prompt_tokens = u.get("input_tokens", 0)
        self.last_completion_tokens = u.get("output_tokens", 0)
        self.last_total_tokens = self.last_prompt_tokens + self.last_completion_tokens

    def should_compress(self, prompt_tokens: int | None = None) -> bool:
        """永不压缩。"""
        return False

    def compress(self, messages, current_tokens=None, focus_topic=None):
        """返回未修改的消息。"""
        return messages


class ThresholdEngine(ContextEngine):
    """基于阈值的上下文引擎 — 按比例触发压缩，委托给压缩器执行。

    三比率触发（reasonix 模式）:
      - soft_ratio: 仅警告
      - compact_ratio: 触发自动压缩
      - force_ratio: 强制压缩
    """

    name = "threshold"

    def __init__(self, compressor, context_length: int = 128_000):
        self._compressor = compressor
        self.context_length = context_length

    def update_from_response(self, usage: dict[str, Any]) -> None:
        """委托给内部压缩器进行令牌更新和比率校准。"""
        u = usage.get("usage", usage)
        self.last_prompt_tokens = u.get("input_tokens", 0)
        self.last_completion_tokens = u.get("output_tokens", 0)
        self.last_total_tokens = self.last_prompt_tokens + self.last_completion_tokens

    def should_compress(self, prompt_tokens: int | None = None) -> bool:
        """三比率阈值判断。"""
        tokens = prompt_tokens or self.last_prompt_tokens
        status = self._compressor.should_compact(tokens)
        return status in ("compact", "force")

    async def compress(self, messages, current_tokens=None, focus_topic=None):
        """委托给内部压缩器执行全压缩流水线。"""
        self.compression_count += 1
        return await self._compressor.compress(messages, current_tokens, focus_topic)
