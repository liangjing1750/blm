import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntityDesignWorkbenchComponent } from './entity-design/entity-design-workbench.component';
import { getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';

type ComponentTab = 'component' | 'taskDef' | 'entity' | 'service' | 'orchestration';

interface LegacyComp { uid?: string; id?: string; name?: string; kind?: string; note?: string; entityUids?: string[]; taskDefinitionUids?: string[]; constructUids?: string[]; }
interface LegacyConstruct { uid?: string; id?: string; name?: string; businessComponentUid?: string; }
interface LegacyEntity { uid?: string; id?: string; name?: string; fields?: any[]; businessConstructUid?: string; businessConstructUids?: string[]; }
interface TaskParam { name: string; type: string; required: boolean; note: string; }
interface LegacyTaskDef { uid?: string; id?: string; name?: string; type?: string; querySourceKind?: string; target?: string; address?: string; desc?: string; note?: string; parameters?: { inputs?: TaskParam[]; outputs?: TaskParam[] }; businessConstructUid?: string; businessComponentUid?: string; }
interface LegacyService { uid?: string; name?: string; method?: string; path?: string; desc?: string; taskDefinitionUids?: string[]; nodeRefs?: string[]; }

@Component({
  selector: 'app-component-workbench', standalone: true, imports: [CommonModule, FormsModule, EntityDesignWorkbenchComponent],
  templateUrl: './component-workbench.html', styleUrl: './component-workbench.scss',
})
export class ComponentWorkbenchComponent implements OnInit, OnDestroy {
  private readonly onRefresh = () => this.version.update((v) => v + 1);
  ngOnInit(): void { window.addEventListener('blm-workbench-refresh', this.onRefresh); }
  ngOnDestroy(): void { window.removeEventListener('blm-workbench-refresh', this.onRefresh); }

  protected readonly version = signal(0);
  protected readonly activeTab = signal<ComponentTab>('component');
  protected readonly expandedComp = signal('');
  protected readonly editTaskDef = signal<Partial<LegacyTaskDef> | null>(null);
  protected readonly editSvc = signal<Partial<LegacyService> | null>(null);
  protected readonly orchSvcId = signal('');
  protected readonly taskDefKeyword = signal('');
  // 抽屉状态
  protected readonly compDrawer = signal<Partial<LegacyComp> | null>(null);
  protected readonly constructDrawer = signal<Partial<LegacyConstruct> | null>(null);
  protected readonly newConstructCompId = signal('');
  protected readonly svcKeyword = signal('');

  protected doc(): any { this.version(); return getAngularRuntimeState().doc || {}; }
  protected components(): LegacyComp[] { return this.doc().businessComponents || []; }
  protected constructs(): LegacyConstruct[] { return this.doc().businessConstructs || []; }
  protected entities(): LegacyEntity[] { return this.doc().entities || []; }
  protected taskDefs(): LegacyTaskDef[] { return this.doc().taskDefinitions || []; }
  protected services(): LegacyService[] { return this.doc().services || []; }

  // ─── Tab 1: 组件构件 ──────────────────────────────
  protected constructsFor(comp: LegacyComp): LegacyConstruct[] {
    const cid = this.uid(comp);
    return this.constructs().filter((c) => this.uid({ uid: c.businessComponentUid }) === cid);
  }
  protected entitiesFor(construct: LegacyConstruct): LegacyEntity[] {
    const cid = this.uid(construct);
    return this.entities().filter((e) => e.businessConstructUid === cid || (e.businessConstructUids || []).includes(cid));
  }
  protected taskDefsFor(construct: LegacyConstruct): LegacyTaskDef[] {
    const cid = this.uid(construct);
    return this.taskDefs().filter((t) => t.businessConstructUid === cid);
  }
  protected unclassifiedEntities(): LegacyEntity[] {
    const used = new Set(this.entities().filter((e) => e.businessConstructUid || (e.businessConstructUids || [])[0]).map((e) => e.uid || e.id));
    return this.entities().filter((e) => !used.has(e.uid || e.id));
  }
  protected unclassifiedTaskDefs(): LegacyTaskDef[] {
    const used = new Set(this.taskDefs().filter((t) => t.businessConstructUid).map((t) => t.uid || t.id));
    return this.taskDefs().filter((t) => !used.has(t.uid || t.id));
  }
  protected addEntityTo(entity: LegacyEntity, construct: LegacyConstruct): void { entity.businessConstructUid = this.uid(construct); entity.businessConstructUids = [this.uid(construct)]; this.touch(); }
  protected removeEntity(entity: LegacyEntity): void { entity.businessConstructUid = ''; entity.businessConstructUids = []; this.touch(); }
  protected addTaskDefTo(td: LegacyTaskDef, construct: LegacyConstruct): void { td.businessConstructUid = this.uid(construct); this.touch(); }
  protected removeTaskDef(td: LegacyTaskDef): void { td.businessConstructUid = ''; this.touch(); }

  // ─── 组件编辑抽屉 ──────────────────────────────
  protected openCompDrawer(comp?: LegacyComp): void {
    this.compDrawer.set(comp ? { ...comp } : { uid: '', name: '', kind: 'core', note: '' });
  }
  protected saveComp(): void {
    const d = this.compDrawer(); if (!d || !d.name?.trim()) return;
    const doc = this.doc();
    if (!d.uid) { d.uid = 'COMP' + Date.now(); doc.businessComponents ||= []; doc.businessComponents.push(d); }
    else { const ex = (doc.businessComponents || []).find((c: any) => (c.uid || c.id) === d.uid); if (ex) Object.assign(ex, d); }
    this.compDrawer.set(null); this.touch();
  }
  protected deleteComp(comp: LegacyComp): void {
    this.doc().businessComponents = this.components().filter((c) => (c.uid || c.id) !== (comp.uid || comp.id));
    this.compDrawer.set(null); this.touch();
  }
  // 抽屉内部操作：类型转换由方法内部处理
  protected saveDrawerComp(): void { this.saveComp(); }
  protected deleteDrawerComp(): void { const d = this.compDrawer(); if (d) this.deleteComp(d as LegacyComp); }

  // ─── 构件编辑抽屉 ──────────────────────────────
  protected openConstructDrawer(construct?: LegacyConstruct, compId?: string): void {
    this.constructDrawer.set(construct ? { ...construct } : { uid: '', name: '', businessComponentUid: compId || '' });
  }
  protected saveConstruct(): void {
    const d = this.constructDrawer(); if (!d || !d.name?.trim()) return;
    const doc = this.doc();
    if (!d.uid) { d.uid = 'CSTR' + Date.now(); doc.businessConstructs ||= []; doc.businessConstructs.push(d); }
    else { const ex = (doc.businessConstructs || []).find((c: any) => (c.uid || c.id) === d.uid); if (ex) Object.assign(ex, d); }
    this.constructDrawer.set(null); this.touch();
  }
  protected deleteConstruct(construct: LegacyConstruct): void {
    this.doc().businessConstructs = this.constructs().filter((c) => (c.uid || c.id) !== (construct.uid || construct.id));
    this.constructDrawer.set(null); this.touch();
  }
  protected saveDrawerConstruct(): void { this.saveConstruct(); }
  protected deleteDrawerConstruct(): void { const d = this.constructDrawer(); if (d) this.deleteConstruct(d as LegacyConstruct); }
  protected drawerConstruct(): LegacyConstruct { return this.constructDrawer() as LegacyConstruct; }
  // 抽屉内关联操作
  protected addEntityToDrawerConstruct(entityId: string): void {
    const e = this.unclassifiedEntities().find((x) => this.uid(x) === entityId);
    const c = this.constructDrawer();
    if (e && c) { e.businessConstructUid = this.uid(c as any); e.businessConstructUids = [this.uid(c as any)]; this.touch(); }
  }
  protected addTaskDefToDrawerConstruct(taskDefId: string): void {
    const t = this.unclassifiedTaskDefs().find((x) => this.uid(x) === taskDefId);
    const c = this.constructDrawer();
    if (t && c) { t.businessConstructUid = this.uid(c as any); this.touch(); }
  }

  // ─── Tab 2: 任务定义 ──────────────────────────────
  protected readonly taskDefCompId = signal('');
  protected readonly taskDefConstructId = signal('');

  // 按已选组件筛选的构件列表（联动）
  protected filteredConstructsForTaskDef(): LegacyConstruct[] {
    const cid = this.taskDefCompId();
    if (!cid) return this.constructs();
    return this.constructs().filter((c) => this.uid({ uid: c.businessComponentUid }) === cid);
  }

  protected selectTaskDefComp(compId: string): void {
    this.taskDefCompId.set(compId);
    this.taskDefConstructId.set(''); // 切换组件时重置构件筛选
  }

  // 旧版字段 constructUid / businessComponentUid，新版用 businessConstructUid
  protected tdConstructId(td: LegacyTaskDef): string {
    return String((td as any).constructUid || td.businessConstructUid || '').trim();
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
  protected parameterRows(params?: TaskParam[]): TaskParam[] { return params || []; }
  protected addParam(params: TaskParam[]): void { params.push({ name: '', type: 'String', required: false, note: '' }); }
  protected removeParam(params: TaskParam[], idx: number): void { params.splice(idx, 1); }
  protected expandedTaskDef = signal('');
  protected toggleTaskDef(id: string): void { this.expandedTaskDef.set(this.expandedTaskDef() === id ? '' : id); }
  protected isTaskExpanded(id: string): boolean { return this.expandedTaskDef() === id; }

  protected startEdit(td?: LegacyTaskDef): void {
    const base: Partial<LegacyTaskDef> = td ? { ...td } : { uid: '', name: '', type: 'Query', target: '', address: '', note: '', parameters: { inputs: [], outputs: [] } };
    base.parameters ||= { inputs: [], outputs: [] };
    base.parameters.inputs ||= [];
    base.parameters.outputs ||= [];
    this.editTaskDef.set(base);
  }
  protected saveTaskDef(): void {
    const d = this.editTaskDef(); if (!d || !d.name?.trim()) return;
    const doc = this.doc();
    if (!d.uid) { d.uid = 'TD' + Date.now(); doc.taskDefinitions ||= []; doc.taskDefinitions.push(d); }
    else { const ex = (doc.taskDefinitions || []).find((t: any) => (t.uid || t.id) === d.uid); if (ex) Object.assign(ex, d); }
    this.editTaskDef.set(null); this.touch();
  }
  protected deleteTaskDef(td: LegacyTaskDef): void { this.doc().taskDefinitions = this.taskDefs().filter((t) => (t.uid || t.id) !== (td.uid || td.id)); this.touch(); }
  protected deleteDrawerTaskDef(): void { const d = this.editTaskDef(); if (d) { this.deleteTaskDef(d as LegacyTaskDef); this.editTaskDef.set(null); } }
  protected stopProp(e: Event): void { e.stopPropagation(); }
  protected addParamInput(d: any): void { if (d?.parameters) { (d.parameters.inputs ||= []).push({ name: '', type: 'String', required: false, note: '' }); } }
  protected addParamOutput(d: any): void { if (d?.parameters) { (d.parameters.outputs ||= []).push({ name: '', type: 'String', required: false, note: '' }); } }

  // ─── Tab 4: 应用服务 ──────────────────────────────
  protected filteredServices(): LegacyService[] {
    const kw = this.svcKeyword().toLowerCase();
    if (!kw) return this.services();
    return this.services().filter((s) => (s.name || '').toLowerCase().includes(kw) || (s.path || '').toLowerCase().includes(kw));
  }
  protected startEditSvc(svc?: LegacyService): void { this.editSvc.set(svc ? { ...svc } : { uid: '', name: '', method: 'POST', path: '', desc: '', taskDefinitionUids: [], nodeRefs: [] }); }
  protected saveService(): void {
    const d = this.editSvc(); if (!d || !d.name?.trim()) return;
    const doc = this.doc(); doc.services ||= [];
    if (!d.uid) { d.uid = 'SVC' + Date.now(); doc.services.push(d); }
    else { const ex = doc.services.find((s: any) => s.uid === d.uid); if (ex) Object.assign(ex, d); }
    this.editSvc.set(null); this.touch();
  }
  protected deleteService(svc: LegacyService): void { this.doc().services = this.services().filter((s) => s.uid !== svc.uid); this.touch(); }
  protected addNodeToSvc(svc: LegacyService, nuid: string): void { svc.nodeRefs ||= []; if (!svc.nodeRefs.includes(nuid)) svc.nodeRefs.push(nuid); this.touch(); }
  protected removeNodeFromSvc(svc: LegacyService, nuid: string): void { svc.nodeRefs = (svc.nodeRefs || []).filter((r) => r !== nuid); this.touch(); }
  protected allNodes(): Array<{ uid: string; name: string; pname: string }> {
    const nodes: Array<{ uid: string; name: string; pname: string }> = [];
    for (const p of this.doc().processes || []) for (const n of p.nodes || p.tasks || []) nodes.push({ uid: n.uid || n.id || '', name: n.name || '未命名', pname: p.name || '未命名流程' });
    return nodes;
  }
  protected nodeLabel(uid: string): string {
    for (const p of this.doc().processes || []) for (const n of p.nodes || p.tasks || []) if ((n.uid || n.id) === uid) return `${n.name || '节点'}（${p.name || ''}）`;
    return uid;
  }

  // ─── Tab 5: 应用编排 ──────────────────────────────
  protected orderedTaskDefs(svc: LegacyService): LegacyTaskDef[] {
    return (svc.taskDefinitionUids || []).map((id) => this.taskDefs().find((t) => (t.uid || t.id) === id)).filter(Boolean) as LegacyTaskDef[];
  }
  protected addTaskDefToSvc(svc: LegacyService, tid: string): void { svc.taskDefinitionUids ||= []; if (!svc.taskDefinitionUids.includes(tid)) svc.taskDefinitionUids.push(tid); this.touch(); }
  protected removeTaskDefFromSvc(svc: LegacyService, tid: string): void { svc.taskDefinitionUids = (svc.taskDefinitionUids || []).filter((id) => id !== tid); this.touch(); }
  protected moveTaskDefInSvc(svc: LegacyService, idx: number, dir: number): void {
    const ids = svc.taskDefinitionUids || []; const ni = idx + dir; if (ni < 0 || ni >= ids.length) return;
    [ids[idx], ids[ni]] = [ids[ni], ids[idx]]; this.touch();
  }

  // ─── Utils ────────────────────────────────────────
  protected uid(item: any): string { return String(item?.uid || item?.id || item?.name || '').trim(); }
  protected constructName(constructId: string): string { const c = this.constructs().find((x) => this.uid(x) === constructId); return c?.name || constructId || '未归类'; }
  protected switchTab(t: ComponentTab): void { this.activeTab.set(t); }
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
}
