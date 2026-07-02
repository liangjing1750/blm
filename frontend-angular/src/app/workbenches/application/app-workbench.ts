import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { confirmRuntimeAction, getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';

type AppTab = 'service' | 'orchestration';

interface TaskParam { name: string; type: string; required: boolean; note: string; }
interface LegacyTaskDef { uid?: string; id?: string; name?: string; type?: string; target?: string; address?: string; note?: string; parameters?: { inputs?: TaskParam[]; outputs?: TaskParam[] }; constructUid?: string; }
interface OrchStep { taskDefUid: string; order: number; }
interface OrchestrationStep { uid: string; name: string; stepAlias: string; taskDefinitionUid: string; inputMapping: ParamMappingV3[]; outputMapping: ParamMappingV3[]; }
interface ServiceOrchestration { variables: unknown[]; steps: OrchestrationStep[]; returnMapping: ParamMappingV3[]; }
interface ParamMappingV3 { source: string; target: string; note?: string; }
interface ParamMapping { fromTaskDefUid: string; fromParamName: string; toTaskDefUid: string; toParamName: string; note: string; }
interface ServiceParam { name: string; type: string; required: boolean; note: string; children?: ServiceParam[]; }
interface LegacyServiceGroup { uid?: string; id?: string; name?: string; desc?: string; }
interface LegacyService { uid?: string; name?: string; serviceGroupUid?: string; method?: string; path?: string; desc?: string; requestParams?: ServiceParam[]; responseParams?: ServiceParam[]; inputs?: ServiceParam[]; outputs?: ServiceParam[]; orchestration?: ServiceOrchestration; steps?: OrchStep[]; parameterMappings: ParamMapping[]; nodeRefs: string[]; }
interface ParamRow { param: ServiceParam; path: number[]; level: number; testPath: string; }
interface VariableOption { value: string; label: string; }

@Component({
  selector: 'app-application-workbench', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './app-workbench.html', styleUrl: './app-workbench.scss',
})
export class ApplicationWorkbenchComponent implements OnInit, OnDestroy {
  private readonly onRefresh = () => this.version.update((v) => v + 1);
  private readonly runtime = getAngularRuntimeState();
  ngOnInit(): void { window.addEventListener('blm-workbench-refresh', this.onRefresh); }
  ngOnDestroy(): void { window.removeEventListener('blm-workbench-refresh', this.onRefresh); }

  protected readonly version = signal(0);
  protected readonly activeTab = signal<AppTab>(this.restoreActiveTab());
  protected readonly svcKeyword = signal('');
  protected readonly editingSvcId = signal('');
  protected readonly orchSvcId = signal('');
  protected readonly selectedStepUid = signal('');
  protected readonly expandedSvcIds = signal(new Set<string>());
  protected readonly collapsedGroupIds = signal(new Set<string>());
  protected readonly editorOpen = signal(false);

  protected doc(): any { this.version(); return this.runtime.doc || {}; }
  protected serviceGroups(): LegacyServiceGroup[] { this.doc().serviceGroups ||= []; return this.doc().serviceGroups; }
  protected services(): LegacyService[] { return this.doc().services || []; }
  protected taskDefs(): LegacyTaskDef[] { return this.doc().taskDefinitions || []; }
  protected switchTab(t: AppTab): void {
    this.runtime.ui['applicationWorkbenchTab'] = t;
    this.activeTab.set(t);
  }
  protected toggleEditor(): void {
    this.editorOpen.update((open) => !open);
  }
  protected uid(item: any): string { return String(item?.uid || item?.id || item?.name || '').trim(); }

  // ─── Tab 1: 应用服务 ──────────────────────────
  protected filteredServices(): LegacyService[] {
    const kw = this.svcKeyword().toLowerCase();
    if (!kw) return this.services();
    return this.services().filter((s) => (s.name || '').toLowerCase().includes(kw) || (s.path || '').toLowerCase().includes(kw));
  }

  // 模块意图：服务分组只表达接口聚合，不表达部署单元或领域服务边界。
  // 关键流程：接口仍保存在 services[]，通过 serviceGroupUid 投影到分组下。
  // 边界细节：未分组接口必须继续展示，避免旧文档打开后接口消失。
  protected groupedServices(): Array<{ group: LegacyServiceGroup | null; services: LegacyService[] }> {
    const services = this.filteredServices();
    const groups = this.serviceGroups();
    const result: Array<{ group: LegacyServiceGroup | null; services: LegacyService[] }> = groups.map((group) => ({
      group,
      services: services.filter((service) => String(service.serviceGroupUid || '') === this.uid(group)),
    })).filter((item) => item.services.length || !this.svcKeyword());
    const groupedIds = new Set(groups.map((group) => this.uid(group)));
    const ungrouped = services.filter((service) => !service.serviceGroupUid || !groupedIds.has(String(service.serviceGroupUid)));
    if (ungrouped.length) result.push({ group: null, services: ungrouped });
    return result;
  }

  protected isExpanded(id: string): boolean { return this.expandedSvcIds().has(id); }
  protected toggleExpand(id: string): void { this.expandedSvcIds.update(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  protected isGroupExpanded(id: string): boolean { return !this.collapsedGroupIds().has(id); }
  protected toggleGroup(id: string): void { this.collapsedGroupIds.update(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  protected orderedSteps(svc: LegacyService): OrchestrationStep[] { return this.orchestrationSteps(svc); }
  protected stepTaskDef(step: OrchestrationStep | OrchStep): LegacyTaskDef | undefined { return this.taskDefs().find(t => this.uid(t) === this.stepTaskUid(step)); }
  protected stepCount(svc: LegacyService): number { return this.orchestrationSteps(svc).length; }

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
    if (svc) { this.ensureServiceShape(svc); }
    this.editingSvcId.set(svc ? this.uid(svc) : '');
    this.editorOpen.set(true);
  }
  protected saveInline(svc: LegacyService): void {
    if (!svc.uid || svc.uid === 'draft') svc.uid = `interface-${Date.now()}`;
    this.ensureServiceShape(svc);
    this.editingSvcId.set('');
    this.touch();
  }
  protected cancelEdit(): void { this.editingSvcId.set(''); }
  protected async deleteService(svc: LegacyService): Promise<void> {
    const confirmed = await confirmRuntimeAction(`确认删除接口“${svc.name || this.uid(svc)}”吗？`, {
      title: '删除接口',
      confirmLabel: '删除',
    });
    if (!confirmed) return;
    this.doc().services = this.services().filter((s) => s.uid !== svc.uid);
    this.touch();
  }
  protected isEditing(svc: LegacyService): boolean { return this.editingSvcId() === this.uid(svc) || (!svc.uid && this.editingSvcId() === ''); }
  protected createService(): void {
    this.createInterface(this.uid(this.serviceGroups()[0]) || '');
  }
  protected createInterface(serviceGroupUid = ''): void {
    const svc: LegacyService = { uid: 'draft', name: '', serviceGroupUid, method: 'POST', path: '', desc: '', requestParams: [], responseParams: [], steps: [], parameterMappings: [], nodeRefs: [] };
    this.doc().services ||= [];
    this.doc().services.push(svc);
    this.editingSvcId.set('draft');
    this.editorOpen.set(true);
    this.touch();
  }
  protected createServiceGroup(): void {
    this.doc().serviceGroups ||= [];
    const group: LegacyServiceGroup = { uid: `service-group-${Date.now()}`, name: `新服务${this.serviceGroups().length + 1}`, desc: '' };
    this.doc().serviceGroups.push(group);
    this.touch();
  }
  protected updateServiceGroup(): void { this.touch(); }
  protected async deleteServiceGroup(group: LegacyServiceGroup): Promise<void> {
    const groupUid = this.uid(group);
    const confirmed = await confirmRuntimeAction(`确认删除服务“${group.name || groupUid}”吗？组内接口会移动到未分组。`, {
      title: '删除服务',
      confirmLabel: '删除',
    });
    if (!confirmed) return;
    this.doc().serviceGroups = this.serviceGroups().filter((item) => this.uid(item) !== groupUid);
    for (const service of this.services()) {
      if (service.serviceGroupUid === groupUid) service.serviceGroupUid = '';
    }
    this.touch();
  }
  protected addSvcParam(arr: ServiceParam[]): void { arr.push({ name: '', type: 'String', required: false, note: '' }); }
  protected removeSvcParam(arr: ServiceParam[], idx: number): void { arr.splice(idx, 1); }
  // 模块意图：参数树是接口契约的轻量表达，不在工作台内引入完整 OpenAPI Schema。
  // 关键流程：模板用 path 定位嵌套行，表单直接绑定 row.param 写回原参数对象。
  // 边界细节：空 children 不落盘，保持生成 JSON 简洁并兼容旧文档。
  protected paramRows(params: ServiceParam[], level = 0, prefix: number[] = []): ParamRow[] {
    const rows: ParamRow[] = [];
    params.forEach((param, index) => {
      const path = [...prefix, index];
      rows.push({ param, path, level, testPath: path.join('-') });
      rows.push(...this.paramRows(param.children || [], level + 1, path));
    });
    return rows;
  }
  protected canHaveChildren(param: ServiceParam): boolean {
    return ['Object', 'Array', 'List', 'Map'].includes(param.type);
  }
  protected addSvcChildParam(param: ServiceParam): void {
    param.children ||= [];
    param.children.push({ name: '', type: 'String', required: false, note: '' });
    this.touch();
  }
  protected removeParamByPath(params: ServiceParam[], path: number[]): void {
    if (path.length === 1) {
      params.splice(path[0], 1);
      this.touch();
      return;
    }
    const parent = this.paramAtPath(params, path.slice(0, -1));
    parent?.children?.splice(path[path.length - 1], 1);
    this.touch();
  }
  private paramAtPath(params: ServiceParam[], path: number[]): ServiceParam | null {
    let current: ServiceParam | undefined;
    let list = params;
    for (const index of path) {
      current = list[index];
      if (!current) return null;
      list = current.children || [];
    }
    return current || null;
  }
  protected serviceRequestParams(svc: LegacyService): ServiceParam[] {
    svc.requestParams ||= svc.inputs || [];
    return svc.requestParams;
  }
  protected serviceResponseParams(svc: LegacyService): ServiceParam[] {
    svc.responseParams ||= svc.outputs || [];
    return svc.responseParams;
  }
  private ensureServiceShape(svc: LegacyService): void {
    svc.requestParams ||= svc.inputs || [];
    svc.responseParams ||= svc.outputs || [];
    delete svc.inputs;
    delete svc.outputs;
    this.ensureOrchestration(svc);
    svc.parameterMappings ||= [];
    svc.nodeRefs ||= [];
  }
  protected ensureOrchestration(svc: LegacyService): ServiceOrchestration {
    if (!svc.orchestration) {
      svc.orchestration = {
        variables: [],
        steps: (svc.steps || []).map((step, index) => this.legacyStepToOrchestrationStep(step, index)),
        returnMapping: [],
      };
      delete svc.steps;
    }
    svc.orchestration.variables ||= [];
    svc.orchestration.steps ||= [];
    svc.orchestration.returnMapping ||= [];
    return svc.orchestration;
  }
  protected orchestrationSteps(svc: LegacyService): OrchestrationStep[] {
    return this.ensureOrchestration(svc).steps;
  }
  protected stepTaskUid(step: OrchestrationStep | OrchStep): string {
    return String((step as OrchestrationStep).taskDefinitionUid || (step as OrchStep).taskDefUid || '').trim();
  }
  protected stepAlias(step: OrchestrationStep, index: number): string {
    return step.stepAlias || `step${index + 1}`;
  }

  // JSON 导入
  protected importJsonVisible = signal(false);
  protected importJsonText = signal('');
  protected importJsonTarget = signal<'requestParams'|'responseParams'>('requestParams');

  protected startImportJson(target: 'requestParams'|'responseParams'): void { this.importJsonTarget.set(target); this.importJsonText.set(''); this.importJsonVisible.set(true); }
  protected doImportJson(svc: LegacyService): void {
    try {
      const obj = JSON.parse(this.importJsonText());
      const arr = this.importJsonTarget() === 'requestParams' ? this.serviceRequestParams(svc) : this.serviceResponseParams(svc);
      for (const [key, val] of Object.entries(obj)) {
        if (!arr.some(p => p.name === key)) arr.push(this.paramFromJsonValue(key, val));
      }
      this.importJsonVisible.set(false);
      this.touch();
    } catch { alert('JSON 格式错误'); }
  }

  private paramFromJsonValue(name: string, value: any): ServiceParam {
    const inferType = (v: any): string => {
      if (v === null || v === undefined) return 'String';
      if (typeof v === 'boolean') return 'Boolean';
      if (typeof v === 'number') return 'Number';
      if (Array.isArray(v)) return 'Array';
      if (typeof v === 'object') return 'Object';
      return 'String';
    };
    const type = inferType(value);
    const childrenSource = Array.isArray(value) ? value[0] : value;
    const children = childrenSource && typeof childrenSource === 'object' && !Array.isArray(childrenSource)
      ? Object.entries(childrenSource).map(([childName, childValue]) => this.paramFromJsonValue(childName, childValue))
      : [];
    return { name, type, required: false, note: '', ...(children.length ? { children } : {}) };
  }

  // 复制为 JSON
  protected copyParamsAsJson(svc: LegacyService, target: 'requestParams'|'responseParams'): void {
    const arr = target === 'requestParams' ? this.serviceRequestParams(svc) : this.serviceResponseParams(svc);
    const obj: Record<string, any> = {};
    for (const p of arr) obj[p.name] = this.paramExampleValue(p);
    navigator.clipboard?.writeText(JSON.stringify(obj, null, 2));
  }

  private paramExampleValue(param: ServiceParam): any {
    const children = param.children || [];
    if (param.type === 'Object' || param.type === 'Map') return Object.fromEntries(children.map((child) => [child.name, this.paramExampleValue(child)]));
    if (param.type === 'Array' || param.type === 'List') return children.length ? [Object.fromEntries(children.map((child) => [child.name, this.paramExampleValue(child)]))] : [];
    const defaults: Record<string, any> = { String: '', Number: 0, Boolean: false };
    return defaults[param.type] ?? '';
  }

  // ─── Tab 2: 应用编排 ──────────────────────────
  protected mappings(svc: LegacyService): ParamMapping[] { return svc.parameterMappings || []; }
  protected selectOrchestrationService(serviceUid: string): void {
    this.orchSvcId.set(serviceUid);
    const service = this.services().find((candidate) => this.uid(candidate) === serviceUid);
    this.selectedStepUid.set(service ? this.orchestrationSteps(service)[0]?.uid || '' : '');
  }
  protected selectedStep(svc: LegacyService): OrchestrationStep | null {
    const steps = this.orchestrationSteps(svc);
    return steps.find((step) => step.uid === this.selectedStepUid()) || steps[0] || null;
  }
  protected selectStep(step: OrchestrationStep): void { this.selectedStepUid.set(step.uid); }
  protected addStep(svc: LegacyService, tid: string): void {
    const steps = this.orchestrationSteps(svc);
    if (steps.some(s => s.taskDefinitionUid === tid)) return;
    const task = this.taskDefs().find((td) => this.uid(td) === tid);
    const step: OrchestrationStep = {
      uid: `step-${this.uid(svc) || 'service'}-${steps.length + 1}-${tid}`,
      name: task?.name || tid,
      stepAlias: `step${steps.length + 1}`,
      taskDefinitionUid: tid,
      inputMapping: [],
      outputMapping: [],
    };
    steps.push(step);
    this.selectedStepUid.set(step.uid);
    delete svc.steps;
    this.touch();
  }
  protected removeStep(svc: LegacyService, idx: number): void {
    const steps = this.orchestrationSteps(svc);
    const removedUid = steps[idx]?.taskDefinitionUid;
    steps.splice(idx, 1);
    // 清除涉及该步骤的参数映射
    if (removedUid) svc.parameterMappings = (svc.parameterMappings || []).filter(m => m.fromTaskDefUid !== removedUid && m.toTaskDefUid !== removedUid);
    this.selectedStepUid.set(steps[Math.min(idx, steps.length - 1)]?.uid || '');
    this.touch();
  }
  protected moveStep(svc: LegacyService, idx: number, dir: number): void {
    const steps = this.orchestrationSteps(svc);
    const ni = idx + dir;
    if (ni < 0 || ni >= steps.length) return;
    [steps[idx], steps[ni]] = [steps[ni], steps[idx]];
    this.touch();
  }
  protected addMapping(svc: LegacyService): void {
    svc.parameterMappings ||= [];
    svc.parameterMappings.push({ fromTaskDefUid: '', fromParamName: '', toTaskDefUid: '', toParamName: '', note: '' });
    this.touch();
  }
  protected removeMapping(svc: LegacyService, idx: number): void { (svc.parameterMappings || []).splice(idx, 1); this.touch(); }
  protected addInputMapping(step: OrchestrationStep): void {
    step.inputMapping ||= [];
    step.inputMapping.push({ source: '', target: '' });
    this.touch();
  }
  protected removeInputMapping(step: OrchestrationStep, idx: number): void {
    (step.inputMapping || []).splice(idx, 1);
    this.touch();
  }
  protected addOutputMapping(step: OrchestrationStep): void {
    step.outputMapping ||= [];
    step.outputMapping.push({ source: '', target: '' });
    this.touch();
  }
  protected removeOutputMapping(step: OrchestrationStep, idx: number): void {
    (step.outputMapping || []).splice(idx, 1);
    this.touch();
  }
  protected returnMappings(svc: LegacyService): ParamMappingV3[] {
    return this.ensureOrchestration(svc).returnMapping;
  }
  protected addReturnMapping(svc: LegacyService): void {
    this.returnMappings(svc).push({ source: '', target: '' });
    this.touch();
  }
  protected removeReturnMapping(svc: LegacyService, idx: number): void {
    this.returnMappings(svc).splice(idx, 1);
    this.touch();
  }
  protected mappingFromOptions(svc: LegacyService, excludeIdx: number): Array<{ tdName: string; paramName: string; key: string }> {
    const result: Array<{ tdName: string; paramName: string; key: string }> = [];
    for (const step of this.orchestrationSteps(svc)) {
      const td = this.stepTaskDef(step);
      if (!td) continue;
      for (const p of td.parameters?.outputs || []) result.push({ tdName: td.name || '', paramName: p.name, key: `${this.uid(td)}:${p.name}` });
    }
    return result;
  }
  protected mappingToOptions(svc: LegacyService): Array<{ tdName: string; paramName: string; key: string }> {
    const result: Array<{ tdName: string; paramName: string; key: string }> = [];
    for (const step of this.orchestrationSteps(svc)) {
      const td = this.stepTaskDef(step);
      if (!td) continue;
      for (const p of td.parameters?.inputs || []) result.push({ tdName: td.name || '', paramName: p.name, key: `${this.uid(td)}:${p.name}` });
    }
    return result;
  }

  // 模块意图：参数变量池只负责提供可选择路径，不在这里解释运行时表达式。
  // 关键流程：先展开接口请求参数，再按步骤顺序积累每个任务的输入和输出变量。
  // 边界细节：Array/List 用 [] 表示元素路径，Map/Object 共用点路径表达子字段。
  protected inputSourceOptions(svc: LegacyService, step: OrchestrationStep): VariableOption[] {
    const options = this.requestVariableOptions(svc);
    for (const previous of this.stepsBefore(svc, step)) {
      const alias = this.stepAlias(previous, this.orchestrationSteps(svc).indexOf(previous));
      const task = this.stepTaskDef(previous);
      options.push(...this.paramVariableOptions(task?.parameters?.inputs || [], `step.${alias}.input`));
      options.push(...this.paramVariableOptions(task?.parameters?.outputs || [], `step.${alias}.output`));
    }
    return options;
  }
  protected inputTargetOptions(step: OrchestrationStep): VariableOption[] {
    return this.paramVariableOptions(this.stepTaskDef(step)?.parameters?.inputs || [], '');
  }
  protected outputSourceOptions(step: OrchestrationStep): VariableOption[] {
    return this.paramVariableOptions(this.stepTaskDef(step)?.parameters?.outputs || [], '');
  }
  protected outputTargetOptions(svc: LegacyService, step: OrchestrationStep): VariableOption[] {
    const alias = this.stepAlias(step, this.orchestrationSteps(svc).indexOf(step));
    const outputs = this.stepTaskDef(step)?.parameters?.outputs || [];
    return [
      ...this.paramVariableOptions(outputs, `step.${alias}.output`),
      ...this.paramVariableOptions(outputs, `step.${alias}`),
    ];
  }
  protected returnSourceOptions(svc: LegacyService): VariableOption[] {
    const options = this.requestVariableOptions(svc);
    for (const step of this.orchestrationSteps(svc)) {
      const alias = this.stepAlias(step, this.orchestrationSteps(svc).indexOf(step));
      const task = this.stepTaskDef(step);
      options.push(...this.paramVariableOptions(task?.parameters?.inputs || [], `step.${alias}.input`));
      options.push(...this.paramVariableOptions(task?.parameters?.outputs || [], `step.${alias}.output`));
      options.push(...this.paramVariableOptions(task?.parameters?.outputs || [], `step.${alias}`));
    }
    return options;
  }
  protected returnTargetOptions(svc: LegacyService): VariableOption[] {
    return this.paramVariableOptions(this.serviceResponseParams(svc), '');
  }
  protected variablePoolOptions(svc: LegacyService, step: OrchestrationStep | null): VariableOption[] {
    if (!step) return this.requestVariableOptions(svc);
    return this.inputSourceOptions(svc, step);
  }
  private requestVariableOptions(svc: LegacyService): VariableOption[] {
    return this.paramVariableOptions(this.serviceRequestParams(svc), 'request');
  }
  private stepsBefore(svc: LegacyService, step: OrchestrationStep): OrchestrationStep[] {
    const steps = this.orchestrationSteps(svc);
    const index = steps.findIndex((candidate) => candidate.uid === step.uid);
    return index < 0 ? [] : steps.slice(0, index);
  }
  private paramVariableOptions(params: Array<Partial<ServiceParam>>, prefix: string): VariableOption[] {
    const options: VariableOption[] = [];
    for (const param of params) {
      const segment = this.paramPathSegment(param);
      if (!segment) continue;
      const value = prefix ? `${prefix}.${segment}` : segment;
      options.push({ value, label: value });
      options.push(...this.paramVariableOptions(param.children || [], value));
    }
    return options;
  }
  private paramPathSegment(param: Partial<ServiceParam>): string {
    const name = String(param.name || '').trim();
    if (!name) return '';
    const type = String(param.type || '').toLowerCase();
    return type === 'array' || type === 'list' ? `${name}[]` : name;
  }

  protected touch(): void { markAngularRuntimeModified(); this.version.update((v) => v + 1); }

  private restoreActiveTab(): AppTab {
    return this.runtime.ui['applicationWorkbenchTab'] === 'orchestration' ? 'orchestration' : 'service';
  }

  private legacyStepToOrchestrationStep(step: OrchStep, index: number): OrchestrationStep {
    const task = this.taskDefs().find((td) => this.uid(td) === step.taskDefUid);
    return {
      uid: `step-${step.taskDefUid || index + 1}`,
      name: task?.name || step.taskDefUid || `步骤${index + 1}`,
      stepAlias: `step${index + 1}`,
      taskDefinitionUid: step.taskDefUid,
      inputMapping: [],
      outputMapping: [],
    };
  }
}
