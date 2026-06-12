import { createValueDomainActions } from './value-domain-actions';
import { ValueDomainDocument } from './value-domain-model';

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
      panoramaColumnUid: document.panorama?.columns?.[0].id,
      panoramaLaneUid: document.panorama?.lanes?.[0].id,
    });
    expect(events).toEqual(['modified', 'modified', 'modified', 'sidebar']);
  });

  it('moves columns, lanes, and stages without changing references', () => {
    const { actions, document } = createHarness({
      panorama: {
        columns: [{ id: 'c1' }, { id: 'c2' }],
        lanes: [{ id: 'l1' }, { id: 'l2' }],
        cells: [],
      },
      stages: [{ id: 'S1' }, { id: 'S2' }],
    });

    actions.moveColumn('c2', -1);
    actions.moveLane('l2', -1);
    actions.moveStage('S2', -1);

    expect(document.panorama?.columns?.map((item) => item.id)).toEqual(['c2', 'c1']);
    expect(document.panorama?.lanes?.map((item) => item.id)).toEqual(['l2', 'l1']);
    expect(document.stages?.map((item) => item.id)).toEqual(['S2', 'S1']);
  });

  it('removes columns and lanes while clearing cells and stage placement', async () => {
    const { actions, document, events } = createHarness({
      panorama: {
        columns: [{ id: 'c1', name: '下单' }, { id: 'c2' }],
        lanes: [{ id: 'l1', name: '销售' }, { id: 'l2' }],
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

    expect(document.panorama?.columns?.map((item) => item.id)).toEqual(['c2']);
    expect(document.panorama?.lanes?.map((item) => item.id)).toEqual(['l2']);
    expect(document.panorama?.cells).toEqual([{ laneUid: 'l2', columnUid: 'c2', text: 'keep' }]);
    expect(document.stages?.[0].panoramaColumnUid).toBe('');
    expect(document.stages?.[0].panoramaLaneUid).toBe('');
    expect(events.filter((event) => event === 'modified')).toHaveLength(2);
  });

  it('updates cells and stage placement through the same action layer', () => {
    const { actions, document, events } = createHarness({
      panorama: {
        columns: [{ id: 'c1' }],
        lanes: [{ id: 'l1' }],
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
        columns: [{ id: 'c1' }, { id: 'c2' }],
        lanes: [{ id: 'l1' }, { id: 'l2' }],
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
});
