import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LegacyFlowEdge,
  LegacyFlowGateway,
  LegacyProcess,
  LegacyProcessNode,
  LegacyPrototypeFile,
  LegacyPrototypeVersion,
  LegacyRole,
  LegacyStage,
  createProcessEditorLegacyAdapter,
} from '../editor/process-editor-legacy-adapter';
import { ProcessFlowLayoutOffset, ProcessFlowModelService } from './process-flow-model.service';

interface FlowCanvasNode {
  id: string;
  baseId: string;
  kind: 'start' | 'task' | 'gateway' | 'end';
  name: string;
  role: string;
  shared: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  task?: LegacyProcessNode;
  gateway?: LegacyFlowGateway;
}

interface FlowCanvasEdge {
  id: string;
  baseId: string;
  label: string;
  d: string;
  labelX: number;
  labelY: number;
}

interface FlowAnchor {
  id: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  x: number;
  y: number;
}

interface FlowLane {
  id: string;
  name: string;
  top: number;
  height: number;
}

interface FlowDragState {
  nodeId: string;
  startX: number;
  startY: number;
  startNodeX: number;
  startNodeY: number;
  startOffset: { dx: number; dy: number };
  task?: LegacyProcessNode;
}

@Component({
  selector: 'app-process-flow-workbench',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './process-flow-workbench.component.html',
  styleUrls: [
    './process-flow-workbench.component.scss',
    './process-flow-layout.scss',
    './process-flow-canvas.scss',
    './process-flow-tools.scss',
    './process-flow-nodes.scss',
    './process-flow-inline.scss',
    './process-flow-attachments.scss',
  ],
})
export class ProcessFlowWorkbenchComponent implements OnInit, OnDestroy {

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
  // Module intent: this view owns process structure; node details stay in the node view.
  protected readonly version = signal(0);
  protected readonly selectedElementId = signal<string>('');
  protected readonly connectingFromId = signal<string>('');
  protected readonly rolePickerOpen = signal(false);
  protected readonly selectedStageId = signal<string>('');
  protected readonly attachmentDrawerOpen = signal(false);
  protected readonly zoomValue = signal(1);
  protected readonly dragState = signal<FlowDragState | null>(null);
  protected readonly previewPoint = signal<{ x: number; y: number } | null>(null);
  protected readonly adapter = createProcessEditorLegacyAdapter();
  private readonly flowModel = inject(ProcessFlowModelService);
  protected readonly laneHeight = 118;
  protected readonly laneTitleWidth = 116;
  protected readonly nodeWidth = 132;
  protected readonly nodeHeight = 54;
  // 对齐旧版 process.js 布局常量：firstNodeX=180, colW=180, startX=130
  protected readonly graphStartX = 130;
  protected readonly graphNodeStartX = 180;
  protected readonly columnGap = 180;
  private readonly lanePalette = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#4f46e5', '#16a34a'];

  @Input() editing = true;
  @Output() readonly taskEditorRequested = new EventEmitter<string>();

  protected processes(): LegacyProcess[] {
    this.version();
    return this.adapter.processes();
  }

  protected stages(): LegacyStage[] {
    this.version();
    return this.adapter.stages();
  }

  protected currentProcess(): LegacyProcess | null {
    this.version();
    return this.adapter.currentProcess();
  }

  protected processId(process: LegacyProcess | null | undefined): string {
    return this.adapter.processId(process);
  }

  protected taskId(task: LegacyProcessNode | null | undefined): string {
    return this.adapter.taskId(task);
  }

  protected gatewayId(gateway: LegacyFlowGateway): string {
    return String(gateway.id || gateway.uid || '');
  }

  protected edgeId(edge: LegacyFlowEdge): string {
    return String(edge.id || edge.uid || '');
  }

  protected tasks(process: LegacyProcess | null | undefined): LegacyProcessNode[] {
    this.version();
    return this.flowModel.tasks(process);
  }

  protected gateways(process: LegacyProcess | null | undefined): LegacyFlowGateway[] {
    this.version();
    return this.flowModel.gateways(process);
  }

  protected edges(process: LegacyProcess | null | undefined): LegacyFlowEdge[] {
    this.version();
    return this.flowModel.edges(process);
  }

