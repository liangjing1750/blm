import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { createValueDomainLegacyAdapter } from './value-domain/value-domain-legacy-adapter';
import {
  ValueDomainCell,
  ValueDomainColumn,
  ValueDomainDocument,
  ValueDomainLane,
  ValueDomainStage,
  ValueDomainStageSlot,
  ensureValueDomainModel,
  ensureValueDomainStages,
  findOrCreateValueDomainCell,
  getValueDomainStageId,
} from './value-domain/value-domain-model';

interface StageDialogState {
  laneId: string;
  columnId: string;
  name: string;
}

interface StageDragState {
  stageId: string;
  startX: number;
  startY: number;
}

interface StageDragTarget {
  laneId: string;
  columnId: string;
  slot: ValueDomainStageSlot;
}

@Component({
  selector: 'app-value-domain-workbench',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './value-domain-workbench.component.html',
  styleUrl: './value-domain-workbench.component.scss',
})
export class ValueDomainWorkbenchComponent {
  // 模块意图：组件只负责“矩阵视觉和用户交互”，所有文档修改都通过 ValueDomainActions 完成。
  protected readonly editing = signal(false);
  protected readonly version = signal(0);
  protected readonly stageDialog = signal<StageDialogState | null>(null);
  protected readonly renamingStageId = signal('');
  protected readonly dragTarget = signal<StageDragTarget | null>(null);

  private readonly legacyAdapter = createValueDomainLegacyAdapter(window);
  private readonly actions = this.legacyAdapter.actions();
  private readonly stageSlotWidth = 184;
  private readonly stageSlotHeight = 38;
  private readonly stageBoardPad = 8;
  private readonly stageCardMinWidth = 108;
  private readonly stageCardHeight = 28;
  private dragState: StageDragState | null = null;

  protected document(): ValueDomainDocument {
    this.version();
    return this.legacyAdapter.document();
  }

  protected columns(): ValueDomainColumn[] {
    return ensureValueDomainModel(this.document(), this.nextId).columns;
  }

  protected lanes(): ValueDomainLane[] {
    return ensureValueDomainModel(this.document(), this.nextId).lanes;
  }

  protected stages(): ValueDomainStage[] {
    return ensureValueDomainStages(this.document());
  }

  protected gridTemplateColumns(): string {
    const axisMin = this.editing() ? 220 : 154;
    const tracks = this.columns().map((column) => `${this.columnWidth(column.id)}px`).join(' ');
    // 关键流程：列宽复刻旧版全景矩阵基础宽度，按该列阶段槽位动态撑宽，但不再被 1fr 二次拉伸。
    return `${axisMin}px ${tracks}`;
  }

  protected cell(laneId: string, columnId: string): ValueDomainCell {
    return findOrCreateValueDomainCell(ensureValueDomainModel(this.document(), this.nextId), laneId, columnId);
  }

  protected stageId(stage: ValueDomainStage): string {
    return getValueDomainStageId(stage);
  }

  protected processCount(stage: ValueDomainStage): number {
    const stageId = this.stageId(stage);
    const processIds = new Set(
      (this.document().processes || [])
        .map((process) => String(process.uid || process.id || '').trim())
        .filter(Boolean),
    );
    return (this.document().stageFlowRefs || [])
      .filter((ref) => String(ref.stageUid || '').trim() === stageId)
      .filter((ref) => processIds.has(String(ref.processUid || '').trim()))
      .length;
  }

  protected cellStages(laneId: string, columnId: string): ValueDomainStage[] {
    return this.stages().filter((stage) => stage.panoramaLaneUid === laneId && stage.panoramaColumnUid === columnId);
  }

  protected stageStyle(stage: ValueDomainStage, index: number): Record<string, string> {
    const slot = this.stageSlot(stage, index);
    return {
      left: `${this.stageBoardPad + slot.col * this.stageSlotWidth}px`,
      top: `${this.stageBoardPad + slot.row * this.stageSlotHeight}px`,
      width: `${this.stageNodeWidth(stage)}px`,
    };
  }

  protected stageBoardStyle(stages: ValueDomainStage[]): Record<string, string> {
    return {
      minWidth: `${this.stageBoardWidth(stages)}px`,
      height: `${this.stageBoardHeight(stages)}px`,
    };
  }

  protected isDragTarget(laneId: string, columnId: string): boolean {
    const target = this.dragTarget();
    return Boolean(target && target.laneId === laneId && target.columnId === columnId);
  }

