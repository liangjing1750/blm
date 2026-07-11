import { ViewExporter, ViewContent, ViewSection } from './view-exporter';

export class PanoramaExporter implements ViewExporter {
  readonly label = 'panorama';

  /** 旧接口 — 保留兼容 */
  toMarkdown(): string {
    return buildMarkdownString(this.getContent());
  }

  /** 新接口：从文档数据提取结构化内容 */
  getContent(): ViewContent {
    const doc = (window as any).__ngDocument || {};
    const pan = doc.panorama || {};
    const cols = pan.columns || [{ name: '默认', uid: 'c1' }];
    const lanes = pan.lanes || [{ name: '默认', uid: 'l1' }];
    const stages = doc.stages || [];
    const sections: ViewSection[] = [];

    sections.push({ type: 'heading1', text: '全景视图' });

    // 引言上下文：与预览大纲的"引言 → 全景视图"结构对齐
    if (doc.meta?.domain || doc.meta?.title) {
      const metaParts: string[] = [];
      if (doc.meta.title) metaParts.push(`文档：${doc.meta.title}`);
      if (doc.meta.domain) metaParts.push(`业务域：${doc.meta.domain}`);
      if (doc.meta.author) metaParts.push(`作者：${doc.meta.author}`);
      sections.push({ type: 'heading2', text: '引言' });
      sections.push({ type: 'paragraph', text: metaParts.join('　') });
    }

    // 全景矩阵表
    const headerRow = ['业务域 / 价值流', ...cols.map((c: any) => c.name || c.uid)];
    const dataRows: string[][] = [];

    for (const lane of lanes) {
      const row = [lane.name || lane.uid];
      for (const col of cols) {
        const matched = stages.filter((s: any) =>
          String(s.panoramaLaneUid || s.laneUid) === String(lane.uid || lane.id) &&
          String(s.panoramaColumnUid || s.columnUid) === String(col.uid || col.id)
        );
        row.push(matched.length ? matched.map((s: any) => s.name).join('、') : '—');
      }
      dataRows.push(row);
    }

    sections.push({
      type: 'table',
      headers: headerRow,
      rows: dataRows,
    });

    // 价值流 / 业务域说明
    const colNotes = cols
      .map((c: any) => c.scope || c.badge)
      .filter(Boolean);
    const laneNotes = lanes
      .map((l: any) => l.note || l.badge)
      .filter(Boolean);
    if (colNotes.length > 0 || laneNotes.length > 0) {
      sections.push({ type: 'heading2', text: '矩阵说明' });
      if (colNotes.length > 0) {
        sections.push({ type: 'paragraph', text: `价值流：${colNotes.join('；')}` });
      }
      if (laneNotes.length > 0) {
        sections.push({ type: 'paragraph', text: `业务域：${laneNotes.join('；')}` });
      }
    }

    // 阶段列表（合并为一条 sections，items 包含所有阶段）
    if (stages.length > 0) {
      sections.push({ type: 'heading2', text: '业务阶段' });
      const stageItems = stages.map((s: any) => {
        const name = s.name || s.uid || '未命名';
        return s.subDomain ? `${name}（${s.subDomain}）` : name;
      });
      sections.push({ type: 'list', items: stageItems });
    }

    // 业务组件
    const components = doc.businessComponents || [];
    if (components.length > 0) {
      sections.push({ type: 'heading2', text: '业务组件' });
      const compItems = components.map((c: any) => {
        const kind = c.kind === 'generic' ? '通用' : '核心';
        const count = (c.businessConstructIds || c.constructIds || []).length;
        return `${c.name || c.uid || '未命名'}（${kind}，${count} 个业务构件）`;
      });
      sections.push({ type: 'list', items: compItems });
    }

    // 截图占位
    sections.push({ type: 'image', text: '全景视图截图', imageIndex: 0 });

    return { title: '全景视图', sections };
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
    const zoomEl = el.closest<HTMLElement>('[data-testid="panorama-zoom-canvas"]');
    const oldZoom = zoomEl?.style.zoom;
    if (zoomEl) zoomEl.style.zoom = '1';
    const oldOverflow = el.style.overflow;
    el.style.overflow = 'visible';

    try {
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

/** 从 ViewContent 生成旧式 markdown 字符串（保持兼容） */
function buildMarkdownString(content: ViewContent): string {
  const lines: string[] = [];
  for (const section of content.sections) {
    switch (section.type) {
      case 'heading1': lines.push(`# ${section.text}\n`); break;
      case 'heading2': lines.push(`## ${section.text}\n`); break;
      case 'heading3': lines.push(`### ${section.text}\n`); break;
      case 'paragraph': lines.push(`${section.text}\n`); break;
      case 'list':
        for (const item of section.items || []) {
          lines.push(`- ${item}\n`);
        }
        lines.push('');
        break;
      case 'table': {
        if (!section.headers) break;
        lines.push(`| ${section.headers.join(' | ')} |\n`);
        lines.push(`|${section.headers.map(() => '---').join('|')}|\n`);
        for (const row of section.rows || []) {
          lines.push(`| ${row.join(' | ')} |\n`);
        }
        lines.push('');
        break;
      }
      case 'image':
        lines.push(`![${section.text || '截图'}](screenshot-${(section.imageIndex ?? 0) + 1}.png)\n`);
        break;
    }
  }
  return lines.join('');
}
