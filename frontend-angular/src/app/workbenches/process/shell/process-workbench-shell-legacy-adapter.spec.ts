import { beforeAll, describe, expect, it } from 'vitest';
import { createProcessWorkbenchShellLegacyAdapter } from './process-workbench-shell-legacy-adapter';

beforeAll(() => {
  if (typeof window === 'undefined') {
    (globalThis as any).window = {
      dispatchEvent: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).CustomEvent = class CustomEvent {
      constructor(public type: string, public init?: CustomEventInit) {}
    };
  }
});

function createWindowMock() {
  return {
    S: {
      doc: {
        stages: [
          { uid: 'stage-a', name: '阶段A' },
          { uid: 'stage-b', name: '阶段B' },
          { uid: 'stage-c', name: '阶段C' },
        ],
        processes: [
          { uid: 'process-a', name: '流程A', nodes: [] },
          { uid: 'process-b', name: '流程B', nodes: [] },
        ],
        stageFlowRefs: [
          { stageUid: 'stage-a', processUid: 'process-a', order: 1 },
          { stageUid: 'stage-b', processUid: 'process-b', order: 1 },
          { stageUid: 'stage-c', processUid: 'process-b', order: 2 },
        ],
      },
      ui: {
        tab: 'process',
        procView: 'node',
        procId: 'process-b',
        taskId: 'node-x',
        stageId: 'stage-a',
      },
    },
  } as any;
}

describe('ProcessWorkbenchShellLegacyAdapter', () => {
  it('syncs stageId to the current process when opening flow view from another subview', () => {
    const win = createWindowMock();
    const adapter = createProcessWorkbenchShellLegacyAdapter(win);

    adapter.openFlow();

    expect(win.S.ui.procView).toBe('flow');
    expect(win.S.ui.procId).toBe('process-b');
    expect(win.S.ui.taskId).toBeNull();
    expect(win.S.ui.stageId).toBe('stage-b');
  });

  it('preserves the current stage when it already contains the current process', () => {
    const win = createWindowMock();
    win.S.ui.stageId = 'stage-c';
    const adapter = createProcessWorkbenchShellLegacyAdapter(win);

    adapter.openFlow();

    expect(win.S.ui.stageId).toBe('stage-c');
  });
});
