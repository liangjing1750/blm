export interface ShellTabBarRuntime {
  S?: {
    ui?: Record<string, any>;
    isPreviewRendering?: boolean;
  };
  normalizeMainTabId?: (tabId?: string) => string;
  switchMainTab?: (tabId: string) => void;
  canGoBackNavigation?: () => boolean;
  getBackNavigationTitle?: () => string;
  goBackNavigation?: () => boolean;
}

export interface ShellMainTab {
  id: string;
  label: string;
}

export interface ShellTabBarAdapter {
  tabs(): ShellMainTab[];
  activeTabId(): string;
  isPreviewRendering(): boolean;
  canGoBack(): boolean;
  backTitle(): string;
  switchTab(tabId: string): void;
  goBack(): void;
}

const MAIN_TABS: ShellMainTab[] = [
  { id: 'panoramaWorkbench', label: '全景工作台' },
  { id: 'processWorkbench', label: '流程工作台' },
  { id: 'constructWorkbench', label: '构件工作台' },
  { id: 'orchestrationWorkbench', label: '应用编排台' },
  { id: 'entity', label: '实体图' },
  { id: 'preview', label: '预览导出' },
];

const ALIASES: Record<string, string> = {
  businessArch: 'panoramaWorkbench',
  bizDomain: 'processWorkbench',
  bizComponent: 'constructWorkbench',
  appArch: 'orchestrationWorkbench',
  domain: 'panoramaWorkbench',
  data: 'constructWorkbench',
};

export function createShellTabBarLegacyAdapter(runtime: ShellTabBarRuntime = getAngularRuntimeState() as ShellTabBarRuntime): ShellTabBarAdapter {
  const normalize = (tabId?: string): string => {
    const fromRuntime = runtime.normalizeMainTabId?.(tabId || '') || normalizeMainWorkbenchId(tabId || '');
    const normalized = fromRuntime || ALIASES[String(tabId || '')] || String(tabId || 'panoramaWorkbench');
    return MAIN_TABS.some((tab) => tab.id === normalized) ? normalized : 'panoramaWorkbench';
  };

  const ui = () => {
    const direct = runtime as ShellTabBarRuntime & { ui?: Record<string, any> };
    if (direct.ui) return direct.ui;
    runtime.S ||= {};
    runtime.S.ui ||= {};
    return runtime.S.ui;
  };

  return {
    tabs(): ShellMainTab[] {
      return MAIN_TABS;
    },
    activeTabId(): string {
      const current = normalize(ui()['mainTab'] || 'panoramaWorkbench');
      ui()['mainTab'] = current;
      return current;
    },
    isPreviewRendering(): boolean {
      return !!runtime.S?.isPreviewRendering;
    },
    canGoBack(): boolean {
      return !!runtime.canGoBackNavigation?.();
    },
    backTitle(): string {
      return runtime.getBackNavigationTitle?.() || '褰撳墠娌℃湁鍙繑鍥炵殑浣嶇疆';
    },
    switchTab(tabId: string): void {
      if (runtime.switchMainTab) runtime.switchMainTab(tabId);
      else switchAngularMainTab(tabId);
    },
    goBack(): void {
      runtime.goBackNavigation?.();
    },
  };
}

import { getAngularRuntimeState, normalizeMainWorkbenchId, switchAngularMainTab } from '../../runtime/angular-runtime';
