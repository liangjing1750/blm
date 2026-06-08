'use strict';

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const S = {
  files: [],
  currentFile: null,
  readOnly: false,
  documentRevision: 0,
  baseDocument: null,
  saveDialogMode: 'save',
  doc: null,
  modified: false,
  isSaving: false,
  isExporting: false,
  isPreviewRendering: false,
  runtime: {
    checked: false,
    apiVersion: 0,
    supportsDocs: false,
    supportsCopy: false,
    supportsCollab: false,
  },
  collab: {
    socket: null,
    connected: false,
    clientId: '',
    seq: 0,
    acceptedSeq: 0,
    serverDocumentHash: '',
    users: [],
    userName: '',
    docName: '',
    pendingSnapshot: false,
    syncing: false,
    snapshotTimer: null,
    pingTimer: null,
    snapshotRevision: 0,
    inFlightRevision: 0,
    lastSyncedAt: '',
    pendingRemoteSnapshot: null,
    hasConflict: false,
    localDraftPending: false,
    localDraftUpdatedAt: '',
    localDraftError: '',
    localDraftKey: '',
    draftBaseSeqOverride: null,
    recoveryMode: false,
    localDraftGeneration: 0,
    localDraftClearedGeneration: 0,
    forceSnapshotSync: false,
    reconnectTimer: null,
    shouldReconnect: false,
    lastActivity: null,
    recovering: false,
    everConnected: false,
  },
  user: {
    id: '',
    name: '',
    sessionId: '',
  },
  merge: {
    workspaceFiles: [],
    workspaceNames: {
      left: '',
      right: '',
    },
    labels: {
      left: '',
      right: '',
    },
    documents: {
      left: null,
      right: null,
    },
    analysis: null,
    resolutions: {},
    isChecking: false,
  },
  compare: {
    workspaceFiles: [],
    workspaceNames: {
      left: '',
      right: '',
    },
    versionIds: {
      left: '',
      right: '',
    },
    sourceKinds: {
      left: 'remote',
      right: 'remote',
    },
    versions: {
      left: [],
      right: [],
    },
    archiveVersions: {
      left: [],
      right: [],
    },
    submitVersions: {
      left: [],
      right: [],
    },
    versionLoaded: {
      left: { remote: false, version: false, submit: false },
      right: { remote: false, version: false, submit: false },
    },
    versionLoading: {
      left: false,
      right: false,
    },
    versionVisibleCounts: {
      left: { remote: 10, version: 10, submit: 10 },
      right: { remote: 10, version: 10, submit: 10 },
    },
    labels: {
      left: '',
      right: '',
    },
    documents: {
      left: null,
      right: null,
    },
    result: null,
    needsRun: false,
    isRunning: false,
    runMessage: '',
    reportMode: 'diff',
  },
  recovery: {
    openTab: 'workspace',
    historyDocName: '',
    historyEntries: [],
    versionEntries: [],
    trashEntries: [],
    selectedTrashIds: [],
    workspaceSummaries: [],
    activeSpace: '',
    activeTag: '',
    isOpeningModal: false,
    openingFileName: '',
    workspacePage: 1,
    trashPage: 1,
    historyVisibleCount: 20,
    versionVisibleCount: 20,
    submitVisibleCount: 20,
    workspaceLoading: false,
    trashLoading: false,
  },
  manual: {
    docs: [],
    activeDocId: '',
    activeTitle: '',
    activeSummary: '',
    html: '',
    outline: [],
    images: [],
    collapsedGroups: {},
    loading: false,
    error: '',
  },
  ui: {
    tab: 'domain',
    procId: null, taskId: null,
    stageId: null,
    stageViewMode: 'panorama',
    entityId: null,
    dataView: 'relation',
    stateFieldName: '',
    roleId: null,
    roleQuery: '',
    roleParticipatingOnly: false,
    navHistory: [],
    sbCollapse: {},   // { 'proc-P1': true, 'grp-销售': false }
    sidebarCollapsed: false,
    sidebarW: 240,
    businessDomainFilter: 'all',
    procView: 'stage',  // 'stage' | 'list'(internal editor) | 'flow' | 'role'
    procDiagramMode: 'swimlane',
    procDiagramShowEntities: true,
    procDiagramShowTasks: false,
    nodePerspective: 'user',
    procPrototypeExpanded: {},
    procTasklevelCollapsed: true,
    procAttachmentUpload: { active: false, percent: 0, message: '' },
    procRolePickerCollapsed: {},
    procEditorFocusSelector: '',
    stepNoteEditKey: '',
    orchestrationNoteEditKey: '',
    businessRuleEditKey: '',
    taskParameterDialog: null,
    procDrawerW: 480,
    stageGraphZoom: 1,
    stageEditorCollapsed: true,
    stageNameEditId: '',
    entityDrawerW: 620,
    entityRelationEditorCollapsed: true,
    entityDraft: null,
    stateDiagramZoom: 1,
    stateEditorCollapsed: true,
    businessModelDialog: { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '', returnMode: '', procId: '', taskId: '', afterIdx: null, draft: null },
  }
};

const UI_PREFS_KEY = 'blm-ui-prefs';

