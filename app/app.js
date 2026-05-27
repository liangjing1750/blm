'use strict';

const UNSAVED_CHANGES_MESSAGE = '当前有未保存修改，继续操作会丢失这些内容。是否继续？';
const nativeAlert = window.alert.bind(window);
const nativeConfirm = window.confirm.bind(window);
const nativePrompt = window.prompt.bind(window);

let activeAppDialog = null;
let appToastTimer = null;

function getAppDialogElements() {
  return {
    overlay: document.getElementById('app-dialog-overlay'),
    title: document.getElementById('app-dialog-title'),
    message: document.getElementById('app-dialog-message'),
    input: document.getElementById('app-dialog-input'),
    cancel: document.getElementById('app-dialog-cancel'),
    confirm: document.getElementById('app-dialog-confirm'),
  };
}

function getFallbackDialogResult(type, message, defaultValue) {
  if (type === 'confirm') return Promise.resolve(nativeConfirm(message));
  if (type === 'prompt') return Promise.resolve(nativePrompt(message, defaultValue));
  nativeAlert(message);
  return Promise.resolve(true);
}

function handleAppDialogKeydown(event) {
  if (!activeAppDialog) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    resolveAppDialog(false);
    return;
  }
  if (event.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA') {
    event.preventDefault();
    resolveAppDialog(true);
  }
}

function showAppDialog({
  type = 'alert',
  title = '提示',
  message = '',
  confirmLabel = '确定',
  cancelLabel = '取消',
  defaultValue = '',
} = {}) {
  const elements = getAppDialogElements();
  if (!elements.overlay || !elements.title || !elements.message || !elements.input || !elements.cancel || !elements.confirm) {
    return getFallbackDialogResult(type, String(message || ''), defaultValue);
  }

  if (activeAppDialog?.resolve) {
    resolveAppDialog(false);
  }

  return new Promise((resolve) => {
    activeAppDialog = {
      type,
      resolve,
      previousFocus: document.activeElement,
    };
    elements.title.textContent = title;
    elements.message.textContent = String(message || '');
    elements.input.value = String(defaultValue || '');
    elements.input.classList.toggle('hidden', type !== 'prompt');
    elements.input.disabled = type !== 'prompt';
    elements.cancel.textContent = cancelLabel;
    elements.confirm.textContent = confirmLabel;
    elements.cancel.classList.toggle('hidden', type === 'alert');
    elements.overlay.dataset.dialogType = type;
    elements.overlay.classList.remove('hidden');
    document.addEventListener('keydown', handleAppDialogKeydown);
    requestAnimationFrame(() => {
      if (type === 'prompt') elements.input.focus();
      else elements.confirm.focus();
    });
  });
}

function resolveAppDialog(accepted) {
  if (!activeAppDialog) return;
  const state = activeAppDialog;
  const elements = getAppDialogElements();
  const type = state.type;
  let result = true;
  if (type === 'confirm') result = Boolean(accepted);
  if (type === 'prompt') result = accepted ? elements.input?.value || '' : null;

  elements.overlay?.classList.add('hidden');
  elements.input?.classList.add('hidden');
  elements.cancel?.classList.remove('hidden');
  document.removeEventListener('keydown', handleAppDialogKeydown);
  activeAppDialog = null;
  state.resolve(result);
  setTimeout(() => {
    if (state.previousFocus && typeof state.previousFocus.focus === 'function') {
      state.previousFocus.focus();
    }
  }, 0);
}

function closeAppDialogFromBackdrop(event) {
  if (event.target === event.currentTarget) {
    resolveAppDialog(false);
  }
}

function showAppAlert(message, options = {}) {
  return showAppDialog({
    type: 'alert',
    title: options.title || '提示',
    message,
    confirmLabel: options.confirmLabel || '知道了',
  });
}

function showAppConfirm(message, options = {}) {
  return showAppDialog({
    type: 'confirm',
    title: options.title || '请确认',
    message,
    confirmLabel: options.confirmLabel || '确认',
    cancelLabel: options.cancelLabel || '取消',
  });
}

function showAppPrompt(message, defaultValue = '', options = {}) {
  return showAppDialog({
    type: 'prompt',
    title: options.title || '请输入',
    message,
    defaultValue,
    confirmLabel: options.confirmLabel || '确定',
    cancelLabel: options.cancelLabel || '取消',
  });
}

window.alert = (message) => {
  showAppAlert(message);
};

async function confirmDiscardUnsavedChanges(actionLabel = '') {
  if (!S.modified) return true;
  const actionText = String(actionLabel || '').trim();
  const message = actionText
    ? `当前有未保存修改，继续${actionText}会丢失这些内容。是否继续？`
    : UNSAVED_CHANGES_MESSAGE;
  return showAppConfirm(message, {
    title: '未保存修改',
    confirmLabel: '继续',
    cancelLabel: '取消',
  });
}

function bindBeforeUnloadWarning() {
  window.addEventListener('beforeunload', (event) => {
    if (!S.modified) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function createLocalDocument(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '' },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    panorama: createDefaultPanoramaModel(),
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

function getFirstRoleId(doc) {
  return Array.isArray(doc?.roles) && doc.roles.length && typeof doc.roles[0] === 'object'
    ? doc.roles[0].id
    : null;
}

function isStatusFieldCandidate(field) {
  const statusRole = String(field?.status_role || '');
  return statusRole === 'primary' || statusRole === 'secondary' || Boolean(field?.is_status || field?.isStatus);
}

function captureUiViewportState() {
  const scrollRoot = document.scrollingElement || document.documentElement;
  const selectors = [
    '.live-diagram',
    '.stage-main-shell',
    '.stage-drawer .drawer-body',
    '.proc-drawer .drawer-body',
    '.entity-drawer .drawer-body',
    '.entity-state-browser',
    '.entity-state-main-shell',
    '.state-editor-drawer .drawer-body',
  ];
  return {
    pageTop: scrollRoot?.scrollTop || 0,
    pageLeft: scrollRoot?.scrollLeft || 0,
    elementScrolls: selectors.map((selector) => {
      const node = document.querySelector(selector);
      return node
        ? { selector, top: node.scrollTop || 0, left: node.scrollLeft || 0 }
        : null;
    }).filter(Boolean),
  };
}

function restoreUiViewportState(snapshot) {
  if (!snapshot) return;
  requestAnimationFrame(() => {
    const scrollRoot = document.scrollingElement || document.documentElement;
    if (scrollRoot) {
      scrollRoot.scrollTop = snapshot.pageTop || 0;
      scrollRoot.scrollLeft = snapshot.pageLeft || 0;
    }
    (snapshot.elementScrolls || []).forEach(({ selector, top, left }) => {
      const node = document.querySelector(selector);
      if (!node) return;
      node.scrollTop = top || 0;
      node.scrollLeft = left || 0;
    });
  });
}

const UI_NAV_HISTORY_LIMIT = 60;
const UI_NAV_HISTORY_KEYS = [
  'tab',
  'procId',
  'taskId',
  'stageId',
  'stageViewMode',
  'entityId',
  'dataView',
  'stateFieldName',
  'roleId',
  'roleParticipatingOnly',
  'procView',
  'nodePerspective',
  'stageEditorCollapsed',
  'entityRelationEditorCollapsed',
  'stateEditorCollapsed',
  'stageGraphZoom',
  'stateDiagramZoom',
  'businessModelDialog',
];

function cloneBusinessModelDialog(dialog = {}) {
  return {
    mode: String(dialog?.mode || ''),
    capabilityId: String(dialog?.capabilityId || ''),
    constructId: String(dialog?.constructId || ''),
    taskDefinitionId: String(dialog?.taskDefinitionId || ''),
    returnMode: String(dialog?.returnMode || ''),
    procId: String(dialog?.procId || ''),
    taskId: String(dialog?.taskId || ''),
    afterIdx: Number.isInteger(dialog?.afterIdx) ? dialog.afterIdx : null,
  };
}

let pendingUiNavigationSnapshot = null;
let pendingUiNavigationTimer = null;

function cloneUiViewportSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    pageTop: snapshot.pageTop || 0,
    pageLeft: snapshot.pageLeft || 0,
    elementScrolls: Array.isArray(snapshot.elementScrolls)
      ? snapshot.elementScrolls.map((item) => ({
        selector: String(item.selector || ''),
        top: item.top || 0,
        left: item.left || 0,
      }))
      : [],
  };
}

function cloneUiNavigationHistory(history = []) {
  return Array.isArray(history)
    ? history.map((entry) => ({
      ...entry,
      viewport: cloneUiViewportSnapshot(entry.viewport),
      businessModelDialog: cloneBusinessModelDialog(entry.businessModelDialog),
    }))
    : [];
}

function getUiNavigationSnapshot(sourceUi = S.ui, options = {}) {
  const ui = sourceUi || {};
  const includeViewport = options.includeViewport !== false;
  return {
    tab: String(ui.tab || 'domain'),
    procId: ui.procId || null,
    taskId: ui.taskId || null,
    stageId: ui.stageId || null,
    stageViewMode: String(ui.stageViewMode || 'panorama'),
    entityId: ui.entityId || null,
    dataView: String(ui.dataView || 'relation'),
    stateFieldName: String(ui.stateFieldName || ''),
    roleId: ui.roleId || null,
    procView: String(ui.procView || 'stage'),
    nodePerspective: String(ui.nodePerspective || 'user'),
    stageEditorCollapsed: ui.stageEditorCollapsed !== false,
    entityRelationEditorCollapsed: ui.entityRelationEditorCollapsed !== false,
    stateEditorCollapsed: Boolean(ui.stateEditorCollapsed),
    stageGraphZoom: Number(ui.stageGraphZoom) || 1,
    stateDiagramZoom: Number(ui.stateDiagramZoom) || 1,
    businessModelDialog: cloneBusinessModelDialog(ui.businessModelDialog),
    viewport: includeViewport ? cloneUiViewportSnapshot(captureUiViewportState()) : null,
  };
}

function areUiNavigationSnapshotsEqual(left, right) {
  const a = left || {};
  const b = right || {};
  return UI_NAV_HISTORY_KEYS.every((key) => {
    if (key === 'stageGraphZoom' || key === 'stateDiagramZoom') {
      return Math.abs((Number(a[key]) || 1) - (Number(b[key]) || 1)) < 0.001;
    }
    if (key === 'businessModelDialog') {
      const leftDialog = cloneBusinessModelDialog(a[key]);
      const rightDialog = cloneBusinessModelDialog(b[key]);
      return ['mode', 'capabilityId', 'constructId', 'taskDefinitionId', 'returnMode', 'procId', 'taskId', 'afterIdx']
        .every((dialogKey) => leftDialog[dialogKey] === rightDialog[dialogKey]);
    }
    return String(a[key] ?? '') === String(b[key] ?? '');
  });
}

function clearPendingUiNavigationHistory() {
  pendingUiNavigationSnapshot = null;
  if (pendingUiNavigationTimer) {
    window.clearTimeout(pendingUiNavigationTimer);
    pendingUiNavigationTimer = null;
  }
}

function commitPendingUiNavigationHistory() {
  if (!pendingUiNavigationSnapshot) {
    clearPendingUiNavigationHistory();
    return;
  }
  const snapshot = pendingUiNavigationSnapshot;
  clearPendingUiNavigationHistory();
  const current = getUiNavigationSnapshot(S.ui, { includeViewport: false });
  if (areUiNavigationSnapshotsEqual(snapshot, current)) return;
  const history = cloneUiNavigationHistory(S.ui.navHistory);
  const last = history[history.length - 1];
  if (last && areUiNavigationSnapshotsEqual(last, snapshot)) return;
  history.push(snapshot);
  if (history.length > UI_NAV_HISTORY_LIMIT) {
    history.splice(0, history.length - UI_NAV_HISTORY_LIMIT);
  }
  S.ui.navHistory = history;
  if (typeof renderTabBar === 'function' && S.ui.tab !== 'manual') {
    renderTabBar();
  }
}

function queueUiNavigationHistory() {
  if (!S.doc) return false;
  if (!pendingUiNavigationSnapshot) {
    pendingUiNavigationSnapshot = getUiNavigationSnapshot(S.ui);
  }
  if (!pendingUiNavigationTimer) {
    pendingUiNavigationTimer = window.setTimeout(() => {
      commitPendingUiNavigationHistory();
    }, 0);
  }
  return true;
}

function queueUiNavigationHistoryFor(nextState, options = {}) {
  if (options.recordHistory === false || !S.doc) return false;
  const current = getUiNavigationSnapshot(S.ui, { includeViewport: false });
  const draft = { ...current };
  const normalizedNext = typeof nextState === 'function'
    ? (nextState(draft) || draft)
    : { ...draft, ...(nextState || {}) };
  if (areUiNavigationSnapshotsEqual(current, normalizedNext)) return false;
  return queueUiNavigationHistory();
}

function canGoBackNavigation() {
  commitPendingUiNavigationHistory();
  return Array.isArray(S.ui?.navHistory) && S.ui.navHistory.length > 0;
}

function getUiNavigationLabel(snapshot) {
  const route = snapshot || {};
  if (route.tab === 'process') {
    if (route.procView === 'stage') {
      if (route.stageViewMode === 'detail' && route.stageId) {
        const stage = getStageItems(S.doc).find((item) => item.id === route.stageId);
        return `返回到阶段：${stage?.name || route.stageId}`;
      }
      return '返回到业务全景';
    }
    if (route.procView === 'role') return '返回到角色视图';
    if (route.procId && route.taskId) {
      const proc = (S.doc?.processes || []).find((item) => item.id === route.procId);
      const task = getProcNodes(proc).find((item) => item.id === route.taskId);
      return `返回到节点：${task?.name || route.taskId}`;
    }
    if (route.procId) {
      const proc = (S.doc?.processes || []).find((item) => item.id === route.procId);
      return `返回到流程：${proc?.name || route.procId}`;
    }
    return '返回到流程';
  }
  if (route.tab === 'data') {
    if (route.dataView === 'state' && route.entityId) {
      const entity = (S.doc?.entities || []).find((item) => item.id === route.entityId);
      return `返回到状态图：${entity?.name || route.entityId}`;
    }
    if (route.entityId) {
      const entity = (S.doc?.entities || []).find((item) => item.id === route.entityId);
      return `返回到实体：${entity?.name || route.entityId}`;
    }
    return '返回到数据';
  }
  if (route.tab === 'preview') return '返回到预览';
  if (route.tab === 'manual') return '返回到使用手册';
  return '返回到业务域';
}

function getBackNavigationTitle() {
  commitPendingUiNavigationHistory();
  const history = Array.isArray(S.ui?.navHistory) ? S.ui.navHistory : [];
  const previous = history[history.length - 1];
  return previous ? getUiNavigationLabel(previous) : '当前没有可返回的位置';
}

function applyUiNavigationSnapshot(snapshot) {
  if (!snapshot) return false;
  const history = cloneUiNavigationHistory(S.ui.navHistory);
  UI_NAV_HISTORY_KEYS.forEach((key) => {
    if (!(key in snapshot)) return;
    S.ui[key] = key === 'businessModelDialog'
      ? cloneBusinessModelDialog(snapshot[key])
      : snapshot[key];
  });
  S.ui.navHistory = history;
  render();
  restoreUiViewportState(snapshot.viewport);
  return true;
}

function goBackNavigation() {
  commitPendingUiNavigationHistory();
  const history = cloneUiNavigationHistory(S.ui.navHistory);
  if (!history.length) return false;
  const current = getUiNavigationSnapshot(S.ui, { includeViewport: false });
  let previous = history.pop();
  while (previous && areUiNavigationSnapshotsEqual(previous, current)) {
    previous = history.pop();
  }
  S.ui.navHistory = history;
  if (!previous) {
    if (typeof renderTabBar === 'function' && S.ui.tab !== 'manual') {
      renderTabBar();
    }
    return false;
  }
  return applyUiNavigationSnapshot(previous);
}

function getPreservedDocUiState(doc, sourceUi = {}) {
  const base = createDocUiState(doc);
  const next = {
    ...base,
    ...sourceUi,
    sbCollapse: sourceUi && typeof sourceUi.sbCollapse === 'object'
      ? { ...sourceUi.sbCollapse }
      : { ...base.sbCollapse },
    procPrototypeExpanded: sourceUi && typeof sourceUi.procPrototypeExpanded === 'object'
      ? { ...sourceUi.procPrototypeExpanded }
      : { ...base.procPrototypeExpanded },
    procRolePickerCollapsed: sourceUi && typeof sourceUi.procRolePickerCollapsed === 'object'
      ? { ...sourceUi.procRolePickerCollapsed }
      : { ...base.procRolePickerCollapsed },
    orchestrationReuseFilters: sourceUi && typeof sourceUi.orchestrationReuseFilters === 'object'
      ? { ...sourceUi.orchestrationReuseFilters }
      : { ...base.orchestrationReuseFilters },
    navHistory: cloneUiNavigationHistory(sourceUi?.navHistory),
  };

  const validTabs = new Set(['domain', 'process', 'data', 'rules', 'preview', 'manual']);
  if (!validTabs.has(String(next.tab || ''))) next.tab = base.tab;

  if (next.procView === 'card') next.procView = 'flow';
  const validProcViews = new Set(['stage', 'list', 'flow', 'role']);
  if (!validProcViews.has(String(next.procView || ''))) next.procView = base.procView;

  if (!String(next.businessDomainFilter || '')) {
    next.businessDomainFilter = base.businessDomainFilter;
  }

  const validStageViewModes = new Set(['panorama', 'detail']);
  if (!validStageViewModes.has(String(next.stageViewMode || ''))) next.stageViewMode = base.stageViewMode;

  const validNodePerspectives = new Set(['user', 'engineering', 'task']);
  if (!validNodePerspectives.has(String(next.nodePerspective || ''))) next.nodePerspective = base.nodePerspective;

  const validDiagramModes = new Set(['linear', 'swimlane']);
  if (!validDiagramModes.has(String(next.procDiagramMode || ''))) next.procDiagramMode = base.procDiagramMode;
  next.procDiagramShowEntities = next.procDiagramShowEntities !== false;
  next.procDiagramShowTasks = next.procDiagramShowTasks === true;

  const validDataViews = new Set(['relation', 'state']);
  if (!validDataViews.has(String(next.dataView || ''))) next.dataView = base.dataView;

  next.sidebarCollapsed = Boolean(next.sidebarCollapsed);
  next.sidebarW = Math.max(200, Number(next.sidebarW) || base.sidebarW);
  next.procDrawerW = Math.max(360, Number(next.procDrawerW) || base.procDrawerW);
  next.entityDrawerW = Math.max(620, Number(next.entityDrawerW) || base.entityDrawerW);
  next.stageGraphZoom = Math.max(0.6, Math.min(1.8, Number(next.stageGraphZoom) || base.stageGraphZoom));
  next.roleQuery = String(next.roleQuery || '');
  next.roleParticipatingOnly = Boolean(next.roleParticipatingOnly);
  next.procEditorFocusSelector = String(next.procEditorFocusSelector || '');
  next.stepNoteEditKey = String(next.stepNoteEditKey || '');
  next.orchestrationNoteEditKey = String(next.orchestrationNoteEditKey || '');
  next.stageNameEditId = '';

  const processes = Array.isArray(doc?.processes) ? doc.processes : [];
  if (!processes.some((proc) => proc?.id === next.procId)) {
    next.procId = base.procId;
  }
  const activeProc = processes.find((proc) => proc?.id === next.procId) || null;
  const procNodes = Array.isArray(activeProc?.nodes) ? activeProc.nodes : [];
  if (!procNodes.some((node) => node?.id === next.taskId)) {
    next.taskId = null;
  }

  const stageItems = getStageItems(doc);
  if (!stageItems.some((stage) => stage?.id === next.stageId)) {
    next.stageId = base.stageId;
  }

  const entities = Array.isArray(doc?.entities) ? doc.entities : [];
  if (!entities.some((entity) => entity?.id === next.entityId)) {
    next.entityId = entities[0]?.id || null;
  }
  const activeEntity = entities.find((entity) => entity?.id === next.entityId) || null;
  const statusFieldNames = (Array.isArray(activeEntity?.fields) ? activeEntity.fields : [])
    .filter((field) => isStatusFieldCandidate(field))
    .map((field) => String(field?.name || ''))
    .filter(Boolean);
  if (!statusFieldNames.includes(String(next.stateFieldName || ''))) {
    next.stateFieldName = statusFieldNames[0] || '';
  }

  const roles = Array.isArray(doc?.roles) ? doc.roles : [];
  if (!roles.some((role) => role && typeof role === 'object' && role.id === next.roleId)) {
    next.roleId = getFirstRoleId(doc);
  }

  return next;
}

function setActiveDocumentSession(doc, options = {}) {
  const previousUi = options.preserveUiState ? S.ui : null;
  const previousViewport = options.preserveUiState ? captureUiViewportState() : null;
  clearPendingUiNavigationHistory();
  hydrateDocumentForUi(doc);
  if (doc.meta && !doc.meta.domain) {
    doc.meta.domain = options.domain || options.fileName || '';
  }
  S.doc = doc;
  S.currentFile = options.fileName || null;
  S.documentRevision = Math.max(0, Number(doc?.meta?.revision) || 0);
  S.baseDocument = cloneDocument(doc);
  S.modified = false;
  S.ui = options.preserveUiState
    ? getPreservedDocUiState(doc, previousUi)
    : createDocUiState(doc);
  S.ui.procAttachmentUpload = { active: false, percent: 0, message: '' };
  render();
  if (options.preserveUiState) {
    restoreUiViewportState(previousViewport);
  }
}

function closeModalById(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function openModalById(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function showAppToast(message, timeout = 3600) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  toast.textContent = String(message || '');
  toast.classList.toggle('hidden', !message);
  if (appToastTimer) clearTimeout(appToastTimer);
  if (message && timeout > 0) {
    appToastTimer = setTimeout(() => {
      toast.classList.add('hidden');
      toast.textContent = '';
      appToastTimer = null;
    }, timeout);
  }
}

function renderWorkspaceFileList(files) {
  const fileList = document.getElementById('file-list');
  if (!fileList) return;
  fileList.innerHTML = files.length
    ? files.map((fileName) => `
        <div class="file-list-item" onclick='App.openFile(${JSON.stringify(fileName)})'>
          <button class="file-list-item-main" type="button">
            <span class="file-list-item-name">${esc(fileName)}</span>
          </button>
          <div class="file-list-item-actions">
            <button class="btn btn-outline btn-sm" type="button"
              onclick='event.stopPropagation();App.openHistoryModal(${JSON.stringify(fileName)})'>历史</button>
            <button class="file-list-item-del" type="button"
              onclick='event.stopPropagation();App.deleteFile(${JSON.stringify(fileName)})' title="删除">×</button>
          </div>
        </div>`).join('')
    : '<div class="file-empty">暂无工作区文档。</div>';
}

function renderHistoryEntries(docName, entries) {
  const subtitle = document.getElementById('history-modal-subtitle');
  if (subtitle) {
    subtitle.textContent = docName ? `当前文档：${docName}` : '';
  }
  const list = document.getElementById('history-list');
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = '<div class="file-empty">当前文档还没有历史快照。</div>';
    return;
  }
  list.innerHTML = entries.map((entry) => `
    <div class="recovery-item">
      <div class="recovery-item-main">
        <div class="recovery-item-title">${esc(entry.label || entry.id || '')}</div>
        <div class="recovery-item-meta">恢复前会先自动保存当前版本快照。</div>
      </div>
      <button class="btn btn-primary btn-sm" type="button"
        onclick='App.restoreHistory(${JSON.stringify(docName)}, ${JSON.stringify(entry.id)})'>恢复</button>
    </div>`).join('');
}

function renderTrashEntries(entries) {
  const list = document.getElementById('trash-list');
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = '<div class="file-empty">回收站当前为空。</div>';
    return;
  }
  list.innerHTML = entries.map((entry) => `
    <div class="recovery-item">
      <div class="recovery-item-main">
        <div class="recovery-item-title">${esc(entry.doc_name || '')}</div>
        <div class="recovery-item-meta">${esc(entry.timestamp || '')}</div>
      </div>
      <button class="btn btn-primary btn-sm" type="button"
        onclick='App.restoreTrash(${JSON.stringify(entry.id)})'>恢复</button>
    </div>`).join('');
}

