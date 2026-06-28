import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';

type AppTab = 'service' | 'orchestration';

interface TaskParam { name: string; type: string; required: boolean; note: string; }
interface LegacyTaskDef { uid?: string; id?: string; name?: string; type?: string; target?: string; address?: string; note?: string; parameters?: { inputs?: TaskParam[]; outputs?: TaskParam[] }; constructUid?: string; }
interface OrchStep { taskDefUid: string; order: number; }
interface ParamMapping { fromTaskDefUid: string; fromParamName: string; toTaskDefUid: string; toParamName: string; note: string; }
interface ServiceParam { name: string; type: string; required: boolean; note: string; }
interface LegacyService { uid?: string; name?: string; method?: string; path?: string; desc?: string; inputs: ServiceParam[]; outputs: ServiceParam[]; steps: OrchStep[]; parameterMappings: ParamMapping[]; nodeRefs: string[]; }

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
  protected readonly svcKeyword = signal('');
  protected readonly editingSvcId = signal('');
  protected readonly orchSvcId = signal('');
  protected readonly expandedSvcIds = signal(new Set<string>());

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

  protected isExpanded(id: string): boolean { return this.expandedSvcIds().has(id); }
  protected toggleExpand(id: string): void { this.expandedSvcIds.update(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  protected orderedSteps(svc: LegacyService): OrchStep[] { return (svc.steps || []).sort((a, b) => a.order - b.order); }
  protected stepTaskDef(step: OrchStep): LegacyTaskDef | undefined { return this.taskDefs().find(t => this.uid(t) === step.taskDefUid); }
  protected stepCount(svc: LegacyService): number { return (svc.steps || []).length; }

  protected allNodes(): Array<{ uid: string; name: string; pname: string }> {
    const nodes: Array<{ uid: string; name: string; pname: string }> = [];
    for (const p of this.doc().processes || []) for (const n of p.nodes || p.tasks || []) nodes.push({ uid: n.uid || n.id || '', name: n.name || '未命名', pname: p.name || '未命名流程' });
    return nodes;
  }
  protected nodeLabel(uid: string): string {
    for (const p of this.doc().processes || []) for (const n of p.nodes || p.tasks || []) if ((n.uid || n.id) === uid) return `${n.name || '节点'}（${p.name || ''}）`;
    return uid;
  }

  protected startEdit(svc?: LegacyService): void {
    if (svc) { svc.inputs ||= []; svc.outputs ||= []; svc.steps ||= []; svc.parameterMappings ||= []; }
    this.editingSvcId.set(svc ? this.uid(svc) : '');
  }
  protected saveInline(svc: LegacyService): void { svc.steps ||= []; svc.parameterMappings ||= []; this.editingSvcId.set(''); this.touch(); }
  protected cancelEdit(): void { this.editingSvcId.set(''); }
  protected async deleteService(svc: LegacyService): Promise<void> {
    if (!window.confirm(`确认删除"${svc.name || this.uid(svc)}"吗？`)) return;
    this.doc().services = this.services().filter((s) => s.uid !== svc.uid);
    this.touch();
  }
  protected isEditing(svc: LegacyService): boolean { return this.editingSvcId() === this.uid(svc) || (!svc.uid && this.editingSvcId() === ''); }
  protected createService(): void {
    const svc: LegacyService = { uid: '', name: '', method: 'POST', path: '', desc: '', inputs: [], outputs: [], steps: [], parameterMappings: [], nodeRefs: [] };
    this.doc().services ||= [];
    this.doc().services.push(svc);
    this.editingSvcId.set('');
    this.touch();
  }
  protected addSvcParam(arr: ServiceParam[]): void { arr.push({ name: '', type: 'String', required: false, note: '' }); }
  protected removeSvcParam(arr: ServiceParam[], idx: number): void { arr.splice(idx, 1); }

  // JSON 导入
  protected importJsonVisible = signal(false);
  protected importJsonText = signal('');
  protected importJsonTarget = signal<'inputs'|'outputs'>('inputs');

  protected startImportJson(target: 'inputs'|'outputs'): void { this.importJsonTarget.set(target); this.importJsonText.set(''); this.importJsonVisible.set(true); }
  protected doImportJson(svc: LegacyService): void {
    try {
      const obj = JSON.parse(this.importJsonText());
      const arr = svc[this.importJsonTarget()] || [];
      const inferType = (v: any): string => {
        if (v === null || v === undefined) return 'String';
        if (typeof v === 'boolean') return 'Boolean';
        if (typeof v === 'number') return 'Number';
        if (Array.isArray(v)) return 'Array';
        if (typeof v === 'object') return 'Object';
        return 'String';
      };
      for (const [key, val] of Object.entries(obj)) {
        if (!arr.some(p => p.name === key)) arr.push({ name: key, type: inferType(val), required: false, note: '' });
      }
      svc[this.importJsonTarget()] = arr as any;
      this.importJsonVisible.set(false);
      this.touch();
    } catch { alert('JSON 格式错误'); }
  }

  // 复制为 JSON
  protected copyParamsAsJson(svc: LegacyService, target: 'inputs'|'outputs'): void {
    const arr = svc[target] || [];
    const obj: Record<string, any> = {};
    const defaults: Record<string, any> = { String: '', Number: 0, Boolean: false, Array: [], Object: {} };
    for (const p of arr) obj[p.name] = defaults[p.type] ?? '';
    navigator.clipboard?.writeText(JSON.stringify(obj, null, 2));
  }

  // ─── Tab 2: 应用编排 ──────────────────────────
  protected mappings(svc: LegacyService): ParamMapping[] { return svc.parameterMappings || []; }
  protected addStep(svc: LegacyService, tid: string): void {
    svc.steps ||= [];
    if (svc.steps.some(s => s.taskDefUid === tid)) return;
    svc.steps.push({ taskDefUid: tid, order: svc.steps.length + 1 });
    this.touch();
  }
  protected removeStep(svc: LegacyService, idx: number): void {
    const steps = svc.steps || [];
    const removedUid = steps[idx]?.taskDefUid;
    steps.splice(idx, 1);
    // 重新编号
    steps.forEach((s, i) => s.order = i + 1);
    // 清除涉及该步骤的参数映射
    if (removedUid) svc.parameterMappings = (svc.parameterMappings || []).filter(m => m.fromTaskDefUid !== removedUid && m.toTaskDefUid !== removedUid);
    this.touch();
  }
  protected moveStep(svc: LegacyService, idx: number, dir: number): void {
    const steps = svc.steps || [];
    const ni = idx + dir;
    if (ni < 0 || ni >= steps.length) return;
    [steps[idx], steps[ni]] = [steps[ni], steps[idx]];
    steps.forEach((s, i) => s.order = i + 1);
    this.touch();
  }
  protected addMapping(svc: LegacyService): void {
    svc.parameterMappings ||= [];
    svc.parameterMappings.push({ fromTaskDefUid: '', fromParamName: '', toTaskDefUid: '', toParamName: '', note: '' });
    this.touch();
  }
  protected removeMapping(svc: LegacyService, idx: number): void { (svc.parameterMappings || []).splice(idx, 1); this.touch(); }
  protected mappingFromOptions(svc: LegacyService, excludeIdx: number): Array<{ tdName: string; paramName: string; key: string }> {
    const result: Array<{ tdName: string; paramName: string; key: string }> = [];
    for (const step of svc.steps || []) {
      const td = this.stepTaskDef(step);
      if (!td) continue;
      for (const p of td.parameters?.outputs || []) result.push({ tdName: td.name || '', paramName: p.name, key: `${this.uid(td)}:${p.name}` });
    }
    return result;
  }
  protected mappingToOptions(svc: LegacyService): Array<{ tdName: string; paramName: string; key: string }> {
    const result: Array<{ tdName: string; paramName: string; key: string }> = [];
    for (const step of svc.steps || []) {
      const td = this.stepTaskDef(step);
      if (!td) continue;
      for (const p of td.parameters?.inputs || []) result.push({ tdName: td.name || '', paramName: p.name, key: `${this.uid(td)}:${p.name}` });
    }
    return result;
  }

  protected touch(): void { markAngularRuntimeModified(); this.version.update((v) => v + 1); }
}
