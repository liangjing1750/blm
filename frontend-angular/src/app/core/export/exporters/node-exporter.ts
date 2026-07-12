import {
  ApplicationService,
  BlmDocument,
  Process,
  ProcessNode,
} from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { processFormFieldTypeLabel, processStepTypeLabel } from '../../../workbenches/process/shared/process-node-options';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

export interface NodeExportOptions {
  process?: Process | null;
  headingPrefix?: string;
}

export class NodeExporter implements ViewExporter {
  readonly label: string;

  constructor(
    private readonly document: BlmDocument,
    private readonly node: ProcessNode,
    private readonly options: NodeExportOptions = {},
  ) {
    this.label = `node-${safeFileSegment(node.name || identityOf(node) || 'unknown')}`;
  }

  toMarkdown(): string {
    return this.getContent().sections
      .map((section) => section.text || '')
      .filter(Boolean)
      .join('\n');
  }

  getContent(): ViewContent {
    return buildNodeContent(this.document, this.node, this.options);
  }

  async capture(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async captureAll(): Promise<Uint8Array[]> {
    return [];
  }
}

/**
 * 模块意图：节点导出是流程、阶段和全局导出的基础片段，只负责把单个流程节点转成结构化文本内容。
 * 关键流程：调用方提供当前 document 和 node，本构建器解析引用关系后产出 ViewContent，交给 DOCX/MD 通道消费。
 * 边界细节：这里不截图、不下载、不修改 runtime；后续流程导出只组合这些节点片段。
 */
export function buildNodeContent(
  document: BlmDocument,
  node: ProcessNode,
  options: NodeExportOptions = {},
): ViewContent {
  const process = options.process || findOwningProcess(document, node);
  const nodeTitle = display(node.name, identityOf(node), '未命名节点');
  const prefix = display(options.headingPrefix, '', '');
  const sections: ViewSection[] = [
    { type: 'heading5', text: headingText(prefix, `节点：${nodeTitle}`) },
    {
      type: 'table',
      headers: ['字段', '内容'],
      rows: [
        ['所属流程', display(process?.name, identityOf(process), '未归属流程')],
        ['角色', roleNames(document, node).join('、') || '未指定'],
      ],
    },
  ];

  appendHandlingSteps(node, sections, childPrefix(prefix, 1));
  appendHandlingMaterials(document, node, sections, childPrefix(prefix, 2));
  appendHandlingRules(node, sections, childPrefix(prefix, 3));

  return { title: `节点：${nodeTitle}`, sections };
}

function appendHandlingSteps(node: ProcessNode, sections: ViewSection[], prefix = ''): void {
  sections.push({ type: 'heading6', text: headingText(prefix, '办理步骤') });
  const rows = asArray((node as any).userSteps).map((step: any, index) => [
    String(index + 1),
    display(step.name, step.uid || step.id, `步骤${index + 1}`),
    processStepTypeLabel(step.type) || display(step.type, '', ''),
    display(step.note || step.desc || step.description, '', ''),
  ]);
  sections.push({
    type: 'table',
    headers: ['序号', '步骤', '类型', '说明'],
    columnWidths: [6, 24, 14, 56],
    richTextColumns: [3],
    rows: rows.length ? rows : [['', '未配置', '', '']],
  });
}

function appendHandlingMaterials(document: BlmDocument, node: ProcessNode, sections: ViewSection[], prefix = ''): void {
  sections.push({ type: 'heading6', text: headingText(prefix, '办理材料') });
  const forms = node.forms || [];
  if (!forms.length) {
    sections.push({
      type: 'table',
      headers: ['分组', '字段', '类型', '必填', '说明'],
      columnWidths: [16, 20, 14, 10, 40],
      mergeSameColumns: [0],
      rows: [['未配置', '', '', '', '']],
    });
    return;
  }
  forms.forEach((form, index) => {
    sections.push({ type: 'heading7', text: headingText(childPrefix(prefix, index + 1), `表单${index + 1}：${display(form.name, form.uid, '未命名表单')}`) });
    const rows = formFieldRows(form);
    sections.push({
      type: 'table',
      headers: ['分组', '字段', '类型', '必填', '说明'],
      columnWidths: [16, 20, 14, 10, 40],
      mergeSameColumns: [0],
      rows: rows.length ? rows : [['未配置字段', '', '', '', '']],
    });
  });
}

function appendHandlingRules(node: ProcessNode, sections: ViewSection[], prefix = ''): void {
  sections.push({ type: 'heading6', text: headingText(prefix, '办理规则') });
  const rows = asArray((node as any).businessRules).map((rule: any, index) => {
    if (typeof rule === 'string') return [`规则${index + 1}`, rule];
    return [
      display(rule.name, rule.uid || rule.id, `规则${index + 1}`),
      display(rule.content || rule.desc || rule.description || rule.note, '', ''),
    ];
  });
  sections.push({
    type: 'table',
    headers: ['规则名称', '规则内容'],
    richTextColumns: [1],
    rows: rows.length ? rows : [['未配置', '']],
  });
}

function findOwningProcess(document: BlmDocument, node: ProcessNode): Process | null {
  const nodeId = identityOf(node);
  return document.processes.find((process) =>
    (process.nodes || []).some((candidate) => candidate === node || identityOf(candidate) === nodeId),
  ) || null;
}

function roleNames(document: BlmDocument, node: ProcessNode): string[] {
  const roleKeys = new Set([
    ...(node.role_uids || []),
    ...(node.role_ids || []),
    node.role,
  ].map((value) => String(value || '').trim()).filter(Boolean));
  return document.roles
    .filter((role) => roleKeys.has(role.uid) || roleKeys.has(role.id || '') || roleKeys.has(role.name))
    .map((role) => role.name);
}

function servicesForNode(document: BlmDocument, node: ProcessNode): ApplicationService[] {
  const nodeId = identityOf(node);
  const serviceIds = new Set((node.serviceUids || []).map((id) => String(id || '').trim()).filter(Boolean));
  return document.services.filter((service) =>
    serviceIds.has(service.uid) ||
    serviceIds.has(service.id || '') ||
    (nodeId && (service.nodeRefs || []).includes(nodeId)) ||
    (service.taskDefinitionUids || []).some((taskId) => (node.taskDefinitionUids || []).includes(taskId)),
  );
}

function entityName(document: BlmDocument, id: string): string {
  const target = String(id || '').trim();
  const entity = document.entities.find((item) => item.uid === target || item.id === target);
  return display(entity?.name, target, '未关联实体');
}

function serviceName(document: BlmDocument, id: string): string {
  const target = String(id || '').trim();
  const service = document.services.find((item) => item.uid === target || item.id === target);
  return display(service?.name, target, '未关联接口');
}

function formFieldRows(form: any): string[][] {
  const seen = new Set<string>();
  const rows: string[][] = [];
  const pushField = (field: any, group: string) => {
    const name = display(field.name, field.uid || field.id, '');
    const key = `${group}:${name}`;
    if (!name || seen.has(key)) return;
    seen.add(key);
    const type = processFormFieldTypeLabel(display(field.type, '', 'Text'));
    const required = field.required || field.is_required || field.not_null ? '必填' : '非必填';
    const note = display(field.note || field.desc || field.description, '', '');
    rows.push([group, name, type, required, note]);
  };
  asArray(form.fields).forEach((field: any) => pushField(field, display(form.group || form.section || form.name, '', '')));
  asArray(form.sections).forEach((section: any) => {
    const group = display(section.name, section.uid || section.id, '');
    asArray(section.fields).forEach((field: any) => pushField(field, group));
  });
  return rows;
}

function asArray<T = any>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function display(primary: unknown, fallback: unknown, empty: string): string {
  return String(primary || fallback || empty).trim();
}

function childPrefix(prefix: string, index: number): string {
  return prefix ? `${prefix}.${index}` : '';
}

function headingText(prefix: string, text: string): string {
  return prefix ? `${prefix} ${text}` : text;
}

function safeFileSegment(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}
