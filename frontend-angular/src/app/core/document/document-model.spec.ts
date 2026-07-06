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

  it('normalizes malformed application service array fields', () => {
    const document = normalizeDocument({
      meta: { domain: 'compat' },
      taskDefinitions: [{ uid: 'task-a', name: 'Task A' }],
      services: [
        {
          uid: 'service-a',
          name: 'Service A',
          taskDefinitionUids: 'bad',
          nodeRefs: 'bad',
          requestParams: 'bad',
          responseParams: 'bad',
          orchestration: {
            variables: 'bad',
            steps: [{ uid: 'step-a', name: 'Step A', stepAlias: 'stepA', taskDefinitionUid: 'task-a', inputMapping: 'bad', outputMapping: 'bad' }],
            returnMapping: 'bad',
          },
        } as any,
      ],
    });

    expect(document.services[0].taskDefinitionUids).toEqual(['task-a']);
    expect(document.services[0].nodeRefs).toEqual([]);
    expect(document.services[0].requestParams).toEqual([]);
    expect(document.services[0].responseParams).toEqual([]);
    expect(document.services[0].orchestration).toEqual({
      variables: [],
      steps: [{
        uid: 'step-a',
        name: 'Step A',
        stepAlias: 'stepA',
        taskDefinitionUid: 'task-a',
        inputMapping: [],
        outputMapping: [],
      }],
      returnMapping: [],
    });
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

  it('migrates legacy node task orchestration into node-scoped application interfaces', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      processes: [
        {
          uid: 'process-inbound',
          name: '入库流程',
          nodes: [
            {
              uid: 'node-submit',
              name: '提交入库预约',
              taskDefinitionUids: ['task-check-warehouse', 'task-save-reservation'],
            } as any,
          ],
        },
      ],
      taskDefinitions: [
        { uid: 'task-check-warehouse', name: '校验仓库状态' },
        { uid: 'task-save-reservation', name: '保存入库预约' },
      ],
    });

    expect(document.serviceGroups).toEqual([
      { uid: 'service-group-process-inbound', name: '入库流程应用服务', desc: '由流程节点任务编排迁移生成' },
    ]);
    expect(document.services.map((service) => ({
      uid: service.uid,
      name: service.name,
      serviceGroupUid: service.serviceGroupUid,
      nodeRefs: service.nodeRefs,
      taskDefinitionUids: service.taskDefinitionUids,
      steps: service.orchestration?.steps.map((step) => step.taskDefinitionUid),
    }))).toEqual([
      {
        uid: 'service-node-submit',
        name: '提交入库预约应用接口',
        serviceGroupUid: 'service-group-process-inbound',
        nodeRefs: ['node-submit'],
        taskDefinitionUids: ['task-check-warehouse', 'task-save-reservation'],
        steps: ['task-check-warehouse', 'task-save-reservation'],
      },
    ]);
    expect(document.processes[0].nodes[0].serviceUids).toEqual(['service-node-submit']);
  });

  it('migrates legacy node orchestrationTasks into node-scoped application interfaces', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      processes: [
        {
          uid: 'process-stock',
          name: '库存流程',
          nodes: [
            {
              uid: 'node-check',
              name: '检查库存',
              orchestrationTasks: [{ taskDefinitionUid: 'task-check-stock' }],
            } as any,
            { uid: 'node-empty', name: '无编排节点' } as any,
          ],
        },
      ],
      taskDefinitions: [{ uid: 'task-check-stock', name: '检查库存任务' }],
    });

    expect(document.serviceGroups.map((group) => group.uid)).toEqual(['service-group-process-stock']);
    expect(document.services.map((service) => ({
      uid: service.uid,
      nodeRefs: service.nodeRefs,
      taskDefinitionUids: service.taskDefinitionUids,
    }))).toEqual([
      {
        uid: 'service-node-check',
        nodeRefs: ['node-check'],
        taskDefinitionUids: ['task-check-stock'],
      },
    ]);
    expect(document.processes[0].nodes[0].serviceUids).toEqual(['service-node-check']);
    expect(document.processes[0].nodes[1].serviceUids).toBeUndefined();
  });


  it('keeps structured task parameters on task definitions', () => {
    const document = normalizeDocument({
      meta: { domain: '测试模型' },
      taskDefinitions: [
        {
          uid: 'task-save-reservation',
          name: '保存入库预约',
          parameters: {
            inputs: [{
              name: '仓库列表',
              type: 'list',
              required: true,
              code: 'warehouses',
              note: '仓库集合',
              children: [{ name: '仓库ID', type: 'String', required: true, code: 'warehouseId', note: '仓库标识' }],
            }],
            outputs: [{ name: 'reservationId', type: 'String', note: '预约标识' }],
          },
        },
      ],
    });

    expect(document.taskDefinitions[0].parameters).toEqual({
      inputs: [{
        name: '仓库列表',
        type: 'list',
        required: true,
        code: 'warehouses',
        description: 'warehouses',
        note: '仓库集合',
        children: [{ name: '仓库ID', type: 'String', required: true, code: 'warehouseId', description: 'warehouseId', note: '仓库标识' }],
      }],
      outputs: [{ name: 'reservationId', type: 'String', required: false, note: '预约标识' }],
    });
  });
});
