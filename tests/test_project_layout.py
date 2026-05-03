import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class ProjectLayoutTests(unittest.TestCase):
    def test_desktop_host_directory_is_absent(self):
        self.assertFalse((ROOT / "apps" / "desktop").exists())

    def test_root_directory_stays_free_of_node_test_entry_files(self):
        self.assertFalse((ROOT / "package.json").exists())
        self.assertFalse((ROOT / "package-lock.json").exists())
        self.assertFalse((ROOT / "playwright.config.js").exists())

    def test_e2e_tooling_lives_under_tools_directory(self):
        tool_dir = ROOT / "tools" / "e2e"
        self.assertTrue((tool_dir / "package.json").exists())
        self.assertTrue((tool_dir / "package-lock.json").exists())
        self.assertTrue((tool_dir / "playwright.config.js").exists())
        self.assertTrue((tool_dir / "playwright.demo.config.js").exists())
        self.assertTrue((tool_dir / "tests" / "new-document.spec.js").exists())
        self.assertTrue((tool_dir / "tests" / "support" / "test-env.js").exists())

    def test_e2e_package_uses_dedicated_script(self):
        package_data = json.loads((ROOT / "tools" / "e2e" / "package.json").read_text("utf-8"))
        self.assertEqual(package_data["name"], "blm-e2e")
        self.assertIn("test:e2e", package_data["scripts"])
        self.assertIn("test:e2e:demo", package_data["scripts"])
        self.assertIn("install:browser", package_data["scripts"])


if __name__ == "__main__":
    unittest.main()
