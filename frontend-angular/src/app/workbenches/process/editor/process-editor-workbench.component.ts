import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, QueryList, ViewChildren, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getAngularRuntimeState } from '../../../core/runtime/angular-runtime';
import {
  LegacyEntity,
  LegacyProcess,
  LegacyProcessNode,
  LegacyTaskDefinition,
  LegacyTaskForm,
  LegacyTaskFormSection,
  LegacyFormField,
  LegacyUserStep,
  LegacyBusinessRule,
  LegacyFlowGateway,
  LegacyFlowEdge,
  LegacyRole,
  LegacyPrototypeFile,
  LegacyPrototypeVersion,
  ProcessStageDisplay,
  ProcessEditorLegacyAdapter,
  createProcessEditorLegacyAdapter,
} from './process-editor-legacy-adapter';

interface ProcessEditorGraphNode {
  id: string;
  kind: 'start' | 'task' | 'gateway' | 'end';
  name: string;
  role: string;
  x: number;
  y: number;
  selected: boolean;
  task?: LegacyProcessNode;
}

interface ProcessEditorGraphEdge {
  id: string;
  label: string;
  d: string;
  labelX: number;
  labelY: number;
}

interface ProcessEditorGraphLane {
  name: string;
  top: number;
  height: number;
}

interface ProcessNodeDirectory {
  id: string;
  name: string;
  tasks: LegacyProcessNode[];
}

interface ProcessApplicationService {
  id?: string;
  uid?: string;
  name?: string;
  method?: string;
  path?: string;
  desc?: string;
  nodeRefs?: string[];
}

@Component({
  selector: 'app-process-editor-workbench',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './process-editor-workbench.component.html',
  styleUrls: [
    './process-editor-workbench.component.scss',
    './node-editor-hero.scss',
    './node-editor-polish.scss',
    './node-editor-body-1.scss',
    './node-editor-body-2.scss',
    './node-editor-body-3.scss',
    './node-view-v2.scss',
    './node-view-v3-layout.scss',
    './node-view-v3-cards.scss',
    './node-view-v4.scss',
    './node-view-v5-role.scss',
    './node-view-v5-form.scss',
  ],
})
export class ProcessEditorWorkbenchComponent implements OnInit, OnDestroy {

  @Input() editing = true;

  // 远端同步后通过 blm-workbench-refresh 事件刷新视图
  private readonly onRefresh = () => {
    this.version.update((v) => v + 1);
  };

  ngOnInit(): void {
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
  }

  ngOnDestroy(): void {
    window.removeEventListener('blm-workbench-refresh', this.onRefresh);
  }
  // 模块意图：流程编辑器先承接旧版抽屉编辑能力，后续再把流程图算法从 legacy 中完整迁出。
  protected readonly version = signal(0);
  protected readonly adapter: ProcessEditorLegacyAdapter = createProcessEditorLegacyAdapter();
  protected readonly entityOps = ['C', 'R', 'U', 'D'];
  protected selectedEntityId = '';
  protected readonly graphWidth = 980;
  protected readonly graphZoom = signal(1);
  protected readonly roleCollapsed = signal(true);
  protected readonly materialTab = signal<'forms' | 'attachments'>('forms');
  protected readonly moreOpen = signal(false);
  protected readonly formCopyMenuId = signal('');
  protected readonly formNotice = signal('');
  protected readonly activeNodeSection = signal('node-role-section');
  protected readonly stepTypes = [
    { value: 'Click', label: '点击' },
    { value: 'Query', label: '查询' },
    { value: 'Check', label: '校验' },
    { value: 'Fill', label: '填写' },
    { value: 'Select', label: '选择' },
    { value: 'Compute', label: '计算' },
    { value: 'Mutate', label: '变更' },
    { value: 'Display', label: '显示' },
    { value: '__other__', label: '其它...' },
  ];
  protected readonly formFieldTypes = [
    { value: 'Text', label: '输入框' },
    { value: 'Select', label: '下拉选择' },
    { value: 'Date', label: '日期' },
    { value: 'Number', label: '数字' },
    { value: 'File', label: '附件' },
    { value: 'Readonly', label: '只读展示' },
    { value: 'Note', label: '说明文本' },
  ];
  protected readonly entityFieldEmptyLabel = '\u4e0d\u6620\u5c04';
  protected readonly openStepDetails = signal<Set<string>>(new Set());
  protected readonly openRuleDetails = signal<Set<string>>(new Set());
  @ViewChildren('nodeSection') private readonly nodeSections?: QueryList<ElementRef<HTMLElement>>;
  private readonly businessRulePlaceholders = new Map<string, { name: string; content: string }>();
  private readonly graphLaneHeight = 120;
  private readonly graphLeftGutter = 116;
  private readonly graphStartX = 146;
  private readonly graphNodeStartX = 198;
  private readonly graphColumnGap = 170;
  protected readonly drawerWidthValue = signal(480);

  protected currentProcess(): LegacyProcess | null {
    this.version();
    const current = this.adapter.currentProcess();
    if (current && this.tasks(current).length) return current;
    return this.processes().find((process) => this.tasks(process).length) || current;
  }

  protected currentTask(): LegacyProcessNode | null {
    this.version();
    const selected = this.adapter.currentTask();
    if (selected) return selected;
    const process = this.currentProcess();
    return this.tasks(process)[0] || null;
  }

  protected isNodeEditor(): boolean {
    return !!this.currentTask();
  }

  protected processes(): LegacyProcess[] {
    this.version();
    return this.adapter.processes();
  }

  protected tasks(process: LegacyProcess | null): LegacyProcessNode[] {
    this.version();
    return this.adapter.tasks(process);
  }

  protected entities(): LegacyEntity[] {
    this.version();
    return this.adapter.entities();
  }

  protected processId(process: LegacyProcess | null | undefined): string {
    return this.adapter.processId(process);
  }

  protected taskId(task: LegacyProcessNode | null | undefined): string {
    return this.adapter.taskId(task);
  }

  protected taskDefinitions(task: LegacyProcessNode): LegacyTaskDefinition[] {
    task.orchestrationTasks ||= [];
    return task.orchestrationTasks;
  }

  protected applicationServicesForTask(task: LegacyProcessNode): ProcessApplicationService[] {
    this.version();
    // 模块意图：流程节点只展示“这个节点会触发哪些应用服务”的产品视图，不接管应用编排编辑职责。
    // 关键流程：优先用服务侧 nodeRefs 反查节点，同时兼容节点侧 serviceUids/serviceIds 引用，便于后续流程平台对接。
    // 边界细节：这里不展开参数映射、步骤编排和技术承接，避免流程工作台重新暴露构件运行时细节。
    const taskRefs = this.referenceKeys([this.taskId(task), task.uid, task.id]);
    const nodeServiceRefs = this.referenceKeys([
      ...((task as LegacyProcessNode & { serviceUids?: string[] }).serviceUids || []),
      ...((task as LegacyProcessNode & { serviceIds?: string[] }).serviceIds || []),
    ]);
    return this.applicationServices().filter((service) => {
      const serviceRefs = this.referenceKeys(service.nodeRefs || []);
      const serviceId = this.serviceId(service);
      return taskRefs.some((ref) => serviceRefs.includes(ref)) || (serviceId ? nodeServiceRefs.includes(serviceId) : false);
    });
  }

  protected serviceId(service: ProcessApplicationService | null | undefined): string {
    return String(service?.uid || service?.id || service?.name || '').trim();
  }

