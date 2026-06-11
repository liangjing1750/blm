"""测试上下文模块 — compressor, micro_compact, token_counter, collapse, prompt_builder, engine。"""

import unittest
from pathlib import Path

from blm_ai.context.compressor import CompactionConfig, ContextCompressor
from blm_ai.context.micro_compact import SENTINEL, micro_compact
from blm_ai.context.token_counter import (
    BudgetTracker, estimate_message_tokens, estimate_tokens, estimate_total_tokens,
)
from blm_ai.context.collapse import CollapseEntry, CollapseStore, apply_collapses, collapse_span
from blm_ai.context.prompt_builder import (
    build_context_prompt, build_stable_prompt, build_volatile_prompt, assemble_system_prompt,
)
from blm_ai.context.engine import ContextEngine, NoopEngine, ThresholdEngine


class TestTokenCounter(unittest.TestCase):
    """令牌计数 — 字符→令牌估算、预算追踪。"""

    def test_estimate_tokens_latin(self):
        """拉丁文本估算 — 约 3.5 字符/令牌。"""
        t = estimate_tokens("hello world " * 100)
        self.assertGreater(t, 200)
        self.assertLess(t, 500)

    def test_estimate_message(self):
        """消息令牌估算 — 处理文本和工具块。"""
        msg = {"role": "user", "content": "test message"}
        t = estimate_message_tokens(msg)
        self.assertGreater(t, 0)

    def test_budget_tracker_continue(self):
        """预算追踪 — 未达阈值返回 continue。"""
        bt = BudgetTracker(total_budget=10000)
        result = bt.check(5000)
        self.assertEqual(result, "continue")

    def test_budget_tracker_stop(self):
        """预算追踪 — 达到 85% 返回 stop。"""
        bt = BudgetTracker(total_budget=1000)
        result = bt.check(900)
        self.assertEqual(result, "stop")

    def test_estimate_total(self):
        """全量估算 — 多条消息。"""
        msgs = [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi there"}]
        t = estimate_total_tokens(msgs)
        self.assertGreater(t, 0)


class TestMicroCompact(unittest.TestCase):
    """微压缩 — 清理旧工具结果。"""

    def test_micro_compact_clears_old(self):
        """清理旧 read_workspace 结果 — OpenAI 格式。"""
        msgs = [
            {"role": "assistant", "content": None, "tool_calls": [
                {"id": "t1", "type": "function", "function": {"name": "read_workspace", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "t1", "content": "long output" * 100},
            {"role": "assistant", "content": None, "tool_calls": [
                {"id": "t2", "type": "function", "function": {"name": "read_workspace", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "t2", "content": "long output" * 100},
            {"role": "tool", "tool_call_id": "t3", "content": "keep this"},
        ]
        result = micro_compact(msgs, keep_recent=1)
        # 检查旧工具结果被替换为 SENTINEL
        self.assertIn("[Old tool result", result[1]["content"])


class TestCollapse(unittest.TestCase):
    """上下文塌陷 — 替换旧对话。"""

    def test_collapse_span(self):
        """创建塌陷条目并应用。"""
        msgs = [
            {"role": "user", "content": "msg1"},
            {"role": "assistant", "content": "reply1"},
            {"role": "user", "content": "msg2"},
        ]
        store = CollapseStore()
        collapse_span(msgs, 0, 2, "Summary of first two messages", store)
        for e in store.entries:
            e.committed = True
        result, changed = apply_collapses(msgs, store)
        self.assertTrue(changed)
        self.assertLess(len(result), 3)

    def test_drain_uncommitted(self):
        """未提交的条目可排空。"""
        store = CollapseStore()
        store.add(CollapseEntry(0, 3, "summary", committed=False))
        uncommitted = store.drain_uncommitted()
        self.assertEqual(len(uncommitted), 1)


class TestPromptBuilder(unittest.TestCase):
    """提示组装 — 三层架构。"""

    def test_stable_prompt(self):
        """稳定层 — 含技能索引。"""
        result = build_stable_prompt("# Identity", "skills:\n- skill1: desc")
        self.assertIn("Identity", result)
        self.assertIn("skill1", result)

    def test_context_prompt(self):
        """上下文层 — 系统消息 + 项目文件。"""
        result = build_context_prompt("custom msg", [("AGENTS.md", "content")])
        self.assertIn("custom msg", result)
        self.assertIn("AGENTS.md", result)

    def test_volatile_prompt(self):
        """易变层 — 含时间戳。"""
        result = build_volatile_prompt("memory block")
        self.assertIn("memory block", result)
        self.assertIn("Session started", result)

    def test_assemble_full(self):
        """完整三层组装。"""
        result = assemble_system_prompt("Identity", "skills", "sys msg", None, "mem")
        self.assertIn("Identity", result)
        self.assertIn("skills", result)
        self.assertIn("sys msg", result)
        self.assertIn("mem", result)


class TestEngines(unittest.TestCase):
    """上下文引擎 — Noop 和 Threshold。"""

    def test_noop_never_compresses(self):
        """Noop 引擎永不压缩。"""
        engine = NoopEngine()
        self.assertFalse(engine.should_compress())

    def test_noop_returns_unchanged(self):
        """Noop 压缩返回未修改。"""
        engine = NoopEngine()
        msgs = [{"role": "user", "content": "test"}]
        self.assertEqual(engine.compress(msgs), msgs)

    def test_threshold_engine(self):
        """基于阈值的引擎 — 委托给压缩器。"""
        from blm_ai.context.compressor import ContextCompressor

        async def noop(msg): return "summary"
        comp = ContextCompressor(noop, context_length=10000)
        engine = ThresholdEngine(comp, context_length=10000)
        engine.update_from_response({"usage": {"input_tokens": 9000, "output_tokens": 100}})
        self.assertTrue(engine.should_compress())


class TestCompressor(unittest.TestCase):
    """全压缩器 — 三比率判断和令牌校准。"""

    async def test_should_compact_no(self):
        """未达阈值不压缩。"""
        async def fn(msg): return "summary"
        comp = ContextCompressor(fn, context_length=100000)
        self.assertEqual(comp.should_compact(20000), "no")

    async def test_should_compact_force(self):
        """超过 force 阈值强制压缩。"""
        async def fn(msg): return "summary"
        comp = ContextCompressor(fn, context_length=100000)
        self.assertEqual(comp.should_compact(95000), "force")

    async def test_calibrate_ratio(self):
        """校准字符/令牌比。"""
        async def fn(msg): return "summary"
        comp = ContextCompressor(fn)
        comp.calibrate_ratio(100, 350)
        self.assertGreater(comp._char_ratio, 0)


if __name__ == "__main__":
    unittest.main()
