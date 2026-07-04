import {
  ApplicationService,
  BlmDocument,
  BusinessComponent,
  BusinessConstruct,
  OrchestrationStep,
  Process,
  Role,
  RoleUsage,
  ServiceGroup,
  ServiceOrchestration,
  ServiceParameter,
  Stage,
  StageFlowRef,
  TaskDefinition,
  TaskParameter,
  TaskParameterBag,
} from './document.model';

const EMPTY_ARRAY_FIELDS = [
  'roles',
  'stages',
  'stageFlowRefs',
  'processes',
  'entities',
  'businessComponents',
  'businessConstructs',
  'taskDefinitions',
  'serviceGroups',
  'services',
  'terms',
  'rules',
] as const;

export function identityOf(item: { uid?: string; id?: string } | null | undefined): string {
  return String(item?.uid || item?.id || '').trim();
}

export function findProcessByIdentity(document: BlmDocument, processId: string): Process | undefined {
  const target = String(processId || '').trim();
  if (!target) return undefined;
  return document.processes.find((process) => process.uid === target || process.id === target);
}

export function findStageByIdentity(document: BlmDocument, stageId: string): Stage | undefined {
  const target = String(stageId || '').trim();
  if (!target) return undefined;
  return document.stages.find((stage) => stage.uid === target || stage.id === target);
}

export function normalizeDocument(raw: Partial<BlmDocument> | null | undefined): BlmDocument {
  const document = { ...(raw || {}) } as BlmDocument;
  document.meta = {
    ...(document.meta || {}),
    domain: String(document.meta?.domain || document.meta?.title || '未命名模型').trim(),
    title: document.meta?.title,
    author: document.meta?.author,
    date: document.meta?.date,
    space: document.meta?.space,
    tags: document.meta?.tags,
    version: document.meta?.version,
    owner: document.meta?.owner,
  };

  for (const field of EMPTY_ARRAY_FIELDS) {
    if (!Array.isArray(document[field])) {
      document[field] = [] as never;
    }
  }

  document.roles = document.roles.map((role, index) => ({
    ...role,
    uid: identityOf(role) || `role-${index + 1}`,
    name: String(role.name || `角色${index + 1}`).trim(),
  }));
  document.stages = document.stages.map((stage, index) => ({
    ...stage,
    uid: identityOf(stage) || `stage-${index + 1}`,
    name: String(stage.name || `阶段${index + 1}`).trim(),
  }));
  document.processes = document.processes.map((process, index) => ({
    ...process,
    uid: identityOf(process) || `process-${index + 1}`,
    name: String(process.name || `流程${index + 1}`).trim(),
    nodes: Array.isArray(process.nodes) ? process.nodes : [],
  }));
  document.entities = document.entities.map((entity, index) => ({
    ...entity,
    uid: identityOf(entity) || `entity-${index + 1}`,
    name: String(entity.name || `实体${index + 1}`).trim(),
    fields: Array.isArray(entity.fields) ? entity.fields : [],
  }));
  document.businessComponents = document.businessComponents.map((component, index) => normalizeComponent(component, index));
  document.businessConstructs = document.businessConstructs.map((construct, index) => normalizeConstruct(construct, index));
  document.taskDefinitions = document.taskDefinitions.map((taskDefinition, index) => normalizeTaskDefinition(taskDefinition, index));
  migrateLegacyNodeTaskOrchestration(document);
  document.serviceGroups = document.serviceGroups.map((group, index) => normalizeServiceGroup(group, index));
  document.services = document.services.map((service, index) => normalizeService(document, service, index));
  document.terms = document.terms.map((term, index) => ({
    ...term,
    uid: String(term.uid || '').trim() || `term-${index + 1}`,
    name: String(term.name || `术语${index + 1}`).trim(),
  }));
  document.rules = document.rules.map((rule, index) => ({
    ...rule,
    uid: String(rule.uid || '').trim() || `rule-${index + 1}`,
    name: String(rule.name || `规则${index + 1}`).trim(),
  }));
  document.stageFlowRefs = normalizeStageFlowRefs(document);
  return document;
}

function normalizeServiceGroup(group: ServiceGroup, index: number): ServiceGroup {
  return {
    ...group,
    uid: identityOf(group) || `service-group-${index + 1}`,
    name: String(group.name || `服务${index + 1}`).trim(),
    desc: String(group.desc || '').trim(),
  };
}

