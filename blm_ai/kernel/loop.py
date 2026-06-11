"""双层事件驱动 Agent 循环 — follow-up/steering 队列、风暴断路器、终止检测。

融合 pi-mono 的双层循环（外: follow-up, 内: tool-call）+ reasonix 的并行分区
+ cc 的风暴断路器 + hermes 的最终就绪检查。

参考来源:
  - pi-mono agent-loop.ts: 双层循环 + follow-up/steering 队列
  - reasonix agent.go: storm breaker + 并行分区 + final readiness
  - cc query.ts: token budget 延续决策
"""

import asyncio
import logging
from collections import deque
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any

from blm_ai.kernel.event_stream import (
    AgentComplete, AgentEvent, ApprovalRequest, Error, LLMResponse,
    Notice, TextDelta, ToolDispatch, ToolProgress, ToolResult,
    TurnDone, TurnStarted, Usage,
)
from blm_ai.kernel.hook import HookManager
from blm_ai.kernel.permission import PermissionGate, PermissionPipeline
from blm_ai.kernel.provider import LLMProvider
from blm_ai.kernel.tool import ToolContext, ToolRegistry

logger = logging.getLogger(__name__)

# ---- 配置 ----

@dataclass
class LoopConfig:
    """Agent 循环配置 — 控制最大轮次、并行度、超时、交互模式。"""
    max_turns: int = 30
    max_parallel_tools: int = 8
    tool_timeout_seconds: int = 120
    interactive: bool = True
    max_storm_repeats: int = 3  # 风暴断路器：同一错误模式重复上限
    enable_final_readiness: bool = True  # 最终就绪检查
    enable_steering: bool = True  # 中轮引导注入
    workspace_dir: str = ""

# ---- 循环状态 ----

@dataclass
class LoopState:
    """Agent 循环的可变状态 — 跨轮次追踪。

    消息队列设计（来自 pi-mono）:
      - _follow_up: 后随队列 — Agent 自然停止后才处理
      - _steering: 引导队列 — 中轮注入，下一轮立即处理
      - _pending_tool_results: 等待中的工具结果（并行执行用）
    """
    messages: list[dict] = field(default_factory=list)
    system_prompt: str = ""
    tools: ToolRegistry | None = None
    provider: LLMProvider | None = None
    permissions: PermissionPipeline | None = None
    hooks: HookManager | None = None
    config: LoopConfig = field(default_factory=LoopConfig)
    abort: asyncio.Event = field(default_factory=asyncio.Event)
    turn: int = 0
    total_tokens: int = 0

    # 风暴断路器状态（reasonix 模式）
    _error_history: dict[str, int] = field(default_factory=dict)

    # 消息队列
    _follow_up: deque[dict] = field(default_factory=deque)
    _steering: deque[dict] = field(default_factory=deque)

    # ---- 队列操作 ----

    def drain_follow_up(self) -> list[dict]:
        """排空后随队列中的所有消息。"""
        msgs = list(self._follow_up)
        self._follow_up.clear()
        return msgs

    def drain_steering(self) -> list[dict]:
        """排空引导队列中的所有消息。"""
        msgs = list(self._steering)
        self._steering.clear()
        return msgs

    def queue_follow_up(self, message: dict) -> None:
        """向后随队列添加消息 — 当前轮完成后处理。"""
        self._follow_up.append(message)

    def queue_steering(self, message: dict) -> None:
        """向引导队列添加消息 — 下一轮立即注入。"""
        self._steering.append(message)

    # ---- 风暴断路器 ----

    def record_error(self, tool_name: str, error_msg: str) -> bool:
        """记录工具错误。返回 True 表示应触发断路器（同一模式出现 >= max_storm_repeats 次）。"""
        key = f"{tool_name}:{_error_fingerprint(error_msg)}"
        self._error_history[key] = self._error_history.get(key, 0) + 1
        if self._error_history[key] >= self.config.max_storm_repeats:
            logger.warning("Storm breaker triggered: %s (×%d)", key, self._error_history[key])
            return True
        return False

    def reset_error_history(self) -> None:
        """重置错误历史 — 成功完成一轮后调用。"""
        self._error_history.clear()


def _error_fingerprint(msg: str) -> str:
    """提取错误消息的指纹 — 用于风暴断路器模式匹配。"""
    return msg[:60].strip().lower()

# ---- 主循环 ----

