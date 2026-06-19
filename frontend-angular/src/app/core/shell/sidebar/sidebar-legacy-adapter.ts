export interface SidebarRuntime {
  S?: {
    doc?: BlmSidebarDocument | null;
    ui?: Record<string, any>;
  };
  navigate?: (tab: string, options?: Record<string, unknown>) => void;
  switchMainTab?: (tabId: string) => void;
  render?: () => void;
  markModified?: () => void;
}

export interface BlmSidebarDocument {
  valueStreams?: SidebarItem[];
  businessDomains?: SidebarItem[];
  stages?: SidebarStage[];
  stageFlowRefs?: Array<Record<string, any>>;
  processes?: SidebarProcess[];
  businessComponents?: SidebarComponentItem[];
  businessCapabilities?: SidebarComponentItem[];
  businessConstructs?: SidebarConstruct[];
  entities?: SidebarEntity[];
  taskDefinitions?: SidebarTaskDefinition[];
}

export interface SidebarItem {
  uid?: string;
  id?: string;
  name?: string;
  label?: string;
  note?: string;
}

export interface SidebarStage extends SidebarItem {
  valueStreamUid?: string;
  valueStreamId?: string;
  businessDomainUid?: string;
  businessDomainId?: string;
  subDomain?: string;
  processUids?: string[];
  processIds?: string[];
}

export interface SidebarProcess extends SidebarItem {
  stageUid?: string;
  stageId?: string;
  valueStreamUid?: string;
  valueStreamId?: string;
  businessDomainUid?: string;
  businessDomainId?: string;
  subDomain?: string;
  nodes?: SidebarNode[];
  tasks?: SidebarNode[];
}

export interface SidebarNode extends SidebarItem {
  userSteps?: unknown[];
  steps?: unknown[];
  forms?: unknown[];
}

export interface SidebarComponentItem extends SidebarItem {
  kind?: string;
  businessDomainUid?: string;
  businessDomainId?: string;
  subDomain?: string;
  constructUids?: string[];
  constructIds?: string[];
  entityUids?: string[];
  taskDefinitionUids?: string[];
}

export interface SidebarConstruct extends SidebarItem {
  businessComponentUid?: string;
  businessComponentId?: string;
  businessComponent?: string;
}

export interface SidebarEntity extends SidebarItem {
  businessConstructUid?: string;
  businessConstructUids?: string[];
}

export interface SidebarTaskDefinition extends SidebarItem {
  businessComponentUid?: string;
  businessComponent?: string;
  constructUid?: string;
  constructUids?: string[];
}

export interface SidebarDirectoryModel {
  selectedDomainId: string;
  domains: SidebarItem[];
  metrics: SidebarMetric[];
  valueStreams: SidebarValueStreamGroup[];
  orphanStages: SidebarStageGroup[];
  components: SidebarComponentGroup[];
}

export interface SidebarMetric {
  label: string;
  value: number;
  group: 'flow' | 'interaction' | 'model';
}

export interface SidebarValueStreamGroup {
  id: string;
  name: string;
  stageCount: number;
  processCount: number;
  stages: SidebarStageGroup[];
}

export interface SidebarStageGroup {
  id: string;
  name: string;
  processCount: number;
  processGroups: SidebarProcessGroup[];
}

export interface SidebarProcessGroup {
  id: string;
  name: string;
  implicit: boolean;
  processCount: number;
  processes: SidebarProcessSummary[];
}

export interface SidebarProcessSummary {
  id: string;
  name: string;
  nodeCount: number;
  stageName?: string;
  capabilityName?: string;
}

export interface SidebarComponentGroup {
  id: string;
  name: string;
  kind: 'core' | 'generic';
  constructCount: number;
  entityCount: number;
  taskCount: number;
  constructs: SidebarConstructSummary[];
}

export interface SidebarConstructSummary {
  id: string;
  name: string;
  entityCount: number;
  taskCount: number;
  processCount: number;
  entities: SidebarAssetSummary[];
  tasks: SidebarAssetSummary[];
  processes: SidebarProcessSummary[];
}

