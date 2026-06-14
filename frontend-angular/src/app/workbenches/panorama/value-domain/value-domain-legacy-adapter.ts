import { ValueDomainActions, createValueDomainActions } from './value-domain-actions';
import { ValueDomainDraftPort } from './value-domain-draft-port';
import { ValueDomainDocument } from '../../../core/document/value-domain-model';

interface LegacyWindow {
  S?: {
    doc?: ValueDomainDocument;
    ui?: {
      stageId?: string;
      stageLinkFocusId?: string;
    };
  };
  markModified?: () => void;
  renderSidebar?: () => void;
  showAppConfirm?: (message: string, options?: { title?: string; confirmLabel?: string }) => Promise<boolean>;
}

// 模块意图：把旧运行时 window.S、markModified、showAppConfirm 隔离在适配层，避免 Angular 组件直接依赖旧全局对象。
export interface ValueDomainLegacyAdapter {
  document(): ValueDomainDocument;
  actions(): ValueDomainActions;
}

// 关键流程：适配器只创建 document 与 actions 的桥接，不承载业务规则；业务规则必须留在 value-domain-actions。
export function createValueDomainLegacyAdapter(runtime: unknown): ValueDomainLegacyAdapter {
  const legacyWindow = runtime as LegacyWindow;
  const document = legacyWindow.S?.doc ?? {};
  const actions = createValueDomainActions({
    document,
    draftPort: createDraftPort(legacyWindow),
    setActiveStageId: (stageId) => {
      if (legacyWindow.S?.ui) legacyWindow.S.ui.stageId = stageId;
    },
    clearStageLinkFocus: (stageId) => {
      if (legacyWindow.S?.ui?.stageLinkFocusId === stageId) legacyWindow.S.ui.stageLinkFocusId = '';
    },
  });
  return {
    document: () => document,
    actions: () => actions,
  };
}

// 边界细节：本地草稿和确认框仍由旧运行时提供，迁移完成前不要在 action 层直接调用 window。
function createDraftPort(legacyWindow: LegacyWindow): ValueDomainDraftPort {
  return {
    markModified: () => legacyWindow.markModified?.(),
    renderSidebar: () => legacyWindow.renderSidebar?.(),
    confirm: (message, options) => {
      if (legacyWindow.showAppConfirm) return legacyWindow.showAppConfirm(message, options);
      return Promise.resolve(window.confirm(message));
    },
  };
}
