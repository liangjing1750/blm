export interface LegacyEntity {
  id?: string;
  uid?: string;
  name?: string;
  fields?: Array<{ name?: string; type?: string; required?: boolean; is_required?: boolean; not_null?: boolean; note?: string; description?: string }>;
}

export interface LegacyTaskDefinition {
  id?: string;
  uid?: string;
  name?: string;
  target?: string;
  address?: string;
  parameters?: unknown[];
}

export interface LegacyUserStep {
  id?: string;
  uid?: string;
  name?: string;
  note?: string;
  type?: string;
}

export interface LegacyFormField {
  id?: string;
  uid?: string;
  name?: string;
  type?: string;
  required?: boolean;
  note?: string;
  entity_field?: string;
}

export interface LegacyTaskFormSection {
  id?: string;
  uid?: string;
  name?: string;
  note?: string;
  serviceUid?: string;
  serviceId?: string;
  serviceUids?: string[];
  serviceIds?: string[];
  serviceName?: string;
  entity_id?: string;
  entityId?: string;
  fields?: LegacyFormField[];
}

export interface LegacyTaskForm {
  id?: string;
  uid?: string;
  name?: string;
  note?: string;
  purpose?: string;
  serviceUid?: string;
  serviceId?: string;
  serviceName?: string;
  entity_id?: string;
  entityId?: string;
  fields?: LegacyFormField[];
  sections?: LegacyTaskFormSection[];
}

export interface LegacyEntityOp {
  entity_id?: string;
  entity_uid?: string;
  entityId?: string;
  ops?: string[];
}

export interface LegacyBusinessRule {
  id?: string;
  uid?: string;
  name?: string;
  content?: string;
}

export interface LegacyFlowGateway {
  id?: string;
  uid?: string;
  kind?: string;
  gatewayType?: string;
  title?: string;
  role_id?: string;
  role_uid?: string;
}

export interface LegacyFlowEdge {
  id?: string;
  uid?: string;
  from?: string;
  to?: string;
  label?: string;
  condition?: string;
}

export interface LegacyProcessFlow {
  version?: number;
  orientation?: string;
  nodes?: LegacyFlowGateway[];
  edges?: LegacyFlowEdge[];
  layout?: unknown;
}

export interface LegacyProcessNode {
  id?: string;
  uid?: string;
  name?: string;
  role?: string;
  role_id?: string;
  role_uid?: string;
  roleIds?: string[];
  role_ids?: string[];
  role_uids?: string[];
  roles?: string[];
  description?: string;
  userSteps?: LegacyUserStep[];
  forms?: LegacyTaskForm[];
  entity_ops?: LegacyEntityOp[];
  orchestrationTasks?: LegacyTaskDefinition[];
  businessRules?: Array<LegacyBusinessRule | string>;
  prototypeFiles?: LegacyPrototypeFile[];
}

export interface LegacyRole {
  id?: string;
  uid?: string;
  name?: string;
  group?: string;
}

export interface LegacyStageRef {
  id?: string;
  stageUid?: string;
  stageId?: string;
  processUid?: string;
  processId?: string;
}

export interface LegacyStage {
  id?: string;
  uid?: string;
  name?: string;
}

export interface ProcessStageDisplay {
  id: string;
  name: string;
}

export interface LegacyProcess {
  id?: string;
  uid?: string;
  name?: string;
  trigger?: string;
  outcome?: string;
  nodes?: LegacyProcessNode[];
  tasks?: LegacyProcessNode[];
  flow?: LegacyProcessFlow;
  prototypeFiles?: LegacyPrototypeFile[];
}

export interface LegacyPrototypeVersion {
  uid?: string;
  name?: string;
  number?: number;
  uploadedAt?: string;
  contentType?: string;
  content?: string;
  contentEncoding?: string;
  localUrl?: string;
  size?: number;
}

export interface LegacyPrototypeFile {
  uid?: string;
  id?: string;
  name?: string;
  versionUid?: string;
  versions?: LegacyPrototypeVersion[];
  contentType?: string;
  content?: string;
  contentEncoding?: string;
  localUrl?: string;
  size?: number;
}

interface LegacyState {
  doc?: {
    processes?: LegacyProcess[];
    entities?: LegacyEntity[];
    taskDefinitions?: LegacyTaskDefinition[];
    roles?: LegacyRole[];
    stages?: LegacyStage[];
    stageFlowRefs?: LegacyStageRef[];
  };
  ui?: { tab?: string; procId?: string; stageId?: string; taskId?: string | null; procView?: string };
}

interface LegacyWindow {
  S?: LegacyState;
  markModified?: () => void;
  renderSidebar?: () => void;
  renderProcessTab?: () => void;
  renderProcFlow?: (containerId: string, process: LegacyProcess, clickMap?: Record<string, () => void>) => void;
  getDrawerWidth?: (kind: string) => number;
  setDrawerWidth?: (kind: string, width: number) => void;
  addProcessPrototypeFiles?: (processId: string, inputId: string) => void;
  toggleProcessPrototypeVersions?: (processId: string, prototypeUid: string) => void;
  isProcessPrototypeExpanded?: (processId: string, prototypeUid: string) => boolean;
  findProcessPrototypeVersion?: (prototypeFile: LegacyPrototypeFile, versionUid?: string) => LegacyPrototypeVersion | null;
  getProcessAttachmentKind?: (versionOrFile: LegacyPrototypeVersion | LegacyPrototypeFile) => string;
  canPreviewProcessAttachment?: (version: LegacyPrototypeVersion | LegacyPrototypeFile) => boolean;
  openProcessPrototypeFile?: (processId: string, prototypeUid: string, versionUid?: string) => void;
  downloadProcessPrototypeFile?: (processId: string, prototypeUid: string, versionUid?: string) => void;
  removeProcessPrototypeFile?: (processId: string, prototypeUid: string) => void;
  getRoles?: () => LegacyRole[];
  getTaskRoleIds?: (task: LegacyProcessNode) => string[];
  setTaskRoles?: (procId: string, taskId: string, roleIds: string[]) => void;
  getProcessStageRefs?: (processId: string, doc?: LegacyState['doc']) => LegacyStageRef[];
  getStageDisplayName?: (stageId: string, doc?: LegacyState['doc']) => string;
  openStageDetail?: (stageId: string) => void;
}

