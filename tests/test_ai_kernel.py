"""Tests for blm_ai kernel — event stream, tool system, permissions."""

import unittest
from pathlib import Path

from blm_ai.kernel.event_stream import (
    AgentEvent, EventSink, LLMResponse, ToolDispatch, ToolResult,
    TurnStarted, TurnDone, Error,
)
from blm_ai.kernel.permission import (
    PermissionGate, PermissionMode, PermissionPipeline, PermissionRule, PermissionPolicy,
)
from blm_ai.kernel.tool import Tool, ToolContext, ToolRegistry, ValidationResult
from blm_ai.kernel.retry import classify_error, ErrorCategory, RetryConfig, retry_with_backoff
from blm_ai.kernel.sandbox import classify_bash, is_bash_readonly
from blm_ai.kernel.hook import HookManager
from blm_ai.config import Config, load_config


class TestToolRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = ToolRegistry()

    def test_register_and_get(self):
        class T(Tool):
            name = "test"
            description = "desc"
            async def execute(self, args, ctx): return "ok"
        self.registry.register(T())
        self.assertIn("test", self.registry)
        self.assertEqual(len(self.registry), 1)

    def test_list_definitions(self):
        class T(Tool):
            name = "bash"
            description = "Run command"
            parameters = {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            }
            async def execute(self, args, ctx): return f"ran: {args['command']}"
        self.registry.register(T())
        defs = self.registry.list_definitions()
        self.assertEqual(len(defs), 1)
        self.assertEqual(defs[0]["function"]["name"], "bash")

    def test_partition(self):
        class ReadTool(Tool):
            name = "read"; read_only = True; concurrency_safe = True
            async def execute(self, args, ctx): return ""
        class WriteTool(Tool):
            name = "write"; read_only = False; concurrency_safe = False
            async def execute(self, args, ctx): return ""

        self.registry.register(ReadTool())
        self.registry.register(WriteTool())

        calls = [
            {"name": "read", "id": "1", "input": {}},
            {"name": "read", "id": "2", "input": {}},
            {"name": "write", "id": "3", "input": {}},
        ]
        batches = self.registry.partition(calls)
        # First two reads should be in one batch, write in another
        self.assertEqual(len(batches), 2)
        self.assertEqual(len(batches[0]), 2)


class TestPermissionPipeline(unittest.TestCase):
    def test_deny_builtin_patterns(self):
        pp = PermissionPipeline(interactive=False)
        result = pp.check("bash", {"command": "sudo rm -rf /tmp"}, is_read_only=False)
        self.assertEqual(result, PermissionGate.DENY)

    def test_allow_safe(self):
        pp = PermissionPipeline(interactive=False)
        result = pp.check("bash", {"command": "ls -la"}, is_read_only=True)
        self.assertEqual(result, PermissionGate.ALLOW)

    def test_plan_mode_blocks_writes(self):
        pp = PermissionPipeline(plan_mode=True, interactive=False)
        result = pp.check("write", {"path": "x"}, is_read_only=False)
        self.assertEqual(result, PermissionGate.DENY)

    def test_policy_rules(self):
        policy = PermissionPolicy(
            deny_rules=[PermissionRule(tool_pattern="danger_tool", behavior=PermissionGate.DENY)],
        )
        pp = PermissionPipeline(policy=policy, interactive=False)
        result = pp.check("danger_tool", {}, is_read_only=False)
        self.assertEqual(result, PermissionGate.DENY)

    def test_interactive_asks(self):
        pp = PermissionPipeline(interactive=True)
        result = pp.check("bash", {"command": "ls -la"}, is_read_only=False)
        self.assertEqual(result, PermissionGate.ASK)


class TestEventSink(unittest.TestCase):
    def test_emit_and_handle(self):
        events = []
        sink = EventSink()
        sink.on(lambda e: events.append(e))
        sink.emit(TurnStarted(turn=1))
        sink.emit(TurnDone(turn=1))
        self.assertEqual(len(events), 2)

    def test_remove_handler(self):
        events = []
        sink = EventSink()
        off = sink.on(lambda e: events.append(e))
        sink.emit(TurnStarted(turn=1))
        off()
        sink.emit(TurnStarted(turn=2))
        self.assertEqual(len(events), 1)


class TestRetry(unittest.IsolatedAsyncioTestCase):
    async def test_classify_transient(self):
        self.assertEqual(classify_error(TimeoutError("timeout")), ErrorCategory.TRANSIENT)

    async def test_classify_fatal(self):
        self.assertEqual(classify_error(Exception("authentication failed")), ErrorCategory.FATAL)

    async def test_retry_succeeds(self):
        calls = []
        async def fn():
            calls.append(1)
            if len(calls) < 2:
                raise TimeoutError("connection timeout")
            return "ok"
        result = await retry_with_backoff(fn, RetryConfig(base_delay=0.01))
        self.assertEqual(result, "ok")
        self.assertEqual(len(calls), 2)


class TestSandbox(unittest.TestCase):
    def test_readonly_commands(self):
        self.assertTrue(is_bash_readonly("ls -la"))
        self.assertTrue(is_bash_readonly("cat file.txt"))
        self.assertTrue(is_bash_readonly("grep pattern file"))

    def test_dangerous_commands(self):
        r = classify_bash("rm -rf /tmp")
        self.assertTrue(r.is_dangerous)
        self.assertFalse(r.is_readonly)


class TestConfig(unittest.TestCase):
    def test_load_config_defaults(self):
        config = load_config(Path.cwd())
        self.assertIsNotNone(config.model_id)
        self.assertEqual(config.max_turns, 30)

    def test_config_dataclass(self):
        config = Config(
            provider_kind="openai",
            base_url="https://test.com",
            api_key="sk-test",
            model_id="test-model",
        )
        self.assertEqual(config.provider_kind, "openai")


if __name__ == "__main__":
    unittest.main()
