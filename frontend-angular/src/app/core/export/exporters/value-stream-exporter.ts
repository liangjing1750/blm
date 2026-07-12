import { BlmDocument, Stage } from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { exportGraphId } from '../graph-export-registry';
import { buildStageContent, StageExporter } from './stage-exporter';
import { captureFullElement } from './process-exporter';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

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

  async captureAll(): Promise<Uint8Array[]> {
    const screenshots: Uint8Array[] = [await this.capture()];
    for (const stage of stagesForValueStream(this.document)) {
      screenshots.push(...await new StageExporter(this.document, stage).captureAll());
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
    { type: 'heading1', text: '价值流环节' },
    { type: 'image', text: '价值流视图', imageIndex: 0 },
  ];

  let imageOffset = 1;
  for (const stage of stagesForValueStream(document)) {
    const stageContent = buildStageContent(document, stage);
    sections.push(...offsetImageSections(stageContent.sections, imageOffset));
    imageOffset += countImages(stageContent.sections);
  }

  return { title: '价值流环节', sections };
}

export function stagesForValueStream(document: BlmDocument): Stage[] {
  const stages = (document.stages || []).filter((stage: any) => !stage?.virtual);
  return [...stages].sort((left: any, right: any) => {
    const leftKey = stageOrderKey(left);
    const rightKey = stageOrderKey(right);
    return leftKey.localeCompare(rightKey);
  });
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
