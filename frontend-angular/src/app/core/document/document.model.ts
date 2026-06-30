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
  businessConstructs: BusinessConstruct[];
  taskDefinitions: TaskDefinition[];
  serviceGroups: ServiceGroup[];
  services: ApplicationService[];
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
  pos?: { x: number; y: number };
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
  serviceUids?: string[];
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
  kind: 'core' | 'common' | 'generic';
  entityUids: string[];
  taskDefinitionUids: string[];
  stageUids?: string[];
}

export interface BusinessConstruct {
  uid: string;
  id?: string;
  name: string;
  businessComponentUid?: string;
  businessComponentId?: string;
  componentUid?: string;
  componentId?: string;
}

export interface TaskDefinition {
  uid: string;
  id?: string;
  name: string;
  type?: TaskIntent;
  target?: string;
  address?: string;
  note?: string;
  constructUid?: string;
  businessComponentUid?: string;
  parameters?: TaskParameterBag;
  technicalHandover?: TechnicalHandover;
}

export interface TaskParameter {
  name: string;
  type: string;
  required?: boolean;
  note?: string;
  desc?: string;
}

export interface TaskParameterBag {
  inputs: TaskParameter[];
  outputs: TaskParameter[];
}

export type TaskIntent = 'Query' | 'Command' | 'Validate' | 'Calculate' | 'Notify' | 'StateChange' | 'Event' | 'Service' | 'Process';

export interface TechnicalHandover {
  runtimeKind?: string;
  target?: string;
  note?: string;
}

export interface ServiceGroup {
  uid: string;
  id?: string;
  name: string;
  desc?: string;
}

export interface ApplicationService {
  uid: string;
  id?: string;
  name: string;
  serviceGroupUid?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | string;
  path?: string;
  desc?: string;
  taskDefinitionUids?: string[];
  nodeRefs?: string[];
  requestParams?: ServiceParameter[];
  responseParams?: ServiceParameter[];
  orchestration?: ServiceOrchestration;
}

export interface ServiceParameter extends TaskParameter {
  children?: ServiceParameter[];
}

export interface ServiceOrchestration {
  variables: OrchestrationVariable[];
  steps: OrchestrationStep[];
  returnMapping: OrchestrationMapping[];
}

export interface OrchestrationVariable {
  name: string;
  source: string;
  type?: string;
  note?: string;
}

export interface OrchestrationStep {
  uid: string;
  name: string;
  stepAlias: string;
  taskDefinitionUid: string;
  inputMapping: OrchestrationMapping[];
  outputMapping: OrchestrationMapping[];
}

export interface OrchestrationMapping {
  source: string;
  target: string;
  note?: string;
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