function syncOpenModalTabs() {
  const activeTab = S.recovery.openTab || 'workspace';
  document.querySelectorAll('[data-open-tab]').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-open-tab') === activeTab);
  });
  document.getElementById('open-workspace-panel')?.classList.toggle('hidden', activeTab !== 'workspace');
  document.getElementById('open-trash-panel')?.classList.toggle('hidden', activeTab !== 'trash');
}

function renderMergeWorkspaceList() {
  const files = S.merge.workspaceFiles || [];
  const leftSelect = document.getElementById('merge-left-select');
  const rightSelect = document.getElementById('merge-right-select');
  if (!leftSelect || !rightSelect) return;
  const options = ['<option value="">请选择文档</option>']
    .concat(files.map((fileName) => `<option value="${esc(fileName)}">${esc(fileName)}</option>`))
    .join('');
  leftSelect.innerHTML = options;
  rightSelect.innerHTML = options;
  leftSelect.value = S.merge.workspaceNames?.left || '';
  rightSelect.value = S.merge.workspaceNames?.right || '';
}

function syncMergeWorkspaceUi() {
  renderMergeWorkspaceList();
  syncMergePrimaryButton();
}

function clearMergeAnalysisState() {
  S.merge.analysis = null;
  S.merge.resolutions = {};
  renderMergeAnalysis(null);
  syncMergePrimaryButton();
}

function setMergeSource(kind, { workspaceName = '', label = '', document = null } = {}) {
  S.merge.workspaceNames[kind] = workspaceName;
  S.merge.labels[kind] = label || workspaceName;
  S.merge.documents[kind] = document;
  clearMergeAnalysisState();
  syncMergeWorkspaceUi();
}

function getMergeSelectedName(kind) {
  const select = document.getElementById(`merge-${kind}-select`);
  const selected = String(select?.value || '').trim();
  return selected || String(S.merge.workspaceNames?.[kind] || '').trim();
}

async function ensureMergeWorkspaceDocuments() {
  const payload = { mode: 'combine' };
  for (const kind of ['left', 'right']) {
    const selectedName = getMergeSelectedName(kind);
    if (!selectedName) continue;
    if (S.merge.workspaceNames?.[kind] !== selectedName || !S.merge.documents?.[kind]) {
      const document = await api.load(selectedName);
      if (document.error) {
        return { error: document.error };
      }
      S.merge.workspaceNames[kind] = selectedName;
      S.merge.labels[kind] = selectedName;
      S.merge.documents[kind] = document;
    }
    payload[`${kind}_document`] = S.merge.documents[kind];
  }
  syncMergeWorkspaceUi();
  return payload;
}

function stripJsonExtension(name) {
  return String(name || '').replace(/\.json$/i, '');
}

function getMergeResultDraftName() {
  const [firstName, secondName] = [
    stripJsonExtension(S.merge.labels?.left || S.merge.workspaceNames?.left || 'left'),
    stripJsonExtension(S.merge.labels?.right || S.merge.workspaceNames?.right || 'right'),
  ].sort((leftName, rightName) => leftName.localeCompare(rightName, 'zh-CN'));
  return `${firstName}-${secondName}-合并`;
}

function getMergeSaveName(result) {
  return String(
    result?.suggested_name
      || result?.merged_document?.meta?.domain
      || result?.merged_document?.meta?.title
      || getMergeResultDraftName(),
  ).trim();
}

function renderCompareWorkspaceList() {
  const files = S.compare.workspaceFiles || [];
  ['left', 'right'].forEach((kind) => {
    const docSelect = document.getElementById(`compare-${kind}-select`);
    const versionSelect = document.getElementById(`compare-${kind}-version-select`);
    if (!docSelect || !versionSelect) return;
    docSelect.innerHTML = ['<option value="">请选择文档</option>']
      .concat(files.map((fileName) => `<option value="${esc(fileName)}">${esc(fileName)}</option>`))
      .join('');
    docSelect.value = S.compare.workspaceNames?.[kind] || '';
    docSelect.disabled = !!S.compare.isRunning;
    const versions = S.compare.versions?.[kind] || [];
    versionSelect.innerHTML = ['<option value="">当前版本</option>']
      .concat(versions.map((entry) => `<option value="${esc(entry.id || '')}">${esc(entry.label || entry.id || '')}</option>`))
      .join('');
    versionSelect.value = S.compare.versionIds?.[kind] || '';
    versionSelect.disabled = !!S.compare.isRunning || !S.compare.workspaceNames?.[kind];
  });
}

function syncCompareWorkspaceUi() {
  renderCompareWorkspaceList();
  syncCompareControls();
}

function getCompareSelectedName(kind) {
  const select = document.getElementById(`compare-${kind}-select`);
  return String(select?.value || S.compare.workspaceNames?.[kind] || '').trim();
}

function getCompareSelectedVersionId(kind) {
  const select = document.getElementById(`compare-${kind}-version-select`);
  return String(select?.value || S.compare.versionIds?.[kind] || '').trim();
}

function getCompareVersionLabel(kind, snapshotId) {
  if (!snapshotId) return '当前版本';
  const entry = (S.compare.versions?.[kind] || []).find((item) => item.id === snapshotId);
  return entry?.label || snapshotId;
}

function clearCompareResult() {
  S.compare.result = null;
  S.compare.needsRun = false;
  renderCompareResult(null);
  syncCompareControls();
}

let compareResultRequestSeq = 0;

function hasCompareSelection() {
  return Boolean(getCompareSelectedName('left') && getCompareSelectedName('right'));
}

function syncCompareControls() {
  const startButton = document.getElementById('compare-start-button');
  const progress = document.getElementById('compare-progress');
  const progressMessage = document.getElementById('compare-progress-message');
  const isRunning = !!S.compare.isRunning;
  if (startButton) {
    const shouldDisable = isRunning || !hasCompareSelection();
    startButton.disabled = shouldDisable;
    if (shouldDisable) startButton.setAttribute('disabled', 'disabled');
    else startButton.removeAttribute('disabled');
    startButton.textContent = isRunning ? '比对中...' : '开始比对';
  }
  progress?.classList.toggle('hidden', !isRunning);
  if (progressMessage) {
    progressMessage.textContent = S.compare.runMessage || '正在比对...';
  }
}

