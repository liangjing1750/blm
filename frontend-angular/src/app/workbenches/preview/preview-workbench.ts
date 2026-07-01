import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ApiService } from '../../core/api/api.service';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import { WaitDialogComponent } from '../../core/shell/wait-dialog/wait-dialog.component';

interface PreviewOutlineItem {
  id: string;
  label: string;
  depth: 0 | 1;
}

@Component({
  selector: 'app-preview-workbench',
  standalone: true,
  imports: [CommonModule, WaitDialogComponent],
  templateUrl: './preview-workbench.html',
  styleUrl: './preview-workbench.scss',
})
export class PreviewWorkbench implements AfterViewInit, OnDestroy {
  // 模块意图：复刻旧版预览页的阅读式框架，同时保持 Angular 运行时和导出链路的单向依赖。
  // 关键流程：左侧大纲由文档结构生成，右侧正文直接渲染为阅读 HTML，原文 MD 与导出复用同一份 Markdown。
  // 边界细节：正文 HTML 由本组件统一转义字段后生成，再放行旧版懒加载所需的 data-* 标记。
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private previewLazyObserver: IntersectionObserver | null = null;
  protected readonly runtime = getAngularRuntimeState();
  protected readonly exportWait = signal<{ title: string; description: string } | null>(null);
  protected readonly showRaw = signal(false);
  protected readonly title = computed(() => this.runtime.doc?.meta?.title || this.runtime.doc?.meta?.domain || this.runtime.currentFile || '未命名文档');
  protected readonly markdown = computed(() => this.buildMarkdown());
  protected readonly renderedHtml = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(this.renderDocumentHtml()));
  protected readonly outlineItems = computed<PreviewOutlineItem[]>(() => this.buildOutlineItems());

  protected toggleRaw(): void {
    this.showRaw.update((value) => !value);
    if (!this.showRaw()) window.setTimeout(() => this.initPreviewLazyRendering(), 0);
  }

  protected jumpTo(anchorId: string): void {
    this.ensurePreviewSection(anchorId);
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngAfterViewInit(): void {
    window.setTimeout(() => this.initPreviewLazyRendering(), 0);
  }

  ngOnDestroy(): void {
    this.previewLazyObserver?.disconnect();
  }

  protected exportJson(): void {
    const content = JSON.stringify(this.runtime.doc || {}, null, 2);
    this.download(content, 'application/json;charset=utf-8', `${this.baseFileName()}.json`);
  }

  protected exportMarkdown(): void {
    this.download(this.markdown(), 'text/markdown;charset=utf-8', `${this.baseFileName()}.md`);
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

  private buildOutlineItems(): PreviewOutlineItem[] {
    const doc = this.runtime.doc || {};
    const items: PreviewOutlineItem[] = [{ id: 'preview-top', label: this.title(), depth: 0 }];
    if (this.asArray(doc.roles).length) items.push({ id: 'preview-roles', label: '角色', depth: 0 });
    if (this.asArray(doc.terms || doc.language).length) items.push({ id: 'preview-language', label: '统一语言/术语表', depth: 0 });
    if (this.asArray(doc.stages).length) {
      items.push({ id: 'preview-stages', label: '全景与阶段视图', depth: 0 });
      this.asArray(doc.stages).forEach((stage, index) => {
        items.push({ id: this.anchorId('stage', this.identityOf(stage, `stage-${index + 1}`)), label: `阶段视图 · ${this.displayName(stage, '未命名业务阶段')}`, depth: 1 });
      });
    }
    if (this.asArray(doc.processes).length) {
      items.push({ id: 'preview-processes', label: '流程视图', depth: 0 });
      this.asArray(doc.processes).forEach((process, index) => {
        items.push({ id: this.anchorId('proc', this.identityOf(process, `process-${index + 1}`)), label: this.displayName(process, '未命名流程'), depth: 1 });
      });
    }
    if (this.asArray(doc.entities).length) {
      items.push({ id: 'preview-entities', label: '数据建模', depth: 0 });
      this.asArray(doc.entities).forEach((entity, index) => {
        items.push({ id: this.anchorId('entity', this.identityOf(entity, `entity-${index + 1}`)), label: this.displayName(entity, '未命名实体'), depth: 1 });
      });
    }
    if (this.asArray(doc.businessComponents).length || this.asArray(doc.businessConstructs).length || this.asArray(doc.taskDefinitions).length) {
      items.push({ id: 'preview-components', label: '组件构件', depth: 0 });
    }
    return items;
  }

  private renderDocumentHtml(): string {
    const doc = this.runtime.doc || {};
    return [
      `<h1 id="preview-top">${this.esc(this.title())}</h1>`,
      this.renderMeta(doc.meta || {}),
      this.renderRoles(this.asArray(doc.roles)),
      this.renderLanguage(this.asArray(doc.terms || doc.language)),
      this.renderStages(this.asArray(doc.stages)),
      this.renderProcesses(this.asArray(doc.processes)),
      this.renderEntities(this.asArray(doc.entities)),
      this.renderComponents(doc),
    ].filter(Boolean).join('');
  }

  private renderMeta(meta: any): string {
    const parts = [];
    if (meta.domain) parts.push(`<strong>业务域</strong>: ${this.esc(meta.domain)}`);
    if (meta.author) parts.push(`<strong>作者</strong>: ${this.esc(meta.author)}`);
    if (meta.date) parts.push(`<strong>日期</strong>: ${this.esc(meta.date)}`);
    return parts.length ? `<p class="pv-meta">${parts.join(' | ')}</p>` : '';
  }

  private renderRoles(roles: any[]): string {
    if (!roles.length) return '';
    return `<h2 id="preview-roles">角色</h2><table><thead><tr><th>角色</th><th>分组</th><th>说明</th><th>所属业务组件</th></tr></thead><tbody>${roles.map((role) => `
      <tr><td>${this.esc(role.name || role.id || '')}</td><td>${this.esc(role.group || '')}</td><td>${this.esc(role.desc || role.description || '')}</td><td>${this.esc(this.asArray(role.subDomains).join('、'))}</td></tr>`).join('')}</tbody></table>`;
  }

  private renderLanguage(items: any[]): string {
    if (!items.length) return '';
    return `<h2 id="preview-language">统一语言/术语表</h2><table><thead><tr><th>术语</th><th>定义</th></tr></thead><tbody>${items.map((item) => `
      <tr><td>${this.esc(item.term || item.name || '')}</td><td>${this.esc(item.definition || item.desc || '')}</td></tr>`).join('')}</tbody></table>`;
  }

  private renderStages(stages: any[]): string {
    if (!stages.length) return '';
    return `<h2 id="preview-stages">全景与阶段视图</h2>${stages.map((stage, index) => this.previewLazySectionHtml(
      this.anchorId('stage', this.identityOf(stage, `stage-${index + 1}`)),
      'stage',
      `阶段视图: ${this.displayName(stage, '未命名业务阶段')}`,
      index,
    )).join('')}`;
  }

  private renderProcesses(processes: any[]): string {
    if (!processes.length) return '';
    return `<h2 id="preview-processes">流程视图</h2>${processes.map((process, index) => this.previewLazySectionHtml(
      this.anchorId('proc', this.identityOf(process, `process-${index + 1}`)),
      'process',
      this.displayName(process, '未命名流程'),
      index,
    )).join('')}`;
  }

  private renderProcessNode(node: any, index: number): string {
    const userSteps = this.asArray(node.userSteps || node.steps);
    const tasks = this.asArray(node.orchestrationTasks || node.tasks || node.taskDefinitions);
    const businessRules = this.normalizedBusinessRules(node);
    return `<div class="pv-task-detail">
      <h4>流程节点: ${this.esc(this.displayName(node, `未命名节点 ${index + 1}`))}${node.roleName ? ` <span class="pv-role">(${this.esc(node.roleName)})</span>` : ''}</h4>
      ${userSteps.length ? `<table><thead><tr><th>#</th><th>用户操作步骤</th><th>类型</th><th>条件/备注</th></tr></thead><tbody>${userSteps.map((step, stepIndex) => `
        <tr><td>${stepIndex + 1}</td><td>${this.esc(step.name || '')}</td><td>${this.esc(step.type || '')}</td><td>${this.richTextCell(step.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${tasks.length ? `<table><thead><tr><th>#</th><th>节点任务</th><th>业务构件</th><th>类型</th><th>目标</th><th>备注</th></tr></thead><tbody>${tasks.map((task, taskIndex) => `
        <tr><td>${taskIndex + 1}</td><td>${this.esc(task.name || '')}</td><td>${this.esc(task.constructName || task.constructUid || '')}</td><td>${this.esc(task.type || '')}</td><td>${this.esc(task.target || '')}</td><td>${this.richTextCell(task.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${businessRules.length ? `<div class="pv-rule-model"><h5>业务规则</h5><table class="pv-rule-table"><thead><tr><th>规则名称</th><th>规则内容</th></tr></thead><tbody>${businessRules.map((rule, ruleIndex) => `
        <tr><td>${this.esc(rule.name || `规则${ruleIndex + 1}`)}</td><td>${this.richTextCell(rule.content || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`;
  }

  private renderEntities(entities: any[]): string {
    if (!entities.length) return '';
    return `<h2 id="preview-entities">数据建模</h2>${entities.map((entity, index) => this.previewLazySectionHtml(
      this.anchorId('entity', this.identityOf(entity, `entity-${index + 1}`)),
      'entity',
      `实体: ${this.displayName(entity, '未命名实体')}`,
      index,
    )).join('')}`;
  }

  private previewLazySectionHtml(anchorId: string, kind: string, title: string, index = 0): string {
    return `<section id="${this.esc(anchorId)}" class="pv-lazy-section" data-preview-lazy="${this.esc(kind)}" data-preview-index="${index}" data-preview-loaded="false">
      <h3>${this.esc(title)}</h3>
      <div class="pv-lazy-placeholder"><span>滚动到这里或点击大纲后生成内容</span></div>
    </section>`;
  }

  private initPreviewLazyRendering(): void {
    this.previewLazyObserver?.disconnect();
    const root = document.getElementById('preview-rendered');
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-preview-lazy]'));
    if (!root || !sections.length || typeof IntersectionObserver === 'undefined') return;
    this.previewLazyObserver = new IntersectionObserver((entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry) => this.ensurePreviewSection((entry.target as HTMLElement).id));
    }, { root, rootMargin: '600px 0px', threshold: 0.01 });
    sections.forEach((section) => this.previewLazyObserver?.observe(section));
  }

  private ensurePreviewSection(anchorId: string): void {
    const el = document.getElementById(anchorId) as HTMLElement | null;
    if (!el || el.dataset['previewLoaded'] === 'true') return;
    const kind = el.dataset['previewLazy'] || '';
    const index = Number(el.dataset['previewIndex'] || 0) || 0;
    const html = kind === 'stage'
      ? this.renderStageDetail(this.asArray(this.runtime.doc?.stages)[index], index)
      : kind === 'process'
        ? this.renderProcessDetail(this.asArray(this.runtime.doc?.processes)[index], index)
        : kind === 'entity'
          ? this.renderEntityDetail(this.asArray(this.runtime.doc?.entities)[index], index)
          : '';
    if (!html) return;
    this.previewLazyObserver?.unobserve(el);
    el.outerHTML = html;
  }

  private renderStageDetail(stage: any, index: number): string {
    if (!stage) return '';
    const processCount = this.asArray(this.runtime.doc?.stageFlowRefs).filter((ref) => ref.stageUid === stage.uid || ref.stageId === stage.uid).length;
    return `<section id="${this.anchorId('stage', this.identityOf(stage, `stage-${index + 1}`))}" class="pv-stage-section" data-preview-loaded="true">
      <h3>阶段视图: ${this.esc(this.displayName(stage, '未命名业务阶段'))}</h3>
      <p class="pv-note"><strong>所属业务域</strong>: ${this.esc(stage.subDomain || stage.businessDomain || '—')} | <strong>流程数</strong>: ${processCount}</p>
    </section>`;
  }

  private renderProcessDetail(process: any, index: number): string {
    if (!process) return '';
    const nodes = this.asArray(process.nodes || process.tasks);
    return `<section id="${this.anchorId('proc', this.identityOf(process, `process-${index + 1}`))}" class="pv-process-section" data-preview-loaded="true">
      <h3>${this.esc(this.displayName(process, '未命名流程'))}</h3>
      ${process.trigger || process.outcome ? `<p class="pv-note"><strong>触发</strong>: ${this.esc(process.trigger || '—')} -> <strong>预期结果</strong>: ${this.esc(process.outcome || '—')}</p>` : ''}
      ${nodes.length ? `<div class="pv-tasks">${nodes.map((node, nodeIndex) => this.renderProcessNode(node, nodeIndex)).join('')}</div>` : '<div class="diag-empty">暂无流程节点</div>'}
    </section>`;
  }

  private renderEntityDetail(entity: any, index: number): string {
    if (!entity) return '';
    return `<section id="${this.anchorId('entity', this.identityOf(entity, `entity-${index + 1}`))}" class="pv-entity-section" data-preview-loaded="true">
      <h3>实体: ${this.esc(this.displayName(entity, '未命名实体'))}</h3>
      ${entity.note ? `<p class="pv-note">${this.esc(entity.note)}</p>` : ''}
      ${this.asArray(entity.fields).length ? `<table><thead><tr><th>字段</th><th>类型</th><th>主键</th><th>说明</th></tr></thead><tbody>${this.asArray(entity.fields).map((field) => `
        <tr><td>${this.esc(field.name || '')}</td><td>${this.esc(field.type || '')}</td><td class="pv-center">${field.is_key || field.isKey ? '✓' : ''}</td><td>${this.esc(field.note || field.desc || '')}</td></tr>`).join('')}</tbody></table>` : ''}
    </section>`;
  }

  private renderComponents(doc: any): string {
    const components = this.asArray(doc.businessComponents);
    const constructs = this.asArray(doc.businessConstructs);
    const taskDefinitions = this.asArray(doc.taskDefinitions);
    if (!components.length && !constructs.length && !taskDefinitions.length) return '';
    return `<h2 id="preview-components">组件构件</h2>
      ${components.length ? `<h3>业务组件</h3><table><thead><tr><th>组件</th><th>类型</th><th>说明</th></tr></thead><tbody>${components.map((item) => `<tr><td>${this.esc(item.name || '')}</td><td>${this.esc(item.kind || '')}</td><td>${this.esc(item.desc || item.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${constructs.length ? `<h3>业务构件</h3><table><thead><tr><th>构件</th><th>所属组件</th><th>说明</th></tr></thead><tbody>${constructs.map((item) => `<tr><td>${this.esc(item.name || '')}</td><td>${this.esc(item.businessComponentUid || '')}</td><td>${this.esc(item.desc || item.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${taskDefinitions.length ? `<h3>任务定义</h3><table><thead><tr><th>任务</th><th>构件</th><th>技术承接</th></tr></thead><tbody>${taskDefinitions.map((item) => `<tr><td>${this.esc(item.name || '')}</td><td>${this.esc(item.constructUid || item.businessConstructUid || '')}</td><td>${this.renderTechnicalHandover(item.technicalHandover)}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }

  private buildMarkdown(): string {
    const doc = this.runtime.doc || {};
    const lines = [`# ${this.title()}`, '', '## 概览'];
    [
      ['角色', this.asArray(doc.roles).length],
      ['阶段', this.asArray(doc.stages).length],
      ['流程', this.asArray(doc.processes).length],
      ['实体', this.asArray(doc.entities).length],
      ['构件', this.asArray(doc.businessConstructs).length || this.asArray(doc.businessComponents).length],
      ['任务', this.asArray(doc.taskDefinitions).length],
    ].forEach(([label, value]) => lines.push(`- ${label}: ${value}`));
    lines.push('', '## 流程');
    this.asArray(doc.processes).forEach((item) => lines.push(`- ${this.displayName(item, '未命名流程')}: 节点 ${this.asArray(item.nodes || item.tasks).length}`));
    lines.push('', '## 实体');
    this.asArray(doc.entities).forEach((item) => lines.push(`- ${this.displayName(item, '未命名实体')}: 字段 ${this.asArray(item.fields).length}`));
    return `${lines.join('\n')}\n`;
  }

  private richTextCell(value: unknown): string {
    return `<div class="rich-text-rendered pv-rich-text">${this.previewRichTextHtml(value)}</div>`;
  }

  private normalizedBusinessRules(node: any): Array<{ name: string; content: string }> {
    return this.asArray(node.businessRules)
      .map((rule, index) => typeof rule === 'string'
        ? { name: `规则${index + 1}`, content: rule }
        : { name: String(rule?.name || '').trim(), content: String(rule?.content || rule?.description || rule?.note || '').trim() })
      .filter((rule) => rule.name || rule.content);
  }

  private renderTechnicalHandover(handover: any): string {
    if (!handover) return '';
    if (typeof handover === 'string') return this.richTextCell(handover);
    const summary = [handover.summary, handover.runtimeKind, handover.target]
      .filter(Boolean)
      .map((item) => this.esc(item))
      .join(' / ');
    const detail = handover.designDescription || handover.description || handover.detail || handover.note || '';
    return `${summary ? `<div class="pv-note">${summary}</div>` : ''}${detail ? `<div class="pv-technical-design">${this.previewRichTextHtml(detail)}</div>` : ''}`;
  }

  private previewRichTextHtml(value: unknown): string {
    const raw = String(value ?? '');
    if (!raw.trim()) return '';
    if (!/<[a-z][\s\S]*>/i.test(raw)) return this.esc(raw).replace(/\r?\n/g, '<br>');
    const template = document.createElement('template');
    template.innerHTML = raw;
    return Array.from(template.content.childNodes).map((node) => this.sanitizeRichTextNode(node)).join('');
  }

  private sanitizeRichTextNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return this.esc(node.textContent || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes).map((child) => this.sanitizeRichTextNode(child)).join('');
    const allowedTags = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'ol', 'ul', 'li', 'p', 'br', 'div', 'span', 'blockquote', 'code', 'pre']);
    if (!allowedTags.has(tag)) return children;
    if (tag === 'br') return '<br>';
    return `<${tag}>${children}</${tag}>`;
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

  private anchorId(prefix: string, value: string): string {
    const safe = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
    return `preview-${prefix}-${safe}`;
  }

  private baseFileName(): string {
    return String(this.runtime.currentFile || this.title() || 'blm-document').replace(/\.json$/i, '') || 'blm-document';
  }

  private displayName(item: any, fallback: string): string {
    return String(item?.name || '').trim() || fallback;
  }

  private identityOf(item: any, fallback: string): string {
    return String(item?.uid || item?.id || fallback);
  }

  private asArray<T = any>(value: T[] | null | undefined): T[] {
    return Array.isArray(value) ? value : [];
  }

  private esc(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