function loadUiPrefs() {
  try {
    const raw = window.localStorage?.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveUiPrefs(partialPrefs) {
  try {
    const prefs = { ...loadUiPrefs(), ...partialPrefs };
    window.localStorage?.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {
    // 忽略本地存储不可用的场景
  }
}

function getUiPrefNumber(key, fallback) {
  const value = loadUiPrefs()[key];
  return Number.isFinite(value) ? value : fallback;
}

function getDrawerWidth(kind) {
  return kind === 'process'
    ? (S.ui.procDrawerW || getUiPrefNumber('procDrawerW', 480))
    : (S.ui.entityDrawerW || getUiPrefNumber('entityDrawerW', 620));
}

function getSidebarWidth() {
  return S.ui.sidebarW || getUiPrefNumber('sidebarW', 240);
}

function setSidebarWidth(width) {
  S.ui.sidebarW = width;
  saveUiPrefs({ sidebarW: width });
}

function setDrawerWidth(kind, width) {
  if (kind === 'process') {
    S.ui.procDrawerW = width;
    saveUiPrefs({ procDrawerW: width });
    return;
  }
  S.ui.entityDrawerW = width;
  saveUiPrefs({ entityDrawerW: width });
}

/* ═══════════════════════════════════════════════════════════
   API
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const STEP_TYPES = [
  {value:'Click',  label:'点击'},
  {value:'Query',  label:'查询'}, {value:'Check',  label:'校验'},
  {value:'Fill',   label:'填写'}, {value:'Select', label:'选择'},
  {value:'Compute',label:'计算'}, {value:'Mutate', label:'变更'},
  {value:'Display',label:'显示'},
  {value:'__other__', label:'其它…'},
];
const ORCHESTRATION_TYPES = [
  {value:'Query', label:'查询'},
  {value:'Check', label:'校验'},
  {value:'Compute', label:'计算'},
  {value:'Service', label:'服务'},
  {value:'Mutate', label:'变更'},
  {value:'Custom', label:'自定义'},
];
const QUERY_SOURCE_KINDS = [
  {value:'Dictionary', label:'字典'},
  {value:'Enum', label:'枚举'},
  {value:'QueryService', label:'查询服务'},
  {value:'Custom', label:'自定义'},
];
const FIELD_TYPES = [
  {value:'string',  label:'字符'},  {value:'number',  label:'数值'},
  {value:'decimal', label:'金额'},  {value:'date',    label:'日期'},
  {value:'datetime',label:'日期时间'},{value:'boolean',label:'布尔'},
  {value:'enum',   label:'枚举'},   {value:'text',    label:'长文本'},
  {value:'id',     label:'标识ID'},{value:'list',    label:'列表'},
];
const ROLE_GROUPS = [
  '业务参与方',
  '仓库作业方',
  '监管与审核方',
  '平台与运维方',
  '系统角色',
  '待分类角色',
];

/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */
function nextId(prefix, items) {
  const used = new Set((items||[]).map(x=>x.id));
  let i=1; while(used.has(`${prefix}${i}`))i++;
  return `${prefix}${i}`;
}
function shortBusinessId() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(3);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return Math.random().toString(16).slice(2, 8).toUpperCase().padEnd(6, '0');
}
function nextStableId(prefix, items, preferredName = '') {
  const used = new Set((items || []).map((item) => String(item?.id || '').trim()).filter(Boolean));
  const normalizedPrefix = String(prefix || 'ID').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase() || 'ID';
  const normalizedName = String(preferredName || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .slice(0, 24);
  const base = normalizedName ? `${normalizedPrefix}-${normalizedName}` : `${normalizedPrefix}-${shortBusinessId()}`;
  if (!used.has(base)) return base;
  let candidate = '';
  do {
    candidate = `${base}-${shortBusinessId().slice(0, 4)}`;
  } while (used.has(candidate));
  return candidate;
}
function createUiUid(prefix = 'uid') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
function createDeterministicUiUid(prefix = 'uid', ...parts) {
  const text = parts.map((part) => String(part || '').trim()).join('|');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
const UNASSIGNED_STAGE_ID = '__unassigned__';
const UNASSIGNED_STAGE_NAME = '未设置业务阶段';
const DEFAULT_PANORAMA_COLUMNS = [
  { uid: 'participants', name: '会员客户', scope: '账号/服务机构/参与方', badge: '' },
  { uid: 'parameters', name: '品种参数', scope: '品种/合约/商品/示例参数', badge: '' },
  { uid: 'businessHandling', name: '业务办理', scope: '仓单同步/入库/在库/出库', badge: '' },
  { uid: 'riskSupervision', name: '风险监管', scope: '监管/查询/预警/追溯', badge: '' },
];
const DEFAULT_PANORAMA_LANES = [
  {
    uid: 'smart-platform-phase2',
    name: '示例业务域1',
    badge: '业务域1',
    note: '示例业务分析主对象，承接账号机构、参数同步、业务办理和监管协同。',
  },
  {
    uid: 'receipt-system',
    name: '示例业务域2',
    badge: '业务域2',
    note: '作为关键环节职责参照，帮助识别跨业务域协作边界。',
  },
];
const DEFAULT_PANORAMA_CELLS = [
  { columnUid: 'participants', laneUid: 'smart-platform-phase2', status: '业务域1主责', text: '账号管理、仓库管理、质检机构管理等作为大阶段；维护、审核、变更等细节进入阶段内流程' },
  { columnUid: 'parameters', laneUid: 'smart-platform-phase2', status: '业务域1主责', text: '品种参数管理作为大阶段；品种、合约、商品和示例参数同步维护进入阶段内流程' },
  { columnUid: 'businessHandling', laneUid: 'smart-platform-phase2', status: '业务域1主责', text: '仓单注册、仓单注销、仓单流转等作为大阶段；示例预报、仓库/厂库仓单注册等进入阶段内流程' },
  { columnUid: 'riskSupervision', laneUid: 'smart-platform-phase2', status: '业务域1主责', text: '风险监管作为大阶段；库存监管、风险预警、异常核验、查询追溯和统计分析进入阶段内流程' },
  { columnUid: 'parameters', laneUid: 'receipt-system', status: '业务域2职责', text: '维护品种信息、维护合约信息，作为示例业务域1同步来源' },
  { columnUid: 'businessHandling', laneUid: 'receipt-system', status: '业务域2职责', text: '仓单注册、仓单注销、仓单流转等仓单核心动作可由示例业务域2承载' },
];
const PANORAMA_COLUMN_UID_BY_NAME = new Map(DEFAULT_PANORAMA_COLUMNS.map((column) => [column.name, column.uid]));
const PANORAMA_LANE_UID_BY_NAME = new Map(DEFAULT_PANORAMA_LANES.map((lane) => [lane.name, lane.uid]));
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* textarea 自动撑高：绑定在 oninput 或渲染后调用 */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight) + 'px';
}
/* 渲染完后批量撑高页面内所有 auto-resize textarea */
function initAutoResize() {
  document.querySelectorAll('textarea.auto-resize').forEach(autoResize);
}
function markModified() {
  if (S.readOnly) {
    if (typeof showToast === 'function') showToast('当前查看的是只读版本，不能编辑');
    return;
  }
  if (!S.modified) {
    S.modified = true;
    if (typeof renderToolbar === 'function') renderToolbar();
  }
  if (typeof queueCollabSnapshotSync === 'function') queueCollabSnapshotSync();
}
function getCurrentDocumentLabel() {
  return S.doc?.meta?.domain || S.currentFile || '—';
}
function getCurrentDocumentTitle() {
  return getCurrentDocumentLabel();
}
function resetMergeState() {
  S.merge.workspaceFiles = [];
  S.merge.workspaceNames = { left: '', right: '' };
  S.merge.labels = { left: '', right: '' };
  S.merge.documents = { left: null, right: null };
  S.merge.analysis = null;
  S.merge.resolutions = {};
  S.merge.isChecking = false;
}
function resetCompareState() {
  S.compare.workspaceFiles = [];
  S.compare.workspaceNames = { left: '', right: '' };
  S.compare.versionIds = { left: '', right: '' };
  S.compare.sourceKinds = { left: 'remote', right: 'remote' };
  S.compare.versions = { left: [], right: [] };
  S.compare.archiveVersions = { left: [], right: [] };
  S.compare.submitVersions = { left: [], right: [] };
  S.compare.versionLoaded = { left: { remote: false, version: false, submit: false }, right: { remote: false, version: false, submit: false } };
  S.compare.versionLoading = { left: false, right: false };
  S.compare.versionVisibleCounts = { left: { remote: 10, version: 10, submit: 10 }, right: { remote: 10, version: 10, submit: 10 } };
  S.compare.labels = { left: '', right: '' };
  S.compare.documents = { left: null, right: null };
  S.compare.result = null;
  S.compare.needsRun = false;
  S.compare.isRunning = false;
  S.compare.runMessage = '';
  S.compare.reportMode = 'diff';
}
function resetRecoveryState() {
  S.recovery.openTab = 'workspace';
  S.recovery.historyDocName = '';
  S.recovery.historyEntries = [];
  S.recovery.versionEntries = [];
  S.recovery.trashEntries = [];
  S.recovery.selectedTrashIds = [];
  S.recovery.workspaceSummaries = [];
  S.recovery.activeSpace = '';
  S.recovery.activeTag = '';
  S.recovery.isOpeningModal = false;
  S.recovery.openingFileName = '';
  S.recovery.workspacePage = 1;
  S.recovery.trashPage = 1;
  S.recovery.workspaceLoading = false;
  S.recovery.trashLoading = false;
}
function getEntityName(id) { return S.doc?.entities?.find(e=>e.id===id)?.name||id; }
function getProcessIdentity(proc) {
  return String(proc?.id || proc?.uid || '').trim();
}
function getStageIdentity(stage) {
  return String(stage?.id || stage?.uid || '').trim();
}
function findProcessByIdentity(processId, doc = S.doc) {
  const targetProcessId = String(processId || '').trim();
  if (!targetProcessId) return null;
  return (Array.isArray(doc?.processes) ? doc.processes : []).find((proc) => {
    const id = String(proc?.id || '').trim();
    const uid = String(proc?.uid || '').trim();
    return id === targetProcessId || uid === targetProcessId;
  }) || null;
}
function findStageByIdentity(stageId, doc = S.doc) {
  const targetStageId = String(stageId || '').trim();
  if (!targetStageId || isVirtualStageId(targetStageId)) return null;
  return getStages(doc).find((stage) => {
    const id = String(stage?.id || '').trim();
    const uid = String(stage?.uid || '').trim();
    return id === targetStageId || uid === targetStageId;
  }) || null;
}
function getProcNodes(proc) {
  return Array.isArray(proc?.nodes) ? proc.nodes : (Array.isArray(proc?.tasks) ? proc.tasks : []);
}
function normalizeProcessFlow(proc) {
  if (!proc || typeof proc !== 'object') return { version: 2, orientation: 'horizontal', nodes: [], edges: [] };
  const rawFlow = proc.flow && typeof proc.flow === 'object' && !Array.isArray(proc.flow) ? proc.flow : {};
  const tasks = getProcNodes(proc);
  const taskIds = new Set(tasks.map((task) => String(task.id || '').trim()).filter(Boolean));
  const normalized = {
    version: Number(rawFlow.version || 2) || 2,
    orientation: String(rawFlow.orientation || 'horizontal') === 'vertical' ? 'vertical' : 'horizontal',
    nodes: [],
    edges: [],
    layout: { swimlane: { laneOrder: [], items: {}, labels: {} } },
  };
  const flowNodeIds = new Set();
  const rawNodes = Array.isArray(rawFlow.nodes) ? rawFlow.nodes : [];
  rawNodes.forEach((node, index) => {
    if (!node || typeof node !== 'object') return;
    const kind = String(node.kind || '').trim() === 'gateway' ? 'gateway' : 'task';
    if (kind !== 'gateway') return;
    const id = String(node.id || '').trim() || `G${index + 1}`;
    if (!id || flowNodeIds.has(id) || taskIds.has(id)) return;
    flowNodeIds.add(id);
    normalized.nodes.push({
      ...node,
      id,
      kind: 'gateway',
      gatewayType: String(node.gatewayType || 'exclusive').trim() || 'exclusive',
      title: String(node.title || node.name || '').trim(),
      role_id: String(node.role_id || node.roleId || '').trim(),
    });
  });

  const gatewayIds = new Set(normalized.nodes.map((node) => node.id));
  const validRegularIds = new Set([...taskIds, ...gatewayIds]);
  const normalizeEndpoint = (value, side) => {
    const id = String(value || '').trim();
    if (side === 'from' && id === 'START') return 'START';
    if (side === 'to' && id === 'END') return 'END';
    return id;
  };
  const rawEdges = Array.isArray(rawFlow.edges) ? rawFlow.edges : [];
  const seenEdgeKeys = new Set();
  normalized.edges = rawEdges.map((edge, index) => {
    if (!edge || typeof edge !== 'object') return null;
    const from = normalizeEndpoint(edge.from || edge.source, 'from');
    const to = normalizeEndpoint(edge.to || edge.target, 'to');
    const isDraft = !from || !to;
    if (to === 'START' || from === 'END') return null;
    if (from && from !== 'START' && !validRegularIds.has(from)) return null;
    if (to && to !== 'END' && !validRegularIds.has(to)) return null;
    const key = `${from}->${to}`;
    if (!isDraft) {
      if (seenEdgeKeys.has(key)) return null;
      seenEdgeKeys.add(key);
    }
    return {
      ...edge,
      id: String(edge.id || '').trim() || `E${index + 1}`,
      from,
      to,
      label: String(edge.label || edge.name || '').trim(),
      condition: String(edge.condition || '').trim(),
    };
  }).filter(Boolean);
  const rawLayout = rawFlow.layout && typeof rawFlow.layout === 'object' && !Array.isArray(rawFlow.layout) ? rawFlow.layout : {};
  const rawSwimlane = rawLayout.swimlane && typeof rawLayout.swimlane === 'object' && !Array.isArray(rawLayout.swimlane) ? rawLayout.swimlane : {};
  const normalizeOffsetMap = (value) => {
    const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    Object.entries(value).forEach(([key, offset]) => {
      if (!key || !offset || typeof offset !== 'object' || Array.isArray(offset)) return;
      const dx = Math.round(Number(offset.dx || 0));
      const dy = Math.round(Number(offset.dy || 0));
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      result[String(key)] = { dx, dy };
    });
    return result;
  };
  normalized.layout = {
    swimlane: {
      laneOrder: Array.isArray(rawSwimlane.laneOrder)
        ? rawSwimlane.laneOrder.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      items: normalizeOffsetMap(rawSwimlane.items),
      labels: normalizeOffsetMap(rawSwimlane.labels),
    },
  };
  proc.flow = normalized;
  return proc.flow;
}
function getNodeUserSteps(node) {
  return Array.isArray(node?.userSteps) ? node.userSteps : (Array.isArray(node?.steps) ? node.steps : []);
}
function getNodeOrchestrationTasks(node) {
  return Array.isArray(node?.orchestrationTasks) ? node.orchestrationTasks : [];
}
function getNodeForms(node) {
  if (!node || typeof node !== 'object') return [];
  if (!Array.isArray(node.forms)) node.forms = [];
  return node.forms;
}
function normalizeBusinessRuleEntry(rule, index = 1) {
  const source = rule && typeof rule === 'object'
    ? rule
    : { content: String(rule || '') };
  const id = String(source.id || source.uid || '').trim() || createUiUid('rule');
  const rawName = source.name ?? source.title ?? `规则${index}`;
  const rawContent = source.content ?? source.description ?? source.note ?? '';
  return {
    uid: String(source.uid || '').trim() || id,
    id,
    name: String(rawName),
    content: String(rawContent),
  };
}
function getNodeBusinessRules(node) {
  if (!node || typeof node !== 'object') return [];
  const hasExplicitRules = Array.isArray(node.businessRules) || Array.isArray(node.business_rules);
  const source = Array.isArray(node.businessRules)
    ? node.businessRules
    : (Array.isArray(node.business_rules) ? node.business_rules : []);
  const rules = source.map((rule, index) => normalizeBusinessRuleEntry(rule, index + 1));
  if (!rules.length && !hasExplicitRules && String(node.rules_note || '').trim()) {
    const uid = createUiUid('rule');
    rules.push({ uid, id: uid, name: '业务规则', content: String(node.rules_note || '').trim() });
  }
  node.businessRules = rules;
  return node.businessRules;
}
function formatBusinessRulesText(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule) => {
      const name = String(rule?.name || '').trim();
      const content = String(rule?.content || '').trim();
      if (!name && !content) return '';
      if (!name) return content;
      if (!content) return name;
      return `${name}：${content}`;
    })
    .filter(Boolean)
    .join('\n');
}
function formatPrototypeUploadedAt(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
function normalizePrototypeVersionEntry(version, fallbackName, versionIndex = 1) {
  const normalizedVersion = version && typeof version === 'object' ? version : { name: fallbackName, content: String(version || '') };
  const versionName = String(normalizedVersion.name || '').trim() || fallbackName;
  let versionNumber = Number.parseInt(normalizedVersion.number, 10);
  if (!Number.isFinite(versionNumber) || versionNumber < 1) versionNumber = versionIndex;
  return {
    uid: String(normalizedVersion.uid || '').trim() || createUiUid('protover'),
    number: versionNumber,
    name: versionName,
    content: String(normalizedVersion.content || ''),
    contentType: String(normalizedVersion.contentType || 'text/html').trim() || 'text/html',
    contentEncoding: String(normalizedVersion.contentEncoding || '').trim(),
    uploadToken: String(normalizedVersion.uploadToken || '').trim(),
    localUrl: String(normalizedVersion.localUrl || '').trim(),
    size: Number(normalizedVersion.size || 0) || 0,
    uploadedAt: String(normalizedVersion.uploadedAt || '').trim(),
  };
}
function normalizePrototypeFileEntry(file, index = 1) {
  const fallbackName = `原型${index}.html`;
  if (!file || typeof file !== 'object') {
    const version = normalizePrototypeVersionEntry({}, fallbackName, 1);
    return {
      uid: createUiUid('proto'),
      name: fallbackName,
      versionUid: version.uid,
      content: version.content,
      contentType: version.contentType,
      contentEncoding: version.contentEncoding,
      uploadToken: version.uploadToken,
      localUrl: version.localUrl,
      size: version.size,
      uploadedAt: version.uploadedAt,
      versions: [version],
    };
  }
  const normalizedName = String(file.name || '').trim() || fallbackName;
  const versionSources = Array.isArray(file.versions) && file.versions.length
    ? file.versions
    : [{
      uid: String(file.versionUid || file.currentVersionUid || '').trim(),
      number: 1,
      name: normalizedName,
      content: String(file.content || ''),
      contentType: String(file.contentType || 'text/html').trim() || 'text/html',
      contentEncoding: String(file.contentEncoding || '').trim(),
      uploadToken: String(file.uploadToken || '').trim(),
      localUrl: String(file.localUrl || '').trim(),
      size: Number(file.size || 0) || 0,
      uploadedAt: String(file.uploadedAt || '').trim(),
    }];
  const normalizedVersions = versionSources
    .map((version, versionIndex) => normalizePrototypeVersionEntry(version, normalizedName, versionIndex + 1))
    .sort((left, right) => (left.number - right.number) || String(left.uid).localeCompare(String(right.uid)));
  normalizedVersions.forEach((version, versionIndex) => { version.number = versionIndex + 1; });
  const versionUid = String(file.versionUid || file.currentVersionUid || '').trim();
  const currentVersion = normalizedVersions.find((version) => version.uid === versionUid) || normalizedVersions[normalizedVersions.length - 1];
  return {
    uid: String(file.uid || '').trim() || createUiUid('proto'),
    name: normalizedName || currentVersion.name,
    versionUid: currentVersion.uid,
    content: currentVersion.content,
    contentType: currentVersion.contentType,
    contentEncoding: currentVersion.contentEncoding,
    uploadToken: currentVersion.uploadToken,
    localUrl: currentVersion.localUrl,
    size: currentVersion.size,
    uploadedAt: currentVersion.uploadedAt,
    versions: normalizedVersions,
  };
}
function normalizeGraphOffset(value) {
  if (!value || typeof value !== 'object') return { x: 0, y: 0 };
  const x = Number.isFinite(Number(value.x)) ? Math.round(Number(value.x)) : 0;
  const y = Number.isFinite(Number(value.y)) ? Math.round(Number(value.y)) : 0;
  return { x, y };
}
function normalizeGridSlot(value) {
  if (!value || typeof value !== 'object') return null;
  const row = Math.max(0, Math.round(Number(value.row) || 0));
  const col = Math.max(0, Math.round(Number(value.col) || 0));
  return { row, col };
}
function createDefaultPanoramaModel() {
  const model = {
    columns: DEFAULT_PANORAMA_COLUMNS.map((column) => ({ ...column })),
    lanes: DEFAULT_PANORAMA_LANES.map((lane) => ({ ...lane })),
    cells: DEFAULT_PANORAMA_CELLS.map((cell) => ({ ...cell })),
  };
  defineModelUidAliasDeep(model);
  return model;
}
function isLegacyDefaultPanoramaModel(panorama) {
  if (!panorama || typeof panorama !== 'object') return false;
  const columns = Array.isArray(panorama.columns) ? panorama.columns : [];
  const lanes = Array.isArray(panorama.lanes) ? panorama.lanes : [];
  const legacyColumnNames = ['参与主体', '品种参数', '入库', '在库', '出库', '其他'];
  const legacyColumnIds = ['participants', 'parameters', 'inbound', 'inStock', 'outbound', 'other'];
  const columnIds = columns.map((column) => String(column?.id || '').trim());
  const columnNames = columns.map((column) => String(column?.name || '').trim());
  if (columnIds.length !== legacyColumnIds.length) return false;
  if (!legacyColumnIds.every((id, index) => columnIds[index] === id)) return false;
  if (!legacyColumnNames.every((name, index) => !columnNames[index] || columnNames[index] === name)) return false;
  const laneIds = lanes.map((lane) => String(lane?.id || '').trim()).sort();
  return laneIds.length === 2
    && laneIds[0] === 'receipt-system'
    && laneIds[1] === 'smart-platform-phase2';
}
function normalizePanoramaNameKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}
function semanticPanoramaUid(prefix, name, index, usedIds, knownNameUids = new Map()) {
  const nameKey = normalizePanoramaNameKey(name);
  const knownUid = knownNameUids.get(nameKey);
  const baseId = knownUid || (nameKey
    ? createDeterministicUiUid(prefix, nameKey)
    : `${prefix}-unnamed-${index}`);
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}
function normalizePanoramaColumnEntry(column, index = 1, usedIds = new Set()) {
  const normalized = column && typeof column === 'object' ? column : {};
  const fallback = DEFAULT_PANORAMA_COLUMNS[index - 1] || {};
  const hasName = Object.prototype.hasOwnProperty.call(normalized, 'name');
  const name = hasName ? String(normalized.name || '').trim() : (fallback.name || `价值流${index}`);
  let uid = String(normalized.uid || '').trim();
  if (uid && usedIds.has(uid)) uid = '';
  if (uid) usedIds.add(uid);
  else uid = semanticPanoramaUid('panorama-column', name, index, usedIds, PANORAMA_COLUMN_UID_BY_NAME);
  const entry = {
    uid,
    name,
    scope: String(normalized.scope || '').trim(),
    badge: String(normalized.badge || '').trim(),
  };
  defineUiAlias(entry, 'id', 'uid');
  return entry;
}
function normalizePanoramaLaneEntry(lane, index = 1, usedIds = new Set()) {
  const normalized = lane && typeof lane === 'object' ? lane : {};
  const fallback = DEFAULT_PANORAMA_LANES[index - 1] || {};
  const hasName = Object.prototype.hasOwnProperty.call(normalized, 'name');
  const name = hasName ? String(normalized.name || '').trim() : (fallback.name || `业务域${index}`);
  let uid = String(normalized.uid || '').trim();
  if (uid && usedIds.has(uid)) uid = '';
  if (uid) usedIds.add(uid);
  else uid = semanticPanoramaUid('panorama-lane', name, index, usedIds, PANORAMA_LANE_UID_BY_NAME);
  const entry = {
    uid,
    name,
    badge: String(normalized.badge || '').trim(),
    note: String(normalized.note || '').trim(),
  };
  defineUiAlias(entry, 'id', 'uid');
  return entry;
}
function normalizePanoramaCellEntry(cell) {
  const normalized = cell && typeof cell === 'object' ? cell : {};
  const uid = String(normalized.uid || '').trim();
  const entry = {
    ...(uid ? { uid } : {}),
    columnUid: String(normalized.columnUid || '').trim(),
    laneUid: String(normalized.laneUid || '').trim(),
    status: String(normalized.status || '').trim(),
    text: String(normalized.text || normalized.note || '').trim(),
  };
  defineUiAlias(entry, 'columnId', 'columnUid');
  defineUiAlias(entry, 'laneId', 'laneUid');
  return entry;
}
function getPanoramaModel(doc = S.doc) {
  if (!doc || typeof doc !== 'object') return createDefaultPanoramaModel();
  if (!doc.panorama || typeof doc.panorama !== 'object') {
    doc.panorama = createDefaultPanoramaModel();
  } else if (isLegacyDefaultPanoramaModel(doc.panorama)) {
    doc.panorama = createDefaultPanoramaModel();
  }
  const columnSource = Array.isArray(doc.panorama.columns) && doc.panorama.columns.length
    ? doc.panorama.columns
    : createDefaultPanoramaModel().columns;
  const laneSource = Array.isArray(doc.panorama.lanes) && doc.panorama.lanes.length
    ? doc.panorama.lanes
    : createDefaultPanoramaModel().lanes;
  const columnIds = new Set();
  const laneIds = new Set();
  const columns = columnSource.map((column, index) => normalizePanoramaColumnEntry(column, index + 1, columnIds));
  const lanes = laneSource.map((lane, index) => normalizePanoramaLaneEntry(lane, index + 1, laneIds));
  const columnRefMap = new Map();
  const laneRefMap = new Map();
  columnSource.forEach((source, index) => {
    const column = columns[index];
    [source?.uid, source?.id, source?.key, column?.uid].forEach((ref) => {
      const text = String(ref || '').trim();
      if (text && column?.uid) columnRefMap.set(text, column.uid);
    });
  });
  laneSource.forEach((source, index) => {
    const lane = lanes[index];
    [source?.uid, source?.id, source?.key, lane?.uid].forEach((ref) => {
      const text = String(ref || '').trim();
      if (text && lane?.uid) laneRefMap.set(text, lane.uid);
    });
  });
  const validColumnIds = new Set(columns.map((column) => column.uid));
  const validLaneIds = new Set(lanes.map((lane) => lane.uid));
  const defaultCells = new Map(DEFAULT_PANORAMA_CELLS.map((cell) => [`${cell.laneUid}::${cell.columnUid}`, cell]));
  const cells = new Map();
  (Array.isArray(doc.panorama.cells) ? doc.panorama.cells : []).forEach((cell) => {
    const normalized = normalizePanoramaCellEntry(cell);
    normalized.columnUid = columnRefMap.get(normalized.columnUid) || normalized.columnUid;
    normalized.laneUid = laneRefMap.get(normalized.laneUid) || normalized.laneUid;
    if (!validColumnIds.has(normalized.columnUid) || !validLaneIds.has(normalized.laneUid)) return;
    cells.set(`${normalized.laneUid}::${normalized.columnUid}`, normalized);
  });
  lanes.forEach((lane) => {
    columns.forEach((column) => {
      const cellKey = `${lane.uid}::${column.uid}`;
      if (cells.has(cellKey)) return;
      const defaultCell = defaultCells.get(cellKey);
      cells.set(cellKey, defaultCell
        ? { ...defaultCell }
        : { columnUid: column.uid, laneUid: lane.uid, status: '', text: '' });
    });
  });
  doc.panorama = {
    columns,
    lanes,
    cells: Array.from(cells.values()),
  };
  getStages(doc).forEach((stage) => {
    const columnRef = String(stage.panoramaColumnUid || stage.panoramaColumnId || '').trim();
    const laneRef = String(stage.panoramaLaneUid || stage.panoramaLaneId || '').trim();
    stage.panoramaColumnUid = columnRefMap.get(columnRef) || columnRef;
    stage.panoramaLaneUid = laneRefMap.get(laneRef) || laneRef;
    delete stage.panoramaColumnId;
    delete stage.panoramaLaneId;
  });
  defineModelUidAliasDeep(doc.panorama);
  return doc.panorama;
}
function getPanoramaCell(model, laneId, columnId) {
  const normalizedLaneId = String(laneId || '').trim();
  const normalizedColumnId = String(columnId || '').trim();
  const cell = (model?.cells || []).find((item) => item.laneUid === normalizedLaneId && item.columnUid === normalizedColumnId)
    || { laneUid: normalizedLaneId, columnUid: normalizedColumnId, status: '', text: '' };
  defineUiAlias(cell, 'columnId', 'columnUid');
  defineUiAlias(cell, 'laneId', 'laneUid');
  return cell;
}
function normalizeStageProcessLinkEntry(link) {
  const normalized = link && typeof link === 'object' ? link : {};
  return {
    uid: String(normalized.uid || '').trim() || createUiUid('stageproc'),
    fromProcessUid: String(normalized.fromProcessUid || normalized.fromProcessId || '').trim(),
    toProcessUid: String(normalized.toProcessUid || normalized.toProcessId || '').trim(),
  };
}
function normalizeStageLinkEntry(link) {
  const normalized = link && typeof link === 'object' ? link : {};
  return {
    uid: String(normalized.uid || '').trim() || createUiUid('stagelink'),
    fromStageUid: String(normalized.fromStageUid || normalized.fromStageId || '').trim(),
    toStageUid: String(normalized.toStageUid || normalized.toStageId || '').trim(),
  };
}
function normalizeStageFlowRefEntry(ref, index = 1) {
  const normalized = ref && typeof ref === 'object' ? ref : {};
  const stageUid = String(normalized.stageUid || normalized.stageId || normalized.stage_id || '').trim();
  const processUid = String(normalized.processUid || normalized.processId || normalized.process_id || '').trim();
  return {
    uid: String(normalized.uid || '').trim() || (stageUid && processUid ? createDeterministicUiUid('stage-flow-ref', stageUid, processUid) : createUiUid('stageref')),
    id: String(normalized.id || '').trim() || `SFR${index}`,
    stageUid,
    processUid,
    order: Math.max(1, Math.round(Number(normalized.order || index) || index)),
    pos: normalizeGraphOffset(normalized.pos),
  };
}
function normalizeStageFlowLinkEntry(link, index = 1) {
  const normalized = link && typeof link === 'object' ? link : {};
  return {
    uid: String(normalized.uid || '').trim() || createUiUid('stagereflink'),
    id: String(normalized.id || '').trim() || `SFL${index}`,
    stageUid: String(normalized.stageUid || normalized.stageId || normalized.stage_id || '').trim(),
    fromRefUid: String(normalized.fromRefUid || normalized.fromRefId || normalized.from_ref_id || '').trim(),
    toRefUid: String(normalized.toRefUid || normalized.toRefId || normalized.to_ref_id || '').trim(),
  };
}
function normalizeStageEntry(stage, index = 1, processes = [], stageFlowRefs = []) {
  const normalized = stage && typeof stage === 'object' ? stage : {};
  let subDomain = String(normalized.subDomain || '').trim();
  if (!subDomain) {
    const stageUid = String(normalized.id || normalized.uid || '').trim();
    const refMembers = (Array.isArray(stageFlowRefs) ? stageFlowRefs : [])
      .filter((ref) => String(ref?.stageUid || ref?.stageId || '').trim() === stageUid)
      .map((ref) => findProcessByIdentity(ref?.processUid, { processes }))
      .filter(Boolean);
    const legacyMember = (processes || [])
      .find((proc) => String(proc?.stageUid || proc?.stageId || '').trim() === stageUid && String(proc?.subDomain || '').trim());
    const member = refMembers.find((proc) => String(proc?.subDomain || '').trim()) || legacyMember;
    subDomain = String(member?.subDomain || '').trim();
  }
  return {
    uid: String(normalized.uid || '').trim() || createUiUid('stage'),
    id: String(normalized.id || normalized.uid || '').trim() || `S${index}`,
    name: String(normalized.name || '').trim() || `业务阶段${index}`,
    subDomain,
    panoramaColumnUid: String(normalized.panoramaColumnUid || '').trim(),
    panoramaLaneUid: String(normalized.panoramaLaneUid || '').trim(),
    panoramaSlot: normalizeGridSlot(normalized.panoramaSlot),
    panoramaPos: normalized.panoramaPos && typeof normalized.panoramaPos === 'object'
      ? normalizeGraphOffset(normalized.panoramaPos)
      : null,
    pos: normalizeGraphOffset(normalized.pos),
    processLinks: (Array.isArray(normalized.processLinks) ? normalized.processLinks : []).map(normalizeStageProcessLinkEntry),
  };
}
function getStages(doc = S.doc) {
  if (!doc || typeof doc !== 'object') return [];
  if (!Array.isArray(doc.stages)) doc.stages = [];
  doc.stages = doc.stages.map((stage, index) => normalizeStageEntry(stage, index + 1, doc.processes || [], doc.stageFlowRefs || []));
  return doc.stages;
}
function getStageLinks(doc = S.doc) {
  if (!doc || typeof doc !== 'object') return [];
  if (!Array.isArray(doc.stageLinks)) doc.stageLinks = [];
  doc.stageLinks = doc.stageLinks.map(normalizeStageLinkEntry);
  return doc.stageLinks;
}
function getStageFlowRefs(doc = S.doc) {
  if (!doc || typeof doc !== 'object') return [];
  if (!Array.isArray(doc.stageFlowRefs)) doc.stageFlowRefs = [];
  let refs = doc.stageFlowRefs
    .map((ref, index) => normalizeStageFlowRefEntry(ref, index + 1))
    .filter((ref) => ref.stageUid && ref.processUid);
  const existingPairs = new Set(
    refs
      .filter((ref) => ref.stageUid && ref.processUid)
      .map((ref) => `${ref.stageUid}::${ref.processUid}`),
  );
  const usedIds = new Set(refs.map((ref) => ref.id));
  const stageOrderMap = {};
  refs.forEach((ref) => {
    if (!ref.stageUid) return;
    stageOrderMap[ref.stageUid] = Math.max(stageOrderMap[ref.stageUid] || 0, ref.order || 1);
  });
  (Array.isArray(doc.processes) ? doc.processes : []).forEach((proc) => {
    const stageUid = String(proc?.stageUid || proc?.stageId || '').trim();
    const processUid = getProcessIdentity(proc);
    if (!stageUid || !processUid) return;
    const pairKey = `${stageUid}::${processUid}`;
    if (existingPairs.has(pairKey)) return;
    stageOrderMap[stageUid] = (stageOrderMap[stageUid] || 0) + 1;
    let nextIndex = refs.length + 1;
    let nextId = `SFR${nextIndex}`;
    while (usedIds.has(nextId)) {
      nextIndex += 1;
      nextId = `SFR${nextIndex}`;
    }
    usedIds.add(nextId);
    refs.push({
      uid: createDeterministicUiUid('stage-flow-ref', stageUid, processUid),
      id: nextId,
      stageUid,
      processUid,
      order: stageOrderMap[stageUid],
      pos: normalizeGraphOffset(proc.stagePos),
    });
    existingPairs.add(pairKey);
  });
  refs.sort((left, right) => {
    if (left.stageUid !== right.stageUid) return left.stageUid.localeCompare(right.stageUid);
    if ((left.order || 0) !== (right.order || 0)) return (left.order || 0) - (right.order || 0);
    return left.id.localeCompare(right.id);
  });
  doc.stageFlowRefs = refs;
  return doc.stageFlowRefs;
}
function getStageFlowLinks(doc = S.doc) {
  if (!doc || typeof doc !== 'object') return [];
  if (!Array.isArray(doc.stageFlowLinks)) doc.stageFlowLinks = [];
  let links = doc.stageFlowLinks
    .map((link, index) => normalizeStageFlowLinkEntry(link, index + 1))
    .filter((link) => link.stageUid && link.fromRefUid && link.toRefUid);
  if (!links.length) {
    const refs = getStageFlowRefs(doc);
    const refByStageProcess = new Map();
    refs.forEach((ref) => {
      const proc = getStageRefProcess(ref, doc);
      [ref.processUid, proc?.id, proc?.uid].forEach((processKey) => {
        const normalizedProcessKey = String(processKey || '').trim();
        if (normalizedProcessKey) refByStageProcess.set(`${ref.stageUid}::${normalizedProcessKey}`, ref.id);
      });
    });
    const generated = [];
    getStages(doc).forEach((stage) => {
      getStageProcessLinks(stage).forEach((link, index) => {
        const fromRefUid = refByStageProcess.get(`${stage.id}::${link.fromProcessUid}`) || '';
        const toRefUid = refByStageProcess.get(`${stage.id}::${link.toProcessUid}`) || '';
        if (!fromRefUid || !toRefUid) return;
        generated.push(normalizeStageFlowLinkEntry({
          id: `SFL${generated.length + 1}`,
          stageUid: stage.id,
          fromRefUid,
          toRefUid,
        }, generated.length + 1));
      });
    });
    links = generated;
  }
  doc.stageFlowLinks = links;
  return doc.stageFlowLinks;
}
function getStageProcessLinks(stage) {
  if (!stage || typeof stage !== 'object') return [];
  if (!Array.isArray(stage.processLinks)) stage.processLinks = [];
  stage.processLinks = stage.processLinks.map(normalizeStageProcessLinkEntry);
  return stage.processLinks;
}
function isVirtualStageId(stageId) {
  return String(stageId || '').trim() === UNASSIGNED_STAGE_ID;
}
function findStage(stageId, doc = S.doc) {
  const targetStageId = String(stageId || '').trim();
  if (!targetStageId || isVirtualStageId(targetStageId)) return null;
  return findStageByIdentity(targetStageId, doc);
}
function getStageProcessRefs(stageId, doc = S.doc) {
  const targetStageId = String(stageId || '').trim();
  const refs = getStageFlowRefs(doc);
  if (isVirtualStageId(targetStageId)) {
    const referencedProcessUids = new Set(refs.map((ref) => ref.processUid));
    return (Array.isArray(doc?.processes) ? doc.processes : [])
      .filter((proc) => !referencedProcessUids.has(getProcessIdentity(proc)))
      .map((proc, index) => ({
        uid: `virtual-ref-${getProcessIdentity(proc)}`,
        id: `virtual-ref-${getProcessIdentity(proc)}`,
        stageUid: UNASSIGNED_STAGE_ID,
        processUid: getProcessIdentity(proc),
        order: index + 1,
        pos: normalizeGraphOffset(proc.stagePos),
        virtual: true,
      }));
  }
  const stage = findStageByIdentity(targetStageId, doc);
  const stageKeys = new Set([
    targetStageId,
    String(stage?.id || '').trim(),
    String(stage?.uid || '').trim(),
  ].filter(Boolean));
  return refs
    .filter((ref) => stageKeys.has(String(ref.stageUid || ref.stageId || '').trim()))
    .sort((left, right) => (left.order - right.order) || left.id.localeCompare(right.id));
}
function findStageProcessRef(refId, doc = S.doc) {
  const targetRefId = String(refId || '').trim();
  if (!targetRefId) return null;
  return getStageFlowRefs(doc).find((ref) => ref.id === targetRefId) || null;
}
function getProcessStageRefs(processId, doc = S.doc) {
  const targetProcessId = String(processId || '').trim();
  const targetProcess = findProcessByIdentity(targetProcessId, doc);
  const processKeys = new Set([
    targetProcessId,
    String(targetProcess?.id || '').trim(),
    String(targetProcess?.uid || '').trim(),
  ].filter(Boolean));
  return getStageFlowRefs(doc)
    .filter((ref) => processKeys.has(String(ref.processUid || '').trim()))
    .sort((left, right) => left.stageUid.localeCompare(right.stageUid) || left.order - right.order);
}
function getStageRefProcess(ref, doc = S.doc) {
  const processUid = String(ref?.processUid || '').trim();
  return findProcessByIdentity(processUid, doc);
}
function getStageProcesses(stageId, doc = S.doc) {
  return getStageProcessRefs(stageId, doc)
    .map((ref) => getStageRefProcess(ref, doc))
    .filter(Boolean);
}
function getStageItems(doc = S.doc) {
  const stages = getStages(doc);
  const items = stages.map((stage) => ({ ...stage, virtual: false }));
  const unassignedProcesses = getStageProcessRefs(UNASSIGNED_STAGE_ID, doc);
  if (unassignedProcesses.length) {
    items.push({
      uid: 'virtual-unassigned-stage',
      id: UNASSIGNED_STAGE_ID,
      name: UNASSIGNED_STAGE_NAME,
      subDomain: '',
      pos: { x: 0, y: 0 },
      processLinks: [],
      virtual: true,
    });
  }
  return items;
}
function getStageDisplayName(stageId, doc = S.doc) {
  if (isVirtualStageId(stageId)) return UNASSIGNED_STAGE_NAME;
  return findStage(stageId, doc)?.name || String(stageId || '').trim();
}
function getProcPrototypeFiles(proc) {
  if (!proc || typeof proc !== 'object') return [];
  if (!Array.isArray(proc.prototypeFiles)) proc.prototypeFiles = [];
  proc.prototypeFiles = proc.prototypeFiles.map((file, index) => normalizePrototypeFileEntry(file, index + 1));
  return proc.prototypeFiles;
}
function defineUiAlias(target, aliasKey, actualKey) {
  if (!target || typeof target !== 'object') return;
  const existing = Object.getOwnPropertyDescriptor(target, aliasKey);
  if (existing && typeof existing.get === 'function') return;
  Object.defineProperty(target, aliasKey, {
    configurable: true,
    enumerable: false,
    get() {
      return this[actualKey];
    },
    set(value) {
      this[actualKey] = value;
    },
  });
}

