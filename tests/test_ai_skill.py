"""测试技能模块 — manager, index, telemetry, curator, guard, bundle。"""

import tempfile
import unittest
from pathlib import Path

from blm_ai.skill.skill_manager import SKILL_FILE, SkillError, SkillManager
from blm_ai.skill.skill_index import build_skills_index, get_skill_names
from blm_ai.skill.skill_telemetry import bump_use, bump_view, bump_patch, get_usage
from blm_ai.skill.curator import run_curator, pin_skill, unpin_skill
from blm_ai.skill.guard import TrustLevel, scan_skill, is_safe_to_install
from blm_ai.skill.bundle import SkillBundle, load_bundles, save_bundle


class TestSkillManager(unittest.TestCase):
    """技能 CRUD — 创建、查看、修补、删除。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.mgr = SkillManager(self.dir)

    def tearDown(self):
        self.tmp.cleanup()

    def test_create_and_view(self):
        """创建技能并查看。"""
        self.mgr.create("hello-world", "Say hello", "# Step 1\nGreet the user")
        skills = self.mgr.list_all()
        self.assertEqual(len(skills), 1)
        self.assertEqual(skills[0]["name"], "hello-world")
        content = self.mgr.view("hello-world")
        self.assertIn("# Step 1", content)

    def test_patch_exact(self):
        """精确修补。"""
        self.mgr.create("patch-me", "Test", "# Old content")
        ok = self.mgr.patch("patch-me", "# Old content", "# New content")
        self.assertTrue(ok)
        self.assertIn("# New content", self.mgr.view("patch-me"))

    def test_patch_fuzzy(self):
        """模糊修补 — 正态化空格。"""
        self.mgr.create("fuzzy", "Test", "def hello():\n    print('hi')")
        ok = self.mgr.patch("fuzzy", "def hello():  print('hi')", "def hello():\n    print('hello')")
        # 模糊匹配应能处理空格差异
        self.assertTrue(ok)

    def test_delete_archive(self):
        """删除（归档）。"""
        self.mgr.create("del-me", "Test", "content")
        self.mgr.delete("del-me")
        self.assertEqual(len(self.mgr.list_all()), 0)
        self.assertTrue((self.mgr._archive_dir / "del-me").is_dir())

    def test_name_sanitization(self):
        """名称清理 — 空格和特殊字符自动清洗。"""
        self.mgr.create("Hello World!", "Test", "content")
        skills = self.mgr.list_all()
        self.assertEqual(skills[0]["name"], "hello-world")

    def test_empty_name_rejected(self):
        """空名称被拒绝。"""
        with self.assertRaises(SkillError):
            self.mgr.create("!!!", "Test", "body")


class TestSkillIndex(unittest.TestCase):
    """技能索引 — 扫描和提示注入。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_empty_index(self):
        """空目录返回空字符串。"""
        idx = build_skills_index(self.dir)
        self.assertEqual(idx, "")

    def test_index_with_skills(self):
        """有技能的目录生成索引。"""
        mgr = SkillManager(self.dir)
        mgr.create("skill-a", "First skill", "# A")
        mgr.create("skill-b", "Second skill", "# B", )
        idx = build_skills_index(self.dir)
        self.assertIn("skill-a", idx)
        self.assertIn("skill-b", idx)
        self.assertIn("skill_view", idx.lower())
        names = get_skill_names(self.dir)
        self.assertEqual(len(names), 2)


class TestTelemetry(unittest.TestCase):
    """技能遥测 — 使用追踪。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_bump_use(self):
        """增加使用计数。"""
        bump_use(self.dir, "skill-x")
        bump_use(self.dir, "skill-x")
        usage = get_usage(self.dir, "skill-x")
        self.assertEqual(usage["use_count"], 2)

    def test_bump_view(self):
        """增加查看计数。"""
        bump_view(self.dir, "skill-y")
        usage = get_usage(self.dir, "skill-y")
        self.assertEqual(usage["view_count"], 1)

    def test_bump_patch(self):
        """增加修补计数。"""
        bump_patch(self.dir, "skill-z")
        bump_patch(self.dir, "skill-z")
        usage = get_usage(self.dir, "skill-z")
        self.assertEqual(usage["patch_count"], 2)


class TestCurator(unittest.TestCase):
    """技能策展 — 自动生命周期。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_dry_run_no_skills(self):
        """空目录 dry_run 无操作。"""
        report = run_curator(self.dir, dry_run=True)
        self.assertEqual(len(report["archived"]), 0)

    def test_pin_skill(self):
        """钉住技能防止归档。"""
        mgr = SkillManager(self.dir)
        mgr.create("pinned", "Test", "content")
        self.assertTrue(pin_skill(self.dir, "pinned"))
        usage = get_usage(self.dir, "pinned")
        self.assertTrue(usage.get("pinned"))


class TestBundle(unittest.TestCase):
    """技能包 — 分组加载。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def test_save_and_load(self):
        """保存和加载 bundle。"""
        bundle = SkillBundle("docs", "Document bundle", ["export-docx", "import-doc"])
        save_bundle(self.dir, bundle)
        bundles = load_bundles(self.dir)
        self.assertIn("docs", bundles)
        self.assertEqual(bundles["docs"].skills, ["export-docx", "import-doc"])


if __name__ == "__main__":
    unittest.main()
