import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';

type ComponentTab = 'component' | 'taskDef' | 'entity' | 'service' | 'orchestration';

interface LegacyComp { uid?: string; id?: string; name?: string; kind?: string; note?: string; entityUids?: string[]; taskDefinitionUids?: string[]; constructUids?: string[]; }
interface LegacyConstruct { uid?: string; id?: string; name?: string; businessComponentUid?: string; }
interface LegacyEntity { uid?: string; id?: string; name?: string; fields?: any[]; businessConstructUid?: string; businessConstructUids?: string[]; }
interface LegacyTaskDef { uid?: string; id?: string; name?: string; target?: string; desc?: string; businessConstructUid?: string; }
interface LegacyService { uid?: string; name?: string; method?: string; path?: string; desc?: string; taskDefinitionUids?: string[]; nodeRefs?: string[]; }

@Component({
  selector: 'app-component-workbench', standalone: true, imports: [CommonModule, FormsModule],
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

  // ─── Tab 2: 任务定义 ──────────────────────────────
  protected filteredTaskDefs(): LegacyTaskDef[] {
    const kw = this.taskDefKeyword().toLowerCase();
    if (!kw) return this.taskDefs();
    return this.taskDefs().filter((t) => (t.name || '').toLowerCase().includes(kw) || (t.target || '').toLowerCase().includes(kw));
  }
  protected taskNodes(td: LegacyTaskDef): Array<{ uid: string; name: string; pname: string }> {
    const nodes: Array<{ uid: string; name: string; pname: string }> = [];
    for (const p of this.doc().processes || []) {
      for (const n of p.nodes || p.tasks || []) {
        if (n.taskDefinitionUid === (td.uid || td.id)) nodes.push({ uid: n.uid || n.id, name: n.name || '节点', pname: p.name || '' });
      }
    }
    return nodes;
  }
  protected startEdit(td?: LegacyTaskDef): void { this.editTaskDef.set(td ? { ...td } : { uid: '', name: '', target: '', desc: '' }); }
  protected saveTaskDef(): void {
    const d = this.editTaskDef(); if (!d || !d.name?.trim()) return;
    const doc = this.doc();
    if (!d.uid) { d.uid = 'TD' + Date.now(); doc.taskDefinitions ||= []; doc.taskDefinitions.push(d); }
    else { const ex = (doc.taskDefinitions || []).find((t: any) => (t.uid || t.id) === d.uid); if (ex) Object.assign(ex, d); }
    this.editTaskDef.set(null); this.touch();
  }
  protected deleteTaskDef(td: LegacyTaskDef): void { this.doc().taskDefinitions = this.taskDefs().filter((t) => (t.uid || t.id) !== (td.uid || td.id)); this.touch(); }

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
  protected switchTab(t: ComponentTab): void { this.activeTab.set(t); }
  protected toggleExp(id: string): void { this.expandedComp.set(this.expandedComp() === id ? '' : id); }
  protected isExp(id: string): boolean { return this.expandedComp() === id; }
  protected touch(): void { markAngularRuntimeModified(); this.version.update((v) => v + 1); }
}
