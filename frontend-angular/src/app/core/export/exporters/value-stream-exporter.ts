import { BlmDocument, Stage } from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { exportGraphId } from '../graph-export-registry';
import { buildStageContent, StageExporter } from './stage-exporter';
import { captureFullElement } from './process-exporter';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

interface ValueStreamChapter {
  title: string;
  stages: Stage[];
}

export class ValueStreamExporter implements ViewExporter {
  readonly label = 'value-stream';

  constructor(private readonly document: BlmDocument) {}

  toMarkdown(): string {
    return this.getContent().sections
      .map((section) => section.text || '')
      .filter(Boolean)
      .join('\n');
  }

  getContent(): ViewContent {
    return buildValueStreamContent(this.document);
  }

  async capture(): Promise<Uint8Array> {
    return captureValueStreamGraph();
  }

  async captureAll(onProgress?: (done: number, total: number, label?: string) => void): Promise<Uint8Array[]> {
    const screenshots: Uint8Array[] = [await this.capture()];
    const stages = stagesForValueStream(this.document);
    const total = 1 + stages.reduce((sum, stage) => sum + 1 + processesForStageCount(this.document, stage), 0);
    onProgress?.(1, Math.max(1, total), '价值流视图');
    for (const stage of stages) {
      const before = screenshots.length;
      screenshots.push(...await new StageExporter(this.document, stage).captureAll((done, stageTotal, label) => {
        onProgress?.(before + done, Math.max(total, before + stageTotal), label);
      }));
    }
    return screenshots;
  }
}

/**
 * 模块意图：价值流导出是流程工作台导出的最外层组合器，只定义一级标题和全景截图。
 * 关键流程：先放价值流矩阵截图，再按矩阵顺序复用阶段导出内容；阶段内部继续复用流程和节点导出。
 * 边界细节：阶段片段自带二级标题，图片索引必须整体后移，避免 DOCX/MD 里的图片错位。
 */
export function buildValueStreamContent(document: BlmDocument): ViewContent {
  const sections: ViewSection[] = [
    { type: 'image', text: '价值流视图', imageIndex: 0 },
  ];

  let imageOffset = 1;
  valueStreamChapters(document).forEach((chapter, chapterIndex) => {
    sections.push({ type: 'heading1', text: `价值流环节：${chapter.title}` });
    chapter.stages.forEach((stage, stageIndex) => {
      const stageContent = buildStageContent(document, stage, {
        headingPrefix: '',
      });
      sections.push(...offsetImageSections(stageContent.sections, imageOffset));
      imageOffset += countImages(stageContent.sections);
    });
  });

  return { title: '价值流环节', sections };
}

export function stagesForValueStream(document: BlmDocument): Stage[] {
  return valueStreamChapters(document).flatMap((chapter) => chapter.stages);
}

export function valueStreamChapters(document: BlmDocument): ValueStreamChapter[] {
  const columns = Array.isArray((document as any).panorama?.columns)
    ? (document as any).panorama.columns
    : [];
  const stages = (document.stages || []).filter((stage: any) => !stage?.virtual);
  const columnIds = columns.map((column: any) => String(column.uid || column.id || '').trim()).filter(Boolean);
  const chapters: ValueStreamChapter[] = columns.map((column: any, index: number) => {
    const columnId = String(column.uid || column.id || '').trim();
    return {
      title: display(column.badge || column.name || column.scope, columnId, `环节${index + 1}`),
      stages: sortStages(stages.filter((stage: any) => String(stage.panoramaColumnUid || stage.panoramaColumnId || '').trim() === columnId)),
    };
  });
  const unassigned = sortStages(stages.filter((stage: any) => {
    const columnId = String(stage.panoramaColumnUid || stage.panoramaColumnId || '').trim();
    return !columnId || !columnIds.includes(columnId);
  }));
  if (unassigned.length) chapters.push({ title: '未归属', stages: unassigned });
  return chapters.filter((chapter) => chapter.stages.length);
}

function sortStages(stages: Stage[]): Stage[] {
  return [...stages].sort((left: any, right: any) => stageOrderKey(left).localeCompare(stageOrderKey(right)));
}

async function captureValueStreamGraph(): Promise<Uint8Array> {
  if (typeof document === 'undefined') return new Uint8Array();
  const graphId = exportGraphId('stage-panorama');
  const el = document.querySelector<HTMLElement>(`[data-export-graph-id="${cssEscape(graphId)}"]`) ||
    document.querySelector<HTMLElement>('[data-testid="value-domain-matrix"]');
  if (!el) return new Uint8Array();
  return captureFullElement(el);
}

function offsetImageSections(sections: ViewSection[], offset: number): ViewSection[] {
  return sections.map((section) => section.type === 'image'
    ? { ...section, imageIndex: (section.imageIndex ?? 0) + offset }
    : section);
}

function countImages(sections: ViewSection[]): number {
  return sections.filter((section) => section.type === 'image').length;
}

function processesForStageCount(document: BlmDocument, stage: Stage): number {
  const stageId = identityOf(stage);
  if (!stageId) return 0;
  const processIds = new Set((document.stageFlowRefs || [])
    .filter((ref: any) => String(ref.stageUid || ref.stageId || '').trim() === stageId)
    .map((ref: any) => String(ref.processUid || ref.processId || '').trim())
    .filter(Boolean));
  return (document.processes || []).filter((process) => processIds.has(identityOf(process))).length;
}

function stageOrderKey(stage: any): string {
  const lane = String(stage.panoramaLaneUid || stage.panoramaLaneId || '').trim();
  const column = String(stage.panoramaColumnUid || stage.panoramaColumnId || '').trim();
  const slot = stage.panoramaSlot || {};
  return [
    lane,
    column,
    String(Number(slot.row || 0)).padStart(4, '0'),
    String(Number(slot.col || 0)).padStart(4, '0'),
    identityOf(stage),
  ].join('::');
}

function cssEscape(value: string): string {
  return String(value || '').replace(/["\\]/g, '\\$&');
}

function display(primary: unknown, fallback: unknown, empty: string): string {
  return String(primary || fallback || empty).trim();
}