  protected roles(): LegacyRole[] {
    this.version();
    return this.adapter.roles();
  }

  protected stageId(stage: LegacyStage | null | undefined): string {
    return String(stage?.uid || stage?.id || '').trim();
  }

  protected stageName(stage: LegacyStage | null | undefined): string {
    return stage?.name || this.stageId(stage) || '未命名阶段';
  }

  protected roleId(role: LegacyRole): string {
    return String(role.id || role.uid || '');
  }

  protected roleName(roleId: string | undefined): string {
    const raw = String(roleId || '').trim();
    if (!raw) return '';
    const role = this.roles().find((item) => this.roleId(item) === raw || item.name === raw);
    return role?.name || raw;
  }

  protected taskRoleId(task: LegacyProcessNode): string {
    return this.adapter.taskRoleIds(task)[0] || task.role_id || task.role || '';
  }

  protected taskRoleIds(task: LegacyProcessNode): string[] {
    const ids = this.adapter.taskRoleIds(task);
    return ids.length ? ids : [task.role_id || task.role || ''].filter(Boolean);
  }

  protected taskRoleSummary(task: LegacyProcessNode): string {
    const names = this.taskRoleIds(task).map((roleId) => this.roleName(roleId)).filter(Boolean);
    return names.length ? names.join('、') : '选择执行角色';
  }

  // 编辑态点击节点：选中并显示连线锚点
  protected handleNodeClick(node: any): void {
    if (this.connectingFromId()) {
      this.finishConnect(node.baseId);
    } else {
      this.selectElement(node.baseId);
    }
  }

  // 非编辑态点击节点：跳转节点视图
  protected openNodeEditor(node: any): void {
    if (node.task) {
      this.adapter.selectTask(this.taskId(node.task));
      this.taskEditorRequested.emit(this.taskId(node.task));
    }
  }

  // 节点角色名列表
  protected nodeRoleNames(node: any): string[] {
    if (!node.task) return [];
    return this.taskRoleIds(node.task).map((roleId: string) => this.roleName(roleId)).filter(Boolean);
  }

  // 移除节点角色
  protected removeNodeRole(node: any, roleName: string, event: MouseEvent): void {
    event.stopPropagation();
    if (!node.task) return;
    const roleId = this.taskRoleIds(node.task).find((id: string) => this.roleName(id) === roleName);
    if (roleId) {
      this.flowModel.setTaskRoleIds(node.task, this.taskRoleIds(node.task).filter((id: string) => id !== roleId));
      this.adapter.touch();
      this.refresh();
    }
  }

  // 打开角色选择器（小内联下拉）
  protected openNodeRolePicker(node: any, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedElementId.set(node.baseId || node.id);
    this.rolePickerOpen.set(true);
  }

  // 重命名节点
  protected renameFlowNode(node: any, event: MouseEvent): void {
    event.stopPropagation();
    const name = window.prompt('修改节点名称', node.name || '');
    if (name !== null && name.trim() && node.task) {
      this.setTaskName(node.task, name.trim());
      this.refresh();
    }
  }

  protected currentStageId(): string {
    this.version();
    const explicit = this.selectedStageId();
    if (explicit) return explicit;
    const process = this.currentProcess();
    const refs = process ? this.stageIdsForProcess(process) : [];
    return refs[0] || this.stageId(this.stages()[0]) || '';
  }

  protected processesForCurrentStage(): LegacyProcess[] {
    const stageId = this.currentStageId();
    if (!stageId) return this.processes();
    return this.processes().filter((process) => this.stageIdsForProcess(process).includes(stageId));
  }

  protected lanes(process: LegacyProcess): FlowLane[] {
    // Key flow: lanes come from roles used by this process, then respect the saved swimlane order when present.
    const names = new Set<string>();
    for (const task of this.tasks(process)) {
      const roleIds = this.taskRoleIds(task);
      if (!roleIds.length) names.add('\u672a\u5206\u914d\u89d2\u8272');
      for (const roleId of roleIds) names.add(this.roleName(roleId) || '\u672a\u5206\u914d\u89d2\u8272');
    }
    for (const gateway of this.gateways(process)) names.add(this.roleName(gateway.role_id) || this.inferGatewayLane(process, this.gatewayId(gateway)) || '\u672a\u5206\u914d\u89d2\u8272');
    if (!names.size) names.add('\u672a\u5206\u914d\u89d2\u8272');
    const laneOrder = this.flowModel.swimlaneLayout(process).laneOrder || [];
    const orderedNames = [...names].sort((a, b) => {
      const ia = laneOrder.indexOf(a);
      const ib = laneOrder.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return 0;
    });
    return orderedNames.map((name, index) => ({
      id: `lane-${index}`,
      name,
      top: index * this.laneHeight,
      height: this.laneHeight,
    }));
  }

