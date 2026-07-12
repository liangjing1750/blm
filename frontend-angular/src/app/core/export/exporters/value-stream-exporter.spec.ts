import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../document/document.model';
import { buildValueStreamContent, stagesForValueStream, ValueStreamExporter } from './value-stream-exporter';

function createDocument(): BlmDocument {
  return {
    meta: { domain: '仓储' },
    roles: [],
    stages: [
      { uid: 'stage-out', name: '出库阶段', panoramaColumnUid: 'col-2', panoramaLaneUid: 'lane-1', panoramaSlot: { row: 0, col: 0 } } as any,
      { uid: 'stage-in', name: '入库阶段', panoramaColumnUid: 'col-1', panoramaLaneUid: 'lane-1', panoramaSlot: { row: 0, col: 0 } } as any,
      { uid: 'stage-after', name: '后处理阶段', panoramaColumnUid: 'col-1', panoramaLaneUid: 'lane-2', panoramaSlot: { row: 0, col: 0 } } as any,
    ],
    stageFlowRefs: [
      { uid: 'ref-1', stageUid: 'stage-in', processUid: 'process-apply', order: 1 },
      { uid: 'ref-2', stageUid: 'stage-out', processUid: 'process-ship', order: 1 },
    ],
    processes: [
      { uid: 'process-apply', name: '入库预约', flowGroup: '预约组', nodes: [{ uid: 'node-submit', name: '提交预约' }] } as any,
      { uid: 'process-ship', name: '出库发货', flowGroup: '发货组', nodes: [{ uid: 'node-ship', name: '确认发货' }] } as any,
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
  };
}

describe('buildValueStreamContent', () => {
  it('exports heading1 first and nests stages, groups, processes and nodes with shifted images', () => {
    const content = buildValueStreamContent(createDocument());

    expect(content.title).toBe('价值流环节');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading1', text: '价值流环节' },
      { type: 'image', text: '价值流视图', imageIndex: 0 },
      { type: 'heading2', text: '阶段：入库阶段' },
      { type: 'image', text: '阶段视图：入库阶段', imageIndex: 1 },
      { type: 'heading3', text: '流程组：预约组' },
      { type: 'heading4', text: '流程：入库预约' },
      { type: 'image', text: '流程图：入库预约', imageIndex: 2 },
      { type: 'heading5', text: '节点：提交预约' },
      { type: 'heading2', text: '阶段：出库阶段' },
      { type: 'image', text: '阶段视图：出库阶段', imageIndex: 3 },
      { type: 'image', text: '流程图：出库发货', imageIndex: 4 },
    ]));
  });
});

describe('stagesForValueStream', () => {
  it('keeps the value stream matrix order', () => {
    expect(stagesForValueStream(createDocument()).map((stage) => stage.name))
      .toEqual(['入库阶段', '出库阶段', '后处理阶段']);
  });
});

describe('ValueStreamExporter', () => {
  it('returns capture slots for value stream plus each stage export', async () => {
    const exporter = new ValueStreamExporter(createDocument());

    expect(exporter.label).toBe('value-stream');
    expect(await exporter.captureAll()).toHaveLength(6);
  });
});