export interface SidebarAssetSummary {
  id: string;
  name: string;
  kind: 'entity' | 'task';
}

export interface SidebarAdapter {
  model(): SidebarDirectoryModel;
  isCollapsed(): boolean;
  toggleCollapsed(): void;
  width(): number;
  setWidth(width: number): void;
  isNodeCollapsed(key: string): boolean;
  toggleNode(key: string): void;
  setBusinessDomain(domainId: string): void;
  openProcess(processId: string): void;
  openComponentWorkbench(): void;
  openEntity(entityId: string): void;
}

const DEFAULT_WIDTH = 360;

export function createSidebarLegacyAdapter(runtime: SidebarRuntime = getAngularRuntimeState() as SidebarRuntime): SidebarAdapter {
  const ui = () => {
    const direct = runtime as SidebarRuntime & { ui?: Record<string, any> };
    if (direct.ui) {
      direct.ui['sbCollapse'] ||= {};
      return direct.ui;
    }
    runtime.S ||= {};
    runtime.S.ui ||= {};
    runtime.S.ui['sbCollapse'] ||= {};
    return runtime.S.ui;
  };

  const doc = () => (runtime as SidebarRuntime & { doc?: BlmSidebarDocument }).doc || runtime.S?.doc || {};
  const idOf = (item: SidebarItem | null | undefined): string => String(item?.uid || item?.id || item?.name || '').trim();
  const nameOf = (item: SidebarItem | null | undefined, fallback = '未命名'): string => String(item?.name || item?.label || item?.id || item?.uid || fallback).trim();
  const refMatches = (candidate: unknown, ids: Set<string>, names: Set<string>): boolean => {
    const text = String(candidate || '').trim();
    return !!text && (ids.has(text) || names.has(text));
  };

  const businessDomainIds = (domainId: string) => {
    const domains = doc().businessDomains || [];
    const domain = domains.find((item) => idOf(item) === domainId || item.id === domainId || item.uid === domainId || item.name === domainId);
    return {
      ids: new Set([domainId, domain?.uid, domain?.id].filter(Boolean).map(String)),
      names: new Set([domain?.name, domain?.label, domainId].filter(Boolean).map(String)),
    };
  };

  const matchesDomain = (item: Record<string, any> | null | undefined, domainId: string): boolean => {
    if (!domainId || domainId === 'all') return true;
    const refs = businessDomainIds(domainId);
    return refMatches(item?.['businessDomainUid'], refs.ids, refs.names)
      || refMatches(item?.['businessDomainId'], refs.ids, refs.names)
      || refMatches(item?.['subDomain'], refs.ids, refs.names)
      || refMatches(item?.['businessDomain'], refs.ids, refs.names)
      || refMatches(item?.['domain'], refs.ids, refs.names);
  };

  const processNodes = (process: SidebarProcess): SidebarNode[] => {
    if (Array.isArray(process.nodes)) return process.nodes;
    if (Array.isArray(process.tasks)) return process.tasks;
    return [];
  };

  const summarizeProcess = (process: SidebarProcess, stageName = '', capabilityName = ''): SidebarProcessSummary => ({
    id: idOf(process),
    name: nameOf(process, '未命名流程'),
    nodeCount: processNodes(process).length,
    stageName,
    capabilityName,
  });

  const processGroups = (processes: SidebarProcess[], stageName = ''): SidebarProcessGroup[] => {
    const hasNamedGroup = processes.some((process) => String((process as Record<string, any>)['flowGroup'] || '').trim());
    if (!hasNamedGroup) {
      return [{
        id: 'all',
        name: '默认流程组',
        implicit: true,
        processCount: processes.length,
        processes: processes.map((process) => summarizeProcess(process, stageName)),
      }];
    }
    const groups = new Map<string, SidebarProcess[]>();
    processes.forEach((process) => {
      const groupName = String((process as Record<string, any>)['flowGroup'] || '').trim() || '未分组';
      groups.set(groupName, [...(groups.get(groupName) || []), process]);
    });
    return Array.from(groups.entries()).map(([name, groupProcesses], index) => ({
      id: `group-${index + 1}`,
      name,
      implicit: false,
      processCount: groupProcesses.length,
      processes: groupProcesses.map((process) => summarizeProcess(process, stageName)),
    }));
  };

  const processesForStage = (stage: SidebarStage, domainId: string): SidebarProcess[] => {
    const stageIds = new Set([stage.uid, stage.id, stage.name].filter(Boolean).map(String));
    const explicitRefs = new Set([...(stage.processUids || []), ...(stage.processIds || [])].filter(Boolean).map(String));
    (doc().stageFlowRefs || []).forEach((ref) => {
      if (refMatches(ref['stageUid'] || ref['stageId'], stageIds, stageIds)) {
        const processRef = String(ref['processUid'] || ref['processId'] || '').trim();
        if (processRef) explicitRefs.add(processRef);
      }
    });
    return (doc().processes || []).filter((process) => {
      const processIds = new Set([process.uid, process.id, process.name].filter(Boolean).map(String));
      const belongsToStage = explicitRefs.size
        ? [...processIds].some((value) => explicitRefs.has(value))
        : refMatches(process.stageUid || process.stageId, stageIds, stageIds);
      const stageDomainMatch = matchesDomain(stage, domainId);
      return belongsToStage && (stageDomainMatch || matchesDomain(process, domainId));
    });
  };

  const componentItems = (): SidebarComponentItem[] => {
    const current = doc();
    return [...(current.businessComponents || []), ...(current.businessCapabilities || [])]
      .filter((item, index, list) => list.findIndex((candidate) => idOf(candidate) === idOf(item)) === index);
  };

  const constructBelongsToComponent = (construct: SidebarConstruct, component: SidebarComponentItem): boolean => {
    const componentIds = new Set([component.uid, component.id, component.name].filter(Boolean).map(String));
    return refMatches(construct.businessComponentUid, componentIds, componentIds)
      || refMatches(construct.businessComponentId, componentIds, componentIds)
      || refMatches(construct.businessComponent, componentIds, componentIds)
      || (component.constructUids || []).some((id) => refMatches(id, new Set([idOf(construct)]), new Set([construct.name || ''])))
      || (component.constructIds || []).some((id) => refMatches(id, new Set([idOf(construct)]), new Set([construct.name || ''])));
  };

  const constructEntities = (construct: SidebarConstruct): SidebarEntity[] => {
    const constructIds = new Set([construct.uid, construct.id, construct.name].filter(Boolean).map(String));
    return (doc().entities || []).filter((entity) => (
      refMatches(entity.businessConstructUid, constructIds, constructIds)
      || (entity.businessConstructUids || []).some((id) => refMatches(id, constructIds, constructIds))
    ));
  };

  const constructTasks = (construct: SidebarConstruct): SidebarTaskDefinition[] => {
    const constructIds = new Set([construct.uid, construct.id, construct.name].filter(Boolean).map(String));
    return (doc().taskDefinitions || []).filter((task) => (
      refMatches(task.constructUid, constructIds, constructIds)
      || (task.constructUids || []).some((id) => refMatches(id, constructIds, constructIds))
    ));
  };

  const constructProcesses = (construct: SidebarConstruct, tasks: SidebarTaskDefinition[], capabilityName = ''): SidebarProcessSummary[] => {
    const constructIds = new Set([construct.uid, construct.id, construct.name].filter(Boolean).map(String));
    const relatedIds = new Set([
      ...(((construct as Record<string, any>)['relatedProcessIds'] as string[] | undefined) || []),
      ...(((construct as Record<string, any>)['processIds'] as string[] | undefined) || []),
    ].filter(Boolean).map(String));
    const taskIds = new Set(tasks.map((task) => idOf(task)).filter(Boolean));
    return (doc().processes || [])
      .filter((process) => {
        const processIds = new Set([process.uid, process.id, process.name].filter(Boolean).map(String));
        if ([...processIds].some((value) => relatedIds.has(value))) return true;
        if (refMatches((process as Record<string, any>)['businessConstructUid'], constructIds, constructIds)) return true;
        const processConstructs = ((process as Record<string, any>)['businessConstructUids'] as string[] | undefined) || [];
        if (processConstructs.some((id) => refMatches(id, constructIds, constructIds))) return true;
        return processNodes(process).some((node) => {
          const orchestrationTasks = [
            ...(((node as Record<string, any>)['orchestrationTasks'] as Record<string, any>[] | undefined) || []),
            ...(((node as Record<string, any>)['taskRefs'] as Record<string, any>[] | undefined) || []),
          ];
          return orchestrationTasks.some((task) => taskIds.has(String(task['taskDefinitionUid'] || task['taskDefinitionId'] || task['id'] || '').trim()));
        });
      })
      .map((process) => summarizeProcess(process, '', capabilityName));
  };

  const componentEntityCount = (component: SidebarComponentItem, constructs: SidebarConstruct[]): number => {
    const explicit = new Set((component.entityUids || []).filter(Boolean).map(String));
    constructs.forEach((construct) => constructEntities(construct).forEach((entity) => explicit.add(idOf(entity))));
    return explicit.size;
  };

  const componentTaskCount = (component: SidebarComponentItem, constructs: SidebarConstruct[]): number => {
    const explicit = new Set((component.taskDefinitionUids || []).filter(Boolean).map(String));
    constructs.forEach((construct) => constructTasks(construct).forEach((task) => explicit.add(idOf(task))));
    return explicit.size;
  };

  return {
    model(): SidebarDirectoryModel {
      const selectedDomainId = String(ui()['businessDomainFilter'] || 'all');
      const domains = doc().businessDomains || [];
      const filteredStages = (doc().stages || []).filter((stage) => matchesDomain(stage, selectedDomainId));
      const stageGroups: SidebarStageGroup[] = filteredStages.map((stage) => {
        const processes = processesForStage(stage, selectedDomainId);
        const stageName = nameOf(stage, '未命名阶段');
        return {
          id: idOf(stage),
          name: stageName,
          processCount: processes.length,
          processGroups: processGroups(processes, stageName),
        };
      });

      const streams = doc().valueStreams || [];
      const valueStreams = streams.map((stream) => {
        const streamIds = new Set([stream.uid, stream.id, stream.name].filter(Boolean).map(String));
        const stages = stageGroups.filter((group) => {
          const stage = filteredStages.find((item) => idOf(item) === group.id);
          return refMatches(stage?.valueStreamUid || stage?.valueStreamId || (stage as Record<string, any> | undefined)?.['valueStream'] || (stage as Record<string, any> | undefined)?.['stream'], streamIds, streamIds);
        });
        return {
          id: idOf(stream),
          name: nameOf(stream, '未命名价值流'),
          stageCount: stages.length,
          processCount: stages.reduce((sum, stage) => sum + stage.processCount, 0),
          stages,
        };
      }).filter((stream) => stream.stages.length || selectedDomainId === 'all');

      const streamedStageIds = new Set(valueStreams.flatMap((stream) => stream.stages.map((stage) => stage.id)));
      const orphanStages = stageGroups.filter((stage) => !streamedStageIds.has(stage.id));
      const allProcesses = [
        ...stageGroups.flatMap((stage) => stage.processGroups.flatMap((group) => group.processes)),
      ];
      const nodes = (doc().processes || []).flatMap((process) => processNodes(process));
      const components = componentItems()
        .filter((component) => matchesDomain(component, selectedDomainId))
        .map<SidebarComponentGroup>((component) => {
          const constructs = (doc().businessConstructs || []).filter((construct) => constructBelongsToComponent(construct, component));
          const constructSummaries = constructs.map((construct) => {
            const entities = constructEntities(construct).map((entity) => ({
              id: idOf(entity),
              name: nameOf(entity, '未命名实体'),
              kind: 'entity' as const,
            }));
            const tasks = constructTasks(construct).map((task) => ({
              id: idOf(task),
              name: nameOf(task, '未命名任务'),
              kind: 'task' as const,
            }));
            const processes = constructProcesses(construct, constructTasks(construct), nameOf(component, ''));
            return {
              id: idOf(construct),
              name: nameOf(construct, '未命名业务构件'),
              entityCount: entities.length,
              taskCount: tasks.length,
              processCount: processes.length,
              entities,
              tasks,
              processes,
            };
          });
          return {
            id: idOf(component),
            name: nameOf(component, '未命名组件'),
            kind: component.kind === 'core' ? 'core' : 'generic',
            constructCount: constructs.length,
            entityCount: componentEntityCount(component, constructs),
            taskCount: componentTaskCount(component, constructs),
            constructs: constructSummaries,
          };
        });

      return {
        selectedDomainId,
        domains,
        metrics: [
          { label: '价值流', value: valueStreams.length, group: 'flow' },
          { label: '阶段', value: filteredStages.length, group: 'flow' },
          { label: '流程', value: allProcesses.length, group: 'flow' },
          { label: '节点', value: nodes.length, group: 'flow' },
          { label: '步骤', value: nodes.reduce((sum, node) => sum + ((node.userSteps || node.steps || []) as unknown[]).length, 0), group: 'interaction' },
          { label: '表单', value: nodes.reduce((sum, node) => sum + (node.forms || []).length, 0), group: 'interaction' },
          { label: '任务', value: (doc().taskDefinitions || []).length, group: 'model' },
          { label: '实体', value: (doc().entities || []).length, group: 'model' },
          { label: '构件', value: (doc().businessConstructs || []).length, group: 'model' },
          { label: '组件', value: components.length, group: 'model' },
        ],
        valueStreams,
        orphanStages,
        components,
      };
    },
    isCollapsed(): boolean {
      if (!Object.prototype.hasOwnProperty.call(ui(), 'sidebarCollapsed')) {
        ui()['sidebarCollapsed'] = true;
      }
      return !!ui()['sidebarCollapsed'];
    },
    toggleCollapsed(): void {
      ui()['sidebarCollapsed'] = !ui()['sidebarCollapsed'];
      runtime.render?.();
    },
    width(): number {
      return Number(ui()['sidebarWidth'] || DEFAULT_WIDTH);
    },
    setWidth(width: number): void {
      ui()['sidebarWidth'] = Math.max(260, Math.min(620, Math.round(width)));
    },
    isNodeCollapsed(key: string): boolean {
      const collapseState = ui()['sbCollapse'] || {};
      if (Object.prototype.hasOwnProperty.call(collapseState, key)) return !!collapseState[key];
      return true;
    },
    toggleNode(key: string): void {
      ui()['sbCollapse'] ||= {};
      ui()['sbCollapse'][key] = !ui()['sbCollapse'][key];
    },
    setBusinessDomain(domainId: string): void {
      ui()['businessDomainFilter'] = domainId || 'all';
    },
    openProcess(processId: string): void {
      if (runtime.switchMainTab) runtime.switchMainTab('processWorkbench');
      else switchAngularMainTab('processWorkbench');
      if (runtime.navigate) runtime.navigate('process', { procId: processId });
      else navigateAngularWorkbench('process', { procId: processId });
      if (runtime.S?.ui) runtime.S.ui['mainTab'] = 'processWorkbench';
      runtime.render?.();
    },
    openComponentWorkbench(): void {
      if (runtime.switchMainTab) runtime.switchMainTab('constructWorkbench');
      else switchAngularMainTab('constructWorkbench');
    },
    openEntity(entityId: string): void {
      if (runtime.navigate) runtime.navigate('data', { entityId });
      else navigateAngularWorkbench('data', { entityId });
    },
  };
}
import { getAngularRuntimeState, navigateAngularWorkbench, switchAngularMainTab } from '../../runtime/angular-runtime';
