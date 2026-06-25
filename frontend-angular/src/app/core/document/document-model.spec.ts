import {
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
});
