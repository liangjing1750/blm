import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LegacyFlowEdge,
  LegacyFlowGateway,
  LegacyProcess,
  LegacyProcessNode,
  LegacyRole,
  createProcessEditorLegacyAdapter,
} from '../editor/process-editor-legacy-adapter';
import { ProcessEditorWorkbenchComponent } from '../editor/process-editor-workbench.component';
import { ProcessFlowWorkbenchComponent } from '../flow/process-flow-workbench.component';
import { ProcessStageWorkbenchComponent } from '../stage/process-stage-workbench.component';
import { ValueDomainWorkbenchComponent } from '../value-domain/value-domain-workbench.component';
import { getAngularRuntimeState } from '../../../core/runtime/angular-runtime';
import {
  ProcessShellView,
  ProcessWorkbenchShellLegacyAdapter,
  createProcessWorkbenchShellLegacyAdapter,
} from './process-workbench-shell-legacy-adapter';

@Component({
  selector: 'app-process-workbench-shell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ProcessStageWorkbenchComponent,
    ProcessFlowWorkbenchComponent,
    ProcessEditorWorkbenchComponent,
    ValueDomainWorkbenchComponent,
  ],
  templateUrl: './process-workbench-shell.component.html',
  styleUrl: './process-workbench-shell.component.scss',
})
export class ProcessWorkbenchShellComponent implements OnDestroy, OnInit {

  // 远端同步后通过 blm-workbench-refresh 事件刷新视图
  private readonly onRefresh = () => {
    this.version.update((v) => v + 1);
  };

  private readonly onOpenStage = (event: Event) => {
    const detail = (event as CustomEvent<{ stageId: string }>).detail;
    if (detail?.stageId) {
      getAngularRuntimeState().ui['stageId'] = detail.stageId;
      this.adapter.openStage();
      this.viewState.set('stage');
      this.version.update((v) => v + 1);
    }
  };

  ngOnInit(): void {
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
    window.addEventListener('blm-open-stage-view', this.onOpenStage);
  }

  // 模块意图：流程工作台壳层统一管理二级 tab 和工作台切换，避免 legacy renderProcessTab 继续生成页面结构。
  protected readonly version = signal(0);
  protected readonly adapter: ProcessWorkbenchShellLegacyAdapter = createProcessWorkbenchShellLegacyAdapter();
  protected readonly editorAdapter = createProcessEditorLegacyAdapter();
  protected readonly viewState = signal<ProcessShellView>(this.adapter.view());
  @ViewChild(ValueDomainWorkbenchComponent) private valueDomainWorkbench?: ValueDomainWorkbenchComponent;
  private lastObservedView = this.adapter.view();
  private readonly syncTimer = window.setInterval(() => this.syncExternalView(), 120);

  protected view(): ProcessShellView {
    this.version();
    return this.adapter.view();
  }

  ngOnDestroy(): void {
    window.clearInterval(this.syncTimer);
    window.removeEventListener('blm-workbench-refresh', this.onRefresh);
    window.removeEventListener('blm-open-stage-view', this.onOpenStage);
  }

  protected hasProcess(): boolean {
    this.version();
    return this.adapter.processes().length > 0;
  }

  protected currentProcess(): LegacyProcess | null {
    this.version();
    return this.editorAdapter.currentProcess();
  }

  protected currentTask(): LegacyProcessNode | null {
    this.version();
    return this.editorAdapter.currentTask();
  }

  protected isNodeEditor(): boolean {
    return !!this.currentTask();
  }

  protected tasks(): LegacyProcessNode[] {
    this.version();
    return this.editorAdapter.tasks(this.editorAdapter.currentProcess());
  }

  protected processTitle(): string {
    const process = this.currentProcess();
    return process?.name || '未命名流程';
  }

