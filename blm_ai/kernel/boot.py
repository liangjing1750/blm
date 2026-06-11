"""装配器 — 将配置转化为完整可运行的 Agent 循环状态。

reasonix boot.Build() 模式：单一入口函数接收配置，返回完全装配的 LoopState。
所有依赖在装配时注入，运行时不可变（除了 LoopState 内部的队列）。

参考来源:
  - reasonix boot.go: Build() 函数线性装配链
  - pi-mono agent-harness.ts: 会话 + 扩展 + 压缩的装配模式
"""

import asyncio
from pathlib import Path

from blm_ai.kernel.event_stream import EventSink
from blm_ai.kernel.hook import HookManager
from blm_ai.kernel.loop import LoopConfig, LoopState, agent_loop
from blm_ai.kernel.permission import PermissionMode, PermissionPipeline, PermissionPolicy
from blm_ai.kernel.provider import create_provider
from blm_ai.kernel.tool import ToolRegistry


def assemble_agent(
    *,
    provider_kind: str = "openai",
    base_url: str = "",
    api_key: str = "",
    model_id: str = "",
    tools: ToolRegistry | None = None,
    system_prompt: str = "",
    workspace_dir: str | Path = "",
    max_turns: int = 30,
    interactive: bool = True,
    permission_mode: str = "default",
    event_sink: EventSink | None = None,
    hook_dir: str | Path | None = None,
) -> LoopState:
    """装配完整的 Agent 循环状态。

    装配链（线性，按 reasonix boot.go 模式）：
      1. LLM 提供者 → 2. 权限管线 → 3. 钩子管理器
      → 4. 循环配置 → 5. 组装 LoopState

    参数:
        provider_kind: "openai" / "anthropic" / "qwen" / "deepseek-openai"
        base_url: API 端点 URL
        api_key: API 密钥
        model_id: 模型名称
        tools: 工具注册表（可选，调用方可预先注册工具）
        system_prompt: 系统提示词
        workspace_dir: 工作区根目录
        max_turns: 最大轮次
        interactive: 是否交互模式（False = 无头运行）
        permission_mode: "default" / "bypass" / "plan" / "headless"
        event_sink: 事件分发器（用于外部观察者）
        hook_dir: 钩子脚本目录（.blm/hooks/）
    返回:
        完全装配的 LoopState，可直接传入 agent_loop() 启动。
    """
    # 步骤 1: LLM 提供者
    provider = create_provider(provider_kind, base_url, api_key, model_id)

    # 步骤 2: 权限管线
    perm_mode = PermissionMode.DEFAULT
    if permission_mode == "bypass":
        perm_mode = PermissionMode.BYPASS
    elif permission_mode == "plan":
        perm_mode = PermissionMode.PLAN
    elif permission_mode == "headless":
        perm_mode = PermissionMode.HEADLESS
    elif permission_mode == "accept_edits":
        perm_mode = PermissionMode.ACCEPT_EDITS

    permissions = PermissionPipeline(interactive=interactive)
    permissions.policy.mode = perm_mode

    # 步骤 3: 钩子管理器 — 加载项目级 shell 钩子
    ws = Path(workspace_dir) if workspace_dir else Path.cwd()
    hooks = HookManager(ws)
    if hook_dir:
        hooks.load_shell_hooks(Path(hook_dir), trusted=True)

    # 步骤 4: 循环配置
    config = LoopConfig(
        max_turns=max_turns,
        interactive=interactive,
        workspace_dir=str(ws),
    )

    # 步骤 5: 组装 LoopState
    state = LoopState(
        system_prompt=system_prompt,
        tools=tools or ToolRegistry(),
        provider=provider,
        permissions=permissions,
        hooks=hooks,
        config=config,
    )

    return state


def assemble_with_defaults(
    workspace_dir: str | Path,
    provider_kind: str = "openai",
    base_url: str = "",
    api_key: str = "",
    model_id: str = "",
    system_prompt: str = "",
) -> LoopState:
    """快速装配 — 使用合理默认值，适合原型开发。

    相当于 assemble_agent() 的简化版本，所有选项使用默认值。
    """
    return assemble_agent(
        provider_kind=provider_kind,
        base_url=base_url,
        api_key=api_key,
        model_id=model_id,
        system_prompt=system_prompt,
        workspace_dir=workspace_dir,
        max_turns=30,
        interactive=True,
        permission_mode="default",
    )
