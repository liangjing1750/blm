"""类型化 Agent 事件流 — 解耦 Agent 与前端、支持多 Sink 分发。

定义了 16 种生命周期事件的判别联合，覆盖从 turn_start 到 agent_complete
的完整链路。Sink 接口支持多路复用（多个观察者同时监听）。

参考来源:
  - reasonix event/event.go: Sink 接口 + FuncSink + Discard
  - pi-mono agent-loop.ts: 事件判别联合模式
  - hermes 事件类型命名惯例
"""

from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Union

# ---- 事件载荷（16 种判别联合） ----

@dataclass
class TurnStarted:
    """一轮对话开始。turn: 轮次序号（从 0 开始）。"""
    kind: Literal["turn_started"] = "turn_started"
    turn: int = 0

@dataclass
class TurnDone:
    """一轮对话结束。"""
    kind: Literal["turn_done"] = "turn_done"
    turn: int = 0

@dataclass
class TextDelta:
    """流式文本增量 — LLM 输出中的单个 token/片段。"""
    kind: Literal["text_delta"] = "text_delta"
    text: str = ""

@dataclass
class ReasoningDelta:
    """流式推理文本（CoT/思维链）增量。"""
    kind: Literal["reasoning"] = "reasoning"
    text: str = ""

@dataclass
class LLMResponse:
    """LLM 完成一次调用后的完整响应 — 文本 + 所有 tool_use 块。"""
    kind: Literal["llm_response"] = "llm_response"
    text: str = ""
    tool_blocks: list[dict] = field(default_factory=list)

@dataclass
class ToolDispatch:
    """工具开始执行通知。tool_id 为 LLM 返回的 tool_use id。"""
    kind: Literal["tool_dispatch"] = "tool_dispatch"
    tool_id: str = ""
    tool_name: str = ""
    args: dict = field(default_factory=dict)
    read_only: bool = False

@dataclass
class ToolProgress:
    """工具执行中的流式进度更新（如 bash 实时输出）。"""
    kind: Literal["tool_progress"] = "tool_progress"
    tool_id: str = ""
    tool_name: str = ""
    output: str = ""

@dataclass
class ToolResult:
    """工具执行完成的结果。is_error 表示工具执行失败。"""
    kind: Literal["tool_result"] = "tool_result"
    tool_id: str = ""
    tool_name: str = ""
    output: str = ""
    is_error: bool = False
    truncated: bool = False

@dataclass
class ApprovalRequest:
    """权限审批请求 — 需要用户确认才能继续执行。"""
    kind: Literal["approval_request"] = "approval_request"
    approval_id: str = ""
    tool_name: str = ""
    args: dict = field(default_factory=dict)
    reason: str = ""

@dataclass
class Usage:
    """API 使用量统计 — 从 LLM 响应中提取的 token 消耗。"""
    kind: Literal["usage"] = "usage"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

@dataclass
class CompactionStarted:
    """上下文压缩开始 — reason 说明触发原因（auto/force/manual）。"""
    kind: Literal["compaction_started"] = "compaction_started"
    reason: str = ""

@dataclass
class CompactionDone:
    """上下文压缩完成 — 报告压缩前后的 token 数。"""
    kind: Literal["compaction_done"] = "compaction_done"
    tokens_before: int = 0
    tokens_after: int = 0

@dataclass
class Error:
    """Agent 错误事件 — recoverable 表示是否可恢复。"""
    kind: Literal["error"] = "error"
    error: str = ""
    recoverable: bool = False

@dataclass
class Notice:
    """信息性通知 — 不影响流程，仅用于日志/状态显示。"""
    kind: Literal["notice"] = "notice"
    message: str = ""

@dataclass
class Phase:
    """生命周期阶段标记 — 用于前端展示当前阶段。"""
    kind: Literal["phase"] = "phase"
    label: str = ""

@dataclass
class AgentComplete:
    """Agent 循环终止 — reason 说明终止原因（done/error/aborted/max_turns）。"""
    kind: Literal["agent_complete"] = "agent_complete"
    reason: str = "done"

# ---- 判别联合 ----

AgentEvent = Union[
    TurnStarted, TurnDone,
    TextDelta, ReasoningDelta, LLMResponse,
    ToolDispatch, ToolProgress, ToolResult,
    ApprovalRequest, Usage,
    CompactionStarted, CompactionDone,
    Error, Notice, Phase, AgentComplete,
]

# ---- Sink 接口（reasonix 模式） ----

EventHandler = Callable[[AgentEvent], None]


class EventSink:
    """收集并分发类型化事件 — 线程安全，支持多路复用。

    用法:
        sink = EventSink()
        off = sink.on(lambda e: print(e.kind))
        sink.emit(TurnStarted(turn=0))
        off()  # 取消订阅
    """

    def __init__(self):
        self._handlers: list[EventHandler] = []
        self._emitted: list[AgentEvent] = []  # 事件回放缓冲区

    def on(self, handler: EventHandler) -> Callable[[], None]:
        """注册事件处理器。返回取消订阅函数。"""
        self._handlers.append(handler)
        def off():
            try:
                self._handlers.remove(handler)
            except ValueError:
                pass
        return off

    def emit(self, event: AgentEvent) -> None:
        """向所有注册的处理器分发事件。单个处理器失败不影响其他。"""
        self._emitted.append(event)
        for h in self._handlers:
            try:
                h(event)
            except Exception:
                pass

    def replay(self, handler: EventHandler) -> None:
        """向新订阅者回放所有已发出的事件。"""
        for event in self._emitted:
            try:
                handler(event)
            except Exception:
                pass

    def remove_all(self) -> None:
        """移除所有事件处理器。"""
        self._handlers.clear()

    @property
    def handled_count(self) -> int:
        return len(self._emitted)


class NullSink(EventSink):
    """空 Sink — 丢弃所有事件（用于无头/后台运行）。"""
    def emit(self, event: AgentEvent) -> None:
        pass


class MultiSink(EventSink):
    """多路 Sink — 同时向多个子 Sink 分发事件。

    用法:
        fs = FileSink(path); ws = WebSink()
        multi = MultiSink([fs, ws])
        multi.emit(event)  # 同时写入文件和推送到 Web
    """
    def __init__(self, sinks: list[EventSink]):
        super().__init__()
        self._sinks = sinks

    def emit(self, event: AgentEvent) -> None:
        super().emit(event)
        for sink in self._sinks:
            try:
                sink.emit(event)
            except Exception:
                pass