  protected taskRole(task: { role?: string; role_id?: string; roleIds?: string[] }): string {
    if (Array.isArray(task.roleIds) && task.roleIds.length) return task.roleIds.join('、');
    return task.role || task.role_id || '未分配角色';
  }

  protected processId(process: LegacyProcess | null | undefined): string {
    return this.editorAdapter.processId(process);
  }

  protected taskId(task: LegacyProcessNode | null | undefined): string {
    return this.editorAdapter.taskId(task);
  }

  protected roles(): LegacyRole[] {
    this.version();
    return this.editorAdapter.roles();
  }

  protected roleId(role: LegacyRole): string {
    return String(role.id || role.uid || '');
  }

  protected taskRoleIds(task: LegacyProcessNode): string[] {
    this.version();
    return this.editorAdapter.taskRoleIds(task);
  }

  protected stageRefs(process: LegacyProcess) {
    this.version();
    return this.editorAdapter.stageRefs(process);
  }

  protected gateways(process: LegacyProcess): LegacyFlowGateway[] {
    this.version();
    return this.editorAdapter.gateways(process);
  }

  protected gatewayId(gateway: LegacyFlowGateway): string {
    return String(gateway.id || gateway.uid || '');
  }

  protected edges(process: LegacyProcess): LegacyFlowEdge[] {
    this.version();
    return this.editorAdapter.edges(process);
  }

  protected edgeId(edge: LegacyFlowEdge): string {
    return String(edge.id || edge.uid || '');
  }

  protected flowNodeOptions(process: LegacyProcess, side: 'from' | 'to') {
    this.version();
    return this.editorAdapter.flowNodeOptions(process, side);
  }

