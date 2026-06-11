"""集成测试: 协议对齐 — SSE WireEvent 格式、事件类型、前后端映射。"""

import json, unittest
from blm_ai.kernel.event_stream import (
    AgentComplete, Error, LLMResponse, ToolDispatch, ToolResult,
    TurnStarted, TurnDone, Usage,
)

# 模拟 server.py 的 _to_wire 转换逻辑
def _to_wire(event):
    kind = getattr(event, 'kind', '')
    if kind == 'llm_response': return {'kind':'llm_response','text':event.text,'tool_blocks':event.tool_blocks}
    if kind == 'tool_dispatch': return {'kind':'tool_dispatch','tool_id':event.tool_id,'tool_name':event.tool_name,'args':event.args,'read_only':event.read_only}
    if kind == 'tool_result': return {'kind':'tool_result','tool_id':event.tool_id,'tool_name':event.tool_name,'output':event.output,'is_error':event.is_error}
    if kind == 'error': return {'kind':'error','error':event.error,'recoverable':event.recoverable}
    if kind == 'agent_complete': return {'done':True}
    if kind == 'turn_started': return {'kind':'turn_started','turn':event.turn}
    if kind == 'turn_done': return {'kind':'turn_done','turn':event.turn}
    if kind == 'usage': return {'kind':'usage','prompt_tokens':event.prompt_tokens,'completion_tokens':event.completion_tokens,'total_tokens':event.total_tokens}
    return None


class TestProtocolAlignment(unittest.TestCase):
    def test_llm_response_to_wire(self):
        w = _to_wire(LLMResponse(text="Hello", tool_blocks=[{"id":"t1","name":"read","input":{}}]))
        self.assertEqual(w["kind"], "llm_response")
        self.assertIn("tool_blocks", w)

    def test_tool_dispatch_to_wire(self):
        w = _to_wire(ToolDispatch(tool_id="t1", tool_name="bash", args={"cmd":"ls"}, read_only=True))
        self.assertEqual(w["kind"], "tool_dispatch")
        self.assertTrue(w["read_only"])

    def test_tool_result_to_wire(self):
        w = _to_wire(ToolResult(tool_id="t1", tool_name="bash", output="ok", is_error=False))
        self.assertEqual(w["kind"], "tool_result")
        self.assertFalse(w["is_error"])

    def test_error_to_wire(self):
        w = _to_wire(Error(error="timeout", recoverable=True))
        self.assertEqual(w["kind"], "error")
        self.assertTrue(w["recoverable"])

    def test_agent_complete_to_wire(self):
        w = _to_wire(AgentComplete(reason="done"))
        self.assertTrue(w["done"])

    def test_turn_events_to_wire(self):
        w1 = _to_wire(TurnStarted(turn=0))
        self.assertEqual(w1["kind"], "turn_started")
        w2 = _to_wire(TurnDone(turn=1))
        self.assertEqual(w2["turn"], 1)

    def test_usage_to_wire(self):
        w = _to_wire(Usage(prompt_tokens=100, completion_tokens=50, total_tokens=150))
        self.assertEqual(w["kind"], "usage")
        self.assertEqual(w["total_tokens"], 150)

    def test_all_events_serializable(self):
        """所有事件都能 JSON 序列化。"""
        events = [
            TurnStarted(turn=0), TurnDone(turn=1),
            LLMResponse(text="x", tool_blocks=[]),
            ToolDispatch(tool_id="t1", tool_name="bash", args={}, read_only=True),
            ToolResult(tool_id="t1", tool_name="bash", output="x", is_error=False),
            Error(error="x", recoverable=False),
            AgentComplete(reason="done"),
            Usage(prompt_tokens=10, completion_tokens=5, total_tokens=15),
        ]
        for e in events:
            w = _to_wire(e)
            s = json.dumps(w, ensure_ascii=False)
            self.assertIsInstance(s, str)
            self.assertGreater(len(s), 5)


if __name__ == "__main__":
    unittest.main()