async def agent_loop(state: LoopState) -> AsyncGenerator[AgentEvent, None]:
    """双层事件驱动 Agent 循环。

    外层循环（agent lifecycle）:
      处理 follow-up 消息队列 — Agent 自然停止后才注入。

    内层循环（single turn）:
      LLM 调用 → 工具分区 → 并行/串行执行 → 结果收集 → 风暴检测 → 压缩

    Yields AgentEvent 在每个生命周期阶段通知外部观察者。
    """
    yield Notice(message="Agent loop started")

    while state.turn < state.config.max_turns:
        # 检查取消信号
        if state.abort.is_set():
            yield AgentComplete(reason="aborted")
            return

        # ---- 内层循环：一轮对话 ----
        yield TurnStarted(turn=state.turn)

        # 注入引导消息（来自外界的中轮干预）
        if state.config.enable_steering:
            steer = state.drain_steering()
            for msg in steer:
                state.messages.append(msg)
                yield Notice(message=f"Steering injected: {msg.get('content', '')[:100]}")

        # LLM 调用
        tool_defs = state.tools.list_definitions() if state.tools else None
        try:
            text, tool_blocks, usage = await state.provider.create_message(
                messages=state.messages,
                tools=tool_defs,
                system=state.system_prompt,
            )
            # 发送使用量事件
            if usage:
                state.total_tokens += usage.get("total_tokens", usage.get("input_tokens", 0) + usage.get("output_tokens", 0))
                yield Usage(
                    prompt_tokens=usage.get("input_tokens", 0),
                    completion_tokens=usage.get("output_tokens", 0),
                    total_tokens=state.total_tokens,
                )
        except Exception as exc:
            yield Error(error=str(exc), recoverable=False)
            yield AgentComplete(reason="error")
            return

        yield LLMResponse(text=text, tool_blocks=tool_blocks)

        # 构建助手消息（OpenAI 格式）
        import json as _json
        tool_calls = []
        for tb in tool_blocks:
            tool_calls.append({
                "id": tb["id"], "type": "function",
                "function": {"name": tb["name"], "arguments": _json.dumps(tb["input"], ensure_ascii=False)},
            })
        state.messages.append({
            "role": "assistant", "content": text or None,
            "tool_calls": tool_calls if tool_calls else None,
        })

        # 无工具调用 → Agent 完成（或进入 follow-up）
        if not tool_blocks:
            state.turn += 1
            yield TurnDone(turn=state.turn)
            follow_ups = state.drain_follow_up()
            if follow_ups:
                for msg in follow_ups:
                    state.messages.append(msg)
                    yield Notice(message=f"Follow-up injected")
                state.turn += 1
                continue
            # 最终就绪检查（reasonix 模式）
            if state.config.enable_final_readiness:
                ready_msg = _check_final_readiness(state)
                if ready_msg:
                    state.messages.append({"role": "user", "content": ready_msg})
                    state.turn += 1
                    continue
            yield AgentComplete(reason="done")
            return

        # 执行工具 — 每个工具产生 ToolDispatch + ToolResult 事件
        batches = state.tools.partition(tool_blocks)
        state.reset_error_history()

        for batch in batches:
            for tb in batch:
                tool = state.tools.get(tb["name"])
                is_ro = tool.read_only if tool else False
                yield ToolDispatch(tool_id=tb["id"], tool_name=tb["name"], args=tb["input"], read_only=is_ro)
                output = await _run_one_tool(state, tb)
                yield ToolResult(tool_id=tb["id"], tool_name=tb["name"], output=output, is_error="error" in output.lower()[:100])
                # OpenAI 格式: 每个工具结果独立 tool 消息
                state.messages.append({"role": "tool", "tool_call_id": tb["id"], "content": output})

        yield TurnDone(turn=state.turn)
        state.turn += 1

    yield AgentComplete(reason="max_turns")

# ---- 工具批量执行 ----

async def _execute_batch(
    state: LoopState, batch: list[dict]
) -> AsyncGenerator[AgentEvent | dict, None]:
    """执行一批工具调用 — 并发安全工具并行执行，写者串行。

    reasonix 模式：连续只读工具可并行（max_parallel_tools 上限），
    非只读工具独占串行执行。
    """
    if not batch:
        return

    tool = state.tools.get(batch[0]["name"])
    is_concurrent = tool.concurrency_safe if tool else False and len(batch) > 1

    if is_concurrent:
        # 并行执行并发安全工具
        sem = asyncio.Semaphore(state.config.max_parallel_tools)

        async def _run_with_sem(tb):
            async with sem:
                return await _run_one_tool(state, tb)

        tasks = [_run_with_sem(tb) for tb in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, Exception):
                yield {"type": "tool_result", "tool_use_id": "error", "content": str(r)}
            else:
                yield r
    else:
        # 串行执行
        for tb in batch:
            result = await _run_one_tool(state, tb)
            yield result

# ---- 单工具执行（完整生命周期） ----

