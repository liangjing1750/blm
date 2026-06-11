"""集成测试: Agent 完整工作流 — mock LLM + 真实工具。"""

import asyncio, tempfile, unittest
from pathlib import Path

from blm_ai.kernel.loop import agent_loop, LoopConfig, LoopState
from blm_ai.kernel.permission import PermissionPipeline, PermissionMode
from blm_ai.kernel.tool import Tool, ToolContext, ToolRegistry
from tests.mock_llm import MockLLMClient, make_text_response, make_tool_response


class TestAgentWorkflow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.tools = ToolRegistry()
        self._register_tools()

    def tearDown(self):
        self.tmp.cleanup()

    def _register_tools(self):
        class ReadTool(Tool):
            name="read_workspace"; read_only=True
            async def execute(self, a, c): return f"Content of {a.get('name','?')}"
        class ListTool(Tool):
            name="list_workspaces"; read_only=True
            async def execute(self, a, c): return "ws1\nws2"
        class SkillTool(Tool):
            name="skill_manage"; read_only=False
            async def execute(self, a, c): return f"Skill {a.get('action','?')} ok"
        self.tools.register(ReadTool()); self.tools.register(ListTool()); self.tools.register(SkillTool())

    def _state(self, mock, **kw):
        perms = PermissionPipeline(interactive=False)
        perms.policy.mode = PermissionMode.HEADLESS
        return LoopState(system_prompt="Test", tools=self.tools, provider=mock, permissions=perms,
                         config=LoopConfig(max_turns=kw.get('max_turns',5), interactive=False))

    def test_list_then_read_workflow(self):
        """列出工作区→选择→读取的完整流程。"""
        mock = MockLLMClient([
            make_tool_response("list_workspaces", {}, "t1", "Listing..."),
            make_tool_response("read_workspace", {"name":"ws1"}, "t2", "Reading..."),
            make_text_response("分析完成: ws1包含3个阶段"),
        ])
        state = self._state(mock)
        events = asyncio.run(self._collect(state, "列出工作区并分析ws1"))
        kinds = [e.kind for e in events if hasattr(e, 'kind')]
        self.assertIn("llm_response", kinds)
        self.assertIn("agent_complete", kinds)
        self.assertEqual(mock.call_count, 3)

    def test_skill_create_workflow(self):
        """创建技能的完整流程。"""
        mock = MockLLMClient([
            make_tool_response("skill_manage", {"action":"create","name":"test","description":"d","content":"c"}, "t1"),
            make_text_response("技能已创建"),
        ])
        state = self._state(mock)
        events = asyncio.run(self._collect(state, "创建一个test技能"))
        kinds = [e.kind for e in events if hasattr(e, 'kind')]
        self.assertIn("tool_dispatch", kinds)
        self.assertIn("tool_result", kinds)

    def test_text_only_workflow(self):
        """纯文本问答 — 无工具调用。"""
        mock = MockLLMClient([make_text_response("你好,我是BLM助手")])
        state = self._state(mock)
        events = asyncio.run(self._collect(state, "你好"))
        texts = [e.text for e in events if hasattr(e, 'kind') and e.kind == 'llm_response']
        self.assertTrue(any("BLM" in t for t in texts))

    async def _collect(self, state, msg):
        events = []; state.messages.append({"role":"user","content":msg})
        async for e in agent_loop(state): events.append(e)
        return events


if __name__ == "__main__":
    unittest.main()
