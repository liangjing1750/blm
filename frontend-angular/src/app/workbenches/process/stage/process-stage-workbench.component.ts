import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { confirmRuntimeAction } from '../../../core/runtime/angular-runtime';
import {
  LegacyProcess,
  LegacyStage,
  LegacyStageFlowLink,
  LegacyStageFlowRef,
  ProcessStageLegacyAdapter,
  createProcessStageLegacyAdapter,
} from './process-stage-legacy-adapter';
import {
  getValueDomainColumnUid,
  getValueDomainLaneUid,
  ValueDomainColumn,
  ValueDomainLane,
} from '../../../core/document/value-domain-model';

interface FlowNode {
  ref: LegacyStageFlowRef;
  process: LegacyProcess | null;
  id: string;
  processId: string;
  label: string;
  group: string;
  x: number;
  y: number;
}

interface FlowLink {
  link: LegacyStageFlowLink;
  from: FlowNode;
  to: FlowNode;
  path: string;
}

interface FlowGroupBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}


interface FlowDragState {
  nodeId: string;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  dx: number;
  dy: number;
  targetGroup: string;
}

@Component({
  selector: 'app-process-stage-workbench',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './process-stage-workbench.component.html',
  styleUrl: './process-stage-workbench.component.scss',
})
export class ProcessStageWorkbenchComponent implements OnInit, OnDestroy {

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
  // 模块意图：阶段视图的 Angular 渲染层。流程工作台壳仍由 legacy 控制，本组件负责阶段全景和阶段详情画布。
  protected readonly version = signal(0);
  protected readonly renamingStageId = signal('');
  protected readonly draftLinkFromRefId = signal('');
  protected readonly dragState = signal<FlowDragState | null>(null);

  protected readonly adapter: ProcessStageLegacyAdapter = createProcessStageLegacyAdapter();
  @Input() exportGraphId = '';
  @Input() previewMode: 'auto' | 'panorama' | 'detail' = 'auto';
  @Input() previewStageId = '';
  @Output() readonly processEditorRequested = new EventEmitter<string>();
  private readonly stageSlotWidth = 184;
  private readonly stageSlotHeight = 38;
  private readonly stageBoardPad = 8;
  private readonly flowNodeWidth = 62;
  private readonly flowNodeHeight = 128;
  private readonly flowGapX = 46;
  private readonly flowRowGap = 34;
  private readonly flowPadX = 24;
  private readonly flowPadY = 38;

  protected mode(): 'panorama' | 'detail' {
    this.version();
    if (this.previewMode !== 'auto') return this.previewMode;
    return this.adapter.ui().stageViewMode === 'detail' ? 'detail' : 'panorama';
  }

  protected editing(): boolean {
    this.version();
    if (this.previewMode !== 'auto') return false;
    return this.adapter.ui().stageEditorCollapsed === false;
  }

  protected stages(): LegacyStage[] {
    this.version();
    return this.adapter.stages().filter((stage) => !stage.virtual);
  }

  protected currentStage(): LegacyStage | null {
    const currentId = String(this.previewStageId || this.adapter.ui().stageId || '');
    return this.stages().find((stage) => this.stageId(stage) === currentId || stage.id === currentId || stage.uid === currentId)
      || this.stages()[0]
      || null;
  }

  protected businessDomainLabel(stage: LegacyStage): string {
    const stageLaneId = String(stage.panoramaLaneUid || stage.panoramaLaneId || '').trim();
    const lane = this.lanes().find((item) => this.laneUid(item) === stageLaneId)
      || this.lanes().find((_, index) => index === 0);
    return lane?.name || '未归属业务域';
  }

  protected stageId(stage: LegacyStage): string {
    return this.adapter.stageId(stage);
  }

  protected columns() {
    this.version();
    return this.adapter.columns();
  }

  protected lanes() {
    this.version();
    return this.adapter.lanes();
  }

  protected columnUid(column: ValueDomainColumn): string {
    return getValueDomainColumnUid(column);
  }

  protected laneUid(lane: ValueDomainLane): string {
    return getValueDomainLaneUid(lane);
  }

  protected gridTemplateColumns(): string {
    const axisMin = this.editing() ? 220 : 154;
    const tracks = this.columns().map((column) => `${this.columnWidth(this.columnUid(column))}px`).join(' ');
    return `${axisMin}px ${tracks}`;
  }

  protected cellStages(laneId: string, columnId: string): LegacyStage[] {
    return this.stages().filter((stage, index) => (
      (stage.panoramaLaneUid || stage.panoramaLaneId || getValueDomainLaneUid(this.lanes()[0]) || '') === laneId
      && (stage.panoramaColumnUid || stage.panoramaColumnId || getValueDomainColumnUid(this.columns()[index % Math.max(1, this.columns().length)]) || '') === columnId
    ));
  }

