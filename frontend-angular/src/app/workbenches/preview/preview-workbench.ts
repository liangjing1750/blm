import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ApiService } from '../../core/api/api.service';
import { ExportGraphKind, exportGraphId } from '../../core/export/graph-export-registry';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import { WaitDialogComponent } from '../../core/shell/wait-dialog/wait-dialog.component';
import { sanitizeRichTextHtml } from '../../shared/rich-text/rich-text-utils';
import { PreviewGraphHostComponent } from './preview-graph-host.component';

interface PreviewOutlineItem {
  id: string;
  label: string;
  depth: 0 | 1 | 2;
}

@Component({
  selector: 'app-preview-workbench',
  standalone: true,
  imports: [CommonModule, WaitDialogComponent, PreviewGraphHostComponent],
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
  private readonly loadedPreviewSections = signal<Set<string>>(new Set());
  protected readonly title = computed(() => this.runtime.doc?.meta?.title || this.runtime.doc?.meta?.domain || this.runtime.currentFile || '未命名文档');
  protected readonly markdown = computed(() => this.buildMarkdown());
  protected readonly metaHtml = computed<SafeHtml>(() => this.trustedHtml(this.renderMeta(this.runtime.doc?.meta || {})));
  protected readonly outlineItems = computed<PreviewOutlineItem[]>(() => this.buildOutlineItems());

  protected toggleRaw(): void {
    this.showRaw.update((value) => !value);
    if (!this.showRaw()) window.setTimeout(() => this.initPreviewLazyRendering(), 0);
  }

  protected jumpTo(anchorId: string): void {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngAfterViewInit(): void {
  }

  ngOnDestroy(): void {
    this.previewLazyObserver?.disconnect();
  }

  protected roles(): any[] {
    return this.asArray(this.runtime.doc?.roles);
  }

  protected terms(): any[] {
    const doc = this.runtime.doc || {};
    return this.asArray(doc.terms || doc.language);
  }

  protected stages(): any[] {
    return this.asArray(this.runtime.doc?.stages);
  }

  protected processes(): any[] {
    return this.asArray(this.runtime.doc?.processes);
  }

  protected entities(): any[] {
    return this.asArray(this.runtime.doc?.entities);
  }

  protected components(): any[] {
    return this.asArray(this.runtime.doc?.businessComponents);
  }

  protected constructs(): any[] {
    return this.asArray(this.runtime.doc?.businessConstructs);
  }

  protected taskDefinitions(): any[] {
    return this.asArray(this.runtime.doc?.taskDefinitions);
  }

  protected services(): any[] {
    return this.asArray(this.runtime.doc?.applicationServices || this.runtime.doc?.appServices);
  }

  protected interfaces(): any[] {
    return this.asArray(this.runtime.doc?.applicationInterfaces || this.runtime.doc?.appInterfaces);
  }

  protected processAnchor(process: any, index: number): string {
    return this.anchorId('proc', this.identityOf(process, `process-${index + 1}`));
  }

  protected stageAnchor(stage: any, index: number): string {
    return this.anchorId('stage', this.identityOf(stage, `stage-${index + 1}`));
  }

  protected entityAnchor(entity: any, index: number): string {
    return this.anchorId('entity', this.identityOf(entity, `entity-${index + 1}`));
  }

  protected stageGraphId(kind: Extract<ExportGraphKind, 'stage-panorama' | 'stage-flow'>, stage?: any, index = 0): string {
    if (kind === 'stage-panorama') return exportGraphId(kind);
    const suffix = stage ? this.identityOf(stage, `stage-${index + 1}`) : 'panorama';
    return exportGraphId(kind, suffix);
  }

  protected processGraphId(process: any, index: number): string {
    return exportGraphId('process-flow', this.identityOf(process, `process-${index + 1}`));
  }

  protected entityGraphId(kind: Extract<ExportGraphKind, 'entity-relation' | 'entity-state'>, entity?: any, index = 0): string {
    const suffix = entity ? this.identityOf(entity, `entity-${index + 1}`) : 'overview';
    return exportGraphId(kind, kind === 'entity-relation' ? '' : suffix);
  }

  protected processNodes(process: any): any[] {
    return this.asArray(process?.nodes || process?.tasks || process?.steps);
  }

  protected richText(value: unknown): SafeHtml {
    return this.trustedHtml(this.richTextCell(value));
  }

  protected fieldRows(entity: any): any[] {
    return this.asArray(entity?.fields);
  }

  protected componentKindLabel(component: any): string {
    const value = String(component?.kind || component?.type || '').toLowerCase();
    if (value.includes('core') || value.includes('核心')) return '核心组件';
    if (value.includes('common') || value.includes('通用')) return '通用组件';
    return component?.kind || component?.type || '业务组件';
  }

  protected componentNameById(uid: unknown): string {
    const key = String(uid || '');
    const item = this.components().find((component) => this.identityOf(component, '') === key || component.uid === key || component.id === key);
    return item ? this.displayName(item, '未命名组件') : (key || '-');
  }

  protected constructNameById(uid: unknown): string {
    const key = String(uid || '');
    const item = this.constructs().find((construct) => this.identityOf(construct, '') === key || construct.uid === key || construct.id === key);
    return item ? this.displayName(item, '未命名构件') : (key || '-');
  }

  protected constructEntities(construct: any): any[] {
    const ids = new Set(this.asArray(construct?.entityUids || construct?.entities).map((item) => typeof item === 'string' ? item : this.identityOf(item, '')));
    return this.entities().filter((entity) => ids.has(this.identityOf(entity, '')) || entity.businessConstructUid === construct.uid || entity.constructUid === construct.uid);
  }

  protected constructTasks(construct: any): any[] {
    const ids = new Set(this.asArray(construct?.taskUids || construct?.tasks).map((item) => typeof item === 'string' ? item : this.identityOf(item, '')));
    return this.taskDefinitions().filter((task) => ids.has(this.identityOf(task, '')) || task.businessConstructUid === construct.uid || task.constructUid === construct.uid);
  }

  protected constructEntityNames(construct: any): string {
    return this.constructEntities(construct).map((entity) => this.displayName(entity, '未命名实体')).join('、') || '-';
  }

  protected constructTaskNames(construct: any): string {
    return this.constructTasks(construct).map((task) => this.displayName(task, '未命名任务')).join('、') || '-';
  }

  protected applicationInterfaceRows(service?: any): any[] {
    const serviceId = service ? this.identityOf(service, '') : '';
    return this.interfaces().filter((item) => !serviceId || item.serviceUid === serviceId || item.serviceId === serviceId || item.applicationServiceUid === serviceId);
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
    const outlinedProcessAnchors = new Set<string>();
    if (this.asArray(doc.roles).length) items.push({ id: 'preview-roles', label: '角色', depth: 0 });
    if (this.asArray(doc.terms || doc.language).length) items.push({ id: 'preview-language', label: '统一语言/术语表', depth: 0 });
    if (this.asArray(doc.stages).length) {
      items.push({ id: 'preview-stages', label: '业务全景', depth: 0 });
      items.push({ id: 'preview-stage-panorama', label: '全景视图', depth: 1 });
      this.asArray(doc.stages).forEach((stage, index) => {
        const stageId = this.identityOf(stage, `stage-${index + 1}`);
        items.push({ id: this.anchorId('stage', stageId), label: `阶段 · ${this.displayName(stage, '未命名业务阶段')}`, depth: 1 });
        this.stageProcessRefs(stage, doc).forEach((ref, refIndex) => {
          const process = this.findProcessByRef(ref, doc) || ref;
          const processAnchor = this.anchorId('proc', this.identityOf(process, `${stageId}-process-${refIndex + 1}`));
          if (!outlinedProcessAnchors.has(processAnchor)) {
            outlinedProcessAnchors.add(processAnchor);
            items.push({ id: processAnchor, label: `流程 · ${this.displayName(process, '未命名流程')}`, depth: 2 });
          }
        });
      });
    }
    if (this.asArray(doc.processes).length) {
      items.push({ id: 'preview-processes', label: '流程视图', depth: 0 });
      this.asArray(doc.processes).forEach((process, index) => {
        const processAnchor = this.anchorId('proc', this.identityOf(process, `process-${index + 1}`));
        if (!outlinedProcessAnchors.has(processAnchor)) {
          items.push({ id: processAnchor, label: this.displayName(process, '未命名流程'), depth: 1 });
        }
      });
    }
    if (this.asArray(doc.entities).length) {
      items.push({ id: 'preview-entities', label: '数据建模', depth: 0 });
      items.push({ id: 'preview-entity-overview', label: '实体关系图', depth: 1 });
      this.asArray(doc.entities).forEach((entity, index) => {
        items.push({ id: this.anchorId('entity', this.identityOf(entity, `entity-${index + 1}`)), label: this.displayName(entity, '未命名实体'), depth: 1 });
      });
    }
    if (this.asArray(doc.businessComponents).length || this.asArray(doc.businessConstructs).length || this.asArray(doc.taskDefinitions).length) {
      items.push({ id: 'preview-components', label: '构件建模', depth: 0 });
      if (this.asArray(doc.businessComponents).length) items.push({ id: 'preview-business-components', label: '业务组件', depth: 1 });
      if (this.asArray(doc.businessConstructs).length) items.push({ id: 'preview-business-constructs', label: '业务构件', depth: 1 });
      if (this.asArray(doc.taskDefinitions).length) items.push({ id: 'preview-task-definitions', label: '任务定义', depth: 1 });
    }
    if (this.services().length || this.interfaces().length) {
      items.push({ id: 'preview-applications', label: '应用建模', depth: 0 });
      if (this.services().length) items.push({ id: 'preview-application-services', label: '应用服务', depth: 1 });
      if (this.interfaces().length) items.push({ id: 'preview-application-interfaces', label: '应用接口', depth: 1 });
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
      this.renderStages(doc),
      this.renderProcesses(this.asArray(doc.processes)),
      this.renderEntities(doc),
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

  private renderStages(doc: any): string {
    const stages = this.asArray(doc.stages);
    if (!stages.length) return '';
    const panorama = this.previewLazySectionHtml('preview-stage-panorama', 'stage-panorama', '全景视图');
    return `<h2 id="preview-stages">全景与阶段视图</h2>${panorama}${stages.map((stage, index) => this.previewLazySectionHtml(
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
      ${node.description ? `<div class="pv-task-description">${this.richTextCell(node.description)}</div>` : ''}
      ${userSteps.length ? `<table><thead><tr><th>#</th><th>用户操作步骤</th><th>类型</th><th>条件/备注</th></tr></thead><tbody>${userSteps.map((step, stepIndex) => `
        <tr><td>${stepIndex + 1}</td><td>${this.esc(step.name || '')}</td><td>${this.esc(step.type || '')}</td><td>${this.richTextCell(step.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${tasks.length ? `<table><thead><tr><th>#</th><th>节点任务</th><th>业务构件</th><th>类型</th><th>目标</th><th>备注</th></tr></thead><tbody>${tasks.map((task, taskIndex) => `
        <tr><td>${taskIndex + 1}</td><td>${this.esc(task.name || '')}</td><td>${this.esc(task.constructName || task.constructUid || '')}</td><td>${this.esc(task.type || '')}</td><td>${this.esc(task.target || '')}</td><td>${this.richTextCell(task.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${businessRules.length ? `<div class="pv-rule-model"><h5>业务规则</h5><table class="pv-rule-table"><thead><tr><th>规则名称</th><th>规则内容</th></tr></thead><tbody>${businessRules.map((rule, ruleIndex) => `
        <tr><td>${this.esc(rule.name || `规则${ruleIndex + 1}`)}</td><td>${this.richTextCell(rule.content || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>`;
  }

  private renderEntities(doc: any): string {
    const entities = this.asArray(doc.entities);
    if (!entities.length) return '';
    const overview = this.previewLazySectionHtml('preview-entity-overview', 'entity-overview', '实体关系图');
    return `<h2 id="preview-entities">数据建模</h2>${overview}${entities.map((entity, index) => this.previewLazySectionHtml(
      this.anchorId('entity', this.identityOf(entity, `entity-${index + 1}`)),
      'entity',
      `实体: ${this.displayName(entity, '未命名实体')}`,
      index,
    )).join('')}`;
  }

  private previewLazySectionHtml(anchorId: string, kind: string, title: string, index = 0): string {
    if (this.loadedPreviewSections().has(anchorId)) {
      return this.renderPreviewSectionByKind(anchorId, kind, index);
    }
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
    const html = this.renderPreviewSectionByKind(anchorId, kind, index);
    if (!html) return;
    this.loadedPreviewSections.update((loaded) => new Set(loaded).add(anchorId));
    this.previewLazyObserver?.unobserve(el);
    el.outerHTML = html;
  }

  private ensureAllPreviewSections(): void {
    Array.from(document.querySelectorAll<HTMLElement>('[data-preview-lazy]'))
      .forEach((section) => this.ensurePreviewSection(section.id));
  }

  private renderPreviewSectionByKind(anchorId: string, kind: string, index: number): string {
    return kind === 'stage-panorama'
      ? this.renderStagePanorama(this.runtime.doc || {})
      : kind === 'stage'
        ? this.renderStageDetail(this.asArray(this.runtime.doc?.stages)[index], index)
        : kind === 'process'
          ? this.renderProcessDetail(this.asArray(this.runtime.doc?.processes)[index], index)
          : kind === 'entity-overview'
            ? this.renderEntityOverview(this.runtime.doc || {})
            : kind === 'entity'
              ? this.renderEntityDetail(this.asArray(this.runtime.doc?.entities)[index], index)
              : '';
  }

  private renderStageDetail(stage: any, index: number): string {
    if (!stage) return '';
    const refs = this.stageProcessRefs(stage, this.runtime.doc || {});
    return `<section id="${this.anchorId('stage', this.identityOf(stage, `stage-${index + 1}`))}" class="pv-stage-section" data-preview-loaded="true">
      <h3>阶段视图: ${this.esc(this.displayName(stage, '未命名业务阶段'))}</h3>
      <p class="pv-note"><strong>所属业务域</strong>: ${this.esc(stage.subDomain || stage.businessDomain || '—')} | <strong>流程数</strong>: ${refs.length}</p>
      ${this.renderStageFlowGraph(stage, refs, this.runtime.doc || {})}
    </section>`;
  }

  private renderProcessDetail(process: any, index: number): string {
    if (!process) return '';
    const nodes = this.asArray(process.nodes || process.tasks);
    return `<section id="${this.anchorId('proc', this.identityOf(process, `process-${index + 1}`))}" class="pv-process-section" data-preview-loaded="true">
      <h3>${this.esc(this.displayName(process, '未命名流程'))}</h3>
      ${this.renderProcessGraph(process)}
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
      ${this.renderEntityStateGraphs(entity)}
    </section>`;
  }

  // 模块意图：补齐旧版预览里的图形表达，Angular 侧只负责静态阅读视图，不接管建模运行时。
  // 关键流程：从文档结构归一化出节点、连线和矩阵格子，再复用统一 SVG 输出，保持懒加载替换边界。
  // 边界细节：这些图只读取当前 doc，不反向写状态；缺失连线时按节点顺序降级串联，避免空白预览。
  private renderStagePanorama(doc: any): string {
    const stages = this.asArray(doc.stages);
    const columns = this.panoramaAxis(doc, 'columns', 'panoramaColumnUid', '价值流');
    const lanes = this.panoramaAxis(doc, 'lanes', 'panoramaLaneUid', '业务域');
    return `<section id="preview-stage-panorama" class="pv-stage-section" data-preview-loaded="true">
      <h3>全景视图</h3>
      <div class="stage-graph value-stream-graph preview-value-stream-graph" data-testid="preview-stage-panorama">
        <div class="value-stream-scroll"><table class="preview-matrix"><thead><tr><th>业务域 / 价值流</th>${columns.map((column) => `<th>${this.esc(column.name)}</th>`).join('')}</tr></thead>
        <tbody>${lanes.map((lane) => `<tr><th>${this.esc(lane.name)}</th>${columns.map((column) => `<td>${this.renderPanoramaCell(doc, stages, lane.id, column.id)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </div>
    </section>`;
  }

  private renderPanoramaCell(doc: any, stages: any[], laneId: string, columnId: string): string {
    const cell = this.asArray(doc.panorama?.cells).find((item) => String(item?.laneId || item?.laneUid) === laneId && String(item?.columnId || item?.columnUid) === columnId);
    const firstLane = this.panoramaAxis(doc, 'lanes', 'panoramaLaneUid', '业务域')[0]?.id;
    const firstColumn = this.panoramaAxis(doc, 'columns', 'panoramaColumnUid', '价值流')[0]?.id;
    const matched = stages.filter((stage) => {
      const stageLane = String(stage.panoramaLaneUid || stage.laneUid || firstLane || '');
      const stageColumn = String(stage.panoramaColumnUid || stage.columnUid || firstColumn || '');
      return stageLane === laneId && stageColumn === columnId;
    });
    const stageList = matched.length ? `<ul class="preview-matrix-stage-list">${matched.map((stage) => `<li class="preview-matrix-stage"><strong>${this.esc(this.displayName(stage, '未命名阶段'))}</strong><em>${this.stageProcessRefs(stage, doc).length} 个流程</em></li>`).join('')}</ul>` : '';
    return `${cell?.status ? `<strong>${this.esc(cell.status)}</strong>` : ''}${cell?.text ? `<p>${this.esc(cell.text)}</p>` : ''}${stageList || '<span class="diag-empty">暂无阶段</span>'}`;
  }

  private renderStageFlowGraph(stage: any, refs: any[], doc: any): string {
    if (!refs.length) return '<div class="diag-empty">暂无阶段流程</div>';
    const nodeWidth = 62;
    const nodeHeight = 128;
    const gapX = 46;
    const rowGap = 34;
    const padX = 24;
    const padY = 38;
    const rowGroups = new Map<string, any[]>();
    refs.forEach((ref, index) => {
      const process = this.findProcessByRef(ref, doc);
      const group = String(process?.flowGroup || ref?.flowGroup || '').trim() || `__row_${index}`;
      rowGroups.set(group, [...(rowGroups.get(group) || []), { ref, process, index }]);
    });
    const flowNodes: Array<{ id: string; label: string; group: string; x: number; y: number }> = [];
    const groupBoxes: Array<{ group: string; label: string; x: number; y: number; width: number; height: number }> = [];
    Array.from(rowGroups.entries()).forEach(([group, items], rowIndex) => {
      const y = padY + rowIndex * (nodeHeight + rowGap);
      const namedGroup = !group.startsWith('__row_');
      if (namedGroup) {
        groupBoxes.push({ group, label: group, x: padX - 10, y: y - 18, width: Math.max(150, items.length * (nodeWidth + gapX) + 8), height: nodeHeight + 36 });
      }
      items.forEach((item, colIndex) => {
        const pos = item.ref?.pos || {};
        flowNodes.push({
          id: this.identityOf(item.ref, `ref-${item.index + 1}`),
          label: this.displayName(item.process || item.ref, `流程 ${item.index + 1}`),
          group,
          x: padX + colIndex * (nodeWidth + gapX) + Number(pos.x || 0),
          y: y + Number(pos.y || 0),
        });
      });
    });
    const byId = new Map(flowNodes.map((node) => [node.id, node]));
    const links = this.asArray(doc.stageFlowLinks)
      .filter((link) => this.matchesStage(stage, link))
      .map((link) => ({ from: String(link.fromRefUid || link.from || ''), to: String(link.toRefUid || link.to || '') }))
      .filter((link) => link.from && link.to);
    const fallbackLinks = links.length ? links : flowNodes.slice(1).map((node, index) => ({ from: flowNodes[index].id, to: node.id }));
    const width = Math.max(460, Math.max(...flowNodes.map((node) => node.x), 0) + nodeWidth + padX);
    const height = Math.max(220, Math.max(...flowNodes.map((node) => node.y), 0) + nodeHeight + padY);
    const paths = fallbackLinks.map((link) => {
      const from = byId.get(link.from);
      const to = byId.get(link.to);
      if (!from || !to) return '';
      const sx = from.x + nodeWidth;
      const sy = from.y + nodeHeight / 2;
      const tx = to.x;
      const ty = to.y + nodeHeight / 2;
      return `<path class="stage-graph-link stage-flow-link" d="M${sx} ${sy} C${sx + 34} ${sy}, ${tx - 34} ${ty}, ${tx} ${ty}" fill="none" marker-end="url(#preview-stage-arrow)"></path>`;
    }).join('');
    return `<div id="preview-stage-detail-${this.esc(this.identityOf(stage, 'stage'))}" class="stage-graph stage-flow-guide preview-stage-detail" data-testid="preview-stage-detail-${this.esc(this.identityOf(stage, 'stage'))}">
      <div class="stage-graph-zoom-shell stage-flow-zoom-shell">
        <div class="stage-graph-board stage-flow-board" style="width:${width}px;height:${height}px">
          <svg class="stage-graph-svg stage-flow-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs><marker id="preview-stage-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>
            ${paths}
          </svg>
          ${groupBoxes.map((box) => `<div class="stage-flow-group-box" data-testid="stage-flow-group" style="left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px"><span class="stage-flow-group-title">${this.esc(box.label)}</span></div>`).join('')}
          ${flowNodes.map((node) => `<div class="stage-graph-node process-kind stage-flow-node" data-testid="stage-graph-node" data-process-id="${this.esc(node.id)}" style="left:${node.x}px;top:${node.y}px;width:${nodeWidth}px;height:${nodeHeight}px"><span class="stage-flow-node-title">${this.esc(node.label)}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  private renderProcessGraph(process: any): string {
    const taskNodes = this.asArray(process.nodes || process.tasks);
    const flowNodes = this.asArray(process.flow?.nodes);
    const edges = this.asArray(process.flow?.edges || process.links || process.edges)
      .map((link) => ({ from: String(link.from || link.fromUid || link.source || ''), to: String(link.to || link.toUid || link.target || ''), label: String(link.label || link.condition || '') }))
      .filter((link) => link.from && link.to);
    const nodes = [
      { id: 'START', label: '开始', kind: 'terminal', role: '' },
      ...taskNodes.map((node, index) => ({ id: this.identityOf(node, `node-${index + 1}`), label: this.displayName(node, `节点 ${index + 1}`), kind: 'task', role: this.nodeRoleName(node) })),
      ...flowNodes.map((node, index) => ({ id: this.identityOf(node, `gateway-${index + 1}`), label: String(node.title || node.name || '+'), kind: 'gateway', role: this.nodeRoleName(node) })),
      { id: 'END', label: '结束', kind: 'terminal', role: '' },
    ];
    if (nodes.length <= 2) return '<div class="diag-empty">暂无流程图</div>';
    const nodeOrder = this.flowNodeOrder(nodes.map((node) => node.id), edges);
    const ordered = nodeOrder.map((id) => nodes.find((node) => node.id === id)).filter(Boolean) as typeof nodes;
    const lanes = Array.from(new Set(ordered.map((node) => node.role || '业务流程'))).map((name, index) => ({ name, y: index * 96 }));
    const laneByName = new Map(lanes.map((lane) => [lane.name, lane]));
    const placements = new Map<string, { x: number; y: number; w: number; h: number; kind: string }>();
    ordered.forEach((node, index) => {
      const lane = laneByName.get(node.role || '业务流程') || lanes[0];
      const kind = node.kind;
      const w = kind === 'gateway' ? 34 : kind === 'terminal' ? 50 : 132;
      const h = kind === 'gateway' ? 34 : kind === 'terminal' ? 20 : 54;
      placements.set(node.id, { x: 130 + index * 180, y: lane.y + 28, w, h, kind });
    });
    const width = Math.max(760, 220 + ordered.length * 180);
    const height = Math.max(140, lanes.length * 96);
    const edgeHtml = (edges.length ? edges : ordered.slice(1).map((node, index) => ({ from: ordered[index].id, to: node.id, label: '' }))).map((edge) => {
      const from = placements.get(edge.from);
      const to = placements.get(edge.to);
      if (!from || !to) return '';
      const sx = from.x + from.w;
      const sy = from.y + from.h / 2;
      const tx = to.x;
      const ty = to.y + to.h / 2;
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2 - 8;
      return `<path class="flow-edge" d="M${sx} ${sy} L${tx} ${ty}" marker-end="url(#preview-flow-arrow)"></path>${edge.label ? `<text class="flow-edge-label" x="${mx}" y="${my}">${this.esc(edge.label)}</text>` : ''}`;
    }).join('');
    return `<div id="pv-proc-${this.anchorId('proc-diag', this.identityOf(process, 'process'))}" class="pv-diag pv-proc-diag process-flow-view flow-readonly" data-testid="preview-process-graph">
      <div class="process-flow-canvas preview-process-flow" data-testid="preview-process-flow" style="width:${width}px;height:${height}px">
        ${lanes.map((lane) => `<div class="flow-lane" style="top:${lane.y}px;height:96px"><div class="flow-lane-title">${this.esc(lane.name)}</div></div>`).join('')}
        <svg class="flow-edges" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="preview-flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>${edgeHtml}</svg>
        ${ordered.map((node) => {
          const p = placements.get(node.id)!;
          if (p.kind === 'gateway') return `<div class="flow-gateway" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px"><span>${this.esc(node.label)}</span></div>`;
          if (p.kind === 'terminal') return `<div class="flow-terminal" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px">${this.esc(node.label)}</div>`;
          return `<div class="flow-node" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px"><strong>${this.esc(node.label)}</strong>${node.role ? `<small>${this.esc(node.role)}</small>` : ''}</div>`;
        }).join('')}
      </div>
    </div>`;
  }

  private renderEntityOverview(doc: any): string {
    const entities = this.asArray(doc.entities).map((entity, index) => ({ id: this.identityOf(entity, `entity-${index + 1}`), label: this.displayName(entity, `实体 ${index + 1}`), group: String(entity.group || entity.businessConstructUid || '未分组') }));
    if (!entities.length) return `<section id="preview-entity-overview" class="pv-entity-section" data-preview-loaded="true"><h3>实体关系图</h3><div class="diag-empty">暂无实体关系</div></section>`;
    const links = this.asArray(doc.relations || doc.entityRelations)
      .map((relation) => ({ from: String(relation.from || relation.fromEntityUid || relation.source || ''), to: String(relation.to || relation.toEntityUid || relation.target || ''), label: String(relation.label || relation.type || '') }))
      .filter((link) => link.from && link.to);
    const placements = new Map(entities.map((entity, index) => [entity.id, { x: 36 + (index % 4) * 190, y: 44 + Math.floor(index / 4) * 112, w: 138, h: 54 }]));
    const width = Math.max(760, Math.min(4, entities.length) * 190 + 80);
    const height = Math.max(180, Math.ceil(entities.length / 4) * 112 + 80);
    const paths = links.map((link) => {
      const from = placements.get(link.from);
      const to = placements.get(link.to);
      if (!from || !to) return '';
      const sx = from.x + from.w;
      const sy = from.y + from.h / 2;
      const tx = to.x;
      const ty = to.y + to.h / 2;
      return `<path class="entity-rel-line ef-rel" d="M${sx} ${sy} C${sx + 42} ${sy}, ${tx - 42} ${ty}, ${tx} ${ty}" marker-end="url(#preview-entity-arrow)"></path>`;
    }).join('');
    return `<section id="preview-entity-overview" class="pv-entity-section" data-preview-loaded="true"><h3>实体关系图</h3>
      <div id="pv-entity-diag" class="pv-diag pv-entity-diag entity-relation-canvas" data-testid="preview-entity-overview">
        <div class="entity-board ef-canvas" style="width:${width}px;height:${height}px">
          <svg class="entity-rel-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="preview-entity-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>${paths}</svg>
          ${entities.map((entity) => {
            const p = placements.get(entity.id)!;
            return `<div class="entity-node ef-node" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px"><strong>${this.esc(entity.label)}</strong><span>${this.esc(entity.group)}</span></div>`;
          }).join('')}
        </div>
      </div>
    </section>`;
  }

  private renderEntityStateGraphs(entity: any): string {
    const transitions = this.asArray(entity.state_transitions || entity.stateTransitions);
    if (!transitions.length) return '';
    const states = Array.from(new Set(transitions.flatMap((transition) => [transition.from, transition.to]).filter(Boolean).map(String)));
    const placements = new Map(states.map((state, index) => [state, { x: 50 + index * 160, y: 58, w: 112, h: 40 }]));
    const links = transitions.map((transition) => ({ from: String(transition.from || ''), to: String(transition.to || ''), label: String(transition.action || transition.label || '') })).filter((link) => link.from && link.to);
    const width = Math.max(520, states.length * 160 + 80);
    const paths = links.map((link) => {
      const from = placements.get(link.from);
      const to = placements.get(link.to);
      if (!from || !to) return '';
      const sx = from.x + from.w;
      const sy = from.y + from.h / 2;
      const tx = to.x;
      const ty = to.y + to.h / 2;
      return `<path class="entity-state-link" d="M${sx} ${sy} C${sx + 34} ${sy}, ${tx - 34} ${ty}, ${tx} ${ty}" marker-end="url(#preview-state-arrow)"></path>`;
    }).join('');
    return `<div class="pv-entity-state-graphs"><div class="pv-entity-state-graph" data-testid="preview-entity-state-graph"><h4>状态流转</h4>
      <div class="entity-state-board" style="width:${width}px;height:150px">
        <svg class="entity-state-svg" width="${width}" height="150" viewBox="0 0 ${width} 150"><defs><marker id="preview-state-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>${paths}</svg>
        ${states.map((state, index) => {
          const p = placements.get(state)!;
          return `<div class="entity-state-node ${index === 0 ? 'is-start' : ''}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px">${this.esc(state)}</div>`;
        }).join('')}
      </div>
    </div></div>`;
  }

  private renderSimpleGraph(nodes: Array<{ id: string; label: string }>, links: Array<{ from: string; to: string }>, testId: string, className: string, emptyText: string): string {
    if (!nodes.length) return `<div class="diag-empty">${this.esc(emptyText)}</div>`;
    const width = Math.max(420, nodes.length * 170 + 70);
    const height = 150;
    // 模块意图：预览页直接输出静态 SVG，不能依赖工作台运行态 CSS，否则导出和懒加载后的图形会退回 SVG 默认黑色填充。
    // 关键流程：节点、连线、箭头、文字都写入显式绘制属性，保证阶段图、流程图、实体图和状态图共用同一套可读底色。
    // 边界细节：这里先修复预览可读性；旧版复杂布局算法仍由后续迁移切片处理，避免把视觉配色修复和布局重写混在一起。
    const nodeFill = '#eff6ff';
    const nodeStroke = '#60a5fa';
    const textFill = '#1e3a8a';
    const edgeStroke = '#64748b';
    const placements = new Map(nodes.map((node, index) => [node.id, { x: 35 + index * 170, y: 48, w: 130, h: 52 }]));
    const fallbackLinks = links.length ? links : nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id }));
    const paths = fallbackLinks.map((link) => {
      const from = placements.get(link.from);
      const to = placements.get(link.to);
      if (!from || !to) return '';
      const startX = from.x + from.w;
      const startY = from.y + from.h / 2;
      const endX = to.x;
      const endY = to.y + to.h / 2;
      return `<path class="diagram-edge" d="M${startX} ${startY} C${startX + 36} ${startY}, ${endX - 36} ${endY}, ${endX} ${endY}" fill="none" stroke="${edgeStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow-${this.esc(testId)})"></path>`;
    }).join('');
    const boxes = nodes.map((node) => {
      const position = placements.get(node.id)!;
      return `<g class="diagram-node"><rect x="${position.x}" y="${position.y}" width="${position.w}" height="${position.h}" rx="10" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="1.2"></rect><text x="${position.x + position.w / 2}" y="${position.y + 31}" text-anchor="middle" fill="${textFill}" font-size="12" font-weight="700">${this.esc(this.truncate(node.label, 18))}</text></g>`;
    }).join('');
    return `<div class="${this.esc(className)}" data-testid="${this.esc(testId)}"><svg class="diagram-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="preview diagram"><defs><marker id="arrow-${this.esc(testId)}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${edgeStroke}"></path></marker></defs>${paths}${boxes}</svg></div>`;
  }

  private panoramaAxis(doc: any, key: 'columns' | 'lanes', stageKey: 'panoramaColumnUid' | 'panoramaLaneUid', fallbackName: string): Array<{ id: string; name: string }> {
    const fromModel = this.asArray(doc.panorama?.[key]).map((item, index) => ({ id: String(item.uid || item.id || `${key}-${index + 1}`), name: String(item.name || item.title || item.id || `${fallbackName}${index + 1}`) }));
    if (fromModel.length) return fromModel;
    const ids = Array.from(new Set(this.asArray(doc.stages).map((stage) => String(stage[stageKey] || '')).filter(Boolean)));
    if (ids.length) return ids.map((id) => ({ id, name: id }));
    return [{ id: `default-${key}`, name: fallbackName }];
  }

  private stageProcessRefs(stage: any, doc: any): any[] {
    const refs = this.asArray(doc.stageFlowRefs).filter((ref) => this.matchesStage(stage, ref));
    if (refs.length) return refs;
    return this.asArray(doc.processes).filter((process) => this.matchesStage(stage, process)).map((process) => ({ uid: this.identityOf(process, ''), processUid: process.uid, processId: process.id }));
  }

  private matchesStage(stage: any, item: any): boolean {
    const stageIds = [stage?.uid, stage?.id].filter(Boolean).map(String);
    const itemStageIds = [item?.stageUid, item?.stageId, item?.businessStageUid, item?.businessStageId].filter(Boolean).map(String);
    return stageIds.length > 0 && itemStageIds.some((id) => stageIds.includes(id));
  }

  private findProcessByRef(ref: any, doc: any): any {
    const ids = [ref?.processUid, ref?.processId, ref?.uid, ref?.id].filter(Boolean).map(String);
    return this.asArray(doc.processes).find((process) => ids.includes(String(process.uid || '')) || ids.includes(String(process.id || '')));
  }

  private truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  private nodeRoleName(node: any): string {
    const roleNames = this.asArray(node?.roles).filter(Boolean).map(String);
    return String(node?.role || node?.roleName || roleNames[0] || '').trim();
  }

  private flowNodeOrder(ids: string[], edges: Array<{ from: string; to: string }>): string[] {
    const uniqueIds = Array.from(new Set(ids));
    const outgoing = new Map<string, string[]>();
    edges.forEach((edge) => outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]));
    const result: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string): void => {
      if (!uniqueIds.includes(id) || seen.has(id)) return;
      seen.add(id);
      result.push(id);
      (outgoing.get(id) || []).forEach(visit);
    };
    visit('START');
    uniqueIds.forEach(visit);
    return result;
  }

  private renderComponents(doc: any): string {
    const components = this.asArray(doc.businessComponents);
    const constructs = this.asArray(doc.businessConstructs);
    const taskDefinitions = this.asArray(doc.taskDefinitions);
    if (!components.length && !constructs.length && !taskDefinitions.length) return '';
    return `<h2 id="preview-components">组件构件</h2>
      ${components.length ? `<h3>业务组件</h3><table><thead><tr><th>组件</th><th>类型</th><th>说明</th></tr></thead><tbody>${components.map((item) => `<tr><td>${this.esc(item.name || '')}</td><td>${this.esc(item.kind || '')}</td><td>${this.esc(item.desc || item.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${constructs.length ? `<h3>业务构件</h3><table><thead><tr><th>构件</th><th>所属组件</th><th>说明</th></tr></thead><tbody>${constructs.map((item) => `<tr><td>${this.esc(item.name || '')}</td><td>${this.esc(item.businessComponentUid || '')}</td><td>${this.esc(item.desc || item.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${taskDefinitions.length ? `<h3>任务定义</h3><table><thead><tr><th>任务</th><th>构件</th><th>地址</th><th>目标</th><th>参数</th><th>详细设计</th></tr></thead><tbody>${taskDefinitions.map((item) => `<tr><td>${this.esc(item.name || '')}</td><td>${this.esc(item.constructUid || item.businessConstructUid || '')}</td><td>${this.esc(item.address || '')}</td><td>${this.esc(item.target || '')}</td><td>${this.esc(this.taskParameterSummary(item.parameters))}</td><td>${this.richTextCell(item.note || '')}</td></tr>`).join('')}</tbody></table>` : ''}`;
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

  protected taskParameterSummary(parameters: any): string {
    const inputs = this.asArray(parameters?.inputs).length;
    const outputs = this.asArray(parameters?.outputs).length;
    return `入参 ${inputs} · 出参 ${outputs}`;
  }

  private previewRichTextHtml(value: unknown): string {
    return sanitizeRichTextHtml(value);
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
    const style = this.sanitizeRichTextStyle(element.getAttribute('style') || '');
    return `<${tag}${style ? ` style="${style}"` : ''}>${children}</${tag}>`;
  }

  private sanitizeRichTextStyle(style: string): string {
    const allowed = 'color|background-color|text-align|font-weight|margin-left|padding-left'.split('|');
    return style
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf(':');
        if (separator < 1) return '';
        const property = part.slice(0, separator).trim().toLowerCase();
        const value = part.slice(separator + 1).trim();
        if (!allowed.includes(property) || !value || /url\s*\(|expression\s*\(|javascript:|[<>]/i.test(value)) return '';
        if (property === 'text-align' && !/^(left|right|center|justify)$/i.test(value)) return '';
        if ((property === 'margin-left' || property === 'padding-left') && !/^-?\d+(\.\d+)?(px|em|rem|%)$/i.test(value)) return '';
        return `${property}:${this.esc(value)}`;
      })
      .filter(Boolean)
      .join(';');
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

  protected displayName(item: any, fallback: string): string {
    return String(item?.name || '').trim() || fallback;
  }

  protected identityOf(item: any, fallback: string): string {
    return String(item?.uid || item?.id || fallback);
  }

  protected asArray<T = any>(value: T[] | null | undefined): T[] {
    return Array.isArray(value) ? value : [];
  }

  private trustedHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
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