  protected canvasWidth(process: LegacyProcess): number {
    const nodeCount = Math.max(this.flowOrder(process).length, 1);
    return Math.max(1120, this.graphNodeStartX + Math.max(0, nodeCount - 2) * this.columnGap + 240);
  }

  protected canvasHeight(process: LegacyProcess): number {
    const laneBottom = this.lanes(process).length * this.laneHeight;
    const nodeBottom = this.flowNodes(process).reduce((bottom, node) => Math.max(bottom, node.y + node.height), 0);
    return Math.max(220, laneBottom + 1, nodeBottom + 36);
  }

  protected flowNodes(process: LegacyProcess): FlowCanvasNode[] {
    const tasks = new Map(this.tasks(process).map((task) => [this.taskId(task), task]));
    const gateways = new Map(this.gateways(process).map((gateway) => [this.gatewayId(gateway), gateway]));
    const laneMap = new Map(this.lanes(process).map((lane, index) => [lane.name, index]));
    return this.flowOrder(process).flatMap((id, index): FlowCanvasNode[] => {
      const task = tasks.get(id);
      const gateway = gateways.get(id);
      const kind: FlowCanvasNode['kind'] = id === 'START' ? 'start' : id === 'END' ? 'end' : gateway ? 'gateway' : 'task';
      const roleNames = task
        ? this.taskRoleIds(task).map((roleId) => this.roleName(roleId) || roleId).filter(Boolean)
        : gateway
        ? [this.roleName(gateway.role_id) || this.inferGatewayLane(process, id) || '\u672a\u5206\u914d\u89d2\u8272']
        : [''];
      const visibleRoleNames = roleNames.length ? roleNames : ['\u672a\u5206\u914d\u89d2\u8272'];
      const graphIndex = Math.max(0, index - 1);
      const x = kind === 'start' ? this.graphStartX : this.graphNodeStartX + graphIndex * this.columnGap;
      if (kind === 'start' || kind === 'end') {
        const offset = this.flowOffset(process, id);
        const terminalHeight = 24;
        const terminalWidth = 44;
        const laneCenterY = this.laneHeight / 2 - terminalHeight / 2;
        const clamped = this.clampNodePosition(process, id, x + offset.dx, laneCenterY + offset.dy, terminalWidth, terminalHeight, '');
        return [{
          id,
          baseId: id,
          kind,
          name: id === 'START' ? '\u5f00\u59cb' : '\u7ed3\u675f',
          role: '',
          shared: false,
          x: clamped.x,
          y: clamped.y,
          width: terminalWidth,
          height: terminalHeight,
        }];
      }
      return visibleRoleNames.map((roleName, roleIndex) => {
        const laneIndex = laneMap.get(roleName) ?? 0;
        const offset = this.flowOffset(process, id);
        const baseY = laneIndex * this.laneHeight + (kind === 'gateway' ? 42 : 54);
        const width = kind === 'gateway' ? 86 : this.nodeWidth;
        const height = kind === 'gateway' ? 76 : this.nodeHeight;
        const clamped = this.clampNodePosition(process, id, x + offset.dx, baseY + offset.dy, width, height, roleName);
        return {
          id: `${id}::${roleName || roleIndex}`,
          baseId: id,
          kind,
          name: task?.name || gateway?.title || (kind === 'gateway' ? '\u7f51\u5173' : '\u672a\u547d\u540d\u8282\u70b9'),
          role: roleName,
          shared: Boolean(task && visibleRoleNames.length > 1),
          x: clamped.x,
          y: clamped.y,
          width,
          height,
          task,
          gateway,
        };
      });
    });
  }

