"""Agent builder — 装配完整 BLM Agent，使用 prompt composer 的 8 层提示词架构。"""

from collections.abc import AsyncGenerator
from pathlib import Path

from blm_ai.config import Config
from blm_ai.kernel.boot import assemble_agent
from blm_ai.kernel.event_stream import AgentEvent
from blm_ai.kernel.loop import LoopState, agent_loop
from blm_ai.kernel.tool import ToolRegistry
from blm_ai.prompt.composer import assemble as assemble_prompt
from blm_ai.tools.blm_workspace import create_blm_tools
from blm_ai.tools.skill_manage import create_skill_manage_tool


class BLMAgent:
    """高层 BLM Agent 封装 — 8 层提示词 + 技能 + 工具。"""

    def __init__(self, state: LoopState):
        self._state = state

    async def run(self, user_message: str) -> AsyncGenerator[AgentEvent, None]:
        self._state.messages.append({"role": "user", "content": user_message})
        async for event in agent_loop(self._state):
            yield event


def build_blm_agent(config: Config) -> BLMAgent:
    """装配完整 BLM Agent。

    装配链:
      1. 8 层系统提示词 (prompt/composer.py)
      2. 工具注册 (技能管理 + BLM 工作区)
      3. Kernel 装配 (权限 + 钩子 + 提供者)
      4. 封装为 BLMAgent
    """
    blm_dir = config.workspace_dir / ".blm"
    skills_dir = blm_dir / "skills"
    memory_path = blm_dir / "MEMORY.md"

    # 步骤 1: 系统提示词（8 层组装）
    system_prompt = assemble_prompt(
        blm_dir=blm_dir,
        skills_dir=skills_dir,
        memory_path=memory_path,
        model_id=config.model_id,
        channel="cli" if config.interactive else "api",
    )

    # 步骤 2: 工具注册
    tools = ToolRegistry()
    tools.register(create_skill_manage_tool(skills_dir))
    tools.register_many(create_blm_tools(config.workspace_dir))

    # 步骤 3: Kernel 装配
    state = assemble_agent(
        provider_kind=config.provider_kind,
        base_url=config.base_url,
        api_key=config.api_key,
        model_id=config.model_id,
        tools=tools,
        system_prompt=system_prompt,
        workspace_dir=config.workspace_dir,
        max_turns=config.max_turns,
        interactive=config.interactive,
        permission_mode=config.permission_mode,
    )
    return BLMAgent(state)
