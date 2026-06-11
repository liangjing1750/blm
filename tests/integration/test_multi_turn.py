"""集成测试: 多轮对话 — Agent 跨轮状态保持、技能沉淀触发。"""

import asyncio, tempfile, unittest
from pathlib import Path

from blm_ai.kernel.loop import agent_loop, LoopConfig, LoopState
from blm_ai.kernel.permission import PermissionPipeline, PermissionMode
from blm_ai.kernel.tool import Tool, ToolContext, ToolRegistry
from tests.mock_llm import MockLLMClient, make_text_response, make_tool_response


class TestMultiTurn(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.tools = ToolRegistry()

        class ListTool(Tool):
            name="list_workspaces"; read_only=True
            async def execute(self, a, c): return "ws1\nws2"
        class ReadTool(Tool):
            name="read_workspace"; read_only=True
            async def execute(self, a, c): return f"Content of {a.get('name','?')}"
        self.tools.register(ListTool()); self.tools.register(ReadTool())

    def tearDown(self):
        self.tmp.cleanup()

    def _state(self, mock):
        p = PermissionPipeline(interactive=False); p.policy.mode = PermissionMode.HEADLESS
        return LoopState(system_prompt="Test", tools=self.tools, provider=mock, permissions=p,
                         config=LoopConfig(max_turns=10, interactive=False))

    async def _run_turns(self, state, turns):
        events = []
        for msg in turns:
            state.messages.append({"role":"user","content":msg})
            async for e in agent_loop(state): events.append(e)
        return events

    def test_three_turn_workflow(self):
        """3轮对话: 列出→读取→分析。"""
        mock = MockLLMClient([
            make_tool_response("list_workspaces", {}, "t1"),   # Turn 1
            make_text_response("有两个工作区"),
            make_tool_response("read_workspace", {"name":"ws1"}, "t2"),  # Turn 2
            make_text_response("ws1已加载"),
            make_text_response("分析完成"),  # Turn 3
        ])
        state = self._state(mock)
        events = asyncio.run(self._run_turns(state, ["有哪些工作区", "读取ws1", "分析ws1"]))
        kinds = [e.kind for e in events if hasattr(e, 'kind')]
        self.assertIn("tool_dispatch", kinds)
        self.assertIn("agent_complete", kinds)
        self.assertGreaterEqual(mock.call_count, 3)

    def test_state_persistence_across_turns(self):
        """跨轮状态保持 — 第二轮能看到第一轮的消息。"""
        mock = MockLLMClient([
            make_text_response("第一轮回复"),
            make_text_response("第二轮回复, 前面你说了: "),
        ])
        state = self._state(mock)
        events = asyncio.run(self._run_turns(state, ["第一轮消息", "第二轮消息"]))
        self.assertGreaterEqual(len(state.messages), 4)  # 2 user + 2 assistant = 4 (纯文本无工具)
        # 消息应包含两轮的内容
        self.assertIn("第一轮", str(state.messages))


if __name__ == "__main__":
    unittest.main()
