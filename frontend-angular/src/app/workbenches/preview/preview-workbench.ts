import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { sanitizeRichTextHtml } from '../../shared/rich-text/rich-text-utils';
import { ApiService } from '../../core/api/api.service';
import { ExportGraphKind, exportGraphId } from '../../core/export/graph-export-registry';
import { confirmRuntimeAction, getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import { buildDocxFragment } from '../../core/export/fragments/docx-fragment';
import { downloadBlob } from '../../core/export/export-builders';
import { ViewContent, ViewSection } from '../../core/export/exporters/view-exporter';
import { WaitDialogComponent } from '../../core/shell/wait-dialog/wait-dialog.component';
import { PreviewGraphHostComponent } from './preview-graph-host.component';

interface PreviewOutlineItem {
  id: string;
  label: string;
  depth: 0 | 1 | 2 | 3;
  number: string;
}

@Component({
  selector: 'app-preview-workbench',
  standalone: true,
  imports: [CommonModule, WaitDialogComponent, PreviewGraphHostComponent],
  templateUrl: './preview-workbench.html',
  styleUrl: './preview-workbench.scss',
})
export class PreviewWorkbench {
  // 模块意图：复刻旧版预览页的阅读式框架，同时保持 Angular 运行时和导出链路的单向依赖。
  // 关键流程：左侧大纲由文档结构生成，右侧正文直接渲染为阅读 HTML，原文 MD 与导出复用同一份 Markdown。
  // 边界细节：正文 HTML 由本组件统一转义字段后生成，再放行旧版懒加载所需的 data-* 标记。
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly runtime = getAngularRuntimeState();
  protected readonly exportWait = signal<{ title: string; description: string; progress?: number; remainingSeconds?: number } | null>(null);
  protected readonly showRaw = signal(false);
  protected readonly collapsedOutlineIds = signal<Set<string>>(new Set());
  protected readonly title = computed(() => this.runtime.doc?.meta?.title || this.runtime.doc?.meta?.domain || this.runtime.currentFile || '未命名文档');
  protected readonly markdown = computed(() => this.buildMarkdown());
  protected readonly metaHtml = computed<SafeHtml>(() => this.trustedHtml(this.renderMeta(this.runtime.doc?.meta || {})));
  protected readonly outlineItems = computed<PreviewOutlineItem[]>(() => this.buildOutlineItems());

  /** 根据大纲条目 ID 获取序号，正文标题使用 */
  protected outlineNumber(id: string): string {
    const items = this.outlineItems();
    const found = items.find((item) => item.id === id);
    return found?.number || '';
  }

  /** 流程组在 outline 中的 anchor ID，与 buildOutlineItems 保持一致 */
  protected groupAnchorId(stage: any, groupName: string): string {
    const stageId = this.identityOf(stage, `stage-${this.stages().indexOf(stage)}`);
    return `preview-group-${stageId}-${groupName}`;
  }

  /** 流程在 outline 中的 anchor ID，与 buildOutlineItems 保持一致 */
  protected procAnchorId(stage: any, process: any): string {
    const stageId = this.identityOf(stage, `stage-${this.stages().indexOf(stage)}`);
    return this.anchorId('proc', this.identityOf(process, `${stageId}-${process.flowGroup || 'proc'}`));
  }

  protected toggleRaw(): void {
    this.showRaw.update((value) => !value);
  }

  /** 展开全部折叠 */
  protected expandAll(): void {
    this.collapsedOutlineIds.set(new Set());
  }

  /** 切换大纲条目折叠/展开，depth 0/1 可折叠（对应 2 级折叠） */
  protected toggleOutline(item: PreviewOutlineItem): void {
    if (item.depth > 1) return;
    this.collapsedOutlineIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  protected isOutlineCollapsed(item: PreviewOutlineItem): boolean {
    if (item.depth > 1) return false;
    return this.collapsedOutlineIds().has(item.id);
  }

  /** 点击大纲：跳转正文 + depth 0/1 折叠切换 */
  protected handleOutlineClick(item: PreviewOutlineItem): void {
    this.jumpTo(item.id);
    if (item.depth <= 1) this.toggleOutline(item);
  }

  /** 判断大纲条目是否应隐藏（自身被折叠或任一祖先被折叠） */
  protected isOutlineHidden(item: PreviewOutlineItem, index: number): boolean {
    if (item.depth === 0) return false;
    const collapsed = this.collapsedOutlineIds();
    if (collapsed.size === 0) return false;
    const items = this.outlineItems();
    for (let i = index - 1; i >= 0; i--) {
      const prev = items[i];
      if (prev.depth < item.depth && collapsed.has(prev.id)) return true;
    }
    return false;
  }

  protected jumpTo(anchorId: string): void {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  // ── 附件辅助方法 ──

  /** 构建附件 API URL。prototypeFiles 可能为 {uid, versionUid} 精简格式或 {uid, name, versions:[...]} 完整格式 */
  protected attachmentUrl(pf: any): string {
    const docName = this.runtime.currentFile || '';
    const uid = pf?.uid || '';
    const versionUid = pf?.versionUid || pf?.versions?.[0]?.uid || '';
    if (!docName || !uid || !versionUid) return '';
    return `/api/attachment/${encodeURIComponent(docName)}/${encodeURIComponent(uid)}/${encodeURIComponent(versionUid)}`;
  }

  protected attachmentContentType(pf: any): string {
    return String(pf?.versions?.[0]?.contentType || '');
  }

  protected isImageAttachment(pf: any): boolean {
    return this.attachmentContentType(pf).startsWith('image/');
  }

  protected isHtmlAttachment(pf: any): boolean {
    const ct = this.attachmentContentType(pf).toLowerCase();
    return ct.includes('html');
  }

  /** 附件显示名，精简格式无 name 时用 uid 最后 8 位 */
  protected attachmentLabel(pf: any): string {
    return pf?.name?.trim() || (pf?.uid ? pf.uid.slice(-8) : '未命名附件');
  }

  /** 是否有节点级附件 */
  protected hasNodeAttachments(process: any): boolean {
    return this.asArray(process?.nodes || process?.tasks).some((n: any) => this.asArray(n?.prototypeFiles).length > 0);
  }

  /** 遍历所有流程，找出有关联附件的流程 */
  protected processesWithAttachments(): any[] {
    return this.processes().filter((p) => {
      if (this.asArray(p?.prototypeFiles).length) return true;
      return this.asArray(p?.nodes || p?.tasks).some((n: any) => this.asArray(n?.prototypeFiles).length > 0);
    });
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

  // 模块意图：从 panorama.columns 提取价值流线（仓单监管@杨伟），用于大纲和正文的价值流分组。
  // 关键流程：列是价值流（仓单监管、交割服务机构监管），行是业务域（交割智慧监管平台）。
  protected valueStreamLanes(): Array<{id: string; name: string}> {
    const doc = this.runtime.doc || {};
    const columns = this.asArray(doc.panorama?.columns).map((item: any, index: number) => ({
      id: String(item.uid || item.id || `col-${index + 1}`),
      name: String(item.name || item.title || item.id || `价值流${index + 1}`),
    }));
    if (columns.length) return columns;
    // 降级：panoramaColumnUid
    const ids = Array.from(new Set(this.stages().map((s) => String(s.panoramaColumnUid || s.columnUid || '')).filter(Boolean)));
    return ids.length ? ids.map((id) => ({ id, name: id })) : [];
  }

  // 模块意图：根据价值流 columnUid 过滤阶段。
  protected stagesInLane(laneId: string): any[] {
    return this.stages().filter((s) => {
      const colUid = String(s.panoramaColumnUid || s.columnUid || '').trim();
      return colUid ? colUid === laneId : false;
    });
  }

  protected processes(): any[] {
    return this.asArray(this.runtime.doc?.processes);
  }

  /** 返回阶段下的流程分组（含空字符串键的无组流程），模板直接遍历 */
  protected stageProcessGroups(stage: any): Array<{name: string; processes: any[]}> {
    const doc = this.runtime.doc || {};
    const groups = new Map<string, any[]>();
    this.stageProcessRefs(stage, doc).forEach((ref) => {
      const process = this.findProcessByRef(ref, doc) || ref;
      const group = String(process?.flowGroup || '').trim();
      const key = group || '__ungrouped__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(process);
    });
    const result: Array<{name: string; processes: any[]}> = [];
    const ungrouped = groups.get('__ungrouped__');
    if (ungrouped) result.push({name: '', processes: ungrouped});
    groups.forEach((procs, key) => {
      if (key !== '__ungrouped__') result.push({name: key, processes: procs});
    });
    return result;
  }

  /** 未被任何构件引用的独立实体 */
  protected orphanEntities(): any[] {
    const constructs = this.constructs();
    const linked = new Set<string>();
    constructs.forEach((c) => this.constructEntities(c).forEach((e) => linked.add(this.identityOf(e, ''))));
    return this.entities().filter((e) => !linked.has(this.identityOf(e, '')));
  }

  /** 未被任何构件引用的独立任务 */
  protected orphanTasks(): any[] {
    const constructs = this.constructs();
    const linked = new Set<string>();
    constructs.forEach((c) => this.constructTasks(c).forEach((t) => linked.add(this.identityOf(t, ''))));
    return this.taskDefinitions().filter((t) => !linked.has(this.identityOf(t, '')));
  }

  /** 未被任何阶段引用的独立流程 */
  protected orphanProcesses(): any[] {
    const doc = this.runtime.doc || {};
    const stages = this.stages();
    const refd = new Set<string>();
    stages.forEach((stage) => {
      this.stageProcessRefs(stage, doc).forEach((ref) => {
        const p = this.findProcessByRef(ref, doc);
        if (p) refd.add(this.identityOf(p, ''));
      });
    });
    return this.processes().filter((p) => !refd.has(this.identityOf(p, '')));
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
    // 兼容多种字段名：applicationServices / appServices / services
    const doc = this.runtime.doc || {};
    const a = this.asArray(doc.applicationServices);
    if (a.length) return a;
    const b = this.asArray(doc.appServices);
    if (b.length) return b;
    return this.asArray(doc.services);
  }

  /** 服务组 */
  protected serviceGroups(): any[] {
    return this.asArray(this.runtime.doc?.serviceGroups);
  }

  /** 按服务组 uid 过滤接口 */
  protected servicesByGroup(groupUid: string): any[] {
    return this.services().filter((s) => s.serviceGroupUid === groupUid);
  }

  /** 格式化参数为JSON文本 */
  protected formatParams(params: any[]): string {
    if (!Array.isArray(params) || !params.length) return '';
    try { return JSON.stringify(params, null, 2); } catch { return String(params); }
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

  /** 当前文档版本号（seq） */
  private currentVersion(): string {
    return String(this.runtime.collab?.seq || this.runtime.collab?.acceptedSeq || '').trim();
  }

  /** 通用导出前检查：远端有更新时提示同步 */
  private async confirmExport(): Promise<boolean> {
    if (!this.runtime.currentFile) return false;
    const latest = Number(this.runtime.collab?.seq || 0);
    const base = Number(this.runtime.collab?.acceptedSeq || 0);
    const hasRemote = latest > base;
    if (hasRemote) {
      const doSync = await confirmRuntimeAction(
        '检查当前版本与远端版本不一致，是否立即同步？否则影响预览效果',
        { title: '同步确认', confirmLabel: '立即同步', cancelLabel: '直接导出' },
      );
      if (doSync) {
        // 先同步
        await this.api.save(this.runtime.currentFile, this.runtime.doc || {}, { saveMessage: '导出前同步' });
        // 同步后版本号已更新
      }
    }
    return true;
  }

  /** 统一导出流程：截图 → 发送 → 轮询 → 下载 */
  private async runExport(fmt: string, label: string): Promise<void> {
    if (!await this.confirmExport()) return;
    const name = this.runtime.currentFile;
    if (!name) { this.exportWait.set(null); return; }
    const version = this.currentVersion();
    // 检查缓存
    const cached = await fetch(`/api/export-bundle/${encodeURIComponent(name)}?version=${encodeURIComponent(version)}&format=${fmt}`);
    if (cached.ok) {
      const blob = await cached.blob();
      this.exportWait.set(null);
      this.downloadBlob(blob, this.responseFilename(cached) || `${this.baseFileName()}.${fmt === 'docx' ? 'docx' : 'zip'}`);
      return;
    }
    this.exportWait.set({ title: '正在截图…', description: '正在用 html2canvas 截取图形。', progress: 5 });
    let screenshots: Array<{id: string; dataUrl: string}> = [];
    try {
      screenshots = await this.captureAllGraphs();
    } catch (e) { /* 截图失败继续 */ }

    this.exportWait.set({ title: label, description: `截图完成（${screenshots.length} 张），正在提交导出任务。`, progress: 30 });
    try {
      const endpoint = fmt === 'docx' ? '/api/export-docx/start' : `/api/export/${fmt}/start`;
      const resp = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, version, markdown: this.markdown(), screenshots }),
      });
      const job: any = await resp.json();
      if (!job?.id) {
        this.exportWait.set(null);
        return;
      }
      const done = await this.waitForExportJob(job.id, job);
      if (done?.status !== 'done') { this.exportWait.set(null); return; }
      const dlResp = await this.api.downloadExportJob(job.id);
      if (dlResp.ok) {
        const ext = fmt === 'docx' ? 'docx' : 'zip';
        this.downloadBlob(await dlResp.blob(), done.filename || `${this.baseFileName()}.${ext}`);
      }
    } catch (e) {
      // 网络或其他错误，清理等待状态
    } finally { this.exportWait.set(null); }
  }

  protected async exportJson(): Promise<void> {
    return this.runExport('json', '正在打包 JSON+附件...');
  }

  protected async exportMarkdown(): Promise<void> {
    return this.runExport('markdown', '正在打包 MD+截图+附件...');
  }

  /** 前端本地 DOCX 生成：截图 + Markdown → ViewContent → buildDocxFragment → 下载 */
  protected async exportDocx(): Promise<void> {
    if (!await this.confirmExport()) return;
    const name = this.runtime.currentFile;
    if (!name) { this.exportWait.set(null); return; }

    this.exportWait.set({ title: '正在截图…', description: '正在用 html2canvas 截取图形。', progress: 5 });
    let screenshots: Array<{id: string; dataUrl: string}> = [];
    try {
      screenshots = await this.captureAllGraphs();
    } catch (e) { /* 截图失败继续 */ }

    this.exportWait.set({ title: '正在生成 DOCX…', description: `截图完成（${screenshots.length} 张），正在构建文档。`, progress: 50 });
    try {
      const viewContent = this.markdownToViewContent(this.markdown(), screenshots);
      const pngBytes = screenshots.map((s) => this.dataUrlToUint8(s.dataUrl));
      const blob = await buildDocxFragment(viewContent, pngBytes);
      this.exportWait.set({ title: '完成', description: '', progress: 100 });
      downloadBlob(blob, `${this.baseFileName()}.docx`);
    } catch (e) {
      this.exportWait.set({ title: '导出失败', description: e instanceof Error ? e.message : String(e), progress: 0 });
    }
    await new Promise((r) => setTimeout(r, 300));
    this.exportWait.set(null);
  }

  /** 将 Markdown 文本转为 ViewContent，图形引用与截图数组按 graphId 匹配 */
  private markdownToViewContent(md: string, screenshots: Array<{id: string; dataUrl: string}>): ViewContent {
    const sections: ViewSection[] = [];
    const lines = md.split('\n');
    const screenshotMap = new Map(screenshots.map((s) => [s.id, s]));

    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    const flushTable = (): void => {
      if (!inTable || !tableHeaders.length) return;
      sections.push({ type: 'table', headers: tableHeaders, rows: tableRows });
      tableHeaders = [];
      tableRows = [];
      inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 图片引用
      const imgMatch = trimmed.match(/^!\[(.+?)\]\((.+?)\)$/);
      if (imgMatch) {
        flushTable();
        const imgId = imgMatch[2].replace(/\.png$/i, '');
        const found = screenshotMap.get(imgId);
        if (found) {
          const idx = screenshots.findIndex((s) => s.id === imgId);
          sections.push({ type: 'image', text: imgMatch[1], imageIndex: idx >= 0 ? idx : 0 });
        }
        continue;
      }

      // 表格行
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed.split('|').filter((c) => c.trim() || c === '').map((c) => c.trim());
        const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
        const isSeparator = nextLine.startsWith('|') && nextLine.split('|').every((c) => /^:?-{2,}:?$/.test(c.trim()));
        if (isSeparator) {
          flushTable();
          tableHeaders = cells;
          tableRows = [];
          i += 1; // skip separator
          inTable = true;
          continue;
        }
        if (inTable) {
          tableRows.push(cells);
          continue;
        }
      }

      flushTable();

      // 空行
      if (!trimmed) continue;

      // 标题
      if (trimmed.startsWith('##### ')) { sections.push({ type: 'heading3', text: trimmed.slice(6) }); continue; }
      if (trimmed.startsWith('#### ')) { sections.push({ type: 'heading3', text: trimmed.slice(5) }); continue; }
      if (trimmed.startsWith('### ')) { sections.push({ type: 'heading3', text: trimmed.slice(4) }); continue; }
      if (trimmed.startsWith('## ')) { sections.push({ type: 'heading2', text: trimmed.slice(3) }); continue; }
      if (trimmed.startsWith('# ')) { sections.push({ type: 'heading1', text: trimmed.slice(2) }); continue; }

      // 列表项
      if (trimmed.startsWith('- ')) {
        sections.push({ type: 'list', items: [trimmed.slice(2)] });
        continue;
      }

      // 普通段落
      sections.push({ type: 'paragraph', text: trimmed });
    }
    flushTable();

    return { title: this.title(), sections };
  }

  /** dataUrl → Uint8Array */
  private dataUrlToUint8(dataUrl: string): Uint8Array {
    const raw = atob(dataUrl.split(',')[1]);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf;
  }

  /** 遍历所有 [data-export-graph-id] 元素，用 html2canvas 截图（动态导入，避免 CJS 阻塞组件加载） */
  private async captureAllGraphs(): Promise<Array<{id: string; dataUrl: string}>> {
    const results: Array<{id: string; dataUrl: string}> = [];
    try {
      // 先触发所有 @defer 懒加载图形组件的渲染
      const placeholders = document.querySelectorAll<HTMLElement>('.pv-graph-placeholder');
      for (const ph of Array.from(placeholders)) {
        ph.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
      if (placeholders.length) {
        // 等待 Angular 渲染 @defer 内容
        await new Promise((r) => setTimeout(r, 500));
      }
      const html2canvas = (await import('html2canvas')).default;
      const elements = document.querySelectorAll<HTMLElement>('[data-export-graph-id]');
      for (const el of Array.from(elements)) {
        try {
          const graphId = el.getAttribute('data-export-graph-id') || '';
          const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          results.push({ id: graphId, dataUrl: canvas.toDataURL('image/png') });
        } catch (e) { /* 单个截图失败不阻塞 */ }
      }
    } catch (e) { /* html2canvas 不可用时降级 */ }
    return results;
  }

  private buildOutlineItems(): PreviewOutlineItem[] {
    const doc = this.runtime.doc || {};
    const raw: Array<{id: string; label: string; depth: number}> = [];
    const outlinedAnchors = new Set<string>();

    // ── 引言 ──
    const hasIntro = this.asArray(doc.roles).length || this.asArray(doc.terms || doc.language).length || this.stages().length;
    if (hasIntro) {
      raw.push({ id: 'preview-intro', label: '引言', depth: 0 });
      raw.push({ id: 'preview-stage-panorama', label: '全景视图', depth: 1 });
      if (this.asArray(doc.roles).length) raw.push({ id: 'preview-roles', label: '角色', depth: 1 });
      if (this.asArray(doc.terms || doc.language).length) raw.push({ id: 'preview-language', label: '统一语言/术语表', depth: 1 });
      // Note: 数据字典目前没有单独 section，暂不加入
    }

    // ── 价值流（每个价值流线作为顶级章节）──
    const stages = this.stages();
    if (stages.length) {
      const lanes = this.valueStreamLanes();
      if (lanes.length) {
        lanes.forEach((lane) => {
          const laneStages = this.stagesInLane(lane.id);
          if (!laneStages.length) return;
          raw.push({ id: `preview-lane-${lane.id}`, label: lane.name, depth: 0 });
          laneStages.forEach((stage) => {
            const stageId = this.identityOf(stage, `stage-${this.stages().indexOf(stage)}`);
            raw.push({ id: this.anchorId('stage', stageId), label: `阶段 · ${this.displayName(stage, '未命名业务阶段')}`, depth: 1 });
            const groups = this.groupRefsByFlowGroup(stage);
            groups.forEach((processes, groupName) => {
              if (groupName) {
                raw.push({ id: `preview-group-${stageId}-${groupName}`, label: `流程组 · ${groupName}`, depth: 2 });
              }
              processes.forEach((p) => {
                const anchor = this.anchorId('proc', this.identityOf(p, `${stageId}-${p.flowGroup || 'proc'}`));
                if (!outlinedAnchors.has(anchor)) {
                  outlinedAnchors.add(anchor);
                  raw.push({ id: anchor, label: this.displayName(p, '未命名流程'), depth: groupName ? 3 : 2 });
                }
              });
            });
          });
        });
      } else {
        // 无价值流时阶段降级为深度 0
        stages.forEach((stage, index) => {
          raw.push({ id: this.stageAnchor(stage, index), label: `阶段 · ${this.displayName(stage, '未命名业务阶段')}`, depth: 0 });
        });
      }
    }

    // 孤立流程（不属于任何阶段的）
    const orphanProcesses = this.orphanProcesses();
    if (orphanProcesses.length) {
      raw.push({ id: 'preview-processes', label: '流程视图', depth: 0 });
      orphanProcesses.forEach((process, index) => {
        raw.push({ id: this.processAnchor(process, index), label: this.displayName(process, '未命名流程'), depth: 1 });
      });
    }

    // ── 组件建模（组件→构件→实体、任务） ──
    const constructs = this.asArray(doc.businessConstructs);
    const hasComponents = this.asArray(doc.entities).length || this.asArray(doc.businessComponents).length || constructs.length || this.asArray(doc.taskDefinitions).length;
    if (hasComponents) {
      raw.push({ id: 'preview-components', label: '组件建模', depth: 0 });
      if (this.asArray(doc.businessComponents).length) raw.push({ id: 'preview-business-components', label: '业务组件', depth: 1 });

      // 构件→实体、任务（大纲）; 标记已归属的实体和任务
      const outlinedEntities = new Set<string>();
      const outlinedTasks = new Set<string>();
      if (constructs.length) {
        constructs.forEach((c) => {
          const cId = this.identityOf(c, '');
          raw.push({ id: `preview-construct-${cId}`, label: `构件：${this.displayName(c, '未命名构件')}`, depth: 1 });
          this.constructEntities(c).forEach((e) => {
            const eAnchor = this.anchorId('entity', this.identityOf(e, ''));
            outlinedEntities.add(eAnchor);
            raw.push({ id: eAnchor, label: `实体：${this.displayName(e, '未命名实体')}`, depth: 2 });
          });
          this.constructTasks(c).forEach((t) => {
            const tAnchor = this.anchorId('task', this.identityOf(t, ''));
            outlinedTasks.add(tAnchor);
            raw.push({ id: tAnchor, label: `任务：${this.displayName(t, '未命名任务')}`, depth: 2 });
          });
        });
      }

      // 未归属实体的实体
      const orphanEntities = this.asArray(doc.entities).filter((e) => !outlinedEntities.has(this.anchorId('entity', this.identityOf(e, ''))));
      if (orphanEntities.length) {
        raw.push({ id: 'preview-entity-overview', label: '实体关系图', depth: 1 });
        orphanEntities.forEach((entity, index) => {
          raw.push({ id: this.anchorId('entity', this.identityOf(entity, `entity-${index + 1}`)), label: `实体：${this.displayName(entity, '未命名实体')}`, depth: 2 });
        });
      }

      // 未归属的任务
      const orphanTasks = this.asArray(doc.taskDefinitions).filter((t) => !outlinedTasks.has(this.anchorId('task', this.identityOf(t, ''))));
      if (orphanTasks.length) raw.push({ id: 'preview-task-definitions', label: '任务定义', depth: 1 });
    }

    // ── 应用服务（按服务组→应用接口，无三级标题） ──
    const allSvcs = this.services();
    const svcGroups = this.serviceGroups();
    if (allSvcs.length || this.interfaces().length) {
      raw.push({ id: 'preview-applications', label: '应用服务', depth: 0 });
      if (svcGroups.length) {
        svcGroups.forEach((g) => {
          const groupSvcs = allSvcs.filter((s) => s.serviceGroupUid === g.uid);
          if (groupSvcs.length) {
            raw.push({ id: `preview-app-svc-${g.uid}`, label: g.name || this.identityOf(g, '未命名服务组'), depth: 1 });
          }
        });
        // 未归属服务组的接口
        const ungrouped = allSvcs.filter((s) => !s.serviceGroupUid);
        if (ungrouped.length) {
          raw.push({ id: 'preview-app-svc-ungrouped', label: '其他', depth: 1 });
        }
      } else {
        // 无服务组时 flat 列出
        allSvcs.forEach((s, idx) => {
          raw.push({ id: `preview-app-svc-${s.uid || s.id || `svc-${idx}`}`, label: this.displayName(s, '未命名服务'), depth: 1 });
        });
      }
    }

    // ── 附录（按流程→节点→附件组织） ──
    const appendixProcesses = this.processesWithAttachments();
    if (appendixProcesses.length) {
      raw.push({ id: 'preview-appendix', label: '附录', depth: 0 });
      appendixProcesses.forEach((process) => {
        const processId = this.identityOf(process, '');
        raw.push({ id: `preview-appendix-proc-${processId}`, label: this.displayName(process, '未命名流程'), depth: 1 });
        const processFiles = this.asArray(process?.prototypeFiles);
        processFiles.forEach((pf: any) => {
          const name = pf?.name || '未命名附件';
          raw.push({ id: `preview-appendix-file-${pf.uid || name}`, label: name, depth: 2 });
        });
        this.asArray(process?.nodes || process?.tasks).forEach((node: any) => {
          const nodeFiles = this.asArray(node?.prototypeFiles);
          if (!nodeFiles.length) return;
          const nodeId = this.identityOf(node, '');
          raw.push({ id: `preview-appendix-node-${nodeId}`, label: `节点: ${this.displayName(node, '未命名节点')}`, depth: 2 });
          nodeFiles.forEach((nf: any) => {
            const name = nf?.name || '未命名附件';
            raw.push({ id: `preview-appendix-file-${nf.uid || name}`, label: name, depth: 3 });
          });
        });
      });
    }

    // ── 赋序号 ──
    const counters = [0, 0, 0, 0];
    return raw.map((item, index) => {
      const d = item.depth;
      if (d === 0) {  // 深度 0 每项自增序号
        counters[0] += 1;
        counters[1] = 0; counters[2] = 0; counters[3] = 0;
      } else {
        for (let p = index - 1; p >= 0; p--) {
          if (raw[p].depth < d) {
            counters[d] = (counters[d] || 0) + 1;
            for (let r = d + 1; r <= 3; r++) counters[r] = 0;
            break;
          }
        }
      }
      const parts: string[] = [];
      for (let i = 0; i <= d; i++) {
        if (counters[i] > 0) parts.push(String(counters[i]));
      }
      return {
        id: item.id,
        label: item.label,
        depth: d as 0 | 1 | 2 | 3,
        number: parts.join('.'),
      };
    });
  }

  /** 按流程组整理阶段下的流程引用，返回 Map<groupName, processes[]> */
  private groupRefsByFlowGroup(stage: any): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    const doc = this.runtime.doc || {};
    this.stageProcessRefs(stage, doc).forEach((ref) => {
      const process = this.findProcessByRef(ref, doc) || ref;
      const group = String(process?.flowGroup || '').trim();
      const key = group || '__ungrouped__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(process);
    });
    // 把 ungrouped 移到空字符串键
    const ungrouped = groups.get('__ungrouped__');
    if (ungrouped) {
      groups.delete('__ungrouped__');
      groups.set('', ungrouped);
    }
    return groups;
  }

  private renderMeta(meta: any): string {
    const parts = [];
    if (meta.domain) parts.push(`<strong>业务域</strong>: ${this.esc(meta.domain)}`);
    if (meta.author) parts.push(`<strong>作者</strong>: ${this.esc(meta.author)}`);
    if (meta.date) parts.push(`<strong>日期</strong>: ${this.esc(meta.date)}`);
    return parts.length ? `<p class="pv-meta">${parts.join(' | ')}</p>` : '';
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

  /** 构建结构化 Markdown，与预览大纲和正文顺序一致，含表格和图形引用 */
  private buildMarkdown(): string {
    const doc = this.runtime.doc || {};
    const L = (line = '') => lines.push(line);
    const lines: string[] = [];
    const stages = this.stages();
    const processes = this.processes();

    L(`# ${this.title()}`);
    L();

    // ════ 引言 ════
    if (stages.length || this.asArray(doc.roles).length || this.asArray(doc.terms || doc.language).length) {
      L(`## ${this.outlineNumber('preview-intro')} 引言`);
      L();

      if (stages.length) {
        L(`### ${this.outlineNumber('preview-stage-panorama')} 全景视图`);
        L();
        L(`![全景视图](${exportGraphId('stage-panorama')}.png)`);
        L();
      }

      if (this.asArray(doc.roles).length) {
        L('### 角色');
        L('| 角色 | 分组 | 说明 | 所属业务组件 |');
        L('|------|------|------|--------------|');
        this.asArray(doc.roles).forEach((role: any) => {
          L(`| ${this.mdEscape(role.name || role.id || '')} | ${this.mdEscape(role.group || '')} | ${this.mdEscape(role.desc || role.description || '')} | ${this.mdEscape(this.asArray(role.subDomains).join('、'))} |`);
        });
        L();
      }

      if (this.asArray(doc.terms || doc.language).length) {
        L('### 统一语言/术语表');
        L('| 术语 | 定义 |');
        L('|------|------|');
        this.asArray(doc.terms || doc.language).forEach((item: any) => {
          L(`| ${this.mdEscape(item.term || item.name || '')} | ${this.mdEscape(item.definition || item.desc || '')} |`);
        });
        L();
      }
    }

    // ════ 价值流 ════
    if (stages.length) {
      const lanes = this.valueStreamLanes();
      if (lanes.length) {
        lanes.forEach((lane) => {
          const laneStages = this.stagesInLane(lane.id);
          if (!laneStages.length) return;
          L(`## ${this.outlineNumber(`preview-lane-${lane.id}`)} ${lane.name}`);
          L();

          laneStages.forEach((stage, si) => {
            const stageAnchor = this.stageAnchor(stage, si);
            L(`### ${this.outlineNumber(stageAnchor)} 阶段：${this.displayName(stage, '未命名业务阶段')}`);
            L();
            // 阶段流程图
            const stageGraphId = this.stageGraphId('stage-flow', stage, si);
            L(`![阶段：${this.displayName(stage, '未命名业务阶段')}](${stageGraphId}.png)`);
            L();

            // 流程分组
            const groups = this.stageProcessGroups(stage);
            groups.forEach((group) => {
              group.processes.forEach((process, pi) => {
                const procAnchor = this.procAnchorId(stage, process);
                if (group.name) {
                  const groupAnchor = this.groupAnchorId(stage, group.name);
                  L(`#### ${this.outlineNumber(groupAnchor)} 流程组：${group.name}`);
                  L();
                }
                L(`##### ${this.outlineNumber(procAnchor)} ${this.displayName(process, '未命名流程')}`);
                L();
                // 流程图
                const procGraphId = this.processGraphId(process, pi);
                L(`![流程图：${this.displayName(process, '未命名流程')}](${procGraphId}.png)`);
                L();
                if (process.trigger || process.outcome) {
                  L(`**触发**：${this.mdEscape(process.trigger || '—')} → **预期结果**：${this.mdEscape(process.outcome || '—')}`);
                  L();
                }

                // 流程节点
                const nodes = this.processNodes(process);
                if (nodes.length) {
                  nodes.forEach((node: any, ni: number) => {
                    L(`##### 流程节点：${this.displayName(node, `未命名节点 ${ni + 1}`)}`);
                    L();
                    if (node.description) {
                      L(`${this.mdRichText(node.description)}`);
                      L();
                    }

                    // 办理步骤
                    const steps = this.asArray(node.userSteps || node.steps);
                    if (steps.length) {
                      L('**办理步骤**');
                      L('| # | 操作步骤 | 类型 | 条件/备注 |');
                      L('|---|----------|------|----------|');
                      steps.forEach((step: any, si: number) => {
                        L(`| ${si + 1} | ${this.mdEscape(step.name || '')} | ${this.mdEscape(step.type || '')} | ${this.mdRichText(step.note || '')} |`);
                      });
                      L();
                    }

                    // 办理表单
                    const forms = this.asArray(node.forms);
                    if (forms.length) {
                      L('**办理表单**');
                      forms.forEach((form: any) => {
                        L(`- **${form.name || '未命名表单'}**${form.purpose ? ` 用途：${form.purpose}` : ''}`);
                        this.asArray(form.sections).forEach((sec: any) => {
                          if (this.asArray(sec.fields).length) {
                            L('  | 字段 | 类型 | 必填 | 选项 |');
                            L('  |------|------|------|------|');
                            this.asArray(sec.fields).forEach((fld: any) => {
                              L(`  | ${this.mdEscape(fld.name || '')} | ${this.mdEscape(fld.type || '')} | ${fld.required ? '✓' : ''} | ${this.mdEscape(this.asArray(fld.options).join('、'))} |`);
                            });
                          }
                        });
                      });
                      L();
                    }

                    // 办理附件
                    const procFiles = this.asArray(process?.prototypeFiles);
                    const nodeFiles = this.asArray(node?.prototypeFiles);
                    if (procFiles.length || nodeFiles.length) {
                      L('**办理附件**');
                      [...procFiles, ...nodeFiles].forEach((pf: any) => {
                        L(`- ${this.attachmentLabel(pf)}`);
                      });
                      L();
                    }

                    // 办理规则
                    const rules = this.normalizedBusinessRules(node);
                    if (rules.length) {
                      L('**办理规则**');
                      L('| 规则名称 | 规则内容 |');
                      L('|----------|----------|');
                      rules.forEach((rule) => {
                        L(`| ${this.mdEscape(rule.name)} | ${this.mdRichText(rule.content)} |`);
                      });
                      L();
                    }
                  });
                } else {
                  L('*暂无流程节点*');
                  L();
                }
              });
            });
          });
        });
      }
    }

    // 孤立流程
    const orphans = this.orphanProcesses();
    if (orphans.length) {
      L(`## ${this.outlineNumber('preview-processes')} 流程视图`);
      L();
      orphans.forEach((process, index) => {
        L(`### ${this.processAnchor(process, index)} ${this.displayName(process, '未命名流程')}`);
        L();
      });
    }

    // ════ 组件建模 ════
    const hasComponents = this.asArray(doc.entities).length || this.asArray(doc.businessComponents).length || this.asArray(doc.businessConstructs).length || this.asArray(doc.taskDefinitions).length;
    if (hasComponents) {
      L(`## ${this.outlineNumber('preview-components')} 组件建模`);
      L();

      if (this.asArray(doc.businessComponents).length) {
        L(`### ${this.outlineNumber('preview-business-components')} 业务组件`);
        L('| 组件 | 类型 | 说明 |');
        L('|------|------|------|');
        this.asArray(doc.businessComponents).forEach((c: any) => {
          L(`| ${this.mdEscape(c.name || '')} | ${this.mdEscape(c.kind || '')} | ${this.mdEscape(c.desc || c.note || '')} |`);
        });
        L();
      }

      // 构件→实体、任务
      const constructs = this.asArray(doc.businessConstructs);
      constructs.forEach((c: any) => {
        const cAnchor = `preview-construct-${this.identityOf(c, '')}`;
        L(`### ${this.outlineNumber(cAnchor)} 构件：${this.displayName(c, '未命名构件')}`);
        L();

        const entities = this.constructEntities(c);
        if (entities.length) {
          L('**实体**');
          entities.forEach((e: any) => {
            const eAnchor = this.anchorId('entity', this.identityOf(e, ''));
            L(`- **${this.outlineNumber(eAnchor)} 实体：${this.displayName(e, '未命名实体')}**`);
            if (e.note) L(`  ${this.mdEscape(e.note)}`);
            if (this.asArray(e.fields).length) {
              L('  | 字段 | 类型 | 主键 | 说明 |');
              L('  |------|------|------|------|');
              this.asArray(e.fields).forEach((f: any) => {
                L(`  | ${this.mdEscape(f.name || '')} | ${this.mdEscape(f.type || '')} | ${f.is_key || f.isKey ? '✓' : ''} | ${this.mdEscape(f.note || f.desc || '')} |`);
              });
            }
          });
          L();
        }

        const tasks = this.constructTasks(c);
        if (tasks.length) {
          L('**任务**');
          tasks.forEach((t: any) => {
            const tAnchor = this.anchorId('task', this.identityOf(t, ''));
            L(`- **${this.outlineNumber(tAnchor)} 任务：${this.displayName(t, '未命名任务')}** 地址：${this.mdEscape(t.address || '—')} 目标：${this.mdEscape(t.target || '—')}`);
          });
          L();
        }
      });

      // 孤立实体
      const orphanEntities = this.orphanEntities();
      if (orphanEntities.length) {
        L(`### ${this.outlineNumber('preview-entity-overview')} 实体关系图`);
        L();
        L(`![实体关系图](${exportGraphId('entity-relation')}.png)`);
        L();
      }

      // 孤立任务
      const orphanTasks = this.orphanTasks();
      if (orphanTasks.length) {
        L(`### ${this.outlineNumber('preview-task-definitions')} 任务定义`);
        L('| 任务 | 构件 | 地址 | 目标 | 参数 |');
        L('|------|------|------|------|------|');
        orphanTasks.forEach((t: any) => {
          L(`| ${this.mdEscape(t.name || '')} | ${this.mdEscape(this.constructNameById(t.constructUid || t.businessConstructUid || ''))} | ${this.mdEscape(t.address || '')} | ${this.mdEscape(t.target || '')} | ${this.taskParameterSummary(t.parameters)} |`);
        });
        L();
      }
    }

    // ════ 应用服务 ════
    const svcGroups = this.serviceGroups();
    if (this.services().length || svcGroups.length) {
      L(`## ${this.outlineNumber('preview-applications')} 应用服务`);
      L();
      if (svcGroups.length) {
        svcGroups.forEach((g: any) => {
          const groupSvcs = this.servicesByGroup(g.uid);
          if (!groupSvcs.length) return;
          L(`### ${this.outlineNumber(`preview-app-svc-${g.uid}`)} ${g.name || '未命名服务组'}`);
          L('| 接口名称 | 方法 | 路径 | 请求参数 | 响应参数 |');
          L('|----------|------|------|----------|----------|');
          groupSvcs.forEach((svc: any) => {
            L(`| ${this.mdEscape(svc.name || '')} | \`${svc.method || ''}\` | \`${svc.path || svc.url || ''}\` | ${svc.rawRequest ? '```' + svc.rawRequest + '```' : '—'} | ${svc.rawResponse ? '```' + svc.rawResponse + '```' : '—'} |`);
          });
          L();
        });
      }
    }

    return `${lines.join('\n')}\n`;
  }

  /** Markdown 转义（表格单元格内安全） */
  private mdEscape(value: unknown): string {
    return String(value ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '');
  }

  /** 富文本转纯文本（去 HTML 标签，用于 Markdown） */
  private mdRichText(value: unknown): string {
    const html = String(value ?? '');
    return this.mdEscape(html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
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

  /** 轮询导出任务，实时更新进度和剩余时间估算 */
  private async waitForExportJob(jobId: string, initialJob: any, startTime = Date.now()): Promise<any> {
    let latestJob = initialJob;
    const start = startTime;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (latestJob?.status === 'done' || latestJob?.status === 'failed') return latestJob;
      const progress = Math.min(99, Math.max(0, Number(latestJob?.progress ?? 0)));
      const elapsed = (Date.now() - start) / 1000;
      const estimatedTotal = progress > 5 ? (elapsed / progress) * 100 : 60;
      const remaining = Math.max(1, Math.round(estimatedTotal - elapsed));
      this.exportWait.set({
        title: latestJob?.title || this.exportWait()?.title || '正在导出…',
        description: latestJob?.message || '请耐心等待。',
        progress,
        remainingSeconds: remaining,
      });
      latestJob = await this.api.exportJob(jobId);
      if (latestJob?.status === 'done' || latestJob?.status === 'failed') return latestJob;
      await this.delay(500);
    }
    return latestJob;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected anchorId(prefix: string, value: string): string {
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