function markCompareNeedsRun(message = '选择已变化，点击“开始比对”生成新的版本报告。') {
  S.compare.needsRun = hasCompareSelection();
  S.compare.runMessage = message;
  S.compare.result = null;
  renderCompareResult(null);
  syncCompareControls();
}

function syncMergePrimaryButton() {
  const button = document.querySelector('[data-testid="merge-confirm-button"]');
  if (!button) return;
  if (S.merge.isChecking) {
    button.textContent = '检查中...';
    button.disabled = true;
    return;
  }
  button.disabled = false;
  button.textContent = S.merge.analysis ? '生成合并文档' : '合并前检查';
}

function normalizeCompareValue(value) {
  if (value === undefined) return '';
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  return value;
}

const COMPARE_INTERNAL_META_PATHS = new Set([
  'meta.document_uid',
  'meta.schema_version',
  'meta.revision',
  'meta.title',
  'meta.domain',
]);

const COMPARE_INTERNAL_UID_KEYS = new Set([
  'uid',
  'versionUid',
  'currentVersionUid',
]);

function shouldSkipCompareKey(key, path) {
  return COMPARE_INTERNAL_UID_KEYS.has(key) || COMPARE_INTERNAL_META_PATHS.has(path);
}

function getCompareCollectionKeyFromPrefix(prefix) {
  const part = String(prefix || '').split('.').filter(Boolean).pop() || '';
  const match = part.match(/^([^\[]+)/);
  return match ? match[1] : part;
}

function getCompareArrayItemIdentity(collectionKey, item, index) {
  if (!item || typeof item !== 'object') return String(index + 1);
  const uid = String(item.uid || '').trim();
  if (uid) return `uid:${uid}`;
  if (collectionKey === 'language') {
    const term = String(item.term || item.name || '').trim();
    if (term) return `term:${term}`;
  }
  if (collectionKey === 'relations') {
    const parts = [item.from, item.to, item.type, item.label].map((value) => String(value || '').trim());
    if (parts.some(Boolean)) return `relation:${parts.join('|')}`;
  }
  if (collectionKey === 'state_transitions') {
    const parts = [item.field_name, item.from, item.to, item.action].map((value) => String(value || '').trim());
    if (parts.some(Boolean)) return `transition:${parts.join('|')}`;
  }
  if (collectionKey === 'edges') {
    const parts = [item.from, item.to, item.label].map((value) => String(value || '').trim());
    if (parts.some(Boolean)) return `edge:${parts.join('|')}`;
  }
  const name = String(item.name || item.title || item.term || item.target || '').trim();
  if (name) return `name:${name}`;
  return String(index + 1);
}

function buildCompareArrayPathToken(collectionKey, item, index, usedKeys) {
  const rawKey = getCompareArrayItemIdentity(collectionKey, item, index);
  const duplicateIndex = usedKeys.get(rawKey) || 0;
  usedKeys.set(rawKey, duplicateIndex + 1);
  const scopedKey = duplicateIndex ? `${rawKey}#${duplicateIndex + 1}` : rawKey;
  return encodeURIComponent(scopedKey);
}

function findCompareArrayItemByToken(items, collectionKey, encodedToken) {
  const targetToken = String(encodedToken || '');
  const usedKeys = new Map();
  return (items || []).find((item, index) => (
    buildCompareArrayPathToken(collectionKey, item, index, usedKeys) === targetToken
  ));
}

function flattenCompareValue(value, prefix = '', output = {}) {
  const normalized = normalizeCompareValue(value);
  if (Array.isArray(normalized)) {
    const collectionKey = getCompareCollectionKeyFromPrefix(prefix);
    const usedKeys = new Map();
    normalized.forEach((item, index) => {
      const token = buildCompareArrayPathToken(collectionKey, item, index, usedKeys);
      flattenCompareValue(item, `${prefix}[${token}]`, output);
    });
    if (!normalized.length && prefix) output[prefix] = [];
    return output;
  }
  if (normalized && typeof normalized === 'object') {
    const keys = Object.keys(normalized).sort();
    keys.forEach((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (shouldSkipCompareKey(key, path)) return;
      flattenCompareValue(normalized[key], path, output);
    });
    if (!keys.length && prefix) output[prefix] = {};
    return output;
  }
  if (prefix) output[prefix] = normalized;
  return output;
}

function valueDigest(value) {
  return JSON.stringify(value);
}

function isEmptyCompareContainer(value) {
  if (Array.isArray(value)) return value.length === 0;
  return Boolean(value && typeof value === 'object' && !Object.keys(value).length);
}

function isImplicitDefaultCompareValue(path, value) {
  if (value === '' || value === null || value === undefined) return true;
  if (isEmptyCompareContainer(value)) return true;
  if (/\.pos\.[rc]$/.test(path) && Number(value) === 1) return true;
  if (/\.(pos|stagePos|markerPos|labelPos|panoramaPos)\.[xy]$/.test(path) && Number(value) === 0) return true;
  return false;
}

function hasCompareDescendant(map, path) {
  const childObjectPrefix = `${path}.`;
  const childArrayPrefix = `${path}[`;
  return Object.keys(map).some((key) => key.startsWith(childObjectPrefix) || key.startsWith(childArrayPrefix));
}

function compactCompareValue(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return '';
  return String(text).length > 120 ? `${String(text).slice(0, 117)}...` : String(text);
}

const COMPARE_TOP_LEVEL_LABELS = {
  meta: '基本信息',
  panorama: '业务全景',
  businessDomains: '业务域',
  roles: '角色',
  language: '统一语言',
  stages: '业务阶段',
  stageLinks: '阶段关系',
  stageFlowRefs: '阶段流程',
  stageFlowLinks: '阶段流程连线',
  processes: '流程',
  entities: '实体',
  relations: '实体关系',
  rules: '规则',
  businessComponents: '业务组件',
  businessConstructs: '业务构件',
  taskDefinitions: '任务定义',
};

const COMPARE_BUSINESS_LEVELS = {
  valueStream: {
    id: 'valueStream',
    rank: 1,
    label: 'L1 价值流',
    note: '判断业务活动在全景价值链上的覆盖位置。',
  },
  businessDomain: {
    id: 'businessDomain',
    rank: 2,
    label: 'L2 业务域',
    note: '判断产品、业务线或责任边界的差异。',
  },
  stage: {
    id: 'stage',
    rank: 3,
    label: 'L3 阶段',
    note: '判断业务段落、阶段归属和阶段内流程组织。',
  },
  process: {
    id: 'process',
    rank: 4,
    label: 'L4 流程',
    note: '判断可发起事项的触发、办理和办结口径。',
  },
  node: {
    id: 'node',
    rank: 5,
    label: 'L5 流程节点',
    note: '判断节点职责、顺序、参与角色和流转内容。',
  },
  step: {
    id: 'step',
    rank: 6,
    label: 'L6 步骤',
    note: '判断一线用户操作步骤和办理口径。',
  },
  form: {
    id: 'form',
    rank: 6.1,
    label: 'L6 表单',
    note: '判断表单分组、字段、必填和实体字段映射。',
  },
  entity: {
    id: 'entity',
    rank: 6.2,
    label: 'L6 实体',
    note: '判断实体、字段、状态和关系是否支撑流程。',
  },
  task: {
    id: 'task',
    rank: 6.3,
    label: 'L6 任务',
    note: '判断系统编排任务、规则校验和服务动作。',
  },
  asset: {
    id: 'asset',
    rank: 7,
    label: '组件/数据/规则',
    note: '判断复用资产、实体字段、状态和规则口径。',
  },
  document: {
    id: 'document',
    rank: 8,
    label: '文档信息',
    note: '判断标题、作者、说明等辅助信息。',
  },
};

const COMPARE_REPORT_SECTIONS = [
  { id: 'valueStream', title: '（一）价值流差异分析结果', emptyText: '没有价值流层差异。' },
  { id: 'businessDomain', title: '（二）业务域差异分析结果', emptyText: '没有业务域层差异。' },
  { id: 'stage', title: '（三）阶段差异分析结果', emptyText: '没有阶段层差异。' },
  { id: 'process', title: '（四）流程差异分析结果', emptyText: '没有流程层差异。' },
  { id: 'node', title: '（五）流程节点差异分析结果', emptyText: '没有流程节点层差异。' },
  { id: 'step', title: '（六-1）步骤差异分析结果', emptyText: '没有步骤层差异。' },
  { id: 'form', title: '（六-2）表单差异分析结果', emptyText: '没有表单层差异。' },
  { id: 'entity', title: '（六-3）实体差异分析结果', emptyText: '没有实体层差异。' },
  { id: 'task', title: '（六-4）任务差异分析结果', emptyText: '没有任务层差异。' },
  { id: 'asset', title: '其他组件与规则差异分析结果', emptyText: '没有其他组件或规则差异。' },
  { id: 'document', title: '文档信息差异分析结果', emptyText: '没有文档信息差异。' },
];

const COMPARE_LAYOUT_CHECKS = [
  { id: 'panorama', title: '全景视图', itemNoun: '全景元素' },
  { id: 'stage', title: '阶段视图', itemNoun: '阶段/连线' },
  { id: 'process', title: '流程视图', itemNoun: '流程节点' },
  { id: 'entityRelation', title: '实体关系图', itemNoun: '实体/关系' },
  { id: 'entityState', title: '实体状态图', itemNoun: '状态节点/流转' },
];

const COMPARE_FIELD_LABELS = {
  title: '标题',
  domain: '业务域',
  author: '作者',
  date: '日期',
  id: '编号',
  name: '名称',
  desc: '说明',
  group: '分组',
  subDomain: '业务域',
  flowGroup: '阶段内分组',
  trigger: '触发',
  outcome: '预期结果',
  role_id: '角色',
  role: '角色',
  role_ids: '角色',
  repeatable: '可退回',
  type: '类型',
  target: '目标',
  note: '说明',
  rules_note: '规则说明',
  applies_to: '适用对象',
  description: '描述',
  formula: '公式',
  from: '起点',
  to: '终点',
  label: '标签',
  state_values: '状态值',
  status_role: '状态角色',
  is_status: '状态字段',
  is_key: '主键',
  field_name: '状态字段',
  action: '动作',
  purpose: '用途',
  entity_id: '关联实体',
  entity_field: '实体字段',
  required: '必填',
  content: '内容',
  constructId: '业务构件',
  businessConstructId: '业务构件',
  businessComponentId: '业务组件',
  taskDefinitionId: '任务定义',
  querySourceKind: '查询来源',
  processId: '流程',
  stageId: '阶段',
};

const COMPARE_COLLECTION_ITEM_LABELS = {
  roles: '角色',
  language: '术语',
  stages: '阶段',
  processes: '流程',
  entities: '实体',
  nodes: '节点',
  tasks: '节点',
  userSteps: '用户步骤',
  entity_ops: '实体操作',
  orchestrationTasks: '编排任务',
  businessRules: '业务规则',
  forms: '表单',
  sections: '分组',
  fields: '字段',
  state_nodes: '状态节点',
  state_transitions: '状态流转',
  relations: '关系',
  rules: '规则',
  businessComponents: '业务组件',
  businessConstructs: '业务构件',
  taskDefinitions: '任务定义',
  prototypeFiles: '流程原型',
  versions: '版本',
};

function tokenizeComparePath(path) {
  return String(path || '').split('.').filter(Boolean).map((part) => {
    const match = part.match(/^([^\[]+)(?:\[([^\]]+)\])?$/);
    const rawIndex = match?.[2];
    return {
      key: match ? match[1] : part,
      index: rawIndex !== undefined ? (/^\d+$/.test(rawIndex) ? Number(rawIndex) : rawIndex) : null,
    };
  });
}

function getCompareValueAtTokens(document, tokens) {
  let cursor = document;
  for (const token of tokens) {
    if (cursor == null) return null;
    cursor = cursor[token.key];
    if (token.index !== null) {
      cursor = Array.isArray(cursor)
        ? (typeof token.index === 'number'
          ? cursor[token.index]
          : findCompareArrayItemByToken(cursor, token.key, token.index))
        : null;
    }
  }
  return cursor;
}

function getCompareItemTitle(collectionKey, item, index) {
  const prefix = COMPARE_COLLECTION_ITEM_LABELS[collectionKey] || collectionKey;
  if (!item || typeof item !== 'object') return `${prefix} ${index + 1}`;
  if (collectionKey === 'language') return `${prefix} ${item.term || item.name || index + 1}`;
  if (collectionKey === 'state_transitions') {
    return `${prefix} ${[item.from, item.to].filter(Boolean).join(' → ') || index + 1}`;
  }
  if (collectionKey === 'relations') {
    const endpoints = [item.from, item.to].filter(Boolean).join(' → ');
    const label = String(item.label || item.name || '').trim();
    if (endpoints && label) return `${prefix} ${endpoints}（${label}）`;
    return `${prefix} ${endpoints || label || index + 1}`;
  }
  const id = String(item.id || '').trim();
  const name = String(item.name || item.title || item.term || item.target || '').trim();
  if (id && name && id !== name) return `${prefix} ${id} ${name}`;
  if (name) return `${prefix} ${name}`;
  if (id) return `${prefix} ${id}`;
  return `${prefix} ${typeof index === 'number' ? index + 1 : decodeURIComponent(String(index || ''))}`;
}

function getCompareFieldLabel(tokens) {
  const fieldKey = tokens[tokens.length - 1]?.key || '';
  const parentCollection = [...tokens].reverse().find((token) => token.index !== null)?.key || '';
  if (fieldKey === 'name') {
    const subject = COMPARE_COLLECTION_ITEM_LABELS[parentCollection] || '';
    return subject ? `${subject}名称` : '名称';
  }
  if (fieldKey === 'id') {
    const subject = COMPARE_COLLECTION_ITEM_LABELS[parentCollection] || '';
    return subject ? `${subject}编号` : '编号';
  }
  return COMPARE_FIELD_LABELS[fieldKey] || fieldKey || '内容';
}

function isCompareBusinessRulePath(tokens) {
  const keys = tokens.map((token) => token.key);
  const lastKey = keys[keys.length - 1] || '';
  const topKey = keys[0] || '';
  const layoutKeys = new Set(['pos', 'stagePos', 'markerPos', 'labelPos', 'panoramaPos', 'panoramaSlot', 'panoramaColumnUid', 'panoramaLaneUid']);
  if (keys.some((key) => layoutKeys.has(key))) return false;
  const businessKeys = new Set([
    'from',
    'to',
    'type',
    'label',
    'action',
    'description',
    'rules_note',
    'businessRules',
    'entity_ops',
    'entity_id',
    'entity_field',
    'forms',
    'sections',
    'fields',
    'state_transitions',
  ]);
  if (businessKeys.has(lastKey) || keys.some((key) => businessKeys.has(key))) return true;
  return topKey === 'relations' && !['pos', 'labelPos'].includes(lastKey);
}

function isCompareLayoutPath(tokens) {
  if (isCompareBusinessRulePath(tokens)) return false;
  const keys = tokens.map((token) => token.key);
  if (keys[0] === 'panorama') return true;
  const layoutKeys = new Set(['pos', 'stagePos', 'markerPos', 'labelPos', 'panoramaPos', 'panoramaSlot', 'panoramaColumnUid', 'panoramaLaneUid']);
  if (keys.some((key) => layoutKeys.has(key))) return true;
  const lastKey = keys[keys.length - 1] || '';
  const parentKey = keys[keys.length - 2] || '';
  return ['x', 'y', 'row', 'col', 'order'].includes(lastKey) && layoutKeys.has(parentKey);
}

function getCompareImpact(section, fieldLabel, isLayout) {
  if (isLayout) return 'layout';
  if (/规则|状态流转|状态字段|关联实体|实体字段|角色|触发|预期结果|流程名称|实体名称|业务组件|业务构件|任务定义/.test(fieldLabel)) {
    return 'high';
  }
  if (['流程', '实体', '规则', '角色', '业务组件', '业务构件', '任务定义'].includes(section)) {
    return 'high';
  }
  if (/说明|备注|描述|用途|标题|业务域/.test(fieldLabel)) return 'medium';
  return 'medium';
}

function getCompareBusinessLevel(tokens, section) {
  const keys = tokens.map((token) => token.key);
  const topKey = tokens[0]?.key || '';
  const hasKey = (...candidates) => candidates.some((key) => keys.includes(key));
  if (topKey === 'entities' || topKey === 'relations' || hasKey('entity_ops')) return COMPARE_BUSINESS_LEVELS.entity;
  if (hasKey('forms', 'sections')) return COMPARE_BUSINESS_LEVELS.form;
  if (hasKey('userSteps', 'steps')) return COMPARE_BUSINESS_LEVELS.step;
  if (hasKey('orchestrationTasks', 'businessRules') || topKey === 'taskDefinitions' || topKey === 'rules') return COMPARE_BUSINESS_LEVELS.task;
  if (hasKey('nodes', 'tasks')) return COMPARE_BUSINESS_LEVELS.node;
  if (hasKey('processes')) return COMPARE_BUSINESS_LEVELS.process;
  if (hasKey('stages', 'stageLinks', 'stageFlowRefs', 'stageFlowLinks')) return COMPARE_BUSINESS_LEVELS.stage;
  if (hasKey('businessDomains', 'lanes') || section === '业务域') return COMPARE_BUSINESS_LEVELS.businessDomain;
  if (hasKey('panorama', 'valueStreams', 'columns')) return COMPARE_BUSINESS_LEVELS.valueStream;
  if (['业务组件', '业务构件'].includes(section)) {
    return COMPARE_BUSINESS_LEVELS.asset;
  }
  return COMPARE_BUSINESS_LEVELS.document;
}

function stringifyCompareToken(token) {
  return token.index === null ? token.key : `${token.key}[${token.index}]`;
}

function stringifyCompareTokens(tokens) {
  return tokens.map((token) => stringifyCompareToken(token)).join('.');
}

function valueExistsForCompare(value) {
  return value !== undefined && value !== null;
}

function getCompareCrumbLabels(tokens, document) {
  const labels = [];
  tokens.forEach((token, index) => {
    if (token.index === null) return;
    const itemTokens = tokens.slice(0, index + 1);
    const item = getCompareValueAtTokens(document, itemTokens);
    labels.push(getCompareItemTitle(token.key, item, token.index));
  });
  return labels;
}

function getCompareChangeScope(tokens, leftDocument, rightDocument, presentSide, section) {
  const presentDocument = presentSide === 'left' ? leftDocument : rightDocument;
  const missingDocument = presentSide === 'left' ? rightDocument : leftDocument;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.index === null) continue;
    const itemTokens = tokens.slice(0, index + 1);
    const presentValue = getCompareValueAtTokens(presentDocument, itemTokens);
    const missingValue = getCompareValueAtTokens(missingDocument, itemTokens);
    if (!valueExistsForCompare(presentValue) || valueExistsForCompare(missingValue)) continue;
    const labels = getCompareCrumbLabels(itemTokens, presentDocument);
    return {
      scopeKey: stringifyCompareTokens(itemTokens),
      scopeLabel: labels[labels.length - 1] || getCompareItemTitle(token.key, presentValue, token.index),
      scopeContext: labels.slice(0, -1).join(' / '),
      scopeCollection: token.key,
      businessLevel: getCompareBusinessLevel(itemTokens, section),
    };
  }
  return {};
}

