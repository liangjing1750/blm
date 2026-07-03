import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntityDesignWorkbenchComponent } from './entity-design/entity-design-workbench.component';
import { getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';
import { RichTextEditorComponent } from '../../shared/rich-text/rich-text-editor.component';

type ComponentTab = 'businessComponent' | 'businessConstruct' | 'taskDef' | 'entity';

interface LegacyComp { uid?: string; id?: string; name?: string; kind?: string; note?: string; entityUids?: string[]; taskDefinitionUids?: string[]; constructUids?: string[]; }
interface LegacyConstruct { uid?: string; id?: string; name?: string; note?: string; businessComponentUid?: string; businessComponentId?: string; businessComponent?: string; }
interface LegacyEntity { uid?: string; id?: string; name?: string; fields?: any[]; businessConstructUid?: string; businessConstructId?: string; businessConstructUids?: string[]; constructUid?: string; constructId?: string; }
interface TaskParam { name: string; type: string; required: boolean; note: string; }
interface TechnicalHandover { runtimeKind?: string; target?: string; note?: string; }
interface LegacyTaskDef { uid?: string; id?: string; name?: string; type?: string; querySourceKind?: string; target?: string; address?: string; desc?: string; note?: string; parameters?: { inputs?: TaskParam[]; outputs?: TaskParam[] }; technicalHandover?: TechnicalHandover; constructUid?: string; businessComponentUid?: string; }

@Component({
  selector: 'app-component-workbench', standalone: true, imports: [CommonModule, FormsModule, EntityDesignWorkbenchComponent, RichTextEditorComponent],
  templateUrl: './component-workbench.html', styleUrl: './component-workbench.scss',
})
export class ComponentWorkbenchComponent implements OnInit, OnDestroy {
  private readonly onRefresh = () => this.version.update((v) => v + 1);
  private readonly runtime = getAngularRuntimeState();
  ngOnInit(): void { window.addEventListener('blm-workbench-refresh', this.onRefresh); }
  ngOnDestroy(): void { window.removeEventListener('blm-workbench-refresh', this.onRefresh); }

  protected readonly version = signal(0);
  protected readonly activeTab = signal<ComponentTab>(this.restoreActiveTab());
  protected readonly editorOpen = signal(false);
  protected readonly selectedConstructId = signal(String(this.runtime.ui['componentWorkbenchConstructId'] || '').trim());
  protected readonly expandedComp = signal('');
  protected readonly editTaskDef = signal<Partial<LegacyTaskDef> | null>(null);
  protected readonly taskDefKeyword = signal('');
  // 抽屉状态
  protected readonly compDrawer = signal<Partial<LegacyComp> | null>(null);
  protected readonly constructDrawer = signal<Partial<LegacyConstruct> | null>(null);
  protected readonly newConstructCompId = signal('');

  protected doc(): any { this.version(); return getAngularRuntimeState().doc || {}; }
  protected components(): LegacyComp[] { return this.doc().businessComponents || []; }
  protected coreComponents(): LegacyComp[] { return this.components().filter((comp) => this.componentKind(comp) === 'core'); }
  protected genericComponents(): LegacyComp[] { return this.components().filter((comp) => this.componentKind(comp) === 'generic'); }
  protected constructs(): LegacyConstruct[] { return this.doc().businessConstructs || []; }
  protected entities(): LegacyEntity[] { return this.doc().entities || []; }
  protected taskDefs(): LegacyTaskDef[] { return this.doc().taskDefinitions || []; }

  protected canEdit(): boolean { return this.editorOpen() && !this.runtime.readOnly; }
  protected enableEditor(): void {
    if (this.runtime.readOnly) return;
    this.editorOpen.set(true);
  }
  protected toggleEditor(): void {
    if (this.runtime.readOnly) {
      this.editorOpen.set(false);
      return;
    }
    this.editorOpen.update((open) => {
      const next = !open;
      if (!next) {
        this.compDrawer.set(null);
        this.constructDrawer.set(null);
        this.editingTaskId.set('');
      }
      return next;
    });
  }

  // 业务组件/业务构件：总览只展示分组关系，详情页再展开实体与任务资产。
  protected constructsFor(comp: LegacyComp): LegacyConstruct[] {
    const cid = this.uid(comp);
    const explicitIds = new Set(comp.constructUids || []);
    return this.constructs().filter((c) => this.constructComponentId(c) === cid || explicitIds.has(this.uid(c)));
  }
  protected visibleConstructsFor(comp: LegacyComp): LegacyConstruct[] {
    const list = this.constructsFor(comp);
    return this.expandedComp() === this.uid(comp) ? list : list.slice(0, 3);
  }
  protected hiddenConstructCount(comp: LegacyComp): number {
    return Math.max(0, this.constructsFor(comp).length - this.visibleConstructsFor(comp).length);
  }
  protected toggleComponentConstructs(comp: LegacyComp): void {
    const id = this.uid(comp);
    this.expandedComp.set(this.expandedComp() === id ? '' : id);
  }
  protected ungroupedConstructs(): LegacyConstruct[] {
    const groupedIds = new Set<string>();
    for (const comp of this.components()) {
      for (const construct of this.constructsFor(comp)) groupedIds.add(this.uid(construct));
    }
    return this.constructs().filter((construct) => !groupedIds.has(this.uid(construct)) && !this.constructComponentId(construct));
  }
  protected entitiesFor(construct: LegacyConstruct): LegacyEntity[] {
    const cid = this.uid(construct);
    return this.entities().filter((e) => e.businessConstructUid === cid || (e.businessConstructUids || []).includes(cid));
  }
  protected taskDefsFor(construct: LegacyConstruct): LegacyTaskDef[] {
    const cid = this.uid(construct);
    return this.taskDefs().filter((t) => t.constructUid === cid);
  }
  protected selectedConstruct(): LegacyConstruct | null {
    const selectedId = this.selectedConstructId();
    return this.constructs().find((c) => this.uid(c) === selectedId) || this.constructs()[0] || null;
  }
  protected componentForConstruct(construct: LegacyConstruct | null): LegacyComp | null {
    if (!construct) return null;
    const compId = this.constructComponentId(construct);
    return this.components().find((c) => this.uid(c) === compId) || null;
  }
  protected selectedConstructComponentId(): string {
    const construct = this.selectedConstruct();
    return this.constructComponentId(construct || {});
  }
  protected constructsForSelectedConstructComponent(): LegacyConstruct[] {
    const compId = this.selectedConstructComponentId();
    if (!compId) return this.constructs();
    return this.constructs().filter((construct) => this.constructComponentId(construct) === compId);
  }
  protected selectConstructComponent(compId: string): void {
    const constructs = compId
      ? this.constructs().filter((construct) => this.constructComponentId(construct) === compId)
      : this.constructs();
    this.setSelectedConstruct(constructs[0] || null);
  }
  protected isSelectedConstruct(construct: LegacyConstruct): boolean {
    return this.uid(construct) === this.selectedConstructId();
  }
  protected openBusinessConstruct(construct: LegacyConstruct): void {
    this.setSelectedConstruct(construct);
    this.switchTab('businessConstruct');
  }
  protected openBusinessConstructById(constructId: string): void {
    const construct = this.constructs().find((c) => this.uid(c) === constructId);
    if (construct) this.openBusinessConstruct(construct);
  }
  protected returnToBusinessComponents(): void {
    this.switchTab('businessComponent');
  }
  protected openTaskDefinitionsForConstruct(construct: LegacyConstruct): void {
    const constructId = this.uid(construct);
    this.setSelectedConstruct(construct);
    this.taskDefCompId.set(String(construct.businessComponentUid || '').trim());
    this.taskDefConstructId.set(constructId);
    this.taskDefPage.set(1);
    this.switchTab('taskDef');
  }
  protected openEntitiesForConstruct(construct: LegacyConstruct): void {
    this.setSelectedConstruct(construct);
    this.switchTab('entity');
  }
  protected updateConstructInline(construct: LegacyConstruct, key: 'name' | 'note' | 'businessComponentUid', value: string): void {
    if (!this.canEdit()) return;
    if (key === 'businessComponentUid') {
      const comp = this.components().find((item) => this.uid(item) === value) || null;
      if (comp) this.attachConstructToComponent(construct, comp);
      else this.detachConstructFromComponent(construct);
      return;
    }
    construct[key] = value;
    this.touch();
  }
  protected addComponentInline(kind: 'core' | 'generic' = 'core'): void {
    if (!this.canEdit()) return;
    const doc = this.doc();
    doc.businessComponents ||= [];
    const component: LegacyComp = {
      uid: 'COMP' + Date.now(),
      name: this.uniqueComponentName('新业务组件'),
      kind,
      note: '',
      constructUids: [],
    };
    doc.businessComponents.push(component);
    this.expandedComp.set(this.uid(component));
    this.touch();
  }
  protected updateComponentInline(comp: LegacyComp, key: 'name' | 'kind' | 'note', value: string): void {
    if (!this.canEdit()) return;
    if (key === 'kind') comp.kind = value === 'generic' ? 'generic' : 'core';
    else comp[key] = value;
    if (key === 'name') {
      for (const construct of this.constructsFor(comp)) construct.businessComponent = value;
      for (const taskDef of this.taskDefs()) {
        if (taskDef.businessComponentUid === this.uid(comp)) taskDef.businessComponentUid = this.uid(comp);
      }
    }
    this.touch();
  }
  protected attachConstructToComponent(construct: LegacyConstruct, comp: LegacyComp): void {
    if (!this.canEdit()) return;
    this.detachConstructFromComponents(construct);
    const constructId = this.uid(construct);
    construct.businessComponentUid = this.uid(comp);
    construct.businessComponentId = this.uid(comp);
    construct.businessComponent = comp.name || '';
    comp.constructUids = [...new Set([...(comp.constructUids || []), constructId])];
    this.setSelectedConstruct(construct);
    this.expandedComp.set(this.uid(comp));
    this.touch();
  }
  protected detachConstructFromComponent(construct: LegacyConstruct): void {
    if (!this.canEdit()) return;
    this.detachConstructFromComponents(construct);
    construct.businessComponentUid = '';
    construct.businessComponentId = '';
    construct.businessComponent = '';
    this.touch();
  }
  protected fieldCount(entity: LegacyEntity): number {
    return (entity.fields || []).length;
  }
  protected taskNodeCount(taskDef: LegacyTaskDef): number {
    return this.taskNodes(taskDef).length;
  }
  protected unclassifiedEntities(): LegacyEntity[] {
    const used = new Set(this.entities().filter((e) => e.businessConstructUid || (e.businessConstructUids || [])[0]).map((e) => e.uid || e.id));
    return this.entities().filter((e) => !used.has(e.uid || e.id));
  }
  protected unclassifiedTaskDefs(): LegacyTaskDef[] {
    const used = new Set(this.taskDefs().filter((t) => t.constructUid).map((t) => t.uid || t.id));
    return this.taskDefs().filter((t) => !used.has(t.uid || t.id));
  }
  protected addEntityTo(entity: LegacyEntity, construct: LegacyConstruct): void { if (!this.canEdit()) return; entity.businessConstructUid = this.uid(construct); entity.businessConstructUids = [this.uid(construct)]; this.touch(); }
  protected removeEntity(entity: LegacyEntity): void { if (!this.canEdit()) return; entity.businessConstructUid = ''; entity.businessConstructId = ''; entity.businessConstructUids = []; entity.constructUid = ''; entity.constructId = ''; this.touch(); }
  protected addTaskDefTo(td: LegacyTaskDef, construct: LegacyConstruct): void { if (!this.canEdit()) return; td.constructUid = this.uid(construct); this.touch(); }
  protected removeTaskDef(td: LegacyTaskDef): void { if (!this.canEdit()) return; td.constructUid = ''; this.touch(); }
  protected createEntityForConstruct(construct: LegacyConstruct): void {
    if (!this.canEdit()) return;
    const doc = this.doc();
    doc.entities ||= [];
    const id = 'ENT' + Date.now();
    doc.entities.push({
      uid: id,
      id,
      name: this.uniqueEntityName('新实体'),
      fields: [],
      businessConstructUid: this.uid(construct),
      businessConstructUids: [this.uid(construct)],
    });
    this.touch();
  }
  protected createTaskForConstruct(construct: LegacyConstruct): void {
    if (!this.canEdit()) return;
    const doc = this.doc();
    doc.taskDefinitions ||= [];
    const id = 'TASK' + Date.now();
    doc.taskDefinitions.push({
      uid: id,
      id,
      name: this.uniqueTaskName('新任务'),
      type: 'Query',
      constructUid: this.uid(construct),
      businessComponentUid: this.constructComponentId(construct),
      parameters: { inputs: [], outputs: [] },
      technicalHandover: { runtimeKind: '', target: '', note: '' },
    });
    this.touch();
  }
  protected createConstructForComponent(comp: LegacyComp | null): void {
    if (!this.canEdit()) return;
    const doc = this.doc();
    doc.businessConstructs ||= [];
    const id = 'CSTR' + Date.now();
    const construct: LegacyConstruct = {
      uid: id,
      id,
      name: this.uniqueConstructName('新构件'),
      note: '',
      businessComponentUid: comp ? this.uid(comp) : '',
      businessComponentId: comp ? this.uid(comp) : '',
      businessComponent: comp?.name || '',
    };
    doc.businessConstructs.push(construct);
    if (comp) comp.constructUids = [...new Set([...(comp.constructUids || []), id])];
    this.setSelectedConstruct(construct);
    this.switchTab('businessConstruct');
    this.touch();
  }
  protected createConstructForSelectedComponent(): void {
    const comp = this.components().find((item) => this.uid(item) === this.selectedConstructComponentId()) || null;
    this.createConstructForComponent(comp);
  }

  // ─── 组件编辑抽屉 ──────────────────────────────
  protected openCompDrawer(comp?: LegacyComp): void {
    if (!this.canEdit()) return;
    this.compDrawer.set(comp ? { ...comp } : { uid: '', name: '', kind: 'core', note: '' });
  }
  protected saveComp(): void {
    if (!this.canEdit()) return;
    const d = this.compDrawer(); if (!d || !d.name?.trim()) return;
    const doc = this.doc();
    if (!d.uid) { d.uid = 'COMP' + Date.now(); doc.businessComponents ||= []; doc.businessComponents.push(d); }
    else { const ex = (doc.businessComponents || []).find((c: any) => (c.uid || c.id) === d.uid); if (ex) Object.assign(ex, d); }
    this.compDrawer.set(null); this.touch();
  }
  protected deleteComp(comp: LegacyComp): void {
    if (!this.canEdit()) return;
    if (!window.confirm(`确认删除业务组件“${comp.name || this.uid(comp)}”吗？组件下的构件会移入未分组。`)) return;
    for (const construct of this.constructsFor(comp)) {
      construct.businessComponentUid = '';
      construct.businessComponentId = '';
      construct.businessComponent = '';
    }
    this.doc().businessComponents = this.components().filter((c) => (c.uid || c.id) !== (comp.uid || comp.id));
    this.compDrawer.set(null); this.touch();
  }
  // 抽屉内部操作：类型转换由方法内部处理
  protected saveDrawerComp(): void { this.saveComp(); }
  protected deleteDrawerComp(): void { const d = this.compDrawer(); if (d) this.deleteComp(d as LegacyComp); }

  // ─── 构件编辑抽屉 ──────────────────────────────
  protected openConstructDrawer(construct?: LegacyConstruct, compId?: string): void {
    if (!this.canEdit()) return;
    this.constructDrawer.set(construct ? { ...construct } : { uid: '', name: '', businessComponentUid: compId || '' });
  }
  protected saveConstruct(): void {
    if (!this.canEdit()) return;
    const d = this.constructDrawer(); if (!d || !d.name?.trim()) return;
    const doc = this.doc();
    if (!d.uid) { d.uid = 'CSTR' + Date.now(); doc.businessConstructs ||= []; doc.businessConstructs.push(d); }
    else { const ex = (doc.businessConstructs || []).find((c: any) => (c.uid || c.id) === d.uid); if (ex) Object.assign(ex, d); }
    if (d.businessComponentUid) {
      const comp = this.components().find((item) => this.uid(item) === d.businessComponentUid);
      if (comp) this.attachConstructToComponent(d as LegacyConstruct, comp);
    }
    this.setSelectedConstruct(d as LegacyConstruct);
    this.constructDrawer.set(null); this.touch();
  }
  protected deleteConstruct(construct: LegacyConstruct): void {
    if (!this.canEdit()) return;
    this.doc().businessConstructs = this.constructs().filter((c) => (c.uid || c.id) !== (construct.uid || construct.id));
    if (this.selectedConstructId() === this.uid(construct)) this.setSelectedConstruct(this.constructs()[0] || null);
    this.constructDrawer.set(null); this.touch();
  }
  protected saveDrawerConstruct(): void { this.saveConstruct(); }
  protected deleteDrawerConstruct(): void { const d = this.constructDrawer(); if (d) this.deleteConstruct(d as LegacyConstruct); }
  protected drawerConstruct(): LegacyConstruct { return this.constructDrawer() as LegacyConstruct; }
  // 抽屉内关联操作
  protected addEntityToDrawerConstruct(entityId: string): void {
    if (!this.canEdit()) return;
    const e = this.unclassifiedEntities().find((x) => this.uid(x) === entityId);
    const c = this.constructDrawer();
    if (e && c) { e.businessConstructUid = this.uid(c as any); e.businessConstructUids = [this.uid(c as any)]; this.touch(); }
  }
  protected addTaskDefToDrawerConstruct(taskDefId: string): void {
    if (!this.canEdit()) return;
    const t = this.unclassifiedTaskDefs().find((x) => this.uid(x) === taskDefId);
    const c = this.constructDrawer();
    if (t && c) { t.constructUid = this.uid(c as any); this.touch(); }
  }

  // ─── Tab 2: 任务定义 ──────────────────────────────
  protected readonly taskDefCompId = signal('');
  protected readonly taskDefConstructId = signal('');
  protected readonly taskDefPage = signal(1);
  readonly taskDefPageSize = 15;

  // 按已选组件筛选的构件列表（联动）
  protected filteredConstructsForTaskDef(): LegacyConstruct[] {
    const cid = this.taskDefCompId();
    if (!cid) return this.constructs();
    return this.constructs().filter((c) => this.constructComponentId(c) === cid);
  }

  protected selectTaskDefComp(compId: string): void {
    this.taskDefCompId.set(compId);
    this.taskDefConstructId.set('');
    this.taskDefPage.set(1);
  }
  protected pagedTaskDefs(): LegacyTaskDef[] {
    const list = this.filteredTaskDefs();
    const start = (this.taskDefPage() - 1) * this.taskDefPageSize;
    return list.slice(start, start + this.taskDefPageSize);
  }
  protected taskDefTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTaskDefs().length / this.taskDefPageSize));
  }

  protected tdConstructId(td: LegacyTaskDef): string {
    return String(td.constructUid || '').trim();
  }

  protected filteredTaskDefs(): LegacyTaskDef[] {
    const compId = this.taskDefCompId();
    const constructId = this.taskDefConstructId();
    const kw = this.taskDefKeyword().toLowerCase();
    let list = this.taskDefs();
    if (constructId) {
      list = list.filter((t) => this.tdConstructId(t) === constructId);
    } else if (compId) {
      const comp = this.components().find((c) => this.uid(c) === compId);
      if (comp) {
        const cids = new Set(this.constructsFor(comp).map((c) => this.uid(c)));
        list = list.filter((t) => cids.has(this.tdConstructId(t)));
      }
    }
    if (kw) list = list.filter((t) => [t.name, t.target, t.address].join(' ').toLowerCase().includes(kw));
    return list;
  }
  protected taskNodes(td: LegacyTaskDef): Array<{ uid: string; name: string; pname: string }> {
    const nodes: Array<{ uid: string; name: string; pname: string }> = [];
    for (const p of this.doc().processes || []) for (const n of p.nodes || p.tasks || []) if (n.taskDefinitionUid === (td.uid || td.id)) nodes.push({ uid: n.uid || n.id, name: n.name || '节点', pname: p.name || '' });
    return nodes;
  }
  protected editingTaskId = signal('');
  protected expandedTaskIds = signal(new Set<string>());
  protected toggleTaskExpand(id: string): void {
    this.expandedTaskIds.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  protected isTaskExpanded(id: string): boolean { return this.expandedTaskIds().has(id); }
  protected startEditInline(td?: LegacyTaskDef): void {
    if (!this.canEdit()) return;
    if (td) { this.ensureTaskHandover(td); this.editingTaskId.set(this.uid(td)); return; }
    // 新建
    const base: LegacyTaskDef = { uid: '', name: '', type: 'Query', target: '', address: '', note: '', constructUid: '', parameters: { inputs: [], outputs: [] }, technicalHandover: { runtimeKind: '', target: '', note: '' } };
    this.doc().taskDefinitions ||= [];
    this.doc().taskDefinitions.push(base);
    this.editingTaskId.set('');
    this.touch();
  }
  protected saveInlineEdit(td: LegacyTaskDef): void {
    if (!this.canEdit()) return;
    td.parameters ||= { inputs: [], outputs: [] };
    this.ensureTaskHandover(td);
    this.editingTaskId.set('');
    this.touch();
  }
  protected cancelInlineEdit(td: LegacyTaskDef): void {
    if (!this.canEdit()) return;
    if (!td.uid) {
      this.doc().taskDefinitions = this.taskDefs().filter((t) => t !== td);
    }
    this.editingTaskId.set('');
    this.touch();
  }
  protected async deleteTaskDef(td: LegacyTaskDef): Promise<void> {
    if (!this.canEdit()) return;
    if (!window.confirm(`确认删除"${td.name || this.uid(td)}"吗？`)) return;
    this.doc().taskDefinitions = this.taskDefs().filter((t) => (t.uid || t.id) !== (td.uid || td.id));
    this.touch();
  }
  protected addParam(arr: TaskParam[]): void { if (!this.canEdit()) return; arr.push({ name: '', type: 'String', required: false, note: '' }); }
  protected removeParam(arr: TaskParam[], idx: number): void { if (!this.canEdit()) return; arr.splice(idx, 1); }
  protected isEditingTask(td: LegacyTaskDef): boolean { return this.editingTaskId() === this.uid(td) || (!td.uid && this.editingTaskId() === ''); }
  protected ensureTaskHandover(td: LegacyTaskDef): TechnicalHandover {
    td.technicalHandover ||= { runtimeKind: '', target: '', note: '' };
    return td.technicalHandover;
  }
  protected hasTaskHandover(td: LegacyTaskDef): boolean {
    const handover = td.technicalHandover;
    return Boolean(handover?.runtimeKind || handover?.target || handover?.note);
  }

  // ─── Utils ────────────────────────────────────────
  protected uid(item: any): string { return String(item?.uid || item?.id || item?.name || '').trim(); }
  protected constructName(constructId: string): string { const c = this.constructs().find((x) => this.uid(x) === constructId); return c?.name || constructId || '未归类'; }
  protected componentKind(comp: LegacyComp): 'core' | 'generic' {
    return comp.kind === 'generic' || comp.kind === 'common' ? 'generic' : 'core';
  }
  private constructComponentId(construct: LegacyConstruct): string {
    return String(construct.businessComponentUid || construct.businessComponentId || '').trim();
  }
  private detachConstructFromComponents(construct: LegacyConstruct): void {
    const constructId = this.uid(construct);
    for (const comp of this.components()) {
      comp.constructUids = (comp.constructUids || []).filter((id) => id !== constructId);
    }
  }
  private uniqueComponentName(baseName: string): string {
    const names = new Set(this.components().map((comp) => String(comp.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }
  private uniqueConstructName(baseName: string): string {
    const names = new Set(this.constructs().map((construct) => String(construct.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }
  private uniqueEntityName(baseName: string): string {
    const names = new Set(this.entities().map((entity) => String(entity.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }
  private uniqueTaskName(baseName: string): string {
    const names = new Set(this.taskDefs().map((task) => String(task.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }
  protected switchTab(t: ComponentTab): void {
    if (t === 'businessConstruct' && !this.selectedConstructId()) this.setSelectedConstruct(this.constructs()[0] || null);
    this.runtime.ui['componentWorkbenchTab'] = t;
    this.activeTab.set(t);
  }
  protected toggleExp(id: string): void { this.expandedComp.set(this.expandedComp() === id ? '' : id); }
  protected isExp(id: string): boolean { return this.expandedComp() === id; }
  // ─── 抽屉宽度拖拽 ──────────────────────────
  protected readonly drawerWidth = signal(400);
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  protected startDrawerResize(event: MouseEvent): void {
    event.preventDefault();
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.drawerWidth();
    const onMove = (e: MouseEvent) => {
      const dx = this.resizeStartX - e.clientX;
      this.drawerWidth.set(Math.max(280, Math.min(900, this.resizeStartWidth + dx)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  protected touch(): void { markAngularRuntimeModified(); this.version.update((v) => v + 1); }

  private setSelectedConstruct(construct: LegacyConstruct | null): void {
    const id = construct ? this.uid(construct) : '';
    this.selectedConstructId.set(id);
    this.runtime.ui['componentWorkbenchConstructId'] = id;
  }

  private restoreActiveTab(): ComponentTab {
    const saved = String(this.runtime.ui['componentWorkbenchTab'] || '').trim();
    if (saved === 'component' || saved === 'service' || saved === 'orchestration') return 'businessComponent';
    return ['businessComponent', 'businessConstruct', 'taskDef', 'entity'].includes(saved)
      ? saved as ComponentTab
      : 'businessComponent';
  }
}
