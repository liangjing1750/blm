import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { confirmRuntimeAction, getAngularRuntimeState, markAngularRuntimeModified, navigateAngularWorkbench, recordAngularNavigationBoundary } from '../../core/runtime/angular-runtime';
import { ExportProgress, ExportService } from '../../core/export/export.service';
import { ApplicationExporter } from '../../core/export/exporters/application-exporter';
import { WaitDialogComponent } from '../../core/shell/wait-dialog/wait-dialog.component';

type AppTab = 'service' | 'orchestration';
type OrchestrationStepKind = 'task' | 'branch' | 'loop' | 'assertion' | 'transform' | 'return';
type OrchestrationStepSlot = 'then' | 'else' | 'body';

interface TaskParam { name: string; type: string; required: boolean; note: string; }
interface LegacyTaskDef { uid?: string; id?: string; name?: string; type?: string; target?: string; address?: string; note?: string; parameters?: { inputs?: TaskParam[]; outputs?: TaskParam[] }; constructUid?: string; }
interface OrchStep { taskDefUid: string; order: number; }
interface OrchestrationStep {
  uid: string;
  name: string;
  stepAlias: string;
  taskDefinitionUid: string;
  inputMapping: ParamMappingV3[];
  outputMapping: ParamMappingV3[];
  kind?: OrchestrationStepKind;
  expression?: string;
  condition?: string;
  loopSource?: string;
  parentUid?: string;
  slot?: OrchestrationStepSlot;
  order?: number;
}
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
  selector: 'app-application-workbench', standalone: true, imports: [CommonModule, FormsModule, WaitDialogComponent],
  templateUrl: './app-workbench.html', styleUrl: './app-workbench.scss',
})
export class ApplicationWorkbenchComponent implements OnInit, OnDestroy {
  private readonly exportSvc = inject(ExportService);
  private readonly onRefresh = () => {
    this.syncNavigationFromRuntime();
    this.syncSelectionAfterDocumentRefresh();
    this.version.update((v) => v + 1);
  };
  private readonly runtime = getAngularRuntimeState();
  ngOnInit(): void {
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
    if (this.activeTab() === 'orchestration') this.ensureOrchestrationInterfaceSelection();
  }
  ngOnDestroy(): void { window.removeEventListener('blm-workbench-refresh', this.onRefresh); }

