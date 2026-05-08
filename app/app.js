'use strict';

const UNSAVED_CHANGES_MESSAGE = '当前有未保存修改，继续操作会丢失这些内容。是否继续？';
const nativeAlert = window.alert.bind(window);
const nativeConfirm = window.confirm.bind(window);
const nativePrompt = window.prompt.bind(window);

let activeAppDialog = null;

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
      return ['mode', 'capabilityId', 'constructId', 'taskDefinitionId']
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
  S.modified = false;
  S.ui = options.preserveUiState
    ? getPreservedDocUiState(doc, previousUi)
    : createDocUiState(doc);
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

function shouldSkipCompareKey(key, path) {
  return key === 'uid' || path === 'meta.document_uid' || path === 'meta.schema_version';
}

function flattenCompareValue(value, prefix = '', output = {}) {
  const normalized = normalizeCompareValue(value);
  if (Array.isArray(normalized)) {
    normalized.forEach((item, index) => flattenCompareValue(item, `${prefix}[${index}]`, output));
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

function compactCompareValue(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return '';
  return String(text).length > 120 ? `${String(text).slice(0, 117)}...` : String(text);
}

const COMPARE_TOP_LEVEL_LABELS = {
  meta: '基本信息',
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
  capabilityUnits: '业务组件',
  businessConstructs: '业务构件',
  taskDefinitions: '任务定义',
};

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
  capabilityUnitId: '业务组件',
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
  capabilityUnits: '业务组件',
  businessConstructs: '业务构件',
  taskDefinitions: '任务定义',
  prototypeFiles: '流程原型',
  versions: '版本',
};

function tokenizeComparePath(path) {
  return String(path || '').split('.').filter(Boolean).map((part) => {
    const match = part.match(/^([^\[]+)(?:\[(\d+)\])?$/);
    return {
      key: match ? match[1] : part,
      index: match && match[2] !== undefined ? Number(match[2]) : null,
    };
  });
}

function getCompareValueAtTokens(document, tokens) {
  let cursor = document;
  for (const token of tokens) {
    if (cursor == null) return null;
    cursor = cursor[token.key];
    if (token.index !== null) {
      cursor = Array.isArray(cursor) ? cursor[token.index] : null;
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
    return `${prefix} ${[item.from, item.to].filter(Boolean).join(' → ') || item.label || index + 1}`;
  }
  const id = String(item.id || '').trim();
  const name = String(item.name || item.title || item.term || item.target || '').trim();
  if (id && name && id !== name) return `${prefix} ${id} ${name}`;
  if (name) return `${prefix} ${name}`;
  if (id) return `${prefix} ${id}`;
  return `${prefix} ${index + 1}`;
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

function isCompareLayoutPath(tokens) {
  const keys = tokens.map((token) => token.key);
  const layoutKeys = new Set(['pos', 'stagePos', 'markerPos', 'labelPos']);
  if (keys.some((key) => layoutKeys.has(key))) return true;
  const lastKey = keys[keys.length - 1] || '';
  const parentKey = keys[keys.length - 2] || '';
  return ['x', 'y', 'order'].includes(lastKey) && layoutKeys.has(parentKey);
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

function describeComparePath(path, leftDocument, rightDocument) {
  const tokens = tokenizeComparePath(path);
  const topKey = tokens[0]?.key || '';
  const section = COMPARE_TOP_LEVEL_LABELS[topKey] || topKey || '其他';
  const crumbs = [];
  tokens.forEach((token, index) => {
    if (token.index === null) return;
    const itemTokens = tokens.slice(0, index + 1);
    const item = getCompareValueAtTokens(rightDocument, itemTokens)
      || getCompareValueAtTokens(leftDocument, itemTokens);
    crumbs.push(getCompareItemTitle(token.key, item, token.index));
  });
  const fieldLabel = getCompareFieldLabel(tokens);
  const isLayout = isCompareLayoutPath(tokens);
  return {
    section,
    itemLabel: crumbs.length ? crumbs.join(' / ') : section,
    fieldLabel,
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
    const inLeft = Object.prototype.hasOwnProperty.call(leftMap, path);
    const inRight = Object.prototype.hasOwnProperty.call(rightMap, path);
    const view = describeComparePath(path, leftDocument, rightDocument);
    if (!inLeft && inRight) {
      added.push({ path, right: rightMap[path], ...view });
      return;
    }
    if (inLeft && !inRight) {
      removed.push({ path, left: leftMap[path], ...view });
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

function renderCompareLayoutSummary(layoutItems) {
  if (!layoutItems.length) return '';
  const affected = uniqueCompareLayoutItems(layoutItems).slice(0, 16);
  return `<div class="compare-report-section compare-layout-report">
    <h4>图形与布局变化</h4>
    <p class="merge-inline-note">以下内容只有图形位置、排序或布局发生变化，不展示具体坐标。请结合左右版本的图形视图直观看布局差异。</p>
    <div class="compare-layout-list">
      ${affected.map((item) => `<span>${esc(item.itemLabel || item.section)}</span>`).join('')}
    </div>
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
            ? `<div class="compare-diff-values"><span><em>左侧</em>${esc(compactCompareValue(item.left))}</span><span><em>右侧</em>${esc(compactCompareValue(item.right))}</span></div>`
            : `<div class="compare-diff-values"><span><em>${type === 'added' ? '右侧' : '左侧'}</em>${esc(compactCompareValue(item.left ?? item.right))}</span></div>`}
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
  const { added, removed, changed, sameCount, leftLabel, rightLabel } = result;
  const totalDiff = added.length + removed.length + changed.length;
  const withKind = [
    ...changed.map((item) => ({ ...item, changeKind: '调整' })),
    ...added.map((item) => ({ ...item, changeKind: '新增' })),
    ...removed.map((item) => ({ ...item, changeKind: '删除' })),
  ];
  const layoutItems = withKind.filter((item) => item.isLayout);
  const businessItems = withKind.filter((item) => !item.isLayout);
  const businessChanged = changed.filter((item) => !item.isLayout);
  const businessAdded = added.filter((item) => !item.isLayout);
  const businessRemoved = removed.filter((item) => !item.isLayout);
  container.innerHTML = `<div class="compare-report" data-testid="compare-report">
    <h3>版本比对报告</h3>
    <div class="compare-summary">
      <div><strong>左侧</strong><span>${esc(leftLabel)}</span></div>
      <div><strong>右侧</strong><span>${esc(rightLabel)}</span></div>
      <div><strong>差异</strong><span>${totalDiff}</span></div>
      <div><strong>未变</strong><span>${sameCount}</span></div>
    </div>
    ${renderCompareOverview(result, businessItems, layoutItems)}
    ${renderCompareHighlights(businessItems)}
    ${renderCompareLayoutSummary(layoutItems)}
    ${totalDiff ? `<details class="compare-detail-panel" ${businessItems.length ? '' : 'open'}>
      <summary>模型明细</summary>
      ${renderCompareDiffList('内容调整', businessChanged, 'changed')}
      ${renderCompareDiffList('右侧新增', businessAdded, 'added')}
      ${renderCompareDiffList('右侧缺少', businessRemoved, 'removed')}
    </details>` : '<div class="merge-ok">两侧版本没有结构化差异。</div>'}
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

async function saveWorkspaceDocument(targetName, document, { currentName = '', allowOverwrite = true } = {}) {
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

  const result = currentName && currentName !== normalizedName
    ? await api.rename(currentName, normalizedName, document, willOverwrite)
    : await api.save(normalizedName, document);
  if (result.error) {
    alert(result.error);
    return null;
  }

  await loadWorkspaceDocumentNames();
  return result;
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

  panel.innerHTML = `
    <div class="merge-summary">
      <div class="merge-summary-card"><strong>${summary.autoMergedCount || 0}</strong><span>自动合并项</span></div>
      <div class="merge-summary-card"><strong>${conflicts.length}</strong><span>冲突项</span></div>
      <div class="merge-summary-card"><strong>${validation.length}</strong><span>校验问题</span></div>
      <div class="merge-summary-card"><strong>${(merged.processes || []).length}</strong><span>流程</span></div>
      <div class="merge-summary-card"><strong>${(merged.entities || []).length}</strong><span>实体</span></div>
    </div>
    ${conflicts.length ? `<div class="merge-block">
      <h4>冲突裁决</h4>
      <div class="merge-conflict-list">
        ${conflicts.map((conflict, index) => renderMergeConflict(conflict, index)).join('')}
      </div>
    </div>` : '<div class="merge-block merge-ok">未检测到冲突，可以直接生成结果。</div>'}
    ${renderMergeValidationGuide(validation, merged)}
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
  (document.roles || []).forEach((role) => options.push({ value: role.id, label: `角色 ${role.id} ${role.name || ''}`.trim() }));
  (document.stages || []).forEach((stage) => options.push({ value: stage.id, label: `阶段 ${stage.id} ${stage.name || ''}`.trim() }));
  (document.processes || []).forEach((process) => {
    options.push({ value: process.id, label: `流程 ${process.id} ${process.name || ''}`.trim() });
    (process.nodes || []).forEach((node) => options.push({ value: node.id, label: `节点 ${node.id} ${node.name || ''}`.trim() }));
  });
  (document.entities || []).forEach((entity) => options.push({ value: entity.id, label: `实体 ${entity.id} ${entity.name || ''}`.trim() }));
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
      S.modified = false;
      render();
    }
    await App.cmdOpen();
  },

  async cmdSave() {
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
    if (!S.doc) return;
    const name = document.getElementById('save-as-name').value.trim();
    if (!name) return alert('请输入业务域名称');

    const mode = S.saveDialogMode === 'copy' ? 'copy' : 'save';
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
    if (!S.doc) return;
    await App.cmdSave();
    if (!S.currentFile || S.modified) return;

    const bundleName = `${S.currentFile || S.doc.meta?.domain || getCurrentDocumentLabel() || 'blm-document'}.zip`;
    const response = await api.exportBundle(S.currentFile);
    if (!response.ok) {
      alert('导出文档包失败，请稍后重试。');
      return;
    }
    const bundleBlob = await response.blob();
    App._downloadBlob(bundleBlob, bundleBlob.type || 'application/zip', bundleName);
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
    if ((analysis.validation_issues || []).length) {
      alert('请先处理校验问题，再确认合并。');
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
      alert('请先处理校验问题，再生成合并文档。');
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
    stateEditorCollapsed: false,
    businessModelDialog: { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '' },
  };
}

document.addEventListener('keydown', (event) => {
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
