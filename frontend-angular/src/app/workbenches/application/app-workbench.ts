import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { confirmRuntimeAction, getAngularRuntimeState, markAngularRuntimeModified, navigateAngularWorkbench, recordAngularNavigationBoundary } from '../../core/runtime/angular-runtime';

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
interface LegacyService { uid?: string; name?: string; serviceGroupUid?: string; method?: string; path?: string; desc?: string; actor?: string; kind?: string; responseKind?: string; rawRequest?: string; rawResponse?: string; requestParams?: ServiceParam[]; responseParams?: ServiceParam[]; inputs?: ServiceParam[]; outputs?: ServiceParam[]; orchestration?: ServiceOrchestration; steps?: OrchStep[]; parameterMappings: ParamMapping[]; nodeRefs: string[]; }
interface ParamRow { param: ServiceParam; path: number[]; level: number; testPath: string; }
interface VariableOption { value: string; label: string; }
interface ContractParamLine {
  kind: 'field' | 'close';
  level: number;
  name: string;
  type: string;
  required: boolean;
  note: string;
  open: string;
  close: string;
}

@Component({
  selector: 'app-application-workbench', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './app-workbench.html', styleUrl: './app-workbench.scss',
})
export class ApplicationWorkbenchComponent implements OnInit, OnDestroy {
  private readonly onRefresh = () => this.version.update((v) => v + 1);
  private readonly runtime = getAngularRuntimeState();
  ngOnInit(): void {
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
    if (this.activeTab() === 'orchestration') this.ensureOrchestrationInterfaceSelection();
  }
  ngOnDestroy(): void { window.removeEventListener('blm-workbench-refresh', this.onRefresh); }

  protected readonly version = signal(0);
  protected readonly activeTab = signal<AppTab>(this.restoreActiveTab());
  protected readonly svcKeyword = signal('');
  protected readonly orchServiceGroupUid = signal(String(this.runtime.ui['applicationOrchestrationServiceGroupUid'] || '__all__'));
  protected readonly orchSvcId = signal(String(this.runtime.ui['applicationOrchestrationServiceUid'] || ''));
  protected readonly selectedServiceGroupUid = signal(String(this.runtime.ui['applicationServiceGroupUid'] || '__all__'));
  protected readonly selectedServiceId = signal(String(this.runtime.ui['applicationServiceUid'] || this.runtime.ui['applicationServiceId'] || ''));
  protected readonly interfacePage = signal(1);
  protected readonly interfacePageSize = 8;
  protected readonly selectedStepUid = signal(String(this.runtime.ui['applicationOrchestrationStepUid'] || ''));
  protected readonly editorOpen = signal(false);
  protected readonly serviceDrawerId = signal('');
  protected readonly serviceGroupDrawer = signal<Partial<LegacyServiceGroup> | null>(null);
  protected readonly serviceGroupNameError = signal('');
  protected readonly serviceParamViews = signal<Record<'requestParams' | 'responseParams', 'list' | 'json'>>({
    requestParams: 'list',
    responseParams: 'list',
  });
  protected readonly serviceInterfaceView = signal<'form' | 'json'>('form');

  protected doc(): any { this.version(); return this.runtime.doc || {}; }
  protected serviceGroups(): LegacyServiceGroup[] { this.doc().serviceGroups ||= []; return this.doc().serviceGroups; }
  protected services(): LegacyService[] { return this.doc().services || []; }
  protected taskDefs(): LegacyTaskDef[] { return this.doc().taskDefinitions || []; }
  protected switchTab(t: AppTab): void {
    recordAngularNavigationBoundary();
    this.runtime.ui['applicationWorkbenchTab'] = t;
    this.activeTab.set(t);
    if (t === 'orchestration') this.ensureOrchestrationInterfaceSelection();
  }
  protected canEdit(): boolean { return this.editorOpen() && !this.runtime.readOnly; }
  protected toggleEditor(): void {
    if (this.runtime.readOnly) {
      this.editorOpen.set(false);
      return;
    }
    this.editorOpen.update((open) => {
      const next = !open;
      if (!next) {
        this.serviceGroupDrawer.set(null);
        this.importJsonVisible.set(false);
      }
      return next;
    });
  }
  protected uid(item: any): string { return String(item?.uid || item?.id || item?.name || '').trim(); }

