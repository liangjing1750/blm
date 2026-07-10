import { Injectable } from '@angular/core';
import { ViewExporter } from './exporters/view-exporter';
import { buildZip, buildSimpleDocx, buildRichDocx, DocxBlock, downloadBlob } from './export-builders';

export interface ExportProgress {
  current: number;
  total: number;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly encoder = new TextEncoder();

  /** 导出单个视图：富文本 + 截图 → DOCX */
  async exportView(exporter: ViewExporter, format: 'docx' | 'zip'): Promise<void> {
    const png = await exporter.capture();
    if (format === 'docx') {
      // 将 markdown 文本 + 截图合并为富文本 DOCX
      const blocks = this._markdownToBlocks(exporter.toMarkdown());
      blocks.push({ type: 'image', imageData: png, imageName: exporter.label });
      const blob = buildRichDocx(blocks, exporter.label);
      downloadBlob(blob, `${exporter.label}.docx`);
    } else {
      const blob = buildZip([
        { name: `${exporter.label}.md`, data: this.encoder.encode(exporter.toMarkdown()) },
        { name: `${exporter.label}.png`, data: png },
      ]);
      downloadBlob(blob, `${exporter.label}.zip`);
    }
  }

  /** 导出全部（遍历所有导出器），onProgress 回调用于更新进度 */
  async exportAll(
    exporters: ViewExporter[],
    format: 'docx' | 'zip' = 'zip',
    onProgress?: (p: ExportProgress) => void,
  ): Promise<void> {
    for (let i = 0; i < exporters.length; i++) {
      const ex = exporters[i];
      onProgress?.({ current: i + 1, total: exporters.length, label: ex.label });
      await this.exportView(ex, format);
    }
  }

  /** 简易 Markdown → DocxBlock[] 转换 */
  private _markdownToBlocks(md: string): DocxBlock[] {
    const blocks: DocxBlock[] = [];
    for (const line of md.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 表格行
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        // 跳过表格分隔行（|---|）
        if (/^\|[\s:-]+\|$/.test(trimmed)) continue;
        blocks.push({ type: 'paragraph', text: trimmed });
        continue;
      }

      if (trimmed.startsWith('### ')) {
        blocks.push({ type: 'heading3', text: trimmed.slice(4) });
      } else if (trimmed.startsWith('## ')) {
        blocks.push({ type: 'heading2', text: trimmed.slice(3) });
      } else if (trimmed.startsWith('# ')) {
        blocks.push({ type: 'heading1', text: trimmed.slice(2) });
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        blocks.push({ type: 'list', text: trimmed.slice(2) });
      } else if (/^\d+[.、]/.test(trimmed)) {
        blocks.push({ type: 'list', text: trimmed });
      } else if (trimmed.startsWith('> ')) {
        blocks.push({ type: 'paragraph', text: trimmed.slice(2) });
      } else if (trimmed === '---') {
        // 分隔线 -> 空段落
        blocks.push({ type: 'paragraph', text: '' });
      } else {
        blocks.push({ type: 'paragraph', text: trimmed });
      }
    }
    return blocks;
  }
}
