"""集成测试: 上下文压缩 — 4层流水线端到端。"""

import tempfile, unittest
from pathlib import Path
from blm_ai.context.compressor import CompactionConfig, ContextCompressor
from blm_ai.context.micro_compact import micro_compact
from blm_ai.context.snip_compact import snip_compact
from blm_ai.context.budget_compact import budget_compact
from blm_ai.context.token_counter import estimate_tokens, estimate_total_tokens


class TestCompactionPipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    async def _noop(self, msg): return "compacted summary"

    def test_snip_compact_trims_short_messages(self):
        """L1: 修剪过渡短消息。"""
        msgs = [
            {"role":"user","content":"分析工作区"},
            {"role":"assistant","content":"ok"},  # 短消息，应被修剪
            {"role":"assistant","content":"Let me check the structure of this workspace carefully before giving a proper answer"},
            {"role":"user","content":"继续"},
        ]
        result = snip_compact(msgs, keep_head=1, keep_tail=2, min_content_length=30)
        self.assertLess(len(result), len(msgs))

    def test_micro_compact_clears_old_results(self):
        """L2: 清理旧工具结果 — OpenAI 格式。"""
        msgs = [
            {"role":"assistant","content":None,"tool_calls":[
                {"id":"t1","type":"function","function":{"name":"read_workspace","arguments":"{}"}}]},
            {"role":"tool","tool_call_id":"t1","content":"old data"*100},
        ]
        result = micro_compact(msgs, keep_recent=0)
        self.assertIn("cleared", result[1]["content"])

    def test_budget_compact_persists_large(self):
        """L3: 大结果持久化到磁盘。"""
        msgs = [
            {"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"x"*3000}]},
        ]
        result = budget_compact(msgs, self.dir, max_bytes_per_result=2000)
        content = result[0]["content"][0]["content"]
        self.assertIn("persisted", content)

    def test_compressor_should_compact(self):
        """压缩器三比率判断。"""
        async def fn(msg): return "summary"
        comp = ContextCompressor(fn, context_length=100000)
        self.assertEqual(comp.should_compact(30000), "no")
        self.assertEqual(comp.should_compact(85000), "compact")
        self.assertEqual(comp.should_compact(95000), "force")

    def test_token_estimation(self):
        """令牌估算函数。"""
        msgs = [{"role":"user","content":"hello world"}, {"role":"assistant","content":"hi there"}]
        t = estimate_total_tokens(msgs)
        self.assertGreater(t, 0)
        self.assertLess(t, 50)


if __name__ == "__main__":
    unittest.main()
