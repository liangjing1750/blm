export type ExportGraphKind = 'stage-panorama' | 'stage-flow' | 'process-flow' | 'entity-relation' | 'entity-state';

export interface ExportGraphDescriptor {
  id: string;
  kind: ExportGraphKind;
  title: string;
  selector: string;
  params: Record<string, string>;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function identityOf(item: any, fallback: string): string {
  return String(item?.uid || item?.id || fallback).trim();
}

function displayName(item: any, fallback: string): string {
  return String(item?.name || item?.title || fallback).trim();
}

function graphSelector(graphId: string): string {
  return `[data-export-graph-id="${graphId.replace(/"/g, '\\"')}"]`;
}

export function exportGraphId(kind: ExportGraphKind, value = ''): string {
  return value ? `${kind}:${value}` : kind;
}

export function listExportGraphs(document: any): ExportGraphDescriptor[] {
  // 模块意图：集中定义“哪些动态图可以冻结为静态图片”，让导出页和后端截图任务使用同一套稳定 id。
  // 关键流程：这里只读取文档结构并生成描述符，不创建图片、不修改 runtime，也不改变业务文档模型。
  // 边界细节：图形 id 使用 uid 优先，兼容旧文档 id；若旧文档缺 uid，则使用可预测 fallback，避免导出中断。
  const graphs: ExportGraphDescriptor[] = [];
  const stages = asArray(document?.stages).filter((stage) => !stage?.virtual);
  const processes = asArray(document?.processes);
  const entities = asArray(document?.entities);
  if (stages.length) {
    const id = exportGraphId('stage-panorama');
    graphs.push({
      id,
      kind: 'stage-panorama',
      title: '全景视图',
      selector: graphSelector(id),
      params: {},
    });
    stages.forEach((stage, index) => {
      const stageId = identityOf(stage, `stage-${index + 1}`);
      const id = exportGraphId('stage-flow', stageId);
      graphs.push({
        id,
        kind: 'stage-flow',
        title: `阶段视图 - ${displayName(stage, `阶段 ${index + 1}`)}`,
        selector: graphSelector(id),
        params: { stageId },
      });
    });
  }
  processes.forEach((process, index) => {
    const processId = identityOf(process, `process-${index + 1}`);
    const id = exportGraphId('process-flow', processId);
    graphs.push({
      id,
      kind: 'process-flow',
      title: `流程图 - ${displayName(process, `流程 ${index + 1}`)}`,
      selector: graphSelector(id),
      params: { processId },
    });
  });
  if (entities.length) {
    const id = exportGraphId('entity-relation');
    graphs.push({
      id,
      kind: 'entity-relation',
      title: '实体关系图',
      selector: graphSelector(id),
      params: {},
    });
    entities.forEach((entity, index) => {
      const entityId = identityOf(entity, `entity-${index + 1}`);
      const id = exportGraphId('entity-state', entityId);
      graphs.push({
        id,
        kind: 'entity-state',
        title: `实体状态图 - ${displayName(entity, `实体 ${index + 1}`)}`,
        selector: graphSelector(id),
        params: { entityId },
      });
    });
  }
  return graphs;
}