  // ─── Tab 1: 应用服务 ──────────────────────────
  protected filteredServices(): LegacyService[] {
    const kw = this.svcKeyword().toLowerCase();
    const groupUid = this.selectedServiceGroupUid();
    return this.services().filter((s) => {
      const matchesKeyword = !kw || (s.name || '').toLowerCase().includes(kw) || (s.path || '').toLowerCase().includes(kw);
      const matchesGroup = groupUid === '__all__'
        || (groupUid === '__ungrouped__' ? !s.serviceGroupUid : String(s.serviceGroupUid || '') === groupUid);
      return matchesKeyword && matchesGroup;
    }).sort((left, right) => String(left.name || this.uid(left)).localeCompare(String(right.name || this.uid(right)), 'zh-Hans-CN', { numeric: true }));
  }

  protected visibleServiceGroups(): LegacyServiceGroup[] {
    return [...this.serviceGroups()].sort((left, right) =>
      String(left.name || this.uid(left)).localeCompare(String(right.name || this.uid(right)), 'zh-Hans-CN', { numeric: true }),
    );
  }

  protected pagedServices(): LegacyService[] {
    const page = this.currentInterfacePage();
    const start = (page - 1) * this.interfacePageSize;
    return this.filteredServices().slice(start, start + this.interfacePageSize);
  }

  protected totalInterfacePages(): number {
    return Math.max(1, Math.ceil(this.filteredServices().length / this.interfacePageSize));
  }

  protected currentInterfacePage(): number {
    return Math.min(Math.max(1, this.interfacePage()), this.totalInterfacePages());
  }

  protected setInterfacePage(page: number): void {
    this.interfacePage.set(Math.min(Math.max(1, page), this.totalInterfacePages()));
  }

