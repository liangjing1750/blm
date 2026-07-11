import { BlmDocument, Process } from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { buildNodeContent } from './node-exporter';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

export class ProcessExporter implements ViewExporter {
  readonly label: string;

  constructor(
    private readonly document: BlmDocument,
    private readonly process: Process,
    private readonly graphId = '',
  ) {
    this.label = `process-${safeFileSegment(process.name || identityOf(process) || 'unknown')}`;
  }

  toMarkdown(): string {
    return this.getContent().sections
      .map((section) => section.text || '')
      .filter(Boolean)
      .join('\n');
  }

  getContent(): ViewContent {
    return buildProcessContent(this.document, this.process);
  }

  async capture(): Promise<Uint8Array> {
    return captureProcessFlowGraph(this.graphId);
  }

  async captureAll(): Promise<Uint8Array[]> {
    return [await this.capture()];
  }
}

/**
 * 模块意图：流程导出只组合“流程图截图 + 节点内容”，节点字段仍由 NodeExporter 维护。
 * 关键流程：流程自身输出四级标题和流程图 image，然后按流程节点顺序拼接 buildNodeContent() 的五级节点片段。
 * 边界细节：阶段/价值流标题不在这里补齐，避免局部流程导出冒充上层上下文。
 */
export function buildProcessContent(document: BlmDocument, process: Process): ViewContent {
  const processTitle = display(process.name, identityOf(process), '未命名流程');
  const sections: ViewSection[] = [
    { type: 'heading4', text: `流程：${processTitle}` },
    {
      type: 'table',
      headers: ['字段', '内容'],
      rows: [
        ['触发', display((process as any).trigger, '', '')],
        ['预期', display((process as any).outcome, '', '')],
      ],
    },
    { type: 'image', text: `流程图：${processTitle}`, imageIndex: 0 },
  ];

  for (const node of process.nodes || []) {
    sections.push(...buildNodeContent(document, node, { process }).sections);
  }

  return { title: `流程：${processTitle}`, sections };
}

export async function captureProcessFlowGraph(graphId = ''): Promise<Uint8Array> {
  if (typeof document === 'undefined') return new Uint8Array();
  const selector = graphId
    ? `[data-export-graph-id="${cssEscape(graphId)}"]`
    : '[data-testid="process-flow-canvas"]';
  const el = document.querySelector<HTMLElement>(selector) ||
    document.querySelector<HTMLElement>('[data-testid="process-flow-canvas"]');
  if (!el) return new Uint8Array();

  return captureFullElement(el);
}

export async function captureFullElement(el: HTMLElement): Promise<Uint8Array> {
  const restoreFns: Array<() => void> = [];
  prepareElementForFullCapture(el, restoreFns);
  try {
    try {
      const domtoimage = (await import('dom-to-image-more')).default;
      return dataUrlToBytes(await domtoimage.toPng(el, {
        width: el.scrollWidth || el.offsetWidth,
        height: el.scrollHeight || el.offsetHeight,
        style: {
          width: `${el.scrollWidth || el.offsetWidth}px`,
          height: `${el.scrollHeight || el.offsetHeight}px`,
          overflow: 'visible',
          zoom: '1',
        },
        bgcolor: '#ffffff',
      }));
    } catch {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
        width: el.scrollWidth || el.offsetWidth,
        height: el.scrollHeight || el.offsetHeight,
        windowWidth: el.scrollWidth || el.offsetWidth,
        windowHeight: el.scrollHeight || el.offsetHeight,
        scrollX: 0,
        scrollY: 0,
      });
      return new Uint8Array(await new Promise<ArrayBuffer>((resolve) =>
        canvas.toBlob((blob) => resolve(blob!.arrayBuffer()), 'image/png'),
      ));
    }
  } finally {
    restoreFns.reverse().forEach((restore) => restore());
  }
}

function prepareElementForFullCapture(el: HTMLElement, restoreFns: Array<() => void>): void {
  const oldZoom = el.style.zoom;
  const oldOverflow = el.style.overflow;
  el.style.zoom = '1';
  el.style.overflow = 'visible';
  restoreFns.push(() => {
    el.style.zoom = oldZoom;
    el.style.overflow = oldOverflow;
  });

  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const oldParentOverflow = parent.style.overflow;
    const oldParentMaxHeight = parent.style.maxHeight;
    const oldParentMaxWidth = parent.style.maxWidth;
    parent.style.overflow = 'visible';
    parent.style.maxHeight = 'none';
    parent.style.maxWidth = 'none';
    const target = parent;
    restoreFns.push(() => {
      target.style.overflow = oldParentOverflow;
      target.style.maxHeight = oldParentMaxHeight;
      target.style.maxWidth = oldParentMaxWidth;
    });
    parent = parent.parentElement;
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
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