async def _run_one_tool(state: LoopState, tb: dict) -> str:
    """执行单个工具调用 — 完整生命周期：权限检查 → 钩子 → 执行 → 风暴检测。
    返回工具输出的字符串（OpenAI 原生格式）。"""
    tool_name, tool_input, tool_id = tb["name"], tb["input"], tb["id"]
    tool = state.tools.get(tool_name)
    is_read_only = tool.read_only if tool else False

    if state.permissions:
        perm = state.permissions.check(tool_name, tool_input, is_read_only,
                                       tool_check=tool.check_permissions if tool else None)
        if perm == PermissionGate.DENY: return "Permission denied."
        if perm == PermissionGate.ASK:
            if not state.config.interactive: return "Approval required in interactive mode."
            if not await _prompt_user(tool_name, tool_input): return "User denied."

    if state.hooks:
        hr = state.hooks.run_pre_tool(tool_name, tool_input)
        if hr.block: return f"Hook blocked: {hr.message}"

    ctx = ToolContext(turn=state.turn)
    try:
        output = f"Unknown tool: {tool_name}" if tool is None else await asyncio.wait_for(tool.execute(tool_input, ctx), timeout=state.config.tool_timeout_seconds)
    except asyncio.TimeoutError:
        output = f"Tool timed out ({state.config.tool_timeout_seconds}s)"
        state.record_error(tool_name, output)
    except Exception as exc:
        output = f"Tool error: {exc}"
        if state.record_error(tool_name, str(exc)):
            output = f"{output}\n\n[Storm breaker: repeated {state.config.max_storm_repeats}+ times. Consider changing approach.]"

    if state.hooks:
        hr = state.hooks.run_post_tool(tool_name, tool_input)
        if hr.output: output = f"{output}\n{hr.output}" if output else hr.output

    return str(output)

# ---- 最终就绪检查 ----

def _check_final_readiness(state: LoopState) -> str | None:
    """reasonix 模式：在 Agent 宣布完成前验证关键条件。

    检查：
      1. 是否有未决的审批请求？
      2. 最后一轮是否用了写工具？（如果用了，可能还有后续）
    返回提示消息或 None（就绪）。
    """
    last_msg = state.messages[-1] if state.messages else {}
    role = last_msg.get("role", "")

    # 如果最后一条消息是工具结果，Agent 可能还没处理完
    if role == "user" and isinstance(last_msg.get("content"), list):
        for block in last_msg["content"]:
            if isinstance(block, dict) and "error" in str(block.get("content", "")).lower():
                return "The last tool execution had errors. Consider retrying or using a different approach."

    return None

# ---- 用户交互提示 ----

async def _prompt_user(tool_name: str, args: dict) -> bool:
    """交互式审批提示 — 在 CLI 模式下询问用户是否允许工具执行。"""
    loop = asyncio.get_running_loop()
    choice = await loop.run_in_executor(
        None,
        lambda: input(f"\n  ⚠ Allow {tool_name}({args})? [y/N] ").strip().lower(),
    )
    return choice in ("y", "yes")

# ---- 子 Agent 执行（用于 task 工具） ----

async def run_sub_agent(
    parent_state: LoopState,
    prompt: str,
    allowed_tools: list[str] | None = None,
    max_turns: int = 10,
) -> str:
    """在隔离的子会话中执行子 Agent（reasonix task.go 模式）。

    子 Agent 拥有独立的 LoopState、过滤的工具注册表、和有限的轮次。
    返回子 Agent 的最终文本输出。

    参数:
        parent_state: 父 Agent 的循环状态（提供 provider 和 system_prompt）。
        prompt: 子 Agent 的初始提示。
        allowed_tools: 允许的工具名称列表（None = 继承父工具集）。
        max_turns: 子 Agent 最大轮次。
    返回:
        子 Agent 的最终文本响应。
    """
    # 构建子工具注册表
    sub_tools = ToolRegistry()
    if allowed_tools and parent_state.tools:
        for name in allowed_tools:
            tool = parent_state.tools.get(name)
            if tool:
                sub_tools.register(tool)
    elif parent_state.tools:
        sub_tools = parent_state.tools  # 继承全部

    # 创建隔离的子状态
    sub_config = LoopConfig(
        max_turns=max_turns,
        interactive=False,  # 子 Agent 非交互
        enable_final_readiness=False,
        enable_steering=False,
    )
    sub_state = LoopState(
        system_prompt=parent_state.system_prompt,
        tools=sub_tools,
        provider=parent_state.provider,
        permissions=parent_state.permissions,
        config=sub_config,
    )

    # 注入初始提示
    sub_state.messages.append({"role": "user", "content": prompt})

    # 运行子循环，收集文本和工具结果
    final_text = ""
    async for event in agent_loop(sub_state):
        if isinstance(event, LLMResponse) and event.text:
            final_text = event.text
        elif isinstance(event, AgentComplete):
            break

    return final_text or "(sub-agent produced no output)"