  protected prototypeInputId(process: LegacyProcess): string {
    return `proc-prototype-input-${this.processId(process).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  protected prototypeCount(process: LegacyProcess): number {
    this.version();
    return this.editorAdapter.prototypeFiles(process).length;
  }

  protected setProcessField(field: 'name' | 'trigger' | 'outcome', value: string): void {
    this.editorAdapter.setProcessField(field, value);
    this.refresh();
  }

  protected setTaskField(task: LegacyProcessNode, field: 'name' | 'role' | 'description', value: string): void {
    this.editorAdapter.setTaskField(task, field, value);
    this.refresh();
  }

  protected setTaskRoleIds(task: LegacyProcessNode, roleIds: string[]): void {
    this.editorAdapter.setTaskRoleIds(task, roleIds);
    this.refresh();
  }

  protected toggleTaskRole(task: LegacyProcessNode, roleId: string, checked: boolean): void {
    const current = this.taskRoleIds(task).filter((item) => item !== roleId);
    if (checked) current.push(roleId);
    this.setTaskRoleIds(task, current);
  }

  protected selectTask(task: LegacyProcessNode | null): void {
    this.editorAdapter.selectTask(task ? this.taskId(task) : null);
    this.refresh();
  }

  protected addTask(afterTaskId?: string): void {
    this.editorAdapter.addTask(afterTaskId);
    this.refresh();
  }

  protected removeTask(taskId: string): void {
    this.editorAdapter.removeTask(taskId);
    this.refresh();
  }

  protected moveTask(taskId: string, delta: number): void {
    this.editorAdapter.moveTask(taskId, delta);
    this.refresh();
  }

  protected addGateway(afterGatewayId?: string): void {
    this.editorAdapter.addGateway(afterGatewayId);
    this.refresh();
  }

  protected setGateway(gateway: LegacyFlowGateway, field: 'title' | 'role_id', value: string): void {
    this.editorAdapter.setGateway(gateway, field, value);
    this.refresh();
  }

  protected moveGateway(gatewayId: string, delta: number): void {
    this.editorAdapter.moveGateway(gatewayId, delta);
    this.refresh();
  }

  protected removeGateway(gatewayId: string): void {
    this.editorAdapter.removeGateway(gatewayId);
    this.refresh();
  }

  protected addEdge(afterEdgeId?: string): void {
    this.editorAdapter.addEdge(afterEdgeId);
    this.refresh();
  }

  protected setEdge(edge: LegacyFlowEdge, field: 'from' | 'to' | 'label', value: string): void {
    this.editorAdapter.setEdge(edge, field, value);
    this.refresh();
  }

  protected moveEdge(edgeId: string, delta: number): void {
    this.editorAdapter.moveEdge(edgeId, delta);
    this.refresh();
  }

  protected removeEdge(edgeId: string): void {
    this.editorAdapter.removeEdge(edgeId);
    this.refresh();
  }

  protected uploadPrototypeFiles(process: LegacyProcess): void {
    this.editorAdapter.uploadPrototypeFiles(this.processId(process), this.prototypeInputId(process));
    this.refresh();
  }

  protected stageEditing(): boolean {
    this.version();
    return this.adapter.stageEditing();
  }

  protected valueDomainEditing(): boolean {
    this.version();
    return this.valueDomainWorkbench?.isEditingFromShell() || false;
  }

  protected openStage(): void {
    this.adapter.openStage();
    this.viewState.set('stage');
    this.refresh();
  }

  protected openValueDomain(): void {
    // 模块意图：价值流视图属于流程建模的上游边界，用流程壳层承载，复用现有 Angular 价值流组件。
    // 关键流程：只切换 S.ui.procView，不重新实现矩阵数据操作，避免两个入口维护同一份价值流模型。
    // 边界细节：这里不触碰流程、节点选择状态之外的数据模型，确保迁移入口不改变已有文档结构。
    this.adapter.openValueDomain();
    this.viewState.set('valueDomain');
    this.refresh();
  }

  protected openFlow(): void {
    this.adapter.openFlow();
    this.viewState.set('flow');
    this.refresh();
  }

  protected openNode(taskId: string | null = null): void {
    // 模块意图：节点视图是“维护节点详情”的入口，直接进入时必须落到一个真实节点上。
    // 关键流程：优先沿用当前流程；如果当前流程没有节点，则选择第一个有节点的流程。
    // 边界细节：打开新文档后 S.ui.procId 可能沿用旧值或指向空流程，不能让用户先回流程视图再手动选择。
    const current = this.editorAdapter.currentProcess();
    const process = (current && this.editorAdapter.tasks(current).length ? current : null)
      || this.editorAdapter.processes().find((item) => this.editorAdapter.tasks(item).length)
      || current
      || this.editorAdapter.processes()[0]
      || null;
    if (process) this.editorAdapter.selectProcess(this.editorAdapter.processId(process));
    const targetTaskId = taskId || this.editorAdapter.taskId(this.editorAdapter.currentTask()) || this.editorAdapter.taskId(this.editorAdapter.tasks(process)[0]);
    if (targetTaskId) this.editorAdapter.selectTask(targetTaskId);
    this.adapter.openNode();
    this.viewState.set('node');
    this.refresh();
  }

  protected openEditor(processId: string | null = null, taskId: string | null = null): void {
    this.viewState.set('editor');
    this.adapter.openEditor(processId, taskId);
    this.refresh();
  }

  protected setStageEditing(editing: boolean): void {
    this.adapter.setStageEditing(editing);
    this.refresh();
  }

  protected setValueDomainEditing(editing: boolean): void {
    this.valueDomainWorkbench?.setEditingFromShell(editing);
    this.refresh();
  }

  protected refresh(): void {
    this.version.update((value) => value + 1);
  }

  private syncExternalView(): void {
    // 边界细节：迁移期仍有少量 legacy 入口会直接改 S.ui.procView，
    // Angular 壳层需要主动同步，否则会出现状态已是 list、界面仍停在流程图的割裂。
    const current = this.adapter.view();
    if (current === this.lastObservedView) return;
    this.lastObservedView = current;
    this.viewState.set(current);
    this.refresh();
  }
}
