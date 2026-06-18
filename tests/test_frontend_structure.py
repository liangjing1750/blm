import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
ANGULAR_DIR = ROOT / "frontend-angular"
ANGULAR_APP_DIR = ANGULAR_DIR / "src" / "app"

REMOVED_LEGACY_DIRS = [
    ANGULAR_APP_DIR / "legacy-runtime",
    ANGULAR_APP_DIR / "core" / "legacy",
    ANGULAR_DIR / "public" / "legacy-runtime",
    APP_DIR / "legacy-runtime",
]

REMOVED_STATIC_FILES = [
    "state.js",
    "api.js",
    "collab.js",
    "domain.js",
    "process.js",
    "entity.js",
    "render.js",
    "app.js",
    "preview.js",
    "manual.js",
    "ai.js",
    "ai_api.js",
    "style.css",
    "ai.css",
]

FORBIDDEN_SOURCE_PATTERNS = [
    "window.App",
    "window.S",
    "LegacyBridge",
    "AngularLegacyMounts",
    "BlmAngularMounts",
    "loadLegacyRuntime",
    "runAppCommand",
    "runGlobalCommand",
    "legacy-runtime",
]


class FrontendStructureTests(unittest.TestCase):
    def test_angular_workspace_exists_with_required_dependencies(self):
        package_json = json.loads((ANGULAR_DIR / "package.json").read_text("utf-8"))

        self.assertTrue((ANGULAR_DIR / "angular.json").exists())
        self.assertTrue((ANGULAR_DIR / "tsconfig.json").exists())
        self.assertIn("@angular/core", package_json["dependencies"])
        self.assertIn("@angular/router", package_json["dependencies"])
        self.assertIn("@angular/forms", package_json["dependencies"])
        self.assertIn("typescript", package_json["devDependencies"])
        self.assertIn("vitest", package_json["devDependencies"])

    def test_built_app_no_longer_contains_old_static_sources(self):
        for legacy_file in REMOVED_STATIC_FILES:
            self.assertFalse((APP_DIR / legacy_file).exists(), f"{legacy_file} should not remain in app/")

        self.assertFalse((APP_DIR / "workbenches").exists())
        self.assertFalse((APP_DIR / "core").exists())
        self.assertFalse((APP_DIR / "shared").exists())
        self.assertTrue((APP_DIR / "index.html").exists())
        self.assertTrue(any(APP_DIR.glob("main-*.js")))

    def test_legacy_runtime_directories_are_removed(self):
        for path in REMOVED_LEGACY_DIRS:
            self.assertFalse(path.exists(), f"{path} should be removed")

    def test_built_index_loads_only_angular_bundles(self):
        html = (APP_DIR / "index.html").read_text("utf-8")

        self.assertIn("<app-root></app-root>", html)
        self.assertRegex(html, r'src="main-[A-Z0-9]+\.js"')
        self.assertNotIn("state.js", html)
        self.assertNotIn("render.js", html)
        self.assertNotIn("domain.js", html)
        self.assertNotIn("process.js", html)
        self.assertNotIn("entity.js", html)
        self.assertNotIn("vendor/mermaid", html)
        self.assertNotIn("cdn.jsdelivr.net", html)
        self.assertNotIn("legacy-runtime", html)

    def test_angular_shell_owns_core_runtime_without_old_globals(self):
        shell_ts = ANGULAR_APP_DIR / "legacy-shell" / "legacy-shell.component.ts"
        shell_html = ANGULAR_APP_DIR / "legacy-shell" / "legacy-shell.component.html"
        shell_scss = ANGULAR_APP_DIR / "legacy-shell" / "legacy-shell.component.scss"
        shell_query = ANGULAR_APP_DIR / "core" / "shell" / "layout" / "shell-layout-query.ts"

        self.assertTrue(shell_ts.exists())
        self.assertTrue(shell_html.exists())
        self.assertTrue(shell_scss.exists())
        self.assertTrue(shell_query.exists())

        ts_text = shell_ts.read_text("utf-8")
        html_text = shell_html.read_text("utf-8")
        query_text = shell_query.read_text("utf-8")

        self.assertIn("ApiService", ts_text)
        self.assertIn("DocumentStore", ts_text)
        self.assertIn("SyncService", ts_text)
        self.assertIn("syncNow()", ts_text)
        self.assertIn("app-sidebar-directory", html_text)
        self.assertIn("app-process-workbench-shell", html_text)
        self.assertIn("app-component-workbench-shell", html_text)
        self.assertIn("ShellLayoutQuery", ts_text)
        self.assertIn("*ngIf=\"layoutQuery.showWorkbenchTabs()\"", html_text)
        self.assertIn("*ngIf=\"layoutQuery.showBackAction()\"", html_text)
        self.assertIn("showWorkbenchTabs(): boolean", query_text)
        self.assertIn("showBackAction(): boolean", query_text)
        self.assertNotIn("protected readonly hasDocument", ts_text)

        for forbidden in FORBIDDEN_SOURCE_PATTERNS:
            self.assertNotIn(forbidden, ts_text)
            self.assertNotIn(forbidden, html_text)

    def test_core_runtime_and_sync_services_exist(self):
        runtime_file = ANGULAR_APP_DIR / "core" / "runtime" / "angular-runtime.ts"
        api_file = ANGULAR_APP_DIR / "core" / "api" / "api.service.ts"
        sync_file = ANGULAR_APP_DIR / "core" / "sync" / "sync.service.ts"
        store_file = ANGULAR_APP_DIR / "core" / "document" / "document-store.ts"

        for path in [runtime_file, api_file, sync_file, store_file]:
            self.assertTrue(path.exists(), f"{path} should exist")

        self.assertIn("getAngularRuntimeState", runtime_file.read_text("utf-8"))
        self.assertIn("collabSnapshot", api_file.read_text("utf-8"))
        self.assertIn("/api/collab/snapshot", api_file.read_text("utf-8"))
        self.assertIn("DocumentStore", sync_file.read_text("utf-8"))
        self.assertIn("markModified", store_file.read_text("utf-8"))

    def test_source_code_does_not_call_old_frontend_runtime(self):
        checked_extensions = {".ts", ".html", ".scss"}
        offenders: list[str] = []

        for path in ANGULAR_APP_DIR.rglob("*"):
            if not path.is_file() or path.suffix not in checked_extensions:
                continue
            text = path.read_text("utf-8")
            for forbidden in FORBIDDEN_SOURCE_PATTERNS:
                if forbidden in text:
                    offenders.append(f"{path.relative_to(ROOT)} contains {forbidden}")

        self.assertEqual([], offenders)

    def test_new_angular_templates_do_not_use_inline_dom_code(self):
        offenders: list[str] = []
        for path in ANGULAR_APP_DIR.rglob("*.html"):
            text = path.read_text("utf-8")
            if re.search(r"\sonclick\s*=", text, re.IGNORECASE):
                offenders.append(f"{path.relative_to(ROOT)} contains onclick=")
            if "innerHTML" in text and path.name != "process-editor-workbench.component.html":
                offenders.append(f"{path.relative_to(ROOT)} contains innerHTML")

        self.assertEqual([], offenders)


if __name__ == "__main__":
    unittest.main()
