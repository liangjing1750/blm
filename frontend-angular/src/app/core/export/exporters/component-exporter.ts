import { BlmDocument, BusinessComponent, BusinessConstruct, Entity, TaskDefinition } from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { captureFullElement } from './process-exporter';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

type ComponentLike = BusinessComponent & { constructUids?: string[]; note?: string };
type ConstructLike = BusinessConstruct & { note?: string };
type EntityLike = Entity & { businessConstructUid?: string; businessConstructUids?: string[]; constructUid?: string; note?: string };
type TaskLike = TaskDefinition & { desc?: string; querySourceKind?: string };

export class ComponentModelExporter implements ViewExporter {
  readonly label = 'component-model';

  constructor(
    private readonly document: BlmDocument,
    private readonly graphIds: ComponentGraphIds = {},
  ) {}

  toMarkdown(): string {
    return this.getContent().sections.map((section) => section.text || '').filter(Boolean).join('\n');
  }

  getContent(): ViewContent {
    return buildComponentModelContent(this.document, this.graphIds);
  }

  async capture(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async captureAll(): Promise<Uint8Array[]> {
    const ids = orderedGraphIds(this.document, this.graphIds);
    const screenshots: Uint8Array[] = [];
    for (const id of ids) screenshots.push(await captureExportGraph(id));
    return screenshots;
  }
}

/**
 * 模块意图：构件工作台导出以“组件聚合构件，构件承载任务和实体”为主线，生成可被全量导出拼接的结构化片段。
 * 关键流程：组件模型 -> 组件 -> 构件 -> 任务/实体；任务与实体保持同级四级标题，避免误表达为任务从属于实体。
 * 边界细节：历史数据可能只有 component.constructUids 或 construct.businessComponentUid，也可能存在未归属构件，导出时都要保留。
 */
export function buildComponentModelContent(
  document: BlmDocument,
  graphIds: ComponentGraphIds = {},
): ViewContent {
  const sections: ViewSection[] = [{ type: 'heading1', text: '组件模型' }];
  let imageIndex = 0;
  if (graphIds.overview) {
    sections.push({ type: 'image', text: '组件地图', imageIndex: imageIndex++ });
  }
  const groupedConstructIds = new Set<string>();
  const components = asArray<ComponentLike>(document.businessComponents);
  const constructs = asArray<ConstructLike>(document.businessConstructs);

  if (!components.length && !constructs.length) {
    sections.push({ type: 'paragraph', text: '暂无组件或构件。' });
    return { title: '组件模型', sections };
  }

  components.forEach((component, index) => {
    const componentId = identityOf(component);
    const componentName = display(component.name, componentId, `组件${index + 1}`);
    const componentConstructs = constructsForComponent(component, constructs);
    componentConstructs.forEach((construct) => groupedConstructIds.add(identityOf(construct)));

    sections.push({ type: 'heading2', text: `组件：${componentName}` });
    if (graphIds.components?.[componentId]) {
      sections.push({ type: 'image', text: `组件地图：${componentName}`, imageIndex: imageIndex++ });
    }
    sections.push(componentSummaryTable(component, componentConstructs, document));
    imageIndex = appendConstructSections(sections, document, componentConstructs, graphIds, imageIndex);
  });

  const unassignedConstructs = constructs.filter((construct) => !groupedConstructIds.has(identityOf(construct)));
  if (unassignedConstructs.length) {
    sections.push({ type: 'heading2', text: '组件：未归属组件' });
    imageIndex = appendConstructSections(sections, document, unassignedConstructs, graphIds, imageIndex);
  }

  return { title: '组件模型', sections };
}

function appendConstructSections(
  sections: ViewSection[],
  document: BlmDocument,
  constructs: ConstructLike[],
  graphIds: ComponentGraphIds,
  imageIndex: number,
): number {
  constructs.forEach((construct, index) => {
    const constructId = identityOf(construct);
    const constructName = display(construct.name, constructId, `构件${index + 1}`);
    const tasks = tasksForConstruct(document, construct);
    const entities = entitiesForConstruct(document, construct);

    sections.push({ type: 'heading3', text: `构件：${constructName}` });
    if (graphIds.constructs?.[constructId]) {
      sections.push({ type: 'image', text: `构件截图：${constructName}`, imageIndex: imageIndex++ });
    }
    for (const task of tasks) {
      sections.push({ type: 'heading4', text: `任务：${display(task.name, identityOf(task), '未命名任务')}` });
      sections.push({ type: 'heading5', text: '任务基本信息' });
      sections.push(taskBasicTable(task));
      sections.push({ type: 'heading5', text: '任务参数契约' });
      sections.push(taskParamTable('输入参数', task.parameters?.inputs));
      sections.push(taskParamTable('输出参数', task.parameters?.outputs));
      sections.push({ type: 'heading5', text: '任务技术实现' });
      const detail = String(task.note || task.desc || '');
      sections.push(taskImplementationTable(task, detail));
    }
    if (!tasks.length) {
      sections.push({ type: 'heading4', text: '任务：暂无任务' });
      sections.push({ type: 'paragraph', text: '暂无任务。' });
    }
    for (const entity of entities) {
      const entityId = identityOf(entity);
      sections.push({ type: 'heading4', text: `实体：${display(entity.name, entityId, '未命名实体')}` });
      sections.push({ type: 'heading5', text: '实体基本信息' });
      sections.push(entityBasicTable(entity));
      sections.push({ type: 'heading5', text: '实体字段信息' });
      sections.push(entityFieldTable(entity));
      sections.push({ type: 'heading5', text: '实体关系' });
      if (graphIds.relations?.[constructId]) {
        sections.push({ type: 'image', text: `实体关系图：${display(entity.name, entityId, '未命名实体')}`, imageIndex: imageIndex++ });
      } else {
        sections.push({ type: 'paragraph', text: '暂无实体关系图。' });
      }
      sections.push({ type: 'heading5', text: '实体状态' });
      if (graphIds.states?.[entityId]) {
        sections.push({ type: 'image', text: `实体状态图：${display(entity.name, entityId, '未命名实体')}`, imageIndex: imageIndex++ });
      } else {
        sections.push({ type: 'paragraph', text: '暂无实体状态图。' });
      }
    }
    if (!entities.length) {
      sections.push({ type: 'heading4', text: '实体：暂无实体' });
      sections.push({ type: 'paragraph', text: '暂无实体。' });
    }
  });
  return imageIndex;
}

function componentSummaryTable(component: ComponentLike, constructs: ConstructLike[], document: BlmDocument): ViewSection {
  const constructIds = new Set(constructs.map((construct) => identityOf(construct)));
  const taskCount = asArray<TaskLike>(document.taskDefinitions).filter((task) => constructIds.has(task.constructUid || '')).length;
  const entityCount = asArray<EntityLike>(document.entities).filter((entity) =>
    constructIds.has(entity.businessConstructUid || entity.constructUid || '')
    || asArray<string>(entity.businessConstructUids).some((id) => constructIds.has(id)),
  ).length;
  return {
    type: 'table',
    headers: ['字段', '内容'],
    rows: [
      ['组件类型', componentKindText(component.kind)],
      ['构件数量', String(constructs.length)],
      ['任务数量', String(taskCount)],
      ['实体数量', String(entityCount)],
      ['说明', String(component.note || '')],
    ],
  };
}

function taskBasicTable(task: TaskLike): ViewSection {
  return {
    type: 'table',
    headers: ['字段', '内容'],
    columnWidths: [18, 82],
    rows: [
      ['任务名称', display(task.name, identityOf(task), '未命名任务')],
      ['类型', taskTypeText(task.type)],
      ['实现状态', task.target || '未设置'],
      ['接口地址', task.address || ''],
    ],
  };
}

function taskParamTable(title: string, params: unknown): ViewSection {
  const rows = flattenParams(params);
  return {
    type: 'table',
    headers: [title, '类型', '必填', '说明', '示例'],
    columnWidths: [24, 14, 10, 34, 18],
    rows: rows.length
      ? rows.map((param) => [param.name, param.type, param.required ? '必填' : '非必填', param.note, param.example])
      : [['未配置', '', '', '', '']],
  };
}

function taskImplementationTable(task: TaskLike, detail: string): ViewSection {
  return {
    type: 'table',
    headers: ['字段', '内容'],
    columnWidths: [18, 82],
    richTextColumns: [1],
    rows: [
      ['实现状态', task.target || '未设置'],
      ['接口地址', task.address || ''],
      ['详细设计', detail || '未配置'],
    ],
  };
}

function entityBasicTable(entity: EntityLike): ViewSection {
  return {
    type: 'table',
    headers: ['字段', '内容'],
    columnWidths: [18, 82],
    rows: [
      ['实体名称', display(entity.name, identityOf(entity), '未命名实体')],
      ['字段数量', String(asArray(entity.fields).length)],
      ['说明', richTextPlain(entity.note || '')],
    ],
  };
}

function entityFieldTable(entity: EntityLike): ViewSection {
  const fields = asArray<any>(entity.fields);
  return {
    type: 'table',
    headers: ['字段', '类型', '说明', '字典/状态值'],
    columnWidths: [22, 14, 40, 24],
    rows: fields.length
      ? fields.map((field) => [
        field.name || '',
        fieldTypeText(field.type),
        richTextPlain(field.note || field.desc || ''),
        field.dictionaryUid || field.state_values || '',
      ])
      : [['未配置', '', '', '']],
  };
}

function constructsForComponent(component: ComponentLike, constructs: ConstructLike[]): ConstructLike[] {
  const componentId = identityOf(component);
  const explicit = new Set(asArray<string>(component.constructUids));
  return constructs.filter((construct) =>
    constructComponentId(construct) === componentId || explicit.has(identityOf(construct)),
  );
}

function tasksForConstruct(document: BlmDocument, construct: ConstructLike): TaskLike[] {
  const constructId = identityOf(construct);
  return asArray<TaskLike>(document.taskDefinitions).filter((task) => String(task.constructUid || '').trim() === constructId);
}

function entitiesForConstruct(document: BlmDocument, construct: ConstructLike): EntityLike[] {
  const constructId = identityOf(construct);
  return asArray<EntityLike>(document.entities).filter((entity) =>
    String(entity.businessConstructUid || entity.constructUid || '').trim() === constructId
    || asArray<string>(entity.businessConstructUids).includes(constructId),
  );
}

function constructComponentId(construct: ConstructLike): string {
  return String(construct.businessComponentUid || construct.businessComponentId || construct.componentUid || construct.componentId || '').trim();
}

function componentKindText(kind: unknown): string {
  if (kind === 'core') return '核心组件';
  if (kind === 'common' || kind === 'generic') return '通用组件';
  return String(kind || '');
}

function taskTypeText(type: unknown): string {
  const map: Record<string, string> = {
    Query: '查询',
    Command: '命令',
    Validate: '校验',
    Calculate: '计算',
    Notify: '通知',
    StateChange: '状态变更',
    Event: '事件',
    Service: '服务',
    Process: '流程',
  };
  const key = String(type || '').trim();
  return map[key] || key;
}

function flattenParams(params: unknown, prefix = ''): Array<{ name: string; type: string; required: boolean; note: string; example: string }> {
  return asArray<any>(params).flatMap((param) => {
    const name = [prefix, param?.name || param?.code || ''].filter(Boolean).join('.');
    return [
      {
        name,
        type: String(param?.type || '').trim(),
        required: Boolean(param?.required),
        note: String(param?.note || param?.description || param?.desc || '').trim(),
        example: String(param?.example || '').trim(),
      },
      ...flattenParams(param?.children, name),
    ];
  }).filter((param) => param.name);
}

function fieldTypeText(type: unknown): string {
  const key = String(type || '').trim();
  const map: Record<string, string> = {
    string: '字符',
    String: '字符',
    number: '数值',
    Number: '数值',
    decimal: '金额',
    Money: '金额',
    date: '日期',
    Date: '日期',
    datetime: '日期时间',
    DateTime: '日期时间',
    boolean: '布尔',
    Boolean: '布尔',
    enum: '枚举',
    Enum: '枚举',
    text: '长文本',
    Text: '长文本',
  };
  return map[key] || key;
}

export interface ComponentGraphIds {
  overview?: string;
  components?: Record<string, string>;
  constructs?: Record<string, string>;
  relations?: Record<string, string>;
  states?: Record<string, string>;
}

function orderedGraphIds(document: BlmDocument, graphIds: ComponentGraphIds): string[] {
  const ids: string[] = [];
  if (graphIds.overview) ids.push(graphIds.overview);
  const constructs = asArray<ConstructLike>(document.businessConstructs);
  for (const component of asArray<ComponentLike>(document.businessComponents)) {
    const componentId = identityOf(component);
    if (graphIds.components?.[componentId]) ids.push(graphIds.components[componentId]);
    for (const construct of constructsForComponent(component, constructs)) {
      const constructId = identityOf(construct);
      if (graphIds.constructs?.[constructId]) ids.push(graphIds.constructs[constructId]);
      for (const entity of entitiesForConstruct(document, construct)) {
        if (graphIds.relations?.[constructId]) ids.push(graphIds.relations[constructId]);
        const stateGraphId = graphIds.states?.[identityOf(entity)];
        if (stateGraphId) ids.push(stateGraphId);
      }
    }
  }
  const grouped = new Set<string>();
  for (const component of asArray<ComponentLike>(document.businessComponents)) {
    constructsForComponent(component, constructs).forEach((construct) => grouped.add(identityOf(construct)));
  }
  for (const construct of constructs.filter((item) => !grouped.has(identityOf(item)))) {
    const constructId = identityOf(construct);
    if (graphIds.constructs?.[constructId]) ids.push(graphIds.constructs[constructId]);
    for (const entity of entitiesForConstruct(document, construct)) {
      if (graphIds.relations?.[constructId]) ids.push(graphIds.relations[constructId]);
      const stateGraphId = graphIds.states?.[identityOf(entity)];
      if (stateGraphId) ids.push(stateGraphId);
    }
  }
  return ids.filter(Boolean);
}

async function captureExportGraph(graphId: string): Promise<Uint8Array> {
  if (typeof document === 'undefined') return new Uint8Array();
  const el = document.querySelector<HTMLElement>(`[data-export-graph-id="${cssEscape(graphId)}"]`);
  if (!el) return new Uint8Array();
  const bytes = await captureFullElement(el);
  return graphId.includes('component-export-relation-')
    ? cropPngWhitespace(bytes, 36).catch(() => bytes)
    : bytes;
}

async function cropPngWhitespace(bytes: Uint8Array, padding: number): Promise<Uint8Array> {
  if (typeof document === 'undefined') return bytes;
  const blob = new Blob([bytesToArrayBuffer(bytes)], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return bytes;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const alpha = data[offset + 3];
        if (alpha < 12) continue;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        if (r > 246 && g > 246 && b > 246) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) return bytes;
    const sx = Math.max(0, minX - padding);
    const sy = Math.max(0, minY - padding);
    const sw = Math.min(canvas.width - sx, maxX - minX + padding * 2);
    const sh = Math.min(canvas.height - sy, maxY - minY + padding * 2);
    if (sw <= 0 || sh <= 0 || (sw === canvas.width && sh === canvas.height)) return bytes;
    const cropped = document.createElement('canvas');
    cropped.width = sw;
    cropped.height = sh;
    const croppedCtx = cropped.getContext('2d');
    if (!croppedCtx) return bytes;
    croppedCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
      cropped.toBlob((result) => {
        if (!result) reject(new Error('Failed to crop component relation screenshot'));
        else resolve(result.arrayBuffer());
      }, 'image/png');
    }));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load component screenshot'));
    img.src = url;
  });
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

function richTextPlain(value: string): string {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/li>\s*<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function display(primary: unknown, fallback: unknown, empty: string): string {
  return String(primary || fallback || empty).trim();
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}