  protected stageStyle(stage: LegacyStage, index: number): Record<string, string> {
    const slot = this.stageSlot(stage, index);
    return {
      left: `${this.stageBoardPad + slot.col * this.stageSlotWidth}px`,
      top: `${this.stageBoardPad + slot.row * this.stageSlotHeight}px`,
      width: `${this.stageNodeWidth(stage)}px`,
    };
  }

  protected stageBoardStyle(stages: LegacyStage[]): Record<string, string> {
    return {
      minWidth: `${this.stageBoardWidth(stages)}px`,
      height: `${this.stageBoardHeight(stages)}px`,
    };
  }

  protected openStage(stage: LegacyStage): void {
    if (this.editing()) return;
    this.adapter.openDetail(this.stageId(stage));
  }

  protected openPanorama(): void {
    this.adapter.openPanorama();
  }

  protected startStageRename(stage: LegacyStage, event: MouseEvent): void {
    if (!this.editing()) return;
    event.preventDefault();
    event.stopPropagation();
    this.renamingStageId.set(this.stageId(stage));
  }

  protected finishStageRename(stage: LegacyStage, value: string): void {
    const text = value.trim();
    if (text) this.adapter.setStageName(this.stageId(stage), text);
    this.renamingStageId.set('');
    this.refresh();
  }

  protected flowNodes(): FlowNode[] {
    const stage = this.currentStage();
    if (!stage) return [];
    const drag = this.dragState();
    const refs = this.adapter.stageProcesses(this.stageId(stage));
    const rowKeys = new Map<string, number>();
    const rowCols = new Map<string, number>();
    const groupCounts = new Map<string, number>();
    refs.forEach(({ ref, process }) => {
      const id = this.adapter.refId(ref);
      const key = String(process?.flowGroup || '').trim() || id;
      rowKeys.set(key, rowKeys.get(key) ?? rowKeys.size);
      rowCols.set(id, groupCounts.get(key) || 0);
      groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
    });
    return refs.map(({ ref, process }) => {
      const id = this.adapter.refId(ref);
      const key = String(process?.flowGroup || '').trim() || id;
      const row = rowKeys.get(key) || 0;
      const col = rowCols.get(id) || 0;
      return {
        ref,
        process,
        id,
        processId: this.adapter.processId(process),
        label: process?.name || 'Invalid process ref',
        group: process?.flowGroup || '',
        x: this.flowPadX + col * (this.flowNodeWidth + this.flowGapX) + Math.round(Number(ref.pos?.x || 0)) + (drag?.nodeId === id ? drag.dx : 0),
        y: this.flowPadY + row * (this.flowNodeHeight + this.flowRowGap) + Math.round(Number(ref.pos?.y || 0)) + (drag?.nodeId === id ? drag.dy : 0),
      };
    });
  }

  protected availableProcesses(): LegacyProcess[] {
    const stage = this.currentStage();
    if (!stage) return [];
    // 模块意图：阶段视图只允许“无阶段流程”被加入，避免同一流程被多个阶段共同管理。
    // 关键流程：从全局阶段引用表收集已归属流程，而不是只看当前阶段画布上的节点。
    // 边界细节：兼容 processUid/processId 以及 uid/id 两套历史字段，避免旧文档重复挂载。
    const usedIds = new Set((this.adapter.document().stageFlowRefs || [])
      .map((ref) => String(ref.processUid || ref.processId || '').trim())
      .filter(Boolean));
    return this.adapter.processes().filter((process) => !usedIds.has(this.adapter.processId(process)));
  }

  protected flowLinks(): FlowLink[] {
    const stage = this.currentStage();
    if (!stage) return [];
    const nodeById = new Map(this.flowNodes().map((node) => [node.id, node]));
    return this.adapter.stageLinks(this.stageId(stage))
      .map((link, index) => {
        const from = nodeById.get(link.fromRefUid || link.fromRefId || '');
        const to = nodeById.get(link.toRefUid || link.toRefId || '');
        if (!from || !to) return null;
        return { link, from, to, path: this.routeFlowLink(from, to, index) };
      })
      .filter((link): link is FlowLink => Boolean(link));
  }

