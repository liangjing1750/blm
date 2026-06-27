import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';

type AppTab = 'service' | 'orchestration';

interface LegacyService { uid?: string; name?: string; method?: string; path?: string; desc?: string; taskDefinitionUids?: string[]; nodeRefs?: string[]; }
interface LegacyTaskDef { uid?: string; id?: string; name?: string; target?: string; desc?: string; businessConstructUid?: string; }

@Component({
  selector: 'app-application-workbench', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './app-workbench.html', styleUrl: './app-workbench.scss',
})
export class ApplicationWorkbenchComponent implements OnInit, OnDestroy {
  private readonly onRefresh = () => this.version.update((v) => v + 1);
  ngOnInit(): void { window.addEventListener('blm-workbench-refresh', this.onRefresh); }
  ngOnDestroy(): void { window.removeEventListener('blm-workbench-refresh', this.onRefresh); }

  protected readonly version = signal(0);
  protected readonly activeTab = signal<AppTab>('service');
  protected readonly editSvc = signal<Partial<LegacyService> | null>(null);
  protected readonly orchSvcId = signal('');
  protected readonly svcKeyword = signal('');

  protected doc(): any { this.version(); return getAngularRuntimeState().doc || {}; }
  protected services(): LegacyService[] { return this.doc().services || []; }
  protected taskDefs(): LegacyTaskDef[] { return this.doc().taskDefinitions || []; }

  protected switchTab(t: AppTab): void { this.activeTab.set(t); }
  protected uid(item: any): string { return String(item?.uid || item?.id || item?.name || '').trim(); }

  // ─── Tab 1: 应用服务 ──────────────────────────
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

  // ─── Tab 2: 应用编排 ──────────────────────────
  protected orderedTaskDefs(svc: LegacyService): LegacyTaskDef[] {
    return (svc.taskDefinitionUids || []).map((id) => this.taskDefs().find((t) => (t.uid || t.id) === id)).filter(Boolean) as LegacyTaskDef[];
  }
  protected addTaskDefToSvc(svc: LegacyService, tid: string): void { svc.taskDefinitionUids ||= []; if (!svc.taskDefinitionUids.includes(tid)) svc.taskDefinitionUids.push(tid); this.touch(); }
  protected removeTaskDefFromSvc(svc: LegacyService, tid: string): void { svc.taskDefinitionUids = (svc.taskDefinitionUids || []).filter((id) => id !== tid); this.touch(); }
  protected moveTaskDefInSvc(svc: LegacyService, idx: number, dir: number): void {
    const ids = svc.taskDefinitionUids || []; const ni = idx + dir; if (ni < 0 || ni >= ids.length) return;
    [ids[idx], ids[ni]] = [ids[ni], ids[idx]]; this.touch();
  }

  protected touch(): void { markAngularRuntimeModified(); this.version.update((v) => v + 1); }
}
