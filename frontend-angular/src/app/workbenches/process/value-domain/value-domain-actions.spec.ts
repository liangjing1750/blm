import { createValueDomainActions } from './value-domain-actions';
import { ValueDomainDocument } from '../../../core/document/value-domain-model';

function createHarness(document: ValueDomainDocument = {}) {
  const events: string[] = [];
  let sequence = 0;
  const actions = createValueDomainActions({
    document,
    draftPort: {
      markModified: () => events.push('modified'),
      renderSidebar: () => events.push('sidebar'),
      confirm: async () => true,
    },
    nextId: (prefix) => `${prefix}-${++sequence}`,
  });
  return { actions, document, events };
}

function createDynamicHarness(document: ValueDomainDocument = {}) {
  let current = document;
  let sequence = 0;
  const actions = createValueDomainActions({
    document: () => current,
    draftPort: {
      markModified: () => undefined,
      renderSidebar: () => undefined,
      confirm: async () => true,
    },
    nextId: (prefix) => `${prefix}-${++sequence}`,
  });
  return {
    actions,
    replaceDocument: (next: ValueDomainDocument) => { current = next; },
    currentDocument: () => current,
  };
}

describe('value-domain actions', () => {
  it('adds columns, lanes, stages, and marks draft modified', () => {
    const { actions, document, events } = createHarness();

    actions.addColumn();
    actions.addLane();
    actions.addStage();

    expect(document.panorama?.columns).toHaveLength(2);
    expect(document.panorama?.lanes).toHaveLength(2);
    expect(document.stages?.[0]).toMatchObject({
      id: 'S1',
      name: '业务阶段1',
      panoramaColumnUid: document.panorama?.columns?.[0].uid,
      panoramaLaneUid: document.panorama?.lanes?.[0].uid,
    });
    expect(events).toEqual(['modified', 'modified', 'modified', 'sidebar']);
  });

  it('moves columns, lanes, and stages without changing references', () => {
    const { actions, document } = createHarness({
      panorama: {
        columns: [{ uid: 'c1' }, { uid: 'c2' }],
        lanes: [{ uid: 'l1' }, { uid: 'l2' }],
        cells: [],
      },
      stages: [{ id: 'S1' }, { id: 'S2' }],
    });

    actions.moveColumn('c2', -1);
    actions.moveLane('l2', -1);
    actions.moveStage('S2', -1);

    expect(document.panorama?.columns?.map((item) => item.uid)).toEqual(['c2', 'c1']);
    expect(document.panorama?.lanes?.map((item) => item.uid)).toEqual(['l2', 'l1']);
    expect(document.stages?.map((item) => item.id)).toEqual(['S2', 'S1']);
  });

  it('uses legacy uid fields when value-domain ids are absent', () => {
    const { actions, document } = createHarness({
      panorama: {
        columns: [{ uid: 'column-a', name: 'A' }, { uid: 'column-b', name: 'B' }],
        lanes: [{ uid: 'lane-a', name: 'A' }, { uid: 'lane-b', name: 'B' }],
        cells: [],
      },
      stages: [{ id: 'S1' }],
    });

    actions.moveColumn('column-b', -1);
    actions.moveLane('lane-b', -1);
    actions.setCell('lane-b', 'column-b', 'text', 'ready');
    actions.setStagePlacement('S1', 'lane-b', 'column-b', { row: 1, col: 2 });

    expect(document.panorama?.columns?.map((item) => item.uid)).toEqual(['column-b', 'column-a']);
    expect(document.panorama?.lanes?.map((item) => item.uid)).toEqual(['lane-b', 'lane-a']);
    expect(document.panorama?.cells?.[0]).toMatchObject({ laneUid: 'lane-b', columnUid: 'column-b' });
    expect(document.stages?.[0]).toMatchObject({ panoramaLaneUid: 'lane-b', panoramaColumnUid: 'column-b' });
  });

  it('removes columns and lanes while clearing cells and stage placement', async () => {
    const { actions, document, events } = createHarness({
      panorama: {
        columns: [{ uid: 'c1', name: '下单' }, { uid: 'c2' }],
        lanes: [{ uid: 'l1', name: '销售' }, { uid: 'l2' }],
        cells: [
          { laneUid: 'l1', columnUid: 'c1', text: 'remove-by-column' },
          { laneUid: 'l1', columnUid: 'c2', text: 'remove-by-lane' },
          { laneUid: 'l2', columnUid: 'c2', text: 'keep' },
        ],
      },
      stages: [{ id: 'S1', panoramaColumnUid: 'c1', panoramaLaneUid: 'l1' }],
    });

    await actions.removeColumn('c1');
    await actions.removeLane('l1');

    expect(document.panorama?.columns?.map((item) => item.uid)).toEqual(['c2']);
    expect(document.panorama?.lanes?.map((item) => item.uid)).toEqual(['l2']);
    expect(document.panorama?.cells).toEqual([{ laneUid: 'l2', columnUid: 'c2', text: 'keep' }]);
    expect(document.stages?.[0].panoramaColumnUid).toBe('');
    expect(document.stages?.[0].panoramaLaneUid).toBe('');
    expect(events.filter((event) => event === 'modified')).toHaveLength(2);
  });

  it('updates cells and stage placement through the same action layer', () => {
    const { actions, document, events } = createHarness({
      panorama: {
        columns: [{ uid: 'c1' }],
        lanes: [{ uid: 'l1' }],
        cells: [],
      },
      stages: [{ id: 'S1' }],
    });

    actions.setCell('l1', 'c1', 'status', '关键');
    actions.setCell('l1', 'c1', 'text', '需确认口径');
    actions.setStage('S1', 'panoramaColumnUid', 'c1');
    actions.setStage('S1', 'panoramaLaneUid', 'l1');

    expect(document.panorama?.cells?.[0]).toMatchObject({
      laneUid: 'l1',
      columnUid: 'c1',
      status: '关键',
      text: '需确认口径',
    });
    expect(document.stages?.[0]).toMatchObject({ panoramaColumnUid: 'c1', panoramaLaneUid: 'l1' });
    expect(events).toEqual(['modified', 'modified', 'modified', 'modified']);
  });

  it('creates named stages in a target cell and persists matrix slots', () => {
    const { actions, document, events } = createHarness({
      panorama: {
        columns: [{ uid: 'c1' }, { uid: 'c2' }],
        lanes: [{ uid: 'l1' }, { uid: 'l2' }],
        cells: [],
      },
      stages: [],
    });

    const stage = actions.addStage('', { name: '入库', laneId: 'l2', columnId: 'c2', slot: { row: 1, col: 2 } });
    actions.setStagePlacement(stage?.id || '', 'l1', 'c1', { row: 3, col: 4 });

    expect(document.stages?.[0]).toMatchObject({
      id: 'S1',
      name: '入库',
      panoramaLaneUid: 'l1',
      panoramaColumnUid: 'c1',
      panoramaSlot: { row: 3, col: 4 },
      panoramaPos: null,
    });
    expect(events).toEqual(['modified', 'sidebar', 'modified']);
  });

  it('writes to the latest runtime document after the document object is replaced', () => {
    const first: ValueDomainDocument = {
      panorama: { columns: [{ uid: 'old-column' }], lanes: [{ uid: 'old-lane' }], cells: [] },
      stages: [],
    };
    const second: ValueDomainDocument = {
      panorama: { columns: [{ uid: 'new-column' }], lanes: [{ uid: 'new-lane' }], cells: [] },
      stages: [],
    };
    const harness = createDynamicHarness(first);

    harness.replaceDocument(second);
    harness.actions.addStage('', { name: '新增阶段' });

    expect(first.stages).toEqual([]);
    expect(harness.currentDocument().stages?.[0]).toMatchObject({
      name: '新增阶段',
      panoramaColumnUid: 'new-column',
      panoramaLaneUid: 'new-lane',
    });
  });

  it('writes lane quick actions to the latest runtime document after replacement', async () => {
    const first: ValueDomainDocument = {
      panorama: { columns: [{ uid: 'old-column' }], lanes: [{ uid: 'old-lane' }], cells: [] },
      stages: [],
    };
    const second: ValueDomainDocument = {
      panorama: {
        columns: [{ uid: 'new-column' }],
        lanes: [{ uid: 'new-lane' }, { uid: 'new-lane-2' }],
        cells: [{ laneUid: 'new-lane-2', columnUid: 'new-column', text: 'remove-with-lane' }],
      },
      stages: [{ id: 'S1', panoramaLaneUid: 'new-lane-2', panoramaColumnUid: 'new-column' }],
    };
    const harness = createDynamicHarness(first);

    harness.replaceDocument(second);
    harness.actions.addLane('new-lane');
    harness.actions.setLane('panorama-lane-1', 'name', '新增业务域');
    harness.actions.moveLane('panorama-lane-1', -1);
    await harness.actions.removeLane('new-lane-2');

    expect(first.panorama?.lanes?.map((item) => item.uid)).toEqual(['old-lane']);
    expect(first.panorama?.cells).toEqual([]);
    expect(second.panorama?.lanes?.map((item) => item.uid)).toEqual(['panorama-lane-1', 'new-lane']);
    expect(second.panorama?.lanes?.[0].name).toBe('新增业务域');
    expect(second.panorama?.cells).toEqual([]);
    expect(second.stages?.[0].panoramaLaneUid).toBe('');
  });
});