function defineModelUidAliasDeep(value) {
  if (Array.isArray(value)) {
    value.forEach(defineModelUidAliasDeep);
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  if (String(value.uid || '').trim()) {
    defineUiAlias(value, 'id', 'uid');
  }
  const referenceAliases = {
    columnId: 'columnUid',
    laneId: 'laneUid',
    panoramaColumnId: 'panoramaColumnUid',
    panoramaLaneId: 'panoramaLaneUid',
    fromProcessId: 'fromProcessUid',
    toProcessId: 'toProcessUid',
    fromStageId: 'fromStageUid',
    toStageId: 'toStageUid',
    stageId: 'stageUid',
    processId: 'processUid',
    fromRefId: 'fromRefUid',
    toRefId: 'toRefUid',
    businessComponentId: 'businessComponentUid',
    businessComponentIds: 'businessComponentUids',
    businessConstructId: 'businessConstructUid',
    businessConstructIds: 'businessConstructUids',
    relatedProcessIds: 'relatedProcessUids',
    constructId: 'constructUid',
    constructIds: 'constructUids',
    taskDefinitionId: 'taskDefinitionUid',
    taskDefinitionIds: 'taskDefinitionUids',
    entityId: 'entityUid',
    entityIds: 'entityUids',
    entity_id: 'entity_uid',
    role_id: 'role_uid',
    role_ids: 'role_uids',
    applies_to: 'appliesToUid',
  };
  Object.entries(referenceAliases).forEach(([aliasKey, actualKey]) => {
    if (Object.prototype.hasOwnProperty.call(value, actualKey)) {
      defineUiAlias(value, aliasKey, actualKey);
    }
  });
  Object.values(value).forEach(defineModelUidAliasDeep);
  return value;
}

function normalizeLegacyBusinessComponentKeys(value) {
  if (Array.isArray(value)) {
    value.forEach((item) => normalizeLegacyBusinessComponentKeys(item));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const collectionRenames = {
    capabilityUnits: 'businessComponents',
  };
  const fieldRenames = {
    capabilityUnitId: 'businessComponentUid',
    capabilityUnit: 'businessComponent',
    capabilityUnitIds: 'businessComponentUids',
  };

  Object.entries(collectionRenames).forEach(([legacyKey, currentKey]) => {
    if (!Object.prototype.hasOwnProperty.call(value, currentKey) && Object.prototype.hasOwnProperty.call(value, legacyKey)) {
      value[currentKey] = value[legacyKey];
    }
    if (legacyKey !== currentKey) delete value[legacyKey];
  });
  Object.entries(fieldRenames).forEach(([legacyKey, currentKey]) => {
    if (!Object.prototype.hasOwnProperty.call(value, currentKey) && Object.prototype.hasOwnProperty.call(value, legacyKey)) {
      value[currentKey] = value[legacyKey];
    }
    if (legacyKey !== currentKey) delete value[legacyKey];
  });
  Object.values(value).forEach((item) => normalizeLegacyBusinessComponentKeys(item));
}

function hydrateDocumentForUi(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  defineModelUidAliasDeep(doc);
  if (doc.document && typeof doc.document === 'object' && !doc.processes && !doc.entities && !doc.businessComponents) {
    Object.assign(doc, doc.document);
    delete doc.document;
  }
  normalizeLegacyBusinessComponentKeys(doc);
  if (!Array.isArray(doc.businessComponents)) doc.businessComponents = [];
  if (!Array.isArray(doc.businessConstructs)) doc.businessConstructs = [];
  if (!Array.isArray(doc.taskDefinitions)) doc.taskDefinitions = [];
  getStages(doc);
  getStageLinks(doc);
  getStageFlowRefs(doc);
  getStageFlowLinks(doc);
  getPanoramaModel(doc);
  (doc.processes || []).forEach((proc) => {
    if (!Array.isArray(proc.nodes) && Array.isArray(proc.tasks)) proc.nodes = proc.tasks;
    if (!Array.isArray(proc.nodes)) proc.nodes = [];
    defineUiAlias(proc, 'tasks', 'nodes');
    proc.flowGroup = String(proc.flowGroup || '');
    proc.stageUid = String(proc.stageUid || proc.stageId || '').trim();
    proc.stagePos = normalizeGraphOffset(proc.stagePos);
    getProcPrototypeFiles(proc);
    normalizeProcessFlow(proc);
    proc.nodes.forEach((node) => {
      if (!Array.isArray(node.userSteps) && Array.isArray(node.steps)) node.userSteps = node.steps;
      if (!Array.isArray(node.userSteps)) node.userSteps = [];
      if (!Array.isArray(node.orchestrationTasks)) node.orchestrationTasks = [];
      if (!Array.isArray(node.forms)) node.forms = [];
      defineUiAlias(node, 'steps', 'userSteps');
      getNodeBusinessRules(node);
      syncTaskRole(node);
    });
  });
  defineModelUidAliasDeep(doc);
  // 清理无效的 stageFlowRefs（指向不存在流程的遗留引用）
  if (Array.isArray(doc.stageFlowRefs) && Array.isArray(doc.processes)) {
    const validIds = new Set();
    doc.processes.forEach((p) => {
      if (p.id) validIds.add(p.id);
      if (p.uid) validIds.add(p.uid);
    });
    doc.stageFlowRefs = doc.stageFlowRefs.filter((ref) => {
      const puid = ref.processUid || '';
      return !puid || validIds.has(puid);
    });
  }
  return doc;
}
function currentStage() { return getStageItems(S.doc).find((stage) => stage.id === S.ui.stageId) || null; }
function currentProc()  { return findProcessByIdentity(S.ui.procId, S.doc); }
function currentNode()  { return getProcNodes(currentProc()).find(t=>t.id===S.ui.taskId)||null; }
function currentTask()  { return currentNode(); }
function currentEntity() { return (S.doc?.entities||[]).find(e=>e.id===S.ui.entityId)||null; }
function normalizeRoleName(name) { return String(name || '').trim(); }
function normalizeSlashList(value) {
  return String(value || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
}
function normalizeStatusRole(value, fallbackIsStatus = false) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'primary' || raw === 'main' || raw === 'master') return 'primary';
  if (raw === 'secondary' || raw === 'sub' || raw === 'child') return 'secondary';
  return fallbackIsStatus ? 'primary' : '';
}
function getFieldStatusRole(field) {
  return normalizeStatusRole(field?.status_role, !!field?.is_status);
}
function syncFieldStatusRole(field, preferredRole) {
  if (!field || typeof field !== 'object') return '';
  const hasPreferredRole = arguments.length >= 2;
  const nextRole = hasPreferredRole
    ? normalizeStatusRole(preferredRole, false)
    : normalizeStatusRole(field.status_role, !!field.is_status);
  field.status_role = nextRole;
  field.is_status = !!nextRole;
  if (!Object.prototype.hasOwnProperty.call(field, 'state_values')) {
    field.state_values = '';
  }
  return nextRole;
}
function isStatusField(field) {
  return !!getFieldStatusRole(field);
}
function getFieldStatusRoleLabel(field, mode = 'long') {
  const role = getFieldStatusRole(field);
  if (role === 'primary') return mode === 'short' ? '主' : '主状态';
  if (role === 'secondary') return mode === 'short' ? '子' : '子状态';
  return '';
}
function inferStateValuesFromNote(note) {
  const values = normalizeSlashList(note);
  if (!values.length) return [];
  const isCompact = values.every((item) => item.length <= 16 && !/[；;,，。]/.test(item));
  return isCompact ? values : [];
}
function getFieldStateValueText(field) {
  const explicit = String(field?.state_values || '').trim();
  if (explicit) return explicit;
  const inferred = inferStateValuesFromNote(field?.note || '');
  return inferred.join('/');
}
function getFieldRuleText(field) {
  const noteText = String(field?.note || '').trim();
  const stateValueText = getFieldStateValueText(field);
  if (!isStatusField(field)) return noteText;
  const inferredText = inferStateValuesFromNote(noteText).join('/');
  const noteOnly = noteText && noteText !== stateValueText && inferredText !== stateValueText ? noteText : '';
  if (stateValueText && noteOnly) return `${stateValueText}；${noteOnly}`;
  return noteText || stateValueText;
}
function getFieldStateValues(field) {
  return normalizeSlashList(getFieldStateValueText(field));
}
function normalizeStateNodeKind(kind) {
  const raw = String(kind || '').trim().toLowerCase();
  if (raw === 'initial' || raw === 'start' || raw === 'entry') return 'initial';
  if (raw === 'terminal' || raw === 'end' || raw === 'finish' || raw === 'final') return 'terminal';
  return 'intermediate';
}
function getStateNodeKindLabel(kind) {
  const normalized = normalizeStateNodeKind(kind);
  if (normalized === 'initial') return '初始状态';
  if (normalized === 'terminal') return '结束状态';
  return '中间状态';
}
function normalizeOptionalGraphOffset(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}
function inferDefaultStateNodeKind(index, total) {
  if (total <= 1) return 'intermediate';
  if (index === 0) return 'initial';
  if (index === total - 1) return 'terminal';
  return 'intermediate';
}
function syncFieldStateNodes(field) {
  if (!field || typeof field !== 'object') return [];
  const states = getFieldStateValues(field);
  const rawNodes = Array.isArray(field.state_nodes) ? field.state_nodes : [];
  const existingNodes = new Map();
  rawNodes
    .filter((item) => item && typeof item === 'object')
    .forEach((item) => {
      const name = String(item.name || '').trim();
      if (!name) return;
      existingNodes.set(name, item);
    });
  field.state_nodes = states.map((state, index) => {
    const existing = existingNodes.get(state) || {};
    const node = {
      name: state,
      kind: Object.prototype.hasOwnProperty.call(existing, 'kind')
        ? normalizeStateNodeKind(existing.kind)
        : inferDefaultStateNodeKind(index, states.length),
    };
    const pos = normalizeOptionalGraphOffset(existing.pos);
    const markerPos = normalizeOptionalGraphOffset(existing.markerPos);
    if (pos) node.pos = pos;
    if (markerPos) node.markerPos = markerPos;
    return node;
  });
  return field.state_nodes;
}
function getFieldStateNodes(field) {
  const states = getFieldStateValues(field);
  const rawNodes = Array.isArray(field?.state_nodes) ? field.state_nodes : [];
  const existingNodes = new Map();
  rawNodes
    .filter((item) => item && typeof item === 'object')
    .forEach((item) => {
      const name = String(item.name || '').trim();
      if (!name) return;
      existingNodes.set(name, item);
    });
  return states.map((state, index) => {
    const existing = existingNodes.get(state) || {};
    const node = {
      name: state,
      kind: Object.prototype.hasOwnProperty.call(existing, 'kind')
        ? normalizeStateNodeKind(existing.kind)
        : inferDefaultStateNodeKind(index, states.length),
    };
    const pos = normalizeOptionalGraphOffset(existing.pos);
    const markerPos = normalizeOptionalGraphOffset(existing.markerPos);
    if (pos) node.pos = pos;
    if (markerPos) node.markerPos = markerPos;
    return node;
  });
}
function getEntityStateNodes(entity, preferredFieldName = '') {
  return getFieldStateNodes(getEntityStatusField(entity, preferredFieldName));
}
function getEntityStatusFields(entity) {
  return (entity?.fields || [])
    .filter(isStatusField)
    .sort((left, right) => {
      const leftPriority = getFieldStatusRole(left) === 'primary' ? 0 : 1;
      const rightPriority = getFieldStatusRole(right) === 'primary' ? 0 : 1;
      return leftPriority - rightPriority;
    });
}
function getEntityPrimaryStatusField(entity) {
  return getEntityStatusFields(entity).find((field) => getFieldStatusRole(field) === 'primary') || null;
}
function getEntitySecondaryStatusFields(entity) {
  return getEntityStatusFields(entity).filter((field) => getFieldStatusRole(field) === 'secondary');
}
function getEntityStatusField(entity, preferredFieldName = '') {
  const statusFields = getEntityStatusFields(entity);
  if (!statusFields.length) return null;
  const preferred = String(preferredFieldName || '').trim();
  return statusFields.find((field) => field.name === preferred) || getEntityPrimaryStatusField(entity) || statusFields[0];
}
function getEntityStatusValues(entity, preferredFieldName = '') {
  return getFieldStateValues(getEntityStatusField(entity, preferredFieldName));
}
function getEntityStateTransitions(entity, preferredFieldName = '') {
  const fieldName = getEntityStatusField(entity, preferredFieldName)?.name || '';
  return (entity?.state_transitions || [])
    .map((transition, index) => ({ transition, index }))
    .filter(({ transition }) => {
      if (!fieldName) return false;
      return !transition.field_name || transition.field_name === fieldName;
    });
}
function ensureEntityStateShape(entity) {
  if (!entity) return entity;
  if (!Array.isArray(entity.fields)) entity.fields = [];
  if (!Array.isArray(entity.state_transitions)) entity.state_transitions = [];
  let primaryAssigned = false;
  entity.fields.forEach((field) => {
    const role = syncFieldStatusRole(field);
    syncFieldStateNodes(field);
    if (role === 'primary') {
      if (primaryAssigned) {
        syncFieldStatusRole(field, 'secondary');
      } else {
        primaryAssigned = true;
      }
    }
  });
  entity.state_transitions = entity.state_transitions.map((transition) => ({
    uid: String(transition?.uid || '').trim() || createUiUid('transition'),
    from: String(transition?.from || ''),
    to: String(transition?.to || ''),
    action: String(transition?.action || ''),
    note: String(transition?.note || ''),
    field_name: String(transition?.field_name || ''),
    ...(normalizeOptionalGraphOffset(transition?.labelPos) ? { labelPos: normalizeOptionalGraphOffset(transition.labelPos) } : {}),
    ...(transition?.route && typeof transition.route === 'object'
      ? {
        route: {
          mode: transition.route.mode === 'manual' ? 'manual' : 'auto',
          fromAnchor: ['auto', 'top', 'right', 'bottom', 'left'].includes(transition.route.fromAnchor) ? transition.route.fromAnchor : 'auto',
          toAnchor: ['auto', 'top', 'right', 'bottom', 'left'].includes(transition.route.toAnchor) ? transition.route.toAnchor : 'auto',
          waypoints: Array.isArray(transition.route.waypoints)
            ? transition.route.waypoints.map((point) => normalizeOptionalGraphOffset(point)).filter(Boolean)
            : [],
        },
      }
      : {}),
    ...(Array.isArray(transition?.waypoints)
      ? { waypoints: transition.waypoints.map((point) => normalizeOptionalGraphOffset(point)).filter(Boolean) }
      : {}),
  }));
  return entity;
}
function createStateTransitionDraft(entity, preferredFieldName = '') {
  const field = getEntityStatusField(entity, preferredFieldName);
  const stateNodes = getFieldStateNodes(field);
  const values = stateNodes.map((item) => item.name);
  const initialState = stateNodes.find((item) => item.kind === 'initial')?.name || values[0] || '';
  const nextState = stateNodes.find((item) => item.name !== initialState && item.kind !== 'initial')?.name
    || values.find((item) => item !== initialState)
    || initialState
    || '';
  return {
    uid: createUiUid('transition'),
    from: initialState,
    to: nextState,
    action: '',
    note: '',
    field_name: field?.name || '',
  };
}
function inferRoleGroup(role) {
  const name = normalizeRoleName(role?.name);
  if (/系统|自动化/.test(name)) return '系统角色';
  if (/仓库|现场|作业/.test(name)) return '仓库作业方';
  if (/平台管理员|超级账号|平台管理|账号管理|运维/.test(name)) return '平台与运维方';
  if (/示例部|机构|品种负责人|监管|审核/.test(name)) return '监管与审核方';
  if (!name) return '待分类角色';
  return '业务参与方';
}
function getRoleGroupName(role) {
  const explicitGroup = normalizeRoleName(role?.group);
  return explicitGroup || inferRoleGroup(role);
}
function getGroupedRoles() {
  const buckets = new Map();
  for (const groupName of ROLE_GROUPS) {
    buckets.set(groupName, []);
  }
  for (const role of getRoles()) {
    const groupName = getRoleGroupName(role);
    if (!buckets.has(groupName)) buckets.set(groupName, []);
    buckets.get(groupName).push(role);
  }
  return Array.from(buckets.entries())
    .filter(([, roles]) => roles.length)
    .map(([name, roles]) => ({ name, roles }));
}
function getRoles() {
  return Array.isArray(S.doc?.roles)
    ? S.doc.roles.filter((role) => role && typeof role === 'object' && !Array.isArray(role))
    : [];
}
function getRoleById(roleId) {
  const normalizedId = normalizeRoleName(roleId);
  return getRoles().find((role) => role.id === normalizedId) || null;
}
function getRoleByName(roleName) {
  const normalizedName = normalizeRoleName(roleName);
  return getRoles().find((role) => role.name === normalizedName) || null;
}
function getRoleName(roleOrId) {
  if (roleOrId && typeof roleOrId === 'object') {
    return normalizeRoleName(roleOrId.name);
  }
  return normalizeRoleName(getRoleById(roleOrId)?.name || roleOrId);
}
function getTaskRoleIds(task) {
  if (!task || typeof task !== 'object') return [];

  const resolvedIds = [];
  const seen = new Set();
  const pushRoleId = (roleId) => {
    const normalizedId = normalizeRoleName(roleId);
    if (!normalizedId || seen.has(normalizedId) || !getRoleById(normalizedId)) return;
    seen.add(normalizedId);
    resolvedIds.push(normalizedId);
  };

  if (Array.isArray(task.role_ids)) {
    task.role_ids.forEach(pushRoleId);
  } else if (task.role_ids !== undefined && task.role_ids !== null) {
    parseRoleTokens(task.role_ids).forEach(pushRoleId);
  }

  pushRoleId(task.role_id);
  if (resolvedIds.length) return resolvedIds;

  const roleTokens = [];
  if (Array.isArray(task.roles)) roleTokens.push(...task.roles);
  else if (task.roles !== undefined && task.roles !== null) roleTokens.push(...parseRoleTokens(task.roles));
  roleTokens.push(...parseRoleTokens(task.role));

  roleTokens
    .map((token) => getRoleById(token) || getRoleByName(token))
    .filter(Boolean)
    .forEach((role) => pushRoleId(role.id));

  return resolvedIds;
}
function getTaskRoleNames(task) {
  const roleIds = getTaskRoleIds(task);
  if (roleIds.length) return roleIds.map((roleId) => getRoleName(roleId)).filter(Boolean);

  const names = [];
  if (Array.isArray(task?.roles)) names.push(...task.roles);
  else if (task?.roles !== undefined && task?.roles !== null) names.push(...parseRoleTokens(task.roles));
  names.push(...parseRoleTokens(task?.role));
  return Array.from(new Set(names.map((name) => normalizeRoleName(name)).filter(Boolean)));
}
function getTaskRoleName(task) {
  return getTaskRoleNames(task).join('、');
}
function syncTaskRole(task) {
  if (!task) return;
  const roleIds = getTaskRoleIds(task);
  const roleNames = roleIds.length
    ? roleIds.map((roleId) => getRoleName(roleId)).filter(Boolean)
    : getTaskRoleNames(task);
  task.role_ids = roleIds;
  task.roles = roleNames;
  task.role_id = roleIds[0] || '';
  task.role = roleNames.join('、');
}
function nextRoleId() {
  return nextStableId('R', getRoles());
}
function createRoleDraft(name) {
  return {
    id: nextRoleId(),
    name: normalizeRoleName(name) || '新角色',
    desc: '',
    group: '业务参与方',
    subDomains: [],
  };
}
function getUniqueRoleName(baseName) {
  const base = normalizeRoleName(baseName) || '新角色';
  const usedNames = new Set(getRoles().map((role) => role.name));
  if (!usedNames.has(base)) return base;
  let index = 2;
  while (usedNames.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}
function ensureSelectedRole(preferredRoleId) {
  const roles = getRoles();
  if (!roles.length) {
    S.ui.roleId = null;
    return null;
  }
  const preferred = normalizeRoleName(preferredRoleId || S.ui.roleId);
  if (preferred && getRoleById(preferred)) {
    S.ui.roleId = preferred;
    return preferred;
  }
  S.ui.roleId = roles[0].id;
  return S.ui.roleId;
}
function parseRoleTokens(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}
const ROLE_GROUP_PRESETS = [
  '业务参与方',
  '仓库作业方',
  '监管与审核方',
  '平台与运维方',
  '系统角色',
  '待分类角色',
];

function inferRoleGroup(role) {
  const name = normalizeRoleName(role?.name);
  if (/系统|自动化/.test(name)) return '系统角色';
  if (/仓库|现场|作业/.test(name)) return '仓库作业方';
  if (/平台管理员|超级账号|平台管理|账号管理|运维/.test(name)) return '平台与运维方';
  if (/示例部|机构|品种负责人|监管|审核/.test(name)) return '监管与审核方';
  if (!name) return '待分类角色';
  return '业务参与方';
}

function getRoleGroupName(role) {
  const explicitGroup = normalizeRoleName(role?.group);
  return explicitGroup || inferRoleGroup(role);
}

function getAvailableRoleGroups() {
  const groups = [];
  const seen = new Set();
  function pushGroup(groupName) {
    const normalized = normalizeRoleName(groupName);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    groups.push(normalized);
  }

  ROLE_GROUP_PRESETS.forEach(pushGroup);
  getRoles().forEach((role) => pushGroup(getRoleGroupName(role)));
  return groups;
}

function getDefaultRoleGroup() {
  return getAvailableRoleGroups()[0] || '业务参与方';
}

function getGroupedRoles() {
  const buckets = new Map();
  for (const groupName of getAvailableRoleGroups()) {
    buckets.set(groupName, []);
  }
  for (const role of getRoles()) {
    const groupName = getRoleGroupName(role);
    if (!buckets.has(groupName)) buckets.set(groupName, []);
    buckets.get(groupName).push(role);
  }
  return Array.from(buckets.entries())
    .filter(([, roles]) => roles.length)
    .map(([name, roles]) => ({ name, roles }));
}

function createRoleDraft(name, options = {}) {
  return {
    id: nextRoleId(),
    name: normalizeRoleName(name) || '新角色',
    desc: '',
    group: normalizeRoleName(options.group) || getDefaultRoleGroup(),
    subDomains: [],
  };
}

function getUniqueRoleName(baseName) {
  const base = normalizeRoleName(baseName) || '新角色';
  const usedNames = new Set(getRoles().map((role) => role.name));
  if (!usedNames.has(base)) return base;
  let index = 2;
  while (usedNames.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}

function parseRoleTokens(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[，,、;；/\n]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function setTaskRoles(procId, taskId, roleIds) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  const task = getProcNodes(proc).find((item) => item.id === taskId);
  if (!task) return;
  const nextRoleIds = Array.from(new Set(
    (Array.isArray(roleIds) ? roleIds : [roleIds])
      .map((roleId) => normalizeRoleName(roleId))
      .filter((roleId) => roleId && getRoleById(roleId)),
  ));
  task.role_ids = nextRoleIds;
  task.roles = nextRoleIds.map((roleId) => getRoleName(roleId)).filter(Boolean);
  task.role_id = nextRoleIds[0] || '';
  task.role = task.roles.join('、');
  markModified();
}
function getRoleUsage(roleId) {
  const normalizedRoleId = normalizeRoleName(roleId);
  const usage = [];
  for (const proc of (S.doc?.processes || [])) {
    for (const task of getProcNodes(proc)) {
      if (!getTaskRoleIds(task).includes(normalizedRoleId)) continue;
      usage.push({ proc, task });
    }
  }
  return usage;
}
function getRoleUsageSummary(roleId) {
  const usage = getRoleUsage(roleId);
  const processIds = new Set(usage.map((item) => item.proc.id));
  const subDomains = new Set(usage.map((item) => normalizeRoleName(item.proc.subDomain)).filter(Boolean));
  return {
    taskCount: usage.length,
    processCount: processIds.size,
    subDomainCount: subDomains.size,
  };
}
function getRoleUsageByProcess(roleId) {
  const usageByProcess = new Map();
  for (const item of getRoleUsage(roleId)) {
    if (!usageByProcess.has(item.proc.id)) {
      usageByProcess.set(item.proc.id, { proc: item.proc, tasks: [] });
    }
    usageByProcess.get(item.proc.id).tasks.push(item.task);
  }
  return usageByProcess;
}

function getTasksReferencingEntity(entityId) {
  const result=[];
  for(const proc of (S.doc?.processes||[])) {
    for(const task of getProcNodes(proc)) {
      if((task.entity_ops||[]).some(eo=>eo.entity_id===entityId))
        result.push({proc,task});
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════
   MERMAID HELPERS
═══════════════════════════════════════════════════════════ */
/* 6色循环色板（pastel，不刺眼） */
const ROLE_COLORS = [
  { fill:'#dbeafe', stroke:'#3b82f6', color:'#1e3a8a' }, // 蓝
  { fill:'#dcfce7', stroke:'#22c55e', color:'#14532d' }, // 绿
  { fill:'#fef9c3', stroke:'#eab308', color:'#713f12' }, // 黄
  { fill:'#fce7f3', stroke:'#ec4899', color:'#831843' }, // 粉
  { fill:'#ede9fe', stroke:'#8b5cf6', color:'#3b0764' }, // 紫
  { fill:'#ffedd5', stroke:'#f97316', color:'#7c2d12' }, // 橙
];
