import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { BlmDocument, BusinessComponent, Stage } from '../../core/document/document.model';
import { DocumentStore } from '../../core/document/document-store';
import { getComponentSupportedStages, getStageProcesses } from '../../core/document/document-model';
import { getAngularRuntimeState, switchAngularMainTab } from '../../core/runtime/angular-runtime';
import { ValueDomainCell, ValueDomainColumn, ValueDomainLane, getValueDomainColumnUid, getValueDomainLaneUid } from '../../core/document/value-domain-model';
import { KnowledgeWorkbenchComponent } from '../knowledge/knowledge-workbench';
import { RoleWorkbenchComponent } from '../role/role-workbench';
import { WaitDialogComponent } from '../../core/shell/wait-dialog/wait-dialog.component';

type PanoramaSubtab = 'overview' | 'roles' | 'terms' | 'dictionary' | 'rules';

interface PanoramaSubtabItem {
  id: PanoramaSubtab;
  label: string;
}

interface PanoramaDocument extends BlmDocument {
  panorama?: {
    columns?: ValueDomainColumn[];
    lanes?: ValueDomainLane[];
    cells?: ValueDomainCell[];
  };
}

@Component({
  selector: 'app-panorama-workbench',
  imports: [CommonModule, KnowledgeWorkbenchComponent, RoleWorkbenchComponent, WaitDialogComponent],
  templateUrl: './panorama-workbench.html',
  styleUrls: ['../../shared/layout/workbench-section.scss', './panorama-workbench.scss'],
})
export class PanoramaWorkbench {
  // 模块意图：全景工作台是跨模型入口，只编排“视图投影”和已迁移子工作台，不在这里承接具体编辑命令。
  protected readonly tabs: PanoramaSubtabItem[] = [
    { id: 'overview', label: '全景视图' },
    { id: 'roles', label: '角色管理' },
    { id: 'terms', label: '术语管理' },
    { id: 'dictionary', label: '字典管理' },
    { id: 'rules', label: '规则管理' },
  ];
  protected readonly activeTab = signal<PanoramaSubtab>('overview');
  protected readonly editing = signal(false);
  protected readonly editMenuOpen = signal(false);
  protected readonly manualZoom = signal<number | null>(null);
  protected readonly viewportSize = signal(this.readViewportSize());
  protected readonly selectedStageUid = signal('');
  protected readonly selectedComponentUid = signal('');
  private readonly documentStore = inject(DocumentStore);
  protected readonly document = this.documentStore.document;
  protected readonly panoramaModel = computed(() => {
    const document = this.document() as PanoramaDocument;
    return {
      columns: this.withFallback(document.panorama?.columns, {
        uid: 'default-column',
        name: '价值流',
        badge: '价值链',
        scope: '从业务目标到流程落地',
      }),
      lanes: this.withFallback(document.panorama?.lanes, {
        uid: 'default-lane',
        name: '业务域',
        badge: '业务域',
        note: '按业务责任组织阶段',
      }),
      cells: document.panorama?.cells || [],
    };
  });
  protected readonly componentRows = computed(() => {
    const document = this.document();
    return document.businessComponents.map((component) => ({
      component,
      stages: getComponentSupportedStages(document, component),
    }));
  });
  protected readonly coreComponentRows = computed(() =>
    this.componentRows().filter((row) => this.componentKind(row.component) !== 'generic'),
  );
  protected readonly genericComponentRows = computed(() =>
    this.componentRows().filter((row) => this.componentKind(row.component) === 'generic'),
  );
  protected readonly gridTemplateColumns = computed(() => {
    const columnTracks = this.panoramaModel().columns.map(() => 'minmax(168px, 1fr)').join(' ');
    // 关键流程：总览只读矩阵按已有全景 CSS 组织布局，避免再次退化成普通列表。
    return `140px ${columnTracks}`;
  });
  protected readonly fitZoom = computed(() => {
    const model = this.panoramaModel();
    const viewport = this.viewportSize();
    const columns = Math.max(1, model.columns.length);
    const lanes = Math.max(1, model.lanes.length);
    const componentRows = Math.max(this.coreComponentRows().length, this.genericComponentRows().length);
    const estimatedWidth = Math.max(920, 140 + columns * 188 + 72);
    const estimatedMatrixHeight = 82 + lanes * 88;
    const estimatedCapabilityHeight = 44 + Math.max(1, Math.ceil(componentRows / 4)) * 84;
    const estimatedHeight = 96 + estimatedMatrixHeight + estimatedCapabilityHeight;
    const availableWidth = Math.max(640, viewport.width - 560);
    const availableHeight = Math.max(420, viewport.height - 188);
    const scale = Math.min(1, availableWidth / estimatedWidth, availableHeight / estimatedHeight);
    return this.clampZoom(Math.floor(scale * 100) / 100);
  });
  protected readonly zoomValue = computed(() => this.manualZoom() ?? this.fitZoom());
  protected readonly zoomPercent = computed(() => Math.round(this.zoomValue() * 100));
  protected readonly exportMenuOpen = signal(false);
  protected readonly exportWait = signal<{ title: string; description: string; progress?: number; remainingSeconds?: number } | null>(null);

