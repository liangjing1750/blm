import { normalizeDocument } from '../document/document-model';
import { SAMPLE_DOCUMENT } from '../document/sample-document';

export type MainWorkbenchId =
  | 'panoramaWorkbench'
  | 'processWorkbench'
  | 'constructWorkbench'
  | 'orchestrationWorkbench'
  | 'entity'
  | 'knowledge'
  | 'role'
  | 'preview'
  | 'manual'
  | 'feedback';

export interface AngularRuntimeState {
  doc: any;
  ui: Record<string, any>;
  currentFile: string;
  modified: boolean;
  readOnly: boolean;
  runtime: {
    supportsCollab: boolean;
  };
  collab: {
    seq: number;
    acceptedSeq: number;
    syncing: boolean;
    lastError: string;
    connected: boolean;
    users: Array<Record<string, unknown>>;
    pendingSnapshot: boolean;
    hasRemoteUpdate: boolean;
    serverDocumentHash: string;
    lastSyncedAt: string;
    lastActivity: { user: string; at: string } | null;
    draftBaseSeqOverride?: number;
    recoveryMode?: boolean;
    forceSnapshotSync?: boolean;
  };
  recovery: Record<string, any>;
}

interface AngularNavigationSnapshot {
  mainTab: string;
  procId?: string;
  taskId?: string | null;
  entityId?: string;
}

const ANGULAR_NAV_HISTORY_LIMIT = 30;

// 模块意图：提供 Angular 内部的工作壳状态源，替代旧全局运行时的隐式状态。
// 关键流程：DocumentStore、菜单壳层和过渡适配器共享这里的状态；状态变化统一派发轻量刷新事件。
// 边界细节：这里保留与旧文档模型相近的字段名，但不再加载旧脚本，也不把状态挂到旧全局对象。
const runtimeState: AngularRuntimeState = {
  doc: normalizeDocument(SAMPLE_DOCUMENT),
  ui: {
    mainTab: 'panoramaWorkbench',
    tab: 'panorama',
    processWorkbenchView: 'valueDomain',
    componentTab: 'businessComponents',
    sbCollapse: {},
    businessDomainFilter: 'all',
  },
  currentFile: '',
  modified: false,
  readOnly: false,
  runtime: {
    supportsCollab: true,
  },
  collab: {
    seq: 0,
    acceptedSeq: 0,
    syncing: false,
    lastError: '',
    connected: false,
    users: [],
    pendingSnapshot: false,
    hasRemoteUpdate: false,
    serverDocumentHash: '',
    lastSyncedAt: '',
    lastActivity: null,
  },
  recovery: {},
};

export function getAngularRuntimeState(): AngularRuntimeState {
  return runtimeState;
}

export function replaceRuntimeDocument(document: any, fileName = ''): void {
  runtimeState.doc = normalizeDocument(document || {});
  runtimeState.currentFile = fileName;
  runtimeState.modified = false;
  emitRuntimeRefresh();
}

export function markAngularRuntimeModified(): void {
  runtimeState.modified = true;
  if (runtimeState.currentFile && !runtimeState.readOnly) {
    runtimeState.collab.pendingSnapshot = true;
    window.dispatchEvent(new CustomEvent('blm-runtime-local-change'));
  }
  emitRuntimeRefresh();
}

export function switchAngularMainTab(tabId: string): void {
  const nextTab = normalizeMainWorkbenchId(tabId);
  if (runtimeState.ui['mainTab'] === nextTab) return;
  recordAngularNavigationSnapshot();
  runtimeState.ui['mainTab'] = nextTab;
  emitRuntimeRefresh();
}

export function normalizeMainWorkbenchId(tabId?: string): string {
  const aliases: Record<string, string> = {
    businessArch: 'panoramaWorkbench',
    bizDomain: 'processWorkbench',
    bizComponent: 'constructWorkbench',
    appArch: 'orchestrationWorkbench',
    domain: 'panoramaWorkbench',
    data: 'constructWorkbench',
    panorama: 'panoramaWorkbench',
    process: 'processWorkbench',
    component: 'constructWorkbench',
    application: 'applicationWorkbench',
    appService: 'applicationWorkbench',
    orchestration: 'orchestrationWorkbench',
    knowledge: 'knowledge',
    role: 'role',
    manual: 'manual',
    feedback: 'feedback',
  };
  const normalized = aliases[String(tabId || '')] || String(tabId || 'panoramaWorkbench');
  return ['panoramaWorkbench', 'processWorkbench', 'constructWorkbench', 'applicationWorkbench', 'orchestrationWorkbench', 'entity', 'knowledge', 'role', 'preview', 'manual', 'feedback'].includes(normalized)
    ? normalized
    : 'panoramaWorkbench';
}