  protected laneColor(laneName: string): string {
    // 模块意图：角色颜色只服务于流程图识别，不写入文档模型，避免引入新的持久化字段。
    const names = this.currentProcess() ? this.lanes(this.currentProcess()!).map((lane) => lane.name) : [];
    const index = Math.max(0, names.indexOf(laneName || ''));
    return this.lanePalette[index % this.lanePalette.length];
  }

  protected inlinePanelLeft(process: LegacyProcess, node: FlowCanvasNode): number {
    // 关键流程：优先放在节点右侧，其次放在左侧，减少遮挡当前泳道图元素。
    const panelWidth = 270;
    const right = node.x + node.width + 14;
    if (right + panelWidth < this.canvasWidth(process) - 16) return right;
    return Math.max(this.laneTitleWidth + 12, node.x - panelWidth - 14);
  }

  protected inlinePanelTop(process: LegacyProcess, node: FlowCanvasNode): number {
    const panelHeight = node.task ? 210 : 150;
    const below = node.y + node.height + 12;
    if (below + panelHeight < this.canvasHeight(process) - 12) return below;
    return Math.max(12, node.y - panelHeight - 12);
  }

  protected flowEdges(process: LegacyProcess): FlowCanvasEdge[] {
    // 关键流程：共享节点会渲染为多个角色实例，连线必须连接所有实例，而不是只连第一个。
    const nodes = this.flowNodes(process);
    return this.edges(process).flatMap((edge, index) => {
      const fromNodes = nodes.filter((node) => node.baseId === String(edge.from || ''));
      const toNodes = nodes.filter((node) => node.baseId === String(edge.to || ''));
      if (!fromNodes.length || !toNodes.length) return [];
      return fromNodes.flatMap((from, fromIndex) => toNodes.map((to, toIndex) => {
        const startX = from.x + from.width;
        const startY = from.y + from.height / 2;
        const endX = to.x;
        const endY = to.y + to.height / 2;
        const midX = Math.max(startX + 24, Math.round((startX + endX) / 2));
        return {
          id: `${this.edgeId(edge) || `edge-${index}`}::${from.id}::${to.id}`,
          baseId: this.edgeId(edge) || `edge-${index}`,
          label: fromIndex === 0 && toIndex === 0 ? String(edge.label || edge.condition || '') : '',
          d: `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`,
          labelX: midX + 6,
          labelY: (startY + endY) / 2 - 8,
        };
      }));
    });
  }

  protected previewEdge(process: LegacyProcess): FlowCanvasEdge | null {
    const source = this.connectingFromId();
    const point = this.previewPoint();
    if (!source || !point) return null;
    const from = this.flowNodes(process).find((node) => node.baseId === source || node.id === source);
    if (!from) return null;
    const startX = from.x + from.width;
    const startY = from.y + from.height / 2;
    const midX = Math.max(startX + 24, Math.round((startX + point.x) / 2));
    return { id: 'preview', baseId: 'preview', label: '', d: `M ${startX} ${startY} H ${midX} V ${point.y} H ${point.x}`, labelX: 0, labelY: 0 };
  }

  protected connectAnchors(node: FlowCanvasNode): FlowAnchor[] {
    return [
      { id: 'top', side: 'top', x: node.x + node.width / 2, y: node.y },
      { id: 'right', side: 'right', x: node.x + node.width, y: node.y + node.height / 2 },
      { id: 'bottom', side: 'bottom', x: node.x + node.width / 2, y: node.y + node.height },
      { id: 'left', side: 'left', x: node.x, y: node.y + node.height / 2 },
    ];
  }

  protected selectedNode(process: LegacyProcess): FlowCanvasNode | null {
    return this.flowNodes(process).find((node) => node.baseId === this.selectedElementId() && node.kind !== 'start' && node.kind !== 'end') || null;
  }

  protected selectedEdge(process: LegacyProcess): LegacyFlowEdge | null {
    return this.edges(process).find((edge) => this.edgeId(edge) === this.selectedElementId()) || null;
  }

  protected flowNodeOptions(process: LegacyProcess, side: 'from' | 'to'): Array<{ id: string; label: string }> {
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
    return this.adapter.prototypeFiles(process);
  }

  protected prototypeFileName(file: LegacyPrototypeFile, index: number): string {
    return file.name || file.uid || file.id || `\u9644\u4ef6${index + 1}`;
  }

