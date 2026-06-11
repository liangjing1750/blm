"""集成测试: 错误恢复 — max_tokens升级、退避、分类、fallback。"""

import unittest
from blm_ai.kernel.retry import (
    ErrorCategory, RetryConfig, classify_error,
    escalate_max_tokens, make_continuation_prompt, FallbackTracker, FallbackConfig,
)


class TestErrorRecovery(unittest.TestCase):
    def test_classify_transient(self):
        self.assertEqual(classify_error(TimeoutError("connection timeout")), ErrorCategory.TRANSIENT)

    def test_classify_overloaded(self):
        self.assertEqual(classify_error(Exception("429 rate limit")), ErrorCategory.OVERLOADED)
        self.assertEqual(classify_error(Exception("503 service unavailable")), ErrorCategory.OVERLOADED)

    def test_classify_context_overflow(self):
        self.assertEqual(classify_error(Exception("prompt too long, reduce the length")), ErrorCategory.CONTEXT_OVERFLOW)

    def test_classify_max_tokens(self):
        self.assertEqual(classify_error(Exception("max_tokens exceeded")), ErrorCategory.MAX_TOKENS)

    def test_classify_fatal(self):
        self.assertEqual(classify_error(Exception("authentication failed")), ErrorCategory.FATAL)
        self.assertEqual(classify_error(Exception("401 unauthorized")), ErrorCategory.FATAL)

    def test_escalate_max_tokens(self):
        self.assertEqual(escalate_max_tokens(4000), 8000)
        self.assertEqual(escalate_max_tokens(8000), 16000)
        self.assertEqual(escalate_max_tokens(16000), 32000)
        self.assertEqual(escalate_max_tokens(64000), None)  # 已达上限

    def test_continuation_prompt(self):
        p = make_continuation_prompt(0)
        self.assertIn("truncated", p)
        self.assertIn("1/3", p)
        p3 = make_continuation_prompt(3)
        self.assertIn("final", p3.lower())

    def test_fallback_tracker(self):
        ft = FallbackTracker(FallbackConfig(consecutive_overloaded_threshold=2))
        self.assertFalse(ft.record_overloaded())  # 1次
        self.assertTrue(ft.record_overloaded())   # 2次触发
        self.assertTrue(ft.should_use_fallback())
        ft.record_success()
        self.assertFalse(ft.should_use_fallback())  # 成功后重置


if __name__ == "__main__":
    unittest.main()