function migrateLegacyNodeTaskOrchestration(document: BlmDocument): void {
  const serviceGroups = document.serviceGroups as ServiceGroup[];
  const services = document.services as ApplicationService[];
  const serviceByNode = new Map<string, ApplicationService>();
  for (const service of services) {
    for (const nodeRef of service.nodeRefs || []) {
      if (nodeRef) serviceByNode.set(String(nodeRef), service);
    }
  }

  for (const process of document.processes) {
    const processUid = identityOf(process);
    const processName = String(process.name || processUid || '流程').trim();
    let groupUid = `service-group-${safeIdentitySegment(processUid || processName)}`;
    for (const node of process.nodes || []) {
      const nodeUid = identityOf(node);
      const taskDefinitionUids = legacyNodeTaskDefinitionUids(node);
      if (!nodeUid || !taskDefinitionUids.length) continue;
      node.serviceUids ||= [];
      if (serviceByNode.has(nodeUid)) {
        const existing = serviceByNode.get(nodeUid)!;
        if (!node.serviceUids.includes(existing.uid)) node.serviceUids.push(existing.uid);
        continue;
      }

      if (!serviceGroups.some((group) => identityOf(group) === groupUid)) {
        serviceGroups.push({
          uid: groupUid,
          name: `${processName}应用服务`,
          desc: '由流程节点任务编排迁移生成',
        });
      }

      const serviceUid = uniqueServiceUid(services, `service-${safeIdentitySegment(nodeUid)}`);
      const nodeName = String(node.name || nodeUid).trim();
      const service: ApplicationService = {
        uid: serviceUid,
        name: `${nodeName}应用接口`,
        serviceGroupUid: groupUid,
        method: 'POST',
        path: '',
        desc: '由流程节点任务编排迁移生成',
        taskDefinitionUids,
        nodeRefs: [nodeUid],
        requestParams: [],
        responseParams: [],
        orchestration: {
          variables: [],
          steps: taskDefinitionUids.map((taskDefinitionUid, index) => legacyTaskStep(document, serviceUid, taskDefinitionUid, index)),
          returnMapping: [],
        },
      };
      services.push(service);
      serviceByNode.set(nodeUid, service);
      if (!node.serviceUids.includes(serviceUid)) node.serviceUids.push(serviceUid);
    }
  }
}

function legacyNodeTaskDefinitionUids(node: Process['nodes'][number]): string[] {
  const nodeLike = node as Process['nodes'][number] & {
    tasks?: Array<string | { taskDefinitionUid?: string; taskDefUid?: string; uid?: string; id?: string }>;
    taskDefinitions?: Array<string | { uid?: string; id?: string }>;
  };
  return uniqueStrings([
    ...(node.taskDefinitionUids || []),
    ...(nodeLike.tasks || []).map((task) => typeof task === 'string' ? task : task.taskDefinitionUid || task.taskDefUid || task.uid || task.id || ''),
    ...(nodeLike.taskDefinitions || []).map((task) => typeof task === 'string' ? task : task.uid || task.id || ''),
  ]);
}

