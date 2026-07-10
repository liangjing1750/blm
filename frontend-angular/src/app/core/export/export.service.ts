import { Injectable } from '@angular/core';
import { ViewExporter } from './exporters/view-exporter';
import { buildZip, buildSimpleDocx, downloadBlob } from './export-builders';

export interface ExportProgress {
  current: number;
  total: number;
  label: string;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly encoder = new TextEncoder();

  /** 导出单个视图 */
  async exportView(exporter: ViewExporter, format: 'docx' | 'zip'): Promise<void> {
    const png = await exporter.capture();
    const blob = format === 'docx'
      ? buildSimpleDocx(png, exporter.label)
      : buildZip([
          { name: `${exporter.label}.md`, data: this.encoder.encode(exporter.toMarkdown()) },
          { name: `${exporter.label}.png`, data: png },
        ]);
    const ext = format === 'docx' ? 'docx' : 'zip';
    downloadBlob(blob, `${exporter.label}.${ext}`);
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
}