function describeComparePath(path, leftDocument, rightDocument) {
  const tokens = tokenizeComparePath(path);
  const topKey = tokens[0]?.key || '';
  const section = COMPARE_TOP_LEVEL_LABELS[topKey] || topKey || '其他';
  const crumbs = [];
  tokens.forEach((token, index) => {
    if (token.index === null) return;
    const itemTokens = tokens.slice(0, index + 1);
    const item = getCompareValueAtTokens(leftDocument, itemTokens)
      || getCompareValueAtTokens(rightDocument, itemTokens);
    crumbs.push(getCompareItemTitle(token.key, item, token.index));
  });
  const fieldLabel = getCompareFieldLabel(tokens);
  const isLayout = isCompareLayoutPath(tokens);
  return {
    section,
    itemLabel: crumbs.length ? crumbs.join(' / ') : section,
    fieldLabel,
    businessLevel: getCompareBusinessLevel(tokens, section),
    impact: getCompareImpact(section, fieldLabel, isLayout),
    isLayout,
  };
}

function buildDocumentCompareResult(leftDocument, rightDocument) {
  const leftMap = flattenCompareValue(leftDocument);
  const rightMap = flattenCompareValue(rightDocument);
  const paths = Array.from(new Set([...Object.keys(leftMap), ...Object.keys(rightMap)])).sort();
  const added = [];
  const removed = [];
  const changed = [];
  paths.forEach((path) => {
    const tokens = tokenizeComparePath(path);
    const inLeft = Object.prototype.hasOwnProperty.call(leftMap, path);
    const inRight = Object.prototype.hasOwnProperty.call(rightMap, path);
    const view = describeComparePath(path, leftDocument, rightDocument);
    if (!inLeft && inRight) {
      if (isImplicitDefaultCompareValue(path, rightMap[path])) return;
      if (isEmptyCompareContainer(rightMap[path]) && hasCompareDescendant(leftMap, path)) return;
      const scope = getCompareChangeScope(tokens, leftDocument, rightDocument, 'right', view.section);
      added.push({ path, right: rightMap[path], ...view, ...scope });
      return;
    }
    if (inLeft && !inRight) {
      if (isImplicitDefaultCompareValue(path, leftMap[path])) return;
      if (isEmptyCompareContainer(leftMap[path]) && hasCompareDescendant(rightMap, path)) return;
      const scope = getCompareChangeScope(tokens, leftDocument, rightDocument, 'left', view.section);
      removed.push({ path, left: leftMap[path], ...view, ...scope });
      return;
    }
    if (valueDigest(leftMap[path]) !== valueDigest(rightMap[path])) {
      changed.push({ path, left: leftMap[path], right: rightMap[path], ...view });
    }
  });
  return { added, removed, changed, sameCount: paths.length - added.length - removed.length - changed.length };
}

function groupCompareItemsBySection(items) {
  return items.reduce((groups, item) => {
    const section = item.section || '其他';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(item);
    return groups;
  }, new Map());
}

function uniqueCompareItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.section}::${item.itemLabel}::${item.fieldLabel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueCompareLayoutItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.section}::${item.itemLabel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatCompareBusinessValue(value) {
  if (value === undefined || value === null || value === '') return '未填写';
  if (value === true) return '是';
  if (value === false) return '否';
  return `“${compactCompareValue(value)}”`;
}

function summarizeCompareFields(items) {
  const fields = Array.from(new Set(items.map((item) => item.fieldLabel || '内容'))).filter(Boolean);
  if (!fields.length) return '内容';
  if (fields.length <= 4) return fields.join('、');
  return `${fields.slice(0, 4).join('、')}等 ${fields.length} 项`;
}

function getCompareBusinessNoun(item) {
  const id = item.businessLevel?.id || '';
  const nouns = {
    valueStream: '价值流',
    businessDomain: '业务域',
    stage: '阶段',
    process: '流程',
    node: '流程节点',
    step: '步骤',
    form: '表单',
    entity: '实体',
    task: '任务',
    asset: item.section || '组件',
    document: item.section || '文档信息',
  };
  return nouns[id] || item.section || '模型内容';
}

function formatCompareSubject(item) {
  const subject = item.scopeLabel || item.itemLabel || item.section || '模型内容';
  const noun = getCompareBusinessNoun(item);
  return subject.startsWith(noun) ? subject : `${noun}${subject}`;
}

function countCompareCollectionItems(items, collectionKey) {
  const paths = new Set();
  items.forEach((item) => {
    const tokens = tokenizeComparePath(item.path);
    tokens.forEach((token, index) => {
      if (token.key !== collectionKey || token.index === null) return;
      paths.add(stringifyCompareTokens(tokens.slice(0, index + 1)));
    });
  });
  return paths.size;
}

function summarizeCompareScopeItems(items) {
  const first = items[0] || {};
  const countSpecs = [
    ['tasks', '流程节点'],
    ['userSteps', '步骤'],
    ['forms', '表单'],
    ['sections', '模块/片段'],
    ['fields', '字段'],
    ['orchestrationTasks', '任务'],
    ['businessRules', '业务规则'],
    ['entity_ops', '实体操作'],
    ['state_transitions', '状态流转'],
    ['relations', '实体关系'],
  ];
  const parts = countSpecs
    .map(([collectionKey, label]) => {
      const count = countCompareCollectionItems(items, collectionKey);
      if (!count) return '';
      if (collectionKey === first.scopeCollection && count === 1) return '';
      return `${count} 个${label}`;
    })
    .filter(Boolean);
  const fields = summarizeCompareFields(items);
  if (parts.length) return `合并 ${parts.join('、')}，涉及${fields}`;
  return `涉及${fields}`;
}

function getCompareRowSortScore(row) {
  const typeScore = { 新增: 1, 删除: 2, 修改: 3 }[row.changeKind] || 9;
  return `${String(row.rank).padStart(4, '0')}-${typeScore}-${row.subject}`;
}

function buildCompareBusinessRows(businessItems) {
  const rows = [];
  const changedItems = uniqueCompareItems(businessItems.filter((item) => item.changeKind === '修改'));
  changedItems.forEach((item) => {
    const subject = formatCompareSubject(item);
    rows.push({
      subject,
      changeKind: '修改',
      levelLabel: item.businessLevel?.label || '模型',
      levelId: item.businessLevel?.id || 'document',
      rank: item.businessLevel?.rank || 99,
      detail: `修改${subject}的${item.fieldLabel || '内容'}：由${formatCompareBusinessValue(item.right)}调整为${formatCompareBusinessValue(item.left)}。`,
    });
  });

  const grouped = new Map();
  businessItems
    .filter((item) => item.changeKind === '新增' || item.changeKind === '删除')
    .forEach((item) => {
      const key = item.scopeKey
        ? `${item.changeKind}::${item.businessLevel?.id || ''}::${item.scopeKey}`
        : `${item.changeKind}::${item.businessLevel?.id || ''}::${item.section}::${item.itemLabel}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });

  Array.from(grouped.values()).forEach((items) => {
    const first = items[0];
    const subject = formatCompareSubject(first);
    const scopeSummary = summarizeCompareScopeItems(items);
    const context = first.scopeContext ? `（位于${first.scopeContext}）` : '';
    const isAdded = first.changeKind === '新增';
    rows.push({
      subject,
      changeKind: first.changeKind,
      levelLabel: first.businessLevel?.label || '模型',
      levelId: first.businessLevel?.id || 'document',
      rank: first.businessLevel?.rank || 99,
      detail: isAdded
        ? `增加${subject}${context}，${scopeSummary}。`
        : `删除${subject}${context}，${scopeSummary}。`,
    });
  });

  rows.sort((left, right) => getCompareRowSortScore(left).localeCompare(getCompareRowSortScore(right), 'zh-Hans-CN'));
  return rows;
}

function renderCompareLevelSummary(businessRows) {
  const counts = businessRows.reduce((map, row) => {
    const level = Object.values(COMPARE_BUSINESS_LEVELS).find((item) => item.id === row.levelId) || COMPARE_BUSINESS_LEVELS.document;
    map.set(level.id, { level, count: (map.get(level.id)?.count || 0) + 1 });
    return map;
  }, new Map());
  const levels = Array.from(counts.values()).sort((left, right) => left.level.rank - right.level.rank);
  if (!levels.length) return '';
  return `<div class="compare-report-section">
    <h4>流程6级模型影响</h4>
    <div class="compare-level-grid">
      ${levels.map(({ level, count }) => `<div class="compare-level-card">
        <strong>${esc(level.label)}</strong>
        <span>${count} 项差异</span>
        <em>${esc(level.note)}</em>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderCompareBusinessTable(rows, showAll = false) {
  if (!rows.length && !showAll) {
    return `<div class="compare-report-section">
      <h4>业务差异分析</h4>
      <p class="merge-inline-note">没有发现流程、数据、规则等业务内容变化；如有差异，主要体现在图形布局或位置调整。</p>
    </div>`;
  }
  const rowsByLevel = rows.reduce((map, row) => {
    if (!map.has(row.levelId)) map.set(row.levelId, []);
    map.get(row.levelId).push(row);
    return map;
  }, new Map());
  const sections = COMPARE_REPORT_SECTIONS
    .map((section) => ({ ...section, rows: rowsByLevel.get(section.id) || [] }))
    .filter((section) => showAll || section.rows.length);
  return `<div class="compare-report-section">
    <h4>业务差异分析</h4>
    <p class="merge-inline-note">默认按“新版本（左侧）相对旧版本（右侧）”解释差异，重点看业务含义，不展开 JSON 路径和坐标。</p>
    <div class="compare-business-sections">
      ${sections.map((section) => renderCompareBusinessSection(section)).join('')}
    </div>
  </div>`;
}

function renderCompareHeaderHelp(text) {
  return `<span class="compare-th-help" title="${esc(text)}">？</span>`;
}

function renderCompareBusinessSection(section) {
  const visibleRows = section.rows.slice(0, 40);
  const bodyRows = visibleRows.length
    ? visibleRows.map((row, index) => `<tr>
      <td>${index + 1}</td>
      <td><span class="compare-type-badge compare-type-${esc(row.changeKind)}">${esc(row.changeKind)}</span></td>
      <td>${esc(row.detail)}</td>
    </tr>`).join('')
    : `<tr class="compare-no-diff-row"><td colspan="3">${esc(section.emptyText || '没有差异。')}</td></tr>`;
  return `<section class="compare-business-section">
    <h5>${esc(section.title)}</h5>
    <div class="compare-business-table-wrap">
      <table class="compare-business-table">
        <thead>
          <tr>
            <th>序号 ${renderCompareHeaderHelp('本小节内的差异序号，从 1 开始排序。')}</th>
            <th>差异类型 ${renderCompareHeaderHelp('按新版本相对旧版本分类：新增、删除、修改。')}</th>
            <th>差异说明 ${renderCompareHeaderHelp('用业务语言说明新版本相对旧版本发生了什么变化。')}</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
    ${section.rows.length > visibleRows.length ? `<p class="merge-inline-note">本小节仅显示前 ${visibleRows.length} 条，请优先确认高重要级别项目。</p>` : ''}
  </section>`;
}

function renderCompareOverview(result, businessItems, layoutItems) {
  const highCount = businessItems.filter((item) => item.impact === 'high').length;
  const mediumCount = businessItems.filter((item) => item.impact === 'medium').length;
  const sections = Array.from(new Set(businessItems.map((item) => item.section))).filter(Boolean);
  const conclusions = [];
  if (!businessItems.length && layoutItems.length) {
    conclusions.push('本次主要是图形布局调整，未发现流程、数据、规则等业务内容变化。');
  } else if (!businessItems.length) {
    conclusions.push('两侧版本没有发现结构化差异。');
  } else {
    conclusions.push(`本次涉及 ${sections.join('、')} 等模型变化。`);
    if (highCount) conclusions.push(`其中 ${highCount} 项属于高影响变化，建议优先确认业务含义。`);
    if (mediumCount) conclusions.push(`${mediumCount} 项属于说明、标题或辅助信息变化。`);
  }
  if (layoutItems.length) conclusions.push(`另有 ${layoutItems.length} 项图形位置或布局变化，报告不展开具体坐标。`);
  return `<div class="compare-report-section">
    <h4>总体结论</h4>
    <ul class="compare-report-list">
      ${conclusions.map((line) => `<li>${esc(line)}</li>`).join('')}
    </ul>
  </div>`;
}

function renderCompareHighlights(businessItems) {
  if (!businessItems.length) {
    return `<div class="compare-report-section">
      <h4>重点变化</h4>
      <p class="merge-inline-note">没有发现需要业务侧重点确认的内容变化。</p>
    </div>`;
  }
  const highlights = uniqueCompareItems(businessItems)
    .sort((left, right) => {
      const score = (item) => (item.impact === 'high' ? 0 : 1);
      return score(left) - score(right);
    })
    .slice(0, 12);
  return `<div class="compare-report-section">
    <h4>重点变化</h4>
    <div class="compare-highlight-list">
      ${highlights.map((item) => `<div class="compare-highlight-item impact-${esc(item.impact || 'medium')}">
        <span>${item.impact === 'high' ? '高影响' : '中影响'}</span>
        <strong>${esc(item.itemLabel || item.section)}</strong>
        <em>${esc(item.fieldLabel || '内容')}</em>
      </div>`).join('')}
    </div>
  </div>`;
}

function getCompareLayoutCheck(item) {
  const tokens = tokenizeComparePath(item.path);
  const keys = tokens.map((token) => token.key);
  const topKey = tokens[0]?.key || '';
  if (topKey === 'panorama' || keys.includes('panoramaSlot')) return COMPARE_LAYOUT_CHECKS[0];
  if (topKey === 'stages' || topKey === 'stageLinks' || topKey === 'stageFlowRefs' || topKey === 'stageFlowLinks' || keys.includes('stagePos') || keys.includes('markerPos')) {
    return COMPARE_LAYOUT_CHECKS[1];
  }
  if (topKey === 'processes') return COMPARE_LAYOUT_CHECKS[2];
  if ((topKey === 'entities' && (keys.includes('state_nodes') || keys.includes('state_transitions'))) || keys.includes('state_nodes') || keys.includes('state_transitions')) {
    return COMPARE_LAYOUT_CHECKS[4];
  }
  if (topKey === 'entities' || topKey === 'relations') return COMPARE_LAYOUT_CHECKS[3];
  return { id: 'other', title: '其他图形布局', itemNoun: '图形元素' };
}

function buildCompareLayoutRows(layoutItems) {
  const grouped = new Map();
  layoutItems.forEach((item) => {
    const check = getCompareLayoutCheck(item);
    const objectKey = `${check.id}::${item.section}::${item.itemLabel}`;
    if (!grouped.has(check.id)) grouped.set(check.id, { ...check, items: [], seen: new Set() });
    const group = grouped.get(check.id);
    if (group.seen.has(objectKey)) return;
    group.seen.add(objectKey);
    group.items.push(item);
  });
  const rows = COMPARE_LAYOUT_CHECKS.map((check) => {
    const group = grouped.get(check.id);
    const items = group?.items || [];
    const names = items.map((item) => item.itemLabel || item.section).filter(Boolean);
    const visibleNames = names.slice(0, 6).join('、');
    const moreText = names.length > 6 ? `等 ${names.length} 项` : '';
    return {
      ...check,
      items,
      detail: items.length
        ? `${items.length} 个${check.itemNoun}位置或布局变化：${visibleNames}${moreText}。`
        : '无变化',
    };
  });
  const otherGroup = grouped.get('other');
  if (otherGroup?.items?.length) {
    const names = otherGroup.items.map((item) => item.itemLabel || item.section).filter(Boolean);
    rows.push({
      id: otherGroup.id,
      title: otherGroup.title,
      itemNoun: otherGroup.itemNoun,
      items: otherGroup.items,
      detail: `${otherGroup.items.length} 个${otherGroup.itemNoun}位置或布局变化：${names.slice(0, 6).join('、')}${names.length > 6 ? `等 ${names.length} 项` : ''}。`,
    });
  }
  return rows;
}

function countCompareLayoutChanges(layoutRows) {
  return layoutRows.reduce((sum, row) => sum + row.items.length, 0);
}

function getCompareReportMode() {
  return S.compare.reportMode === 'all' ? 'all' : 'diff';
}

function shouldSuppressLayoutForBusinessObjectChange(layoutItem, allItems) {
  if (!layoutItem?.isLayout || !['新增', '删除'].includes(layoutItem.changeKind)) return false;
  const scopeKey = layoutItem.scopeKey || '';
  if (!scopeKey) return false;
  return allItems.some((item) => (
    item !== layoutItem
    && !item.isLayout
    && item.changeKind === layoutItem.changeKind
    && item.scopeKey === scopeKey
  ));
}

function renderCompareReportHeader(mode) {
  const nextLabel = mode === 'all' ? '只看差异' : '全部报告';
  const currentLabel = mode === 'all' ? '当前：全部报告' : '当前：只看差异';
  return `<div class="compare-report-head">
    <div>
      <h3>版本比对报告</h3>
      <span>${esc(currentLabel)}</span>
    </div>
    <button type="button" class="btn btn-outline btn-sm" data-testid="compare-report-mode-toggle" onclick="App.toggleCompareReportMode()">${esc(nextLabel)}</button>
  </div>`;
}

function renderCompareLayoutSummary(layoutRows, showAll = false) {
  const visibleRows = showAll ? layoutRows : layoutRows.filter((row) => row.items.length);
  const body = visibleRows.length
    ? `<div class="compare-business-table-wrap">
      <table class="compare-layout-table">
        <thead>
          <tr>
            <th>检查项</th>
            <th>差异说明</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows.map((row) => `<tr>
            <td>${esc(row.title)}</td>
            <td>${esc(row.detail)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`
    : '<p class="merge-inline-note">没有发现图形位置、排序或标签拖拽等布局变化。</p>';
  return `<div class="compare-report-section compare-layout-report">
    <h4>图形布局差异分析</h4>
    <p class="merge-inline-note">检查图形视图中的位置、排序和连线布局，只描述变化对象，不展示坐标。</p>
    ${body}
  </div>`;
}

function renderCompareDiffList(title, items, type) {
  if (!items.length) return '';
  const groups = groupCompareItemsBySection(items.slice(0, 80));
  return `<div class="compare-diff-section">
    <h4>${esc(title)} <span>${items.length}</span></h4>
    <div class="compare-diff-list">
      ${Array.from(groups.entries()).map(([section, sectionItems]) => `<div class="compare-model-group" data-testid="compare-model-group">
        <h5>${esc(section)} <span>${sectionItems.length}</span></h5>
        ${sectionItems.map((item) => `<div class="compare-diff-item compare-diff-${type}">
          <div class="compare-diff-model-head">
            <strong>${esc(item.itemLabel || section)}</strong>
            <span>${esc(item.fieldLabel || '内容')}</span>
          </div>
          ${type === 'changed'
            ? `<div class="compare-diff-values"><span><em>新版本</em>${esc(compactCompareValue(item.left))}</span><span><em>旧版本</em>${esc(compactCompareValue(item.right))}</span></div>`
            : `<div class="compare-diff-values"><span><em>${type === 'added' ? '新版本' : '旧版本'}</em>${esc(compactCompareValue(item.left ?? item.right))}</span></div>`}
        </div>`).join('')}
      </div>`).join('')}
    </div>
    ${items.length > 80 ? `<p class="merge-inline-note">仅显示前 80 条，请优先处理高层模型差异。</p>` : ''}
  </div>`;
}

function renderCompareResult(result) {
  const container = document.getElementById('compare-result');
  if (!container) return;
  if (!result) {
    if (S.compare.isRunning) {
      container.innerHTML = '<div class="merge-empty">正在生成版本比对报告...</div>';
      return;
    }
    container.innerHTML = S.compare.needsRun
      ? '<div class="merge-empty">选择已准备好，请点击“开始比对”生成版本报告。</div>'
      : '<div class="merge-empty">请选择左右文档和版本。</div>';
    return;
  }
  const { added, removed, changed, leftLabel, rightLabel } = result;
  const withKind = [
    ...changed.map((item) => ({ ...item, changeKind: '修改' })),
    ...removed.map((item) => ({ ...item, changeKind: '新增' })),
    ...added.map((item) => ({ ...item, changeKind: '删除' })),
  ];
  const layoutItems = withKind.filter((item) => (
    item.isLayout && !shouldSuppressLayoutForBusinessObjectChange(item, withKind)
  ));
  const businessItems = withKind.filter((item) => !item.isLayout);
  const businessRows = buildCompareBusinessRows(businessItems);
  const layoutRows = buildCompareLayoutRows(layoutItems);
  const layoutChangeCount = countCompareLayoutChanges(layoutRows);
  const reportMode = getCompareReportMode();
  const showAllReport = reportMode === 'all';
  container.innerHTML = `<div class="compare-report" data-testid="compare-report">
    ${renderCompareReportHeader(reportMode)}
    <div class="compare-summary">
      <div><strong>新版本</strong><span>${esc(leftLabel)}</span></div>
      <div><strong>旧版本</strong><span>${esc(rightLabel)}</span></div>
      <div><strong>业务差异</strong><span>${businessRows.length}</span></div>
      <div><strong>布局变化</strong><span>${layoutChangeCount}</span></div>
    </div>
    ${renderCompareLevelSummary(businessRows)}
    ${renderCompareBusinessTable(businessRows, showAllReport)}
    ${renderCompareLayoutSummary(layoutRows, showAllReport)}
  </div>`;
}

async function loadCompareDocument(kind) {
  const name = getCompareSelectedName(kind);
  const snapshotId = getCompareSelectedVersionId(kind);
  if (!name) {
    S.compare.documents[kind] = null;
    S.compare.labels[kind] = '';
    return null;
  }
  let document;
  if (snapshotId) {
    const result = await api.loadHistory(name, snapshotId);
    if (result.error) return { error: result.error };
    document = result.document;
  } else {
    document = await api.load(name);
    if (document.error) return { error: document.error };
  }
  S.compare.workspaceNames[kind] = name;
  S.compare.versionIds[kind] = snapshotId;
  S.compare.documents[kind] = document;
  S.compare.labels[kind] = `${name} / ${getCompareVersionLabel(kind, snapshotId)}`;
  return document;
}

async function updateCompareResult() {
  const requestSeq = ++compareResultRequestSeq;
  const leftName = getCompareSelectedName('left');
  const rightName = getCompareSelectedName('right');
  if (!leftName || !rightName) {
    clearCompareResult();
    return;
  }
  S.compare.isRunning = true;
  S.compare.needsRun = false;
  S.compare.result = null;
  S.compare.runMessage = '正在加载左侧版本...';
  renderCompareResult(null);
  syncCompareWorkspaceUi();
  try {
    const leftLoaded = await loadCompareDocument('left');
    if (requestSeq !== compareResultRequestSeq) return;
    if (leftLoaded?.error) return alert(leftLoaded.error);
    S.compare.runMessage = '正在加载右侧版本...';
    syncCompareControls();
    const rightLoaded = await loadCompareDocument('right');
    if (requestSeq !== compareResultRequestSeq) return;
    if (rightLoaded?.error) return alert(rightLoaded.error);
    S.compare.runMessage = '正在分析业务差异...';
    syncCompareControls();
    const diff = buildDocumentCompareResult(S.compare.documents.left, S.compare.documents.right);
    if (requestSeq !== compareResultRequestSeq) return;
    S.compare.result = {
      ...diff,
      leftLabel: S.compare.labels.left,
      rightLabel: S.compare.labels.right,
    };
    S.compare.needsRun = false;
    renderCompareResult(S.compare.result);
    syncCompareWorkspaceUi();
  } finally {
    if (requestSeq === compareResultRequestSeq) {
      S.compare.isRunning = false;
      S.compare.runMessage = '';
      syncCompareWorkspaceUi();
    }
  }
}

async function loadWorkspaceDocumentNames() {
  const files = await api.files();
  if (files.error) {
    alert(files.error);
    return null;
  }
  S.files = Array.isArray(files) ? files : [];
  return S.files;
}

async function loadWorkspaceTrashEntries() {
  const entries = await api.trash();
  if (entries.error) {
    alert(entries.error);
    return null;
  }
  S.recovery.trashEntries = Array.isArray(entries) ? entries : [];
  return S.recovery.trashEntries;
}

function getSaveDialogMeta() {
  if (S.saveDialogMode === 'copy') {
    return {
      toolbarLabel: '复制',
      title: '复制文档',
      confirmLabel: '确认复制',
      placeholder: '输入新文档名称，例如：仓储仓单管理-副本',
    };
  }
  return {
    toolbarLabel: '复制',
    title: '保存文档',
    confirmLabel: '确认保存',
    placeholder: '输入文档名称，例如：仓储仓单管理-v2',
  };
}

function refreshSaveDialogText() {
  const meta = getSaveDialogMeta();
  const toolbarButton = document.getElementById('toolbar-save-as-label');
  const modalTitle = document.getElementById('save-as-modal-title');
  const confirmButton = document.getElementById('save-as-confirm-label');
  const input = document.getElementById('save-as-name');
  if (toolbarButton) {
    toolbarButton.textContent = meta.toolbarLabel;
  }
  if (modalTitle) {
    modalTitle.textContent = meta.title;
  }
  if (confirmButton) {
    confirmButton.textContent = meta.confirmLabel;
  }
  if (input) {
    input.placeholder = meta.placeholder;
  }
}

function buildSuggestedCopyName(baseName, existingNames = []) {
  const normalizedBase = String(baseName || '').trim() || '文档';
  const usedNames = new Set((existingNames || []).map((name) => String(name || '').trim()).filter(Boolean));
  const primary = `${normalizedBase}-副本`;
  if (!usedNames.has(primary)) return primary;
  let index = 2;
  while (usedNames.has(`${primary}${index}`)) {
    index += 1;
  }
  return `${primary}${index}`;
}

function openWorkspaceSaveAsModal(initialName = '', mode = 'save') {
  S.saveDialogMode = mode === 'copy' ? 'copy' : 'save';
  refreshSaveDialogText();
  const input = document.getElementById('save-as-name');
  if (input) {
    input.value = String(initialName || '').trim();
  }
  openModalById('save-as-modal-overlay');
  setTimeout(() => input?.focus(), 50);
}

function setSaveProgress(visible, percent = 0, message = '正在保存...', detailText = '') {
  const box = document.getElementById('save-progress');
  const bar = document.getElementById('save-progress-bar');
  const label = document.getElementById('save-progress-message');
  const detail = document.getElementById('save-progress-detail');
  box?.classList.toggle('hidden', !visible);
  document.body?.classList.toggle('is-saving', Boolean(visible));
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
  if (label) label.textContent = message;
  if (detail) detail.textContent = detailText || (visible ? '请稍候，正在处理文档。' : '');
}

async function requestSaveHistoryMessage(shouldCreateHistory) {
  if (!shouldCreateHistory) return '';
  const message = await showAppPrompt(
    '可以填写本次保存说明，便于以后查看历史版本；也可以留空，只记录保存时间。',
    '',
    {
      title: '保存信息',
      confirmLabel: '继续保存',
      cancelLabel: '取消保存',
    },
  );
  if (message === null) return null;
  return String(message || '').trim();
}

function syncSavingControls() {
  const disabled = Boolean(S.isSaving || S.isExporting || S.isPreviewRendering);
  ['btn-save', 'toolbar-save-as-label'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = disabled;
  });
  document.querySelector('[data-testid="toolbar-export-button"]')?.toggleAttribute('disabled', disabled);
  document.querySelector('[data-testid="preview-export-bundle"]')?.toggleAttribute('disabled', disabled);
}

function decodeBase64ToBytes(base64Content) {
  const binary = atob(String(base64Content || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getInlineAttachmentVersions(document) {
  const inlineVersions = [];
  for (const process of Array.isArray(document?.processes) ? document.processes : []) {
    for (const file of Array.isArray(process?.prototypeFiles) ? process.prototypeFiles : []) {
      for (const version of Array.isArray(file?.versions) ? file.versions : []) {
        if (version?.uploadToken || !String(version?.content || '')) continue;
        inlineVersions.push({ file, version });
      }
    }
  }
  return inlineVersions;
}

async function uploadInlineAttachmentsBeforeSave(document) {
  const inlineVersions = getInlineAttachmentVersions(document);
  if (!inlineVersions.length) return true;
  for (let index = 0; index < inlineVersions.length; index += 1) {
    const { file, version } = inlineVersions[index];
    const name = String(version.name || file.name || 'attachment').trim() || 'attachment';
    const contentType = String(version.contentType || file.contentType || 'application/octet-stream').trim() || 'application/octet-stream';
    const payload = String(version.contentEncoding || '') === 'base64'
      ? decodeBase64ToBytes(version.content)
      : String(version.content || '');
    const uploadFile = new File([payload], name, { type: contentType });
    const percent = 6 + Math.round((index / inlineVersions.length) * 28);
    setSaveProgress(true, percent, `正在预处理附件 ${index + 1}/${inlineVersions.length}`, `正在把“${name}”转为后台暂存文件。`);
    const staged = await api.uploadAttachment(uploadFile);
    if (staged?.error || !staged?.ok) {
      alert(staged?.status === 404 || staged?.error === 'not found'
        ? '附件上传接口不可用，请重启本地服务后再保存。'
        : (staged?.error || '附件预处理失败，请重试。'));
      return false;
    }
    version.uploadToken = String(staged.token || '').trim();
    version.content = '';
    version.contentEncoding = '';
    version.size = Number(staged.size || version.size || 0) || 0;
    file.uploadToken = version.uploadToken;
    file.content = '';
    file.contentEncoding = '';
    file.size = version.size;
  }
  return true;
}

async function saveWorkspaceDocument(targetName, document, { currentName = '', allowOverwrite = true } = {}) {
  if (S.isSaving) return null;
  const normalizedName = String(targetName || '').trim();
  if (!normalizedName) {
    alert('请输入业务域名称');
    return null;
  }

  const workspaceFiles = await loadWorkspaceDocumentNames();
  if (!workspaceFiles) return null;

  const willOverwrite = workspaceFiles.includes(normalizedName) && normalizedName !== currentName;
  if (willOverwrite) {
    if (!allowOverwrite) {
      alert(`已存在同名文档“${normalizedName}”，请使用其他名称。`);
      return null;
    }
    if (!await showAppConfirm(`已存在同名文档“${normalizedName}”，是否覆盖？`, {
      title: '覆盖文档',
      confirmLabel: '覆盖',
    })) {
      return null;
    }
  }
  const saveMessage = await requestSaveHistoryMessage(workspaceFiles.includes(normalizedName));
  if (saveMessage === null) return null;

  let result;
  S.isSaving = true;
  syncSavingControls();
  try {
    setSaveProgress(true, 5, '正在准备保存...', '正在检查附件和文档状态。');
    if (!await uploadInlineAttachmentsBeforeSave(document)) return null;
    const handleSaveUploadProgress = (percent) => {
      const progress = Math.max(0, Math.min(100, Number(percent) || 0));
      if (progress >= 100) {
        setSaveProgress(true, 78, '数据已发送，正在等待服务器保存...', '本地服务正在写入文档元数据并整理附件索引。');
        return;
      }
      const mapped = 36 + Math.round(progress * 0.4);
      setSaveProgress(true, mapped, `正在发送保存请求 ${progress}%`, '请保持当前页面打开。');
    };
    setSaveProgress(true, 35, '正在发送保存请求...', '文档数据正在发送到本地服务。');
    const revisionOptions = currentName && currentName === S.currentFile
      ? {
        baseRevision: S.documentRevision,
        baseDocument: S.baseDocument,
        rebase: true,
      }
      : {};
    result = currentName && currentName !== normalizedName
      ? await api.rename(currentName, normalizedName, document, willOverwrite, handleSaveUploadProgress, { saveMessage })
      : await api.save(normalizedName, document, handleSaveUploadProgress, { ...revisionOptions, saveMessage });
    setSaveProgress(true, 100, '保存完成', '文档已写入工作区。');
  } finally {
    S.isSaving = false;
    syncSavingControls();
    setTimeout(() => setSaveProgress(false), 350);
  }
  if (!result || result.error) {
    if (!result) return null;
    if (result.error === 'revision_conflict') {
      alert(result.message || '文档已被其他人保存，请重新加载或合并后再保存。');
    } else {
      alert(result.error);
    }
    return null;
  }

  if (result.rebased) {
    showAppToast('已检测到其他人的提交版本，系统已自动处理合并。');
  }
  await loadWorkspaceDocumentNames();
  return result;
}

async function copyWorkspaceDocument(sourceName, targetName) {
  if (S.isSaving) return null;
  if (!S.runtime.checked) {
    try {
      const runtime = await api.runtime();
      S.runtime.checked = true;
      S.runtime.apiVersion = Number(runtime?.api_version || 0);
      S.runtime.supportsDocs = !!runtime?.supports_docs;
      S.runtime.supportsCopy = !!runtime?.supports_copy;
    } catch (error) {
      S.runtime.checked = true;
      S.runtime.supportsCopy = false;
    }
  }
  if (!S.runtime.supportsCopy) {
    alert('当前运行的本地服务不支持复制接口，请重启 BLM 服务后再复制。');
    return null;
  }
  const normalizedSource = String(sourceName || '').trim();
  const normalizedTarget = String(targetName || '').trim();
  if (!normalizedSource || !normalizedTarget) {
    alert('请输入文档名称');
    return null;
  }
  const workspaceFiles = await loadWorkspaceDocumentNames();
  if (!workspaceFiles) return null;
  if (workspaceFiles.includes(normalizedTarget)) {
    alert(`已存在同名文档“${normalizedTarget}”，请使用其他名称。`);
    return null;
  }

  S.isSaving = true;
  syncSavingControls();
  try {
    setSaveProgress(true, 18, '正在复制文档...', '正在复制文档包和附件。');
    const result = await api.copyDocument(normalizedSource, normalizedTarget);
    setSaveProgress(true, 100, '复制完成', '文档已写入工作区。');
    if (!result || result.error) {
      alert(result?.error || '复制失败');
      return null;
    }
    await loadWorkspaceDocumentNames();
    return result;
  } catch (err) {
    console.error('copyWorkspaceDocument error:', err);
    alert('复制文档时发生异常，请检查控制台日志。');
    return null;
  } finally {
    S.isSaving = false;
    syncSavingControls();
    setTimeout(() => setSaveProgress(false), 350);
  }
}
function renderMergeAnalysis(analysis) {
  const panel = document.getElementById('merge-analysis');
  if (!panel) return;
  if (!analysis) {
    panel.innerHTML = '';
    syncMergePrimaryButton();
    return;
  }

  const merged = analysis.merged_document || {};
  const summary = analysis.summary || {};
  const conflicts = analysis.conflicts || [];
  const validation = analysis.validation_issues || [];
  const validationSummary = conflicts.length ? '待复检' : (validation.length ? '内部异常' : '0');
  const validationSummaryLabel = conflicts.length ? '校验状态' : '校验问题';

  panel.innerHTML = `
    <div class="merge-summary">
      <div class="merge-summary-card"><strong>${summary.autoMergedCount || 0}</strong><span>自动合并项</span></div>
      <div class="merge-summary-card"><strong>${conflicts.length}</strong><span>冲突项</span></div>
      <div class="merge-summary-card"><strong>${validationSummary}</strong><span>${validationSummaryLabel}</span></div>
      <div class="merge-summary-card"><strong>${(merged.processes || []).length}</strong><span>流程</span></div>
      <div class="merge-summary-card"><strong>${(merged.entities || []).length}</strong><span>实体</span></div>
    </div>
    ${conflicts.length ? `<div class="merge-block">
      <h4>冲突裁决</h4>
      <div class="merge-conflict-list">
        ${conflicts.map((conflict, index) => renderMergeConflict(conflict, index)).join('')}
      </div>
    </div>` : '<div class="merge-block merge-ok">未检测到冲突，可以直接生成结果。</div>'}
    ${conflicts.length ? renderMergeDeferredValidation(validation) : renderMergeInternalValidationFailure(validation)}
    <div class="merge-block">
      <h4>结果预览</h4>
      <div class="merge-preview-metrics">
        <span>标题：${esc(merged.meta?.title || '未命名')}</span>
        <span>业务域：${esc(merged.meta?.domain || '')}</span>
        <span>角色：${(merged.roles || []).length}</span>
        <span>术语：${(merged.language || []).length}</span>
      </div>
    </div>`;
  syncMergePrimaryButton();
}

function renderMergeConflict(conflict, index) {
  const conflictId = esc(conflict.id);
  const choiceOptions = (conflict.resolution_options || []).map((choice) => {
    const label = choice === 'left'
      ? '保留左侧'
      : choice === 'right'
        ? '保留右侧'
        : choice === 'keep_both'
          ? '两者都保留'
          : '自定义';
    return `<option value="${choice}">${label}</option>`;
  }).join('');
  const supportsCustom = (conflict.resolution_options || []).includes('custom');
  return `<div class="merge-conflict-card">
    <div class="merge-conflict-head">
      <span class="merge-conflict-index">#${index + 1}</span>
      <strong>${esc(conflict.label || conflict.path || '冲突')}</strong>
      <span class="merge-conflict-path">${esc(conflict.path || '')}</span>
    </div>
    <div class="merge-conflict-values">
      <div><label>左侧</label><pre>${esc(JSON.stringify(conflict.left_value, null, 2))}</pre></div>
      <div><label>右侧</label><pre>${esc(JSON.stringify(conflict.right_value, null, 2))}</pre></div>
    </div>
    <div class="merge-conflict-controls">
      <select data-merge-conflict="${conflictId}" onchange="toggleMergeCustomInput(this)">
        <option value="">请选择处理方式</option>
        ${choiceOptions}
      </select>
      ${supportsCustom ? `<input class="merge-custom-input hidden" data-merge-custom="${conflictId}" placeholder="输入自定义值">` : ''}
    </div>
  </div>`;
}

function toggleMergeCustomInput(selectEl) {
  const conflictId = selectEl.getAttribute('data-merge-conflict');
  const input = document.querySelector(`[data-merge-custom="${conflictId}"]`);
  if (!input) return;
  input.classList.toggle('hidden', selectEl.value !== 'custom');
}

function collectMergeResolutions(conflicts) {
  const resolutions = {};
  (conflicts || []).forEach((conflict) => {
    const select = document.querySelector(`[data-merge-conflict="${conflict.id}"]`);
    if (!select || !select.value) return;
    if (select.value === 'custom') {
      const input = document.querySelector(`[data-merge-custom="${conflict.id}"]`);
      resolutions[conflict.id] = {
        choice: 'custom',
        custom_value: input ? input.value : '',
      };
      return;
    }
    resolutions[conflict.id] = { choice: select.value };
  });
  return resolutions;
}

function findMergeItemByToken(items, token) {
  const normalized = String(token || '').trim();
  return (items || []).find((item) => (
    String(item.uid || '').trim() === normalized
    || String(item.id || '').trim() === normalized
    || String(item.name || '').trim() === normalized
  )) || null;
}

function getMergeValidationTargetOptions(document) {
  const options = [];
  const pushModelOption = (item, label) => {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || '').trim();
    if (id) options.push({ value: id, label: `${label} ${id} ${name}`.trim() });
    if (name && name !== id) options.push({ value: name, label: `${label} ${name}`.trim() });
  };
  (document.roles || []).forEach((role) => options.push({ value: role.id, label: `角色 ${role.id} ${role.name || ''}`.trim() }));
  (document.stages || []).forEach((stage) => options.push({ value: stage.id, label: `阶段 ${stage.id} ${stage.name || ''}`.trim() }));
  (document.processes || []).forEach((process) => {
    options.push({ value: process.id, label: `流程 ${process.id} ${process.name || ''}`.trim() });
    (process.nodes || []).forEach((node) => options.push({ value: node.id, label: `节点 ${node.id} ${node.name || ''}`.trim() }));
  });
  (document.entities || []).forEach((entity) => options.push({ value: entity.id, label: `实体 ${entity.id} ${entity.name || ''}`.trim() }));
  (document.businessComponents || []).forEach((item) => pushModelOption(item, '业务组件'));
  (document.businessConstructs || []).forEach((item) => pushModelOption(item, '业务构件'));
  (document.taskDefinitions || []).forEach((item) => pushModelOption(item, '任务定义'));
  return options;
}

function getMergeValidationFix(issue) {
  const path = String(issue?.path || '');
  const message = String(issue?.message || '');
  if (/^rules\.[^.]+\.applies_to$/.test(path)) {
    return {
      group: 'manual',
      title: '规则适用对象失效',
      recommendation: '选择一个新的适用对象，或清空引用后保留规则内容。',
      clearLabel: '清空引用',
      assignLabel: '改为所选对象',
      kind: 'rule_applies_to',
    };
  }
  if (/^stageFlowLinks\./.test(path)) {
    return { group: 'auto', title: '阶段流程连线失效', recommendation: '删除这条失效连线。', actionLabel: '删除连线', kind: 'stage_flow_link' };
  }
  if (/^stageFlowRefs\./.test(path)) {
    return { group: 'auto', title: '阶段流程引用失效', recommendation: '删除这条失效引用及相关连线。', actionLabel: '删除引用', kind: 'stage_flow_ref' };
  }
  if (/^stages\.[^.]+\.processLinks\./.test(path)) {
    return { group: 'auto', title: '阶段内流程连线失效', recommendation: '删除这条阶段内失效连线。', actionLabel: '删除连线', kind: 'stage_process_link' };
  }
  if (/^processes\.[^.]+\.stageId$/.test(path)) {
    return { group: 'auto', title: '流程阶段失效', recommendation: '清空阶段归属，后续可重新放入正确阶段。', actionLabel: '清空阶段', kind: 'process_stage' };
  }
  if (/\.role_ids\.\d+$/.test(path)) {
    return { group: 'auto', title: '节点角色失效', recommendation: '移除不存在的角色引用，保留节点内容。', actionLabel: '移除角色引用', kind: 'node_role' };
  }
  if (/\.entity_ops$/.test(path)) {
    return { group: 'auto', title: '节点实体引用失效', recommendation: '移除不存在的实体操作引用，保留节点内容。', actionLabel: '移除实体引用', kind: 'entity_op' };
  }
  if (/\.forms\.[^.]+\.entity_id$/.test(path) || /\.sections\.[^.]+\.entity_id$/.test(path)) {
    return { group: 'auto', title: '表单实体绑定失效', recommendation: '清空失效实体绑定，并清空该范围内的实体字段映射。', actionLabel: '清空绑定', kind: 'form_entity' };
  }
  if (/^relations\./.test(path)) {
    return { group: 'auto', title: '实体关系失效', recommendation: '删除这条引用不存在实体的关系。', actionLabel: '删除关系', kind: 'relation' };
  }
  return {
    group: 'manual',
    title: '需要人工确认',
    recommendation: message || '请检查该问题对应的模型内容。',
    clearLabel: '',
    kind: 'unknown',
  };
}

function extractMissingRef(message, pattern) {
  const match = String(message || '').match(pattern);
  return match ? String(match[1] || '').trim() : '';
}

function applyMergeValidationFixToDocument(document, issue, action, value = '') {
  const path = String(issue?.path || '');
  const parts = path.split('.');
  const fix = getMergeValidationFix(issue);
  if (fix.kind === 'rule_applies_to') {
    const rule = findMergeItemByToken(document.rules || [], parts[1]);
    if (!rule) return false;
    rule.applies_to = action === 'assign' ? String(value || '').trim() : '';
    return true;
  }
  if (fix.kind === 'stage_flow_link') {
    const token = parts[1];
    document.stageFlowLinks = (document.stageFlowLinks || []).filter((link) => (
      String(link.id || link.uid || '').trim() !== token
    ));
    return true;
  }
  if (fix.kind === 'stage_flow_ref') {
    const token = parts[1];
    document.stageFlowRefs = (document.stageFlowRefs || []).filter((ref) => String(ref.id || ref.uid || '').trim() !== token);
    document.stageFlowLinks = (document.stageFlowLinks || []).filter((link) => link.fromRefId !== token && link.toRefId !== token);
    return true;
  }
  if (fix.kind === 'stage_process_link') {
    const stage = findMergeItemByToken(document.stages || [], parts[1]);
    if (!stage) return false;
    const linkToken = parts[3];
    stage.processLinks = (stage.processLinks || []).filter((link) => String(link.uid || '').trim() !== linkToken);
    return true;
  }
  if (fix.kind === 'process_stage') {
    const process = findMergeItemByToken(document.processes || [], parts[1]);
    if (!process) return false;
    process.stageId = '';
    return true;
  }
  if (fix.kind === 'node_role') {
    const process = findMergeItemByToken(document.processes || [], parts[1]);
    const node = findMergeItemByToken(process?.nodes || [], parts[3]);
    if (!node) return false;
    const missingRoleId = extractMissingRef(issue.message, /不存在的角色\s+(.+)$/);
    node.role_ids = (node.role_ids || []).filter((roleId) => String(roleId || '').trim() !== missingRoleId);
    node.roles = (node.roles || []).filter((roleId) => String(roleId || '').trim() !== missingRoleId);
    if (String(node.role_id || '').trim() === missingRoleId) node.role_id = '';
    if (String(node.role || '').trim() === missingRoleId) node.role = '';
    return true;
  }
  if (fix.kind === 'entity_op') {
    const process = findMergeItemByToken(document.processes || [], parts[1]);
    const node = findMergeItemByToken(process?.nodes || [], parts[3]);
    if (!node) return false;
    const missingEntityId = extractMissingRef(issue.message, /不存在的实体\s+(.+)$/);
    node.entity_ops = (node.entity_ops || []).filter((entityOp) => String(entityOp.entity_id || '').trim() !== missingEntityId);
    return true;
  }
  if (fix.kind === 'form_entity') {
    const process = findMergeItemByToken(document.processes || [], parts[1]);
    const node = findMergeItemByToken(process?.nodes || [], parts[3]);
    const form = findMergeItemByToken(node?.forms || [], parts[5]);
    if (!form) return false;
    if (parts.includes('sections')) {
      const section = findMergeItemByToken(form.sections || [], parts[7]);
      if (!section) return false;
      section.entity_id = '';
      (section.fields || []).forEach((field) => { field.entity_field = ''; });
    } else {
      form.entity_id = '';
      (form.sections || []).forEach((section) => {
        if (!section.entity_id) {
          (section.fields || []).forEach((field) => { field.entity_field = ''; });
        }
      });
    }
    return true;
  }
  if (fix.kind === 'relation') {
    const token = parts[1];
    document.relations = (document.relations || []).filter((relation) => String(relation.uid || '').trim() !== token);
    return true;
  }
  return false;
}

async function applyMergeValidationFix(index, action = 'recommended') {
  if (!S.merge.analysis) return;
  const issue = (S.merge.analysis.validation_issues || [])[index];
  if (!issue) return;
  const draft = cloneDocument(S.merge.analysis.merged_document || {});
  const select = globalThis.document?.querySelector(`[data-merge-validation-target="${index}"]`);
  let value = '';
  if (action === 'assign') value = select?.value || '';
  if (!applyMergeValidationFixToDocument(draft, issue, action, value)) {
    alert('这个校验问题还不能自动修复，请手动调整合并源文档后再试。');
    return;
  }
  const result = await api.validateDocument(draft);
  if (result.error) return alert(result.error);
  S.merge.analysis.merged_document = result.document;
  S.merge.analysis.validation_issues = result.validation_issues || [];
  S.merge.analysis.summary = {
    ...(S.merge.analysis.summary || {}),
    validationIssueCount: S.merge.analysis.validation_issues.length,
  };
  renderMergeAnalysis(S.merge.analysis);
}

async function autoApplyMergeValidationFixes(result) {
  let nextResult = result;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const validation = nextResult.validation_issues || [];
    if (!validation.length) return nextResult;
    if (validation.some((issue) => getMergeValidationFix(issue).group !== 'auto')) return nextResult;
    const draft = cloneDocument(nextResult.merged_document || {});
    let changed = false;
    validation.forEach((issue) => {
      changed = applyMergeValidationFixToDocument(draft, issue, 'recommended') || changed;
    });
    if (!changed) return nextResult;
    const validated = await api.validateDocument(draft);
    if (validated.error) return nextResult;
    nextResult = {
      ...nextResult,
      merged_document: validated.document,
      validation_issues: validated.validation_issues || [],
      summary: {
        ...(nextResult.summary || {}),
        validationIssueCount: (validated.validation_issues || []).length,
        autoFixedValidationIssueCount: ((nextResult.summary || {}).autoFixedValidationIssueCount || 0) + validation.length,
      },
    };
  }
  return nextResult;
}

function renderMergeValidationIssue(issue, index, document) {
  const fix = getMergeValidationFix(issue);
  const targetOptions = getMergeValidationTargetOptions(document);
  return `<div class="merge-validation-card ${fix.group}" data-testid="merge-validation-card">
    <div class="merge-validation-card-head">
      <span>${fix.group === 'auto' ? '可自动修复' : '需要人工选择'}</span>
      <strong>${esc(fix.title)}</strong>
    </div>
    <p>${esc(issue.message || '')}</p>
    <div class="merge-validation-suggestion">${esc(fix.recommendation || '')}</div>
    <div class="merge-validation-actions">
      ${fix.kind === 'rule_applies_to' ? `
        <select data-merge-validation-target="${index}">
          <option value="">选择新的适用对象</option>
          ${targetOptions.map((option) => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-outline btn-sm" data-testid="merge-validation-fix-assign" onclick="applyMergeValidationFix(${index}, 'assign')">改为所选对象</button>
        <button type="button" class="btn btn-ghost-sm" data-testid="merge-validation-fix-clear" onclick="applyMergeValidationFix(${index}, 'clear')">清空引用</button>
      ` : fix.group === 'auto' ? `
        <button type="button" class="btn btn-outline btn-sm" data-testid="merge-validation-fix-recommended" onclick="applyMergeValidationFix(${index}, 'recommended')">${esc(fix.actionLabel || '采用推荐修复')}</button>
      ` : ''}
    </div>
  </div>`;
}

function renderMergeValidationGuide(validation, mergedDocument) {
  if (!validation.length) return '';
  const autoCount = validation.filter((item) => getMergeValidationFix(item).group === 'auto').length;
  const manualCount = validation.length - autoCount;
  return `<div class="merge-block" data-testid="merge-validation-guide">
    <h4>校验问题修复</h4>
    <p class="merge-inline-note">校验问题是合并结果的完整性检查。能确定修复方式的会给出一键处理；涉及业务含义的引用，需要你选择新对象或清空引用。</p>
    <div class="merge-validation-summary">
      <span>可自动修复 ${autoCount}</span>
      <span>需要人工选择 ${manualCount}</span>
    </div>
    <div class="merge-validation-list">
      ${validation.map((item, index) => renderMergeValidationIssue(item, index, mergedDocument)).join('')}
    </div>
  </div>`;
}

function renderMergeInternalValidationFailure(validation) {
  if (!validation.length) return '';
  return `<div class="merge-block merge-validation-deferred" data-testid="merge-internal-validation-error">
    <h4>模型内部引用异常</h4>
    <p class="merge-inline-note">合并结果仍有 ${validation.length} 个模型一致性问题。正常通过工具建模并完成冲突裁决后不应出现这种情况，请不要手动删除引用；这通常表示历史数据或合并修复逻辑需要升级。</p>
    <div class="merge-validation-list">
      ${validation.map((item) => `<div class="merge-validation-card manual">
        <div class="merge-validation-card-head"><span>内部问题</span><strong>${esc(item.path || '')}</strong></div>
        <p>${esc(item.message || '')}</p>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderMergeDeferredValidation(validation) {
  if (!validation.length) return '';
  return `<div class="merge-block merge-validation-deferred" data-testid="merge-validation-deferred">
    <h4>冲突处理后重新校验</h4>
    <p class="merge-inline-note">当前有 ${validation.length} 个预裁决临时校验项，通常由同名元素尚未裁决引起。请先处理上方冲突项，生成前系统会按裁决结果自动收敛附属引用并重新校验。</p>
  </div>`;
}

function cloneDocument(document) {
  return JSON.parse(JSON.stringify(document || {}));
}

const App = {
  _downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  },

  async cmdNew() {
    if (!await confirmDiscardUnsavedChanges('新建文档')) return;
    document.getElementById('new-doc-name').value = '';
    openModalById('modal-overlay');
    setTimeout(() => document.getElementById('new-doc-name')?.focus(), 50);
  },

  closeModal() {
    closeModalById('modal-overlay');
  },

  async confirmNew() {
    const name = document.getElementById('new-doc-name').value.trim();
    if (!name) return alert('请输入名称');

    const newDocument = createLocalDocument(name);
    const saveResult = await saveWorkspaceDocument(name, newDocument);
    if (!saveResult) return;

    App.closeModal();
    setActiveDocumentSession(saveResult.document || newDocument, { fileName: saveResult.name || name });
  },

  async cmdOpen() {
    resetRecoveryState();
    const [files, trashEntries] = await Promise.all([
      loadWorkspaceDocumentNames(),
      loadWorkspaceTrashEntries(),
    ]);
    if (!files || !trashEntries) return;
    renderWorkspaceFileList(files);
    renderTrashEntries(trashEntries);
    syncOpenModalTabs();
    openModalById('open-modal-overlay');
  },

  closeOpenModal() {
    closeModalById('open-modal-overlay');
  },

  switchOpenTab(tab) {
    S.recovery.openTab = tab === 'trash' ? 'trash' : 'workspace';
    syncOpenModalTabs();
  },

  async openHistoryModal(name) {
    if (!name) return;
    const entries = await api.history(name);
    if (entries.error) return alert(entries.error);
    S.recovery.historyDocName = name;
    S.recovery.historyEntries = Array.isArray(entries) ? entries : [];
    renderHistoryEntries(name, S.recovery.historyEntries);
    openModalById('history-modal-overlay');
  },

  closeHistoryModal() {
    S.recovery.historyDocName = '';
    S.recovery.historyEntries = [];
    closeModalById('history-modal-overlay');
  },

  async restoreHistory(name, snapshotId) {
    if (!await confirmDiscardUnsavedChanges('恢复历史版本')) return;
    const result = await api.restoreHistory(name, snapshotId);
    if (result.error) return alert(result.error);
    resetRecoveryState();
    App.closeHistoryModal();
    App.closeOpenModal();
    setActiveDocumentSession(result.document, { fileName: result.name || name });
  },

  async restoreTrash(entryId) {
    if (!await confirmDiscardUnsavedChanges('恢复回收站文档')) return;
    const result = await api.restoreTrash(entryId);
    if (result.error) return alert(result.error);
    resetRecoveryState();
    App.closeOpenModal();
    setActiveDocumentSession(result.document, { fileName: result.name });
  },

  async cmdSaveAs() {
    if (S.isSaving) return;
    if (!S.doc) return;
    const workspaceFiles = await loadWorkspaceDocumentNames();
    if (!workspaceFiles) return;
    const baseName = (S.doc.meta?.domain || S.currentFile || S.doc.meta?.title || '').trim() || '文档';
    openWorkspaceSaveAsModal(buildSuggestedCopyName(baseName, workspaceFiles), 'copy');
  },

  closeSaveAsModal() {
    S.saveDialogMode = 'save';
    refreshSaveDialogText();
    closeModalById('save-as-modal-overlay');
  },

  async openFile(name) {
    if (!await confirmDiscardUnsavedChanges(`打开“${name}”`)) return;
    App.closeOpenModal();
    const doc = await api.load(name);
    if (doc.meta && !doc.meta.domain) doc.meta.domain = name;
    setActiveDocumentSession(doc, { fileName: name });
  },

  async deleteFile(name) {
    if (S.currentFile === name && !await confirmDiscardUnsavedChanges(`删除“${name}”`)) return;
    if (!await showAppConfirm(`确认删除 "${name}"？`, {
      title: '删除文档',
      confirmLabel: '删除',
    })) return;
    await api.del(name);
    if (S.currentFile === name) {
      S.currentFile = null;
      S.doc = null;
      S.documentRevision = 0;
      S.baseDocument = null;
      S.modified = false;
      render();
    }
    await App.cmdOpen();
  },

  async cmdSave() {
    if (S.isSaving) return;
    if (!S.doc) return;
    if (!S.currentFile) {
      openWorkspaceSaveAsModal((S.doc.meta?.domain || S.doc.meta?.title || '').trim(), 'save');
      return;
    }

    const targetName = String(S.doc.meta?.domain || S.currentFile || '').trim() || S.currentFile;
    S.doc.meta = S.doc.meta || {};
    S.doc.meta.domain = targetName;
    S.doc.meta.title = targetName;
    const saveResult = await saveWorkspaceDocument(targetName, S.doc, { currentName: S.currentFile });
    if (!saveResult) return;
    setActiveDocumentSession(saveResult.document || S.doc, {
      fileName: saveResult.name || targetName,
      preserveUiState: true,
    });
  },

  async confirmSaveAs() {
    if (S.isSaving) return;
    if (!S.doc) return;
    const name = document.getElementById('save-as-name').value.trim();
    if (!name) return alert('请输入业务域名称');

    const mode = S.saveDialogMode === 'copy' ? 'copy' : 'save';
    if (mode === 'copy' && S.currentFile) {
      if (S.modified) {
        const savedCurrent = await saveWorkspaceDocument(S.currentFile, S.doc, { currentName: S.currentFile });
        if (!savedCurrent) return;
        setActiveDocumentSession(savedCurrent.document || S.doc, {
          fileName: savedCurrent.name || S.currentFile,
          preserveUiState: true,
        });
      }
      const copyResult = await copyWorkspaceDocument(S.currentFile, name);
      if (!copyResult) return;
      App.closeSaveAsModal();
      setActiveDocumentSession(copyResult.document || S.doc, {
        fileName: copyResult.name || name,
        preserveUiState: true,
      });
      return;
    }

    const nextDocument = cloneDocument(S.doc);
    nextDocument.meta = nextDocument.meta || {};
    nextDocument.meta.domain = name;
    nextDocument.meta.title = name;
    const saveResult = mode === 'copy'
      ? await saveWorkspaceDocument(name, nextDocument, { allowOverwrite: false })
      : await saveWorkspaceDocument(name, nextDocument, { currentName: S.currentFile || '' });
    if (!saveResult) return;

    App.closeSaveAsModal();
    setActiveDocumentSession(saveResult.document || nextDocument, {
      fileName: saveResult.name || name,
      preserveUiState: true,
    });
  },

  async cmdExport() {
    if (S.isSaving || S.isExporting) return;
    if (!S.doc) return;
    S.isExporting = true;
    syncSavingControls();
    try {
      if (!S.currentFile || S.modified) {
        await App.cmdSave();
      }
      if (!S.currentFile || S.modified) return;

      setSaveProgress(true, 72, '正在生成导出文件...', '正在打包文档、预览内容和附件。');
      const bundleName = `${S.currentFile || S.doc.meta?.domain || getCurrentDocumentLabel() || 'blm-document'}.zip`;
      const response = await api.exportBundle(S.currentFile);
      if (!response.ok) {
        alert('导出文档包失败，请稍后重试。');
        return;
      }
      const bundleBlob = await response.blob();
      setSaveProgress(true, 96, '正在下载导出文件...', '导出文件已生成，正在交给浏览器下载。');
      App._downloadBlob(bundleBlob, bundleBlob.type || 'application/zip', bundleName);
    } finally {
      S.isExporting = false;
      setSaveProgress(false);
      syncSavingControls();
    }
  },

  cmdManual() {
    navigate('manual', {});
  },

  async cmdCompare() {
    resetCompareState();
    const files = await loadWorkspaceDocumentNames();
    if (!files) return;
    S.compare.workspaceFiles = files;
    if (!S.compare.workspaceFiles.length) {
      alert('当前工作区没有可比对的文档。');
      return;
    }
    syncCompareWorkspaceUi();
    const defaultLeft = (S.currentFile && S.compare.workspaceFiles.includes(S.currentFile))
      ? S.currentFile
      : S.compare.workspaceFiles[0];
    const defaultRight = defaultLeft;
    await App.selectCompareWorkspace('left', defaultLeft, { silent: true });
    await App.selectCompareWorkspace('right', defaultRight, { silent: true });
    markCompareNeedsRun('默认文档已准备好，点击“开始比对”生成版本报告。');
    openModalById('compare-modal-overlay');
  },

  closeCompareModal() {
    compareResultRequestSeq += 1;
    S.compare.isRunning = false;
    S.compare.runMessage = '';
    syncCompareWorkspaceUi();
    closeModalById('compare-modal-overlay');
  },

  async selectCompareWorkspace(kind, fileName, options = {}) {
    const normalized = String(fileName || '').trim();
    if (normalized && S.compare.workspaceNames[kind] === normalized && S.compare.documents[kind]) {
      syncCompareWorkspaceUi();
      if (!options.silent) markCompareNeedsRun();
      return;
    }
    S.compare.workspaceNames[kind] = normalized;
    S.compare.versionIds[kind] = '';
    S.compare.versions[kind] = [];
    S.compare.documents[kind] = null;
    S.compare.labels[kind] = normalized ? `${normalized} / 当前版本` : '';
    if (!normalized) {
      syncCompareWorkspaceUi();
      clearCompareResult();
      return;
    }
    const [historyEntries, document] = await Promise.all([
      api.history(normalized),
      api.load(normalized),
    ]);
    if (S.compare.workspaceNames[kind] !== normalized) return;
    if (historyEntries.error) return alert(historyEntries.error);
    if (document.error) return alert(document.error);
    S.compare.versions[kind] = Array.isArray(historyEntries) ? historyEntries : [];
    S.compare.documents[kind] = document;
    syncCompareWorkspaceUi();
    if (!options.silent) markCompareNeedsRun();
  },

  async selectCompareVersion(kind, snapshotId) {
    S.compare.versionIds[kind] = String(snapshotId || '').trim();
    syncCompareWorkspaceUi();
    markCompareNeedsRun();
  },

  async startCompare() {
    if (S.compare.isRunning) return;
    await updateCompareResult();
  },

  toggleCompareReportMode() {
    S.compare.reportMode = getCompareReportMode() === 'all' ? 'diff' : 'all';
    renderCompareResult(S.compare.result);
  },

  async cmdMerge() {
    resetMergeState();
    const files = await loadWorkspaceDocumentNames();
    if (!files) return;
    S.merge.workspaceFiles = files;
    if (S.merge.workspaceFiles.length < 2) {
      alert('至少需要两个工作区文档才能执行合并。');
      return;
    }
    syncMergeWorkspaceUi();
    const defaultLeft = (S.currentFile && S.merge.workspaceFiles.includes(S.currentFile))
      ? S.currentFile
      : S.merge.workspaceFiles[0];
    const defaultRight = S.merge.workspaceFiles.find((name) => name !== defaultLeft) || '';
    await App.selectMergeWorkspace('left', defaultLeft);
    await App.selectMergeWorkspace('right', defaultRight);
    clearMergeAnalysisState();
    openModalById('merge-modal-overlay');
  },

  closeMergeModal() {
    closeModalById('merge-modal-overlay');
  },

  clearMergeSource(kind) {
    setMergeSource(kind, { workspaceName: '', label: '', document: null });
  },

  async selectMergeWorkspace(kind, fileName) {
    const normalized = String(fileName || '').trim();
    if (!normalized) {
      App.clearMergeSource(kind);
      return;
    }
    const otherKind = kind === 'left' ? 'right' : 'left';
    if (S.merge.workspaceNames?.[otherKind] === normalized) {
      alert('同一个工作区文档不能同时放在左侧和右侧');
      syncMergeWorkspaceUi();
      return;
    }
    const document = await api.load(normalized);
    if (document.error) {
      syncMergeWorkspaceUi();
      return alert(document.error);
    }
    setMergeSource(kind, {
      workspaceName: normalized,
      label: normalized,
      document,
    });
  },

  async analyzeMerge() {
    const leftName = getMergeSelectedName('left');
    const rightName = getMergeSelectedName('right');
    if (!leftName || !rightName) {
      alert('请先选择左右两个工作区文档');
      return;
    }
    if (leftName === rightName) {
      alert('左右侧文档不能是同一个');
      return;
    }
    S.merge.isChecking = true;
    syncMergePrimaryButton();
    const panel = document.getElementById('merge-analysis');
    if (panel) {
      panel.innerHTML = '<div class="merge-empty">正在执行合并前检查，检查冲突项和校验问题...</div>';
    }
    try {
      const payload = await ensureMergeWorkspaceDocuments();
      if (payload.error) {
        renderMergeAnalysis(null);
        return alert(payload.error);
      }
      const result = await api.analyzeMerge(payload);
      if (result.error) {
        renderMergeAnalysis(null);
        return alert(result.error);
      }
      S.merge.analysis = result;
      S.merge.resolutions = {};
      renderMergeAnalysis(result);
      return result;
    } finally {
      S.merge.isChecking = false;
      syncMergePrimaryButton();
    }
  },

  async handleMergePrimaryAction() {
    if (S.merge.isChecking) return;
    if (!S.merge.analysis) {
      await App.analyzeMerge();
      return;
    }
    await App.confirmMerge();
  },

  async confirmMerge() {
    const analysis = S.merge.analysis;
    if (!analysis) {
      await App.analyzeMerge();
      return;
    }
    if (!analysis) return;

    const conflicts = analysis.conflicts || [];
    if (conflicts.length) {
      const resolutions = collectMergeResolutions(conflicts);
      const unresolvedCount = conflicts.filter((conflict) => !resolutions[conflict.id]).length;
      if (unresolvedCount) {
        alert('请先处理所有冲突项，再确认合并。');
        return;
      }
    }
    if (!conflicts.length && (analysis.validation_issues || []).length) {
      alert('合并结果出现模型内部引用异常，系统无法生成文档。请联系维护人员处理迁移或合并逻辑。');
      return;
    }
    await App.useMergeResult();
  },

  async useMergeResult() {
    if (!S.merge.analysis) {
      alert('请先执行合并前检查');
      return;
    }
    const conflicts = S.merge.analysis.conflicts || [];
    const resolutions = collectMergeResolutions(conflicts);
    let result = S.merge.analysis;
    if (conflicts.length) {
      const payload = await ensureMergeWorkspaceDocuments();
      if (payload.error) return alert(payload.error);
      result = await api.applyMerge({
        ...payload,
        resolutions,
      });
      if (result.error) return alert(result.error);
      if ((result.conflicts || []).length) {
        S.merge.analysis = result;
        renderMergeAnalysis(result);
        alert('仍有未处理冲突，请逐项选择处理方式。');
        return;
      }
    }
    if ((result.validation_issues || []).length) {
      S.merge.analysis = result;
      renderMergeAnalysis(result);
      alert('合并结果出现模型内部引用异常，系统无法生成文档。请联系维护人员处理迁移或合并逻辑。');
      return;
    }

    const nextName = getMergeSaveName(result);
    result.merged_document.meta = result.merged_document.meta || {};
    result.merged_document.meta.title = nextName;
    result.merged_document.meta.domain = nextName;
    const saveResult = await saveWorkspaceDocument(nextName, result.merged_document);
    if (!saveResult) return;
    setActiveDocumentSession(saveResult.document, { fileName: saveResult.name || nextName });
    App.closeMergeModal();
  },
};

function createDocUiState(doc) {
  const firstRoleId = getFirstRoleId(doc);
  const firstStageId = getStageItems(doc)[0]?.id || null;
  return {
    tab: 'domain',
    procId: doc.processes?.[0]?.id || null,
    taskId: null,
    stageId: firstStageId,
    stageViewMode: 'panorama',
    entityId: null,
    dataView: 'relation',
    stateFieldName: '',
    roleId: firstRoleId,
    roleQuery: '',
    roleParticipatingOnly: false,
    navHistory: [],
    sbCollapse: _defaultSbCollapse(doc),
    sidebarCollapsed: false,
    sidebarW: getUiPrefNumber('sidebarW', 240),
    businessDomainFilter: 'all',
    procView: 'stage',
    procDiagramMode: 'swimlane',
    procDiagramShowEntities: true,
    procDiagramShowTasks: false,
    procTasklevelCollapsed: true,
    nodePerspective: 'user',
    procPrototypeExpanded: {},
    procRolePickerCollapsed: {},
    orchestrationReuseFilters: {},
    procEditorFocusSelector: '',
    stepNoteEditKey: '',
    orchestrationNoteEditKey: '',
    procDrawerW: getUiPrefNumber('procDrawerW', 480),
    stageGraphZoom: 1,
    stageEditorCollapsed: true,
    stageNameEditId: '',
    entityDrawerW: getUiPrefNumber('entityDrawerW', 620),
    entityRelationEditorCollapsed: true,
    stateDiagramZoom: 1,
    stateEditorCollapsed: true,
    businessModelDialog: { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '', returnMode: '', procId: '', taskId: '', afterIdx: null },
  };
}

document.addEventListener('keydown', (event) => {
  if (S.isSaving) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const key = String(event.key || '').toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 's') {
    event.preventDefault();
    App.cmdSave();
    return;
  }
  const activeElement = document.activeElement;
  const isTextEditor = Boolean(
    activeElement
    && (
      activeElement.tagName === 'INPUT'
      || activeElement.tagName === 'TEXTAREA'
      || activeElement.isContentEditable
    )
  );
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'arrowleft' && !isTextEditor) {
    if (goBackNavigation()) {
      event.preventDefault();
    }
  }
});

let activeHelpTarget = null;
let helpTooltipEl = null;

function ensureHelpTooltip() {
  if (helpTooltipEl) return helpTooltipEl;
  helpTooltipEl = document.createElement('div');
  helpTooltipEl.className = 'floating-help-tooltip';
  helpTooltipEl.dataset.testid = 'inline-help-tooltip';
  helpTooltipEl.hidden = true;
  document.body.appendChild(helpTooltipEl);
  return helpTooltipEl;
}

function hideHelpTooltip(target = null) {
  if (target && activeHelpTarget !== target) return;
  activeHelpTarget = null;
  if (helpTooltipEl) helpTooltipEl.hidden = true;
}

function positionHelpTooltip(target) {
  const tip = String(target?.dataset?.tip || '').trim();
  if (!target || !tip) return;
  if (!target.isConnected) {
    hideHelpTooltip(target);
    return;
  }
  const tooltip = ensureHelpTooltip();
  activeHelpTarget = target;
  tooltip.textContent = tip;
  tooltip.hidden = false;
  tooltip.style.left = '0px';
  tooltip.style.top = '0px';

  const margin = 10;
  const gap = 8;
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
  let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
  left = Math.max(margin, Math.min(left, viewportW - tooltipRect.width - margin));
  let top = targetRect.bottom + gap;
  if (top + tooltipRect.height + margin > viewportH) {
    top = targetRect.top - tooltipRect.height - gap;
  }
  top = Math.max(margin, Math.min(top, viewportH - tooltipRect.height - margin));
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function initFloatingHelpTooltips() {
  document.addEventListener('mouseover', (event) => {
    const target = event.target?.closest?.('.inline-help[data-tip]');
    if (target) positionHelpTooltip(target);
  });
  document.addEventListener('focusin', (event) => {
    const target = event.target?.closest?.('.inline-help[data-tip]');
    if (target) positionHelpTooltip(target);
  });
  document.addEventListener('mouseout', (event) => {
    const target = event.target?.closest?.('.inline-help[data-tip]');
    if (target && !target.contains(event.relatedTarget)) hideHelpTooltip(target);
  });
  document.addEventListener('focusout', (event) => {
    const target = event.target?.closest?.('.inline-help[data-tip]');
    if (target) hideHelpTooltip(target);
  });
  window.addEventListener('scroll', () => activeHelpTarget ? positionHelpTooltip(activeHelpTarget) : undefined, true);
  window.addEventListener('resize', () => activeHelpTarget ? positionHelpTooltip(activeHelpTarget) : undefined);
}

initFloatingHelpTooltips();

bindBeforeUnloadWarning();
document.addEventListener('DOMContentLoaded', async () => {
  refreshSaveDialogText();
  render();
});

window.App = App;
window.toggleMergeCustomInput = toggleMergeCustomInput;
