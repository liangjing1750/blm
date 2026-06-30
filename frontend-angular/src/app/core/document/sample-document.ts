import { BlmDocument } from './document.model';

export const SAMPLE_DOCUMENT: BlmDocument = {
  meta: {
    domain: '业务语言建模',
    version: 'v3',
    owner: '业务负责人',
  },
  roles: [
    { uid: 'role-owner', id: 'R1', name: '总负责人', group: '治理角色' },
    { uid: 'role-pm', id: 'R2', name: '产品经理', group: '业务角色' },
    { uid: 'role-tech', id: 'R3', name: '技术经理', group: '技术角色' },
    { uid: 'role-fe', id: 'R4', name: '前端研发', group: '技术角色' },
    { uid: 'role-be', id: 'R5', name: '后端研发', group: '技术角色' },
  ],
  stages: [
    { uid: 'stage-entry', id: 'S1', name: '入库登记', subDomain: '仓单管理' },
    { uid: 'stage-supervision', id: 'S2', name: '在库监管', subDomain: '风险监管' },
    { uid: 'stage-delivery', id: 'S3', name: '出库交割', subDomain: '交割办理' },
  ],
  stageFlowRefs: [
    { uid: 'ref-entry', stageUid: 'stage-entry', processUid: 'process-entry', order: 1 },
    { uid: 'ref-supervision', stageUid: 'stage-supervision', processUid: 'process-supervision', order: 1 },
    { uid: 'ref-delivery', stageUid: 'stage-delivery', processUid: 'process-delivery', order: 1 },
  ],
  processes: [
    {
      uid: 'process-entry',
      id: 'P1',
      name: '仓单入库登记',
      subDomain: '仓单管理',
      nodes: [
        { uid: 'node-entry-apply', id: 'T1', name: '提交入库申请', role_uids: ['role-pm'], entity_ops: [{ entity_uid: 'entity-receipt' }] },
        { uid: 'node-entry-review', id: 'T2', name: '审核入库资料', role_uids: ['role-be'], entity_ops: [{ entity_uid: 'entity-receipt' }] },
      ],
    },
    {
      uid: 'process-supervision',
      id: 'P2',
      name: '在库风险监管',
      subDomain: '风险监管',
      nodes: [
        { uid: 'node-risk-check', id: 'T3', name: '检查库存状态', role_uids: ['role-tech'], entity_ops: [{ entity_uid: 'entity-inventory' }] },
      ],
    },
    {
      uid: 'process-delivery',
      id: 'P3',
      name: '出库交割办理',
      subDomain: '交割办理',
      nodes: [
        { uid: 'node-delivery-confirm', id: 'T4', name: '确认交割指令', role_uids: ['role-fe'], entity_ops: [{ entity_uid: 'entity-delivery' }] },
      ],
    },
  ],
  entities: [
    { uid: 'entity-receipt', id: 'E1', name: '仓单', fields: [{ name: '状态', type: 'enum', state_values: '草稿/已审核/已入库' }] },
    { uid: 'entity-inventory', id: 'E2', name: '库存记录', fields: [{ name: '监管状态', type: 'enum', state_values: '正常/预警/冻结' }] },
    { uid: 'entity-delivery', id: 'E3', name: '交割指令', fields: [{ name: '办理状态', type: 'enum', state_values: '待确认/已确认/已完成' }] },
  ],
  businessComponents: [
    { uid: 'component-receipt', id: 'C1', name: '仓单管理组件', kind: 'core', entityUids: ['entity-receipt'], taskDefinitionUids: ['task-entry'] },
    { uid: 'component-risk', id: 'C2', name: '风险监管组件', kind: 'core', entityUids: ['entity-inventory'], taskDefinitionUids: ['task-risk'] },
    { uid: 'component-platform', id: 'C3', name: '用户与权限组件', kind: 'common', entityUids: [], taskDefinitionUids: [] },
  ],
  businessConstructs: [],
  taskDefinitions: [
    { uid: 'task-entry', id: 'TD1', name: '入库登记任务', target: 'receipt.register' },
    { uid: 'task-risk', id: 'TD2', name: '风险检查任务', target: 'risk.check' },
  ],
  serviceGroups: [],
  services: [],
  terms: [
    { uid: 'term-receipt', name: '仓单', desc: '用于表达货物入库、监管和交割状态的核心业务凭证。' },
  ],
  rules: [
    { uid: 'rule-entry', name: '入库资料完整性规则', desc: '提交入库申请前必须具备客户、仓库、品种和数量信息。' },
  ],
};
