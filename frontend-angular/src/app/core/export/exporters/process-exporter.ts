import { BlmDocument, Process } from '../../document/document.model';
import { identityOf } from '../../document/document-model';
import { buildNodeContent } from './node-exporter';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

export interface ProcessExportBuildOptions {
  headingPrefix?: string;
}

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
export function buildProcessContent(
  document: BlmDocument,
  process: Process,
  options: ProcessExportBuildOptions = {},
): ViewContent {
  void options;
  const processTitle = display(process.name, identityOf(process), '未命名流程');
  const trigger = display((process as any).trigger, '', '');
  const outcome = display((process as any).outcome, '', '');
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

  if (!trigger && !outcome) sections.splice(1, 1);

  (process.nodes || []).forEach((node, index) => {
    sections.push(...buildNodeContent(document, node, {
      process,
      headingPrefix: '',
    }).sections);
  });

  return { title: `流程：${processTitle}`, sections };
}

export async function captureProcessFlowGraph(graphId = ''): Promise<Uint8Array> {
  if (typeof document === 'undefined') return new Uint8Array();
  const selector = graphId
    ? `[data-export-graph-id="${cssEscape(graphId)}"]`
    : '[data-testid="process-flow-canvas"]';
  // 模块意图：局部流程导出可以截当前画布，阶段/价值流批量导出必须截指定流程的隐藏画布。
  // 关键流程：一旦调用方传入 graphId，就只允许命中对应 data-export-graph-id，不能退回页面当前流程。
  // 边界细节：否则隐藏预渲染尚未就绪或 id 失配时，会把当前流程图误当成被遍历流程的截图。
  const el = document.querySelector<HTMLElement>(selector) ||
    (graphId ? null : document.querySelector<HTMLElement>('[data-testid="process-flow-canvas"]'));
  if (!el) return new Uint8Array();

  return captureProcessElement(el);
}

async function captureProcessElement(el: HTMLElement): Promise<Uint8Array> {
  const bounds = processContentBounds(el);
  if (!bounds) return captureFullElement(el);
  const full = await captureFullElement(el);
  return cropCapturedPng(full, bounds, {
    width: el.scrollWidth || el.offsetWidth,
    height: el.scrollHeight || el.offsetHeight,
  }).catch(() => full);
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

async function cropCapturedPng(
  bytes: Uint8Array,
  region: { x: number; y: number; width: number; height: number },
  sourceSize: { width: number; height: number },
): Promise<Uint8Array> {
  if (typeof document === 'undefined') return bytes;
  const blob = new Blob([bytesToArrayBuffer(bytes)], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const ratioX = sourceSize.width > 0 ? img.naturalWidth / sourceSize.width : 1;
    const ratioY = sourceSize.height > 0 ? img.naturalHeight / sourceSize.height : 1;
    const sx = Math.max(0, Math.round(region.x * ratioX));
    const sy = Math.max(0, Math.round(region.y * ratioY));
    const sw = Math.min(img.naturalWidth - sx, Math.max(1, Math.round(region.width * ratioX)));
    const sh = Math.min(img.naturalHeight - sy, Math.max(1, Math.round(region.height * ratioY)));
    if (sw <= 0 || sh <= 0) return bytes;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return bytes;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
      canvas.toBlob((cropped) => {
        if (!cropped) reject(new Error('Failed to crop process screenshot'));
        else resolve(cropped.arrayBuffer());
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
    img.onerror = () => reject(new Error('Failed to load process screenshot'));
    img.src = url;
  });
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

export function processContentBounds(el: HTMLElement): { x: number; y: number; width: number; height: number } | null {
  const targets = Array.from(el.querySelectorAll<HTMLElement>(
    '.flow-lane-title, .shared-badge, [data-testid="process-flow-terminal"], [data-testid="process-flow-node"], [data-testid="process-flow-gateway"], [data-testid="process-flow-edge-label"]',
  ));
  if (!targets.length) return null;

  const hostRect = el.getBoundingClientRect();
  const rects = targets
    .map((target) => target.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;

  const pad = 72;
  const minX = Math.max(0, Math.floor(Math.min(...rects.map((rect) => rect.left)) - hostRect.left - pad));
  const minY = Math.max(0, Math.floor(Math.min(...rects.map((rect) => rect.top)) - hostRect.top - pad));
  const maxX = Math.min(
    el.scrollWidth || el.offsetWidth,
    Math.ceil(Math.max(...rects.map((rect) => rect.right)) - hostRect.left + pad),
  );
  const maxY = Math.min(
    el.scrollHeight || el.offsetHeight,
    Math.ceil(Math.max(...rects.map((rect) => rect.bottom)) - hostRect.top + pad),
  );
  const width = Math.max(320, maxX - minX);
  const height = Math.max(220, maxY - minY);
  return { x: minX, y: minY, width, height };
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
