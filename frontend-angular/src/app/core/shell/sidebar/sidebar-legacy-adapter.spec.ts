import { describe, expect, it, vi } from 'vitest';
import { createSidebarLegacyAdapter } from './sidebar-legacy-adapter';

describe('sidebar navigation initialization', () => {
  it('sets stage view before switching the process workbench tab', () => {
    const runtime: any = {
      S: { doc: { stages: [{ uid: 'stage-1', name: '入库' }], processes: [], stageFlowRefs: [] }, ui: {} },
      switchMainTab: vi.fn(),
      render: vi.fn(),
    };
    runtime.switchMainTab.mockImplementation(() => {
      runtime.S.ui.mainTab = 'processWorkbench';
      expect(runtime.S.ui.mainTab).toBe('processWorkbench');
      expect(runtime.S.ui.procView).toBe('stage');
      expect(runtime.S.ui.stageId).toBe('stage-1');
    });

    createSidebarLegacyAdapter(runtime).openStage('stage-1');

    expect(runtime.S.ui.procView).toBe('stage');
    expect(runtime.S.ui.stageViewMode).toBe('detail');
  });
});
