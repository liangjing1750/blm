import subprocess
import unittest
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"

EXPECTED_SCRIPTS = [
    "state.js",
    "api.js",
    "collab.js",
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
        self.assertIn('id="btn-save" title="立即同步 (Ctrl+S)">立即同步</button>', html)
        self.assertIn('data-testid="user-account-button"', html)
        self.assertIn('data-testid="user-modal"', html)
        self.assertIn('用户信息配置</button>', html)
        self.assertIn('id="toolbar-save-as-label">复制</button>', html)
        self.assertIn('data-testid="open-modal-tabs"', html)
        self.assertIn('data-open-tab="workspace"', html)
        self.assertIn('data-open-tab="trash"', html)
        self.assertIn('id="open-workspace-panel"', html)
        self.assertIn('id="open-trash-panel"', html)
        self.assertIn('data-testid="open-space-tabs"', html)
        self.assertIn('data-testid="open-tag-filters"', html)
        self.assertIn('id="open-file-search"', html)
        self.assertIn('data-testid="history-modal"', html)
        self.assertIn('id="history-list"', html)
        self.assertIn('id="trash-list"', html)
        self.assertIn('id="save-as-modal-title">复制文档</h3>', html)
        self.assertIn('id="save-as-confirm-label">确认复制</button>', html)
        self.assertNotIn('id="save-alert"', html)
        self.assertIn('data-testid="toolbar-compare-button"', html)
        self.assertIn('data-testid="toolbar-history-button"', html)
        self.assertIn('id="locator-menu"', html)
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
        self.assertIn("supportsCopy", state_js)
        self.assertIn("supportsCollab", state_js)
        self.assertIn("queueCollabSnapshotSync", state_js)
        self.assertIn("pendingRemoteSnapshot", state_js)
        self.assertIn("hasConflict", state_js)
        self.assertIn("readOnly", state_js)
        self.assertIn("async createVersion(name, document, message = '')", api_js)
        self.assertIn("async loadVersion(name, versionId)", api_js)
        self.assertIn("async fileSummaries()", api_js)
        self.assertIn("async startDocxExport(name)", api_js)
        self.assertIn("async exportJob(jobId)", api_js)
        self.assertIn("async downloadExportJob(jobId)", api_js)
        self.assertIn("api.startDocxExport(S.currentFile)", app_js)
        self.assertIn("api.downloadExportJob(job.id)", app_js)
        self.assertIn("if (!response.ok) return []", api_js)
        self.assertIn("catch(() => [])", api_js)
        self.assertIn("COLLAB_SNAPSHOT_DEBOUNCE_MS = 5000", (APP_DIR / "collab.js").read_text("utf-8"))
        collab_js = (APP_DIR / "collab.js").read_text("utf-8")
        self.assertIn("COLLAB_RECONNECT_MS = 3000", collab_js)
        self.assertIn("COLLAB_PING_MS = 10000", collab_js)
        self.assertIn("receiveRemoteCollabSnapshot", collab_js)
        self.assertIn("applyPendingRemoteCollabSnapshot", collab_js)
        self.assertIn("keepLocalCollabSnapshot", collab_js)
        self.assertIn("scheduleCollabReconnect", collab_js)
        self.assertIn("lastActivity", collab_js)
        self.assertIn("COLLAB_USER_PROFILE_KEY = 'blm.user.profile'", collab_js)
        self.assertIn("getCollabSessionId", collab_js)
        self.assertIn("saveCollabUserProfile", collab_js)
        self.assertIn("openUserAccountModal", collab_js)
        self.assertIn("normalizeCollabDisplayName", collab_js)
        self.assertIn("hasConfiguredCollabUser", collab_js)
        self.assertIn("getCollabPayloadUserName", collab_js)
        self.assertIn("connectionCount", collab_js)
        self.assertIn("isCurrentUser", collab_js)
        self.assertIn("clientIds.includes(state.clientId)", collab_js)
        self.assertIn("sessionIds.includes(currentProfile.sessionId)", collab_js)
        self.assertIn("names.unshift(currentProfile.name)", collab_js)
        self.assertIn("ensureUserConfiguredForApp", app_js)
        index_html = (APP_DIR / "index.html").read_text("utf-8")
        self.assertNotIn('id="collab-conflict-alert"', index_html)
        self.assertIn('data-testid="toolbar-version-button"', index_html)
        self.assertIn('data-testid="toolbar-history-button"', index_html)
        self.assertIn('data-testid="toolbar-version-button">归档版本</button>', index_html)
        self.assertIn('data-testid="toolbar-history-button">历史记录</button>', index_html)
        self.assertIn('id="readonly-alert"', index_html)
        self.assertIn("showLocatorMenu", app_js)
        self.assertIn("copyVersionLocator", app_js)
        self.assertIn("copyTextToClipboard", app_js)
        self.assertIn("document.execCommand('copy')", app_js)
        self.assertIn("data-locator-action", app_js)
        self.assertNotIn("onclick=\"copyLocatorUrl", app_js)
        self.assertIn("formatCompareHistoryOptionLabel", app_js)
        self.assertIn("自动同步", app_js)
        self.assertIn("手动同步", app_js)
        self.assertIn("const hasLocalUnsubmitted", render_js)
        self.assertIn("const hasRemoteUnsynced", render_js)
        self.assertIn("const hasActionableChange = Boolean(hasLocalUnsubmitted || hasRemoteUnsynced);", render_js)
        self.assertIn("renderWorkspaceFileList(files)", app_js)
        self.assertIn("getWorkspaceDocumentSummaries(files)", app_js)
        self.assertIn("renderOpenSpaceTabs(spaces, summaries)", app_js)
        self.assertIn("compareWorkspaceSpaceNames", app_js)
        self.assertIn("leftText === DEFAULT_WORKSPACE_SPACE", app_js)
        self.assertIn("renderOpenTagFilters(tags, activeTag)", app_js)
        self.assertIn("selectOpenSpace(space)", app_js)
        self.assertIn("selectOpenTag(tag)", app_js)
        self.assertIn("openModalById('open-modal-overlay')", app_js)
        self.assertIn("loadWorkspaceDocumentSummaries()", app_js)
        self.assertIn("已降级为普通文档列表", app_js)
        self.assertIn("workspace-doc-card", style_css)
        self.assertIn("history-modal-shell", style_css)
        self.assertIn("trash-toolbar", style_css)
        self.assertIn("user-account-button", style_css)
        self.assertIn("user-modal-shell", style_css)
        self.assertIn(".collab-status[data-users]::after", style_css)
        self.assertIn("badge.dataset.users", collab_js)
        self.assertIn("clearSelectedTrash", app_js)
        self.assertIn("clearAllTrash", app_js)
        self.assertIn("openHistorySnapshot", app_js)
        self.assertIn("async deleteTrash(entryIds)", api_js)
        self.assertIn("async clearTrash()", api_js)
        self.assertIn("open-space-tab", style_css)
        self.assertIn("open-tag-filter", style_css)
        self.assertIn("locator-menu", style_css)
        self.assertIn("openStartupLocatorIfPresent", app_js)
        self.assertIn("applyLocatorToUi", app_js)
        self.assertIn("App.openLatestVersion()", index_html)
        self.assertIn("flowGroup", state_js)
        self.assertIn("orchestrationTasks", state_js)
        self.assertIn("getNodeForms", state_js)
        self.assertNotIn("{id:'manual', label:'使用手册'}", render_js)
        self.assertIn("toolbar-manual-button", render_js)
        self.assertIn("document.getElementById('tab-bar').innerHTML = '';", render_js)
        self.assertIn("const MANUAL_RUNTIME_ERROR", manual_js)
        self.assertIn("MANUAL_DOC_ID = 'user-manual'", manual_js)
        self.assertIn("supports_docs", manual_js)
        self.assertIn("supports_copy", app_js)
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

    def test_workspace_space_summary_is_not_overwritten_by_current_document(self):
        app_js = (APP_DIR / "app.js").read_text("utf-8")

        self.assertIn("const DEFAULT_WORKSPACE_SPACE", app_js)
        self.assertIn("function normalizeWorkspaceSpace", app_js)
        self.assertIn("if (!summaryByName.has(S.currentFile))", app_js)
        self.assertIn("space: normalizeWorkspaceSpace(summary.space)", app_js)
        self.assertIn("renderWorkspaceFileList(S.files)", app_js)

    def test_reverse_action_buttons_are_readable_on_light_surfaces(self):
        style_css = (APP_DIR / "style.css").read_text("utf-8")

        self.assertIn(".btn-ghost   { background: #fff; color: var(--text); border-color: var(--border); }", style_css)
        self.assertIn("#toolbar .btn-ghost { background: transparent; color: var(--header-text); border-color: #475569; }", style_css)
        self.assertLess(
            style_css.find(".btn-ghost   { background: #fff; color: var(--text);"),
            style_css.find("#toolbar .btn-ghost { background: transparent; color: var(--header-text);"),
        )

    def test_compare_modal_supports_remote_archive_and_submit_sources(self):
        index_html = (APP_DIR / "index.html").read_text("utf-8")
        app_js = (APP_DIR / "app.js").read_text("utf-8")
        state_js = (APP_DIR / "state.js").read_text("utf-8")

        self.assertIn('id="compare-left-source-select"', index_html)
        self.assertIn('id="compare-right-source-select"', index_html)
        self.assertIn("App.selectCompareSource('left', this.value)", index_html)
        self.assertIn("App.selectCompareSource('right', this.value)", index_html)
        self.assertIn('<option value="version">归档版本记录</option>', index_html)
        self.assertIn("sourceKinds", state_js)
        self.assertIn("archiveVersions", state_js)
        self.assertIn("submitVersions", state_js)
        self.assertIn("function getCompareSelectedSourceKind", app_js)
        self.assertIn("api.collabSubmitLoad(name, submitId)", app_js)
        self.assertIn("api.loadVersion(name, id)", app_js)
        self.assertIn("api.loadHistory(name, id)", app_js)
        self.assertIn("async archiveHistorySnapshot", app_js)
        self.assertIn("copyVersionLocator", app_js)
        self.assertIn("extendCompareVersionOptionsIfNeeded", app_js)

    def test_history_restore_is_local_and_actions_are_visually_distinct(self):
        app_js = (APP_DIR / "app.js").read_text("utf-8")
        style_css = (APP_DIR / "style.css").read_text("utf-8")

        self.assertIn(">只读打开</button>", app_js)
        self.assertIn(">本地恢复</button>", app_js)
        self.assertIn("btn btn-danger-solid btn-sm", app_js)
        self.assertIn("onclick='App.archiveHistorySnapshot", app_js)
        self.assertIn("btn btn-primary btn-sm", app_js)
        self.assertIn("const result = await api.loadHistory(name, snapshotId);", app_js)
        self.assertNotIn("const result = await api.restoreHistory(name, snapshotId);", app_js)
        self.assertIn("点击“立即同步”后才会影响其他人", app_js)
        self.assertIn(".btn-danger-solid { background: var(--danger); color: #fff; border-color: var(--danger); }", style_css)

    def test_collab_toolbar_shows_local_and_remote_sync_states(self):
        render_js = (APP_DIR / "render.js").read_text("utf-8")
        style_css = (APP_DIR / "style.css").read_text("utf-8")

        self.assertIn("const hasLocalUnsubmitted", render_js)
        self.assertIn("const hasRemoteUnsynced", render_js)
        self.assertIn("const hasActionableChange = Boolean(hasLocalUnsubmitted || hasRemoteUnsynced);", render_js)
        self.assertIn("本地未提交", render_js)
        self.assertIn("远端未同步", render_js)
        self.assertIn("modified-badge-row local", render_js)
        self.assertIn("modified-badge-row remote", render_js)
        self.assertIn(".modified-badge-row.local", style_css)
        self.assertIn(".modified-badge-row.remote", style_css)
        self.assertIn(".modified-badge-dot", style_css)

    def test_entity_relation_layout_uses_deterministic_entity_node_size(self):
        entity_js = (APP_DIR / "entity.js").read_text("utf-8")
        style_css = (APP_DIR / "style.css").read_text("utf-8")

        self.assertIn("function _efGetEntityNodeSize(entity)", entity_js)
        self.assertIn("const size = _efGetEntityNodeSize(entity);", entity_js)
        self.assertIn("colWidths[col] = Math.max(colWidths[col], _efGetEntityNodeSize(entity).width);", entity_js)
        self.assertIn("const size = _efGetEntityNodeSize(e);", entity_js)
        self.assertIn("width:${size.width}px;height:${size.height}px", entity_js)
        self.assertIn("justify-content: center;", style_css)

    def test_business_ids_are_hidden_from_business_modeling_ui(self):
        state_js = (APP_DIR / "state.js").read_text("utf-8")
        process_js = (APP_DIR / "process.js").read_text("utf-8")
        entity_js = (APP_DIR / "entity.js").read_text("utf-8")
        render_js = (APP_DIR / "render.js").read_text("utf-8")

        self.assertIn("function nextStableId", state_js)
        self.assertNotIn('data-testid="process-id-input"', process_js)
        self.assertNotIn('data-testid="process-task-id-input"', process_js)
        self.assertNotIn('data-testid="process-flow-node-id-input"', process_js)
        self.assertNotIn('data-testid="process-flow-gateway-id-input"', process_js)
        self.assertNotIn('data-testid="process-flow-edge-id-input"', process_js)
        self.assertNotIn("detail-id editable-id", entity_js)
        self.assertNotIn("sb-id editable-id", render_js)
        self.assertIn("renameGatewayId", entity_js)
        self.assertIn("renameFlowEdgeId", entity_js)

    def test_swimlane_tasklevel_view_uses_outer_vertical_scroll(self):
        style_css = (APP_DIR / "style.css").read_text("utf-8")

        self.assertIn(".process-flow-view.is-swimlane.has-tasklevel", style_css)
        self.assertIn(".process-flow-view.is-swimlane.has-tasklevel .process-flow-card", style_css)
        self.assertIn("height: auto;", style_css)
        self.assertIn("overflow: visible;", style_css)

    def test_process_flow_node_role_control_is_plain_dropdown(self):
        process_js = (APP_DIR / "process.js").read_text("utf-8")
        style_css = (APP_DIR / "style.css").read_text("utf-8")

        self.assertIn('data-testid="process-flow-node-role-picker"', process_js)
        self.assertIn("setProcessFlowNodeRole", process_js)
        self.assertIn('type="checkbox"', process_js)
        self.assertIn(".flow-node-role-menu", style_css)
        self.assertNotIn('class="flow-node-role-select" multiple', process_js)
        self.assertNotIn('multiple size="1"', process_js)

    def test_frontend_normalizers_preserve_existing_uids(self):
        state_js = (APP_DIR / "state.js").read_text("utf-8")
        process_js = (APP_DIR / "process.js").read_text("utf-8")
        app_js = (APP_DIR / "app.js").read_text("utf-8")
        api_js = (APP_DIR / "api.js").read_text("utf-8")

        self.assertIn("uid: String(source.uid || '').trim() || id", state_js)
        self.assertIn("const uid = String(normalized.uid || '').trim();", state_js)
        self.assertIn("...(uid ? { uid } : {})", state_js)
        self.assertIn("const uid = createUiUid('rule');", process_js)
        self.assertIn("const rule = { uid, id: uid, name, content: '' };", process_js)
        self.assertIn("uid: String(transition?.uid || '').trim() || createUiUid('transition')", state_js)
        self.assertIn("async copyDocument(sourceName, targetName)", api_js)
        self.assertIn("return postJson('/api/copy'", api_js)
        self.assertIn("copyWorkspaceDocument(S.currentFile, name)", app_js)
        self.assertIn("当前运行的本地服务不支持复制接口", app_js)
        self.assertIn("'meta.revision'", app_js)
        self.assertIn("'versionUid'", app_js)
        self.assertIn("function isImplicitDefaultCompareValue(path, value)", app_js)
        self.assertIn("isImplicitDefaultCompareValue(path, rightMap[path])", app_js)


if __name__ == "__main__":
    unittest.main()
