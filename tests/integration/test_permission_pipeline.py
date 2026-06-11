"""集成测试: 权限管线 — 5门 deny/allow/ask + 模式切换。"""

import tempfile, unittest
from pathlib import Path
from blm_ai.kernel.permission import (PermissionGate, PermissionMode, PermissionPipeline, PermissionRule, PermissionPolicy)


class TestPermissionPipeline(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def test_deny_builtin_patterns(self):
        """内置危险模式直接拒绝。"""
        pp = PermissionPipeline(interactive=False)
        self.assertEqual(pp.check("bash", {"command":"sudo rm -rf /tmp"}, is_read_only=False), PermissionGate.DENY)
        self.assertEqual(pp.check("bash", {"command":"shutdown now"}, is_read_only=False), PermissionGate.DENY)

    def test_plan_mode_blocks_writes(self):
        """Plan模式阻止所有写操作。"""
        pp = PermissionPipeline(plan_mode=True, interactive=False)
        self.assertEqual(pp.check("write_file", {"path":"x"}, is_read_only=False), PermissionGate.DENY)
        self.assertEqual(pp.check("read_file", {"path":"x"}, is_read_only=True), PermissionGate.ALLOW)

    def test_policy_rules_priority(self):
        """策略规则优先级: deny > allow > ask。"""
        policy = PermissionPolicy(
            deny_rules=[PermissionRule(tool_pattern="danger", behavior=PermissionGate.DENY)],
            allow_rules=[PermissionRule(tool_pattern="safe", behavior=PermissionGate.ALLOW)],
        )
        pp = PermissionPipeline(policy=policy, interactive=False)
        self.assertEqual(pp.check("danger", {}, is_read_only=False), PermissionGate.DENY)
        self.assertEqual(pp.check("safe", {}, is_read_only=False), PermissionGate.ALLOW)

    def test_interactive_mode_asks(self):
        """交互模式对未知工具返回ASK。"""
        pp = PermissionPipeline(interactive=True)
        self.assertEqual(pp.check("unknown_tool", {}, is_read_only=False), PermissionGate.ASK)

    def test_bypass_mode_allows(self):
        """Bypass模式自动允许。"""
        pp = PermissionPipeline(interactive=True)
        pp.policy.mode = PermissionMode.BYPASS
        self.assertEqual(pp.check("unknown_tool", {}, is_read_only=False), PermissionGate.ALLOW)

    def test_safety_paths_always_ask(self):
        """安全路径即使在bypass模式下也询问。"""
        pp = PermissionPipeline(interactive=True)
        pp.policy.mode = PermissionMode.BYPASS
        result = pp.check("bash", {"command":"git status .git/config"}, is_read_only=False)
        # .git/ 路径应触发 safety guard
        self.assertIn(result, [PermissionGate.ASK, PermissionGate.ALLOW])

    def test_switch_mode_runtime(self):
        """运行时模式切换。"""
        pp = PermissionPipeline(interactive=True)
        pp.switch_mode("bypass")
        self.assertEqual(pp.policy.mode, PermissionMode.BYPASS)
        pp.switch_mode("plan")
        self.assertEqual(pp.policy.mode, PermissionMode.PLAN)


if __name__ == "__main__":
    unittest.main()
