import {
  getServiceOrchestrationSteps,
  findProcessByIdentity,
  getComponentSupportedStages,
  getRoleUsage,
  getStageProcesses,
  normalizeStageFlowRefs,
  normalizeDocument,
} from './document-model';
import { BlmDocument } from './document.model';

describe('document model algorithms', () => {
  it('normalizes uid-only stage flow refs and removes dangling references', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      stages: [{ uid: 'stage-a', name: '入库' }],
      processes: [{ uid: 'process-a', name: '入库登记', nodes: [] }],
      stageFlowRefs: [
        { uid: 'ref-a', stageUid: 'stage-a', processUid: 'process-a', order: 2 },
        { uid: 'ref-duplicate', stageUid: 'stage-a', processUid: 'process-a', order: 1 },
        { uid: 'ref-dangling', stageUid: 'missing', processUid: 'process-a', order: 3 },
      ],
    });

    expect(document.stageFlowRefs).toEqual([
      { uid: 'ref-a', stageUid: 'stage-a', processUid: 'process-a', order: 2, pos: { x: 0, y: 0 } },
    ]);
    expect(getStageProcesses(document, 'stage-a').map((process) => process.uid)).toEqual(['process-a']);
    expect(normalizeStageFlowRefs(document)).toEqual(document.stageFlowRefs);
  });

  it('creates stage flow refs from legacy process stage fields', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      stages: [{ uid: 'stage-a', id: 'S1', name: '入库' }],
      processes: [{ uid: 'process-a', name: '入库登记', stageId: 'S1', nodes: [] }],
    });

    expect(document.stageFlowRefs).toEqual([
      {
        uid: 'stage-flow-ref-stage-a-process-a',
        stageUid: 'stage-a',
        processUid: 'process-a',
        order: 1,
        pos: { x: 0, y: 0 },
      },
    ]);
  });

  it('finds processes by uid or legacy id', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      processes: [{ uid: 'process-a', id: 'P1', name: '入库登记', nodes: [] }],
    });

    expect(findProcessByIdentity(document, 'process-a')?.name).toBe('入库登记');
    expect(findProcessByIdentity(document, 'P1')?.uid).toBe('process-a');
  });

  it('collects role usage from uid, id, and name references', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      roles: [{ uid: 'role-a', id: 'R1', name: '业务员' }],
      processes: [
        {
          uid: 'process-a',
          name: '入库登记',
          nodes: [
            { uid: 'node-a', name: '登记', role_uids: ['role-a'] },
            { uid: 'node-b', name: '审核', role_ids: ['R1'] },
            { uid: 'node-c', name: '确认', role: '业务员' },
          ],
        },
      ],
    });

    expect(getRoleUsage(document, 'role-a').map((usage) => usage.node.name)).toEqual(['登记', '审核', '确认']);
  });

  it('derives component supported stages from entity usage in process nodes', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      stages: [{ uid: 'stage-a', name: '入库' }],
      processes: [
        {
          uid: 'process-a',
          name: '入库登记',
          nodes: [{ uid: 'node-a', name: '登记', entity_ops: [{ entity_uid: 'entity-a' }] }],
        },
      ],
      stageFlowRefs: [{ uid: 'ref-a', stageUid: 'stage-a', processUid: 'process-a', order: 1 }],
      entities: [{ uid: 'entity-a', name: '仓单', fields: [] }],
      businessComponents: [{ uid: 'component-a', name: '仓储组件', kind: 'core', entityUids: ['entity-a'], taskDefinitionUids: [] }],
    } satisfies Partial<BlmDocument>);

    expect(getComponentSupportedStages(document, document.businessComponents[0]).map((stage) => stage.name)).toEqual(['入库']);
  });

  it('normalizes application services with empty orchestration state', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      services: [{ uid: 'service-submit', name: '提交入库预约' }],
    });

    expect(document.services).toEqual([
      {
        uid: 'service-submit',
        name: '提交入库预约',
        method: 'POST',
        serviceGroupUid: '',
        path: '',
        desc: '',
        taskDefinitionUids: [],
        nodeRefs: [],
        requestParams: [],
        responseParams: [],
        orchestration: { variables: [], steps: [], returnMapping: [] },
      },
    ]);
    expect(getServiceOrchestrationSteps(document, document.services[0])).toEqual([]);
  });

  it('normalizes service groups and keeps nested interface parameters', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      serviceGroups: [{ uid: 'group-inbound', name: '入库预约服务', desc: '入库预约相关接口' }],
      services: [
        {
          uid: 'interface-submit',
          name: '提交入库预约',
          serviceGroupUid: 'group-inbound',
          requestParams: [
            {
              name: 'reservation',
              type: 'Object',
              required: true,
              note: '预约信息',
              children: [
                { name: 'warehouseUid', type: 'String', required: true, note: '仓库 UID' },
                {
                  name: 'items',
                  type: 'Array',
                  required: true,
                  note: '预约明细',
                  children: [{ name: 'productCode', type: 'String', required: true, note: '品种代码' }],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as Partial<BlmDocument>);

    expect((document as any).serviceGroups).toEqual([
      { uid: 'group-inbound', name: '入库预约服务', desc: '入库预约相关接口' },
    ]);
    expect((document.services[0] as any).serviceGroupUid).toBe('group-inbound');
    expect(document.services[0].requestParams).toEqual([
      {
        name: 'reservation',
        type: 'Object',
        required: true,
        note: '预约信息',
        children: [
          { name: 'warehouseUid', type: 'String', required: true, note: '仓库 UID' },
          {
            name: 'items',
            type: 'Array',
            required: true,
            note: '预约明细',
            children: [{ name: 'productCode', type: 'String', required: true, note: '品种代码' }],
          },
        ],
      },
    ]);
  });

  it('converts legacy service taskDefinitionUids into compatible orchestration steps', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      taskDefinitions: [
        { uid: 'task-check-warehouse', name: '校验仓库状态' },
        { uid: 'task-save-reservation', name: '保存入库预约' },
      ],
      services: [
        {
          uid: 'service-submit',
          name: '提交入库预约',
          taskDefinitionUids: ['task-check-warehouse', 'task-save-reservation'],
        },
      ],
    });

    expect(document.services[0].taskDefinitionUids).toEqual(['task-check-warehouse', 'task-save-reservation']);
    expect(getServiceOrchestrationSteps(document, document.services[0]).map((step) => ({
      uid: step.uid,
      stepAlias: step.stepAlias,
      taskDefinitionUid: step.taskDefinitionUid,
      name: step.name,
    }))).toEqual([
      {
        uid: 'step-service-submit-1-task-check-warehouse',
        stepAlias: 'step1',
        taskDefinitionUid: 'task-check-warehouse',
        name: '校验仓库状态',
      },
      {
        uid: 'step-service-submit-2-task-save-reservation',
        stepAlias: 'step2',
        taskDefinitionUid: 'task-save-reservation',
        name: '保存入库预约',
      },
    ]);
  });

  it('keeps structured task parameters on task definitions', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      taskDefinitions: [
        {
          uid: 'task-save-reservation',
          name: '保存入库预约',
          parameters: {
            inputs: [{ name: 'warehouseId', type: 'String', required: true, note: '仓库标识' }],
            outputs: [{ name: 'reservationId', type: 'String', note: '预约标识' }],
          },
        },
      ],
    });

    expect(document.taskDefinitions[0].parameters).toEqual({
      inputs: [{ name: 'warehouseId', type: 'String', required: true, note: '仓库标识' }],
      outputs: [{ name: 'reservationId', type: 'String', required: false, note: '预约标识' }],
    });
  });
});
