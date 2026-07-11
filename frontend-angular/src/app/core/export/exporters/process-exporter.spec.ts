import { describe, expect, it } from 'vitest';
import { BlmDocument, ProcessNode } from '../../document/document.model';
import { buildProcessContent, ProcessExporter } from './process-exporter';

describe('buildProcessContent', () => {
  it('exports a process heading, flow image, and all node sections by reusing node content', () => {
    const nodeA: ProcessNode = { uid: 'node-a', name: '提交申请', role: '申请人' };
    const nodeB: ProcessNode = { uid: 'node-b', name: '审批申请', role: '审批人' };
    const document = {
      meta: { domain: '订单中心' },
      roles: [
        { uid: 'role-a', name: '申请人' },
        { uid: 'role-b', name: '审批人' },
      ],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-apply', name: '申请流程', trigger: '用户提交', outcome: '完成审批', nodes: [nodeA, nodeB] }],
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

    const content = buildProcessContent(document, document.processes[0]);

    expect(content.title).toBe('流程：申请流程');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading4', text: '流程：申请流程' },
      { type: 'table', headers: ['字段', '内容'], rows: [
        ['触发', '用户提交'],
        ['预期', '完成审批'],
      ] },
      { type: 'image', text: '流程图：申请流程', imageIndex: 0 },
      { type: 'heading5', text: '节点：提交申请' },
      { type: 'heading5', text: '节点：审批申请' },
    ]));
  });

  it('exposes a ProcessExporter label based on the process name', async () => {
    const document = {
      meta: {},
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-apply', name: '申请流程', nodes: [] }],
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

    const exporter = new ProcessExporter(document, document.processes[0]);

    expect(exporter.label).toBe('process-申请流程');
    expect(exporter.getContent().title).toBe('流程：申请流程');
    expect(await exporter.captureAll()).toHaveLength(1);
  });
});
