export type WorkbenchId =
  | 'panorama'
  | 'process'
  | 'component'
  | 'orchestration'
  | 'entity'
  | 'knowledge'
  | 'role';

export interface BlmDocument {
  meta: DocumentMeta;
  roles: Role[];
  stages: Stage[];
  stageFlowRefs: StageFlowRef[];
  processes: Process[];
  entities: Entity[];
  businessComponents: BusinessComponent[];
  taskDefinitions: TaskDefinition[];
  terms: KnowledgeTerm[];
  rules: BusinessRule[];
}

export interface DocumentMeta {
  domain: string;
  title?: string;
  author?: string;
  date?: string;
  space?: string;
  tags?: string | string[];
  version?: string;
  owner?: string;
}

export interface Role {
  uid: string;
  id?: string;
  name: string;
  group?: string;
  desc?: string;
}

export interface Stage {
  uid: string;
  id?: string;
  name: string;
  subDomain?: string;
  panoramaColumnUid?: string;
  panoramaLaneUid?: string;
}

export interface StageFlowRef {
  uid: string;
  id?: string;
  stageUid: string;
  processUid: string;
  order: number;
}

export interface Process {
  uid: string;
  id?: string;
  name: string;
  subDomain?: string;
  stageUid?: string;
  stageId?: string;
  nodes: ProcessNode[];
}

export interface ProcessNode {
  uid: string;
  id?: string;
  name: string;
  role_uids?: string[];
  role_ids?: string[];
  role?: string;
  entity_ops?: EntityOperation[];
  forms?: ProcessForm[];
}

export interface EntityOperation {
  entity_uid?: string;
  entity_id?: string;
  action?: string;
}

export interface ProcessForm {
  uid: string;
  name: string;
  entity_uid?: string;
  entity_id?: string;
}

export interface Entity {
  uid: string;
  id?: string;
  name: string;
  note?: string;
  fields: EntityField[];
  state_transitions?: StateTransition[];
}

export interface EntityField {
  uid?: string;
  name: string;
  type: string;
  note?: string;
  state_values?: string;
}

export interface StateTransition {
  uid: string;
  from: string;
  to: string;
  action?: string;
}

export interface BusinessComponent {
  uid: string;
  id?: string;
  name: string;
  kind: 'core' | 'common';
  entityUids: string[];
  taskDefinitionUids: string[];
  stageUids?: string[];
}

export interface TaskDefinition {
  uid: string;
  id?: string;
  name: string;
  target?: string;
  parameters?: TaskParameter[];
}

export interface TaskParameter {
  name: string;
  type: string;
  required?: boolean;
}

export interface KnowledgeTerm {
  uid: string;
  name: string;
  desc?: string;
}

export interface BusinessRule {
  uid: string;
  name: string;
  desc?: string;
  appliesTo?: string[];
}

export interface RoleUsage {
  role: Role;
  process: Process;
  node: ProcessNode;
}
