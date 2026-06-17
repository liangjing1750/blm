import { confirmRuntimeAction, getAngularRuntimeState, markAngularRuntimeModified } from '../../../core/runtime/angular-runtime';
import { ValueDomainDocument } from '../../../core/document/value-domain-model';
import { ValueDomainActions, createValueDomainActions } from './value-domain-actions';
import { ValueDomainDraftPort } from './value-domain-draft-port';

interface RuntimeLike {
  doc?: ValueDomainDocument;
  ui?: {
    stageId?: string;
    stageLinkFocusId?: string;
  };
  markModified?: () => void;
  renderSidebar?: () => void;
  showAppConfirm?: (message: string, options?: { title?: string; confirmLabel?: string }) => Promise<boolean>;
}

export interface ValueDomainLegacyAdapter {
  document(): ValueDomainDocument;
  actions(): ValueDomainActions;
}

// 模块意图：保留原适配器入口名，内部改读 Angular runtime，避免价值流组件再依赖旧全局脚本。
// 关键流程：组件继续拿 document/actions；actions 的副作用统一通过 draftPort 标记本地草稿和刷新壳层。
// 边界细节：文件名后续可清理为 runtime-adapter，本轮先保持 import 稳定，降低迁移风险。
export function createValueDomainLegacyAdapter(runtime: unknown = getAngularRuntimeState()): ValueDomainLegacyAdapter {
  const runtimeLike = runtime as RuntimeLike;
  const angularRuntime = getAngularRuntimeState();
  const document = runtimeLike.doc ?? angularRuntime.doc ?? {};
  const ui = runtimeLike.ui ?? angularRuntime.ui;
  const actions = createValueDomainActions({
    document,
    draftPort: createDraftPort(runtimeLike),
    setActiveStageId: (stageId) => {
      ui.stageId = stageId;
    },
    clearStageLinkFocus: (stageId) => {
      if (ui.stageLinkFocusId === stageId) ui.stageLinkFocusId = '';
    },
  });
  return {
    document: () => document,
    actions: () => actions,
  };
}

function createDraftPort(runtime: RuntimeLike): ValueDomainDraftPort {
  return {
    markModified: () => {
      if (runtime.markModified) runtime.markModified();
      else markAngularRuntimeModified();
    },
    renderSidebar: () => runtime.renderSidebar?.(),
    confirm: (message, options) => {
      if (runtime.showAppConfirm) return runtime.showAppConfirm(message, options);
      return confirmRuntimeAction(message);
    },
  };
}