  protected readonly version = signal(0);
  protected readonly activeTab = signal<AppTab>(this.restoreActiveTab());
  protected readonly exportMenuOpen = signal(false);
  protected readonly exportWait = signal<{ title: string; description: string; progress?: number; remainingSeconds?: number } | null>(null);
  protected readonly svcKeyword = signal('');
  protected readonly orchServiceGroupUid = signal(String(this.runtime.ui['applicationOrchestrationServiceGroupUid'] || '__all__'));
  protected readonly orchSvcId = signal(String(this.runtime.ui['applicationOrchestrationServiceUid'] || ''));
  protected readonly orchKeyword = signal('');
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
  protected toggleExportMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.exportMenuOpen.update((value) => !value);
  }
  protected closeExportMenu(): void {
    this.exportMenuOpen.set(false);
  }
  protected async exportApplication(format: 'docx' | 'zip'): Promise<void> {
    this.closeExportMenu();
    const exporter = new ApplicationExporter(this.doc());
    this.exportWait.set({ title: `正在导出 ${exporter.label}`, description: '正在准备内容', progress: 5 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    try {
      await this.exportSvc.exportView(exporter, format, (progress) => this.updateExportProgress(progress));
      this.exportWait.set({ title: '完成', description: '', progress: 100 });
    } catch (error) {
      this.exportWait.set({ title: '导出失败', description: error instanceof Error ? error.message : String(error), progress: 0 });
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 300));
      this.exportWait.set(null);
    }
  }
  private updateExportProgress(progress: ExportProgress): void {
    const phaseBase = progress.phase === 'content' ? 10 : progress.phase === 'capture' ? 20 : progress.phase === 'assemble' ? 84 : 94;
    const phaseSpan = progress.phase === 'capture' ? 60 : progress.phase === 'assemble' ? 10 : 6;
    const ratio = progress.total > 0 ? progress.current / progress.total : 0;
    this.exportWait.set({
      title: `正在导出 ${progress.label}`,
      description: this.exportPhaseText(progress),
      progress: Math.min(99, Math.round(phaseBase + phaseSpan * ratio)),
    });
  }
  private exportPhaseText(progress: ExportProgress): string {
    if (progress.phase === 'capture') return `正在截图 ${progress.current}/${progress.total}`;
    if (progress.phase === 'assemble') return '正在生成文件';
    if (progress.phase === 'download') return '正在下载';
    return '正在准备内容';
  }
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

  // 模块意图：远端同步会整体替换 runtime.doc，应用工作台需要把当前选择重新对齐到新文档。
  // 关键流程：保留仍存在的服务/步骤；如果远端删除了当前对象，则切到同一列表里的第一个可用对象。
  // 边界细节：只修正 UI 指针，不主动创建业务数据，避免“立即同步”把远端文档再次标脏。
  private syncSelectionAfterDocumentRefresh(): void {
    const services = this.services();
    const selectedServiceUid = this.selectedServiceId();
    if (selectedServiceUid && !services.some((service) => this.uid(service) === selectedServiceUid)) {
      const fallback = this.pagedServices()[0] || this.filteredServices()[0] || services[0];
      const fallbackUid = fallback ? this.uid(fallback) : '';
      this.selectedServiceId.set(fallbackUid);
      this.runtime.ui['applicationServiceUid'] = fallbackUid;
      this.runtime.ui['applicationServiceId'] = fallbackUid;
    }
    if (this.serviceDrawerId() && !services.some((service) => this.uid(service) === this.serviceDrawerId())) {
      this.serviceDrawerId.set('');
      this.editorOpen.set(false);
    }
    if (this.orchSvcId() && !services.some((service) => this.uid(service) === this.orchSvcId())) {
      this.ensureOrchestrationInterfaceSelection();
    }
    const orchestrationService = services.find((service) => this.uid(service) === this.orchSvcId());
    if (orchestrationService) {
      const steps = this.orchestrationSteps(orchestrationService);
      if (this.selectedStepUid() && !steps.some((step) => step.uid === this.selectedStepUid())) {
        const fallbackStepUid = steps[0]?.uid || '';
        this.selectedStepUid.set(fallbackStepUid);
        this.runtime.ui['applicationOrchestrationStepUid'] = fallbackStepUid;
      }
    } else if (this.selectedStepUid()) {
      this.selectedStepUid.set('');
      this.runtime.ui['applicationOrchestrationStepUid'] = '';
    }
  }

  private syncNavigationFromRuntime(): void {
    this.activeTab.set(this.restoreActiveTab());
    this.selectedServiceGroupUid.set(String(this.runtime.ui['applicationServiceGroupUid'] || '__all__'));
    this.selectedServiceId.set(String(this.runtime.ui['applicationServiceUid'] || this.runtime.ui['applicationServiceId'] || ''));
    this.orchServiceGroupUid.set(String(this.runtime.ui['applicationOrchestrationServiceGroupUid'] || '__all__'));
    this.orchSvcId.set(String(this.runtime.ui['applicationOrchestrationServiceUid'] || ''));
    this.selectedStepUid.set(String(this.runtime.ui['applicationOrchestrationStepUid'] || ''));
  }

  protected orderedSteps(svc: LegacyService): OrchestrationStep[] { return this.orchestrationSteps(svc); }
  protected rootOrchestrationSteps(svc: LegacyService): OrchestrationStep[] { return this.stepsInSlot(svc, '', 'root'); }
  protected branchThenSteps(svc: LegacyService, step: OrchestrationStep): OrchestrationStep[] { return this.stepsInSlot(svc, step.uid, 'then'); }
  protected branchElseSteps(svc: LegacyService, step: OrchestrationStep): OrchestrationStep[] { return this.stepsInSlot(svc, step.uid, 'else'); }
  protected loopBodySteps(svc: LegacyService, step: OrchestrationStep): OrchestrationStep[] { return this.stepsInSlot(svc, step.uid, 'body'); }
  protected stepTreeDepth(svc: LegacyService, step: OrchestrationStep): number {
    const byUid = new Map(this.orchestrationSteps(svc).map((item) => [item.uid, item]));
    let depth = 0;
    let parentUid = String(step.parentUid || '').trim();
    while (parentUid && depth < 8) {
      const parent = byUid.get(parentUid);
      if (!parent) break;
      depth += 1;
      parentUid = String(parent.parentUid || '').trim();
    }
    return depth;
  }
  protected stepHasChildren(svc: LegacyService, step: OrchestrationStep): boolean {
    return this.orchestrationSteps(svc).some((item) => item.parentUid === step.uid);
  }
  protected canHaveChildSteps(step: OrchestrationStep): boolean {
    const kind = this.stepKind(step);
    return kind === 'branch' || kind === 'loop';
  }
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
  protected serviceGroupTooltip(group: LegacyServiceGroup): string | null {
    const desc = String(group.desc || '').trim();
    return desc || null;
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
    const svc: LegacyService = { uid: `interface-${Date.now()}`, name: '', serviceGroupUid, method: 'POST', path: '', desc: '', requestParams: [], responseParams: [], steps: [], parameterMappings: [], nodeRefs: [] };
    this.doc().services ||= [];
    this.doc().services.push(svc);
    this.openServiceDrawer(svc);
    this.touch();
  }
  protected createServiceGroup(): void {
    if (!this.canEdit()) return;
    this.openServiceGroupDrawer();
  }
  protected editSelectedServiceGroup(): void {
    if (!this.canEdit()) return;
    const group = this.selectedServiceGroup();
    if (!group) return;
    this.openServiceGroupDrawer(group);
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
  protected addSvcParam(arr: ServiceParam[]): void { if (!this.canEdit()) return; arr.push({ name: '', type: 'String', required: false, note: '' }); this.touch(); }
  protected removeSvcParam(arr: ServiceParam[], idx: number): void { if (!this.canEdit()) return; arr.splice(idx, 1); this.touch(); }
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

  private stepsInSlot(svc: LegacyService, parentUid: string, slot: OrchestrationStepSlot | 'root'): OrchestrationStep[] {
    const targetParentUid = String(parentUid || '').trim();
    return this.orchestrationSteps(svc)
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => {
        const stepParentUid = String(step.parentUid || '').trim();
        if (slot === 'root') return !stepParentUid;
        return stepParentUid === targetParentUid && step.slot === slot;
      })
      .sort((left, right) => this.stepOrderValue(left.step, left.index) - this.stepOrderValue(right.step, right.index))
      .map(({ step }) => step);
  }

  private stepOrderValue(step: OrchestrationStep, index: number): number {
    const value = Number(step.order);
    return Number.isFinite(value) ? value : index + 1;
  }

  private nextStepOrder(svc: LegacyService, parentUid = '', slot: OrchestrationStepSlot | 'root' = 'root'): number {
    const siblings = this.stepsInSlot(svc, parentUid, slot);
    return siblings.reduce((max, step, index) => Math.max(max, this.stepOrderValue(step, index)), 0) + 1;
  }

  private assignStepPlacement(
    svc: LegacyService,
    step: OrchestrationStep,
    parentUid = '',
    slot: OrchestrationStepSlot | 'root' = 'root',
  ): void {
    step.parentUid = parentUid || undefined;
    step.slot = slot === 'root' ? undefined : slot;
    step.order = this.nextStepOrder(svc, parentUid, slot);
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
    const structured = this.paramsFromLooseStructuredText(text);
    if (structured.length) return structured;
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

  // 模块意图：兼容接口文档里常见的“像 JSON 的类型说明”，不要求 key 加引号或每行都有逗号。
  // 关键流程：按行维护对象/数组上下文，把字段挂回最近的父参数，数组示例对象会成为数组字段的 children。
  // 边界细节：只识别字段定义和结构符号，忽略省略号等展示文本，避免把文档噪声导入模型。
  private paramsFromLooseStructuredText(text: string): ServiceParam[] {
    type Context = { kind: 'object'|'array'; children: ServiceParam[]; owner?: ServiceParam };
    const root: ServiceParam[] = [];
    const stack: Context[] = [{ kind: 'object', children: root }];
    const fieldPattern = /^["']?([A-Za-z_][\w.-]*)["']?\s*:\s*(.*?)\s*,?$/;

    const closeContext = (kind?: 'object'|'array'): void => {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        const context = stack[index];
        stack.pop();
        if (!kind || context.kind === kind) return;
      }
    };

    for (const rawLine of text.split(/\r?\n/)) {
      const [body = '', noteText = ''] = rawLine.split('//');
      let line = body.trim();
      if (!line || line.includes('......')) continue;

      while (/^[\]}]/.test(line)) {
        if (line.startsWith(']')) closeContext('array');
        else closeContext('object');
        line = line.replace(/^[}\]],?\s*/, '').trim();
      }
      if (!line || line === '{' || line.startsWith('[')) {
        if (line === '{' && stack.at(-1)?.kind === 'array') {
          stack.push({ kind: 'object', children: stack.at(-1)?.children ?? [] });
        } else if (line.startsWith('[')) {
          // 关联到上一个集合类型的参数（如 checkDetail: List 后跟 [{）
          const parentCtx = stack.at(-1);
          const lastParam = parentCtx?.children?.at(-1);
          const isCollection = lastParam && ['List', 'Array', 'Object'].includes(lastParam.type);
          const targetChildren = isCollection && !lastParam.children ? lastParam : null;
          const arrChildren = targetChildren ? (targetChildren.children = []) : [];
          stack.push({ kind: 'array', children: arrChildren });
          const afterArray = line.replace(/^\[+/, '').trim();
          if (afterArray.startsWith('{')) {
            stack.push({ kind: 'object', children: arrChildren });
          }
        }
        continue;
      }

      const match = line.match(fieldPattern);
      if (!match) continue;
      const [, name, rawValue = ''] = match;
      const value = rawValue.replace(/,$/, '').trim();
      const required = noteText.includes('*');
      const note = noteText.replace(/\*/g, '').trim();
      const parent = stack.at(-1) ?? stack[0];
      const param: ServiceParam = {
        name,
        type: this.looseValueType(value),
        required,
        note,
      };
      parent.children.push(param);

      if (value.startsWith('{')) {
        param.children = [];
        stack.push({ kind: 'object', children: param.children, owner: param });
      } else if (value.startsWith('[')) {
        param.children = [];
        stack.push({ kind: 'array', children: param.children, owner: param });
      }

      if (value.includes('}') && stack.at(-1)?.owner === param) closeContext('object');
      if (value.includes(']') && stack.at(-1)?.owner === param) closeContext('array');
    }
    return root;
  }

  private looseValueType(value: string): string {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed.startsWith('[')) return 'Array';
    if (trimmed.startsWith('{')) return 'Object';
    if (/^['"]/.test(trimmed)) return 'String';
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'Number';
    if (lower === 'true' || lower === 'false') return 'Boolean';
    return this.normalizeDocImportType(trimmed);
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
    const keyword = this.orchKeyword().trim().toLowerCase();
    const deduped = new Map<string, LegacyService>();
    for (const svc of this.services()) {
      const id = this.uid(svc);
      if (!id || deduped.has(id)) continue;
      if (groupUid === '__all__') continue;
      if (groupUid === '__ungrouped__') {
        if (svc.serviceGroupUid) continue;
      } else if (String(svc.serviceGroupUid || '') !== groupUid) {
        continue;
      }
      const label = this.orchestrationInterfaceLabel(svc).toLowerCase();
      if (keyword && !label.includes(keyword)) continue;
      deduped.set(id, svc);
    }
    if (groupUid === '__all__') {
      for (const svc of this.services()) {
        const id = this.uid(svc);
        if (!id || deduped.has(id)) continue;
        const label = this.orchestrationInterfaceLabel(svc).toLowerCase();
        if (keyword && !label.includes(keyword)) continue;
        deduped.set(id, svc);
      }
    }
    return [...deduped.values()].sort((left, right) =>
      String(left.name || this.uid(left)).localeCompare(String(right.name || this.uid(right)), 'zh-Hans-CN', { numeric: true }),
    );
  }

  protected setOrchestrationKeyword(keyword: string): void {
    this.orchKeyword.set(keyword);
    this.ensureOrchestrationInterfaceSelection();
  }

  protected orchestrationInterfaceLabel(svc: LegacyService): string {
    const group = this.serviceGroupFor(svc);
    const name = svc.name || this.uid(svc);
    return `${this.serviceGroupTitle(group)} · ${name}`;
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
  protected addStep(svc: LegacyService, tid: string, parentUid = '', slot: OrchestrationStepSlot | 'root' = 'root'): void {
    if (!this.canEdit()) return;
    if (!tid) return;
    const steps = this.orchestrationSteps(svc);
    if (steps.some(s => s.taskDefinitionUid === tid && String(s.parentUid || '') === String(parentUid || '') && (s.slot || 'root') === slot)) return;
    const task = this.taskDefs().find((td) => this.uid(td) === tid);
    const step: OrchestrationStep = {
      uid: `step-${this.uid(svc) || 'service'}-${steps.length + 1}-${tid}`,
      name: task?.name || tid,
      stepAlias: `step${steps.length + 1}`,
      taskDefinitionUid: tid,
      kind: 'task',
      inputMapping: [],
      outputMapping: [],
    };
    this.assignStepPlacement(svc, step, parentUid, slot);
    steps.push(step);
    this.selectedStepUid.set(step.uid);
    delete svc.steps;
    this.touch();
  }

  protected addModelingStep(svc: LegacyService, kind: OrchestrationStepKind, parentUid = '', slot: OrchestrationStepSlot | 'root' = 'root'): void {
    if (!this.canEdit()) return;
    if (kind === 'task') return;
    const steps = this.orchestrationSteps(svc);
    const count = steps.filter((step) => this.stepKind(step) === kind).length + 1;
    const step: OrchestrationStep = {
      uid: `step-${this.uid(svc) || 'service'}-${kind}-${Date.now()}-${count}`,
      name: this.defaultStepName(kind, count),
      stepAlias: `${kind}${count}`,
      taskDefinitionUid: '',
      kind,
      inputMapping: [],
      outputMapping: [],
      expression: kind === 'assertion' ? '表达业务校验条件' : kind === 'transform' ? '表达字段加工规则' : '',
      condition: kind === 'branch' ? '满足条件时执行' : '',
      loopSource: kind === 'loop' ? '选择列表或循环条件' : '',
    };
    this.assignStepPlacement(svc, step, parentUid, slot);
    steps.push(step);
    this.selectStep(step);
    delete svc.steps;
    this.touch();
  }

  protected stepKind(step: OrchestrationStep): OrchestrationStepKind {
    return step.kind || (step.taskDefinitionUid ? 'task' : 'task');
  }

  protected stepKindLabel(stepOrKind: OrchestrationStep | OrchestrationStepKind): string {
    const kind = typeof stepOrKind === 'string' ? stepOrKind : this.stepKind(stepOrKind);
    const labels: Record<OrchestrationStepKind, string> = {
      task: '任务',
      branch: '分支',
      loop: '循环',
      assertion: '断言',
      transform: '加工',
      return: '返回',
    };
    return labels[kind];
  }

  protected stepDisplayName(step: OrchestrationStep): string {
    return this.stepTaskDef(step)?.name || step.name || this.stepKindLabel(step);
  }

  protected stepDescription(step: OrchestrationStep): string {
    const kind = this.stepKind(step);
    if (kind === 'task') return this.stepTaskDef(step)?.target || this.stepTaskDef(step)?.address || '调用任务定义';
    if (kind === 'branch') return step.condition || '按条件选择后续路径';
    if (kind === 'loop') return step.loopSource || '对列表或条件重复执行';
    if (kind === 'assertion') return step.expression || '表达业务校验';
    if (kind === 'transform') return step.expression || '字段转换、组合或格式化';
    return '定义应用接口最终输出';
  }

  protected orchestrationExportSummary(svc: LegacyService): string[] {
    return [
      `应用接口：${svc.name || this.uid(svc)}`,
      ...this.orchestrationSteps(svc).map((step, index) => `${index + 1}. [${this.stepKindLabel(step)}] ${this.stepDisplayName(step)} - ${this.stepDescription(step)}`),
      `返回映射：${this.returnMappings(svc).length} 项`,
    ];
  }

  protected selectedStepOutputOptions(svc: LegacyService, step: OrchestrationStep): VariableOption[] {
    const kind = this.stepKind(step);
    if (kind === 'task') return this.outputTargetOptions(svc, step);
    const alias = this.stepAlias(step, this.orchestrationSteps(svc).indexOf(step));
    return [{ value: `step.${alias}.result`, label: `step.${alias}.result` }];
  }

  private defaultStepName(kind: OrchestrationStepKind, count: number): string {
    const labels: Record<OrchestrationStepKind, string> = {
      task: '任务',
      branch: '分支判断',
      loop: '循环处理',
      assertion: '业务断言',
      transform: '数据加工',
      return: '返回结果',
    };
    return `${labels[kind]}${count > 1 ? count : ''}`;
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

  protected removeStepNode(svc: LegacyService, step: OrchestrationStep): void {
    if (!this.canEdit()) return;
    const steps = this.orchestrationSteps(svc);
    const removedUids = new Set<string>();
    const collect = (uid: string) => {
      removedUids.add(uid);
      steps.filter((item) => item.parentUid === uid).forEach((child) => collect(child.uid));
    };
    collect(step.uid);
    const removedTaskUids = new Set(steps.filter((item) => removedUids.has(item.uid)).map((item) => item.taskDefinitionUid).filter(Boolean));
    this.ensureOrchestration(svc).steps = steps.filter((item) => !removedUids.has(item.uid));
    if (removedTaskUids.size) {
      svc.parameterMappings = (svc.parameterMappings || []).filter((mapping) => !removedTaskUids.has(mapping.fromTaskDefUid) && !removedTaskUids.has(mapping.toTaskDefUid));
    }
    this.selectedStepUid.set(this.rootOrchestrationSteps(svc)[0]?.uid || this.orchestrationSteps(svc)[0]?.uid || '');
    this.touch();
  }

  protected async moveStepInScope(svc: LegacyService, step: OrchestrationStep, dir: number): Promise<void> {
    if (!this.canEdit()) return;
    const slot = (step.slot || 'root') as OrchestrationStepSlot | 'root';
    const siblings = this.stepsInSlot(svc, step.parentUid || '', slot);
    const idx = siblings.indexOf(step);
    const ni = idx + dir;
    if (idx < 0 || ni < 0 || ni >= siblings.length) return;
    const confirmed = await confirmRuntimeAction('调整任务顺序会改变后续步骤可用的上下文，输入映射可能需要重新设置。继续调整吗？', {
      title: '调整编排顺序',
      confirmLabel: '调整并清理失效映射',
    });
    if (!confirmed) return;
    const left = siblings[idx];
    const right = siblings[ni];
    const leftOrder = this.stepOrderValue(left, this.orchestrationSteps(svc).indexOf(left));
    const rightOrder = this.stepOrderValue(right, this.orchestrationSteps(svc).indexOf(right));
    left.order = rightOrder;
    right.order = leftOrder;
    this.selectedStepUid.set(step.uid);
    this.repairInvalidInputMappings(svc);
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
  protected inputMappingSource(step: OrchestrationStep, target: string): string {
    return (step.inputMapping || []).find((mapping) => mapping.target === target)?.source || '';
  }
  protected inputMappingWarning(svc: LegacyService, step: OrchestrationStep, target: string): string {
    const mapping = (step.inputMapping || []).find((item) => item.target === target);
    return mapping ? this.mappingSourceWarning(svc, step, mapping) : '';
  }
  protected setInputMappingSource(step: OrchestrationStep, target: string, source: string): void {
    if (!this.canEdit()) return;
    step.inputMapping ||= [];
    const existing = step.inputMapping.find((mapping) => mapping.target === target);
    if (!source) {
      step.inputMapping = step.inputMapping.filter((mapping) => mapping.target !== target);
      this.touch();
      return;
    }
    if (existing) {
      existing.source = source;
    } else {
      step.inputMapping.push({ source, target });
    }
    this.touch();
  }
  protected outputBindingTarget(step: OrchestrationStep, source: string): string {
    return (step.outputMapping || []).find((mapping) => mapping.source === source)?.target || '';
  }
  protected setOutputBindingTarget(step: OrchestrationStep, source: string, target: string): void {
    if (!this.canEdit()) return;
    step.outputMapping ||= [];
    const existing = step.outputMapping.find((mapping) => mapping.source === source);
    if (!target) {
      step.outputMapping = step.outputMapping.filter((mapping) => mapping.source !== source);
      this.touch();
      return;
    }
    if (existing) {
      existing.target = target;
    } else {
      step.outputMapping.push({ source, target });
    }
    this.touch();
  }
  protected returnMappingSource(svc: LegacyService, target: string): string {
    return this.returnMappings(svc).find((mapping) => mapping.target === target)?.source || '';
  }
  protected setReturnMappingSource(svc: LegacyService, target: string, source: string): void {
    if (!this.canEdit()) return;
    const mappings = this.returnMappings(svc);
    const existing = mappings.find((mapping) => mapping.target === target);
    if (!source) {
      const index = mappings.findIndex((mapping) => mapping.target === target);
      if (index >= 0) mappings.splice(index, 1);
      this.touch();
      return;
    }
    if (existing) {
      existing.source = source;
    } else {
      mappings.push({ source, target });
    }
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
