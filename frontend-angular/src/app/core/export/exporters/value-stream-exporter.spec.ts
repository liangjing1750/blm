import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../document/document.model';
import {
  buildValueStreamContent,
  stagesForValueStream,
  valueStreamChapters,
  ValueStreamExporter,
} from './value-stream-exporter';

function createDocument(): BlmDocument {
  return {
    meta: { domain: 'Warehouse' },
    panorama: {
      columns: [
        { uid: 'col-in', name: 'Inbound', badge: 'Inbound' },
        { uid: 'col-out', name: 'Outbound', badge: 'Outbound' },
      ],
      lanes: [{ uid: 'lane-main', name: 'Main' }],
      cells: [],
    },
    roles: [],
    stages: [
      { uid: 'stage-out', name: 'Ship Stage', panoramaColumnUid: 'col-out', panoramaLaneUid: 'lane-main', panoramaSlot: { row: 0, col: 0 } } as any,
      { uid: 'stage-in', name: 'Receive Stage', panoramaColumnUid: 'col-in', panoramaLaneUid: 'lane-main', panoramaSlot: { row: 0, col: 0 } } as any,
    ],
    stageFlowRefs: [
      { uid: 'ref-1', stageUid: 'stage-in', processUid: 'process-receive', order: 1 },
      { uid: 'ref-2', stageUid: 'stage-out', processUid: 'process-ship', order: 1 },
    ],
    processes: [
      { uid: 'process-receive', name: 'Receive Process', flowGroup: 'Receive Group', nodes: [{ uid: 'node-receive', name: 'Receive Node' }] } as any,
      { uid: 'process-ship', name: 'Ship Process', flowGroup: 'Ship Group', nodes: [{ uid: 'node-ship', name: 'Ship Node' }] } as any,
    ],
    entities: [],
    businessComponents: [],
    businessConstructs: [],
    taskDefinitions: [],
    serviceGroups: [],
    services: [],
    terms: [],
    dataDictionaries: [],
    rules: [],
  } as any;
}

describe('buildValueStreamContent', () => {
  it('starts from chapter 2 and nests stages, groups, processes and nodes with numbering', () => {
    const content = buildValueStreamContent(createDocument());

    expect(content.title).toBe('价值流环节');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'image', text: '价值流视图', imageIndex: 0 },
      { type: 'heading1', text: '2.价值流环节：Inbound' },
      { type: 'heading2', text: '2.1 阶段：Receive Stage' },
      { type: 'image', text: '阶段视图：Receive Stage', imageIndex: 1 },
      { type: 'heading3', text: '2.1.1 流程组：Receive Group' },
      { type: 'heading4', text: '2.1.1.1 流程：Receive Process' },
      { type: 'image', text: '流程图：Receive Process', imageIndex: 2 },
      { type: 'heading5', text: '2.1.1.1.1 节点：Receive Node' },
      { type: 'heading1', text: '3.价值流环节：Outbound' },
      { type: 'heading2', text: '3.1 阶段：Ship Stage' },
      { type: 'image', text: '阶段视图：Ship Stage', imageIndex: 3 },
      { type: 'image', text: '流程图：Ship Process', imageIndex: 4 },
    ]));
  });
});

describe('stagesForValueStream', () => {
  it('keeps the value stream matrix order by column and lane', () => {
    expect(stagesForValueStream(createDocument()).map((stage) => stage.name))
      .toEqual(['Receive Stage', 'Ship Stage']);
  });

  it('groups stages by value stream chapter', () => {
    expect(valueStreamChapters(createDocument()).map((chapter) => chapter.title))
      .toEqual(['Inbound', 'Outbound']);
  });
});

describe('ValueStreamExporter', () => {
  it('returns capture slots for value stream plus each stage export', async () => {
    const exporter = new ValueStreamExporter(createDocument());

    expect(exporter.label).toBe('value-stream');
    expect(await exporter.captureAll()).toHaveLength(5);
  });
});
