import { LegacyProcess, LegacyProcessNode } from '../editor/process-editor-legacy-adapter';
import { getAngularRuntimeState, emitRuntimeRefresh, recordAngularNavigationBoundary } from '../../../core/runtime/angular-runtime';

interface LegacyState {
  doc?: { processes?: LegacyProcess[] };
  ui?: {
    tab?: string;
    procView?: string;
    procId?: string | null;
    taskId?: string | null;
    stageViewMode?: string;
    stageEditorCollapsed?: boolean;
  };
}

interface LegacyWindow {
  S?: LegacyState;
  renderSidebar?: () => void;
  renderProcessTab?: () => void;
  openProcessFlowLegacyView?: () => void;
  openProcessEditorLegacy?: (processId: string, taskId?: string | null) => void;
}

export type ProcessShellView = 'valueDomain' | 'stage' | 'flow' | 'node' | 'editor';

export interface ProcessWorkbenchShellLegacyAdapter {
  ui(): NonNullable<LegacyState['ui']>;
  processes(): LegacyProcess[];
  currentProcess(): LegacyProcess | null;
  currentTask(): LegacyProcessNode | null;
  tasks(process: LegacyProcess | null | undefined): LegacyProcessNode[];
  processId(process: LegacyProcess | null | undefined): string;
  taskId(task: LegacyProcessNode | null | undefined): string;
  view(): ProcessShellView;
  stageEditing(): boolean;
  openValueDomain(): void;
  openStage(): void;
  openFlow(): void;
  openNode(): void;
  openEditor(processId?: string | null, taskId?: string | null): void;
  setStageEditing(editing: boolean): void;
  openFlowLegacy(): void;
  openEditorLegacy(): void;
}

export function createProcessWorkbenchShellLegacyAdapter(
  legacyWindow: LegacyWindow = getAngularRuntimeState() as LegacyWindow,
): ProcessWorkbenchShellLegacyAdapter {
  const state = () => {
    const direct = legacyWindow as LegacyWindow & { doc?: LegacyState['doc']; ui?: LegacyState['ui'] };
    if (direct.doc || direct.ui) return { doc: direct.doc, ui: direct.ui };
    return legacyWindow.S || {};
  };
  const ui = () => {
    state().ui ||= {};
    return state().ui as NonNullable<LegacyState['ui']>;
  };

  function processes(): LegacyProcess[] {
    return state().doc?.processes || [];
  }

  function processId(process: LegacyProcess | null | undefined): string {
    return String(process?.id || process?.uid || '').trim();
  }

  function taskId(task: LegacyProcessNode | null | undefined): string {
    return String(task?.id || task?.uid || '').trim();
  }

  function currentProcess(): LegacyProcess | null {
    const currentId = String(ui().procId || '').trim();
    return processes().find((process) => processId(process) === currentId) || processes()[0] || null;
  }

  function currentTask(): LegacyProcessNode | null {
    const process = currentProcess();
    const currentTaskId = String(ui().taskId || '').trim();
    const tasks = process?.nodes || process?.tasks || [];
    return tasks.find((task) => taskId(task) === currentTaskId) || null;
  }

  function tasks(process: LegacyProcess | null | undefined): LegacyProcessNode[] {
    return process?.nodes || process?.tasks || [];
  }

  function ensureProcessSelection(): void {
    const current = currentProcess();
    if (current && !ui().procId) ui().procId = processId(current);
  }

  function currentView(): ProcessShellView {
    const raw = ui().procView || 'valueDomain';
    if (raw === 'list') return 'editor';
    if (raw === 'valueDomain') return 'valueDomain';
    if (raw === 'node') return 'node';
    if (raw === 'flow') return 'flow';
    return 'stage';
  }

  function setNormalView(view: ProcessShellView): void {
    // 模块意图：Angular 壳层接管二级 tab 状态，legacy 只保留数据模型和旧版对比入口。
    // 关键流程：切换视图时只改 S.ui，子工作台通过各自 adapter 读取同一个状态，避免同级组件直接依赖。
    // 边界细节：不在这里调用 renderProcessTab，防止壳层切换又被 legacy 重新生成。
    if (currentView() !== view) recordAngularNavigationBoundary();
    ui().tab = 'process';
    if (view === 'valueDomain') {
      ui().procView = 'valueDomain';
      ui().taskId = null;
    } else if (view === 'stage') {
      ui().procView = 'stage';
      ui().stageViewMode = 'detail';
      ui().taskId = null;
    } else if (view === 'flow') {
      ensureProcessSelection();
      ui().procView = 'flow';
      ui().taskId = null;
    } else if (view === 'node') {
      ensureProcessSelection();
      ui().procView = 'node';
      const process = currentProcess();
      const firstTask = tasks(process)[0];
      if (!ui().taskId && firstTask) ui().taskId = taskId(firstTask);
    } else {
      ensureProcessSelection();
      ui().procView = 'list';
    }
    if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
    else emitRuntimeRefresh();
  }

  return {
    ui,
    processes,
    currentProcess,
    currentTask,
    tasks,
    processId,
    taskId,
    view() {
      return currentView();
    },
    stageEditing() {
      return (ui().procView || 'stage') === 'stage' && ui().stageEditorCollapsed === false;
    },
    openValueDomain() {
      setNormalView('valueDomain');
    },
    openStage() {
      setNormalView('stage');
    },
    openFlow() {
      setNormalView('flow');
    },
    openNode() {
      setNormalView('node');
    },
    openEditor(targetProcessId = null, targetTaskId = null) {
      recordAngularNavigationBoundary();
      if (targetProcessId) ui().procId = targetProcessId;
      ui().taskId = targetTaskId || null;
      ensureProcessSelection();
      ui().tab = 'process';
      ui().procView = 'list';
    },
    setStageEditing(editing) {
      ui().procView = 'stage';
      ui().stageEditorCollapsed = !editing;
      if (legacyWindow.renderSidebar) legacyWindow.renderSidebar();
      else emitRuntimeRefresh();
    },
    openFlowLegacy() {
      legacyWindow.openProcessFlowLegacyView?.();
    },
    openEditorLegacy() {
      const process = currentProcess();
      legacyWindow.openProcessEditorLegacy?.(processId(process), taskId(currentTask()) || null);
    },
  };
}