  protected setServiceKeyword(keyword: string): void {
    this.svcKeyword.set(keyword);
    this.interfacePage.set(1);
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

  protected selectServiceGroup(groupUid: string): void {
    this.selectedServiceGroupUid.set(groupUid);
    this.selectedServiceId.set('');
    this.runtime.ui['applicationServiceGroupUid'] = groupUid;
    this.runtime.ui['applicationServiceUid'] = '';
    this.runtime.ui['applicationServiceId'] = '';
    this.interfacePage.set(1);
  }

  protected selectedServiceGroup(): LegacyServiceGroup | null {
    const groupUid = this.selectedServiceGroupUid();
    return this.serviceGroups().find((group) => this.uid(group) === groupUid) || null;
  }

  protected serviceGroupCount(group: LegacyServiceGroup | null): number {
    const groupUid = group ? this.uid(group) : '';
    return this.services().filter((service) => group ? String(service.serviceGroupUid || '') === groupUid : !service.serviceGroupUid).length;
  }

  protected selectedService(): LegacyService | null {
    const services = this.filteredServices();
    return services.find((service) => this.uid(service) === this.selectedServiceId()) || services[0] || null;
  }

  protected selectService(svc: LegacyService): void {
    this.ensureServiceShape(svc);
    const serviceUid = this.uid(svc);
    this.selectedServiceId.set(serviceUid);
    this.runtime.ui['applicationServiceUid'] = serviceUid;
    this.runtime.ui['applicationServiceId'] = serviceUid;
  }

  protected orderedSteps(svc: LegacyService): OrchestrationStep[] { return this.orchestrationSteps(svc); }
  protected stepTaskDef(step: OrchestrationStep | OrchStep): LegacyTaskDef | undefined { return this.taskDefs().find(t => this.uid(t) === this.stepTaskUid(step)); }
  protected stepCount(svc: LegacyService): number { return this.orchestrationSteps(svc).length; }
  // 模块意图：主页面只提供服务与接口的浏览摘要，编辑细节继续由后续抽屉接管。
  // 关键流程：摘要计数必须纯读取，避免模板渲染时把旧文档 inputs/outputs 归一化写回。
  // 边界细节：未分组接口仍要有标题和说明，不能因为缺少 serviceGroupUid 从浏览列表消失。
  protected requestParamCount(svc: LegacyService): number { return (svc.requestParams || svc.inputs || []).length; }
  protected responseParamCount(svc: LegacyService): number { return (svc.responseParams || svc.outputs || []).length; }
  protected serviceGroupTitle(group: LegacyServiceGroup | null): string {
    return group ? group.name || this.uid(group) : '未分组接口';
  }
  protected serviceGroupDesc(group: LegacyServiceGroup | null): string {
    return group ? group.desc || '暂无服务说明' : '旧文档或未归属服务的接口会显示在这里。';
  }
  protected serviceGroupFor(svc: LegacyService): LegacyServiceGroup | null {
    return this.serviceGroups().find((group) => this.uid(group) === String(svc.serviceGroupUid || '')) || null;
  }

  protected linkedNodes(svc: LegacyService): Array<{ processUid: string; nodeUid: string; name: string }> {
    const refs = new Set((svc.nodeRefs || []).map((ref) => String(ref || '').trim()).filter(Boolean));
    const result: Array<{ processUid: string; nodeUid: string; name: string }> = [];
    for (const process of this.doc().processes || []) {
      for (const node of process.nodes || []) {
        const nodeUid = this.uid(node);
        if (refs.has(nodeUid)) result.push({ processUid: this.uid(process), nodeUid, name: node.name || nodeUid });
      }
    }
    return result;
  }

  protected jumpToProcessNode(node: { processUid: string; nodeUid: string }): void {
    navigateAngularWorkbench('process', { procId: node.processUid, taskId: node.nodeUid });
    window.dispatchEvent(new CustomEvent('blm-jump-workbench', { detail: { mainTab: 'processWorkbench' } }));
  }

  protected serviceDrawer(): LegacyService | null {
    const id = this.serviceDrawerId();
    return this.services().find((service) => this.uid(service) === id) || null;
  }
  protected openServiceDrawer(svc: LegacyService): void {
    this.ensureServiceShape(svc);
    this.selectService(svc);
    this.serviceInterfaceView.set('form');
    this.serviceDrawerId.set(this.uid(svc));
  }
  protected closeServiceDrawer(): void {
    const svc = this.serviceDrawer();
    if (svc?.uid === 'draft') {
      this.doc().services = this.services().filter((service) => service !== svc);
      this.touch();
    }
    this.serviceInterfaceView.set('form');
    this.serviceDrawerId.set('');
  }
  protected startEdit(svc?: LegacyService): void {
    if (!this.canEdit()) return;
    if (!svc) return this.openNewServiceDrawer();
    this.openServiceDrawer(svc);
  }
  protected saveServiceDrawer(svc: LegacyService): void {
    if (!this.canEdit()) return;
    if (!svc.uid || svc.uid === 'draft') svc.uid = `interface-${Date.now()}`;
    this.ensureServiceShape(svc);
    this.serviceDrawerId.set('');
    this.touch();
  }
  protected async deleteService(svc: LegacyService): Promise<void> {
    if (!this.canEdit()) return;
    const confirmed = await confirmRuntimeAction(`确认删除接口“${svc.name || this.uid(svc)}”吗？`, {
      title: '删除接口',
      confirmLabel: '删除',
    });
    if (!confirmed) return;
    this.doc().services = this.services().filter((s) => s.uid !== svc.uid);
    if (this.serviceDrawerId() === this.uid(svc)) this.serviceDrawerId.set('');
    this.touch();
  }
  protected createService(): void {
    if (!this.canEdit()) return;
    this.openNewServiceDrawer(this.uid(this.serviceGroups()[0]) || '');
  }
  protected createInterface(serviceGroupUid = ''): void {
    if (!this.canEdit()) return;
    this.openNewServiceDrawer(serviceGroupUid);
  }
  protected openNewServiceDrawer(serviceGroupUid = this.uid(this.serviceGroups()[0]) || ''): void {
    if (!this.canEdit()) return;
    const svc: LegacyService = { uid: 'draft', name: '', serviceGroupUid, method: 'POST', path: '', desc: '', requestParams: [], responseParams: [], steps: [], parameterMappings: [], nodeRefs: [] };
    this.doc().services ||= [];
    this.doc().services.push(svc);
    this.openServiceDrawer(svc);
    this.touch();
  }
  protected createServiceGroup(): void {
    if (!this.canEdit()) return;
    this.openServiceGroupDrawer();
  }
  protected openServiceGroupDrawer(group?: LegacyServiceGroup): void {
    if (!this.canEdit()) return;
    this.serviceGroupNameError.set('');
    this.serviceGroupDrawer.set(group ? { ...group } : { uid: '', name: '', desc: '' });
  }
  protected closeServiceGroupDrawer(): void {
    this.serviceGroupNameError.set('');
    this.serviceGroupDrawer.set(null);
  }
  protected saveServiceGroupDrawer(): void {
    if (!this.canEdit()) return;
    const draft = this.serviceGroupDrawer();
    if (!draft || !draft.name?.trim()) return;
    if (draft.name.trim() === '未分组接口') {
      this.serviceGroupNameError.set('未分组接口是系统保留名称，请换一个服务名称。');
      return;
    }
    this.serviceGroupNameError.set('');
    this.doc().serviceGroups ||= [];
    if (!draft.uid) {
      draft.uid = `service-group-${Date.now()}`;
      this.doc().serviceGroups.push(draft);
    } else {
      const existing = this.serviceGroups().find((group) => this.uid(group) === draft.uid);
      if (existing) Object.assign(existing, draft);
    }
    this.serviceGroupDrawer.set(null);
    this.touch();
  }
  protected async deleteServiceGroupFromDrawer(): Promise<void> {
    if (!this.canEdit()) return;
    const group = this.serviceGroupDrawer();
    if (!group?.uid) return;
    await this.deleteServiceGroup(group as LegacyServiceGroup);
    this.serviceGroupDrawer.set(null);
  }
  protected async deleteServiceGroup(group: LegacyServiceGroup): Promise<void> {
    if (!this.canEdit()) return;
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
  protected addSvcParam(arr: ServiceParam[]): void { if (!this.canEdit()) return; arr.push({ name: '', type: 'String', required: false, note: '' }); }
  protected removeSvcParam(arr: ServiceParam[], idx: number): void { if (!this.canEdit()) return; arr.splice(idx, 1); }
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
    if (!this.canEdit()) return;
    param.children ||= [];
    param.children.push({ name: '', type: 'String', required: false, note: '' });
    this.touch();
  }
  protected insertParamAfter(params: ServiceParam[], path: number[]): void {
    if (!this.canEdit()) return;
    const list = this.paramSiblingList(params, path);
    const index = path[path.length - 1];
    list.splice(index + 1, 0, { name: '', type: 'String', required: false, note: '' });
    this.touch();
  }
  protected moveParam(params: ServiceParam[], path: number[], direction: -1 | 1): void {
    if (!this.canEdit()) return;
    const list = this.paramSiblingList(params, path);
    const index = path[path.length - 1];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return;
    [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
    this.touch();
  }
  protected removeParamByPath(params: ServiceParam[], path: number[]): void {
    if (!this.canEdit()) return;
    if (path.length === 1) {
      params.splice(path[0], 1);
      this.touch();
      return;
    }
    const parent = this.paramAtPath(params, path.slice(0, -1));
    parent?.children?.splice(path[path.length - 1], 1);
    this.touch();
  }
  private paramSiblingList(params: ServiceParam[], path: number[]): ServiceParam[] {
    if (path.length <= 1) return params;
    const parent = this.paramAtPath(params, path.slice(0, -1));
    parent!.children ||= [];
    return parent!.children;
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
  protected paramView(target: 'requestParams' | 'responseParams'): 'list' | 'json' {
    return this.serviceParamViews()[target];
  }
  protected setParamView(target: 'requestParams' | 'responseParams', view: 'list' | 'json'): void {
    this.serviceParamViews.update((views) => ({ ...views, [target]: view }));
  }
  protected interfaceView(): 'form' | 'json' {
    return this.serviceInterfaceView();
  }
  protected setInterfaceView(view: 'form' | 'json'): void {
    this.serviceInterfaceView.set(view);
  }
  // 模块意图：接口文档视图面向传阅和复制，保持接近旧版文档表格，而不是暴露 BLM 内部持久化结构。
  protected interfaceDocumentText(svc: LegacyService): string {
    return [
      `接口描述：${svc.name || ''}`,
      `使用者：${svc.actor || ''}`,
      `路径：${svc.path || '/'} ${svc.method || 'POST'}`,
      '入参：',
      this.paramsDocumentText(this.serviceRequestParams(svc)),
      '出参：',
      this.paramsDocumentText(this.serviceResponseParams(svc)),
    ].join('\n');
  }
  protected contractParamLines(params: ServiceParam[], level = 0): ContractParamLine[] {
    const lines: ContractParamLine[] = [];
    for (const param of params) {
      const open = this.paramDocumentOpen(param);
      const close = this.paramDocumentClose(param);
      lines.push({
        kind: 'field',
        level,
        name: param.name || '未命名参数',
        type: param.type || 'String',
        required: Boolean(param.required),
        note: param.note || '',
        open,
        close: '',
      });
      if (param.children?.length) {
        lines.push(...this.contractParamLines(param.children, level + 1));
        lines.push({ kind: 'close', level, name: '', type: '', required: false, note: '', open: '', close });
      }
    }
    return lines;
  }
  protected copyInterfaceDocument(svc: LegacyService): void {
    navigator.clipboard?.writeText(this.interfaceDocumentText(svc));
  }
  private paramsDocumentText(params: ServiceParam[], level = 0): string {
    if (!params.length && level === 0) return '{}';
    const indent = (value: number) => '  '.repeat(value + 1);
    const lines = level === 0 ? ['{'] : [];
    for (const param of params) {
      const required = param.required ? ' *' : '';
      const note = param.note ? ` // ${param.note}${required}` : required;
      const open = this.paramDocumentOpen(param);
      lines.push(`${indent(level)}${param.name || '未命名参数'}: ${this.docTypeName(param.type)}${open ? ` ${open}` : ''}${note}`);
      if (param.children?.length) {
        lines.push(this.paramsDocumentText(param.children, level + 1));
        lines.push(`${indent(level)}${this.paramDocumentClose(param)}`);
      }
    }
    if (level === 0) lines.push('}');
    return lines.join('\n');
  }
  private paramDocumentOpen(param: ServiceParam): string {
    if (!param.children?.length) return '';
    const type = String(param.type || '').toLowerCase();
    if (type === 'array' || type === 'list') return '[{';
    return '{';
  }
  private paramDocumentClose(param: ServiceParam): string {
    const type = String(param.type || '').toLowerCase();
    if (type === 'array' || type === 'list') return '}]';
    return '}';
  }
  private docTypeName(type = 'String'): string {
    const normalized = String(type || 'String').trim();
    const map: Record<string, string> = {
      String: 'string',
      Number: 'number',
      Boolean: 'boolean',
      Array: 'array',
      List: 'list',
      Map: 'map',
      Object: 'object',
    };
    return map[normalized] || normalized;
  }
  private normalizeSvcParam(param: Partial<ServiceParam>): ServiceParam {
    const children = Array.isArray(param.children) ? param.children.map((child) => this.normalizeSvcParam(child)) : [];
    return {
      name: String(param.name || '').trim(),
      type: String(param.type || 'String').trim() || 'String',
      required: Boolean(param.required),
      note: String(param.note || '').trim(),
      ...(children.length ? { children } : {}),
    };
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
  protected importJsonError = signal('');
  protected importJsonTarget = signal<'requestParams'|'responseParams'>('requestParams');

  protected startImportJson(target: 'requestParams'|'responseParams'): void { if (!this.canEdit()) return; this.importJsonTarget.set(target); this.importJsonText.set(''); this.importJsonError.set(''); this.importJsonVisible.set(true); }
  protected doImportJson(svc: LegacyService): void {
    if (!this.canEdit()) return;
    try {
      const imported = this.parsePastedParams(this.importJsonText());
      if (!imported.length) throw new Error('empty');
      const arr = this.importJsonTarget() === 'requestParams' ? this.serviceRequestParams(svc) : this.serviceResponseParams(svc);
      for (const param of imported) {
        if (!arr.some((item) => item.name === param.name)) arr.push(param);
      }
      this.importJsonVisible.set(false);
      this.importJsonError.set('');
      this.touch();
    } catch { this.importJsonError.set('没有识别到可导入的参数，请粘贴 JSON 或旧文档中的 name: type // 说明 片段。'); }
  }

  private parsePastedParams(raw: string): ServiceParam[] {
    const text = raw.trim();
    if (!text) return [];
    try {
      return this.paramsFromParsedJson(JSON.parse(text));
    } catch {
      return this.paramsFromLooseText(text);
    }
  }

  private paramsFromParsedJson(parsed: unknown): ServiceParam[] {
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is Partial<ServiceParam> => Boolean(item && typeof item === 'object'))
        .map((item) => this.normalizeSvcParam(item));
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => this.paramFromJsonValue(key, value));
    }
    return [];
  }

  // 边界细节：旧文档经常复制的是非严格 JSON 片段，这里只抽取稳定的 "字段: 类型 // 说明" 行，避免把大段示例文本误写入模型。
  private paramsFromLooseText(text: string): ServiceParam[] {
    const result: ServiceParam[] = [];
    const seen = new Set<string>();
    const linePattern = /^["']?([A-Za-z_][\w.-]*)["']?\s*:\s*([A-Za-z][\w\[\]]*)\s*,?\s*(?:\/\/\s*(.*))?$/;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line || /^[{}\[\]]+$/.test(line) || line.includes('......')) continue;
      const match = line.match(linePattern);
      if (!match) continue;
      const [, name, type, noteText = ''] = match;
      if (seen.has(name)) continue;
      seen.add(name);
      const required = line.includes('*');
      const note = noteText.replace(/\*/g, '').trim();
      result.push({ name, type: this.normalizeDocImportType(type), required, note });
    }
    return result;
  }

  private normalizeDocImportType(type: string): string {
    const lower = String(type || '').toLowerCase();
    if (lower.includes('number') || lower.includes('decimal') || lower === 'int' || lower === 'integer') return 'Number';
    if (lower.includes('bool')) return 'Boolean';
    if (lower.includes('array')) return 'Array';
    if (lower.includes('list') || lower.endsWith('[]')) return 'List';
    if (lower.includes('map')) return 'Map';
    if (lower.includes('object')) return 'Object';
    return 'String';
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

  // ─── Tab 2: 应用编排 ──────────────────────────
  protected orchestrationInterfaces(): LegacyService[] {
    const groupUid = this.orchServiceGroupUid();
    return this.services().filter((svc) => {
      if (groupUid === '__all__') return true;
      if (groupUid === '__ungrouped__') return !svc.serviceGroupUid;
      return String(svc.serviceGroupUid || '') === groupUid;
    });
  }
  protected selectOrchestrationServiceGroup(groupUid: string): void {
    this.orchServiceGroupUid.set(groupUid);
    this.runtime.ui['applicationOrchestrationServiceGroupUid'] = groupUid;
    const first = this.orchestrationInterfaces()[0];
    this.selectOrchestrationService(first ? this.uid(first) : '');
  }
  protected ensureOrchestrationInterfaceSelection(): void {
    if (this.orchestrationInterfaces().some((svc) => this.uid(svc) === this.orchSvcId())) return;
    const first = this.orchestrationInterfaces()[0];
    if (first) this.selectOrchestrationService(this.uid(first));
  }
  protected selectOrchestrationService(serviceUid: string): void {
    this.orchSvcId.set(serviceUid);
    this.runtime.ui['applicationOrchestrationServiceUid'] = serviceUid;
    const service = this.services().find((candidate) => this.uid(candidate) === serviceUid);
    const stepUid = service ? this.orchestrationSteps(service)[0]?.uid || '' : '';
    this.selectedStepUid.set(stepUid);
    this.runtime.ui['applicationOrchestrationStepUid'] = stepUid;
  }
  protected selectedStep(svc: LegacyService): OrchestrationStep | null {
    const steps = this.orchestrationSteps(svc);
    return steps.find((step) => step.uid === this.selectedStepUid()) || steps[0] || null;
  }
  protected selectStep(step: OrchestrationStep): void {
    this.selectedStepUid.set(step.uid);
    this.runtime.ui['applicationOrchestrationStepUid'] = step.uid;
  }
  protected addStep(svc: LegacyService, tid: string): void {
    if (!this.canEdit()) return;
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
    if (!this.canEdit()) return;
    const steps = this.orchestrationSteps(svc);
    const removedUid = steps[idx]?.taskDefinitionUid;
    steps.splice(idx, 1);
    // 清除涉及该步骤的参数映射
    if (removedUid) svc.parameterMappings = (svc.parameterMappings || []).filter(m => m.fromTaskDefUid !== removedUid && m.toTaskDefUid !== removedUid);
    this.selectedStepUid.set(steps[Math.min(idx, steps.length - 1)]?.uid || '');
    this.touch();
  }
  protected async moveStep(svc: LegacyService, idx: number, dir: number): Promise<void> {
    if (!this.canEdit()) return;
    const steps = this.orchestrationSteps(svc);
    const ni = idx + dir;
    if (ni < 0 || ni >= steps.length) return;
    const confirmed = await confirmRuntimeAction('调整任务顺序会改变后续步骤可用的上下文，输入映射可能需要重新设置。继续调整吗？', {
      title: '调整编排顺序',
      confirmLabel: '调整并清理失效映射',
    });
    if (!confirmed) return;
    [steps[idx], steps[ni]] = [steps[ni], steps[idx]];
    this.selectedStepUid.set(steps[ni]?.uid || steps[idx]?.uid || '');
    this.repairInvalidInputMappings(svc);
    this.touch();
  }
  protected addInputMapping(step: OrchestrationStep): void {
    if (!this.canEdit()) return;
    step.inputMapping ||= [];
    step.inputMapping.push({ source: '', target: '' });
    this.touch();
  }
  protected removeInputMapping(step: OrchestrationStep, idx: number): void {
    if (!this.canEdit()) return;
    (step.inputMapping || []).splice(idx, 1);
    this.touch();
  }
  protected addOutputMapping(step: OrchestrationStep): void {
    if (!this.canEdit()) return;
    step.outputMapping ||= [];
    step.outputMapping.push({ source: '', target: '' });
    this.touch();
  }
  protected removeOutputMapping(step: OrchestrationStep, idx: number): void {
    if (!this.canEdit()) return;
    (step.outputMapping || []).splice(idx, 1);
    this.touch();
  }
  protected returnMappings(svc: LegacyService): ParamMappingV3[] {
    return this.ensureOrchestration(svc).returnMapping;
  }
  protected addReturnMapping(svc: LegacyService): void {
    if (!this.canEdit()) return;
    this.returnMappings(svc).push({ source: '', target: '' });
    this.touch();
  }
  protected removeReturnMapping(svc: LegacyService, idx: number): void {
    if (!this.canEdit()) return;
    this.returnMappings(svc).splice(idx, 1);
    this.touch();
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
  protected requiredInputWarnings(step: OrchestrationStep): TaskParam[] {
    const mappedTargets = new Set((step.inputMapping || []).filter((mapping) => mapping.source).map((mapping) => mapping.target));
    return (this.stepTaskDef(step)?.parameters?.inputs || []).filter((param) => param.required && !mappedTargets.has(param.name));
  }
  protected mappingSourceWarning(svc: LegacyService, step: OrchestrationStep, mapping: ParamMappingV3): string {
    if (mapping.source && !this.inputSourceOptions(svc, step).some((option) => option.value === mapping.source)) return '来源已失效';
    if (!mapping.source && String(mapping.note || '').includes('来源已失效')) return '来源已失效';
    return '';
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

  private repairInvalidInputMappings(svc: LegacyService): void {
    for (const step of this.orchestrationSteps(svc)) {
      const validSources = new Set(this.inputSourceOptions(svc, step).map((option) => option.value));
      for (const mapping of step.inputMapping || []) {
        if (mapping.source && !validSources.has(mapping.source)) {
          mapping.source = '';
          mapping.note = '来源已失效：调换步骤顺序后原来源不在上下文中';
        }
      }
    }
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