  protected dragOverlayStyle(laneId: string, columnId: string): Record<string, string> {
    const target = this.dragTarget();
    if (!target || target.laneId !== laneId || target.columnId !== columnId) return { display: 'none' };
    return {
      display: 'block',
      left: `${this.stageBoardPad + target.slot.col * this.stageSlotWidth}px`,
      top: `${this.stageBoardPad + target.slot.row * this.stageSlotHeight}px`,
      width: `${this.stageSlotWidth}px`,
      height: `${this.stageSlotHeight}px`,
    };
  }

  protected setEditing(editing: boolean): void {
    this.editing.set(editing);
  }

  protected addColumn(afterId = ''): void {
    this.actions.addColumn(afterId);
    this.refresh();
  }

  protected moveColumn(column: ValueDomainColumn, dir: number): void {
    this.actions.moveColumn(column.id, dir);
    this.refresh();
  }

  protected async removeColumn(column: ValueDomainColumn): Promise<void> {
    await this.actions.removeColumn(column.id);
    this.refresh();
  }

  protected setColumn(column: ValueDomainColumn, key: 'name' | 'badge' | 'scope', value: string): void {
    this.actions.setColumn(column.id, key, value);
    this.refresh();
  }

  protected addLane(afterId = ''): void {
    this.actions.addLane(afterId);
    this.refresh();
  }

  protected moveLane(lane: ValueDomainLane, dir: number): void {
    this.actions.moveLane(lane.id, dir);
    this.refresh();
  }

  protected async removeLane(lane: ValueDomainLane): Promise<void> {
    await this.actions.removeLane(lane.id);
    this.refresh();
  }

  protected setLane(lane: ValueDomainLane, key: 'name' | 'badge' | 'note', value: string): void {
    this.actions.setLane(lane.id, key, value);
    this.refresh();
  }

  protected setStage(stage: ValueDomainStage, key: 'name' | 'subDomain' | 'panoramaColumnUid' | 'panoramaLaneUid', value: string): void {
    this.actions.setStage(this.stageId(stage), key, value);
    this.refresh();
  }

  protected setCell(cell: ValueDomainCell, key: 'status' | 'text', value: string): void {
    const laneId = cell.laneUid || cell.laneId || '';
    const columnId = cell.columnUid || cell.columnId || '';
    this.actions.setCell(laneId, columnId, key, value);
    this.refresh();
  }

  protected addStage(afterStageId = ''): void {
    this.actions.addStage(afterStageId);
    this.refresh();
  }

  protected addStageInCell(laneId: string, columnId: string): void {
    this.stageDialog.set({ laneId, columnId, name: '' });
  }

  protected setDialogName(value: string): void {
    const state = this.stageDialog();
    if (!state) return;
    this.stageDialog.set({ ...state, name: value });
  }

  protected closeStageDialog(): void {
    this.stageDialog.set(null);
  }

  protected confirmStageDialog(): void {
    const state = this.stageDialog();
    if (!state) return;
    const name = state.name.trim() || `业务阶段${this.stages().length + 1}`;
    const slot = this.nextSlot(state.laneId, state.columnId);
    this.actions.addStage('', { name, laneId: state.laneId, columnId: state.columnId, slot });
    this.stageDialog.set(null);
    this.refresh();
  }

  protected startStageRename(stage: ValueDomainStage, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.renamingStageId.set(this.stageId(stage));
  }

  protected finishStageRename(stage: ValueDomainStage, value: string): void {
    const nextName = value.trim();
    if (nextName) this.actions.setStage(this.stageId(stage), 'name', nextName);
    this.renamingStageId.set('');
    this.refresh();
  }

  protected cancelStageRename(): void {
    this.renamingStageId.set('');
  }

  protected startStageDrag(stage: ValueDomainStage, event: MouseEvent): void {
    if (!this.editing() || this.renamingStageId()) return;
    event.preventDefault();
    this.dragState = {
      stageId: this.stageId(stage),
      startX: event.clientX,
      startY: event.clientY,
    };
    document.addEventListener('mousemove', this.onStageDragMove);
    document.addEventListener('mouseup', this.onStageDragEnd);
  }

  protected moveStage(stage: ValueDomainStage, dir: number): void {
    this.actions.moveStage(this.stageId(stage), dir);
    this.refresh();
  }

  protected async removeStage(stage: ValueDomainStage): Promise<void> {
    await this.actions.removeStage(this.stageId(stage));
    this.refresh();
  }

