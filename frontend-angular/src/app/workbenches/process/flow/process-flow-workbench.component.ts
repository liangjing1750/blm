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

interface FlowLabelDragState {
  edgeId: string;
  startX: number;
  startY: number;
  startOffset: { dx: number; dy: number };
  timer: number | null;
  dragging: boolean;
}

interface FlowAlignmentGuide {
  id: string;
  axis: 'x' | 'y';
  position: number;
  from: number;
  to: number;
}

interface FlowDragPreview {
  nodeId: string;
  dx: number;
  dy: number;
  guides: FlowAlignmentGuide[];
}

interface FlowAlignmentHit {
  distance: number;
  delta: number;
  position: number;
  from: number;
  to: number;
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
  protected readonly editingNodeNameId = signal<string>('');
  protected readonly editingEdgeLabelId = signal<string>('');
  protected readonly cardRolePickerNodeId = signal<string>('');
  protected readonly selectedStageId = signal<string>('');
  protected readonly attachmentDrawerOpen = signal(false);
  protected readonly zoomValue = signal(1);
  protected readonly dragState = signal<FlowDragState | null>(null);
  protected readonly labelDragState = signal<FlowLabelDragState | null>(null);
  protected readonly dragPreview = signal<FlowDragPreview | null>(null);
  protected readonly previewPoint = signal<{ x: number; y: number } | null>(null);
  protected readonly adapter = createProcessEditorLegacyAdapter();
  private readonly flowModel = inject(ProcessFlowModelService);
  protected readonly laneHeight = 96;
  protected readonly laneTitleWidth = 86;
  protected readonly nodeWidth = 132;
  protected readonly nodeHeight = 54;
  protected readonly terminalWidth = 50;
  protected readonly terminalHeight = 18;
  // 对齐旧版 process.js 布局常量：firstNodeX=180, colW=180, startX=130
  protected readonly graphStartX = 130;
  protected readonly graphNodeStartX = 180;
  protected readonly columnGap = 180;
  private readonly snapThreshold = 6;
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
    const nodeId = String(node.baseId || node.id || '');
    this.cardRolePickerNodeId.set(this.cardRolePickerNodeId() === nodeId ? '' : nodeId);
    this.rolePickerOpen.set(false);
  }

  // 重命名节点
  protected renameFlowNode(node: any, event: MouseEvent): void {
    event.stopPropagation();
    this.startNodeNameEdit(node, event);
  }

  // 模块意图：流程图卡片只承载轻量属性编辑，避免再弹出遮挡拖拽/连线的节点编辑窗。
  protected startNodeNameEdit(node: any, event: MouseEvent): void {
    event.stopPropagation();
    const nodeId = String(node.baseId || node.id || '');
    this.selectedElementId.set(nodeId);
    this.editingNodeNameId.set(nodeId);
    this.cardRolePickerNodeId.set('');
    window.setTimeout(() => {
      const input = document.getElementById(this.nodeNameInputId(node)) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  protected finishNodeNameEdit(event?: Event): void {
    event?.stopPropagation();
    this.editingNodeNameId.set('');
  }

  protected editableNodeName(node: any): string {
    return node.task?.name || node.gateway?.title || node.name || '';
  }

  protected setEditableNodeName(node: any, value: string): void {
    if (node.task) {
      this.setTaskName(node.task, value);
      return;
    }
    if (node.gateway) this.setGateway(node.gateway, 'title', value);
  }

  protected handleNodeNameKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      this.finishNodeNameEdit(event);
    }
  }

  protected nodeNameInputId(node: any): string {
    return `process-flow-node-name-${String(node.baseId || node.id || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  protected isEditingNodeName(node: any): boolean {
    return this.editingNodeNameId() === String(node.baseId || node.id || '');
  }

  protected isCardRolePickerOpen(node: any): boolean {
    return this.cardRolePickerNodeId() === String(node.baseId || node.id || '');
  }

  protected closeCardRolePicker(event?: Event): void {
    event?.stopPropagation();
    this.cardRolePickerNodeId.set('');
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
    // Key flow: lanes come from task ownership. A gateway may inherit a lane for placement,
    // but its old role_id is only a layout hint and must not create an "unassigned" lane.
    const names = new Set<string>();
    for (const task of this.tasks(process)) {
      const roleIds = this.taskRoleIds(task);
      if (!roleIds.length) names.add('\u672a\u5206\u914d\u89d2\u8272');
      for (const roleId of roleIds) names.add(this.roleName(roleId) || '\u672a\u5206\u914d\u89d2\u8272');
    }
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
    return Math.max(260, laneBottom + 120, nodeBottom + 180);
  }

  protected flowNodes(process: LegacyProcess): FlowCanvasNode[] {
    const tasks = new Map(this.tasks(process).map((task) => [this.taskId(task), task]));
    const gateways = new Map(this.gateways(process).map((gateway) => [this.gatewayId(gateway), gateway]));
    const laneMap = new Map(this.lanes(process).map((lane, index) => [lane.name, index]));
    const primaryNodesById = new Map<string, FlowCanvasNode>();
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
        const connected = this.connectedNodesForBoundary(process, id, primaryNodesById);
        const connectedCenterY = connected.length
          ? connected.reduce((sum, node) => sum + node.y + node.height / 2, 0) / connected.length
          : this.laneHeight / 2;
        const connectedRight = connected.length ? Math.max(...connected.map((node) => node.x + node.width)) : x;
        const baseX = kind === 'end' ? Math.max(x, connectedRight + 72) : x;
        const clamped = this.clampNodePosition(process, id, baseX + offset.dx, connectedCenterY - this.terminalHeight / 2 + offset.dy, this.terminalWidth, this.terminalHeight, '');
        const boundaryNode = {
          id,
          baseId: id,
          kind,
          name: id === 'START' ? '\u5f00\u59cb' : '\u7ed3\u675f',
          role: '',
          shared: false,
          x: clamped.x,
          y: clamped.y,
          width: this.terminalWidth,
          height: this.terminalHeight,
        };
        primaryNodesById.set(id, boundaryNode);
        return [boundaryNode];
      }
      return visibleRoleNames.map((roleName, roleIndex) => {
        const laneIndex = laneMap.get(roleName) ?? 0;
        const offset = this.flowOffset(process, id);
        const width = kind === 'gateway' ? 86 : this.nodeWidth;
        const height = kind === 'gateway' ? 76 : this.nodeHeight;
        const baseY = laneIndex * this.laneHeight + Math.round((this.laneHeight - height) / 2);
        const clamped = this.clampNodePosition(process, id, x + offset.dx, baseY + offset.dy, width, height, roleName);
        const canvasNode = {
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
        if (!primaryNodesById.has(id)) primaryNodesById.set(id, canvasNode);
        return canvasNode;
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
        const startX = Math.round(from.x + from.width);
        const startY = Math.round(from.y + from.height / 2);
        const endX = Math.round(to.x);
        const endY = Math.round(to.y + to.height / 2);
        const sameRow = Math.abs(startY - endY) < 2;
        const midX = Math.max(startX + 24, Math.round((startX + endX) / 2));
        // 对齐旧版 renderProcessFlowView：同行节点用直线，否则用肘形路径
        const d = sameRow
          ? `M ${startX} ${startY} L ${endX} ${endY}`
          : `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
        const edgeId = this.edgeId(edge) || `edge-${index}`;
        const labelOffset = this.flowLabelOffset(process, edgeId);
        return {
          id: `${edgeId}::${from.id}::${to.id}`,
          baseId: edgeId,
          label: fromIndex === 0 && toIndex === 0 ? String(edge.label || edge.condition || '') : '',
          d,
          labelX: midX + 6 + labelOffset.dx,
          labelY: (startY + endY) / 2 - 8 + labelOffset.dy,
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

  protected selectedFlowEdge(process: LegacyProcess): FlowCanvasEdge | null {
    return this.flowEdges(process).find((edge) => edge.baseId === this.selectedElementId()) || null;
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
    this.cardRolePickerNodeId.set('');
  }

  protected alignmentGuides(): FlowAlignmentGuide[] {
    return this.dragPreview()?.guides || [];
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

  protected openEdgeLabelEditor(edgeId: string, event?: Event): void {
    event?.stopPropagation();
    this.selectedElementId.set(edgeId);
    this.editingEdgeLabelId.set(edgeId);
    window.setTimeout(() => {
      const input = document.getElementById(this.edgeLabelInputId(edgeId)) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  protected edgeLabelInputId(edgeId: string): string {
    return `process-flow-edge-label-${edgeId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  protected finishEdgeLabelEdit(event?: Event): void {
    event?.stopPropagation();
    this.editingEdgeLabelId.set('');
  }

  protected handleEdgeLabelKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      this.finishEdgeLabelEdit(event);
    }
  }

  protected startEdgeLabelDrag(edge: FlowCanvasEdge, event: PointerEvent): void {
    if (!this.editing) return;
    event.stopPropagation();
    const process = this.currentProcess();
    if (!process) return;
    const startOffset = this.flowLabelOffset(process, edge.baseId);
    const timer = window.setTimeout(() => {
      const current = this.labelDragState();
      if (current?.edgeId === edge.baseId) this.labelDragState.set({ ...current, dragging: true, timer: null });
    }, 220);
    this.labelDragState.set({
      edgeId: edge.baseId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset,
      timer,
      dragging: false,
    });
  }

  protected moveEdgeLabelDrag(event: MouseEvent | PointerEvent): void {
    const drag = this.labelDragState();
    const process = this.currentProcess();
    if (!drag || !process) return;
    const dx = (event.clientX - drag.startX) / this.zoomValue();
    const dy = (event.clientY - drag.startY) / this.zoomValue();
    if (!drag.dragging) {
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.clearEdgeLabelDragTimer(drag);
      return;
    }
    this.flowModel.setFlowLabelOffset(process, drag.edgeId, drag.startOffset.dx + dx, drag.startOffset.dy + dy);
    this.adapter.touch();
    this.refresh();
  }

  protected finishEdgeLabelDrag(event?: Event): void {
    const drag = this.labelDragState();
    if (!drag) return;
    event?.stopPropagation();
    if (drag) this.clearEdgeLabelDragTimer(drag);
    this.labelDragState.set(null);
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
    this.cardRolePickerNodeId.set('');
    this.editingNodeNameId.set('');
    this.editingEdgeLabelId.set('');
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
    this.finishEdgeLabelDrag(event);
    this.finishNodeDrag(event);
  }

  @HostListener('document:pointermove', ['$event'])
  protected onDocumentPointerMove(event: PointerEvent): void {
    this.moveEdgeLabelDrag(event);
    this.moveNodeDrag(event);
  }

  @HostListener('window:pointerup', ['$event'])
  protected onWindowPointerUp(event: PointerEvent): void {
    this.finishEdgeLabelDrag(event);
    this.finishNodeDrag(event);
  }

  protected startNodeDrag(event: MouseEvent | PointerEvent, node: FlowCanvasNode): void {
    if (!this.editing) return;
    if (typeof event.button === 'number' && event.button !== 0) return;
    if (this.isNodeCardControl(event.target)) return;
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
    this.dragPreview.set({ nodeId: node.baseId, dx: this.flowOffset(process, node.baseId).dx, dy: this.flowOffset(process, node.baseId).dy, guides: [] });
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
    const current = this.flowNodes(process).find((node) => node.baseId === drag.nodeId || node.id === drag.nodeId);
    if (!current) return;
    const free = this.clampNodePosition(process, drag.nodeId, drag.startNodeX + dx, drag.startNodeY + dy, current.width, current.height, current.role);
    const alignment = this.alignmentForPosition(process, drag.nodeId, free.x, free.y, current.width, current.height, current.role);
    this.dragPreview.set({
      nodeId: drag.nodeId,
      dx: drag.startOffset.dx + free.x - drag.startNodeX,
      dy: drag.startOffset.dy + free.y - drag.startNodeY,
      guides: alignment.guides,
    });
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
    this.dragPreview.set(null);
    this.selectedElementId.set(drag.nodeId);
    this.refresh();
  }

  private isNodeCardControl(target: EventTarget | null): boolean {
    // 边界细节：卡片内按钮、输入框和角色下拉不应启动拖拽，否则编辑名称/角色会误移动节点。
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (element.closest('.flow-terminal,.flow-gateway')) return false;
    return Boolean(element.closest('button,input,select,textarea,label,.flow-node-role-picker,.flow-node-edit-icon,.flow-gateway-edit-icon'));
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
    // Boundary detail: legacy branch diagrams may encounter END before a later branch task.
    // END is a visual boundary, so keep it as the rightmost column after all real nodes.
    return [...ordered.filter((id) => id !== 'END'), 'END'];
  }

  private flowOffset(process: LegacyProcess, key: string): Required<ProcessFlowLayoutOffset> {
    const offset = this.flowModel.swimlaneLayout(process).items?.[key] || {};
    const preview = this.dragPreview();
    if (preview?.nodeId === key) return { dx: preview.dx, dy: preview.dy };
    return { dx: Number(offset.dx || 0), dy: Number(offset.dy || 0) };
  }

  private flowLabelOffset(process: LegacyProcess, key: string): Required<ProcessFlowLayoutOffset> {
    const offset = this.flowModel.swimlaneLayout(process).labels?.[key] || {};
    return { dx: Number(offset.dx || 0), dy: Number(offset.dy || 0) };
  }

  private clearEdgeLabelDragTimer(drag: FlowLabelDragState): void {
    if (drag.timer !== null) window.clearTimeout(drag.timer);
  }

  private setFlowOffset(process: LegacyProcess, key: string, dx: number, dy: number, markDirty: boolean): void {
    this.flowModel.setFlowOffset(process, key, dx, dy);
    if (markDirty) this.adapter.touch();
  }

  private snapPosition(process: LegacyProcess, nodeId: string, x: number, y: number): { x: number; y: number } {
    const current = this.flowNodes(process).find((node) => node.baseId === nodeId || node.id === nodeId);
    if (!current) return { x, y };
    const free = this.clampNodePosition(process, current.baseId, x, y, current.width, current.height, current.role);
    const alignment = this.alignmentForPosition(process, current.baseId, free.x, free.y, current.width, current.height, current.role);
    return this.clampNodePosition(process, current.baseId, alignment.x, alignment.y, current.width, current.height, current.role);
  }

  private alignmentForPosition(process: LegacyProcess, nodeId: string, x: number, y: number, width: number, height: number, roleName: string): { x: number; y: number; guides: FlowAlignmentGuide[] } {
    // 关键流程：拖动中只计算辅助线；松手时复用同一结果做轻量吸附，避免移动时被吸附点拉住。
    const nodes = this.flowNodes(process).filter((node) => node.baseId !== nodeId && node.id !== nodeId);
    const canvasW = this.canvasWidth(process);
    const canvasH = this.canvasHeight(process);
    const current = {
      left: x,
      centerX: x + width / 2,
      right: x + width,
      top: y,
      centerY: y + height / 2,
      bottom: y + height,
    };
    let bestX: FlowAlignmentHit | null = null;
    let bestY: FlowAlignmentHit | null = null;
    const considerX = (target: number, source: number, otherTop: number, otherBottom: number) => {
      const distance = Math.abs(source - target);
      if (distance > this.snapThreshold || (bestX && distance >= bestX.distance)) return;
      bestX = { distance, delta: target - source, position: target, from: Math.min(y, otherTop) - 18, to: Math.max(y + height, otherBottom) + 18 };
    };
    const considerY = (target: number, source: number, otherLeft: number, otherRight: number) => {
      const distance = Math.abs(source - target);
      if (distance > this.snapThreshold || (bestY && distance >= bestY.distance)) return;
      bestY = { distance, delta: target - source, position: target, from: Math.min(x, otherLeft) - 18, to: Math.max(x + width, otherRight) + 18 };
    };
    for (const other of nodes) {
      const otherEdges = {
        left: other.x,
        centerX: other.x + other.width / 2,
        right: other.x + other.width,
        top: other.y,
        centerY: other.y + other.height / 2,
        bottom: other.y + other.height,
      };
      considerX(otherEdges.left, current.left, other.y, other.y + other.height);
      considerX(otherEdges.centerX, current.centerX, other.y, other.y + other.height);
      considerX(otherEdges.right, current.right, other.y, other.y + other.height);
      considerY(otherEdges.top, current.top, other.x, other.x + other.width);
      considerY(otherEdges.centerY, current.centerY, other.x, other.x + other.width);
      considerY(otherEdges.bottom, current.bottom, other.x, other.x + other.width);
    }
    for (const lane of this.lanes(process)) {
      const target = lane.top + lane.height / 2;
      considerY(target, current.centerY, this.laneTitleWidth, canvasW);
    }
    const guides: FlowAlignmentGuide[] = [];
    const xHit = bestX as FlowAlignmentHit | null;
    const yHit = bestY as FlowAlignmentHit | null;
    if (xHit) {
      guides.push({ id: `x-${Math.round(xHit.position)}`, axis: 'x', position: Math.round(xHit.position), from: Math.max(0, Math.round(xHit.from)), to: Math.min(canvasH, Math.round(xHit.to)) });
    }
    if (yHit) {
      guides.push({ id: `y-${Math.round(yHit.position)}`, axis: 'y', position: Math.round(yHit.position), from: Math.max(this.laneTitleWidth, Math.round(yHit.from)), to: Math.min(canvasW, Math.round(yHit.to)) });
    }
    return { x: x + (xHit?.delta || 0), y: y + (yHit?.delta || 0), guides };
  }

  private clampNodePosition(process: LegacyProcess, nodeId: string, x: number, y: number, width: number, height: number, roleName: string): { x: number; y: number } {
    // Module intent: every rendered element must stay inside the swimlane canvas; snapping may align, but it may not push nodes outside the diagram.
    const minX = nodeId === 'START' ? this.laneTitleWidth + 18 : this.laneTitleWidth + 24;
    const maxX = Math.max(minX, this.canvasWidth(process) - width - 24);
    const laneBottom = this.lanes(process).length * this.laneHeight;
    let minY = 0;
    let maxY = Math.max(minY, laneBottom + 180 - height - 24);

    // Boundary detail: dragging only changes private layout offsets. Role/lane ownership is still edited through role controls, so legacy diagrams that already moved nodes outside a lane keep rendering correctly.

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

  private connectedNodesForBoundary(process: LegacyProcess, boundaryId: string, nodesById: Map<string, FlowCanvasNode>): FlowCanvasNode[] {
    // Boundary detail: old swimlane diagrams placed START/END against their connected nodes.
    // Keeping that rule avoids shifting historical diagrams when gateway roles are ignored.
    return this.edges(process)
      .filter((edge) => boundaryId === 'START' ? String(edge.from || '') === boundaryId : String(edge.to || '') === boundaryId)
      .map((edge) => nodesById.get(boundaryId === 'START' ? String(edge.to || '') : String(edge.from || '')))
      .filter((node): node is FlowCanvasNode => Boolean(node));
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