export interface ProcessEditorLegacyAdapter {
  currentProcess(): LegacyProcess | null;
  currentTask(): LegacyProcessNode | null;
  processes(): LegacyProcess[];
  processId(process: LegacyProcess | null | undefined): string;
  selectProcess(processId: string): void;
  openProcessFlow(processId: string): void;
  taskId(task: LegacyProcessNode | null | undefined): string;
  tasks(process: LegacyProcess | null | undefined): LegacyProcessNode[];
  entities(): LegacyEntity[];
  taskDefinitions(): LegacyTaskDefinition[];
  stages(): LegacyStage[];
  stageFlowRefs(): LegacyStageRef[];
  gateways(process: LegacyProcess | null | undefined): LegacyFlowGateway[];
  edges(process: LegacyProcess | null | undefined): LegacyFlowEdge[];
  flowNodeOptions(process: LegacyProcess | null | undefined, side: 'from' | 'to'): Array<{ id: string; label: string }>;
  drawerWidth(): number;
  setDrawerWidth(width: number): void;
  roles(): LegacyRole[];
  taskRoleIds(task: LegacyProcessNode): string[];
  setTaskRoleIds(task: LegacyProcessNode, roleIds: string[]): void;
  stageRefs(process: LegacyProcess | null | undefined): ProcessStageDisplay[];
  openStage(stageId: string): void;
  renderDiagram(containerId: string, process: LegacyProcess | null | undefined, onSelectTask: (taskId: string) => void): boolean;
  selectTask(taskId: string | null): void;
  closeEditor(): void;
  touch(): void;
  setProcessField(field: 'name' | 'trigger' | 'outcome', value: string): void;
  setTaskField(task: LegacyProcessNode, field: 'name' | 'role' | 'description', value: string): void;
  addTask(afterTaskId?: string): void;
  removeTask(taskId: string): void;
  moveTask(taskId: string, delta: number): void;
  addGateway(afterGatewayId?: string): void;
  setGateway(gateway: LegacyFlowGateway, field: 'title' | 'role_id', value: string): void;
  moveGateway(gatewayId: string, delta: number): void;
  removeGateway(gatewayId: string): void;
  addEdge(afterEdgeId?: string): void;
  setEdge(edge: LegacyFlowEdge, field: 'from' | 'to' | 'label', value: string): void;
  moveEdge(edgeId: string, delta: number): void;
  removeEdge(edgeId: string): void;
  addUserStep(task: LegacyProcessNode): void;
  setUserStep(task: LegacyProcessNode, index: number, value: string): void;
  moveUserStep(task: LegacyProcessNode, index: number, delta: number): void;
  removeUserStep(task: LegacyProcessNode, index: number): void;
  addForm(task: LegacyProcessNode): void;
  setFormName(task: LegacyProcessNode, form: LegacyTaskForm, value: string): void;
  removeForm(task: LegacyProcessNode, form: LegacyTaskForm): void;
  addFormField(form: LegacyTaskForm): void;
  setFormField(field: LegacyFormField, key: 'name' | 'type', value: string): void;
  setFormFieldRequired(field: LegacyFormField, value: boolean): void;
  removeFormField(form: LegacyTaskForm, field: LegacyFormField): void;
  addEntityOp(task: LegacyProcessNode, entityId: string): void;
  toggleEntityOp(task: LegacyProcessNode, entityId: string, op: string, checked: boolean): void;
  removeEntityOp(task: LegacyProcessNode, entityId: string): void;
  addTaskDefinition(task: LegacyProcessNode): void;
  setTaskDefinition(taskDefinition: LegacyTaskDefinition, key: 'name' | 'target' | 'address', value: string): void;
  removeTaskDefinition(task: LegacyProcessNode, taskDefinition: LegacyTaskDefinition): void;
  createBusinessRule(task: LegacyProcessNode): LegacyBusinessRule;
  addBusinessRule(task: LegacyProcessNode): void;
  setBusinessRule(task: LegacyProcessNode, index: number, value: string): void;
  removeBusinessRule(task: LegacyProcessNode, index: number): void;
  prototypeFiles(process: LegacyProcess | null | undefined): LegacyPrototypeFile[];
  currentPrototypeVersion(file: LegacyPrototypeFile): LegacyPrototypeVersion | null;
  prototypeKind(file: LegacyPrototypeFile): string;
  canPreviewPrototype(file: LegacyPrototypeFile, version?: LegacyPrototypeVersion | null): boolean;
  isPrototypeExpanded(processId: string, prototypeUid: string): boolean;
  togglePrototypeVersions(processId: string, prototypeUid: string): void;
  previewPrototype(ownerId: string, prototypeUid: string, versionUid?: string): void;
  openPrototype(processId: string, prototypeUid: string, versionUid?: string): void;
  downloadPrototype(processId: string, prototypeUid: string, versionUid?: string): void;
  removePrototype(processId: string, prototypeUid: string): void;
  uploadPrototypeFiles(processId: string, inputId: string): void;
  nodePrototypeFiles(task: LegacyProcessNode | null | undefined): LegacyPrototypeFile[];
  removeNodePrototype(task: LegacyProcessNode, prototypeUid: string): void;
  uploadNodePrototypeFiles(task: LegacyProcessNode, inputId: string): void;
}

