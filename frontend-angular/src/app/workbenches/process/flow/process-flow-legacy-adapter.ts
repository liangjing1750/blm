import { emitRuntimeRefresh, getAngularRuntimeState, markAngularRuntimeModified } from '../../../core/runtime/angular-runtime';

export interface LegacyProcessTask {
  id?: string;
  uid?: string;
  name?: string;
  role?: string;
  description?: string;
  forms?: unknown[];
  businessRules?: unknown[];
}

export interface LegacyProcess {
  id?: string;
  uid?: string;
  name?: string;
  subDomain?: string;
  flowGroup?: string;
  trigger?: string;
  outcome?: string;
  nodes?: LegacyProcessTask[];
  tasks?: LegacyProcessTask[];
}

interface LegacyState {
  doc?: { processes?: LegacyProcess[] };
  ui?: {
    procId?: string;
    procView?: string;
    taskId?: string | null;
    procDiagramMode?: 'linear' | 'swimlane';
    procDiagramShowEntities?: boolean;
    procDiagramShowTasks?: boolean;
  };
}

interface LegacyWindow {
  S?: LegacyState;
  markModified?: () => void;
  renderSidebar?: () => void;
  renderProcessTab?: () => void;
  renderProcFlow?: (containerId: string, process: LegacyProcess, clickMap?: Record<string, () => void>) => void;
  openProcessEditor?: (processId: string, taskId?: string | null) => void;
  zoomBy?: (containerId: string, delta: number) => void;
  resetZoom?: (containerId: string) => void;
}

export interface ProcessFlowLegacyAdapter {
  processes(): LegacyProcess[];
  currentProcess(): LegacyProcess | null;
  processId(process: LegacyProcess | null | undefined): string;
  tasks(process: LegacyProcess | null | undefined): LegacyProcessTask[];
  selectedTaskId(): string;
  diagramMode(): 'linear' | 'swimlane';
  showEntities(): boolean;
  showTasks(): boolean;
  selectProcess(processId: string): void;
  selectTask(taskId: string): void;
  openTaskEditor(taskId: string): void;
  setDiagramMode(mode: 'linear' | 'swimlane'): void;
  setShowEntities(value: boolean): void;
  setShowTasks(value: boolean): void;
  zoom(containerId: string, delta: number): void;
  resetZoom(containerId: string): void;
  renderDiagram(containerId: string, process: LegacyProcess | null | undefined, onSelectTask: (taskId: string) => void): boolean;
}

export function createProcessFlowLegacyAdapter(legacyWindow: LegacyWindow = getAngularRuntimeState() as LegacyWindow): ProcessFlowLegacyAdapter {
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

  function processId(process: LegacyProcess | null | undefined): string {
    return String(process?.id || process?.uid || '').trim();
  }

  function taskId(task: LegacyProcessTask | null | undefined): string {
    return String(task?.id || task?.uid || '').trim();
  }

  function processes(): LegacyProcess[] {
    return document().processes || [];
  }

  function currentProcess(): LegacyProcess | null {
    const currentId = String(ui().procId || '').trim();
    return processes().find((process) => processId(process) === currentId || process.id === currentId || process.uid === currentId)
      || processes()[0]
      || null;
  }

  function tasks(process: LegacyProcess | null | undefined): LegacyProcessTask[] {
    return process?.nodes || process?.tasks || [];
  }

  return {
    processes,
    currentProcess,
    processId,
    tasks,
    selectedTaskId: () => String(ui().taskId || '').trim(),
    diagramMode: () => ui().procDiagramMode === 'swimlane' ? 'swimlane' : 'linear',
    showEntities: () => ui().procDiagramShowEntities !== false,
    showTasks: () => ui().procDiagramShowTasks === true,
    selectProcess(targetProcessId: string) {
      ui().procId = targetProcessId;
      ui().taskId = null;
      if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
      else emitRuntimeRefresh();
    },
    selectTask(targetTaskId: string) {
      ui().taskId = targetTaskId;
      if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
      else emitRuntimeRefresh();
    },
    openTaskEditor(targetTaskId: string) {
      const targetProcessId = processId(currentProcess());
      ui().procId = targetProcessId;
      ui().taskId = targetTaskId || null;
      if (targetProcessId && typeof legacyWindow.openProcessEditor === 'function') {
        legacyWindow.openProcessEditor(targetProcessId, targetTaskId || null);
        return;
      }
      ui().procView = 'list';
      if (legacyWindow.renderProcessTab) legacyWindow.renderProcessTab();
      else emitRuntimeRefresh();
    },
    setDiagramMode(mode: 'linear' | 'swimlane') {
      ui().procDiagramMode = mode;
      if (legacyWindow.markModified) legacyWindow.markModified();
      else markAngularRuntimeModified();
    },
    setShowEntities(value: boolean) {
      ui().procDiagramShowEntities = value;
      if (legacyWindow.markModified) legacyWindow.markModified();
      else markAngularRuntimeModified();
    },
    setShowTasks(value: boolean) {
      ui().procDiagramShowTasks = value;
      if (legacyWindow.markModified) legacyWindow.markModified();
      else markAngularRuntimeModified();
    },
    zoom(containerId: string, delta: number) {
      legacyWindow.zoomBy?.(containerId, delta);
    },
    resetZoom(containerId: string) {
      legacyWindow.resetZoom?.(containerId);
    },
    renderDiagram(containerId, process, onSelectTask) {
      // 模块意图：查看态流程图复用旧版 renderProcFlow 视觉算法，保证开始/结束、分支、连线、实体标签和滚动行为一致。
      // 关键流程：Angular 控制工具栏和状态；旧视觉算法只负责填充指定 live-diagram 容器，节点点击再回到 adapter 更新选择。
      // 边界细节：迁移期统一收敛在 adapter，后续纯 TS 复刻时只需要替换这一处，不让组件直接访问 window。
      if (!process || typeof legacyWindow.renderProcFlow !== 'function') return false;
      const clickMap: Record<string, () => void> = {};
      for (const task of tasks(process)) {
        const id = taskId(task);
        if (id) clickMap[id] = () => onSelectTask(id);
      }
      legacyWindow.renderProcFlow(containerId, process, clickMap);
      return true;
    },
  };
}