  protected flowGroups(): FlowGroupBox[] {
    const groups = new Map<string, FlowNode[]>();
    for (const node of this.flowNodes()) {
      const label = node.group.trim();
      if (!label) continue;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)?.push(node);
    }
    return [...groups.entries()].map(([label, nodes], index) => {
      const minX = Math.min(...nodes.map((node) => node.x));
      const maxX = Math.max(...nodes.map((node) => node.x + this.flowNodeWidth));
      const minY = Math.min(...nodes.map((node) => node.y));
      const maxY = Math.max(...nodes.map((node) => node.y + this.flowNodeHeight));
      return {
        id: `group-${index}-${label}`,
        label,
        x: Math.max(6, minX - 14),
        y: Math.max(6, minY - 28),
        w: Math.max(92, maxX - minX + 28),
        h: Math.max(this.flowNodeHeight + 58, maxY - minY + 58),
      };
    });
  }

  protected flowBoardStyle(): Record<string, string> {
    const nodes = this.flowNodes();
    const width = Math.max(720, ...nodes.map((node) => node.x + this.flowNodeWidth + this.flowPadX));
    const height = Math.max(260, ...nodes.map((node) => node.y + this.flowNodeHeight + this.flowPadY));
    return {
      width: `${width}px`,
      height: `${height}px`,
    };
  }

  protected flowNodeStyle(node: FlowNode): Record<string, string> {
    const isDragging = this.dragState()?.nodeId === node.id;
    return {
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${this.flowNodeWidth}px`,
      height: `${this.flowNodeHeight}px`,
      zIndex: isDragging ? '5' : '',
    };
  }

  protected isGroupDragTarget(group: FlowGroupBox): boolean {
    return this.dragState()?.targetGroup === group.label;
  }

  protected setProcessName(node: FlowNode, value: string): void {
    this.adapter.setProcessName(node.processId, value);
    this.refresh();
  }

  protected setProcessGroup(node: FlowNode, value: string): void {
    this.adapter.setProcessGroup(node.processId, value);
    this.refresh();
  }

  protected clearProcessGroup(node: FlowNode): void {
    this.adapter.setProcessGroup(node.processId, '');
    this.refresh();
  }

  protected startFlowNodeDrag(node: FlowNode, event: MouseEvent): void {
    if (!this.editing() || event.button !== 0 || this.isInteractiveDragChild(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const startOffset = node.ref.pos || {};
    const nextState: FlowDragState = {
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: Math.round(Number(startOffset.x || 0)),
      startOffsetY: Math.round(Number(startOffset.y || 0)),
      dx: 0,
      dy: 0,
      targetGroup: '',
    };
    this.dragState.set(nextState);
    document.addEventListener('mousemove', this.onDocumentFlowDrag);
    document.addEventListener('mouseup', this.onDocumentFlowDragEnd);
  }

  protected addProcess(): void {
    const stage = this.currentStage();
    if (!stage) return;
    this.adapter.addProcess(this.stageId(stage));
    this.refresh();
  }

  protected addExistingProcess(processId: string): void {
    const stage = this.currentStage();
    if (!stage || !processId) return;
    this.adapter.addExistingProcess(this.stageId(stage), processId);
    this.refresh();
  }

  protected removeProcess(node: FlowNode): void {
    const stage = this.currentStage();
    if (!stage) return;
    this.adapter.removeProcessFromStage(this.stageId(stage), node.processId);
    this.refresh();
  }

  protected async deleteProcess(node: FlowNode): Promise<void> {
    if (!node.processId) return;
    const confirmed = await confirmRuntimeAction(`确认删除流程“${node.label || node.processId}”吗？相关阶段引用和阶段连线也会一并移除。`, {
      title: '删除流程',
      confirmLabel: '删除',
    });
    if (!confirmed) return;
    this.adapter.deleteProcess(node.processId);
    this.refresh();
  }

  protected openProcess(node: FlowNode): void {
    if (node.processId) this.processEditorRequested.emit(node.processId);
  }

  protected beginLink(node: FlowNode): void {
    this.draftLinkFromRefId.set(node.id);
  }

  protected cancelLink(): void {
    this.draftLinkFromRefId.set('');
  }

  protected completeLink(node: FlowNode): void {
    const stage = this.currentStage();
    const from = this.draftLinkFromRefId();
    if (!stage || !from) return;
    this.adapter.addLink(this.stageId(stage), from, node.id);
    this.draftLinkFromRefId.set('');
    this.refresh();
  }

  protected removeLink(link: FlowLink): void {
    const stage = this.currentStage();
    if (!stage) return;
    this.adapter.removeLink(this.stageId(stage), link.link.id || link.link.uid || '');
    this.refresh();
  }

  private readonly onDocumentFlowDrag = (event: MouseEvent): void => {
    const drag = this.dragState();
    if (!drag) return;
    const dx = Math.round(event.clientX - drag.startX);
    const dy = Math.round(event.clientY - drag.startY);
    this.dragState.set({
      ...drag,
      dx,
      dy,
      targetGroup: this.findDragTargetGroup(drag.nodeId, dx, dy),
    });
  };

  private readonly onDocumentFlowDragEnd = (event: MouseEvent): void => {
    const drag = this.dragState();
    document.removeEventListener('mousemove', this.onDocumentFlowDrag);
    document.removeEventListener('mouseup', this.onDocumentFlowDragEnd);
    if (!drag) return;
    const dx = Math.round(event.clientX - drag.startX);
    const dy = Math.round(event.clientY - drag.startY);
    this.dragState.set({ ...drag, dx, dy });
    const targetGroup = this.findDragTargetGroup(drag.nodeId, dx, dy);
    const node = this.flowNodes().find((item) => item.id === drag.nodeId);
    this.dragState.set(null);
    if (!node || (Math.abs(dx) < 5 && Math.abs(dy) < 5)) {
      this.refresh();
      return;
    }
    if (targetGroup) {
      this.adapter.setProcessGroup(node.processId, targetGroup);
      this.refresh();
      return;
    }
    this.adapter.setRefOffset(node.id, {
      x: drag.startOffsetX + dx,
      y: drag.startOffsetY + dy,
    });
    this.refresh();
  };

  private refresh(): void {
    this.version.update((value) => value + 1);
  }

  private isInteractiveDragChild(target: EventTarget | null): boolean {
    return Boolean((target as HTMLElement | null)?.closest?.('textarea,input,select,button,.stage-flow-node-group-editor,.stage-flow-node-actions'));
  }

  private findDragTargetGroup(nodeId: string, dx: number, dy: number): string {
    const dragNode = this.flowNodes().find((node) => node.id === nodeId);
    if (!dragNode) return '';
    const centerX = dragNode.x + dx + this.flowNodeWidth / 2;
    const centerY = dragNode.y + dy + this.flowNodeHeight / 2;
    return this.flowGroups().find((group) => {
      if (!group.label || group.label === dragNode.group) return false;
      return centerX >= group.x && centerX <= group.x + group.w && centerY >= group.y && centerY <= group.y + group.h;
    })?.label || '';
  }


  private stageSlot(stage: LegacyStage, index: number): { row: number; col: number } {
    if (stage.panoramaSlot) {
      return { row: Math.max(0, Number(stage.panoramaSlot.row || 0)), col: Math.max(0, Number(stage.panoramaSlot.col || 0)) };
    }
    return { row: Math.floor(index / 2), col: index % 2 };
  }

  private stageNodeWidth(stage: LegacyStage): number {
    const countWidth = this.adapter.processCount(this.stageId(stage)) > 0 ? 24 : 6;
    const textWidth = Array.from(String(stage.name || this.stageId(stage) || '')).reduce((width, char) => (
      width + (/[\u0000-\u00ff]/.test(char) ? 6 : 12)
    ), 0);
    return Math.max(108, textWidth + countWidth + 28);
  }

  private stageBoardWidth(stages: LegacyStage[]): number {
    if (!stages.length) return this.editing() ? 132 : 120;
    return Math.max(this.editing() ? 250 : 132, ...stages.map((stage, index) => {
      const slot = this.stageSlot(stage, index);
      return this.stageBoardPad + slot.col * this.stageSlotWidth + this.stageNodeWidth(stage) + this.stageBoardPad;
    }));
  }

  private stageBoardHeight(stages: LegacyStage[]): number {
    if (!stages.length) return this.editing() ? 48 : 42;
    return Math.max(this.editing() ? 82 : 54, ...stages.map((stage, index) => {
      const slot = this.stageSlot(stage, index);
      return this.stageBoardPad + slot.row * this.stageSlotHeight + 28 + (this.editing() ? 30 : 8);
    }));
  }

  private columnWidth(columnId: string): number {
    const min = this.editing() ? 220 : 210;
    return Math.max(min, ...this.lanes().map((lane) => this.stageBoardWidth(this.cellStages(this.laneUid(lane), columnId)) + 16));
  }

  private routeFlowLink(from: FlowNode, to: FlowNode, index: number): string {
    const sx = from.x + this.flowNodeWidth;
    const sy = from.y + this.flowNodeHeight / 2;
    const tx = to.x;
    const ty = to.y + this.flowNodeHeight / 2;
    const offset = index * 4;
    const midX = sx + Math.max(24, (tx - sx) / 2) + offset;
    return `M ${sx} ${sy} H ${midX} V ${ty} H ${tx}`;
  }
}
