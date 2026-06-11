"""BLM AI — 生产级 Agent 框架，含自沉淀技能和 8 层文件式提示词架构。"""

from blm_ai.agent_builder import BLMAgent, build_blm_agent
from blm_ai.config import Config, load_config
from blm_ai.kernel.boot import assemble_agent
from blm_ai.kernel.event_stream import AgentEvent, EventSink
from blm_ai.kernel.loop import LoopState, agent_loop
from blm_ai.kernel.permission import PermissionGate, PermissionPipeline
from blm_ai.kernel.provider import LLMProvider, create_provider
from blm_ai.kernel.retry import ErrorCategory, classify_error
from blm_ai.kernel.tool import Tool, ToolContext, ToolRegistry
from blm_ai.prompt.composer import assemble as assemble_prompt

__all__ = [
    "AgentEvent", "EventSink",
    "BLMAgent", "build_blm_agent",
    "Config", "load_config",
    "ErrorCategory", "classify_error",
    "LLMProvider", "create_provider",
    "LoopState", "agent_loop", "assemble_agent",
    "PermissionGate", "PermissionPipeline",
    "Tool", "ToolContext", "ToolRegistry",
    "assemble_prompt",
]
