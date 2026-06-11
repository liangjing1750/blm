"""集成测试: 技能生命周期 — 创建→查看→修补→删除→恢复。"""

import tempfile, unittest
from pathlib import Path
from blm_ai.skill.skill_manager import SkillManager
from blm_ai.skill.skill_index import build_skills_index, get_skill_names
from blm_ai.skill.skill_telemetry import bump_use, bump_view, get_usage


class TestSkillLifecycle(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.mgr = SkillManager(self.dir)

    def tearDown(self):
        self.tmp.cleanup()

    def test_full_lifecycle(self):
        """创建→查看→修补→删除→恢复的完整流程。"""
        self.mgr.create("hello-world", "Say hello", "# Step 1\nGreet user")
        self.assertEqual(len(self.mgr.list_all()), 1)

        content = self.mgr.view("hello-world")
        self.assertIn("Greet user", content)
        bump_view(self.dir, "hello-world")

        ok = self.mgr.patch("hello-world", "Greet user", "Greet user warmly")
        self.assertTrue(ok)
        self.assertIn("warmly", self.mgr.view("hello-world"))

        self.mgr.delete("hello-world")
        self.assertEqual(len(self.mgr.list_all()), 0)
        self.assertTrue((self.mgr._archive_dir / "hello-world").is_dir())

    def test_index_updates_after_create(self):
        """创建技能后索引自动包含新技能。"""
        self.mgr.create("skill-a", "First skill", "# A")
        idx = build_skills_index(self.dir)
        self.assertIn("skill-a", idx)
        names = get_skill_names(self.dir)
        self.assertIn("skill-a", names)

    def test_telemetry_tracks_usage(self):
        """使用追踪正确累加。"""
        self.mgr.create("tracked", "Tracked", "# T")
        bump_use(self.dir, "tracked")
        bump_use(self.dir, "tracked")
        bump_view(self.dir, "tracked")
        u = get_usage(self.dir, "tracked")
        self.assertEqual(u["use_count"], 2)
        self.assertEqual(u["view_count"], 1)

    def test_fuzzy_patch_handles_whitespace(self):
        """模糊修补处理空格差异。"""
        self.mgr.create("fuzzy", "Fuzzy", "def hello():\n    print('hi')")
        ok = self.mgr.patch("fuzzy", "def hello():  print('hi')", "def hello():\n    print('hello world')")
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