  private refresh(): void {
    this.version.update((value) => value + 1);
  }

  private stageSlot(stage: ValueDomainStage, index: number): ValueDomainStageSlot {
    if (stage.panoramaSlot) return stage.panoramaSlot;
    return { row: Math.floor(index / 2), col: index % 2 };
  }

  private columnWidth(columnId: string): number {
    const columnMin = this.editing() ? 220 : 210;
    const required = this.lanes().reduce((maxWidth, lane) => {
      const stages = this.cellStages(lane.id, columnId);
      return Math.max(maxWidth, this.stageBoardWidth(stages) + 16);
    }, columnMin);
    return Math.ceil(Math.max(columnMin, required));
  }

  private stageBoardWidth(stages: ValueDomainStage[]): number {
    if (!stages.length) return this.editing() ? 132 : 120;
    const maxRight = stages.reduce((maxX, stage, index) => {
      const slot = this.stageSlot(stage, index);
      const x = this.stageBoardPad + slot.col * this.stageSlotWidth;
      return Math.max(maxX, x + this.stageNodeWidth(stage) + this.stageBoardPad);
    }, 0);
    return Math.max(this.editing() ? 250 : 132, maxRight);
  }

  private stageBoardHeight(stages: ValueDomainStage[]): number {
    if (!stages.length) return this.editing() ? 48 : 42;
    const maxBottom = stages.reduce((maxY, stage, index) => {
      const slot = this.stageSlot(stage, index);
      const y = this.stageBoardPad + slot.row * this.stageSlotHeight;
      return Math.max(maxY, y + this.stageCardHeight + 8);
    }, 0);
    return Math.max(this.editing() ? 82 : 54, maxBottom + (this.editing() ? 30 : 0));
  }

  private stageNodeWidth(stage: ValueDomainStage): number {
    const countWidth = this.processCount(stage) > 0 ? 24 : 6;
    const textWidth = Array.from(String(stage.name || this.stageId(stage) || '')).reduce((width, char) => {
      return width + (/[\u0000-\u00ff]/.test(char) ? 6 : 12);
    }, 0);
    return Math.max(this.stageCardMinWidth, textWidth + countWidth + 28);
  }

  private nextSlot(laneId: string, columnId: string): ValueDomainStageSlot {
    const used = new Set(this.cellStages(laneId, columnId)
      .map((stage, index) => this.stageSlot(stage, index))
      .map((slot) => `${slot.row}:${slot.col}`));
    for (let row = 0; row < 50; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        if (!used.has(`${row}:${col}`)) return { row, col };
      }
    }
    return { row: 0, col: used.size };
  }

  // 关键流程：拖动时只更新高亮槽位；鼠标释放后才调用 actions 写入文档，避免移动过程频繁写草稿。
  private readonly onStageDragMove = (event: MouseEvent): void => {
    if (!this.dragState) return;
    const target = this.resolveDragTarget(event);
    this.dragTarget.set(target);
  };

  private readonly onStageDragEnd = (event: MouseEvent): void => {
    if (!this.dragState) return;
    document.removeEventListener('mousemove', this.onStageDragMove);
    document.removeEventListener('mouseup', this.onStageDragEnd);
    const target = this.resolveDragTarget(event);
    if (target) {
      this.actions.setStagePlacement(this.dragState.stageId, target.laneId, target.columnId, target.slot);
    }
    this.dragState = null;
    this.dragTarget.set(null);
    this.refresh();
  };

  private resolveDragTarget(event: MouseEvent): StageDragTarget | null {
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const cell = elements
      .map((element) => element.closest?.('.value-domain-cell'))
      .find((element): element is HTMLElement => element instanceof HTMLElement);
    if (!cell) return null;
    const laneId = cell.dataset['laneId'] || '';
    const columnId = cell.dataset['columnId'] || '';
    const board = cell.querySelector<HTMLElement>('.value-stream-stage-board');
    if (!laneId || !columnId || !board) return null;
    const rect = board.getBoundingClientRect();
    return {
      laneId,
      columnId,
      slot: {
        row: Math.max(0, Math.round((event.clientY - rect.top - this.stageBoardPad) / this.stageSlotHeight)),
        col: Math.max(0, Math.round((event.clientX - rect.left - this.stageBoardPad) / this.stageSlotWidth)),
      },
    };
  }

  // 边界细节：ID 只用于缺省矩阵结构，不替代后端数据模型；真正业务 ID 仍由原文档结构承载。
  private nextId(prefix: string): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }
}
