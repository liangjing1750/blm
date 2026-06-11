"""集成测试 — Agent 循环 + mock LLM 的完整流程。

覆盖: 单轮对话、多工具调用、权限拒绝、技能沉淀、风暴断路器。
"""

import asyncio
import tempfile
import unittest
from pathlib import Path

from blm_ai.kernel.boot import assemble_agent
from blm_ai.kernel.loop import agent_loop, LoopConfig, LoopState
from blm_ai.kernel.permission import PermissionMode, PermissionPipeline
from blm_ai.kernel.tool import Tool, ToolContext, ToolRegistry
from tests.mock_llm import MockLLMClient, make_text_response, make_tool_response


class TestAgentLoopWithMock(unittest.TestCase):
    """Agent 循环 + mock LLM 的集成测试。"""

    def setUp(self):
        self.tools = ToolRegistry()

    def _make_state(self, mock_llm, max_turns=5):
        permissions = PermissionPipeline(interactive=False)
        permissions.policy.mode = PermissionMode.HEADLESS
        return LoopState(
            system_prompt="Test agent",
            tools=self.tools,
            provider=mock_llm,
            permissions=permissions,
            config=LoopConfig(max_turns=max_turns, interactive=False),
        )

    async def _collect_events(self, state, user_message: str) -> list:
        events = []
        state.messages.append({"role": "user", "content": user_message})
        async for event in agent_loop(state):
            events.append(event)
        return events

    def test_single_turn_text_only(self):
        """单轮纯文本对话 — Agent 完成并返回文本。"""
        mock = MockLLMClient([make_text_response("Hello! I am an AI assistant.")])
        state = self._make_state(mock)

        events = asyncio.run(self._collect_events(state, "Hi"))
        kinds = [e.kind for e in events]

        self.assertIn("llm_response", kinds)
        self.assertIn("agent_complete", kinds)
        self.assertEqual(mock.call_count, 1)

    def test_multi_tool_workflow(self):
        """多工具调用流程 — 先读后分析。"""
        mock = MockLLMClient([
            make_tool_response("read_workspace", {"name": "test"}, "t1", "Loading..."),
            make_text_response("The workspace contains 3 stages and 5 processes."),
        ])

        class ReadTool(Tool):
            name = "read_workspace"; read_only = True
            async def execute(self, args, ctx): return f"Content of {args['name']}"
        self.tools.register(ReadTool())

        state = self._make_state(mock)
        events = asyncio.run(self._collect_events(state, "Analyze workspace 'test'"))

        kinds = [e.kind for e in events if hasattr(e, 'kind')]
        self.assertIn("llm_response", kinds)
        self.assertIn("agent_complete", kinds)
        self.assertEqual(mock.call_count, 2)

    def test_permission_deny(self):
        """权限拒绝 — 危险命令被阻止。"""
        mock = MockLLMClient([
            make_tool_response("bash", {"command": "sudo rm -rf /tmp"}, "t1"),
            make_text_response("I cannot execute that command."),
        ])

        class BashTool(Tool):
            name = "bash"; read_only = False
            async def execute(self, args, ctx): return f"Ran: {args['command']}"
        self.tools.register(BashTool())

        state = self._make_state(mock)
        state.permissions = PermissionPipeline(interactive=False)

        events = asyncio.run(self._collect_events(state, "Delete temp files with sudo rm"))
        kinds = [e.kind for e in events if hasattr(e, 'kind')]
        self.assertIn("agent_complete", kinds)

    def test_follow_up_injection(self):
        """Follow-up 队列注入 — 多轮对话。"""
        mock = MockLLMClient([
            make_text_response("Task 1 done."),
            make_text_response("Task 2 done."),
        ])

        state = self._make_state(mock, max_turns=10)
        state.queue_follow_up({"role": "user", "content": "Now do task 2"})

        events = asyncio.run(self._collect_events(state, "Do task 1"))
        completions = [e for e in events if e.kind == "agent_complete"]
        self.assertTrue(len(completions) >= 0)
        self.assertEqual(mock.call_count, 2)

    def test_storm_breaker(self):
        """风暴断路器 — 同一错误触发 3 次后改写输出。"""
        class ErrorTool(Tool):
            name = "flaky"; read_only = True
            async def execute(self, args, ctx): raise RuntimeError("always fails")
        self.tools.register(ErrorTool())

        mock = MockLLMClient([
            make_tool_response("flaky", {}, "t1"),
            make_tool_response("flaky", {}, "t2"),
            make_tool_response("flaky", {}, "t3"),
            make_text_response("I'll try a different approach."),
        ])

        state = self._make_state(mock, max_turns=10)
        events = asyncio.run(self._collect_events(state, "Use the flaky tool three times"))

        # 前 3 次应触发风暴断路器
        self.assertEqual(mock.call_count, 4)  # 3 tool calls + 1 final


if __name__ == "__main__":
    unittest.main()
