import os
import unittest
from pathlib import Path
from unittest.mock import patch

import blm


class RuntimeConfigTests(unittest.TestCase):
    def test_defaults_match_project_layout(self):
        with patch.dict(os.environ, {}, clear=True):
            config = blm.build_runtime_config()

        self.assertEqual(config.port, 8081)
        self.assertTrue(config.open_browser)
        self.assertEqual(config.app_dir, blm.ROOT / "app")
        self.assertEqual(config.workspace_dir, blm.ROOT / "workspace")

    def test_reads_port_workspace_and_browser_flags_from_environment(self):
        with patch.dict(
            os.environ,
            {
                "BLM_PORT": "8899",
                "BLM_NO_BROWSER": "1",
                "BLM_WORKSPACE_DIR": "tmp-test-workspace",
            },
            clear=True,
        ):
            config = blm.build_runtime_config()

        self.assertEqual(config.port, 8899)
        self.assertFalse(config.open_browser)
        self.assertEqual(config.workspace_dir, blm.ROOT / "tmp-test-workspace")

    def test_keeps_absolute_workspace_path(self):
        absolute_path = Path("C:/tmp/blm-e2e-workspace")
        with patch.dict(
            os.environ,
            {
                "BLM_WORKSPACE_DIR": str(absolute_path),
            },
            clear=True,
        ):
            config = blm.build_runtime_config()

        self.assertEqual(config.workspace_dir, absolute_path)

    def test_rejects_invalid_port(self):
        with patch.dict(os.environ, {"BLM_PORT": "abc"}, clear=True):
            with self.assertRaisesRegex(ValueError, "BLM_PORT 必须是整数"):
                blm.build_runtime_config()


if __name__ == "__main__":
    unittest.main()
