import { ValueDomainColumn, ValueDomainLane, ValueDomainCell } from './value-domain-model';

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
  dataDictionaries: DataDictionary[];
  rules: BusinessRule[];
  /** 价值流与业务域矩阵（全景视图使用） */
  panorama?: {
    columns?: ValueDomainColumn[];
    lanes?: ValueDomainLane[];
    cells?: ValueDomainCell[];
  };
  stageLinks?: Array<{ fromStageUid?: string; toStageUid?: string }>;
  stageFlowLinks?: Array<{ stageUid?: string; fromRefUid?: string; toRefUid?: string }>;
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
  taskDefinitionUids?: string[];
}

export interface EntityOperation {
  entity_uid?: string;
  entity_id?: string;
  action?: string;
}

export interface ProcessForm {
  uid: string;
  name: string;
  serviceUid?: string;
  serviceId?: string;
  serviceName?: string;
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
  dictionaryUid?: string;
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
}

export interface TaskParameter {
  uid?: string;
  name: string;
  type: string;
  required?: boolean;
  code?: string;
  description?: string;
  example?: string;
  note?: string;
  desc?: string;
  dictionaryUid?: string;
  children?: TaskParameter[];
}

export interface TaskParameterBag {
  inputs: TaskParameter[];
  outputs: TaskParameter[];
}

export type TaskIntent = 'Query' | 'Command' | 'Validate' | 'Calculate' | 'Notify' | 'StateChange' | 'Event' | 'Service' | 'Process';

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
  actor?: string;
  kind?: string;
  responseKind?: string;
  rawRequest?: string;
  rawResponse?: string;
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
  parentUid?: string;
  slot?: 'then' | 'else' | 'body';
  order?: number;
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

export interface DataDictionary {
  uid: string;
  code: string;
  name: string;
  desc?: string;
  entries: DataDictionaryEntry[];
}

export interface DataDictionaryEntry {
  uid: string;
  code: string;
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
