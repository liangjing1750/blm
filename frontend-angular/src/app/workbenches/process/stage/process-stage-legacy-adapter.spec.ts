import { beforeAll, describe, expect, it } from 'vitest';

// 窗口分发事件需要模拟 window
beforeAll(() => {
  if (typeof window === 'undefined') {
    (globalThis as any).window = {
      dispatchEvent: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
});

import { createProcessStageLegacyAdapter } from './process-stage-legacy-adapter';

interface TestDocument {
  stages: Array<{ uid?: string; id?: string | null; name?: string }>;
  processes: Array<{ uid?: string; id?: string | null; name?: string; nodes?: unknown[] }>;
  stageFlowRefs: Array<{ uid?: string; id?: string | null; stageUid?: string; stageId?: string; processUid?: string; processId?: string | null; order?: number }>;
  stageFlowLinks: never[];
}

function createTestDoc(overrides?: Partial<TestDocument>): TestDocument {
  return {
    stages: [{ uid: 's1', name: 'Stage 1' }, { uid: 's2', name: 'Stage 2' }, { uid: 's3', name: 'Stage 3' }],
    processes: [
      { uid: 'p1', name: 'Process 1', nodes: [] },
      { uid: 'p2', name: 'Process 2', nodes: [] },
      { uid: 'p-id-null', id: null, name: 'Null ID Process', nodes: [] },
    ],
    stageFlowRefs: [
      { uid: 'r1', stageUid: 's1', processUid: 'p1', order: 1 },
      { uid: 'r2', stageUid: 's2', processUid: 'p2', order: 1 },
      { uid: 'r3', stageUid: 's1', processUid: 'p-id-null', order: 1 },
      { uid: 'r4', stageUid: 's2', processUid: 'p-id-null', order: 1 },
    ],
    stageFlowLinks: [],
    ...overrides,
  };
}

describe('ProcessStageLegacyAdapter — P2 safe matching', () => {
  it('duplicateProcess with id=null source only adds clone to the same stages as the original', () => {
    const doc = createTestDoc();
    const windowMock = {
      S: { doc, ui: {} },
      markModified: () => {},
    } as any;

    const adapter = createProcessStageLegacyAdapter(windowMock);
    adapter.duplicateProcess('p-id-null');

    const refs = doc.stageFlowRefs;
    const origRefs = refs.filter((r) => r.processUid === 'p-id-null');
    const clone = doc.processes.find((p) => p.name?.includes('副本'));
    const cloneRefs = refs.filter((r) => r.processUid === clone?.uid);

    // Original p-id-null was in s1 and s2 → clone should only be in s1 and s2
    const cloneStages = new Set(cloneRefs.map((r) => r.stageUid));
    expect(cloneStages.size).toBe(2);
    expect(cloneStages.has('s1')).toBe(true);
    expect(cloneStages.has('s2')).toBe(true);
    expect(cloneStages.has('s3')).toBe(false);
  });

  it('removeProcessFromStage only removes refs for the specified stage and process', () => {
    const doc = createTestDoc();
    const windowMock = {
      S: { doc, ui: {} },
      markModified: () => {},
    } as any;

    const adapter = createProcessStageLegacyAdapter(windowMock);

    // p-id-null is in s1 and s2. Remove from s1 only.
    adapter.removeProcessFromStage('s1', 'p-id-null');

    const remaining = doc.stageFlowRefs.filter((r) => {
      const puid = r.processUid || '';
      return puid === 'p-id-null';
    });
    expect(remaining.length).toBe(1);
    expect(remaining[0].stageUid).toBe('s2');
  });

  it('deleteProcess removes the process and all its refs', () => {
    const doc = createTestDoc();
    const windowMock = {
      S: { doc, ui: {} },
      markModified: () => {},
    } as any;

    const adapter = createProcessStageLegacyAdapter(windowMock);
    adapter.deleteProcess('p-id-null');

    expect(doc.processes.find((p) => p.uid === 'p-id-null')).toBeUndefined();
    const refs = doc.stageFlowRefs.filter((r) => {
      const puid = r.processUid || '';
      return puid === 'p-id-null';
    });
    expect(refs.length).toBe(0);
  });

  it('addExistingProcess with already-linked process is a no-op', () => {
    const doc = createTestDoc();
    const windowMock = {
      S: { doc, ui: {} },
      markModified: () => {},
    } as any;

    const beforeCount = doc.stageFlowRefs.length;
    const adapter = createProcessStageLegacyAdapter(windowMock);
    adapter.addExistingProcess('s1', 'p1');

    expect(doc.stageFlowRefs.length).toBe(beforeCount);
  });

  it('openProcess updates the stage context to the selected process stage', () => {
    const doc = createTestDoc();
    const windowMock = {
      S: { doc, ui: { stageId: 's1' } },
      markModified: () => {},
      navigate: (_tab: string, options: Record<string, unknown>) => {
        windowMock.S.ui = { ...windowMock.S.ui, ...options };
      },
    } as any;

    const adapter = createProcessStageLegacyAdapter(windowMock);
    adapter.openProcess('p2');

    expect(windowMock.S.ui.procId).toBe('p2');
    expect(windowMock.S.ui.stageId).toBe('s2');
  });

  it('openProcess normalizes stage uid refs to the stage select value', () => {
    const doc = createTestDoc({
      stages: [{ uid: 'stage-uid-1', id: 'stage-id-1', name: 'Stage 1' }, { uid: 'stage-uid-2', id: 'stage-id-2', name: 'Stage 2' }],
      processes: [{ uid: 'process-uid-2', id: 'process-id-2', name: 'Process 2', nodes: [] }],
      stageFlowRefs: [{ uid: 'ref-2', stageUid: 'stage-uid-2', processUid: 'process-uid-2', order: 1 }],
    });
    const windowMock = {
      S: { doc, ui: { stageId: 'stage-id-1' } },
      markModified: () => {},
      navigate: (_tab: string, options: Record<string, unknown>) => {
        windowMock.S.ui = { ...windowMock.S.ui, ...options };
      },
    } as any;

    const adapter = createProcessStageLegacyAdapter(windowMock);
    adapter.openProcess('process-id-2');

    expect(windowMock.S.ui.procId).toBe('process-id-2');
    expect(windowMock.S.ui.stageId).toBe('stage-id-2');
  });

  it('opens a process from the current stage detail directly in flow view with the matched stage selected', () => {
    const doc = createTestDoc({
      stages: [
        { uid: 'stage-inbound', id: 'S1', name: '入库阶段' },
        { uid: 'stage-in-stock', id: 'S2', name: '在库阶段' },
      ],
      processes: [
        { uid: 'process-online-check', id: 'P1', name: '新增线上查库', nodes: [] },
        { uid: 'process-template-change', id: 'P2', name: '修改查库模板', nodes: [] },
      ],
      stageFlowRefs: [
        { uid: 'ref-online-check', stageUid: 'stage-in-stock', processUid: 'process-online-check', order: 1 },
        { uid: 'ref-template-change', stageUid: 'stage-in-stock', processUid: 'process-template-change', order: 2 },
      ],
    });
    const windowMock = {
      S: { doc, ui: { procView: 'stage', stageViewMode: 'detail', stageId: 'S1' } },
      markModified: () => {},
      navigate: (_tab: string, options: Record<string, unknown>) => {
        windowMock.S.ui = { ...windowMock.S.ui, ...options };
      },
    } as any;

    const adapter = createProcessStageLegacyAdapter(windowMock);
    adapter.openProcess('process-template-change');

    expect(windowMock.S.ui.procView).toBe('flow');
    expect(windowMock.S.ui.procId).toBe('process-template-change');
    expect(windowMock.S.ui.stageId).toBe('S2');
    expect(windowMock.S.ui.taskId).toBeNull();
  });

  it('duplicateProcess with normal process (uid + id both present) works correctly', () => {
    // Simulate a process with both id and uid
    const doc = createTestDoc({
      processes: [
        { uid: 'normal-uid', id: 'normal-id', name: 'Normal', nodes: [] },
        ...createTestDoc().processes,
      ],
      stageFlowRefs: [
        { uid: 'ref-normal', stageUid: 's1', processUid: 'normal-uid', processId: 'normal-id' as any, order: 1 },
        ...createTestDoc().stageFlowRefs,
      ],
    });
    const windowMock = {
      S: { doc, ui: {} },
      markModified: () => {},
    } as any;

    const adapter = createProcessStageLegacyAdapter(windowMock);
    adapter.duplicateProcess('normal-uid');

    const clone = doc.processes.find((p) => p.name?.includes('副本') && p.uid !== 'normal-uid');
    expect(clone).toBeDefined();
    const cloneRefs = doc.stageFlowRefs.filter((r) => r.processUid === clone?.uid);
    expect(cloneRefs.length).toBe(1);
    expect(cloneRefs[0].stageUid).toBe('s1');
  });
});
