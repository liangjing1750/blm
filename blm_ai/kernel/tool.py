"""Tool ABC + ToolRegistry + lifecycle hooks.

Fuses pi-mono's prepare→before→execute→after→finalize pipeline
with reasonix's ReadOnly marker and check_permissions gate.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

from blm_ai.kernel.event_stream import EventSink


class ToolLifecycle(Enum):
    PREPARE = "prepare"
    VALIDATE = "validate"
    BEFORE_EXECUTE = "before_execute"
    EXECUTE = "execute"
    AFTER_EXECUTE = "after_execute"
    FINALIZE = "finalize"


@dataclass
class ToolContext:
    cwd: str = ""
    workspace_root: str = ""
    session_id: str = ""
    turn: int = 0
    events: Optional[EventSink] = None

    def emit(self, event) -> None:
        if self.events:
            self.events.emit(event)


@dataclass
class ValidationResult:
    valid: bool = True
    errors: list[str] = field(default_factory=list)

    @classmethod
    def ok(cls) -> "ValidationResult":
        return cls(valid=True)

    @classmethod
    def fail(cls, *errors: str) -> "ValidationResult":
        return cls(valid=False, errors=list(errors))


class PermissionResult(Enum):
    ALLOW = "allow"
    DENY = "deny"
    ASK = "ask"


class Tool(ABC):
    """Base class for all agent tools.

    Subclasses override class-level attributes and implement execute().
    """

    name: str = ""
    description: str = ""
    parameters: dict = {"type": "object", "properties": {}, "required": []}
    read_only: bool = False
    concurrency_safe: bool = True

    @abstractmethod
    async def execute(self, args: dict, ctx: ToolContext) -> str: ...

    async def validate(self, args: dict) -> ValidationResult:
        """Validate arguments against the declared JSON Schema."""
        return _validate_json_schema(args, self.parameters)

    async def check_permissions(self, args: dict, ctx: ToolContext) -> PermissionResult:
        return PermissionResult.ALLOW

    def preview(self, args: dict) -> Optional[str]:
        """Preview the change this tool would make (for diff display)."""
        return None


# ---- Registry ----

BeforeHook = Callable[[str, dict, ToolContext], Optional[str]]
AfterHook = Callable[[str, dict, str, ToolContext], Optional[str]]


class ToolRegistry:
    """Collects and dispatches tools with lifecycle hooks."""

    def __init__(self):
        self._tools: dict[str, Tool] = {}
        self._before_hooks: list[BeforeHook] = []
        self._after_hooks: list[AfterHook] = []

    # ---- Registration ----

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def register_many(self, tools: list[Tool]) -> None:
        for t in tools:
            self.register(t)

    def get(self, name: str) -> Optional[Tool]:
        return self._tools.get(name)

    def remove(self, name: str) -> None:
        self._tools.pop(name, None)

    def remove_by_prefix(self, prefix: str) -> None:
        for name in list(self._tools):
            if name.startswith(prefix):
                del self._tools[name]

    # ---- Hooks ----

    def add_before_hook(self, hook: BeforeHook) -> None:
        self._before_hooks.append(hook)

    def add_after_hook(self, hook: AfterHook) -> None:
        self._after_hooks.append(hook)

    # ---- Queries ----

    def list_names(self) -> list[str]:
        return sorted(self._tools)

    def list_definitions(self) -> list[dict]:
        """OpenAI-format tool definitions for the API."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._tools.values()
        ]

    def partition(self, tool_calls: list[dict]) -> list[list[dict]]:
        """Partition tool calls into concurrent-safe batches.

        Continuous read-only tools can run in parallel.
        Writers and non-concurrency-safe tools get their own serial batch.
        """
        batches: list[list[dict]] = []
        current: list[dict] = []

        for tc in tool_calls:
            tool = self.get(tc["name"])
            safe = tool.concurrency_safe if tool else False
            ro = tool.read_only if tool else False

            if current:
                prev_tool = self.get(current[0]["name"])
                prev_safe = prev_tool.concurrency_safe if prev_tool else False
                if not safe or not prev_safe:
                    batches.append(current)
                    current = []
            current.append(tc)

        if current:
            batches.append(current)

        return batches

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def __iter__(self):
        return iter(self._tools.values())


# ---- Schema validation ----

def _validate_json_schema(args: dict, schema: dict) -> ValidationResult:
    errors: list[str] = []
    props = schema.get("properties", {})
    required = schema.get("required", [])

    for key in required:
        if key not in args or args[key] is None:
            errors.append(f"Missing required field: {key}")

    for key, value in args.items():
        if key in props:
            prop = props[key]
            expected_type = prop.get("type", "")
            if expected_type == "string" and not isinstance(value, str):
                errors.append(f"Field '{key}' must be a string")
            elif expected_type == "integer" and not isinstance(value, int):
                errors.append(f"Field '{key}' must be an integer")
            elif expected_type == "number" and not isinstance(value, (int, float)):
                errors.append(f"Field '{key}' must be a number")
            elif expected_type == "boolean" and not isinstance(value, bool):
                errors.append(f"Field '{key}' must be a boolean")
            elif expected_type == "array" and not isinstance(value, list):
                errors.append(f"Field '{key}' must be an array")
            elif expected_type == "object" and not isinstance(value, dict):
                errors.append(f"Field '{key}' must be an object")

    return ValidationResult(valid=len(errors) == 0, errors=errors)
