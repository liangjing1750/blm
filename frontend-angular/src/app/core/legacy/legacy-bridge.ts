import { Injectable } from '@angular/core';
import { loadLegacyRuntime } from '../../legacy-runtime/legacy-runtime.bootstrap';

type LegacyMainTab =
  | 'panoramaWorkbench'
  | 'processWorkbench'
  | 'constructWorkbench'
  | 'orchestrationWorkbench'
  | 'preview';

export interface LegacyApp {
  init?: () => void | Promise<void>;
}

export interface LegacyState {
  ui?: {
    mainTab?: string;
    tab?: string;
  };
}

interface LegacyWindow {
  App?: LegacyApp;
  S?: LegacyState;
  switchMainTab?: (mainTabId: string) => void;
}

@Injectable({ providedIn: 'root' })
export class LegacyBridge {
  async mount(): Promise<void> {
    await loadLegacyRuntime();
    await this.getApp()?.init?.();
  }

  getApp(): LegacyApp | undefined {
    return this.legacyWindow().App;
  }

  getState(): LegacyState | undefined {
    return this.legacyWindow().S;
  }

  switchMainTab(mainTabId: LegacyMainTab): void {
    this.legacyWindow().switchMainTab?.(mainTabId);
  }

  openWorkbench(workbenchId: 'panorama' | 'process' | 'component' | 'orchestration'): void {
    const tabMap: Record<typeof workbenchId, LegacyMainTab> = {
      panorama: 'panoramaWorkbench',
      process: 'processWorkbench',
      component: 'constructWorkbench',
      orchestration: 'orchestrationWorkbench',
    };
    this.switchMainTab(tabMap[workbenchId]);
  }

  private legacyWindow(): LegacyWindow {
    return window as LegacyWindow;
  }
}