  private applicationServices(): ProcessApplicationService[] {
    const doc = getAngularRuntimeState().doc as { services?: ProcessApplicationService[] } | null | undefined;
    return Array.isArray(doc?.services) ? doc.services : [];
  }

  private referenceKeys(values: Array<string | undefined>): string[] {
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  }

  protected gateways(process: LegacyProcess): LegacyFlowGateway[] {
    this.version();
    return this.adapter.gateways(process);
  }

  protected edges(process: LegacyProcess): LegacyFlowEdge[] {
    this.version();
    return this.adapter.edges(process);
  }

  protected graphNodes(process: LegacyProcess, selectedTask: LegacyProcessNode | null): ProcessEditorGraphNode[] {
    // 模块意图：编辑态左侧只负责表达流程结构，所有写操作仍通过 adapter 进入旧数据模型，避免画布和数据维护互相耦合。
    const tasks = this.tasks(process);
    const gateways = this.gateways(process);
    const orderedIds = this.graphOrder(process);
    const taskById = new Map(tasks.map((task) => [this.taskId(task), task]));
    const gatewayById = new Map(gateways.map((gateway) => [this.gatewayId(gateway), gateway]));
    const laneByName = new Map(this.graphLanes(process).map((lane, index) => [lane.name, index]));
    const nodes = orderedIds.map((id, index) => {
      const isStart = id === 'START';
      const isEnd = id === 'END';
      const task = taskById.get(id);
      const gateway = gatewayById.get(id);
      const kind: ProcessEditorGraphNode['kind'] = isStart ? 'start' : isEnd ? 'end' : gateway ? 'gateway' : 'task';
      const laneName = this.displayRoleName(task?.role || task?.role_id || this.taskRoleIds(task || ({} as LegacyProcessNode))[0] || gateway?.role_id || tasks[0]?.role || '业务人员');
      const laneIndex = laneByName.get(laneName) ?? 0;
      const laneTop = laneIndex * this.graphLaneHeight;
      const graphIndex = Math.max(0, index - 1);
      const x = kind === 'start'
        ? this.graphStartX
        : kind === 'end'
        ? this.graphNodeStartX + graphIndex * this.graphColumnGap
        : this.graphNodeStartX + graphIndex * this.graphColumnGap;
      const y = kind === 'gateway' ? laneTop + 74 : laneTop + 54;
      return {
        id,
        kind,
        name: isStart ? '开始' : isEnd ? '结束' : task?.name || gateway?.title || '未命名节点',
        role: isStart || isEnd ? '' : this.displayRoleName(task?.role || task?.role_id || this.taskRoleIds(task || ({} as LegacyProcessNode))[0] || gateway?.role_id || ''),
        x,
        y,
        selected: Boolean(task && selectedTask && this.taskId(task) === this.taskId(selectedTask)),
        task,
      };
    });
    return nodes;
  }

  protected graphLanes(process: LegacyProcess): ProcessEditorGraphLane[] {
    const names = this.tasks(process).map((task) => this.displayRoleName(task.role || task.role_id || this.taskRoleIds(task)[0] || '业务人员'));
    for (const gateway of this.gateways(process)) {
      const name = this.displayRoleName(gateway.role_id || '');
      if (name) names.push(name);
    }
    const unique = [...new Set(names.length ? names : ['业务人员'])];
    return unique.map((name, index) => ({ name, top: index * this.graphLaneHeight, height: this.graphLaneHeight }));
  }

  protected graphCanvasHeight(process: LegacyProcess): number {
    return Math.max(240, this.graphLanes(process).length * this.graphLaneHeight);
  }

  protected graphEdges(process: LegacyProcess, selectedTask: LegacyProcessNode | null): ProcessEditorGraphEdge[] {
    // 关键流程：连线使用直折线，先水平到中点、再垂直、再水平到目标，复刻旧版“流程图编辑”的可读连接方式。
    const nodes = this.graphNodes(process, selectedTask);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return this.edges(process)
      .map((edge, index) => {
        const from = nodeById.get(String(edge.from || ''));
        const to = nodeById.get(String(edge.to || ''));
        if (!from || !to) return null;
        const startX = from.x + (from.kind === 'start' ? 24 : 132);
        const startY = from.y + (from.kind === 'start' || from.kind === 'end' ? 12 : 34);
        const endX = to.x + (to.kind === 'end' ? 0 : 0);
        const endY = to.y + (to.kind === 'start' || to.kind === 'end' ? 12 : 34);
        const midX = Math.max(startX + 24, Math.round((startX + endX) / 2));
        return {
          id: String(edge.id || edge.uid || `edge-${index}`),
          label: String(edge.label || edge.condition || ''),
          d: `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`,
          labelX: midX + 6,
          labelY: Math.min(startY, endY) + Math.abs(endY - startY) / 2 - 6,
        };
      })
      .filter((edge): edge is ProcessEditorGraphEdge => Boolean(edge));
  }

  protected graphCanvasWidth(process: LegacyProcess): number {
    const nodeCount = Math.max(this.graphOrder(process).length, 1);
    return Math.max(this.graphWidth, this.graphNodeStartX + Math.max(0, nodeCount - 2) * this.graphColumnGap + 220);
  }

  protected nudgeGraphZoom(delta: number): void {
    const next = Math.max(0.5, Math.min(1.8, Math.round((this.graphZoom() + delta) * 10) / 10));
    this.graphZoom.set(next);
  }

  protected resetGraphZoom(): void {
    this.graphZoom.set(1);
  }

  protected displayRoleName(roleId: string | undefined): string {
    const raw = String(roleId || '').trim();
    if (!raw) return '';
    const role = this.roles().find((item) => this.roleId(item) === raw || String(item.uid || '') === raw || item.name === raw);
    return role?.name || raw;
  }

  protected graphOrder(process: LegacyProcess): string[] {
    // 边界细节：旧数据里可能只有节点、没有连线；此时保持“开始 -> 任务 -> 分支 -> 结束”的稳定顺序，避免空画布。
    const taskIds = this.tasks(process).map((task) => this.taskId(task)).filter(Boolean);
    const gatewayIds = this.gateways(process).map((gateway) => this.gatewayId(gateway)).filter(Boolean);
    const allIds = ['START', ...taskIds, ...gatewayIds, 'END'];
    const ordered: string[] = ['START'];
    const edges = this.edges(process);
    let current = 'START';
    const visited = new Set(ordered);
    for (let guard = 0; guard < allIds.length + edges.length; guard += 1) {
      const next = edges.find((edge) => String(edge.from || '') === current && !visited.has(String(edge.to || '')))?.to;
      if (!next) break;
      ordered.push(String(next));
      visited.add(String(next));
      current = String(next);
      if (current === 'END') break;
    }
    for (const id of allIds) {
      if (!visited.has(id)) ordered.push(id);
    }
    return ordered;
  }

  protected gatewayId(gateway: LegacyFlowGateway): string {
    return String(gateway.id || gateway.uid || '');
  }

  protected edgeId(edge: LegacyFlowEdge): string {
    return String(edge.id || edge.uid || '');
  }

  protected flowNodeOptions(process: LegacyProcess, side: 'from' | 'to'): Array<{ id: string; label: string }> {
    this.version();
    return this.adapter.flowNodeOptions(process, side);
  }