  protected prototypeUid(file: LegacyPrototypeFile): string {
    return String(file.uid || file.id || '').trim();
  }

  protected prototypeCurrentVersion(file: LegacyPrototypeFile): LegacyPrototypeVersion | null {
    return this.adapter.currentPrototypeVersion(file);
  }

  protected prototypeVersionCount(file: LegacyPrototypeFile): number {
    return Array.isArray(file.versions) && file.versions.length ? file.versions.length : 1;
  }

  protected prototypeMeta(file: LegacyPrototypeFile): string {
    const current = this.prototypeCurrentVersion(file);
    const version = current?.number || 1;
    const uploadedAt = current?.uploadedAt ? ` ? ${current.uploadedAt}` : '';
    return `\u5f53\u524d v${version} \u00b7 \u5171${this.prototypeVersionCount(file)}\u7248${uploadedAt}`;
  }

  protected prototypeKind(file: LegacyPrototypeFile): string {
    return this.adapter.prototypeKind(file);
  }

  protected isPrototypeExpanded(process: LegacyProcess, file: LegacyPrototypeFile): boolean {
    const processId = this.processId(process);
    const prototypeUid = this.prototypeUid(file);
    return Boolean(processId && prototypeUid && this.adapter.isPrototypeExpanded(processId, prototypeUid));
  }

  protected canPreviewPrototype(file: LegacyPrototypeFile, version: LegacyPrototypeVersion | null = null): boolean {
    return this.adapter.canPreviewPrototype(file, version);
  }

  protected togglePrototypeVersions(process: LegacyProcess, file: LegacyPrototypeFile): void {
    const prototypeUid = this.prototypeUid(file);
    if (!prototypeUid) return;
    this.adapter.togglePrototypeVersions(this.processId(process), prototypeUid);
    this.refresh();
  }

  protected openPrototype(process: LegacyProcess, file: LegacyPrototypeFile, version: LegacyPrototypeVersion | null = null): void {
    const prototypeUid = this.prototypeUid(file);
    if (!prototypeUid) return;
    this.adapter.openPrototype(this.processId(process), prototypeUid, String(version?.uid || ''));
  }

  protected downloadPrototype(process: LegacyProcess, file: LegacyPrototypeFile, version: LegacyPrototypeVersion | null = null): void {
    const prototypeUid = this.prototypeUid(file);
    if (!prototypeUid) return;
    this.adapter.downloadPrototype(this.processId(process), prototypeUid, String(version?.uid || ''));
  }

  protected removePrototype(process: LegacyProcess, file: LegacyPrototypeFile): void {
    const prototypeUid = this.prototypeUid(file);
    if (!prototypeUid) return;
    this.adapter.removePrototype(this.processId(process), prototypeUid);
    this.refresh();
  }

  protected selectStage(stageId: string): void {
    this.selectedStageId.set(stageId);
    const process = this.processesForCurrentStage()[0] || null;
    if (process) this.selectProcess(this.processId(process));
    else this.refresh();
  }

  protected selectProcess(processId: string): void {
    const target = this.processes().find((process) => this.processId(process) === processId);
    if (!target) return;
    this.selectedElementId.set('');
    this.connectingFromId.set('');
    this.adapter.selectTask(null);
    this.adapter.selectProcess(processId);
    this.refresh();
  }

  protected selectElement(id: string): void {
    this.selectedElementId.set(id);
    this.rolePickerOpen.set(false);
  }

  protected setProcessField(field: 'name' | 'trigger' | 'outcome', value: string): void {
    const process = this.currentProcess();
    if (!process) return;
    this.flowModel.setProcessField(process, field, value);
    this.adapter.touch();
    this.refresh();
  }

  protected setTaskName(task: LegacyProcessNode, value: string): void {
    this.flowModel.setTaskName(task, value);
    this.adapter.touch();
    this.refresh();
  }

  protected setTaskRole(task: LegacyProcessNode, roleId: string): void {
    this.flowModel.setTaskRoleIds(task, roleId ? [roleId] : []);
    this.adapter.touch();
    this.refresh();
  }

  protected setTaskRolesFromSelect(task: LegacyProcessNode, target: EventTarget | null): void {
    const select = target as HTMLSelectElement | null;
    const roleIds = select ? Array.from(select.selectedOptions).map((option) => option.value).filter(Boolean) : [];
    this.flowModel.setTaskRoleIds(task, roleIds);
    this.adapter.touch();
    this.refresh();
  }

