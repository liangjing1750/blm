export type SidebarLocatorType =
  | 'value-stream' | 'stage' | 'flow-group' | 'process' | 'node'
  | 'component' | 'construct' | 'entity' | 'task' | 'support-process'
  | 'application-service' | 'application-interface' | 'application-orchestration'
  | 'role' | 'term' | 'dictionary' | 'dictionary-item' | 'rule' | 'attachment';

export interface SidebarLocatorTarget {
  type: SidebarLocatorType;
  id: string;
  parentId?: string;
  rootId?: string;
  versionId?: string;
}

export interface SidebarLocatorLink {
  label: string;
  params: Record<string, string>;
}

/** 将目录目标转换为稳定的链接参数；名称不参与主定位，父级 UID 只用于消除同名歧义。 */
export function buildSidebarLocatorLink(target: SidebarLocatorTarget): SidebarLocatorLink | null {
  const id = String(target.id || '').trim();
  if (!id) return null;
  const parentId = String(target.parentId || '').trim();
  const rootId = String(target.rootId || '').trim();
  const params = {} as any;
  let label = '';
  switch (target.type) {
    case 'value-stream': params.tab = 'process'; params.view = 'valueDomain'; params.valueStream = id; label = '价值流'; break;
    case 'stage': params.tab = 'process'; params.view = 'stage'; params.stage = id; label = '阶段'; break;
    case 'flow-group': params.tab = 'process'; params.view = 'stage'; params.stage = parentId; params.group = id; label = '流程组'; break;
    case 'process': params.tab = 'process'; params.view = 'flow'; params.proc = id; label = '流程'; break;
    case 'node': params.tab = 'process'; params.view = 'flow'; params.proc = parentId; params.task = id; label = '节点'; break;
    case 'support-process': params.tab = 'process'; params.view = 'flow'; params.proc = id; if (rootId) params.sourceComponent = rootId; if (parentId) params.sourceConstruct = parentId; label = '支撑流程'; break;
    case 'component': params.tab = 'component'; params.view = 'businessComponent'; params.component = id; label = '组件'; break;
    case 'construct': params.tab = 'component'; params.view = 'construct'; params.component = rootId; params.construct = id; label = '构件'; break;
    case 'entity': params.tab = 'component'; params.view = 'entity'; params.component = rootId; params.construct = parentId; params.entity = id; label = '实体'; break;
    case 'task': params.tab = 'component'; params.view = 'task'; params.component = rootId; params.construct = parentId; params.task = id; label = '任务'; break;
    case 'application-service': params.tab = 'application'; params.view = 'service'; params.service = id; label = '应用服务'; break;
    case 'application-interface': params.tab = 'application'; params.view = 'interface'; params.service = parentId; params.interface = id; label = '应用接口'; break;
    case 'application-orchestration': params.tab = 'application'; params.view = 'orchestration'; params.orchestration = id; if (parentId) params.step = parentId; label = '应用编排'; break;
    case 'role': params.tab = 'panorama'; params.view = 'roles'; params.role = id; label = '角色'; break;
    case 'term': params.tab = 'panorama'; params.view = 'terms'; params.term = id; label = '术语'; break;
    case 'dictionary': params.tab = 'panorama'; params.view = 'dictionary'; params.dictionary = id; label = '字典'; break;
    case 'dictionary-item': params.tab = 'panorama'; params.view = 'dictionary'; params.dictionary = parentId; params.item = id; label = '字典项'; break;
    case 'rule': params.tab = 'panorama'; params.view = 'rules'; params.rule = id; label = '规则'; break;
    case 'attachment': params.tab = 'panorama'; params.view = 'attachments'; params.attachment = id; params.owner = parentId; if (target.versionId) params.version = target.versionId; label = '附件'; break;
    default: return null;
  }
  if (Object.values(params).some((value) => !String(value || '').trim())) return null;
  return { label, params };
}