export function createProcessEditorLegacyAdapter(legacyWindow: LegacyWindow = getAngularRuntimeState() as LegacyWindow): ProcessEditorLegacyAdapter {
  const state = () => {
    const direct = legacyWindow as LegacyWindow & { doc?: LegacyState['doc']; ui?: LegacyState['ui'] };
    if (direct.doc || direct.ui) return { doc: direct.doc, ui: direct.ui };
    return legacyWindow.S || {};
  };
  const document = () => state().doc || {};
  const ui = () => {
    state().ui ||= {};
    return state().ui as NonNullable<LegacyState['ui']>;
  };

  const nextId = (prefix: string, items: Array<{ id?: string; uid?: string }> = []) => {
    const used = new Set(items.map((item) => String(item.id || item.uid || '')));
    for (let index = items.length + 1; index < items.length + 200; index += 1) {
      const id = `${prefix}${index}`;
      if (!used.has(id)) return id;
    }
    return `${prefix}${Date.now()}`;
  };

  const dirty = () => {
    // 边界细节：旧前端依赖 markModified 和 sidebar 刷新维护本地草稿状态，Angular 迁移不能绕过这两个副作用。
    if (legacyWindow.markModified) legacyWindow.markModified();
    else markAngularRuntimeModified();
    if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
    else emitRuntimeRefresh();
  };

  const refreshUiOnly = () => {
    if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
    else emitRuntimeRefresh();
  };

  function processId(process: LegacyProcess | null | undefined): string {
    return String(process?.uid || process?.id || '').trim();
  }

  function taskId(task: LegacyProcessNode | null | undefined): string {
    return String(task?.uid || task?.id || '').trim();
  }

  function processes(): LegacyProcess[] {
    return document().processes || [];
  }

  function tasks(process: LegacyProcess | null | undefined): LegacyProcessNode[] {
    if (!process) return [];
    process.nodes ||= process.tasks || [];
    return process.nodes;
  }

  function normalizeFlow(process: LegacyProcess | null | undefined): LegacyProcessFlow {
    if (!process) return { version: 2, orientation: 'horizontal', nodes: [], edges: [] };
    const rawFlow = process.flow && typeof process.flow === 'object' ? process.flow : {};
    rawFlow.version = Number(rawFlow.version || 2) || 2;
    rawFlow.orientation = rawFlow.orientation === 'vertical' ? 'vertical' : 'horizontal';
    rawFlow.nodes = Array.isArray(rawFlow.nodes) ? rawFlow.nodes : [];
    rawFlow.edges = Array.isArray(rawFlow.edges) ? rawFlow.edges : [];
    rawFlow.nodes = rawFlow.nodes
      .filter((node) => node && typeof node === 'object')
      .map((node, index) => ({
        ...node,
        id: String(node.id || node.uid || `B${index + 1}`),
        kind: 'gateway',
        gatewayType: node.gatewayType || 'exclusive',
        title: String(node.title || ''),
        role_id: String(node.role_id || ''),
      }));
    rawFlow.edges = rawFlow.edges
      .filter((edge) => edge && typeof edge === 'object')
      .map((edge, index) => ({
        ...edge,
        id: String(edge.id || edge.uid || `L${index + 1}`),
        from: String(edge.from || ''),
        to: String(edge.to || ''),
        label: String(edge.label || edge.condition || ''),
        condition: String(edge.condition || ''),
      }));
    process.flow = rawFlow;
    return rawFlow;
  }

  function gateways(process: LegacyProcess | null | undefined): LegacyFlowGateway[] {
    return normalizeFlow(process).nodes || [];
  }

  function edges(process: LegacyProcess | null | undefined): LegacyFlowEdge[] {
    return normalizeFlow(process).edges || [];
  }

  function currentProcess(): LegacyProcess | null {
    const currentId = String(ui().procId || '').trim();
    return processes().find((process) =>
      processId(process) === currentId || process.uid === currentId || process.id === currentId
    ) || processes()[0] || null;
  }

  function currentTask(): LegacyProcessNode | null {
    const process = currentProcess();
    const currentTaskId = String(ui().taskId || '').trim();
    if (!process || !currentTaskId) return null;
    return tasks(process).find((task) => taskId(task) === currentTaskId) || null;
  }

  function normalizeStageId(stageId: string): string {
    const target = String(stageId || '').trim();
    if (!target) return '';
    const stage = (document().stages || []).find((item) => String(item.uid || '').trim() === target || String(item.id || '').trim() === target);
    return stage ? String(stage.id || stage.uid || '').trim() : target;
  }

  function stageIdForProcess(targetProcessId: string): string {
    const process = processes().find((item) => processId(item) === targetProcessId || item.id === targetProcessId || item.uid === targetProcessId);
    const processKeys = new Set([targetProcessId, process?.id, process?.uid].filter(Boolean).map(String));
    const currentStageId = normalizeStageId(String(ui().stageId || '').trim());
    const refs = document().stageFlowRefs || [];
    const currentRef = refs.find((ref) => (
      normalizeStageId(String(ref.stageUid || ref.stageId || '').trim()) === currentStageId
      && (processKeys.has(String(ref.processUid || '').trim()) || processKeys.has(String(ref.processId || '').trim()))
    ));
    if (currentRef) return normalizeStageId(String(currentRef.stageUid || currentRef.stageId || currentStageId).trim());
    const ref = refs
      .filter((item) => processKeys.has(String(item.processUid || '').trim()) || processKeys.has(String(item.processId || '').trim()))
      .sort((left, right) => Number((left as any).order || 0) - Number((right as any).order || 0))[0];
    return normalizeStageId(String(ref?.stageUid || ref?.stageId || (process as any)?.stageUid || (process as any)?.stageId || '').trim());
  }

  // 模块意图：附件预览/下载既要兼容旧版全局函数，也要在 Angular 运行态独立工作。
  // 关键流程：先按流程或节点定位附件归属，再选择指定版本或当前版本，最后打开持久化 URL 或内联 Blob。
  // 边界细节：ownerId 可能是流程 id，也可能是节点 id；附件管理聚合视图依赖这个能力预览节点附件。
  function findPrototypeOwner(ownerId: string): { process: LegacyProcess | null; task: LegacyProcessNode | null; files: LegacyPrototypeFile[] } | null {
    const target = String(ownerId || '').trim();
    if (!target) return null;
    for (const process of processes()) {
      if (processId(process) === target) {
        return { process, task: null, files: Array.isArray(process.prototypeFiles) ? process.prototypeFiles : [] };
      }
      for (const task of tasks(process)) {
        if (taskId(task) === target) {
          return { process, task, files: Array.isArray(task.prototypeFiles) ? task.prototypeFiles : [] };
        }
      }
    }
    return null;
  }

  function findPrototypeFile(ownerId: string, prototypeUid: string): LegacyPrototypeFile | null {
    const target = String(prototypeUid || '').trim();
    const owner = findPrototypeOwner(ownerId);
    if (!owner || !target) return null;
    return owner.files.find((file) => String(file.uid || file.id || file.name || '').trim() === target) || null;
  }

  function findPrototypeFileAnywhere(prototypeUid: string): LegacyPrototypeFile | null {
    const target = String(prototypeUid || '').trim();
    if (!target) return null;
    for (const process of processes()) {
      const processFile = (Array.isArray(process.prototypeFiles) ? process.prototypeFiles : [])
        .find((file) => String(file.uid || file.id || file.name || '').trim() === target);
      if (processFile) return processFile;
      for (const task of tasks(process)) {
        const taskFile = (Array.isArray(task.prototypeFiles) ? task.prototypeFiles : [])
          .find((file) => String(file.uid || file.id || file.name || '').trim() === target);
        if (taskFile) return taskFile;
      }
    }
    return null;
  }

  function getAttachmentExtension(name = ''): string {
    const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function canPreviewAttachment(versionOrFile: LegacyPrototypeVersion | LegacyPrototypeFile | null | undefined): boolean {
    const ext = getAttachmentExtension(versionOrFile?.name || '');
    return ['html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'md', 'txt', 'json', 'csv'].includes(ext);
  }

  function decodeAttachmentContent(version: LegacyPrototypeVersion | LegacyPrototypeFile): BlobPart {
    if (String(version.contentEncoding || '').toLowerCase() !== 'base64') return version.content || '';
    const binary = atob(String(version.content || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  function attachmentObjectUrl(version: LegacyPrototypeVersion | LegacyPrototypeFile): string {
    if ('localUrl' in version && version.localUrl) return version.localUrl;
    const contentType = String(version.contentType || 'text/html').trim() || 'text/html';
    const BlobCtor = (legacyWindow as any).Blob || Blob;
    const URLApi = (legacyWindow as any).URL || URL;
    const blob = new BlobCtor([decodeAttachmentContent(version)], {
      type: /charset=/i.test(contentType) ? contentType : `${contentType};charset=utf-8`,
    });
    return URLApi.createObjectURL(blob);
  }

  function hasInlineAttachmentContent(version: LegacyPrototypeVersion | LegacyPrototypeFile | null | undefined): boolean {
    return Boolean(version && 'localUrl' in version && version.localUrl)
      || (Object.prototype.hasOwnProperty.call(version || {}, 'content') && String(version?.content || '') !== '');
  }

  // 边界细节：旧文档持久化附件没有内联内容，只能复用旧 API 生成可访问地址。
  function persistedAttachmentUrl(file: LegacyPrototypeFile, version: LegacyPrototypeVersion | null, options: Record<string, unknown> = {}): string {
    const documentMeta = (document() as any).meta || {};
    const documentName = String((state() as any).currentFile || documentMeta.domain || documentMeta.title || '').trim();
    const attachmentUid = String(file.uid || '').trim();
    const versionUid = String(version?.uid || file.versionUid || '').trim();
    if (documentName && attachmentUid && versionUid) {
      const base = `/api/attachment/${encodeURIComponent(documentName)}/${encodeURIComponent(attachmentUid)}/${encodeURIComponent(versionUid)}`;
      return options['download'] ? `${base}?download=1` : base;
    }
    const api = (legacyWindow as any).api || (globalThis as any).api;
    if (!documentName || !attachmentUid || !versionUid || typeof api?.attachmentUrl !== 'function') return '';
    return api.attachmentUrl(documentName, attachmentUid, versionUid, options);
  }

  function openAttachmentInNewTab(file: LegacyPrototypeFile, version: LegacyPrototypeVersion | null): void {
    const target = version || file;
    if (!canPreviewAttachment(target)) return;
    if (!hasInlineAttachmentContent(target)) {
      const persisted = persistedAttachmentUrl(file, version);
      if (persisted) {
        const popup = ((legacyWindow as any).open || window.open).call(window, persisted, '_blank', 'noopener');
        if (!popup) window.alert?.('浏览器拦截了附件预览窗口，请允许弹窗后重试。');
        return;
      }
    }
    const URLApi = (legacyWindow as any).URL || URL;
    const objectUrl = attachmentObjectUrl(target);
    const popup = ((legacyWindow as any).open || window.open).call(window, objectUrl, '_blank', 'noopener');
    if (!popup) {
      URLApi.revokeObjectURL(objectUrl);
      window.alert?.('浏览器拦截了附件预览窗口，请允许弹窗后重试。');
      return;
    }
    setTimeout(() => URLApi.revokeObjectURL(objectUrl), 60000);
  }

  function downloadAttachment(file: LegacyPrototypeFile, version: LegacyPrototypeVersion | null): void {
    const target = version || file;
    if (!hasInlineAttachmentContent(target)) {
      const persisted = persistedAttachmentUrl(file, version, { download: true });
      if (persisted) {
        const link = globalThis.document.createElement('a');
        link.href = persisted;
        link.download = String(target.name || file.name || 'attachment').trim();
        link.rel = 'noopener';
        link.style.display = 'none';
        globalThis.document.body.appendChild(link);
        link.click();
        globalThis.document.body.removeChild(link);
        return;
      }
    }
    const objectUrl = attachmentObjectUrl(target);
    const link = globalThis.document.createElement('a');
    link.href = objectUrl;
    link.download = String(target.name || file.name || 'attachment').trim();
    link.rel = 'noopener';
    link.style.display = 'none';
    globalThis.document.body.appendChild(link);
    link.click();
    globalThis.document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  return {
    currentProcess,
    currentTask,
    processes,
    processId,
    selectProcess(targetProcessId) {
      ui().procId = targetProcessId;
      ui().taskId = null;
      const nextStageId = stageIdForProcess(targetProcessId);
      if (nextStageId) ui().stageId = nextStageId;
      if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
      else emitRuntimeRefresh();
    },
    openProcessFlow(targetProcessId) {
      ui().tab = 'process';
      ui().procId = targetProcessId;
      ui().taskId = null;
      ui().procView = 'flow';
      const nextStageId = stageIdForProcess(targetProcessId);
      if (nextStageId) ui().stageId = nextStageId;
      if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
      else emitRuntimeRefresh();
    },
    taskId,
    tasks,
    entities: () => document().entities || [],
    taskDefinitions: () => document().taskDefinitions || [],
    stages: () => document().stages || [],
    stageFlowRefs: () => document().stageFlowRefs || [],
    gateways,
    edges,
    drawerWidth() {
      return legacyWindow.getDrawerWidth?.('process') || 480;
    },
    setDrawerWidth(width: number) {
      legacyWindow.setDrawerWidth?.('process', width);
    },
    roles() {
      const roles = typeof legacyWindow.getRoles === 'function' ? legacyWindow.getRoles() : document().roles || [];
      return roles.filter((role) => String(role.id || role.uid || '').trim());
    },
    taskRoleIds(task) {
      if (typeof legacyWindow.getTaskRoleIds === 'function') return legacyWindow.getTaskRoleIds(task);
      const roleList = this.roles();
      const roleById = new Map<string, LegacyRole>(roleList.map((role) => [String(role.id || role.uid || '').trim(), role]));
      const roleByName = new Map<string, LegacyRole>(
        roleList
          .map((role): [string, LegacyRole] => [String(role.name || '').trim(), role])
          .filter(([name]) => Boolean(name)),
      );
      const resolveRoleId = (value: unknown): string => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const role = roleById.get(raw) || roleByName.get(raw);
        return role ? String(role.id || role.uid || '').trim() : '';
      };
      const rawIds = Array.isArray(task.roleIds) && task.roleIds.length
        ? task.roleIds
        : Array.isArray(task.role_uids) && task.role_uids.length
        ? task.role_uids
        : Array.isArray(task.role_ids) && task.role_ids.length
        ? task.role_ids
        : Array.isArray(task.roles) && task.roles.length
        ? task.roles
        : task.role_id
        ? [task.role_id]
        : task.role
        ? [task.role]
        : [];
      return rawIds
        .flatMap((item) => String(item || '').split(/[、,，/]/))
        .map((item) => resolveRoleId(item))
        .filter(Boolean);
    },
    setTaskRoleIds(task, roleIds) {
      const process = currentProcess();
      const ids = roleIds.map((item) => String(item || '').trim()).filter(Boolean);
      const roleList = this.roles();
      const roleById = new Map(roleList.map((role) => [String(role.id || role.uid || '').trim(), role]));
      const roleNames = ids.map((id) => String(roleById.get(id)?.name || '').trim()).filter(Boolean);
      if (process && typeof legacyWindow.setTaskRoles === 'function') {
        legacyWindow.setTaskRoles(processId(process), taskId(task), ids);
      } else {
        task.roleIds = ids;
        task.role_ids = ids;
        task.role_uids = ids;
        task.role_uid = ids[0] || '';
        task.role_id = ids[0] || '';
        task.roles = roleNames;
        task.role = roleNames.join('、');
      }
      if (!ids.length) {
        task.roleIds = [];
        task.role_ids = [];
        task.role_uids = [];
        task.role_uid = '';
        task.roles = [];
        task.role_id = '';
        task.role = '';
      }
      dirty();
    },
    stageRefs(process) {
      const id = processId(process);
      if (!id) return [];
      const refs = typeof legacyWindow.getProcessStageRefs === 'function'
        ? legacyWindow.getProcessStageRefs(id, document())
        : (document().stageFlowRefs || []).filter((ref) => {
          const processKeys = new Set([id, process?.id, process?.uid].filter(Boolean).map(String));
          return processKeys.has(String(ref.processUid || '').trim()) || processKeys.has(String(ref.processId || '').trim());
        });
      return refs
        .map((ref) => normalizeStageId(String(ref.stageUid || ref.stageId || '').trim()))
        .filter(Boolean)
        .map((stageId) => ({
          id: stageId,
          name: legacyWindow.getStageDisplayName?.(stageId, document()) || (document().stages || []).find((stage) => String(stage.uid || stage.id || '').trim() === stageId || normalizeStageId(String(stage.uid || stage.id || '')) === stageId)?.name || stageId,
        }));
    },
    openStage(stageId) {
      if (legacyWindow.openStageDetail) legacyWindow.openStageDetail(stageId);
      else navigateAngularWorkbench('process', { stageId });
    },
    prototypeFiles(process) {
      return (Array.isArray(process?.prototypeFiles) ? process.prototypeFiles : []) as LegacyPrototypeFile[];
    },
    currentPrototypeVersion(file) {
      if (typeof legacyWindow.findProcessPrototypeVersion === 'function') return legacyWindow.findProcessPrototypeVersion(file);
      const versions = Array.isArray(file.versions) ? file.versions : [];
      const versionUid = String(file.versionUid || '').trim();
      return versions.find((version) => String(version.uid || '') === versionUid) || versions[versions.length - 1] || null;
    },
    prototypeKind(file) {
      const version = this.currentPrototypeVersion(file);
      return legacyWindow.getProcessAttachmentKind?.(version || file) || '附件';
    },
    canPreviewPrototype(file, version = null) {
      return Boolean(legacyWindow.canPreviewProcessAttachment?.(version || this.currentPrototypeVersion(file) || file))
        || canPreviewAttachment(version || this.currentPrototypeVersion(file) || file);
    },
    isPrototypeExpanded(processId, prototypeUid) {
      return Boolean(legacyWindow.isProcessPrototypeExpanded?.(processId, prototypeUid));
    },
    togglePrototypeVersions(processId, prototypeUid) {
      legacyWindow.toggleProcessPrototypeVersions?.(processId, prototypeUid);
    },
    previewPrototype(ownerId, prototypeUid, versionUid = '') {
      const file = findPrototypeFile(ownerId, prototypeUid) || findPrototypeFileAnywhere(prototypeUid);
      if (file) {
        openAttachmentInNewTab(file, this.currentPrototypeVersion({ ...file, versionUid: versionUid || file.versionUid }));
        return;
      }
      legacyWindow.openProcessPrototypeFile?.(ownerId, prototypeUid, versionUid);
    },
    openPrototype(processId, prototypeUid, versionUid = '') {
      const file = findPrototypeFile(processId, prototypeUid) || findPrototypeFileAnywhere(prototypeUid);
      if (file) {
        openAttachmentInNewTab(file, this.currentPrototypeVersion({ ...file, versionUid: versionUid || file.versionUid }));
        return;
      }
      legacyWindow.openProcessPrototypeFile?.(processId, prototypeUid, versionUid);
    },
    downloadPrototype(processId, prototypeUid, versionUid = '') {
      const file = findPrototypeFile(processId, prototypeUid) || findPrototypeFileAnywhere(prototypeUid);
      if (file) {
        downloadAttachment(file, this.currentPrototypeVersion({ ...file, versionUid: versionUid || file.versionUid }));
        return;
      }
      legacyWindow.downloadProcessPrototypeFile?.(processId, prototypeUid, versionUid);
    },
    removePrototype(processId, prototypeUid) {
      legacyWindow.removeProcessPrototypeFile?.(processId, prototypeUid);
    },
    uploadPrototypeFiles(processId, inputId) {
      legacyWindow.addProcessPrototypeFiles?.(processId, inputId);
      dirty();
    },
    nodePrototypeFiles(task) {
      return (Array.isArray(task?.prototypeFiles) ? task.prototypeFiles : []) as LegacyPrototypeFile[];
    },
    removeNodePrototype(task, prototypeUid) {
      const targetUid = String(prototypeUid || '').trim();
      task.prototypeFiles = (Array.isArray(task.prototypeFiles) ? task.prototypeFiles : []).filter((file) => String(file.uid || file.id || '') !== targetUid);
      dirty();
    },
    uploadNodePrototypeFiles(task, inputId) {
      const input = globalThis.document.getElementById(inputId) as HTMLInputElement | null;
      const files = Array.from(input?.files || []);
      if (!files.length) return;
      task.prototypeFiles ||= [];
      let remaining = files.length;
      const finishOne = () => {
        remaining -= 1;
        if (remaining <= 0) {
          if (input) input.value = '';
          dirty();
        }
      };
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = () => {
          const raw = String(reader.result || '');
          const [, base64Content = ''] = raw.split(',', 2);
          const now = new Date().toLocaleString();
          const uid = `node-proto-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const versionUid = `${uid}-v1`;
          task.prototypeFiles?.push({
            uid,
            id: uid,
            name: file.name,
            versionUid,
            contentType: file.type || 'application/octet-stream',
            versions: [{
              uid: versionUid,
              number: 1,
              name: file.name,
              contentType: file.type || 'application/octet-stream',
              uploadedAt: now,
              contentEncoding: 'base64',
              content: base64Content,
              size: file.size,
            }],
            ...(base64Content ? {
              contentType: file.type || 'application/octet-stream',
              contentEncoding: 'base64',
              content: base64Content,
              size: file.size,
            } as Partial<LegacyPrototypeFile> : {}),
          } as LegacyPrototypeFile);
          finishOne();
        };
        reader.onerror = finishOne;
        reader.readAsDataURL(file);
      }
    },
    flowNodeOptions(process, side) {
      const options = tasks(process).map((task, index) => ({ id: taskId(task), label: task.name || `节点${index + 1}` }));
      const gatewayOptions = gateways(process).map((gateway, index) => ({ id: String(gateway.id || ''), label: gateway.title || `分支${index + 1}` }));
      return [
        ...(side === 'from' ? [{ id: 'START', label: '开始' }] : []),
        ...options,
        ...gatewayOptions,
        ...(side === 'to' ? [{ id: 'END', label: '结束' }] : []),
      ];
    },
    renderDiagram(containerId, process, onSelectTask) {
      // 模块意图：迁移期以旧版 renderProcFlow 作为视觉 Oracle，先保持流程图、拖拽、缩放和滚动行为等价。
      // 关键流程：Angular 编辑器维护右侧表单和数据动作；左侧图形由 adapter 统一调用旧视觉算法，并把节点点击回传给 Angular。
      // 边界细节：这是后续纯 TS 复刻流程图算法的唯一遗留边界，组件层不得直接访问 window.renderProcFlow。
      if (!process || typeof legacyWindow.renderProcFlow !== 'function') return false;
      const clickMap: Record<string, () => void> = {};
      for (const task of tasks(process)) {
        const id = taskId(task);
        if (id) clickMap[id] = () => onSelectTask(id);
      }
      legacyWindow.renderProcFlow(containerId, process, clickMap);
      return true;
    },
    selectTask(targetTaskId) {
      ui().taskId = targetTaskId;
      refreshUiOnly();
    },
    closeEditor() {
      ui().procView = 'flow';
      ui().taskId = null;
      if (legacyWindow.renderProcessTab) legacyWindow.renderProcessTab();
      else emitRuntimeRefresh();
    },
    touch() {
      if (legacyWindow.markModified) legacyWindow.markModified();
      else markAngularRuntimeModified();
    },
    setProcessField(field, value) {
      const process = currentProcess();
      if (!process) return;
      process[field] = value;
      dirty();
    },
    setTaskField(task, field, value) {
      task[field] = value;
      dirty();
    },
    addTask(afterTaskId) {
      const process = currentProcess();
      if (!process) return;
      const list = tasks(process);
      const id = nextId('T', list);
      const node: LegacyProcessNode = { id, uid: id, name: `新节点${list.length + 1}`, userSteps: [], forms: [], entity_ops: [], orchestrationTasks: [], businessRules: [] };
      const index = list.findIndex((item) => taskId(item) === afterTaskId);
      if (index >= 0) list.splice(index + 1, 0, node);
      else list.push(node);
      ui().taskId = id;
      dirty();
    },
    removeTask(targetTaskId) {
      const process = currentProcess();
      if (!process) return;
      process.nodes = tasks(process).filter((task) => taskId(task) !== targetTaskId);
      if (ui().taskId === targetTaskId) ui().taskId = null;
      dirty();
    },
    moveTask(targetTaskId, delta) {
      const process = currentProcess();
      if (!process) return;
      const list = tasks(process);
      const index = list.findIndex((task) => taskId(task) === targetTaskId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
      dirty();
    },
    addGateway(afterGatewayId) {
      const process = currentProcess();
      if (!process) return;
      const list = gateways(process);
      const id = nextId('B', list);
      const gateway: LegacyFlowGateway = { id, uid: id, kind: 'gateway', gatewayType: 'exclusive', title: '', role_id: '' };
      const index = list.findIndex((item) => String(item.id || item.uid) === afterGatewayId);
      if (index >= 0) list.splice(index + 1, 0, gateway);
      else list.push(gateway);
      dirty();
    },
    setGateway(gateway, field, value) {
      gateway[field] = value;
      dirty();
    },
    moveGateway(gatewayId, delta) {
      const process = currentProcess();
      if (!process) return;
      const list = gateways(process);
      const index = list.findIndex((gateway) => String(gateway.id || gateway.uid) === gatewayId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
      dirty();
    },
    removeGateway(gatewayId) {
      const process = currentProcess();
      if (!process) return;
      const flow = normalizeFlow(process);
      flow.nodes = (flow.nodes || []).filter((gateway) => String(gateway.id || gateway.uid) !== gatewayId);
      flow.edges = (flow.edges || []).filter((edge) => edge.from !== gatewayId && edge.to !== gatewayId);
      dirty();
    },
    addEdge(afterEdgeId) {
      const process = currentProcess();
      if (!process) return;
      const list = edges(process);
      const id = nextId('L', list);
      const edge: LegacyFlowEdge = { id, uid: id, from: '', to: '', label: '', condition: '' };
      const index = list.findIndex((item) => String(item.id || item.uid) === afterEdgeId);
      if (index >= 0) list.splice(index + 1, 0, edge);
      else list.push(edge);
      dirty();
    },
    setEdge(edge, field, value) {
      const nextValue = String(value || '').trim();
      if (field === 'from' && nextValue === 'END') return;
      if (field === 'to' && nextValue === 'START') return;
      edge[field] = nextValue;
      if (field === 'label') edge.condition = nextValue;
      dirty();
    },
    moveEdge(edgeId, delta) {
      const process = currentProcess();
      if (!process) return;
      const list = edges(process);
      const index = list.findIndex((edge) => String(edge.id || edge.uid) === edgeId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
      dirty();
    },
    removeEdge(edgeId) {
      const process = currentProcess();
      if (!process) return;
      const flow = normalizeFlow(process);
      flow.edges = (flow.edges || []).filter((edge) => String(edge.id || edge.uid) !== edgeId);
      dirty();
    },
    addUserStep(task) {
      task.userSteps ||= [];
      const id = nextId('US', task.userSteps);
      task.userSteps.push({ id, uid: id, name: '', note: '', type: '' });
      dirty();
    },
    setUserStep(task, index, value) {
      task.userSteps ||= [];
      task.userSteps[index] ||= {};
      task.userSteps[index].name = value;
      dirty();
    },
    moveUserStep(task, index, delta) {
      task.userSteps ||= [];
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= task.userSteps.length) return;
      [task.userSteps[index], task.userSteps[nextIndex]] = [task.userSteps[nextIndex], task.userSteps[index]];
      dirty();
    },
    removeUserStep(task, index) {
      task.userSteps ||= [];
      task.userSteps.splice(index, 1);
      dirty();
    },
    addForm(task) {
      task.forms ||= [];
      const id = nextId('F', task.forms);
      task.forms.push({ id, uid: id, name: `表单${task.forms.length + 1}`, fields: [] });
      dirty();
    },
    setFormName(_task, form, value) {
      form.name = value;
      dirty();
    },
    removeForm(task, form) {
      task.forms = (task.forms || []).filter((item) => item !== form);
      dirty();
    },
    addFormField(form) {
      form.fields ||= [];
      const id = nextId('FF', form.fields);
      form.fields.push({ id, uid: id, name: '', type: 'text', required: false });
      dirty();
    },
    setFormField(field, key, value) {
      field[key] = value;
      dirty();
    },
    setFormFieldRequired(field, value) {
      field.required = value;
      dirty();
    },
    removeFormField(form, field) {
      form.fields = (form.fields || []).filter((item) => item !== field);
      dirty();
    },
    addEntityOp(task, entityId) {
      if (!entityId) return;
      task.entity_ops ||= [];
      if (!task.entity_ops.some((item) => String(item.entity_uid || item.entity_id || item.entityId) === entityId)) {
        task.entity_ops.push({ entity_uid: entityId, ops: ['R'] });
      }
      dirty();
    },
    toggleEntityOp(task, entityId, op, checked) {
      task.entity_ops ||= [];
      const item = task.entity_ops.find((entry) => String(entry.entity_uid || entry.entity_id || entry.entityId) === entityId);
      if (!item) return;
      item.ops ||= [];
      if (checked && !item.ops.includes(op)) item.ops.push(op);
      if (!checked) item.ops = item.ops.filter((value) => value !== op);
      dirty();
    },
    removeEntityOp(task, entityId) {
      task.entity_ops = (task.entity_ops || []).filter((item) => String(item.entity_uid || item.entity_id || item.entityId) !== entityId);
      dirty();
    },
    addTaskDefinition(task) {
      task.orchestrationTasks ||= [];
      const id = nextId('TD', task.orchestrationTasks);
      task.orchestrationTasks.push({ id, uid: id, name: `任务${task.orchestrationTasks.length + 1}`, target: '', address: '' });
      dirty();
    },
    setTaskDefinition(taskDefinition, key, value) {
      taskDefinition[key] = value;
      dirty();
    },
    removeTaskDefinition(task, taskDefinition) {
      task.orchestrationTasks = (task.orchestrationTasks || []).filter((item) => item !== taskDefinition);
      dirty();
    },
    createBusinessRule(task) {
      task.businessRules ||= [];
      const id = nextId('BR', task.businessRules.filter((item): item is LegacyBusinessRule => Boolean(item) && typeof item !== 'string'));
      return { id, uid: id, name: `规则${task.businessRules.length + 1}`, content: '' };
    },
    addBusinessRule(task) {
      task.businessRules ||= [];
      task.businessRules.push(this.createBusinessRule(task));
      dirty();
    },
    setBusinessRule(task, index, value) {
      task.businessRules ||= [];
      const current = task.businessRules[index];
      if (!current || typeof current === 'string') {
        task.businessRules[index] = { id: `BR${index + 1}`, uid: `BR${index + 1}`, name: value, content: value };
      } else {
        current.content = value;
      }
      dirty();
    },
    removeBusinessRule(task, index) {
      task.businessRules ||= [];
      task.businessRules.splice(index, 1);
      dirty();
    },
  };
}
import { emitRuntimeRefresh, getAngularRuntimeState, markAngularRuntimeModified, navigateAngularWorkbench } from '../../../core/runtime/angular-runtime';