  protected toggleTaskRole(task: LegacyProcessNode, roleId: string, checked: boolean): void {
    const current = new Set(this.taskRoleIds(task));
    if (checked) current.add(roleId);
    else current.delete(roleId);
    this.flowModel.setTaskRoleIds(task, [...current]);
    this.adapter.touch();
    this.refresh();
  }

  protected setGateway(gateway: LegacyFlowGateway, field: 'title' | 'role_id', value: string): void {
    this.flowModel.setGateway(gateway, field, value);
    this.adapter.touch();
    this.refresh();
  }

  protected setEdge(edge: LegacyFlowEdge, field: 'from' | 'to' | 'label', value: string): void {
    this.flowModel.setEdge(edge, field, value);
    this.adapter.touch();
    this.refresh();
  }

  protected addTask(): void {
    const process = this.currentProcess();
    if (!process) return;
    const task = this.flowModel.addTask(process);
    this.adapter.touch();
    this.selectedElementId.set(this.taskId(task));
    this.refresh();
  }

  protected addGateway(): void {
    const process = this.currentProcess();
    if (!process) return;
    const gateway = this.flowModel.addGateway(process);
    this.adapter.touch();
    this.selectedElementId.set(this.gatewayId(gateway));
    this.refresh();
  }

  protected startConnect(nodeId: string): void {
    this.connectingFromId.set(nodeId);
  }

  protected finishConnect(targetNodeId: string): void {
    const source = this.connectingFromId();
    if (!source || source === targetNodeId) return;
    const process = this.currentProcess();
    if (!process) return;
    const edge = this.flowModel.addEdge(process, source, targetNodeId);
    this.adapter.touch();
    this.selectedElementId.set(this.edgeId(edge));
    this.connectingFromId.set('');
    this.previewPoint.set(null);
    this.refresh();
  }

  protected startConnectFromAnchor(event: MouseEvent, nodeId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.connectingFromId.set(nodeId);
    this.selectedElementId.set(nodeId);
  }

  protected onCanvasPointer(event: MouseEvent): void {
    const canvas = event.currentTarget as HTMLElement;
    const rect = canvas.getBoundingClientRect();
    this.previewPoint.set({
      x: (event.clientX - rect.left) / this.zoomValue(),
      y: (event.clientY - rect.top) / this.zoomValue(),
    });
  }

  protected clearCanvasSelection(): void {
    this.selectedElementId.set('');
    this.connectingFromId.set('');
    this.rolePickerOpen.set(false);
    this.previewPoint.set(null);
  }

  protected removeSelected(process: LegacyProcess): void {
    const id = this.selectedElementId();
    if (!id || id === 'START' || id === 'END') return;
    this.flowModel.removeElement(process, id);
    this.adapter.touch();
    this.selectedElementId.set('');
    this.refresh();
  }

  protected openNodeView(node: FlowCanvasNode): void {
    if (!node.task) return;
    this.adapter.selectTask(this.taskId(node.task));
    this.taskEditorRequested.emit(this.taskId(node.task));
  }

  protected uploadPrototypeFiles(process: LegacyProcess): void {
    this.adapter.uploadPrototypeFiles(this.processId(process), this.prototypeInputId(process));
    this.refresh();
  }

  protected uploadPrototypeFilesImmediately(process: LegacyProcess): void {
    this.attachmentDrawerOpen.set(true);
    this.uploadPrototypeFiles(process);
    [120, 600, 1200].forEach((delay) => window.setTimeout(() => this.collapsePrototypeVersions(process), delay));
  }

  protected zoom(delta: number): void {
    const next = Math.max(0.5, Math.min(1.8, Math.round((this.zoomValue() + delta) * 10) / 10));
    this.zoomValue.set(next);
  }

  protected resetZoom(): void {
    this.zoomValue.set(1);
  }

