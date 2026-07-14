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
  goBack(): string | null;
}

const MAIN_TABS: ShellMainTab[] = [
  { id: 'panoramaWorkbench', label: '全景工作台' },
  { id: 'processWorkbench', label: '流程工作台' },
  { id: 'constructWorkbench', label: '构件工作台' },
  { id: 'applicationWorkbench', label: '应用工作台' },
  { id: 'preview', label: '预览/导出' },
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
      const raw = String(ui()['mainTab'] || 'panoramaWorkbench');
      const current = normalize(raw);
      if (!isAngularUtilityWorkbench(raw)) ui()['mainTab'] = current;
      return current;
    },
    isPreviewRendering(): boolean {
      return !!runtime.S?.isPreviewRendering;
    },
    canGoBack(): boolean {
      return runtime.canGoBackNavigation ? !!runtime.canGoBackNavigation() : canGoBackAngularNavigation();
    },
    backTitle(): string {
      return runtime.getBackNavigationTitle?.() || getAngularBackNavigationTitle();
    },
    switchTab(tabId: string): void {
      if (normalize(tabId) === 'preview') {
        ui()['sidebarCollapsed'] = true;
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('blm-sidebar-directory-refresh'));
      }
      if (runtime.switchMainTab) runtime.switchMainTab(tabId);
      else switchAngularMainTab(tabId);
    },
    goBack(): string | null {
      if (isAngularUtilityWorkbench(String(ui()['mainTab'] || ''))) {
        return goBackAngularUtilityWorkbench();
      }
      if (runtime.goBackNavigation) {
        runtime.goBackNavigation();
        return normalize(ui()['mainTab']);
      }
      return goBackAngularNavigation();
    },
  };
}

import {
  canGoBackAngularNavigation,
  getAngularBackNavigationTitle,
  getAngularRuntimeState,
  goBackAngularNavigation,
  goBackAngularUtilityWorkbench,
  isAngularUtilityWorkbench,
  normalizeMainWorkbenchId,
  switchAngularMainTab,
} from '../../runtime/angular-runtime';
