import { describe, expect, it } from 'vitest';
import { buildNodeContent, NodeExporter } from './node-exporter';
import { BlmDocument, ProcessNode } from '../../document/document.model';

describe('buildNodeContent', () => {
  it('exports node details with roles, entity operations, forms, tasks, and linked services', () => {
    const node: ProcessNode = {
      uid: 'node-submit',
      name: '提交订单',
      role_uids: ['role-owner'],
      userSteps: [
        { uid: 'step-1', name: '录入订单', type: 'Click', note: '填写基础信息' },
        { uid: 'step-2', name: '复核订单', type: '人工', note: '复核提交内容' },
      ],
      entity_ops: [{ entity_uid: 'entity-order', action: '创建' }],
      forms: [{
        uid: 'form-order',
        name: '订单表单',
        entity_uid: 'entity-order',
        serviceUid: 'svc-submit',
        sections: [{
          uid: 'section-main',
          name: '基本信息',
          fields: [
            { name: '客户编号', type: 'Text', required: true, note: '会员编码' },
            { name: '客户状态', type: 'Readonly', required: false, note: '系统展示' },
          ],
        }],
      }, {
        uid: 'form-attach',
        name: '附件表单',
        sections: [{
          uid: 'section-attach',
          name: '附件信息',
          fields: [{ name: '附件名称', type: 'Select', required: false, note: '下拉选择' }],
        }],
      }],
      taskDefinitionUids: ['task-save'],
      serviceUids: ['svc-submit'],
      businessRules: [{ uid: 'rule-1', name: '订单校验', content: '<ul><li>客户编号不能为空</li><li>客户状态必须有效</li></ul>' }],
    };
    const document = {
      meta: { domain: '订单中心' },
      roles: [{ uid: 'role-owner', name: '订单专员', group: '业务' }],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-order', name: '订单办理', nodes: [node] }],
      entities: [{ uid: 'entity-order', name: '订单', fields: [] }],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [{
        uid: 'task-save',
        name: '保存订单',
        type: 'Command',
        note: '落库并返回订单号',
        parameters: {
          inputs: [{ name: '客户编号', type: 'String', required: true, note: '会员编码' }],
          outputs: [{ name: '订单号', type: 'String', required: false, note: '系统生成' }],
        },
      }],
      serviceGroups: [{ uid: 'group-order', name: '订单服务' }],
      services: [{
        uid: 'svc-submit',
        name: '提交订单接口',
        serviceGroupUid: 'group-order',
        method: 'POST',
        path: '/orders',
        desc: '创建订单',
        taskDefinitionUids: ['task-save'],
        nodeRefs: ['node-submit'],
        requestParams: [],
        responseParams: [],
      }],
      terms: [],
      dataDictionaries: [],
      rules: [],
    } satisfies BlmDocument;

    const content = buildNodeContent(document, node, { process: document.processes[0] });

    expect(content.title).toBe('节点：提交订单');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading5', text: '节点：提交订单' },
      { type: 'table', headers: ['字段', '内容'], rows: expect.arrayContaining([
        ['所属流程', '订单办理'],
      ]) },
      { type: 'heading6', text: '办理步骤' },
      { type: 'table', headers: ['序号', '步骤', '类型', '说明'], columnWidths: [6, 24, 14, 56], richTextColumns: [3], rows: [
        ['1', '录入订单', '点击', '填写基础信息'],
        ['2', '复核订单', '人工', '复核提交内容'],
      ] },
      { type: 'heading6', text: '办理材料' },
      { type: 'heading7', text: '表单1：订单表单' },
      { type: 'table', headers: ['分组', '字段', '类型', '必填', '说明'], columnWidths: [16, 20, 14, 10, 40], mergeSameColumns: [0], rows: [
        ['基本信息', '客户编号', '输入框', '必填', '会员编码'],
        ['基本信息', '客户状态', '只读展示', '非必填', '系统展示'],
      ] },
      { type: 'heading7', text: '表单2：附件表单' },
      { type: 'table', headers: ['分组', '字段', '类型', '必填', '说明'], columnWidths: [16, 20, 14, 10, 40], mergeSameColumns: [0], rows: [['附件信息', '附件名称', '下拉选择', '非必填', '下拉选择']] },
      { type: 'heading6', text: '办理规则' },
      { type: 'table', headers: ['规则名称', '规则内容'], richTextColumns: [1], rows: [['订单校验', '<ul><li>客户编号不能为空</li><li>客户状态必须有效</li></ul>']] },
    ]));
    expect(content.sections).not.toEqual(expect.arrayContaining([
      { type: 'heading3', text: '办理角色' },
    ]));
  });

  it('exposes a text-only NodeExporter for composition by process and stage exporters', async () => {
    const node: ProcessNode = { uid: 'node-review', name: '复核订单', role: '复核人' };
    const document = {
      meta: { domain: '订单中心' },
      roles: [{ uid: 'role-reviewer', name: '复核人' }],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-order', name: '订单办理', nodes: [node] }],
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

    const exporter = new NodeExporter(document, node, { process: document.processes[0] });

    expect(exporter.label).toBe('node-复核订单');
    expect(exporter.getContent().title).toBe('节点：复核订单');
    expect(await exporter.captureAll()).toEqual([]);
  });

  it('narrows the step number column without writing hierarchy prefixes into headings', () => {
    const node: ProcessNode = {
      uid: 'node-a',
      name: 'Node A',
      userSteps: [{ uid: 'step-a', name: 'Input', type: 'Click', note: 'Long description' }],
    } as any;
    const document = {
      meta: { domain: '' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-a', name: 'Process A', nodes: [node] }],
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

    const content = buildNodeContent(document, node, {
      process: document.processes[0],
      headingPrefix: '2.1.1.1.1',
    });
    const stepTable = content.sections.find((section) =>
      section.type === 'table' && section.headers?.join('|') === '序号|步骤|类型|说明'
    );

    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading5', text: '节点：Node A' },
      { type: 'heading6', text: '办理步骤' },
    ]));
    expect(stepTable?.columnWidths).toEqual([6, 24, 14, 56]);
  });
});