export function navigateAngularWorkbench(tab: string, options: Record<string, unknown> = {}): void {
  const before = captureAngularNavigationSnapshot();
  if (tab === 'process') {
    runtimeState.ui['mainTab'] = 'processWorkbench';
    runtimeState.ui['processWorkbenchView'] = 'flow';
    if (options['procId']) runtimeState.ui['procId'] = String(options['procId']);
    if (options['taskId']) runtimeState.ui['taskId'] = String(options['taskId']);
  } else if (tab === 'data') {
    runtimeState.ui['mainTab'] = 'constructWorkbench';
    if (options['entityId']) runtimeState.ui['entityId'] = String(options['entityId']);
  }
  if (!areAngularNavigationSnapshotsEqual(before, captureAngularNavigationSnapshot())) {
    pushAngularNavigationSnapshot(before);
  }
  emitRuntimeRefresh();
}

export function emitRuntimeRefresh(): void {
  window.dispatchEvent(new CustomEvent('blm-angular-runtime-refresh'));
  window.dispatchEvent(new CustomEvent('blm-shell-tabbar-refresh'));
  window.dispatchEvent(new CustomEvent('blm-sidebar-directory-refresh'));
  window.dispatchEvent(new CustomEvent('blm-workbench-refresh'));
}

export interface RuntimeConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface RuntimeConfirmEventDetail {
  message: string;
  options: RuntimeConfirmOptions;
  resolve: (confirmed: boolean) => void;
  markHandled: () => void;
}

export function confirmRuntimeAction(message: string, options: RuntimeConfirmOptions = {}): Promise<boolean> {
  let handled = false;
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<RuntimeConfirmEventDetail>('blm-runtime-confirm', {
      detail: {
        message,
        options,
        resolve,
        markHandled: () => {
          handled = true;
        },
      },
    }));
    if (!handled) resolve(window.confirm(message));
  });
}

export function canGoBackAngularNavigation(): boolean {
  return angularNavigationHistory().length > 0;
}

export function getAngularBackNavigationTitle(): string {
  const previous = angularNavigationHistory()[angularNavigationHistory().length - 1];
  if (!previous) return '当前没有可返回的位置';
  const labels: Record<string, string> = {
    panoramaWorkbench: '返回到全景工作台',
    processWorkbench: previous.taskId ? '返回到流程节点' : '返回到流程工作台',
    constructWorkbench: previous.entityId ? '返回到实体' : '返回到构件工作台',
    applicationWorkbench: '返回到应用工作台',
    orchestrationWorkbench: '返回到编排工作台',
    preview: '返回到预览',
  };
  return labels[previous.mainTab] || '返回到上一位置';
}

export function goBackAngularNavigation(): string | null {
  const history = angularNavigationHistory();
  let previous = history.pop();
  const current = captureAngularNavigationSnapshot();
  while (previous && areAngularNavigationSnapshotsEqual(previous, current)) {
    previous = history.pop();
  }
  if (!previous) return null;
  runtimeState.ui['mainTab'] = normalizeMainWorkbenchId(previous.mainTab);
  runtimeState.ui['procId'] = previous.procId || '';
  runtimeState.ui['taskId'] = previous.taskId || null;
  runtimeState.ui['entityId'] = previous.entityId || '';
  emitRuntimeRefresh();
  return runtimeState.ui['mainTab'];
}

function recordAngularNavigationSnapshot(): void {
  pushAngularNavigationSnapshot(captureAngularNavigationSnapshot());
}

function captureAngularNavigationSnapshot(): AngularNavigationSnapshot {
  return {
    mainTab: normalizeMainWorkbenchId(runtimeState.ui['mainTab']),
    procId: String(runtimeState.ui['procId'] || '').trim(),
    taskId: runtimeState.ui['taskId'] ? String(runtimeState.ui['taskId']).trim() : null,
    entityId: String(runtimeState.ui['entityId'] || '').trim(),
  };
}

function pushAngularNavigationSnapshot(snapshot: AngularNavigationSnapshot): void {
  const history = angularNavigationHistory();
  const last = history[history.length - 1];
  if (last && areAngularNavigationSnapshotsEqual(last, snapshot)) return;
  history.push({ ...snapshot });
  if (history.length > ANGULAR_NAV_HISTORY_LIMIT) {
    history.splice(0, history.length - ANGULAR_NAV_HISTORY_LIMIT);
  }
}

function angularNavigationHistory(): AngularNavigationSnapshot[] {
  const ui = runtimeState.ui as Record<string, any>;
  if (!Array.isArray(ui['navHistory'])) ui['navHistory'] = [];
  return ui['navHistory'] as AngularNavigationSnapshot[];
}

function areAngularNavigationSnapshotsEqual(left: AngularNavigationSnapshot, right: AngularNavigationSnapshot): boolean {
  return String(left.mainTab || '') === String(right.mainTab || '')
    && String(left.procId || '') === String(right.procId || '')
    && String(left.taskId || '') === String(right.taskId || '')
    && String(left.entityId || '') === String(right.entityId || '');
}
