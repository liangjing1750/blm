import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../document/document.model';
import { buildStageContent, processesForStage, processesForStageContentOrder, StageExporter } from './stage-exporter';

function createDocument(): BlmDocument {
  return {
    meta: { domain: '仓储' },
    roles: [],
    stages: [{ uid: 'stage-in', name: '入库阶段' }],
    stageFlowRefs: [
      { uid: 'ref-2', stageUid: 'stage-in', processUid: 'process-review', order: 2 },
      { uid: 'ref-1', stageUid: 'stage-in', processUid: 'process-apply', order: 1 },
    ],
    processes: [
      {
        uid: 'process-apply',
        name: '入库预约',
        flowGroup: '预约组',
        nodes: [{ uid: 'node-submit', name: '提交预约', role: '客户' }],
      } as any,
      {
        uid: 'process-review',
        name: '仓单审核',
        flowGroup: '审核组',
        nodes: [{ uid: 'node-review', name: '审核仓单', role: '运营' }],
      } as any,
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

describe('buildStageContent', () => {
  it('exports stage, flow group, process and node headings with shifted image indexes', () => {
    const document = createDocument();
    const content = buildStageContent(document, document.stages[0]);

    expect(content.title).toBe('阶段：入库阶段');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading2', text: '阶段：入库阶段' },
      { type: 'image', text: '阶段视图：入库阶段', imageIndex: 0 },
      { type: 'heading3', text: '流程组：预约组' },
      { type: 'heading4', text: '流程：入库预约' },
      { type: 'image', text: '流程图：入库预约', imageIndex: 1 },
      { type: 'heading5', text: '节点：提交预约' },
      { type: 'heading3', text: '流程组：审核组' },
      { type: 'heading4', text: '流程：仓单审核' },
      { type: 'image', text: '流程图：仓单审核', imageIndex: 2 },
      { type: 'heading5', text: '节点：审核仓单' },
    ]));
  });
});

describe('processesForStage', () => {
  it('resolves processes by stage refs and keeps ref order', () => {
    const document = createDocument();
    expect(processesForStage(document, document.stages[0]).map((process) => process.name))
      .toEqual(['入库预约', '仓单审核']);
  });
});

describe('processesForStageContentOrder', () => {
  it('keeps process screenshot order aligned with grouped stage content order', () => {
    const document = createDocument();
    document.stageFlowRefs = [
      { uid: 'ref-online-1', stageUid: 'stage-in', processUid: 'process-online-1', order: 1 },
      { uid: 'ref-template', stageUid: 'stage-in', processUid: 'process-template', order: 2 },
      { uid: 'ref-online-2', stageUid: 'stage-in', processUid: 'process-online-2', order: 3 },
    ];
    document.processes = [
      { uid: 'process-online-1', name: '新增线上查库', flowGroup: '线上查库管理', nodes: [] } as any,
      { uid: 'process-template', name: '修改查库模板', flowGroup: '查库模板管理', nodes: [] } as any,
      { uid: 'process-online-2', name: '查看线上查库', flowGroup: '线上查库管理', nodes: [] } as any,
    ];

    expect(processesForStage(document, document.stages[0]).map((process) => process.name))
      .toEqual(['新增线上查库', '修改查库模板', '查看线上查库']);
    expect(processesForStageContentOrder(document, document.stages[0]).map((process) => process.name))
      .toEqual(['新增线上查库', '查看线上查库', '修改查库模板']);
  });
});

describe('StageExporter', () => {
  it('uses a stage file label and returns capture slots for stage plus processes', async () => {
    const document = createDocument();
    const exporter = new StageExporter(document, document.stages[0]);

    expect(exporter.label).toBe('stage-入库阶段');
    expect(await exporter.captureAll()).toHaveLength(3);
  });
});

describe('buildStageContent numbering', () => {
  it('prefixes stage, flow group, process and node headings', () => {
    const document = {
      meta: {},
      roles: [],
      stages: [{ uid: 'stage-a', name: 'Stage A' }],
      stageFlowRefs: [{ uid: 'ref-a', stageUid: 'stage-a', processUid: 'process-a', order: 1 }],
      processes: [{
        uid: 'process-a',
        name: 'Process A',
        flowGroup: 'Group A',
        nodes: [{ uid: 'node-a', name: 'Node A' }],
      } as any],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
      serviceGroups: [],
      services: [],
      terms: [],
      dataDictionaries: [],
      rules: [],
    } satisfies BlmDocument;

    const content = buildStageContent(document, document.stages[0], { headingPrefix: '2.1' });

    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading2', text: '2.1 阶段：Stage A' },
      { type: 'heading3', text: '2.1.1 流程组：Group A' },
      { type: 'heading4', text: '2.1.1.1 流程：Process A' },
      { type: 'heading5', text: '2.1.1.1.1 节点：Node A' },
    ]));
  });
});
