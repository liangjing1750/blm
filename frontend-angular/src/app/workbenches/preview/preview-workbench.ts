import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import { WaitDialogComponent } from '../../core/shell/wait-dialog/wait-dialog.component';

interface PreviewItem {
  id: string;
  name: string;
  meta: string;
}

@Component({
  selector: 'app-preview-workbench',
  standalone: true,
  imports: [CommonModule, WaitDialogComponent],
  templateUrl: './preview-workbench.html',
  styleUrl: './preview-workbench.scss',
})
export class PreviewWorkbench {
  // 模块意图：提供 Angular 版文档预览和导出入口，本地导出负责快速检查，后端导出负责完整文档包。
  // 关键流程：从 runtime 只读获取当前文档；JSON/Markdown 生成本地 Blob；ZIP 文档包复用后端已保存文档导出接口。
  // 边界细节：本组件不保存、不同步、不自行组装附件；DOCX 异步任务和进度等待态留给后续完整导出切片。
  private readonly api = inject(ApiService);
  protected readonly runtime = getAngularRuntimeState();
  protected readonly exportWait = signal<{ title: string; description: string } | null>(null);
  protected readonly title = computed(() => this.runtime.doc?.meta?.title || this.runtime.doc?.meta?.domain || this.runtime.currentFile || '未命名文档');
  protected readonly summary = computed(() => {
    const doc = this.runtime.doc || {};
    return [
      { label: '角色', value: this.asArray(doc.roles).length },
      { label: '阶段', value: this.asArray(doc.stages).length },
      { label: '流程', value: this.asArray(doc.processes).length },
      { label: '实体', value: this.asArray(doc.entities).length },
      { label: '构件', value: this.asArray(doc.businessComponents).length },
      { label: '任务', value: this.asArray(doc.taskDefinitions).length },
    ];
  });
  protected readonly processes = computed<PreviewItem[]>(() => this.asArray(this.runtime.doc?.processes).map((process, index) => ({
    id: this.identityOf(process, `process-${index + 1}`),
    name: String(process?.name || `流程 ${index + 1}`),
    meta: `节点 ${this.asArray(process?.nodes || process?.tasks).length}`,
  })));
  protected readonly entities = computed<PreviewItem[]>(() => this.asArray(this.runtime.doc?.entities).map((entity, index) => ({
    id: this.identityOf(entity, `entity-${index + 1}`),
    name: String(entity?.name || `实体 ${index + 1}`),
    meta: `字段 ${this.asArray(entity?.fields).length}`,
  })));

  protected exportJson(): void {
    const content = JSON.stringify(this.runtime.doc || {}, null, 2);
    this.download(content, 'application/json;charset=utf-8', `${this.baseFileName()}.json`);
  }

  protected exportMarkdown(): void {
    this.download(this.buildMarkdown(), 'text/markdown;charset=utf-8', `${this.baseFileName()}.md`);
  }

  protected async exportBundle(): Promise<void> {
    if (!this.runtime.currentFile) return;
    const response = await this.api.exportBundle(this.runtime.currentFile);
    if (!response.ok) return;
    const blob = await response.blob();
    this.downloadBlob(blob, this.responseFilename(response) || `${this.baseFileName()}.zip`);
  }

  protected async exportDocx(): Promise<void> {
    if (!this.runtime.currentFile) return;
    this.exportWait.set({
      title: '正在提交 DOCX 导出任务...',
      description: '系统会冻结当前已保存版本，并在生成完成后自动下载。',
    });
    try {
      const job = await this.api.startDocxExport(this.runtime.currentFile);
      if (!job?.id) return;
      const latestJob = await this.waitForDocxJob(job.id, job);
      if (latestJob?.status !== 'done') return;
      this.exportWait.set({
        title: 'DOCX 已生成，正在下载...',
        description: latestJob.message || '正在把生成结果交给浏览器下载。',
      });
      const response = await this.api.downloadExportJob(job.id);
      if (!response.ok) return;
      const blob = await response.blob();
      this.downloadBlob(blob, latestJob.filename || this.responseFilename(response) || `${this.baseFileName()}.docx`);
    } finally {
      this.exportWait.set(null);
    }
  }

  private buildMarkdown(): string {
    const lines = [`# ${this.title()}`, '', '## 概览'];
    this.summary().forEach((item) => lines.push(`- ${item.label}: ${item.value}`));
    lines.push('', '## 流程');
    this.processes().forEach((item) => lines.push(`- ${item.name}: ${item.meta}`));
    lines.push('', '## 实体');
    this.entities().forEach((item) => lines.push(`- ${item.name}: ${item.meta}`));
    return `${lines.join('\n')}\n`;
  }

  private download(content: string, type: string, filename: string): void {
    const blob = new Blob([content], { type });
    this.downloadBlob(blob, filename);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  private responseFilename(response: Response): string {
    const disposition = response.headers.get('Content-Disposition') || response.headers.get('content-disposition') || '';
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/"/g, ''));
    const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
    return asciiMatch?.[1] || '';
  }

  private async waitForDocxJob(jobId: string, initialJob: any): Promise<any> {
    let latestJob = initialJob;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (latestJob?.status === 'done' || latestJob?.status === 'failed') return latestJob;
      this.exportWait.set({
        title: '正在生成 DOCX...',
        description: latestJob?.message || '正在转换图形并嵌入附件，请耐心等待。',
      });
      latestJob = await this.api.exportJob(jobId);
      if (latestJob?.status === 'done' || latestJob?.status === 'failed') return latestJob;
      await this.delay(100);
    }
    return latestJob;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private baseFileName(): string {
    return String(this.runtime.currentFile || this.title() || 'blm-document').replace(/\.json$/i, '') || 'blm-document';
  }

  private identityOf(item: any, fallback: string): string {
    return String(item?.uid || item?.id || fallback);
  }

  private asArray<T = any>(value: T[] | null | undefined): T[] {
    return Array.isArray(value) ? value : [];
  }
}
