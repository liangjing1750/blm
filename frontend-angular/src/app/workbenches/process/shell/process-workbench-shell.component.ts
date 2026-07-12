import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
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
import { confirmRuntimeAction, getAngularRuntimeState, markAngularRuntimeModified } from '../../../core/runtime/angular-runtime';
import { ExportService } from '../../../core/export/export.service';
import { exportGraphId } from '../../../core/export/graph-export-registry';
import { identityOf } from '../../../core/document/document-model';
import { processesForStage } from '../../../core/export/exporters/stage-exporter';
import { stagesForValueStream } from '../../../core/export/exporters/value-stream-exporter';
import {
  ProcessShellView,
  ProcessWorkbenchShellLegacyAdapter,
  createProcessWorkbenchShellLegacyAdapter,
} from './process-workbench-shell-legacy-adapter';
import { createCurrentNodeExporter, createCurrentProcessExporter, createCurrentStageExporter, createValueStreamExporter } from './process-export-dispatcher';

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
  private readonly exportSvc = inject(ExportService);

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
  protected readonly exportMenuOpen = signal(false);
  /** 控制隐藏预渲染区：只有导出时才设为 true，避免切换视图时一次性渲染全部阶段/流程组件 */
  protected readonly exportCaptureReady = signal(false);
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

  protected currentStageGraphId(): string {
    const stage = this.currentStageForExport();
    return stage ? exportGraphId('stage-flow', identityOf(stage)) : '';
  }

  protected valueStreamGraphId(): string {
    return exportGraphId('stage-panorama');
  }

  protected allStagesForExport(): any[] {
    return stagesForValueStream(getAngularRuntimeState().doc);
  }

  protected stageGraphId(stage: any): string {
    return exportGraphId('stage-flow', identityOf(stage));
  }

  protected stagePreviewId(stage: any): string {
    return identityOf(stage);
  }

  protected processGraphId(process: LegacyProcess): string {
    return exportGraphId('process-flow', identityOf(process as any));
  }

  protected stageProcessesForExport(): LegacyProcess[] {
    const stage = this.currentStageForExport();
    if (!stage) return [];
    return processesForStage(getAngularRuntimeState().doc, stage as any) as any;
  }

  protected allProcessesForExport(): LegacyProcess[] {
    const processes = new Map<string, LegacyProcess>();
    for (const stage of this.allStagesForExport()) {
      for (const process of processesForStage(getAngularRuntimeState().doc, stage as any) as any) {
        processes.set(identityOf(process), process);
      }
    }
    return [...processes.values()];
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
    return this.processEditing();
  }

  protected valueDomainEditing(): boolean {
    this.version();
    return this.processEditing();
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

  protected openFlowForProcess(processId: string): void {
    if (processId) getAngularRuntimeState().ui['procId'] = processId;
    this.adapter.openFlow();
    this.viewState.set('flow');
    this.refresh();
  }

  protected toggleExportMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.exportMenuOpen.update((value) => !value);
  }

  protected closeExportMenu(): void {
    this.exportMenuOpen.set(false);
  }

  protected canExportCurrentView(): boolean {
    return (this.view() === 'node' && !!this.currentTask()) ||
      (this.view() === 'flow' && !!this.currentProcess()) ||
      (this.view() === 'stage' && !!getAngularRuntimeState().doc?.stages?.length) ||
      (this.view() === 'valueDomain' && !!getAngularRuntimeState().doc?.stages?.length);
  }

  protected async exportCurrentView(format: 'docx' | 'zip'): Promise<void> {
    this.closeExportMenu();
    const runtime = getAngularRuntimeState();
    const ui = {
      procId: runtime.ui['procId'],
      stageId: runtime.ui['stageId'],
      taskId: runtime.ui['taskId'],
    };
    const exporter = this.view() === 'flow'
      ? createCurrentProcessExporter(runtime.doc, ui)
      : this.view() === 'stage'
        ? createCurrentStageExporter(runtime.doc, ui)
        : this.view() === 'valueDomain'
          ? createValueStreamExporter(runtime.doc)
          : this.view() === 'node'
            ? createCurrentNodeExporter(runtime.doc, ui)
            : null;
    if (!exporter) return;

    // 价值流/阶段视图需要预渲染隐藏的图形组件才能截图：
    // 平时不渲染（切换视图不卡），只在导出时临时打开→等待→截图→关闭
    const needsPreRender = this.view() === 'valueDomain' || this.view() === 'stage';
    if (needsPreRender) {
      this.exportCaptureReady.set(true);
      await this.waitForExportGraphs(this.requiredExportGraphIds());
    }

    try {
      await this.exportSvc.exportView(exporter, format);
    } finally {
      if (needsPreRender) {
        this.exportCaptureReady.set(false);
      }
    }
  }

  private requiredExportGraphIds(): string[] {
    if (this.view() === 'valueDomain') {
      return [
        this.valueStreamGraphId(),
        ...this.allStagesForExport().map((stage) => this.stageGraphId(stage)),
        ...this.allProcessesForExport().map((process) => this.processGraphId(process)),
      ];
    }
    if (this.view() === 'stage') {
      return [
        this.currentStageGraphId(),
        ...this.stageProcessesForExport().map((process) => this.processGraphId(process)),
      ];
    }
    return [];
  }

  /** 等待本次导出实际需要的 export-graph 元素渲染就绪（尺寸 > 0）。 */
  private async waitForExportGraphs(graphIds: string[]): Promise<void> {
    if (!graphIds.length) return;
    const selectors = graphIds.map((id) => `[data-export-graph-id="${String(id).replace(/"/g, '\\"')}"]`);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const allReady = selectors.every((selector) => {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (allReady) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  @HostListener('document:click', ['$event'])
  protected closeProcessMenusFromDocument(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-testid="process-export-menu-wrap"]')) return;
    this.closeExportMenu();
  }

  protected async deleteCurrentFlow(): Promise<void> {
    const process = this.currentProcess();
    const processId = this.processId(process);
    if (!process || !processId) return;
    const confirmed = await confirmRuntimeAction(`确认删除流程“${process.name || processId}”吗？相关阶段引用和阶段连线也会一并移除。`, {
      title: '删除流程',
      confirmLabel: '删除',
    });
    if (!confirmed) return;

    const runtime = getAngularRuntimeState() as any;
    const doc = runtime.doc || {};
    const keys = new Set([process.id, process.uid, processId].filter(Boolean).map(String));
    const refId = (ref: any) => String(ref?.uid || ref?.id || ref?.refUid || ref?.refId || '');
    const removedRefIds = new Set((doc.stageFlowRefs || [])
      .filter((ref: any) => keys.has(String(ref.processUid || '')) || keys.has(String(ref.processId || '')))
      .map(refId)
      .filter(Boolean));

    doc.processes = (doc.processes || []).filter((item: any) => !keys.has(String(item.id || '')) && !keys.has(String(item.uid || '')));
    doc.stageFlowRefs = (doc.stageFlowRefs || []).filter((ref: any) => !removedRefIds.has(refId(ref)));
    doc.stageFlowLinks = (doc.stageFlowLinks || []).filter((link: any) => (
      !removedRefIds.has(String(link.fromRefUid || link.fromRefId || ''))
      && !removedRefIds.has(String(link.toRefUid || link.toRefId || ''))
    ));

    const next = doc.processes?.[0] || null;
    runtime.ui['procId'] = next ? this.processId(next) : null;
    runtime.ui['taskId'] = null;
    markAngularRuntimeModified();
    this.refresh();
  }

  protected processEditing = signal(false);
  protected flowEditing = signal(false);
  protected editorEditing = signal(false);

  protected setStageEditing(editing: boolean): void {
    this.setProcessEditing(editing);
  }

  protected setFlowEditing(editing: boolean): void {
    this.setProcessEditing(editing);
  }

  protected setEditorEditing(editing: boolean): void {
    this.setProcessEditing(editing);
  }

  protected setValueDomainEditing(editing: boolean): void {
    this.setProcessEditing(editing);
  }

  private setProcessEditing(editing: boolean): void {
    this.processEditing.set(editing);
    this.flowEditing.set(editing);
    this.editorEditing.set(editing);
    getAngularRuntimeState().ui['stageEditorCollapsed'] = !editing;
    this.valueDomainWorkbench?.setEditingFromShell(editing);
    this.refresh();
  }

  private currentStageForExport(): any | null {
    this.version();
    const runtime = getAngularRuntimeState();
    const target = String(runtime.ui['stageId'] || '').trim();
    return (runtime.doc?.stages || []).find((stage: any) => (
      identityOf(stage) === target || stage.name === target
    )) || runtime.doc?.stages?.[0] || null;
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
