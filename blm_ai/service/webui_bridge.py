"""WebUI bridge — SSE adapter for the loop-agent-webui React frontend.

Translates between BLM's AgentEvent stream and the webui's WireEvent format.
The webui POSTs to /api/agent/chat with {prompt, sessionId?} and receives
SSE events matching its WireEvent schema.
"""

import json
import threading
from typing import Any


# Map BLM agent events to webui WireEvent kinds
EVENT_MAP = {
    "turn_started": "turn_started",
    "turn_done": "turn_done",
    "llm_response": "message",
    "text_delta": "text",
    "tool_dispatch": "tool_dispatch",
    "tool_progress": "tool_progress",
    "tool_result": "tool_result",
    "approval_request": "approval_request",
    "error": "error",
    "notice": "notice",
    "phase": "phase",
    "agent_complete": "turn_done",
}


def convert_event(event: Any) -> dict:
    """Convert a BLM AgentEvent to a webui WireEvent dict."""
    kind = EVENT_MAP.get(getattr(event, "kind", ""), "notice")

    result: dict[str, Any] = {"kind": kind}

    if kind == "message":
        result["text"] = getattr(event, "text", "")

    elif kind == "tool_dispatch":
        result["tool"] = {
            "id": getattr(event, "tool_id", ""),
            "name": getattr(event, "tool_name", ""),
            "args": json.dumps(getattr(event, "args", {})),
            "readOnly": getattr(event, "read_only", False),
        }

    elif kind == "tool_result":
        result["tool"] = {
            "id": getattr(event, "tool_id", ""),
            "name": getattr(event, "tool_name", ""),
            "output": getattr(event, "output", ""),
            "isError": getattr(event, "is_error", False),
        }

    elif kind == "approval_request":
        result["approval"] = {
            "id": getattr(event, "approval_id", ""),
            "tool": getattr(event, "tool_name", ""),
            "subject": getattr(event, "reason", ""),
        }

    elif kind == "error":
        result["error"] = getattr(event, "error", "")

    elif kind == "notice":
        result["message"] = getattr(event, "message", "")

    # Carry through additional fields
    if hasattr(event, "turn"):
        result["turn"] = event.turn

    return result


def stream_sse_events(
    wfile: Any,
    agent_generator: Any,
    on_done = None,             # callable | None
    on_error = None,            # callable | None
) -> None:
    """Stream agent events as SSE to the webui client.

    Called from a background thread within the HTTP handler.
    """
    import asyncio

    async def _collect():
        async for event in agent_generator:
            wire = convert_event(event)
            data = json.dumps(wire, ensure_ascii=False)
            try:
                wfile.write(f"data: {data}\n\n".encode())
                wfile.flush()
            except Exception:
                break  # client disconnected
        if on_done:
            on_done()

    try:
        asyncio.run(_collect())
    except Exception as exc:
        if on_error:
            on_error(str(exc))
