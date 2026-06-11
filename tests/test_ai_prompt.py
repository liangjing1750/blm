"""测试 8 层系统提示词组装器 — prompt/composer.py。"""

import tempfile
import unittest
from pathlib import Path

from blm_ai.prompt.composer import (
    assemble, layer_identity, layer_soul, layer_tool_guide,
    layer_skills, layer_memory, layer_bootstrap,
    layer_runtime, layer_channel,
)


class TestPromptComposer(unittest.TestCase):
    """8 层提示词组装 — 文件即提示词。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.blm_dir = Path(self.tmp.name)
        self.skills_dir = self.blm_dir / "skills"
        self.skills_dir.mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_assemble_all_defaults(self):
        """全默认 — 8 层全部使用回退内容。"""
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        self.assertIn("Identity", prompt)
        self.assertIn("BLM Agent", prompt)
        self.assertIn("Tool Usage", prompt)
        self.assertIn("Runtime", prompt)
        self.assertIn("Channel", prompt)

    def test_custom_soul(self):
        """自定义 SOUL.md — 文件内容注入提示词。"""
        (self.blm_dir / "SOUL.md").write_text("# My Custom Bot\nBe helpful.", "utf-8")
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        self.assertIn("My Custom Bot", prompt)

    def test_custom_identity(self):
        """自定义 IDENTITY.md。"""
        (self.blm_dir / "IDENTITY.md").write_text("I am TestBot.", "utf-8")
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        self.assertIn("TestBot", prompt)

    def test_custom_tool_guide(self):
        """自定义 TOOLS.md。"""
        (self.blm_dir / "TOOLS.md").write_text("Use bash carefully.", "utf-8")
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        self.assertIn("bash carefully", prompt)

    def test_memory_injection(self):
        """MEMORY.md 内容注入。"""
        (self.blm_dir / "MEMORY.md").write_text("Project: BLM\nTeam: 3 members", "utf-8")
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        self.assertIn("Project: BLM", prompt)

    def test_bootstrap_injection(self):
        """BOOTSTRAP.md 内容注入。"""
        (self.blm_dir / "BOOTSTRAP.md").write_text("## Project Setup\nRun blm.py", "utf-8")
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        self.assertIn("Project Setup", prompt)

    def test_skill_index_injection(self):
        """技能索引注入 — 来自 SKILL.md 文件。"""
        skill_dir = self.skills_dir / "test-skill"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_text(
            "---\nname: test-skill\ndescription: A test skill\n---\n\n# Test\nDo something.",
            "utf-8",
        )
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        self.assertIn("test-skill", prompt)

    def test_runtime_context(self):
        """运行时层 — 模型 + 时间。"""
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir,
                          model_id="test-model", channel="web")
        self.assertIn("test-model", prompt)
        self.assertIn("web", prompt.lower())

    def test_channel_hints(self):
        """通道提示 — CLI/Web/API。"""
        cli = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir, channel="cli")
        self.assertIn("CLI", cli)
        web = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir, channel="web")
        self.assertIn("Web", web)

    def test_layer_order(self):
        """层序正确 — L1 在 L2 之前。"""
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        id_pos = prompt.find("Identity")
        soul_pos = prompt.find("Personality")
        tools_pos = prompt.find("Tool Usage")
        runtime_pos = prompt.find("Runtime")
        self.assertLess(id_pos, soul_pos)
        self.assertLess(soul_pos, tools_pos)
        self.assertLess(tools_pos, runtime_pos)

    def test_truncation(self):
        """超长内容截断 — 不超过 MAX_TOTAL_CHARS。"""
        big = (self.blm_dir / "BOOTSTRAP.md")
        big.write_text("x" * 2000, "utf-8")
        prompt = assemble(blm_dir=self.blm_dir, skills_dir=self.skills_dir)
        self.assertLess(len(prompt), 160_000)


if __name__ == "__main__":
    unittest.main()