  // ── 局部导出（调试功能，不涉及服务器存储） ──
  protected toggleExportMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.exportMenuOpen.update((v) => !v);
  }

  protected closeExportMenu(): void {
    this.exportMenuOpen.set(false);
  }

  protected async exportPanoramaMd(): Promise<void> {
    this.closeExportMenu();
    this.exportWait.set({ title: '生成 Markdown…', description: '', progress: 10 });
    await new Promise((r) => setTimeout(r, 10)); // 让 Angular 渲染
    const doc = this.document();
    const model = this.panoramaModel();
    const lines: string[] = [];
    lines.push('# 全景视图\n');
    lines.push(`**文档**: ${doc?.meta?.domain || '未命名'} | **价值流数**: ${model.columns.length} | **业务域数**: ${model.lanes.length}\n`);
    lines.push('| 业务域 / 价值流 | ' + model.columns.map((c) => c.name || c.uid).join(' | ') + ' |');
    lines.push('|' + model.columns.map(() => '---').join('|') + '|');
    model.lanes.forEach((lane) => {
      const row = [lane.name || lane.uid];
      model.columns.forEach((col) => {
        const stages = this.cellStages(this.laneUid(lane), this.columnUid(col));
        row.push(stages.length ? stages.map((s) => s.name).join('、') : '—');
      });
      lines.push('| ' + row.join(' | ') + ' |');
    });
    lines.push('');
    this.exportWait.set({ title: '正在下载…', description: '', progress: 80 });
    await new Promise((r) => setTimeout(r, 10));
    this.downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown' }), (doc?.meta?.domain || 'panorama') + '.md');
    this.exportWait.set(null);
  }

  /** 构建简易 zip（store 模式，无压缩） */
  private buildZip(files: Array<{name: string; data: Uint8Array}>): Blob {
    const encoder = new TextEncoder();
    let localOffset = 0;
    const central: number[] = [];
    const parts: any[] = [];

    for (const f of files) {
      const nameBytes = encoder.encode(f.name);
      const crc = this.crc32(f.data);
      const size = f.data.length;
      // Local file header
      const local = new ArrayBuffer(30 + nameBytes.length);
      const v = new DataView(local);
      v.setUint32(0, 0x04034b50, true); // signature
      v.setUint16(4, 20, true); // version needed
      v.setUint16(6, 0, true); // flags
      v.setUint16(8, 0, true); // method: store
      v.setUint16(10, 0, true); // mod time
      v.setUint16(12, 0, true); // mod date
      v.setUint32(14, crc, true); // crc32
      v.setUint32(18, size, true); // compressed size
      v.setUint32(22, size, true); // uncompressed size
      v.setUint16(26, nameBytes.length, true); // filename length
      v.setUint16(28, 0, true); // extra field length
      new Uint8Array(local).set(nameBytes, 30);
      parts.push(local, f.data);
      central.push(localOffset, size, nameBytes.length, crc);
      localOffset += 30 + nameBytes.length + size;
    }

    // Central directory
    const centralStart = localOffset;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const nameBytes = encoder.encode(f.name);
      const [offset, size, nameLen, crc] = [central[i*4], central[i*4+1], central[i*4+2], central[i*4+3]];
      const entry = new ArrayBuffer(46 + nameBytes.length);
      const v = new DataView(entry);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true); v.setUint16(6, 20, true);
      v.setUint16(8, 0, true); v.setUint16(10, 0, true);
      v.setUint16(12, 0, true); v.setUint16(14, 0, true);
      v.setUint32(16, crc, true);
      v.setUint32(20, size, true); v.setUint32(24, size, true);
      v.setUint16(28, nameLen, true); v.setUint16(30, 0, true);
      v.setUint16(32, 0, true); v.setUint16(34, 0, true);
      v.setUint16(36, 0, true); v.setUint32(38, 0, true);
      v.setUint32(42, offset, true);
      new Uint8Array(entry).set(nameBytes, 46);
      parts.push(entry);
    }

    // End of central directory
    const centralEnd = 22;
    const eocd = new ArrayBuffer(centralEnd);
    const v = new DataView(eocd);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(4, 0, true); v.setUint16(6, 0, true);
    v.setUint16(8, files.length, true); v.setUint16(10, files.length, true);
    const centralSize = parts.length > files.length ? parts.slice(files.length).reduce((a, b) => a + (b as ArrayBuffer).byteLength, 0) : 0;
    v.setUint32(12, centralSize, true);
    v.setUint32(16, centralStart, true);
    v.setUint16(20, 0, true);
    parts.push(eocd);
    return new Blob(parts, { type: 'application/zip' });
  }

  private crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /** 生成仅含一张图的 DOCX（纯前端，无需服务器） */
  private buildSimpleDocx(pngBytes: Uint8Array): Blob {
    const EMU = 9525;
    const cx = Math.min(8640 * EMU, Math.round(Math.sqrt(1200 * 800) * EMU * 0.85));
    const cy = Math.round(cx * 800 / 1200);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body><w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="panorama.png"/>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="panorama.png"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
</w:body></w:document>`.trim();
    const encoder = new TextEncoder();
    return this.buildZip([
      { name: 'word/document.xml', data: encoder.encode(doc) },
      { name: 'word/media/panorama.png', data: pngBytes },
      { name: '[Content_Types].xml', data: encoder.encode(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>') },
      { name: '_rels/.rels', data: encoder.encode(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>') },
      { name: 'word/_rels/document.xml.rels', data: encoder.encode(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/panorama.png"/>' +
        '</Relationships>') },
    ]);
  }

  protected async exportPanoramaDocx(): Promise<void> {
    this.closeExportMenu();
    this.exportWait.set({ title: '正在截图…', description: 'html2canvas 截取全景视图。', progress: 20 });
    await new Promise((r) => setTimeout(r, 10));
    try {
      const h2c = (await import('html2canvas')).default;
      const el = document.querySelector<HTMLElement>('[data-testid="panorama-overview-rich"]');
      if (!el) { this.exportWait.set(null); return; }
      this.exportWait.set({ title: '截图完成，正在生成 DOCX…', description: '', progress: 60 });
      const canvas = await h2c(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const pngBytes = new Uint8Array(await new Promise<ArrayBuffer>((r) => canvas.toBlob((b) => r(b!.arrayBuffer()), 'image/png')!));
      this.exportWait.set({ title: '正在下载…', description: '', progress: 95 });
      const docx = this.buildSimpleDocx(pngBytes);
      this.downloadBlob(docx, 'panorama.docx');
    } catch (e) { /* */ }
    this.exportWait.set(null);
  }

  protected async exportPanoramaZip(): Promise<void> {
    this.closeExportMenu();
    this.exportWait.set({ title: '正在截图…', description: '', progress: 20 });
    await new Promise((r) => setTimeout(r, 10));
    try {
      const h2c = (await import('html2canvas')).default;
      const el = document.querySelector<HTMLElement>('[data-testid="panorama-overview-rich"]');
      if (!el) { this.exportWait.set(null); return; }
      const canvas = await h2c(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const pngBytes = new Uint8Array(await new Promise<ArrayBuffer>((r) => canvas.toBlob((b) => r(b!.arrayBuffer()), 'image/png')!));
      this.exportWait.set({ title: '正在打包…', description: '', progress: 70 });
      const encoder = new TextEncoder();
      const zip = this.buildZip([
        { name: 'panorama.md', data: encoder.encode('![panorama](panorama.png)\n') },
        { name: 'panorama.png', data: pngBytes },
      ]);
      this.exportWait.set({ title: '正在下载…', description: '', progress: 95 });
      this.downloadBlob(zip, 'panorama.zip');
    } catch (e) { /* */ }
    this.exportWait.set(null);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.viewportSize.set(this.readViewportSize());
  }

  protected stageProcessCount(stageUid: string): number {
    return getStageProcesses(this.document(), stageUid).length;
  }

  protected switchTab(tabId: PanoramaSubtab): void {
    this.activeTab.set(tabId);
    // 关键流程：编辑态是一次工作台级编辑会话，不跟随三级 tab 自动关闭。
    // 切换 tab 只收起全景视图的跳转菜单，避免菜单悬浮到不相关子视图。
    this.editMenuOpen.set(false);
  }

  protected toggleEditing(): void {
    if (this.activeTab() === 'overview') {
      this.editMenuOpen.update((value) => !value);
      return;
    }
    this.editing.update((value) => !value);
  }

  protected openDetailedEditor(target: 'valueDomain' | 'component'): void {
    const runtime = getAngularRuntimeState();
    if (target === 'valueDomain') {
      runtime.ui['procView'] = 'valueDomain';
      runtime.ui['processWorkbenchView'] = 'valueDomain';
      runtime.ui['taskId'] = null;
    } else {
      runtime.ui['componentWorkbenchTab'] = 'component';
    }
    this.editMenuOpen.set(false);
    switchAngularMainTab(target === 'valueDomain' ? 'processWorkbench' : 'constructWorkbench');
  }

  @HostListener('document:click', ['$event'])
  protected closeMenusFromDocument(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-testid="panorama-edit-menu-wrap"]')) return;
    this.editMenuOpen.set(false);
    this.exportMenuOpen.set(false);
  }

  protected zoom(delta: number): void {
    const next = this.clampZoom(Math.round((this.zoomValue() + delta) * 100) / 100);
    this.manualZoom.set(next);
  }

  protected resetZoom(): void {
    this.manualZoom.set(null);
  }

  protected onOverviewWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    event.preventDefault();
    this.zoom(event.deltaY < 0 ? 0.08 : -0.08);
  }

  protected cell(laneId: string, columnId: string): ValueDomainCell | null {
    return this.panoramaModel().cells.find((item) => this.cellLaneId(item) === laneId && this.cellColumnId(item) === columnId) || null;
  }

  protected cellStages(laneId: string, columnId: string): Stage[] {
    return this.document().stages.filter((stage) => stage.panoramaLaneUid === laneId && stage.panoramaColumnUid === columnId);
  }

  protected selectStage(stage: Stage): void {
    const stageId = this.stageUid(stage);
    this.selectedStageUid.set(this.selectedStageUid() === stageId ? '' : stageId);
    this.selectedComponentUid.set('');
  }

  protected selectComponent(component: BusinessComponent): void {
    const componentId = this.componentUid(component);
    this.selectedComponentUid.set(this.selectedComponentUid() === componentId ? '' : componentId);
    this.selectedStageUid.set('');
  }

  protected isStageHighlighted(stage: Stage): boolean {
    const stageId = this.stageUid(stage);
    const selectedStage = this.selectedStageUid();
    if (selectedStage) return selectedStage === stageId;
    const selectedComponent = this.selectedComponent();
    return selectedComponent ? this.componentStageIds(selectedComponent).has(stageId) : false;
  }

  protected isComponentHighlighted(component: BusinessComponent): boolean {
    const componentId = this.componentUid(component);
    const selectedComponent = this.selectedComponentUid();
    if (selectedComponent) return selectedComponent === componentId;
    const selectedStage = this.selectedStageUid();
    return selectedStage ? this.componentStageIds(component).has(selectedStage) : false;
  }

  protected columnUid(column: ValueDomainColumn): string {
    return getValueDomainColumnUid(column);
  }

  protected laneUid(lane: ValueDomainLane): string {
    return getValueDomainLaneUid(lane);
  }

  protected componentConstructText(component: BusinessComponent): string {
    const componentIds = new Set([component.uid, component.id].filter(Boolean).map(String));
    const constructs = ((this.document() as BlmDocument & { businessConstructs?: Array<Record<string, unknown>> }).businessConstructs || [])
      .filter((construct) => {
        const owner = construct['businessComponentUid'] || construct['businessComponentId'] || construct['componentUid'] || construct['componentId'];
        return componentIds.has(String(owner || ''));
      });
    return `${constructs.length}个构件`;
  }

  protected stageUid(stage: Stage): string {
    return String(stage.uid || stage.id || '').trim();
  }

  protected componentUid(component: BusinessComponent): string {
    return String(component.uid || component.id || '').trim();
  }

  // 边界细节：总览必须是查询投影，缺失矩阵结构时只给 UI fallback，不写回文档模型。
  private withFallback<T>(items: T[] | null | undefined, fallback: T): T[] {
    return items?.length ? items : [fallback];
  }

  private cellLaneId(cell: ValueDomainCell): string {
    return String(cell.laneUid || '').trim();
  }

  private cellColumnId(cell: ValueDomainCell): string {
    return String(cell.columnUid || '').trim();
  }

  private componentKind(component: BusinessComponent): 'core' | 'generic' {
    const kind = String(component.kind || '').trim();
    return kind === 'generic' || kind === 'common' ? 'generic' : 'core';
  }

  private selectedComponent(): BusinessComponent | null {
    const selected = this.selectedComponentUid();
    return selected ? this.document().businessComponents.find((component) => this.componentUid(component) === selected) || null : null;
  }

  private componentStageIds(component: BusinessComponent): Set<string> {
    return new Set(getComponentSupportedStages(this.document(), component).map((stage) => this.stageUid(stage)).filter(Boolean));
  }

  private clampZoom(value: number): number {
    return Math.max(0.55, Math.min(1.35, value));
  }

  private readViewportSize(): { width: number; height: number } {
    if (typeof window === 'undefined') return { width: 1440, height: 900 };
    return { width: window.innerWidth || 1440, height: window.innerHeight || 900 };
  }
}
