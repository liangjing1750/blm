import subprocess
import unittest
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"

EXPECTED_SCRIPTS = [
    "state.js",
    "api.js",
    "render.js",
    "domain.js",
    "process.js",
    "entity.js",
    "preview.js",
    "manual.js",
    "app.js",
]


class FrontendStructureTests(unittest.TestCase):
    def test_split_scripts_exist(self):
        for script_name in EXPECTED_SCRIPTS:
            self.assertTrue((APP_DIR / script_name).exists(), f"{script_name} 不存在")
        self.assertTrue((APP_DIR / "vendor" / "mermaid.min.js").exists())
        self.assertTrue((APP_DIR / "vendor" / "marked.umd.js").exists())

    def test_split_scripts_pass_node_syntax_check(self):
        for script_name in EXPECTED_SCRIPTS:
            script_path = APP_DIR / script_name
            result = subprocess.run(
                ["node", "--check", str(script_path)],
                capture_output=True,
                text=True,
                cwd=ROOT,
            )
            self.assertEqual(
                result.returncode,
                0,
                f"{script_name} 语法检查失败: {result.stderr}",
            )

    def test_index_html_references_split_scripts_in_order(self):
        html = (APP_DIR / "index.html").read_text("utf-8")
        self.assertIn("<title>BLM - Business Language Modeling</title>", html)
        self.assertIn('<span class="logo">BLM</span>', html)
        self.assertIn('id="toolbar-save-as-label">复制</button>', html)
        self.assertIn('data-testid="open-modal-tabs"', html)
        self.assertIn('data-open-tab="workspace"', html)
        self.assertIn('data-open-tab="trash"', html)
        self.assertIn('id="open-workspace-panel"', html)
        self.assertIn('id="open-trash-panel"', html)
        self.assertIn('data-testid="history-modal"', html)
        self.assertIn('id="history-list"', html)
        self.assertIn('id="trash-list"', html)
        self.assertIn('id="save-as-modal-title">复制文档</h3>', html)
        self.assertIn('id="save-as-confirm-label">确认复制</button>', html)
        self.assertIn('data-testid="toolbar-compare-button"', html)
        self.assertLess(
            html.find('data-testid="toolbar-save-as-button"'),
            html.find('data-testid="toolbar-compare-button"'),
        )
        self.assertLess(
            html.find('data-testid="toolbar-compare-button"'),
            html.find('data-testid="toolbar-merge-button"'),
        )
        self.assertIn('data-testid="toolbar-manual-button"', html)
        self.assertLess(
            html.find('data-testid="toolbar-export-button"'),
            html.find('data-testid="toolbar-manual-button"'),
        )
        self.assertRegex(html, r'<script src="vendor/mermaid\.min\.js(?:\?[^"]*)?"></script>')
        self.assertRegex(html, r'<script src="vendor/marked\.umd\.js(?:\?[^"]*)?"></script>')
        self.assertRegex(html, r'<script src="manual\.js(?:\?[^"]*)?"></script>')
        self.assertNotIn("https://cdn.jsdelivr.net", html)
        self.assertIn('id="merge-left-select"', html)
        self.assertIn('id="merge-right-select"', html)
        self.assertIn("App.selectMergeWorkspace('left', this.value)", html)
        self.assertIn("App.selectMergeWorkspace('right', this.value)", html)
        self.assertIn('data-testid="merge-confirm-button"', html)
        self.assertIn('data-testid="compare-modal"', html)
        self.assertIn('id="compare-left-version-select"', html)
        self.assertIn('id="compare-right-version-select"', html)
        self.assertNotIn('data-testid="merge-analyze-button"', html)
        self.assertNotIn('上传 JSON', html)
        self.assertNotIn('生成新的合并文档', html)
        previous_position = -1
        for script_name in EXPECTED_SCRIPTS:
            match = re.search(rf'<script src="{re.escape(script_name)}(?:\?[^"]*)?"></script>', html)
            position = match.start() if match else -1
            self.assertNotEqual(position, -1, f"index.html 未加载 {script_name}")
            self.assertGreater(position, previous_position, f"{script_name} 加载顺序不正确")
            previous_position = position

    def test_browser_frontend_no_longer_depends_on_path_merge_state(self):
        app_js = (APP_DIR / "app.js").read_text("utf-8")
        api_js = (APP_DIR / "api.js").read_text("utf-8")
        state_js = (APP_DIR / "state.js").read_text("utf-8")
        render_js = (APP_DIR / "render.js").read_text("utf-8")
        manual_js = (APP_DIR / "manual.js").read_text("utf-8")
        process_js = (APP_DIR / "process.js").read_text("utf-8")
        preview_js = (APP_DIR / "preview.js").read_text("utf-8")
        style_css = (APP_DIR / "style.css").read_text("utf-8")

        self.assertNotIn("S.merge.paths", app_js)
        self.assertNotIn("getPathBasename", app_js)
        self.assertNotIn("path = ''", app_js)
        self.assertIn("async runtime()", api_js)
        self.assertIn("fetch('/api/runtime')", api_js)
        self.assertIn("async loadHistory(name, snapshotId)", api_js)
        self.assertNotIn("paths:", state_js)
        self.assertIn("supportsDocs", state_js)
        self.assertIn("flowGroup", state_js)
        self.assertIn("orchestrationTasks", state_js)
        self.assertIn("getNodeForms", state_js)
        self.assertNotIn("{id:'manual', label:'使用手册'}", render_js)
        self.assertIn("toolbar-manual-button", render_js)
        self.assertIn("document.getElementById('tab-bar').innerHTML = '';", render_js)
        self.assertIn("const MANUAL_RUNTIME_ERROR", manual_js)
        self.assertIn("MANUAL_DOC_ID = 'user-manual'", manual_js)
        self.assertIn("supports_docs", manual_js)
        self.assertIn("manual-reader-head", manual_js)
        self.assertIn("toggleManualOutlineGroup", manual_js)
        self.assertIn("getActiveManualDoc", manual_js)
        self.assertIn("renderManualDocList", manual_js)
        self.assertIn("renderBasicManualMarkdown", manual_js)
        self.assertIn("manual-doc-intro", manual_js)
        self.assertIn("returnFromManual", manual_js)
        self.assertIn("manual-back-button", manual_js)
        self.assertNotIn("manual-doc-button-summary", manual_js)
        self.assertNotIn("manual-image-card", manual_js)
        self.assertIn("flowGroup", process_js)
        self.assertIn("renderOrchestrationSection", process_js)
        self.assertIn("renderTaskFormsSection", process_js)
        self.assertIn("task-form-section-entity", process_js)
        self.assertIn("getTaskFormEntitySummary", process_js)
        self.assertNotIn('data-testid="task-form-entity"', process_js)
        self.assertIn("renderTaskBusinessRulesSection", process_js)
        self.assertIn("businessRules", state_js)
        self.assertIn("buildOrchestrationFlowHtml", process_js)
        self.assertIn("node-perspective-switch", process_js)
        self.assertNotIn("\\u8fdb\\u5165\\u7f16\\u6392\\u4efb\\u52a1", process_js)
        self.assertIn("用户操作步骤", preview_js)
        self.assertIn("节点任务", preview_js)
        self.assertIn("表单模型", preview_js)
        self.assertIn(".manual-shell #tab-bar", style_css)

    def test_reverse_action_buttons_are_readable_on_light_surfaces(self):
        style_css = (APP_DIR / "style.css").read_text("utf-8")

        self.assertIn(".btn-ghost   { background: #fff; color: var(--text); border-color: var(--border); }", style_css)
        self.assertIn("#toolbar .btn-ghost { background: transparent; color: var(--header-text); border-color: #475569; }", style_css)
        self.assertLess(
            style_css.find(".btn-ghost   { background: #fff; color: var(--text);"),
            style_css.find("#toolbar .btn-ghost { background: transparent; color: var(--header-text);"),
        )


if __name__ == "__main__":
    unittest.main()