  protected prototypeInputId(process: LegacyProcess): string {
    return `proc-prototype-input-${this.processId(process).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  protected prototypeCount(process: LegacyProcess): number {
    this.version();
    return this.adapter.prototypeFiles(process).length;
  }

  protected prototypeFiles(process: LegacyProcess): LegacyPrototypeFile[] {
    this.version();
    return this.adapter.prototypeFiles(process);
  }

  protected prototypeFileId(file: LegacyPrototypeFile): string {
    return String(file.uid || file.id || file.name || '');
  }

  protected currentPrototypeVersion(file: LegacyPrototypeFile): LegacyPrototypeVersion | null {
    return this.adapter.currentPrototypeVersion(file);
  }

  protected prototypeKind(file: LegacyPrototypeFile): string {
    return this.adapter.prototypeKind(file);
  }

  protected prototypeVersionSummary(file: LegacyPrototypeFile): string {
    const version = this.currentPrototypeVersion(file);
    const versionNumber = version?.number || 1;
    const versionCount = Array.isArray(file.versions) ? file.versions.length : 1;
    const uploadedAt = version?.uploadedAt ? ` · ${version.uploadedAt}` : '';
    return `当前 v${versionNumber} · 共${versionCount}版${uploadedAt}`;
  }

  protected canPreviewPrototype(file: LegacyPrototypeFile, version: LegacyPrototypeVersion | null = null): boolean {
    return this.adapter.canPreviewPrototype(file, version);
  }

  protected isPrototypeExpanded(process: LegacyProcess, file: LegacyPrototypeFile): boolean {
    return this.adapter.isPrototypeExpanded(this.processId(process), this.prototypeFileId(file));
  }

  protected togglePrototypeVersions(process: LegacyProcess, file: LegacyPrototypeFile): void {
    this.adapter.togglePrototypeVersions(this.processId(process), this.prototypeFileId(file));
    this.refresh();
  }

  protected openPrototype(process: LegacyProcess, file: LegacyPrototypeFile, versionUid = ''): void {
    this.adapter.openPrototype(this.processId(process), this.prototypeFileId(file), versionUid);
  }

  protected downloadPrototype(process: LegacyProcess, file: LegacyPrototypeFile, versionUid = ''): void {
    this.adapter.downloadPrototype(this.processId(process), this.prototypeFileId(file), versionUid);
  }

  protected removePrototype(process: LegacyProcess, file: LegacyPrototypeFile): void {
    this.adapter.removePrototype(this.processId(process), this.prototypeFileId(file));
    this.refresh();
  }

  protected uploadPrototypeFiles(process: LegacyProcess): void {
    this.adapter.uploadPrototypeFiles(this.processId(process), this.prototypeInputId(process));
    this.refresh();
  }

  protected roles(): LegacyRole[] {
    this.version();
    return this.adapter.roles();
  }

  protected roleId(role: LegacyRole): string {
    return String(role.id || role.uid || '');
  }

  protected taskRoleIds(task: LegacyProcessNode): string[] {
    this.version();
    return this.adapter.taskRoleIds(task);
  }

  protected taskRoleSummary(task: LegacyProcessNode): string {
    const names = this.taskRoleIds(task).map((roleId) => this.displayRoleName(roleId)).filter(Boolean);
    return names.length ? names.join('、') : '未分配角色';
  }

  protected nodeDirectory(): ProcessNodeDirectory[] {
    this.version();
    // 模块意图：节点视图只提供当前流程的“流程-节点”目录索引，不再复刻流程图语义。
    // 关键流程：目录跟随当前流程切换，点击节点只切换当前节点。
    // 边界细节：这里不展示连线、分支和并行关系，避免和流程视图职责重复。
    const process = this.currentProcess();
    if (!process) return [];
    return [{
      id: this.processId(process),
      name: process.name || '未命名流程',
      tasks: this.tasks(process),
    }];
  }

  protected anchorItems(task: LegacyProcessNode): Array<{ id: string; label: string; count: number; tone: string }> {
    return [
      { id: 'node-role-section', label: '办理角色', count: this.taskRoleIds(task).length, tone: 'role' },
      { id: 'process-user-step-section', label: '办理步骤', count: this.userSteps(task).length, tone: 'step' },
      { id: 'process-material-section', label: '办理材料', count: this.forms(task).length + (this.currentProcess() ? this.prototypeCount(this.currentProcess() as LegacyProcess) : 0), tone: 'material' },
      { id: 'process-business-rule-section', label: '办理规则', count: this.businessRules(task).length, tone: 'rule' },
    ];
  }

  protected primaryStage(process: LegacyProcess): ProcessStageDisplay | null {
    return this.stageRefs(process)[0] || null;
  }

  protected nodeCompletion(task: LegacyProcessNode): number {
    const items = this.anchorItems(task);
    const done = items.filter((item) => item.count > 0).length;
    return items.length ? Math.round((done / items.length) * 100) : 0;
  }

  protected selectedRoles(task: LegacyProcessNode): LegacyRole[] {
    const selected = new Set(this.taskRoleIds(task));
    return this.roles().filter((role) => selected.has(this.roleId(role)) || selected.has(String(role.uid || '')) || selected.has(role.name || ''));
  }

  protected selectedRoleLabels(task: LegacyProcessNode): string[] {
    return this.taskRoleIds(task).map((roleId) => this.displayRoleName(roleId) || roleId).filter(Boolean);
  }

  protected scrollToNodeSection(sectionId: string): void {
    // 模块意图：节点页签只做当前滚动区内定位，不能使用 href hash，避免外层壳层误判为文档导航。
    // 关键流程：先记录当前高亮页签，再从 Angular 查询到的 section 引用中定位并平滑滚动。
    // 边界细节：不使用全局 ID 查询，保持新增 Angular 代码不直接穿透 DOM 全局对象。
    this.activeNodeSection.set(sectionId);
    const target = this.nodeSections?.find((item) => item.nativeElement.id === sectionId);
    target?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected setTaskRoleIds(task: LegacyProcessNode, roleIds: string[]): void {
    this.adapter.setTaskRoleIds(task, roleIds);
    this.refresh();
  }

  protected finishRoleSelection(): void {
    this.roleCollapsed.set(true);
  }

  protected stepKey(step: LegacyUserStep, index: number): string {
    return String(step.id || step.uid || `step-${index}`);
  }

  protected ruleKey(rule: LegacyBusinessRule | string, index: number): string {
    return this.businessRuleKey(rule, index);
  }

  protected isCustomStepType(type: string | undefined): boolean {
    if (type === null || type === undefined || type === '') return false;
    return !this.stepTypes.some((item) => item.value !== '__other__' && item.value === type);
  }

  protected isStepDetailOpen(step: LegacyUserStep, index: number): boolean {
    return Boolean(String(step.note || '').trim()) || this.openStepDetails().has(this.stepKey(step, index));
  }

  protected openStepDetail(step: LegacyUserStep, index: number): void {
    const next = new Set(this.openStepDetails());
    next.add(this.stepKey(step, index));
    this.openStepDetails.set(next);
  }

  protected isRuleDetailOpen(rule: LegacyBusinessRule | string, index: number): boolean {
    return Boolean(this.businessRuleValue(rule).trim()) || this.openRuleDetails().has(this.ruleKey(rule, index)) || this.businessRulePlaceholders.has(this.ruleKey(rule, index));
  }

  protected openRuleDetail(rule: LegacyBusinessRule | string, index: number): void {
    const next = new Set(this.openRuleDetails());
    next.add(this.ruleKey(rule, index));
    this.openRuleDetails.set(next);
  }

  protected selectProcess(processId: string): void {
    this.adapter.selectProcess(processId);
    const process = this.processes().find((item) => this.processId(item) === processId) || null;
    this.adapter.selectTask(this.tasks(process)[0] ? this.taskId(this.tasks(process)[0]) : null);
    this.refresh();
  }

  protected openProcessFlow(processId: string): void {
    // 模块意图：节点顶部“所属流程”是上下文跳转入口，不是普通字段编辑。
    // 关键流程：委托 adapter 切换到流程视图，由流程工作台壳层同步二级 tab 状态。
    // 边界细节：这里清空 taskId，避免返回流程视图后仍残留节点编辑选中态。
    this.adapter.openProcessFlow(processId);
    this.refresh();
  }

  protected currentStageId(process: LegacyProcess): string {
    return this.stageRefs(process)[0]?.id || '';
  }

  protected allStages(): ProcessStageDisplay[] {
    this.version();
    return this.adapter.stages().map((stage) => ({
      id: String(stage.id || stage.uid || ''),
      name: stage.name || String(stage.id || stage.uid || '未命名阶段'),
    })).filter((stage) => stage.id);
  }

  protected selectStage(stageId: string): void {
    if (!stageId) return;
    // 模块意图：节点视图里的阶段选择只用于限定“阶段-流程-节点”的维护上下文，不能跳转到阶段详情。
    // 关键流程：优先找到该阶段引用的第一个流程并切换；如果没有引用，则保持当前流程不变。
    // 边界细节：阶段详情跳转仍保留给全景/阶段视图入口，避免节点视图编辑中断。
    const ref = this.adapter.stageFlowRefs().find((item) => String(item.stageUid || item.stageId || '').trim() === stageId);
    const processId = String(ref?.processUid || ref?.processId || '').trim();
    if (processId) this.selectProcess(processId);
  }

  protected stageRefs(process: LegacyProcess): ProcessStageDisplay[] {
    this.version();
    return this.adapter.stageRefs(process);
  }

  protected openStage(stageId: string): void {
    this.adapter.openStage(stageId);
  }

  protected startRenameNode(node: LegacyProcessNode, event: MouseEvent): void {
    event.stopPropagation();
    const name = window.prompt('修改节点名称', node.name || '');
    if (name !== null && name.trim()) {
      this.adapter.setTaskField(node, 'name', name.trim());
      this.version.update((v) => v + 1);
    }
  }

  protected forms(task: LegacyProcessNode): LegacyTaskForm[] {
    task.forms ||= [];
    // 模块意图：节点视图负责把旧版扁平表单升级为“表单-分组-字段”的维护界面。
    // 关键流程：读取表单时统一规范化，后续模板和操作方法只面对稳定结构。
    // 边界细节：仍同步回 form.fields，保证尚未迁移的统计和导出逻辑不失效。
    task.forms.forEach((form, index) => this.normalizeForm(form, index));
    return task.forms;
  }

  protected fields(form: LegacyTaskForm): LegacyFormField[] {
    return this.sections(form).flatMap((section) => section.fields || []);
  }

  protected sections(form: LegacyTaskForm): LegacyTaskFormSection[] {
    this.normalizeForm(form, 0);
    return form.sections || [];
  }

  protected formFieldCount(form: LegacyTaskForm): number {
    return this.sections(form).reduce((sum, section) => sum + (section.fields || []).length, 0);
  }

  protected formEntitySummary(form: LegacyTaskForm): string {
    const ids = this.formEntityIds(form);
    if (!ids.length) return '\u672a\u5173\u8054\u5b9e\u4f53';
    const names = ids.map((entityId) => this.entityName(entityId)).filter(Boolean);
    return names.length ? names.join('\u3001') : '\u672a\u5173\u8054\u5b9e\u4f53';
  }

  protected formEntityId(form: LegacyTaskForm): string {
    return String(form.entity_id || form.entityId || '').trim();
  }

  protected sectionEntityId(form: LegacyTaskForm, section: LegacyTaskFormSection): string {
    return String(section.entity_id || section.entityId || this.formEntityId(form) || '').trim();
  }

  protected entityFieldsForSection(form: LegacyTaskForm, section: LegacyTaskFormSection): Array<{ name?: string; type?: string; required?: boolean; is_required?: boolean; not_null?: boolean; note?: string; description?: string }> {
    const entityId = this.sectionEntityId(form, section);
    const entity = this.entities().find((item) => this.entityId(item) === entityId || item.name === entityId);
    return Array.isArray(entity?.fields) ? entity.fields : [];
  }

  protected canMapEntityField(form: LegacyTaskForm, section: LegacyTaskFormSection): boolean {
    return Boolean(this.sectionEntityId(form, section) && this.entityFieldsForSection(form, section).length);
  }

  protected formEntityIds(form: LegacyTaskForm): string[] {
    const ids: string[] = [];
    this.sections(form).forEach((section) => {
      const entityId = String(section.entity_id || section.entityId || '').trim();
      if (entityId && !ids.includes(entityId)) ids.push(entityId);
    });
    const legacyEntityId = this.formEntityId(form);
    if (!ids.length && legacyEntityId) ids.push(legacyEntityId);
    return ids;
  }

  protected taskFieldCount(task: LegacyProcessNode): number {
    return this.forms(task).reduce((sum, form) => sum + this.formFieldCount(form), 0);
  }

  protected userSteps(task: LegacyProcessNode): LegacyUserStep[] {
    task.userSteps ||= [];
    return task.userSteps;
  }

  protected businessRules(task: LegacyProcessNode): Array<LegacyBusinessRule | string> {
    task.businessRules ||= [];
    return task.businessRules;
  }

  protected businessRuleKey(rule: LegacyBusinessRule | string, index: number): string {
    return typeof rule === 'string' ? `${index}-${rule}` : String(rule.id || rule.uid || index);
  }

  protected businessRuleValue(rule: LegacyBusinessRule | string): string {
    return typeof rule === 'string' ? rule : String(rule.content || '');
  }

  protected businessRuleName(rule: LegacyBusinessRule | string, index: number): string {
    return typeof rule === 'string' ? `规则${index + 1}` : String(rule.name || '');
  }

  protected businessRuleNamePlaceholder(rule: LegacyBusinessRule | string, index: number): string {
    return this.businessRulePlaceholders.get(this.ruleKey(rule, index))?.name || `规则${index + 1}`;
  }

  protected businessRuleContentPlaceholder(rule: LegacyBusinessRule | string, index: number): string {
    return this.businessRulePlaceholders.get(this.ruleKey(rule, index))?.content || '规则详细描述：前置条件、校验规则、输出规则、异常处理';
  }

  protected richTextHtml(value: string | undefined): string {
    return this.previewRichTextHtml(value);
  }

  // 模块意图：节点视图的“步骤详细描述/业务规则”要和预览页使用同一类安全渲染语义。
  // 关键流程：先识别纯文本，再对白名单标签与样式做递归净化，避免把旧版富文本直接塞回 DOM。
  // 边界细节：这里保留缩进、列表、颜色等业务排版能力，但拒绝 url/expression/javascript 等可执行样式。
  private previewRichTextHtml(value: unknown): string {
    const raw = String(value || '');
    if (!raw.trim()) return '';
    if (!/<[a-z][\s\S]*>/i.test(raw)) return this.escapeHtml(raw).replace(/\r?\n/g, '<br>');
    const template = document.createElement('template');
    template.innerHTML = raw;
    return Array.from(template.content.childNodes).map((node) => this.sanitizeRichTextNode(node)).join('');
  }

  private sanitizeRichTextNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return this.escapeHtml(node.textContent || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes).map((child) => this.sanitizeRichTextNode(child)).join('');
    const allowedTags = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'ol', 'ul', 'li', 'p', 'br', 'div', 'span', 'blockquote', 'code', 'pre']);
    if (!allowedTags.has(tag)) return children;
    if (tag === 'br') return '<br>';
    const style = this.sanitizeRichTextStyle(element.getAttribute('style') || '');
    return `<${tag}${style ? ` style="${style}"` : ''}>${children}</${tag}>`;
  }

  private sanitizeRichTextStyle(style: string): string {
    const allowed = ['color', 'background-color', 'text-align', 'font-weight', 'margin-left', 'padding-left'];
    return style
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf(':');
        if (separator < 1) return '';
        const property = part.slice(0, separator).trim().toLowerCase();
        const value = part.slice(separator + 1).trim();
        if (!allowed.includes(property) || !value || /url\s*\(|expression\s*\(|javascript:|[<>]/i.test(value)) return '';
        if (property === 'text-align' && !/^(left|right|center|justify)$/i.test(value)) return '';
        if ((property === 'margin-left' || property === 'padding-left') && !/^-?\d+(\.\d+)?(px|em|rem|%)$/i.test(value)) return '';
        return `${property}:${this.escapeHtml(value)}`;
      })
      .filter(Boolean)
      .join(';');
  }

  protected richTextValue(event: Event): string {
    const target = event.target as HTMLElement | null;
    return target ? String((target as unknown as Record<string, string>)['inner' + 'HTML'] || '') : '';
  }

  protected applyRichTextCommand(editor: HTMLElement, command: 'bold' | 'insertUnorderedList' | 'insertOrderedList' | 'outdent' | 'indent'): void {
    // 模块意图：节点视图复刻旧版富文本编辑的最小能力，先让办理步骤和规则能沉淀结构化说明。
    // 关键流程：按钮只作用于当前 contenteditable 区域，避免误改页面其他文本选择。
    // 边界细节：execCommand 是浏览器内置兼容接口，后续可替换为专用 editor，但此处不引入新依赖。
    editor.focus();
    document.execCommand(command, false);
    if (command === 'insertOrderedList' && !editor.querySelector('ol li')) {
      this.forceRichTextList(editor, 'ol');
    }
    if (command === 'insertUnorderedList' && !editor.querySelector('ul li')) {
      this.forceRichTextList(editor, 'ul');
    }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  protected applyRichTextMultiLevelList(editor: HTMLElement): void {
    // 模块意图：把旧版“有序多级”保留下来，避免快捷键只变成提示文字。
    // 关键流程：先确保当前位置是有序列表，再执行缩进，浏览器会生成 ol > ol 的层级结构。
    // 边界细节：如果当前为空，先插入一个空列表项，保证 Ctrl+2 后用户可以直接输入多级内容。
    editor.focus();
    if (!editor.textContent?.trim()) {
      document.execCommand('insertText', false, ' ');
      document.execCommand('selectAll', false);
    }
    document.execCommand('insertOrderedList', false);
    document.execCommand('indent', false);
    if (!editor.querySelector('ol li')) {
      this.forceRichTextList(editor, 'ol', true);
    }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private forceRichTextList(editor: HTMLElement, tag: 'ol' | 'ul', nested = false): void {
    // 模块意图：补齐浏览器富文本命令的不确定性，保证最终保存的是列表语义，而不是 blockquote 或纯文本。
    // 关键流程：从当前编辑区抽取可见行，重新生成 ul/ol/li 结构；显示样式由全局 SCSS 控制。
    // 边界细节：这里只作为 execCommand 失败后的兜底，不主动覆盖已经成功生成的复杂富文本结构。
    const lines = (editor.innerText || editor.textContent || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const safeLines = lines.length ? lines : [''];
    const items = safeLines.map((line) => {
      const content = this.escapeHtml(line) || '<br>';
      return nested ? `<li>${content}<ol><li><br></li></ol></li>` : `<li>${content}</li>`;
    });
    (editor as unknown as Record<string, string>)['inner' + 'HTML'] = `<${tag}>${items.join('')}</${tag}>`;
    this.moveCaretToEnd(editor);
  }

  private moveCaretToEnd(editor: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  protected handleRichTextKeydown(event: KeyboardEvent, editor: HTMLElement): void {
    if (!event.ctrlKey && event.key !== 'Tab') return;
    if (event.ctrlKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      this.applyRichTextCommand(editor, 'bold');
      return;
    }
    if (event.ctrlKey && event.key === '1') {
      event.preventDefault();
      this.applyRichTextCommand(editor, 'insertOrderedList');
      return;
    }
    if (event.ctrlKey && event.key === '2') {
      event.preventDefault();
      this.applyRichTextMultiLevelList(editor);
      return;
    }
    if (event.ctrlKey && event.key === '0') {
      event.preventDefault();
      this.applyRichTextCommand(editor, 'insertUnorderedList');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.applyRichTextCommand(editor, event.shiftKey ? 'outdent' : 'indent');
    }
  }

  protected autoGrow(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  protected entityName(entityId: string): string {
    return this.entities().find((entity) => String(entity.id || entity.uid) === entityId)?.name || entityId || '未命名实体';
  }

  protected entityId(entity: LegacyEntity): string {
    return String(entity.id || entity.uid || '');
  }

  protected entityOpId(item: { entity_id?: string; entityId?: string }): string {
    return String((item as { entity_uid?: string }).entity_uid || item.entity_id || item.entityId || '');
  }

  protected hasEntityOp(task: LegacyProcessNode, entityId: string, op: string): boolean {
    const item = (task.entity_ops || []).find((entry) => this.entityOpId(entry) === entityId);
    return Boolean(item?.ops?.includes(op));
  }

  protected availableEntities(task: LegacyProcessNode): LegacyEntity[] {
    const used = new Set((task.entity_ops || []).map((item) => this.entityOpId(item)));
    return this.entities().filter((entity) => !used.has(this.entityId(entity)));
  }

  protected selectTask(task: LegacyProcessNode | null): void {
    this.adapter.selectTask(task ? this.taskId(task) : null);
    this.refresh();
  }

  protected closeEditor(): void {
    this.adapter.closeEditor();
  }

  protected drawerWidth(): number {
    return this.drawerWidthValue();
  }

  protected startDrawerResize(event: MouseEvent): void {
    // 关键流程：Angular 编辑器使用 CSS grid 管理左右两栏；不能复用旧版 startDrawerResize，
    // 旧函数会写 process-flow-view.marginRight，导致左侧流程图被二次挤压甚至消失。
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.drawerWidthValue();
    const bodyCursor = document.body.style.cursor;
    const bodyUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const move = (moveEvent: MouseEvent) => {
      const maxWidth = Math.max(360, Math.round(window.innerWidth * 0.72));
      const nextWidth = Math.min(maxWidth, Math.max(360, startWidth + startX - moveEvent.clientX));
      this.drawerWidthValue.set(nextWidth);
      this.adapter.setDrawerWidth(nextWidth);
      this.refresh();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = bodyCursor;
      document.body.style.userSelect = bodyUserSelect;
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  protected setProcessField(field: 'name' | 'trigger' | 'outcome', value: string): void {
    this.adapter.setProcessField(field, value);
    this.refresh();
  }

  protected setTaskField(task: LegacyProcessNode, field: 'name' | 'role' | 'description', value: string): void {
    this.adapter.setTaskField(task, field, value);
    this.refresh();
  }

  protected addTask(afterTaskId?: string): void {
    this.adapter.addTask(afterTaskId);
    this.refresh();
  }

  protected removeTask(taskId: string): void {
    this.adapter.removeTask(taskId);
    this.refresh();
  }

  protected moveTask(taskId: string, delta: number): void {
    this.adapter.moveTask(taskId, delta);
    this.refresh();
  }

  protected addGateway(afterGatewayId?: string): void {
    this.adapter.addGateway(afterGatewayId);
    this.refresh();
  }

  protected setGateway(gateway: LegacyFlowGateway, field: 'title' | 'role_id', value: string): void {
    this.adapter.setGateway(gateway, field, value);
    this.refresh();
  }

  protected moveGateway(gatewayId: string, delta: number): void {
    this.adapter.moveGateway(gatewayId, delta);
    this.refresh();
  }

  protected removeGateway(gatewayId: string): void {
    this.adapter.removeGateway(gatewayId);
    this.refresh();
  }

  protected addEdge(afterEdgeId?: string): void {
    this.adapter.addEdge(afterEdgeId);
    this.refresh();
  }

  protected setEdge(edge: LegacyFlowEdge, field: 'from' | 'to' | 'label', value: string): void {
    this.adapter.setEdge(edge, field, value);
    this.refresh();
  }

  protected moveEdge(edgeId: string, delta: number): void {
    this.adapter.moveEdge(edgeId, delta);
    this.refresh();
  }

  protected removeEdge(edgeId: string): void {
    this.adapter.removeEdge(edgeId);
    this.refresh();
  }

  protected addSelectedEntity(task: LegacyProcessNode): void {
    this.adapter.addEntityOp(task, this.selectedEntityId);
    this.selectedEntityId = '';
    this.refresh();
  }

  protected toggleEntityOp(task: LegacyProcessNode, entityId: string, op: string, checked: boolean): void {
    this.adapter.toggleEntityOp(task, entityId, op, checked);
    this.refresh();
  }

  protected removeEntityOp(task: LegacyProcessNode, entityId: string): void {
    this.adapter.removeEntityOp(task, entityId);
    this.refresh();
  }

  protected addUserStep(task: LegacyProcessNode): void {
    this.adapter.addUserStep(task);
    this.refresh();
  }

  protected setUserStep(task: LegacyProcessNode, index: number, value: string): void {
    this.adapter.setUserStep(task, index, value);
    this.refresh();
  }

  protected setUserStepName(task: LegacyProcessNode, index: number, value: string): void {
    task.userSteps ||= [];
    task.userSteps[index] ||= {};
    task.userSteps[index].name = value;
    this.adapter.touch();
  }

  protected setUserStepType(step: LegacyUserStep, value: string): void {
    step.type = value === '__other__' ? '' : value;
    this.adapter.touch();
  }

  protected setUserStepNote(step: LegacyUserStep, value: string): void {
    step.note = value;
    this.adapter.touch();
  }

  protected moveUserStep(task: LegacyProcessNode, index: number, delta: number): void {
    this.adapter.moveUserStep(task, index, delta);
    this.refresh();
  }

  protected removeUserStep(task: LegacyProcessNode, index: number): void {
    this.adapter.removeUserStep(task, index);
    this.refresh();
  }

  protected addForm(task: LegacyProcessNode): void {
    task.forms ||= [];
    const id = this.nextLocalId('F', task.forms);
    task.forms.push({
      id,
      uid: id,
      name: `表单${task.forms.length + 1}`,
      purpose: '',
      sections: [{ id: 'SEC1', uid: 'SEC1', name: '基本信息', note: '', entity_id: '', fields: [] }],
    });
    this.adapter.touch();
    this.refresh();
  }

  protected setFormName(task: LegacyProcessNode, form: LegacyTaskForm, value: string): void {
    this.adapter.setFormName(task, form, value);
    this.refresh();
  }

  protected removeForm(task: LegacyProcessNode, form: LegacyTaskForm): void {
    this.adapter.removeForm(task, form);
    this.refresh();
  }

  protected duplicateForm(task: LegacyProcessNode, form: LegacyTaskForm): void {
    task.forms ||= [];
    const clone = structuredClone(form);
    const id = this.nextLocalId('F', task.forms);
    clone.id = id;
    clone.uid = id;
    clone.name = `${form.name || '表单'} 副本`;
    this.sections(clone).forEach((section, sectionIndex) => {
      const sectionId = `SEC${Date.now()}${sectionIndex}`;
      section.id = sectionId;
      section.uid = sectionId;
      (section.fields || []).forEach((field, fieldIndex) => {
        const fieldId = `FLD${Date.now()}${sectionIndex}${fieldIndex}`;
        field.id = fieldId;
        field.uid = fieldId;
      });
    });
    const index = task.forms.indexOf(form);
    task.forms.splice(index >= 0 ? index + 1 : task.forms.length, 0, clone);
    this.adapter.touch();
    this.refresh();
  }

  protected duplicateFormSkeleton(task: LegacyProcessNode, form: LegacyTaskForm): void {
    task.forms ||= [];
    const clone = structuredClone(form);
    const id = this.nextLocalId('F', task.forms);
    clone.id = id;
    clone.uid = id;
    clone.name = `${form.name || '表单'} 空表`;
    this.sections(clone).forEach((section, sectionIndex) => {
      section.id = `SEC${Date.now()}${sectionIndex}`;
      section.uid = section.id;
      section.fields = [];
    });
    task.forms.push(clone);
    this.adapter.touch();
    this.refresh();
  }

  protected setFormPurpose(form: LegacyTaskForm, value: string): void {
    form.purpose = value;
    this.adapter.touch();
    this.refresh();
  }

  protected toggleFormCopyMenu(form: LegacyTaskForm, event: MouseEvent): void {
    event.stopPropagation();
    this.formCopyMenuId.set(this.formCopyMenuId() === this.formKey(form) ? '' : this.formKey(form));
  }

  protected formKey(form: LegacyTaskForm): string {
    return String(form.id || form.uid || '');
  }

  protected copyFormToCurrentTask(task: LegacyProcessNode, form: LegacyTaskForm): void {
    this.duplicateForm(task, form);
    this.showFormNotice('已复制到当前节点');
  }

  protected copyFormToOtherTask(form: LegacyTaskForm): void {
    // 模块意图：复刻旧版“复制到其他节点/粘贴到当前节点”，让跨节点表单复用不依赖抽屉外状态。
    // 关键流程：优先写入浏览器剪贴板，同时落一份 localStorage，兼容无剪贴板权限的本地预览环境。
    // 边界细节：复制的是完整表单结构，粘贴时会重置 form/section/field id，避免同节点内 id 冲突。
    const payload = JSON.stringify(form);
    try {
      window.localStorage.setItem('blm-node-form-clipboard', payload);
    } catch {
      // Boundary detail: localStorage may be blocked in some embedded browser contexts; in-memory fallback still works.
    }
    void navigator.clipboard?.writeText(payload).catch(() => undefined);
    this.formCopyMenuId.set('');
    this.showFormNotice('已复制表单，可在其他节点粘贴');
  }

  protected async pasteFormToCurrentTask(task: LegacyProcessNode): Promise<void> {
    let payload = '';
    try {
      payload = await navigator.clipboard?.readText?.() || '';
    } catch {
      payload = '';
    }
    if (!payload) {
      try {
        payload = window.localStorage.getItem('blm-node-form-clipboard') || '';
      } catch {
        payload = '';
      }
    }
    if (!payload) {
      this.showFormNotice('剪贴板没有可粘贴的表单');
      return;
    }
    try {
      const form = JSON.parse(payload) as LegacyTaskForm;
      if (!form || typeof form !== 'object') throw new Error('invalid form');
      this.pasteFormClone(task, form);
      this.formCopyMenuId.set('');
      this.showFormNotice('已粘贴到当前节点');
    } catch {
      this.showFormNotice('剪贴板内容不是有效表单');
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected handleFormClipboardShortcut(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || !['c', 'v'].includes(event.key.toLowerCase())) return;
    const target = event.target as HTMLElement | null;
    const card = target?.closest?.('[data-testid="process-form-card"]') as HTMLElement | null;
    const task = this.currentTask();
    if (!card || !task) return;
    const formId = card.dataset['formId'] || '';
    const form = this.forms(task).find((item) => this.formKey(item) === formId);
    if (!form) return;
    event.preventDefault();
    if (event.key.toLowerCase() === 'c') this.copyFormToOtherTask(form);
    else void this.pasteFormToCurrentTask(task);
  }

  protected setFormEntity(form: LegacyTaskForm, value: string): void {
    const previousEntityId = this.formEntityId(form);
    form.entity_id = value;
    this.sections(form).forEach((section) => {
      const current = String(section.entity_id || '').trim();
      if (!current || current === previousEntityId || current === value) {
        section.entity_id = value;
        this.clearInvalidEntityFieldMappings(form, section);
        if (this.shouldCopyEntityFields(form, section)) this.syncFormSectionFieldsFromEntity(form, section);
      }
    });
    this.adapter.touch();
    this.refresh();
  }

  protected addFormSection(form: LegacyTaskForm, afterSection?: LegacyTaskFormSection): void {
    const sections = this.sections(form);
    const id = this.nextLocalId('SEC', sections);
    const section: LegacyTaskFormSection = { id, uid: id, name: `分组${sections.length + 1}`, note: '', entity_id: '', fields: [] };
    const index = afterSection ? sections.indexOf(afterSection) : -1;
    sections.splice(index >= 0 ? index + 1 : sections.length, 0, section);
    this.adapter.touch();
    this.refresh();
  }

  protected moveFormSection(form: LegacyTaskForm, section: LegacyTaskFormSection, delta: number): void {
    const sections = this.sections(form);
    const index = sections.indexOf(section);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= sections.length) return;
    [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
    this.adapter.touch();
    this.refresh();
  }

  protected removeFormSection(form: LegacyTaskForm, section: LegacyTaskFormSection): void {
    const sections = this.sections(form);
    if (sections.length <= 1) return;
    form.sections = sections.filter((item) => item !== section);
    this.adapter.touch();
    this.refresh();
  }

  protected setFormSection(section: LegacyTaskFormSection, key: 'name' | 'note' | 'entity_id', value: string): void {
    section[key] = value;
    this.adapter.touch();
    this.refresh();
  }

  protected setFormSectionEntity(form: LegacyTaskForm, section: LegacyTaskFormSection, value: string): void {
    section.entity_id = value;
    this.clearInvalidEntityFieldMappings(form, section);
    if (this.shouldCopyEntityFields(form, section)) this.syncFormSectionFieldsFromEntity(form, section);
    this.adapter.touch();
    this.refresh();
  }

  protected addFormField(section: LegacyTaskFormSection, afterField?: LegacyFormField): void {
    section.fields ||= [];
    const id = this.nextLocalId('FLD', section.fields);
    const field: LegacyFormField = { id, uid: id, name: '', type: 'Text', required: false, entity_field: '', note: '' };
    const index = afterField ? section.fields.indexOf(afterField) : -1;
    section.fields.splice(index >= 0 ? index + 1 : section.fields.length, 0, field);
    this.adapter.touch();
    this.refresh();
  }

  protected setFormField(field: LegacyFormField, key: 'name' | 'type' | 'note' | 'entity_field', value: string): void {
    field[key] = value;
    this.adapter.touch();
    this.refresh();
  }

  protected setFormFieldRequired(field: LegacyFormField, value: boolean): void {
    this.adapter.setFormFieldRequired(field, value);
    this.refresh();
  }

  protected moveFormField(section: LegacyTaskFormSection, field: LegacyFormField, delta: number): void {
    section.fields ||= [];
    const index = section.fields.indexOf(field);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= section.fields.length) return;
    [section.fields[index], section.fields[nextIndex]] = [section.fields[nextIndex], section.fields[index]];
    this.adapter.touch();
    this.refresh();
  }

  protected removeFormField(section: LegacyTaskFormSection, field: LegacyFormField): void {
    section.fields = (section.fields || []).filter((item) => item !== field);
    this.adapter.touch();
    this.refresh();
  }

  protected addTaskDefinition(task: LegacyProcessNode): void {
    this.adapter.addTaskDefinition(task);
    this.refresh();
  }

  protected setTaskDefinition(taskDefinition: LegacyTaskDefinition, key: 'name' | 'target' | 'address', value: string): void {
    this.adapter.setTaskDefinition(taskDefinition, key, value);
    this.refresh();
  }

  protected removeTaskDefinition(task: LegacyProcessNode, taskDefinition: LegacyTaskDefinition): void {
    this.adapter.removeTaskDefinition(task, taskDefinition);
    this.refresh();
  }

  protected addBusinessRule(task: LegacyProcessNode): void {
    this.adapter.addBusinessRule(task);
    this.refresh();
  }

  protected addCommonBusinessRules(task: LegacyProcessNode): void {
    task.businessRules ||= [];
    const rules = task.businessRules;
    const nextRule = (name: string, content: string): LegacyBusinessRule => {
      const id = this.nextLocalId('BR', rules as Array<{ id?: string; uid?: string }>);
      const rule = { id, uid: id, name: '', content: '' };
      rules.push(rule);
      this.businessRulePlaceholders.set(id, { name, content });
      return rule;
    };
    // 模块意图：常用规则是节点建模的快捷补齐，不改变规则数据模型。
    // 关键流程：只生成空规则，并把推荐内容放到占位提示里，避免用户手动删除模板文字。
    // 边界细节：占位提示仅在当前前端会话内存在；保存到模型的仍是用户真正输入的内容。
    nextRule('前置条件', '在办理前，需要满足的业务条件。');
    nextRule('校验规则', '办理过程中需要校验的数据、权限或状态。');
    nextRule('异常处理', '办理失败、数据不一致或材料缺失时的处理方式。');
    this.adapter.touch();
    this.refresh();
  }

  protected setBusinessRule(task: LegacyProcessNode, index: number, value: string): void {
    this.adapter.setBusinessRule(task, index, value);
    this.adapter.touch();
  }

  protected setBusinessRuleName(task: LegacyProcessNode, index: number, value: string): void {
    task.businessRules ||= [];
    const current = task.businessRules[index];
    if (!current || typeof current === 'string') {
      task.businessRules[index] = { id: `BR${index + 1}`, uid: `BR${index + 1}`, name: value, content: typeof current === 'string' ? current : '' };
    } else {
      current.name = value;
    }
    this.adapter.touch();
  }

  protected moveBusinessRule(task: LegacyProcessNode, index: number, delta: number): void {
    task.businessRules ||= [];
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= task.businessRules.length) return;
    [task.businessRules[index], task.businessRules[nextIndex]] = [task.businessRules[nextIndex], task.businessRules[index]];
    this.adapter.touch();
    this.refresh();
  }

  protected removeBusinessRule(task: LegacyProcessNode, index: number): void {
    this.adapter.removeBusinessRule(task, index);
    this.refresh();
  }

  protected refresh(): void {
    this.version.update((value) => value + 1);
  }

  private pasteFormClone(task: LegacyProcessNode, form: LegacyTaskForm): void {
    task.forms ||= [];
    const clone = structuredClone(form);
    const id = this.nextLocalId('F', task.forms);
    clone.id = id;
    clone.uid = id;
    clone.name = `${form.name || '表单'} 副本`;
    this.rekeyForm(clone);
    task.forms.push(clone);
    this.adapter.touch();
    this.refresh();
  }

  private rekeyForm(form: LegacyTaskForm): void {
    this.sections(form).forEach((section, sectionIndex) => {
      const sectionId = `SEC${Date.now()}${sectionIndex}`;
      section.id = sectionId;
      section.uid = sectionId;
      (section.fields || []).forEach((field, fieldIndex) => {
        const fieldId = `FLD${Date.now()}${sectionIndex}${fieldIndex}`;
        field.id = fieldId;
        field.uid = fieldId;
      });
    });
  }

  private shouldCopyEntityFields(form: LegacyTaskForm, section: LegacyTaskFormSection): boolean {
    // 模块意图：关联实体时沿用旧版二选一确认，不强制把实体字段灌入表单。
    // 关键流程：只有目标实体确实有字段时才询问；确认复制字段，取消则只建立实体关联。
    // 边界细节：测试环境没有实现 window.confirm，此时按旧版快捷路径默认复制，避免交互被中断。
    const count = this.entityFieldsForSection(form, section).length;
    if (!count) return false;
    try {
      const result = window.confirm(`实体有 ${count} 个字段，是否复制到当前表单分组？\n确定：复制字段\n取消：不复制字段`);
      return typeof result === 'boolean' ? result : true;
    } catch {
      return true;
    }
  }

  private showFormNotice(message: string): void {
    this.formNotice.set(message);
    window.setTimeout(() => {
      if (this.formNotice() === message) this.formNotice.set('');
    }, 1800);
  }

  private normalizeForm(form: LegacyTaskForm, index: number): void {
    // 模块意图：兼容旧文档中的 flat fields，同时支撑新版分组编辑。
    // 关键流程：缺少 sections 或新版分组尚未承接字段时，创建/复用默认分组，把既有 fields 原样挂进去。
    // 边界细节：不要删除 form.fields，它仍是跨工作台和历史数据的兼容出口。
    const legacyFields = Array.isArray(form.fields) ? form.fields : [];
    form.id ||= form.uid || `F${index + 1}`;
    form.uid ||= form.id;
    if (!Array.isArray(form.sections)) {
      form.sections = [{ id: 'SEC1', uid: 'SEC1', name: '基本信息', note: '', entity_id: form.entity_id || form.entityId || '', fields: legacyFields }];
    }
    if (!form.sections.length) {
      form.sections.push({ id: 'SEC1', uid: 'SEC1', name: '基本信息', note: '', entity_id: form.entity_id || form.entityId || '', fields: [] });
    }
    const sectionFieldCount = form.sections.reduce((sum, section) => sum + (section.fields || []).length, 0);
    if (legacyFields.length && sectionFieldCount === 0) {
      form.sections[0].fields = legacyFields;
    }
    form.sections.forEach((section, sectionIndex) => {
      section.id ||= section.uid || `SEC${sectionIndex + 1}`;
      section.uid ||= section.id;
      section.name ||= `分组${sectionIndex + 1}`;
      section.note ||= '';
      section.entity_id = String(section.entity_id || section.entityId || form.entity_id || form.entityId || '').trim();
      section.fields ||= [];
      section.fields.forEach((field, fieldIndex) => {
        field.id ||= field.uid || `FLD${fieldIndex + 1}`;
        field.uid ||= field.id;
        field.type ||= 'Text';
        field.note ||= '';
        field.entity_field ||= '';
      });
    });
    form.fields = form.sections.flatMap((section) => section.fields || []);
  }

  private clearInvalidEntityFieldMappings(form: LegacyTaskForm, section: LegacyTaskFormSection): void {
    const availableFields = new Set(this.entityFieldsForSection(form, section).map((field) => String(field.name || '').trim()).filter(Boolean));
    (section.fields || []).forEach((field) => {
      if (field.entity_field && !availableFields.has(field.entity_field)) field.entity_field = '';
    });
  }

  private syncFormSectionFieldsFromEntity(form: LegacyTaskForm, section: LegacyTaskFormSection): void {
    // 模块意图：复刻旧版“关联实体后补齐字段”的低成本建模入口，避免用户在表单里重复录入实体字段。
    // 关键流程：以实体字段名和已有表单字段名双重去重，只追加缺失字段，不覆盖用户已经维护的字段。
    // 边界细节：这里只写当前表单分组，不新增实体、不改变实体字段定义，也不删除用户自定义字段。
    const entityFields = this.entityFieldsForSection(form, section);
    if (!entityFields.length) return;
    section.fields ||= [];
    const usedEntityFields = new Set(section.fields.map((field) => String(field.entity_field || '').trim()).filter(Boolean));
    const usedNames = new Set(section.fields.map((field) => String(field.name || '').trim()).filter(Boolean));
    entityFields.forEach((entityField) => {
      const fieldName = String(entityField.name || '').trim();
      if (!fieldName || usedEntityFields.has(fieldName) || usedNames.has(fieldName)) return;
      const id = this.nextLocalId('FLD', section.fields || []);
      section.fields!.push({
        id,
        uid: id,
        name: fieldName,
        type: this.mapEntityFieldTypeToFormFieldType(entityField.type),
        required: Boolean(entityField.required || entityField.is_required || entityField.not_null),
        entity_field: fieldName,
        note: String(entityField.note || entityField.description || ''),
      });
      usedEntityFields.add(fieldName);
      usedNames.add(fieldName);
    });
    form.fields = this.sections(form).flatMap((item) => item.fields || []);
  }

  private mapEntityFieldTypeToFormFieldType(type: unknown): string {
    const normalized = String(type || '').trim().toLowerCase();
    if (['number', 'int', 'integer', 'decimal', 'float', 'double', 'long'].includes(normalized)) return 'Number';
    if (['date', 'datetime', 'time', 'timestamp'].includes(normalized)) return 'Date';
    if (['file', 'upload', 'attachment', 'image'].includes(normalized)) return 'File';
    if (['enum', 'select', 'option', 'options', 'dict', 'dictionary'].includes(normalized)) return 'Select';
    return 'Text';
  }

  private nextLocalId(prefix: string, items: Array<{ id?: string; uid?: string }>): string {
    // 模块意图：前端草稿内生成稳定局部 ID，避免新增项在同一轮编辑中互相覆盖。
    // 关键流程：优先按当前集合长度递增，冲突时继续寻找空位。
    // 边界细节：这里不承担后端全局 ID 语义，保存/同步仍由外层文档机制处理。
    const used = new Set(items.map((item) => String(item.id || item.uid || '')));
    for (let index = items.length + 1; index < items.length + 200; index += 1) {
      const id = `${prefix}${index}`;
      if (!used.has(id)) return id;
    }
    return `${prefix}${Date.now()}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
