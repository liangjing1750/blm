import { BlmDocument, Process, Stage, StageFlowRef } from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { exportGraphId } from '../graph-export-registry';
import { buildProcessContent, captureFullElement, captureProcessFlowGraph } from './process-exporter';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

export interface StageExportBuildOptions {
  headingPrefix?: string;
}

interface StageProcessEntry {
  process: Process;
  order: number;
}

export class StageExporter implements ViewExporter {
  readonly label: string;

  constructor(
    private readonly document: BlmDocument,
    private readonly stage: Stage,
    private readonly graphId = '',
  ) {
    this.label = `stage-${safeFileSegment(stage.name || identityOf(stage) || 'unknown')}`;
  }

  toMarkdown(): string {
    return this.getContent().sections
      .map((section) => section.text || '')
      .filter(Boolean)
      .join('\n');
  }

  getContent(): ViewContent {
    return buildStageContent(this.document, this.stage);
  }

  async capture(): Promise<Uint8Array> {
    return captureStageGraph(this.graphId || exportGraphId('stage-flow', identityOf(this.stage)));
  }

  async captureAll(onProgress?: (done: number, total: number, label?: string) => void): Promise<Uint8Array[]> {
    const screenshots: Uint8Array[] = [await this.capture()];
    const processes = processesForStageContentOrder(this.document, this.stage);
    onProgress?.(1, Math.max(1, processes.length + 1), `阶段视图：${display(this.stage.name, identityOf(this.stage), '')}`);
    for (const process of processes) {
      screenshots.push(await captureProcessFlowGraph(exportGraphId('process-flow', identityOf(process))));
      onProgress?.(screenshots.length, processes.length + 1, `流程图：${display(process.name, identityOf(process), '')}`);
    }
    return screenshots;
  }
}

/**
 * 模块意图：阶段导出负责补齐“阶段截图 + 流程组 + 流程片段”，流程和节点的正文仍复用既有导出器。
 * 关键流程：阶段自身输出二级标题和阶段视图图片，之后按 flowGroup 分组，把 buildProcessContent() 的图片索引整体后移。
 * 边界细节：节点标题层级由 NodeExporter 维护，这里只处理阶段/流程组/流程三层，避免局部导出重复定义节点格式。
 */
export function buildStageContent(
  document: BlmDocument,
  stage: Stage,
  options: StageExportBuildOptions = {},
): ViewContent {
  void options;
  const stageTitle = display(stage.name, identityOf(stage), '未命名阶段');
  const sections: ViewSection[] = [
    { type: 'heading2', text: `阶段：${stageTitle}` },
    { type: 'image', text: `阶段视图：${stageTitle}`, imageIndex: 0 },
  ];

  let imageOffset = 1;
  groupedStageProcesses(document, stage).forEach((group, groupIndex) => {
    sections.push({ type: 'heading3', text: `流程组：${group.name}` });
    group.processes.forEach((process, processIndex) => {
      const processContent = buildProcessContent(document, process, {
        headingPrefix: '',
      });
      sections.push(...offsetImageSections(processContent.sections, imageOffset));
      imageOffset += countImages(processContent.sections);
    });
  });

  return { title: `阶段：${stageTitle}`, sections };
}

export function processesForStage(document: BlmDocument, stage: Stage): Process[] {
  return groupedStageEntries(document, stage).map((entry) => entry.process);
}

export function processesForStageContentOrder(document: BlmDocument, stage: Stage): Process[] {
  return groupedStageProcesses(document, stage).flatMap((group) => group.processes);
}

function groupedStageProcesses(document: BlmDocument, stage: Stage): Array<{ name: string; processes: Process[] }> {
  const groups = new Map<string, Process[]>();
  for (const entry of groupedStageEntries(document, stage)) {
    const groupName = display((entry.process as any).flowGroup, '', '未分组流程');
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(entry.process);
  }
  return [...groups.entries()].map(([name, processes]) => ({ name, processes }));
}

function groupedStageEntries(document: BlmDocument, stage: Stage): StageProcessEntry[] {
  const stageKeys = objectKeys(stage);
  const processByKey = new Map<string, Process>();
  for (const process of document.processes || []) {
    for (const key of objectKeys(process)) processByKey.set(key, process);
  }

  const entries: StageProcessEntry[] = [];
  const seen = new Set<string>();
  for (const ref of document.stageFlowRefs || []) {
    if (!matchesStageRef(ref, stageKeys)) continue;
    const process = processByKey.get(String((ref as any).processUid || '')) ||
      processByKey.get(String((ref as any).processId || ''));
    if (!process) continue;
    const id = identityOf(process);
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ process, order: Number((ref as any).order || entries.length + 1) });
  }

  for (const process of document.processes || []) {
    const processStageId = String((process as any).stageUid || (process as any).stageId || '').trim();
    const id = identityOf(process);
    if (!processStageId || !stageKeys.has(processStageId) || seen.has(id)) continue;
    seen.add(id);
    entries.push({ process, order: entries.length + 1 });
  }

  return entries.sort((left, right) => left.order - right.order);
}

function matchesStageRef(ref: StageFlowRef, stageKeys: Set<string>): boolean {
  return stageKeys.has(String((ref as any).stageUid || '').trim()) ||
    stageKeys.has(String((ref as any).stageId || '').trim());
}

function offsetImageSections(sections: ViewSection[], offset: number): ViewSection[] {
  return sections.map((section) => section.type === 'image'
    ? { ...section, imageIndex: (section.imageIndex ?? 0) + offset }
    : section);
}

function countImages(sections: ViewSection[]): number {
  return sections.filter((section) => section.type === 'image').length;
}

async function captureStageGraph(graphId = ''): Promise<Uint8Array> {
  if (typeof document === 'undefined') return new Uint8Array();
  const selector = graphId
    ? `[data-export-graph-id="${cssEscape(graphId)}"]`
    : '.stage-flow-board[data-export-graph-ready="true"]';
  const el = document.querySelector<HTMLElement>(selector) ||
    document.querySelector<HTMLElement>('.stage-flow-board[data-export-graph-ready="true"]') ||
    document.querySelector<HTMLElement>('[data-testid="stage-detail-graph"]');
  if (!el) return new Uint8Array();
  return captureFullElement(el);
}

function objectKeys(value: { uid?: string; id?: string; name?: string }): Set<string> {
  return new Set([value.uid, value.id, identityOf(value), value.name].filter(Boolean).map(String));
}

function display(primary: unknown, fallback: unknown, empty: string): string {
  return String(primary || fallback || empty).trim();
}

function safeFileSegment(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function cssEscape(value: string): string {
  return String(value || '').replace(/["\\]/g, '\\$&');
}
