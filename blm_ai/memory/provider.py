"""MemoryProvider ABC — pluggable memory backends.

Directly adapted from hermes-agent's memory_provider.py.
"""

from abc import ABC, abstractmethod
from typing import Any


class MemoryProvider(ABC):
    """Abstract base for memory backends.

    One built-in provider always exists. External providers
    can be added via plugins (max 1 external at a time).
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    def initialize(self, session_id: str, **kwargs: Any) -> None: ...

    # ---- System prompt ----

    def system_prompt_block(self) -> str:
        """Static text injected into the system prompt. Cached across turns."""
        return ""

    # ---- Prefetch / recall ----

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Background recall before each turn. Returns context to inject."""
        return ""

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        """Non-blocking prefetch queued for next turn."""
        pass

    # ---- Sync ----

    def sync_turn(
        self, user_content: str, assistant_content: str, *,
        session_id: str = "",
        messages: list[dict[str, Any]] | None = None,
    ) -> None:
        """Async write after each turn."""
        pass

    # ---- Tools ----

    @abstractmethod
    def get_tool_schemas(self) -> list[dict[str, Any]]: ...

    def handle_tool_call(self, tool_name: str, args: dict[str, Any],
                         **kwargs: Any) -> str:
        """Route a tool call to this provider. Returns the result."""
        return ""

    # ---- Lifecycle ----

    def shutdown(self) -> None:
        pass

    def on_turn_start(self, turn_number: int, message: str, **kwargs: Any) -> None:
        pass

    def on_session_end(self, messages: list[dict[str, Any]]) -> None:
        pass

    def on_session_switch(self, new_session_id: str, *,
                          parent_session_id: str = "",
                          reset: bool = False, **kwargs: Any) -> None:
        pass

    def on_pre_compress(self, messages: list[dict[str, Any]]) -> str:
        """Called before compaction. Can annotate messages."""
        return ""

    def on_memory_write(self, action: str, target: str, content: str,
                        metadata: dict[str, Any] | None = None) -> None:
        pass