function safeIdentitySegment(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function uniqueServiceUid(services: ApplicationService[], baseUid: string): string {
  const used = new Set(services.map((service) => identityOf(service)));
  if (!used.has(baseUid)) return baseUid;
  let index = 2;
  while (used.has(`${baseUid}-${index}`)) index += 1;
  return `${baseUid}-${index}`;
}

function normalizeComponent(component: BusinessComponent, index: number): BusinessComponent {
  const legacyEntityUids = (component as unknown as { entityIds?: string[]; entity_ids?: string[] }).entityIds
    || (component as unknown as { entity_ids?: string[] }).entity_ids
    || [];
  const legacyTaskUids = (component as unknown as { taskDefinitionIds?: string[]; task_definition_ids?: string[] }).taskDefinitionIds
    || (component as unknown as { task_definition_ids?: string[] }).task_definition_ids
    || [];
  return {
    ...component,
    uid: identityOf(component) || `component-${index + 1}`,
    name: String(component.name || `业务组件${index + 1}`).trim(),
    kind: component.kind === 'common' || component.kind === 'generic' ? component.kind : 'core',
    entityUids: uniqueStrings(component.entityUids || legacyEntityUids),
    taskDefinitionUids: uniqueStrings(component.taskDefinitionUids || legacyTaskUids),
    stageUids: uniqueStrings(component.stageUids || []),
  };
}

function normalizeConstruct(construct: BusinessConstruct, index: number): BusinessConstruct {
  return {
    ...construct,
    uid: identityOf(construct) || `construct-${index + 1}`,
    name: String(construct.name || `业务构件${index + 1}`).trim(),
    businessComponentUid: String(construct.businessComponentUid || '').trim(),
  };
}

function normalizeTaskDefinition(taskDefinition: TaskDefinition, index: number): TaskDefinition {
  return {
    ...taskDefinition,
    uid: identityOf(taskDefinition) || `task-definition-${index + 1}`,
    name: String(taskDefinition.name || `任务定义${index + 1}`).trim(),
    parameters: normalizeTaskParameters(taskDefinition.parameters),
  };
}

function normalizeTaskParameters(parameters: TaskDefinition['parameters'] | TaskParameter[] | null | undefined): TaskParameterBag {
  if (Array.isArray(parameters)) {
    return { inputs: normalizeParameters(parameters), outputs: [] };
  }
  return {
    inputs: normalizeParameters(parameters?.inputs || []),
    outputs: normalizeParameters(parameters?.outputs || []),
  };
}

function normalizeParameters(parameters: TaskParameter[] | null | undefined): TaskParameter[] {
  return (parameters || [])
    .map((parameter) => ({
      ...parameter,
      name: String(parameter.name || '').trim(),
      type: String(parameter.type || 'String').trim(),
      required: Boolean(parameter.required),
      note: parameter.note ?? parameter.desc,
    }))
    .filter((parameter) => parameter.name);
}

function normalizeServiceParameters(parameters: ServiceParameter[] | null | undefined): ServiceParameter[] {
  return (parameters || [])
    .map((parameter) => {
      const children = normalizeServiceParameters(parameter.children || []);
      return {
        ...parameter,
        name: String(parameter.name || '').trim(),
        type: String(parameter.type || 'String').trim(),
        required: Boolean(parameter.required),
        note: parameter.note ?? parameter.desc ?? '',
        ...(children.length ? { children } : {}),
      };
    })
    .filter((parameter) => parameter.name);
}

function normalizeService(document: BlmDocument, service: ApplicationService, index: number): ApplicationService {
  const uid = identityOf(service) || `service-${index + 1}`;
  const legacyInputs = (service as unknown as { inputs?: ServiceParameter[] }).inputs || [];
  const legacyOutputs = (service as unknown as { outputs?: ServiceParameter[] }).outputs || [];
  const taskDefinitionUids = uniqueStrings(service.taskDefinitionUids || legacyStepTaskUids(service));
  const orchestration = normalizeServiceOrchestration(document, uid, service);
  const normalizedTaskDefinitionUids = taskDefinitionUids.length
    ? taskDefinitionUids
    : uniqueStrings(orchestration.steps.map((step) => step.taskDefinitionUid));
  const normalized: ApplicationService = {
    ...service,
    uid,
    name: String(service.name || `应用服务${index + 1}`).trim(),
    method: String(service.method || 'POST').trim() || 'POST',
    serviceGroupUid: String(service.serviceGroupUid || '').trim(),
    path: String(service.path || '').trim(),
    desc: String(service.desc || '').trim(),
    taskDefinitionUids: normalizedTaskDefinitionUids,
    nodeRefs: uniqueStrings(service.nodeRefs || []),
    requestParams: normalizeServiceParameters(service.requestParams || legacyInputs),
    responseParams: normalizeServiceParameters(service.responseParams || legacyOutputs),
    orchestration,
  };
  return normalized;
}

function normalizeServiceOrchestration(
  document: BlmDocument,
  serviceUid: string,
  service: ApplicationService,
): ServiceOrchestration {
  const existing = service.orchestration;
  const legacySteps = legacyStepTaskUids(service).map((taskDefinitionUid, index) => legacyTaskStep(document, serviceUid, taskDefinitionUid, index));
  const steps = existing?.steps?.length
    ? existing.steps.map((step, index) => normalizeOrchestrationStep(document, serviceUid, step, index))
    : legacySteps;
  return {
    variables: existing?.variables || [],
    steps,
    returnMapping: existing?.returnMapping || [],
  };
}

function normalizeOrchestrationStep(
  document: BlmDocument,
  serviceUid: string,
  step: OrchestrationStep,
  index: number,
): OrchestrationStep {
  const taskDefinitionUid = String(step.taskDefinitionUid || '').trim();
  const task = document.taskDefinitions.find((candidate) => candidate.uid === taskDefinitionUid || candidate.id === taskDefinitionUid);
  return {
    uid: String(step.uid || '').trim() || `step-${serviceUid}-${index + 1}-${taskDefinitionUid || 'task'}`,
    name: String(step.name || task?.name || `步骤${index + 1}`).trim(),
    stepAlias: String(step.stepAlias || `step${index + 1}`).trim(),
    taskDefinitionUid,
    inputMapping: step.inputMapping || [],
    outputMapping: step.outputMapping || [],
  };
}

function legacyStepTaskUids(service: ApplicationService): string[] {
  const legacySteps = (service as unknown as { steps?: Array<{ taskDefUid?: string; taskDefinitionUid?: string }> }).steps || [];
  return uniqueStrings([
    ...(service.taskDefinitionUids || []),
    ...legacySteps.map((step) => step.taskDefinitionUid || step.taskDefUid || ''),
  ]);
}

function legacyTaskStep(document: BlmDocument, serviceUid: string, taskDefinitionUid: string, index: number): OrchestrationStep {
  const task = document.taskDefinitions.find((candidate) => candidate.uid === taskDefinitionUid || candidate.id === taskDefinitionUid);
  return {
    uid: `step-${serviceUid}-${index + 1}-${taskDefinitionUid}`,
    name: task?.name || `步骤${index + 1}`,
    stepAlias: `step${index + 1}`,
    taskDefinitionUid,
    inputMapping: [],
    outputMapping: [],
  };
}

export function getServiceOrchestrationSteps(document: BlmDocument, service: ApplicationService): OrchestrationStep[] {
  return normalizeServiceOrchestration(document, service.uid, service).steps;
}

export function normalizeStageFlowRefs(document: BlmDocument): StageFlowRef[] {
  const refs: StageFlowRef[] = [];
  const seen = new Set<string>();

  const pushRef = (stageIdentity: string, processIdentity: string, order: number, uid = '', pos?: { x: number; y: number }) => {
    const stage = findStageByIdentity(document, stageIdentity);
    const process = findProcessByIdentity(document, processIdentity);
    if (!stage || !process) return;
    const key = `${stage.uid}::${process.uid}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({
      uid: uid || `stage-flow-ref-${stage.uid}-${process.uid}`,
      stageUid: stage.uid,
      processUid: process.uid,
      order: Math.max(1, Math.round(Number(order || refs.length + 1))),
      pos: pos || { x: 0, y: 0 },
    });
  };

  document.stageFlowRefs.forEach((ref, index) => {
    const refLike = ref as StageFlowRef & { stageId?: string; processId?: string; pos?: { x: number; y: number } };
    pushRef(refLike.stageUid || refLike.stageId || '', refLike.processUid || refLike.processId || '', refLike.order || index + 1, refLike.uid, refLike.pos);
  });

  document.processes.forEach((process) => {
    const stageIdentity = process.stageUid || process.stageId || '';
    if (stageIdentity) pushRef(stageIdentity, process.uid, refs.length + 1);
  });

  return refs.sort((left, right) => left.order - right.order);
}

export function getStageProcesses(document: BlmDocument, stageId: string): Process[] {
  const stage = findStageByIdentity(document, stageId);
  if (!stage) return [];
  const processByUid = new Map(document.processes.map((process) => [process.uid, process]));
  return document.stageFlowRefs
    .filter((ref) => ref.stageUid === stage.uid)
    .sort((left, right) => left.order - right.order)
    .map((ref) => processByUid.get(ref.processUid))
    .filter((process): process is Process => Boolean(process));
}

export function getRoleUsage(document: BlmDocument, roleId: string): RoleUsage[] {
  const role = document.roles.find((candidate) => candidate.uid === roleId || candidate.id === roleId || candidate.name === roleId);
  if (!role) return [];
  const roleKeys = new Set([role.uid, role.id, role.name].filter(Boolean));
  const usage: RoleUsage[] = [];
  for (const process of document.processes) {
    for (const node of process.nodes) {
      const nodeRoleKeys = new Set([...(node.role_uids || []), ...(node.role_ids || []), node.role].filter(Boolean));
      if ([...nodeRoleKeys].some((key) => roleKeys.has(key))) {
        usage.push({ role, process, node });
      }
    }
  }
  return usage;
}

export function getComponentSupportedStages(document: BlmDocument, component: BusinessComponent): Stage[] {
  const directStageUids = new Set(component.stageUids || []);
  const taskUids = new Set(component.taskDefinitionUids || []);
  const entityUids = new Set(component.entityUids || []);
  const processUids = new Set<string>();

  for (const process of document.processes) {
    if (process.nodes.some((node) => nodeReferencesComponent(node, taskUids, entityUids))) {
      processUids.add(process.uid);
    }
  }

  for (const ref of document.stageFlowRefs) {
    if (processUids.has(ref.processUid)) {
      directStageUids.add(ref.stageUid);
    }
  }

  return document.stages.filter((stage) => directStageUids.has(stage.uid));
}

function nodeReferencesComponent(
  node: Process['nodes'][number],
  taskUids: Set<string>,
  entityUids: Set<string>,
): boolean {
  if (taskUids.has(node.uid) || (node.id && taskUids.has(node.id))) return true;
  return [...(node.entity_ops || []), ...(node.forms || [])].some((item) => {
    const entityRef = String(item.entity_uid || item.entity_id || '').trim();
    return entityUids.has(entityRef);
  });
}

function uniqueStrings(values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values || []) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}
