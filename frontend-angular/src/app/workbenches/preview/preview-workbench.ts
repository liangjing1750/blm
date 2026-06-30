import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';

interface PreviewItem {
  id: string;
  name: string;
  meta: string;
}

@Component({
  selector: 'app-preview-workbench',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preview-workbench.html',
  styleUrl: './preview-workbench.scss',
})
export class PreviewWorkbench {
  // 模块意图：提供 Angular 版文档预览和基础导出，替代旧前端的预览占位状态。
  // 关键流程：从 runtime 只读获取当前文档，生成可扫描摘要，并把导出限制在浏览器本地 Blob。
  // 边界细节：本组件不保存、不同步、不调用后端导出任务；DOCX/ZIP 仍留给后续完整导出切片。
  protected readonly runtime = getAngularRuntimeState();
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
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
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
