import { ApplicationService, BlmDocument, ServiceGroup, ServiceParameter } from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

type ServiceLike = ApplicationService & { inputs?: ServiceParameter[]; outputs?: ServiceParameter[] };

export class ApplicationExporter implements ViewExporter {
  readonly label = 'application';

  constructor(private readonly document: BlmDocument) {}

  toMarkdown(): string {
    return this.getContent().sections.map((section) => section.text || '').filter(Boolean).join('\n');
  }

  getContent(): ViewContent {
    return buildApplicationContent(this.document);
  }

  async capture(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async captureAll(): Promise<Uint8Array[]> {
    return [];
  }
}

/**
 * 模块意图：应用工作台导出以“应用服务 -> 服务 -> 接口 -> 四个小节”为主线，和用户评审接口文档的阅读顺序一致。
 * 关键流程：服务是二级标题，接口是三级标题；参数契约改为四列表格，编排逻辑按步骤拆表，避免映射列互相挤压。
 * 边界细节：旧文档可能没有服务组或仍使用 inputs/outputs，导出时归入“未分组接口”并兼容旧字段。
 */
export function buildApplicationContent(document: BlmDocument): ViewContent {
  const sections: ViewSection[] = [
    { type: 'heading1', text: '应用服务' },
  ];
  const groups = serviceGroupsWithInterfaces(document);

  if (!groups.length) {
    sections.push({ type: 'paragraph', text: '暂无应用接口。' });
  }

  for (const group of groups) {
    sections.push({ type: 'heading2', text: `服务：${group.name}` });
    for (const service of group.services) {
      sections.push({ type: 'heading3', text: `接口：${display(service.name, identityOf(service), '未命名接口')}` });
      sections.push({ type: 'heading4', text: '接口基本信息' });
      sections.push(interfaceBasicTable(group.name, service));
      sections.push({ type: 'heading4', text: '接口请求参数' });
      sections.push(parameterTable(serviceRequestParams(service)));
      sections.push({ type: 'heading4', text: '接口响应参数' });
      sections.push(parameterTable(serviceResponseParams(service)));
      sections.push({ type: 'heading4', text: '编排逻辑' });
      appendOrchestrationSections(sections, document, service);
    }
  }

  return { title: '应用服务', sections };
}

function interfaceBasicTable(groupName: string, service: ServiceLike): ViewSection {
  return {
    type: 'table',
    headers: ['字段', '内容'],
    columnWidths: [18, 82],
    rows: [
      ['所属服务', groupName],
      ['接口名称', display(service.name, identityOf(service), '未命名接口')],
      ['方法', String(service.method || 'POST')],
      ['路径', String(service.path || '/')],
      ['说明', String(service.desc || '')],
      ['调用方', String(service.actor || '')],
    ],
  };
}

function parameterTable(params: ServiceParameter[]): ViewSection {
  const rows = flattenParams(params);
  return {
    type: 'table',
    headers: ['参数', '类型', '必填', '说明'],
    columnWidths: [30, 16, 10, 44],
    rows: rows.length
      ? rows.map((param) => [param.name, docTypeName(param.type), param.required ? '必填' : '非必填', param.note])
      : [['未配置', '', '', '']],
  };
}

function appendOrchestrationSections(sections: ViewSection[], document: BlmDocument, service: ServiceLike): void {
  const steps = orchestrationSteps(service);
  if (!steps.length) {
    sections.push({ type: 'paragraph', text: '暂无编排逻辑。' });
    return;
  }
  const tasks = new Map((document.taskDefinitions || []).map((task) => [identityOf(task), task]));
  sections.push({
    type: 'table',
    headers: ['序号', '步骤', '类型', '任务定义'],
    columnWidths: [8, 36, 16, 40],
    rows: steps.map((step: any, index) => {
      const task = tasks.get(String(step.taskDefinitionUid || step.taskDefUid || '').trim());
      return [
        String(index + 1),
        display(step.name, step.stepAlias || step.uid, `步骤${index + 1}`),
        stepKindLabel(step.kind),
        display(task?.name, step.taskDefinitionUid || step.taskDefUid, ''),
      ];
    }),
  });

  steps.forEach((step: any, index) => {
    sections.push({ type: 'heading5', text: `步骤${index + 1}：${display(step.name, step.stepAlias || step.uid, `步骤${index + 1}`)}` });
    sections.push(mappingTable(step));
  });
}

function mappingTable(step: any): ViewSection {
  const rows = [
    ...mappingRows('输入映射', step.inputMapping),
    ...mappingRows('输出映射', step.outputMapping),
  ];
  return {
    type: 'table',
    headers: ['类型', '来源', '目标', '说明'],
    columnWidths: [12, 36, 36, 16],
    rows: rows.length ? rows : [['未配置', '', '', '']],
  };
}

function serviceGroupsWithInterfaces(document: BlmDocument): Array<{ id: string; name: string; services: ServiceLike[] }> {
  const allServices = services(document);
  const groups = (document.serviceGroups || []).map((group) => {
    const id = identityOf(group);
    return {
      id,
      name: display(group.name, id, '未命名应用服务'),
      services: allServices.filter((service) => String(service.serviceGroupUid || '').trim() === id),
    };
  }).filter((group) => group.services.length);
  const groupedIds = new Set((document.serviceGroups || []).map((group: ServiceGroup) => identityOf(group)));
  const ungrouped = allServices.filter((service) => !service.serviceGroupUid || !groupedIds.has(String(service.serviceGroupUid)));
  if (ungrouped.length) groups.push({ id: '__ungrouped__', name: '未分组接口', services: ungrouped });
  return groups;
}

function services(document: BlmDocument): ServiceLike[] {
  const doc = document as any;
  return Array.isArray(doc.services) ? doc.services : [];
}

function serviceRequestParams(service: ServiceLike): ServiceParameter[] {
  return Array.isArray(service.requestParams) ? service.requestParams : (Array.isArray(service.inputs) ? service.inputs : []);
}

function serviceResponseParams(service: ServiceLike): ServiceParameter[] {
  return Array.isArray(service.responseParams) ? service.responseParams : (Array.isArray(service.outputs) ? service.outputs : []);
}

function flattenParams(params: ServiceParameter[], prefix = ''): Array<{ name: string; type: string; required: boolean; note: string }> {
  return params.flatMap((param) => {
    const name = [prefix, param.name || '未命名参数'].filter(Boolean).join('.');
    const children = Array.isArray(param.children) ? param.children : [];
    return [
      { name, type: String(param.type || 'String'), required: Boolean(param.required), note: String(param.note || '') },
      ...flattenParams(children, name),
    ];
  });
}

function orchestrationSteps(service: ServiceLike): any[] {
  const steps = Array.isArray(service.orchestration?.steps) ? service.orchestration!.steps : [];
  return [...steps].sort((left: any, right: any) => Number(left.order || 0) - Number(right.order || 0));
}

function mappingRows(type: string, value: unknown): string[][] {
  return Array.isArray(value)
    ? value.map((item: any) => [type, String(item.source || ''), String(item.target || ''), String(item.note || '')])
    : [];
}

function stepKindLabel(kind: unknown): string {
  const map: Record<string, string> = {
    task: '任务',
    branch: '分支',
    loop: '循环',
    assertion: '断言',
    transform: '加工',
    return: '返回',
  };
  const key = String(kind || 'task').trim();
  return map[key] || key;
}

function docTypeName(type: unknown): string {
  const normalized = String(type || 'String').trim();
  const map: Record<string, string> = {
    String: 'string',
    Number: 'number',
    Boolean: 'boolean',
    Array: 'array',
    List: 'list',
    Map: 'map',
    Object: 'object',
  };
  return map[normalized] || normalized;
}

function display(primary: unknown, fallback: unknown, empty: string): string {
  return String(primary || fallback || empty).trim();
}
