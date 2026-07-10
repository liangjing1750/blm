import { ViewExporter } from './view-exporter';

export class PanoramaExporter implements ViewExporter {
  readonly label = 'panorama';

  /** 从全景视图 DOM 生成结构化 Markdown */
  toMarkdown(): string {
    const doc = (window as any).__ngDocument || {};
    const pan = doc.panorama || {};
    const cols = pan.columns || [{ name: '默认', uid: 'c1' }];
    const lanes = pan.lanes || [{ name: '默认', uid: 'l1' }];
    const stages = doc.stages || [];
    const lines: string[] = [];
    lines.push('# 全景视图\n');
    lines.push(`| 业务域 / 价值流 | ${cols.map((c: any) => c.name || c.uid).join(' | ')} |\n`);
    lines.push(`|${cols.map(() => '---').join('|')}|\n`);
    for (const lane of lanes) {
      const row = [lane.name || lane.uid];
      for (const col of cols) {
        const matched = stages.filter((s: any) =>
          String(s.panoramaLaneUid || s.laneUid) === String(lane.uid || lane.id) &&
          String(s.panoramaColumnUid || s.columnUid) === String(col.uid || col.id)
        );
        row.push(matched.length ? matched.map((s: any) => s.name).join('、') : '—');
      }
      lines.push(`| ${row.join(' | ')} |\n`);
    }
    return lines.join('');
  }

  /** base64 → Uint8Array */
  private dataUrlToBytes(dataUrl: string): Uint8Array {
    const raw = atob(dataUrl.split(',')[1]);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf;
  }

  /** 截取全景视图 DOM 区域 */
  async capture(): Promise<Uint8Array> {
    const el = document.querySelector<HTMLElement>('[data-testid="panorama-overview-rich"]');
    if (!el) throw new Error('panorama element not found');
    // 禁用 CSS zoom，html2canvas/dom-to-image 对 zoom 渲染不准确
    const zoomEl = el.closest<HTMLElement>('[data-testid="panorama-zoom-canvas"]');
    const oldZoom = zoomEl?.style.zoom;
    if (zoomEl) zoomEl.style.zoom = '1';
    // 禁用可能影响布局的 CSS 属性
    const oldOverflow = el.style.overflow;
    el.style.overflow = 'visible';

    try {
      // 优先用 dom-to-image-more（文本渲染更精确），失败降级 html2canvas
      try {
        const domtoimage = (await import('dom-to-image-more')).default;
        return this.dataUrlToBytes(await domtoimage.toPng(el, {
          scale: 2, style: { backgroundColor: '#ffffff', overflow: 'visible' },
        }));
      } catch {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        return new Uint8Array(await new Promise<ArrayBuffer>((r) =>
          canvas.toBlob((b) => r(b!.arrayBuffer()), 'image/png')!
        ));
      }
    } finally {
      if (zoomEl) zoomEl.style.zoom = oldZoom ?? '';
      el.style.overflow = oldOverflow;
    }
  }
}