  protected onCanvasWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    event.preventDefault();
    this.zoom(event.deltaY < 0 ? 0.1 : -0.1);
  }

  @HostListener('document:pointerup', ['$event'])
  protected onDocumentPointerUp(event: PointerEvent): void {
    this.finishNodeDrag(event);
  }

  @HostListener('document:pointermove', ['$event'])
  protected onDocumentPointerMove(event: PointerEvent): void {
    this.moveNodeDrag(event);
  }

  @HostListener('window:pointerup', ['$event'])
  protected onWindowPointerUp(event: PointerEvent): void {
    this.finishNodeDrag(event);
  }

  protected startNodeDrag(event: MouseEvent | PointerEvent, node: FlowCanvasNode): void {
    if (!this.editing) return;
    if (typeof event.button === 'number' && event.button !== 0) return;
    event.preventDefault();
    const process = this.currentProcess();
    if (!process) return;
    this.selectedElementId.set(node.baseId);
    this.dragState.set({
      nodeId: node.baseId,
      startX: event.clientX,
      startY: event.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      startOffset: this.flowOffset(process, node.baseId),
      task: node.task,
    });
    if ('pointerId' in event) {
      try {
        (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
      } catch {
        // Boundary detail: synthetic pointer events in tests may not own a real pointer capture.
      }
    }
  }

  protected moveNodeDrag(event: MouseEvent | PointerEvent): void {
    const drag = this.dragState();
    const process = this.currentProcess();
    if (!drag || !process) return;
    const dx = (event.clientX - drag.startX) / this.zoomValue();
    const dy = (event.clientY - drag.startY) / this.zoomValue();
    const snapped = this.snapPosition(process, drag.nodeId, drag.startNodeX + dx, drag.startNodeY + dy);
    this.setFlowOffset(process, drag.nodeId, drag.startOffset.dx + snapped.x - drag.startNodeX, drag.startOffset.dy + snapped.y - drag.startNodeY, false);
  }

  protected endNodeDrag(event: MouseEvent | PointerEvent, node: FlowCanvasNode): void {
    this.finishNodeDrag(event, node);
  }

  protected finishNodeDrag(event: MouseEvent | PointerEvent, node?: FlowCanvasNode): void {
    const drag = this.dragState();
    const process = this.currentProcess();
    if (!drag || !process) return;
    const dx = (event.clientX - drag.startX) / this.zoomValue();
    const dy = (event.clientY - drag.startY) / this.zoomValue();
    const moved = Math.abs(dx) > 2 || Math.abs(dy) > 2;
    if (moved) {
      const snapped = this.snapPosition(process, drag.nodeId, drag.startNodeX + dx, drag.startNodeY + dy);
      this.setFlowOffset(process, drag.nodeId, drag.startOffset.dx + snapped.x - drag.startNodeX, drag.startOffset.dy + snapped.y - drag.startNodeY, true);
    }
    if ('pointerId' in event) {
      try {
        (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
      } catch {
        // Boundary detail: releasing a non-captured synthetic pointer should not break layout persistence.
      }
    }
    this.dragState.set(null);
    this.selectedElementId.set(drag.nodeId);
    this.refresh();
  }

  protected onLaneDrop(event: DragEvent, lane: FlowLane): void {
    event.preventDefault();
    const taskId = event.dataTransfer?.getData('application/x-blm-task-id') || '';
    const process = this.currentProcess();
    const task = process ? this.tasks(process).find((item) => this.taskId(item) === taskId) : null;
    if (!task) return;
    const role = this.roles().find((item) => item.name === lane.name || this.roleId(item) === lane.name);
    this.setTaskRole(task, role ? this.roleId(role) : '');
  }

  private flowOrder(process: LegacyProcess): string[] {
    // Boundary detail: when no edge exists, keep stable list order instead of inventing hidden semantics.
    const taskIds = this.tasks(process).map((task) => this.taskId(task)).filter(Boolean);
    const gatewayIds = this.gateways(process).map((gateway) => this.gatewayId(gateway)).filter(Boolean);
    const allIds = ['START', ...taskIds, ...gatewayIds, 'END'];
    const ordered = ['START'];
    const visited = new Set(ordered);
    let current = 'START';
    for (let guard = 0; guard < allIds.length + this.edges(process).length; guard += 1) {
      const next = this.edges(process).find((edge) => String(edge.from || '') === current && !visited.has(String(edge.to || '')))?.to;
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

  private flowOffset(process: LegacyProcess, key: string): Required<ProcessFlowLayoutOffset> {
    const offset = this.flowModel.swimlaneLayout(process).items?.[key] || {};
    return { dx: Number(offset.dx || 0), dy: Number(offset.dy || 0) };
  }

  private setFlowOffset(process: LegacyProcess, key: string, dx: number, dy: number, markDirty: boolean): void {
    this.flowModel.setFlowOffset(process, key, dx, dy);
    if (markDirty) this.adapter.touch();
  }

  private snapPosition(process: LegacyProcess, nodeId: string, x: number, y: number): { x: number; y: number } {
    const current = this.flowNodes(process).find((node) => node.baseId === nodeId || node.id === nodeId);
    if (!current) return { x, y };
    let nextX = x;
    let nextY = y;
    const threshold = 10;
    for (const other of this.flowNodes(process)) {
      if (other.baseId === nodeId || other.id === nodeId) continue;
      const candidatesX = [other.x, other.x + other.width / 2 - current.width / 2, other.x + other.width - current.width];
      for (const candidate of candidatesX) {
        if (Math.abs(nextX - candidate) <= threshold) nextX = candidate;
      }
      const candidatesY = [other.y, other.y + other.height / 2 - current.height / 2, other.y + other.height - current.height];
      for (const candidate of candidatesY) {
        if (Math.abs(nextY - candidate) <= threshold) nextY = candidate;
      }
    }
    for (const lane of this.lanes(process)) {
      const laneCenter = lane.top + lane.height / 2 - current.height / 2;
      if (Math.abs(nextY - laneCenter) <= threshold) nextY = laneCenter;
    }
    return this.clampNodePosition(process, current.baseId, nextX, nextY, current.width, current.height, current.role);
  }

  private clampNodePosition(process: LegacyProcess, nodeId: string, x: number, y: number, width: number, height: number, roleName: string): { x: number; y: number } {
    // Module intent: every rendered element must stay inside the swimlane canvas; snapping may align, but it may not push nodes outside the diagram.
    const minX = nodeId === 'START' ? this.laneTitleWidth + 18 : this.laneTitleWidth + 24;
    const maxX = Math.max(minX, this.canvasWidth(process) - width - 24);
    const laneBottom = this.lanes(process).length * this.laneHeight;
    let minY = 12;
    let maxY = Math.max(minY, laneBottom - height - 12);

    // Boundary detail: task nodes are locked to their own role lane. Moving across lanes would silently rewrite modeling responsibility.
    if (roleName) {
      const lane = this.lanes(process).find((item) => item.name === roleName);
      if (lane) {
        minY = lane.top + 10;
        maxY = Math.max(minY, lane.top + lane.height - height - 10);
      }
    }

    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    };
  }

  private collapsePrototypeVersions(process: LegacyProcess): void {
    const processId = this.processId(process);
    for (const file of this.prototypeFiles(process)) {
      const prototypeUid = this.prototypeUid(file);
      if (prototypeUid && this.adapter.isPrototypeExpanded(processId, prototypeUid)) {
        this.adapter.togglePrototypeVersions(processId, prototypeUid);
      }
    }
    this.attachmentDrawerOpen.set(true);
    this.refresh();
  }

  private inferGatewayLane(process: LegacyProcess, gatewayId: string): string {
    const edge = this.edges(process).find((item) => String(item.to || '') === gatewayId)
      || this.edges(process).find((item) => String(item.from || '') === gatewayId);
    const relatedId = String(edge?.from || edge?.to || '');
    const task = this.tasks(process).find((item) => this.taskId(item) === relatedId);
    return task ? this.roleName(this.taskRoleId(task)) : '';
  }

  private stageIdsForProcess(process: LegacyProcess): string[] {
    const processId = this.processId(process);
    const ids = this.adapter.stageFlowRefs()
      .filter((ref) => String(ref.processUid || ref.processId || '').trim() === processId)
      .map((ref) => String(ref.stageUid || ref.stageId || '').trim())
      .filter(Boolean);
    const direct = String((process as { stageUid?: string; stageId?: string }).stageUid || (process as { stageUid?: string; stageId?: string }).stageId || '').trim();
    if (direct) ids.push(direct);
    return [...new Set(ids)];
  }

  private refresh(): void {
    this.version.update((value) => value + 1);
  }
}
