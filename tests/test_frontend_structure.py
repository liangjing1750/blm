import json
import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
ANGULAR_DIR = ROOT / "frontend-angular"
ANGULAR_APP_DIR = ANGULAR_DIR / "src" / "app"

WORKBENCHES = [
    "panorama",
    "process",
    "component",
    "orchestration",
    "entity",
    "knowledge",
    "role",
]

LEGACY_FRONTEND_FILES = [
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

LEGACY_RUNTIME_FILES = [
    "state.js",
    "api.js",
    "collab.js",
    "core/actions.js",
    "core/dom.js",
    "shared/document-queries.js",
    "shared/ui.js",
    "workbenches/panorama/panorama-model.js",
    "workbenches/panorama/panorama-workbench.js",
    "workbenches/role/role-workbench.js",
    "workbenches/component/component-legacy.js",
    "workbenches/component/component-workbench.js",
    "workbenches/entity/entity-legacy.js",
    "workbenches/entity/entity-workbench.js",
    "workbenches/knowledge/knowledge-workbench.js",
    "workbenches/orchestration/orchestration-workbench.js",
    "workbenches/process/process-legacy.js",
    "workbenches/process/process-workbench.js",
    "domain.js",
    "process.js",
    "entity.js",
    "render.js",
    "app.js",
    "preview.js",
    "manual.js",
    "ai_api.js",
    "ai.js",
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

    def test_old_static_frontend_sources_are_removed_from_app_output(self):
        for legacy_file in LEGACY_FRONTEND_FILES:
            self.assertFalse((APP_DIR / legacy_file).exists(), f"{legacy_file} should not remain in app/")

        self.assertFalse((APP_DIR / "workbenches").exists())
        self.assertFalse((APP_DIR / "core").exists())
        self.assertFalse((APP_DIR / "shared").exists())
        self.assertTrue((APP_DIR / "index.html").exists())
        self.assertTrue(any(APP_DIR.glob("main-*.js")))

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
        self.assertNotIn("https://cdn.jsdelivr.net", html)

    def test_legacy_shell_uses_component_template_and_scss(self):
        shell_dir = ANGULAR_APP_DIR / "legacy-shell"
        ts_file = shell_dir / "legacy-shell.component.ts"
        html_file = shell_dir / "legacy-shell.component.html"
        scss_file = shell_dir / "legacy-shell.component.scss"

        self.assertTrue(ts_file.exists())
        self.assertTrue(html_file.exists())
        self.assertTrue(scss_file.exists())

        ts_text = ts_file.read_text("utf-8")
        html_text = html_file.read_text("utf-8")
        scss_text = scss_file.read_text("utf-8")

        self.assertIn("templateUrl", ts_text)
        self.assertIn("styleUrl", ts_text)
        self.assertIn('id="toolbar"', html_text)
        self.assertIn('data-testid="toolbar-new-button"', html_text)
        self.assertIn("#toolbar", scss_text)

    def test_legacy_shell_uses_legacy_bridge_as_transition_boundary(self):
        shell_text = (ANGULAR_APP_DIR / "legacy-shell" / "legacy-shell.component.ts").read_text("utf-8")
        bridge_file = ANGULAR_APP_DIR / "core" / "legacy" / "legacy-bridge.ts"
        bridge_text = bridge_file.read_text("utf-8")

        self.assertTrue(bridge_file.exists())
        self.assertIn("LegacyBridge", shell_text)
        self.assertIn("legacyBridge.mount()", shell_text)
        self.assertNotIn("window.App", shell_text)
        self.assertNotIn("window.S", shell_text)
        self.assertIn("TRANSITION_SHELL", shell_text)
        self.assertIn("@Injectable", bridge_text)
        for method_name in [
            "mount",
            "getApp",
            "getState",
            "switchMainTab",
            "openWorkbench",
        ]:
            self.assertIn(f"{method_name}(", bridge_text)

    def test_migration_status_table_tracks_workbench_progress(self):
        status_file = ANGULAR_APP_DIR / "core" / "migration" / "workbench-migration-status.ts"
        status_text = status_file.read_text("utf-8")

        self.assertTrue(status_file.exists())
        self.assertIn("WorkbenchMigrationStatus", status_text)
        self.assertIn("legacy", status_text)
        self.assertIn("hybrid", status_text)
        self.assertIn("angular", status_text)
        for area in ["panorama", "process", "component", "orchestration", "entity", "knowledge", "role"]:
            self.assertIn(f"id: '{area}'", status_text)

    def test_panorama_workbench_value_domain_tab_mounts_angular_component(self):
        panorama_file = ANGULAR_DIR / "public" / "legacy-runtime" / "workbenches" / "panorama" / "panorama-workbench.js"
        process_file = ANGULAR_DIR / "public" / "legacy-runtime" / "workbenches" / "process" / "process-legacy.js"
        angular_mount_file = ANGULAR_APP_DIR / "core" / "legacy" / "angular-legacy-mounts.ts"
        value_domain_component = ANGULAR_APP_DIR / "workbenches" / "panorama" / "value-domain-workbench.component.ts"
        value_domain_template = ANGULAR_APP_DIR / "workbenches" / "panorama" / "value-domain-workbench.component.html"
        panorama_text = panorama_file.read_text("utf-8")
        process_text = process_file.read_text("utf-8")
        mount_text = angular_mount_file.read_text("utf-8")
        component_text = value_domain_component.read_text("utf-8")
        template_text = value_domain_template.read_text("utf-8")

        self.assertIn("{ id: 'panorama', label: '全景视图' }", panorama_text)
        self.assertIn("{ id: 'valueDomain', label: '价值流与业务域' }", panorama_text)
        self.assertIn("{ id: 'roles', label: '角色管理' }", panorama_text)
        self.assertIn("{ id: 'termManagement', label: '术语管理' }", panorama_text)
        self.assertIn("{ id: 'dictionaryManagement', label: '字典管理' }", panorama_text)
        self.assertIn("{ id: 'rules', label: '规则条目' }", panorama_text)
        self.assertNotIn("label: '角色视图'", panorama_text)
        self.assertNotIn("label: '术语字典'", panorama_text)
        self.assertNotIn("label: '统一语言'", panorama_text)
        self.assertNotIn("panorama-view-mode-view", panorama_text)
        self.assertNotIn("panorama-view-mode-edit", panorama_text)
        self.assertIn("value-domain-angular-host", panorama_text)
        self.assertIn("mountValueDomain", panorama_text)
        self.assertIn("setValueDomainEditing", panorama_text)
        self.assertIn("actionsHtml: valueDomainActions", panorama_text)
        self.assertNotIn("renderStagePanoramaLegacyView", panorama_text)
        self.assertNotIn("function renderStagePanoramaLegacyView", process_text)
        self.assertIn("BlmAngularMounts", mount_text)
        self.assertIn("setValueDomainEditing", mount_text)
        self.assertIn("ValueDomainWorkbenchComponent", mount_text)
        self.assertIn("data-testid=\"value-domain-angular\"", template_text)
        self.assertNotIn("data-testid=\"stage-editor-open\"", template_text)
        self.assertNotIn("window.S", component_text)
        self.assertNotIn("markModified", component_text)
        self.assertNotIn("showAppConfirm", component_text)
        self.assertIn("createValueDomainLegacyAdapter", component_text)

    def test_process_stage_view_mounts_angular_component(self):
        process_workbench_file = ANGULAR_DIR / "public" / "legacy-runtime" / "workbenches" / "process" / "process-workbench.js"
        process_legacy_file = ANGULAR_DIR / "public" / "legacy-runtime" / "workbenches" / "process" / "process-legacy.js"
        angular_mount_file = ANGULAR_APP_DIR / "core" / "legacy" / "angular-legacy-mounts.ts"
        stage_component = ANGULAR_APP_DIR / "workbenches" / "process" / "stage" / "process-stage-workbench.component.ts"
        stage_template = ANGULAR_APP_DIR / "workbenches" / "process" / "stage" / "process-stage-workbench.component.html"

        workbench_text = process_workbench_file.read_text("utf-8")
        legacy_text = process_legacy_file.read_text("utf-8")
        mount_text = angular_mount_file.read_text("utf-8")
        component_text = stage_component.read_text("utf-8")
        template_text = stage_template.read_text("utf-8")

        self.assertIn("S.ui.stageViewMode = 'detail'", workbench_text)
        self.assertIn("process-stage-angular-host", legacy_text)
        self.assertIn("mountProcessStageWorkbench", legacy_text)
        self.assertIn("ProcessStageWorkbenchComponent", mount_text)
        self.assertIn("data-testid=\"process-stage-view\"", template_text)
        self.assertIn("data-testid=\"stage-panorama-graph\"", template_text)
        self.assertIn("data-testid=\"stage-detail-graph\"", template_text)
        self.assertNotIn("window.S", component_text)
        self.assertIn("createProcessStageLegacyAdapter", component_text)

    def test_legacy_runtime_assets_are_declared_in_angular_source_order(self):
        manifest_file = ANGULAR_APP_DIR / "legacy-runtime" / "legacy-runtime.manifest.ts"
        bootstrap_file = ANGULAR_APP_DIR / "legacy-runtime" / "legacy-runtime.bootstrap.ts"

        self.assertTrue(manifest_file.exists())
        self.assertTrue(bootstrap_file.exists())

        manifest_text = manifest_file.read_text("utf-8")
        bootstrap_text = bootstrap_file.read_text("utf-8")

        previous_index = -1
        for legacy_file in LEGACY_RUNTIME_FILES:
            asset_path = f"legacy-runtime/{legacy_file}"
            self.assertIn(asset_path, manifest_text)
            next_index = manifest_text.index(asset_path)
            self.assertGreater(next_index, previous_index, f"{legacy_file} is out of legacy script order")
            previous_index = next_index

        self.assertIn("loadLegacyRuntime", bootstrap_text)
        self.assertIn("LEGACY_RUNTIME_SCRIPTS", bootstrap_text)
        self.assertIn("document.createElement('script')", bootstrap_text)

    def test_old_vendor_assets_are_available_to_legacy_runtime(self):
        public_dir = ANGULAR_DIR / "public"

        self.assertTrue((public_dir / "vendor" / "marked.umd.js").exists())
        self.assertTrue((public_dir / "vendor" / "mermaid.min.js").exists())
        self.assertTrue((public_dir / "legacy-runtime" / "app.js").exists())
        self.assertTrue((public_dir / "legacy-runtime" / "render.js").exists())

    def test_document_model_algorithms_have_targeted_unit_tests(self):
        model_file = ANGULAR_APP_DIR / "core" / "document" / "document-model.ts"
        spec_file = ANGULAR_APP_DIR / "core" / "document" / "document-model.spec.ts"
        model_text = model_file.read_text("utf-8")
        spec_text = spec_file.read_text("utf-8")

        for function_name in [
            "normalizeDocument",
            "normalizeStageFlowRefs",
            "findProcessByIdentity",
            "getStageProcesses",
            "getRoleUsage",
            "getComponentSupportedStages",
        ]:
            self.assertIn(f"function {function_name}", model_text)
            self.assertIn(function_name, spec_text)

    def test_angular_routes_send_workbench_paths_to_legacy_shell(self):
        routes_text = (ANGULAR_APP_DIR / "app.routes.ts").read_text("utf-8")

        self.assertRegex(routes_text, r"legacy-shell", re.IGNORECASE)
        for area in WORKBENCHES:
            self.assertIn(f"path: '{area}'", routes_text)

    def test_no_legacy_script_patterns_outside_legacy_port(self):
        forbidden_patterns = [
            "document.getElementById",
            ".innerHTML",
            "onclick=",
            "<script",
        ]
        for path in ANGULAR_APP_DIR.rglob("*"):
            if path.suffix not in {".ts", ".html"}:
                continue
            if "legacy-shell" in path.parts or "legacy-runtime" in path.parts:
                continue
            text = path.read_text("utf-8")
            for pattern in forbidden_patterns:
                self.assertNotIn(pattern, text, f"{path.relative_to(ROOT)} contains legacy pattern {pattern}")

    def test_angular_build_and_tests_pass(self):
        test_result = subprocess.run(
            ["npm.cmd", "test"],
            cwd=ANGULAR_DIR,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
        self.assertEqual(test_result.returncode, 0, test_result.stdout + test_result.stderr)

        build_result = subprocess.run(
            ["npm.cmd", "run", "build"],
            cwd=ANGULAR_DIR,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
        self.assertEqual(build_result.returncode, 0, build_result.stdout + build_result.stderr)
