import { Injectable } from '@angular/core';
import { ViewExporter, ViewContent } from './exporters/view-exporter';
import { buildDocxFragment } from './fragments/docx-fragment';
import { buildMarkdown } from './fragments/md-fragment';
import { FragmentAssembler } from './fragments/fragment-assembler';
import { buildZip, downloadBlob } from './export-builders';

export interface ExportProgress {
  current: number;
  total: number;
  label: string;
  phase?: 'content' | 'capture' | 'assemble' | 'download';
}

export interface ExportZipFile {
  name: string;
  data: Uint8Array;
}

export function buildSingleViewZipFiles(
  label: string,
  content: ViewContent,
  screenshots: Uint8Array[],
): ExportZipFile[] {
  const encoder = new TextEncoder();
  const files: ExportZipFile[] = [
    { name: `${label}.md`, data: encoder.encode(buildMarkdown(content)) },
  ];
  screenshots.forEach((png, index) => {
    files.push({ name: `${label}-${index + 1}.png`, data: png });
  });
  return files;
}

export async function buildSingleViewDocxBlob(content: ViewContent, screenshots: Uint8Array[]): Promise<Blob> {
  const blob = await buildDocxFragment(content, screenshots);
  return new Blob([blob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** 确保 content.sections 中的 imageIndex 覆盖到 [0, imageCount) */
function ensureImageSections(content: ViewContent, imageCount: number): void {
  const maxIdx = content.sections.reduce(
    (max, s) => (s.type === 'image' && (s.imageIndex ?? 0) > max ? s.imageIndex! : max),
    -1,
  );
  for (let i = maxIdx + 1; i < imageCount; i++) {
    content.sections.push({ type: 'image', text: `截图 ${i + 1}`, imageIndex: i });
  }
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly encoder = new TextEncoder();
  private readonly assembler = new FragmentAssembler();

  /**
   * 导出单个视图：文本 + 截图 → DOCX 或 ZIP。
   *
   * - getContent() 获取结构化文本
   * - captureAll() / capture() 获取截图
   * - 按截图数补全 image section，保证 index 不越界
   */
  async exportView(
    exporter: ViewExporter,
    format: 'docx' | 'zip',
    onProgress?: (p: ExportProgress) => void,
  ): Promise<void> {
    onProgress?.({ current: 1, total: 4, label: exporter.label, phase: 'content' });
    const content = exporter.getContent();
    onProgress?.({ current: 2, total: 4, label: exporter.label, phase: 'capture' });
    const pngs = exporter.captureAll
      ? await exporter.captureAll((done, total, label) => {
        onProgress?.({ current: done, total, label: label || exporter.label, phase: 'capture' });
      })
      : [await exporter.capture()];

    // 防御：截图数 > content 中声明的 image 数时，自动补全 image section
    ensureImageSections(content, pngs.length);
    onProgress?.({ current: 3, total: 4, label: exporter.label, phase: 'assemble' });

    if (format === 'docx') {
      const blob = await buildSingleViewDocxBlob(content, pngs);
      onProgress?.({ current: 4, total: 4, label: exporter.label, phase: 'download' });
      downloadBlob(blob, `${exporter.label}.docx`);
    } else {
      const blob = buildZip(buildSingleViewZipFiles(exporter.label, content, pngs));
      onProgress?.({ current: 4, total: 4, label: exporter.label, phase: 'download' });
      downloadBlob(blob, `${exporter.label}.zip`);
    }
  }

  /**
   * 全部视图合并为一个文件。
   *
   * 收集所有 exporter 的 getContent() + captureAll()/capture()，
   * 通过 FragmentAssembler 合并为一份完整文档，下载 1 个文件。
   */
  async exportAll(
    exporters: ViewExporter[],
    format: 'docx' | 'md' = 'docx',
    onProgress?: (p: ExportProgress) => void,
  ): Promise<void> {
    const contents: ViewContent[] = [];
    const allScreenshots: Uint8Array[][] = [];

    for (let i = 0; i < exporters.length; i++) {
      const ex = exporters[i];
      onProgress?.({ current: i + 1, total: exporters.length, label: ex.label });

      const c = ex.getContent();
      const pngs = ex.captureAll ? await ex.captureAll() : [await ex.capture()];
      ensureImageSections(c, pngs.length);
      contents.push(c);
      allScreenshots.push(pngs);
    }

    if (format === 'docx') {
      const blob = await this.assembler.assembleAllDocx(contents, allScreenshots);
      downloadBlob(blob, 'full-document.docx');
    } else {
      const md = this.assembler.assembleAllMarkdown(contents);
      const blob = buildZip([{ name: 'full-document.md', data: this.encoder.encode(md) }]);
      downloadBlob(blob, 'full-document.zip');
    }
  }
}
