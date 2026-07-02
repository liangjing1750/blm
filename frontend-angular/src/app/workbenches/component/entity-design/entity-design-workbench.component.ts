import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { getAngularRuntimeState } from '../../../core/runtime/angular-runtime';
import {
  EntityDesignAdapter,
  EntityDesignConstruct,
  EntityDesignEntity,
  EntityDesignField,
  EntityDesignRelation,
  EntityStateTransition,
  createEntityDesignLegacyAdapter,
} from './entity-design-legacy-adapter';

type EntityDesignView = 'relation' | 'state';

interface EntityNodeLayout {
  entity: EntityDesignEntity;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fill: string;
  stroke: string;
  background: string;
  componentKey: string;
  componentName: string;
  constructKey: string;
  constructName: string;
}

interface EntityRelationLine {
  from: EntityNodeLayout;
  to: EntityNodeLayout;
  label: string;
  path: string;
  labelX: number;
  labelY: number;
  color: string;
  opacity: number;
  width: number;
  dashed: boolean;
  focus: boolean;
  muted: boolean;
}

interface EntityFrame {
  key: string;
  label: string;
  componentKey?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
  fill?: string;
}

interface StateNodeLayout {
  name: string;
  kind: 'initial' | 'intermediate' | 'terminal';
  x: number;
  y: number;
  row: number;
  width: number;
  height: number;
  marker?: { kind: 'initial' | 'terminal'; x: number; y: number; size: number };
}

interface StateTransitionLine {
  index: number;
  transition: EntityStateTransition;
  from: StateNodeLayout;
  to: StateNodeLayout;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
  selected: boolean;
}

interface StateBoardLayout {
  nodes: StateNodeLayout[];
  transitions: StateTransitionLine[];
  width: number;
  height: number;
}

interface EntityDragState {
  entityId: string;
  startClientX: number;
  startClientY: number;
  originalPositions: Record<string, { x: number; y: number }>;
}

interface StateNodeDragState {
  entityId: string;
  stateName: string;
  dragKind: 'node' | 'marker';
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  moved: boolean;
}

interface StateLabelDragState {
  entityId: string;
  transitionIndex: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

@Component({
  selector: 'app-entity-design-workbench',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './entity-design-workbench.component.html',
  styleUrl: './entity-design-workbench.component.scss',
})
export class EntityDesignWorkbenchComponent implements OnInit, OnDestroy {

  // 远端同步后通过 blm-workbench-refresh 事件刷新视图
  private readonly onRefresh = () => {
    this.version.update((v) => v + 1);
  };

  ngOnInit(): void {
    const startupEntityId = String(getAngularRuntimeState().ui['entityId'] || '').trim();
    if (startupEntityId) {
      this.selectedEntityId.set(startupEntityId);
      this.selectedEntityIds.set(new Set([startupEntityId]));
      this.editorOpen.set(true);
    }
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
  }

  ngOnDestroy(): void {
    window.removeEventListener('blm-workbench-refresh', this.onRefresh);
  }
  // 模块意图：实体设计在构件工作台内独立运行，复刻旧实体关系图/状态图的核心体验，但不调用 entity-legacy 渲染函数。
  private readonly nodeWidth = 120;
  private readonly nodeHeight = 38;
  private readonly entityGapX = 40;
  private readonly entityGapY = 70;
  private readonly entityPad = 20;
  private readonly groupHeaderHeight = 28;
  private readonly groupPadX = 22;
  private readonly groupPadY = 18;
  private readonly groupGapX = 56;
  private readonly groupGapY = 56;
  private readonly componentPadX = 18;
  private readonly componentPadY = 18;
  private readonly componentHeaderHeight = 28;
  protected readonly view = signal<EntityDesignView>('relation');
  protected readonly version = signal(0);
  protected readonly selectedEntityId = signal('');
  protected readonly selectedEntityIds = signal<Set<string>>(new Set());
  protected readonly selectedTransitionIndex = signal<number | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly drawerWidth = signal(460);
  protected readonly selectionBox = signal<SelectionBox | null>(null);
  private readonly adapter: EntityDesignAdapter = createEntityDesignLegacyAdapter();
  private readonly palette = [
    { color: '#1d4ed8', fill: '#dbeafe', stroke: '#3b82f6' },
    { color: '#047857', fill: '#dcfce7', stroke: '#22c55e' },
    { color: '#a16207', fill: '#fef9c3', stroke: '#eab308' },
    { color: '#be185d', fill: '#fce7f3', stroke: '#ec4899' },
    { color: '#6d28d9', fill: '#ede9fe', stroke: '#8b5cf6' },
    { color: '#0e7490', fill: '#cffafe', stroke: '#06b6d4' },
    { color: '#c2410c', fill: '#ffedd5', stroke: '#f97316' },
  ];
  private readonly relationStrokeColors = ['#3b82f6', '#22c55e', '#eab308', '#ec4899', '#8b5cf6', '#f97316'];
  private dragState: EntityDragState | null = null;
  private stateNodeDragState: StateNodeDragState | null = null;
  private stateLabelDragState: StateLabelDragState | null = null;

  protected readonly entities = computed(() => {
    this.version();
    return this.adapter.entities();
  });

  protected readonly selectedEntity = computed(() => {
    const selectedId = this.selectedEntityId();
    return this.entities().find((entity) => this.entityId(entity) === selectedId) || this.entities()[0] || null;
  });

  protected readonly nodes = computed(() => this.layoutEntities());
  protected readonly relationLines = computed(() => this.collectRelationLines());
  protected readonly stateValues = computed(() => this.collectStateValues(this.selectedEntity()));
  protected readonly groupFrames = computed(() => this.computeGroupFrames(this.nodes()));
  protected readonly componentFrames = computed(() => this.computeComponentFrames(this.groupFrames()));
  protected readonly stateBoard = computed(() => {
    this.version();
    return this.layoutStateBoard(this.selectedEntity());
  });

  protected setView(view: EntityDesignView): void {
    this.view.set(view);
  }

  protected drawerGridColumns(): string {
    return this.editorOpen() && this.selectedEntity()
      ? `minmax(560px, 1fr) ${this.drawerWidth()}px`
      : 'minmax(0, 1fr)';
  }

  // 模块意图：实体编辑抽屉承载字段、关系和状态流转，宽度必须能被建模人员按内容复杂度调整。
  // 关键流程：记录起点宽度后监听 document mousemove，按横向拖拽距离实时更新右侧抽屉宽度。
  // 边界细节：宽度限制在 360-860px，避免挤压画布到不可用，也避免抽屉越过屏幕主体。
  protected startDrawerResize(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.drawerWidth();
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      this.drawerWidth.set(Math.max(360, Math.min(860, startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  protected entityId(entity: EntityDesignEntity | null | undefined): string {
    return String(entity?.uid || entity?.id || '').trim();
  }

  protected fieldId(field: EntityDesignField, index: number): string {
    return String(field.uid || field.id || field.name || `field-${index}`);
  }

  protected selectEntity(entity: EntityDesignEntity, event?: MouseEvent): void {
    const id = this.entityId(entity);
    if (event?.ctrlKey || event?.metaKey) {
      const next = new Set(this.selectedEntityIds());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.selectedEntityIds.set(next);
    } else {
      this.selectedEntityIds.set(new Set([id]));
    }
    this.selectedEntityId.set(id);
    this.syncRuntimeEntityId(id);
  }

  protected isSelected(entity: EntityDesignEntity): boolean {
    return this.selectedEntityIds().has(this.entityId(entity));
  }

  protected startEntityDrag(entity: EntityDesignEntity, event: MouseEvent): void {
    if (!this.editorOpen()) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const id = this.entityId(entity);
    if (!this.selectedEntityIds().has(id)) this.selectEntity(entity, event);
    const draggedIds = this.selectedEntityIds().size ? this.selectedEntityIds() : new Set([id]);
    const originalPositions: Record<string, { x: number; y: number }> = {};
    for (const item of this.entities()) {
      const itemId = this.entityId(item);
      if (!draggedIds.has(itemId)) continue;
      const node = this.nodes().find((layout) => layout.id === itemId);
      originalPositions[itemId] = { x: item.pos?.x ?? node?.x ?? 0, y: item.pos?.y ?? node?.y ?? 0 };
    }
    this.dragState = { entityId: id, startClientX: event.clientX, startClientY: event.clientY, originalPositions };
  }

  protected startSelectionBox(event: MouseEvent): void {
    if (!this.editorOpen()) return;
    if (!event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    this.selectionBox.set({ startX, startY, currentX: startX, currentY: startY });
  }

  protected selectionBoxStyle(): Record<string, string> {
    const box = this.selectionBox();
    if (!box) return {};
    const left = Math.min(box.startX, box.currentX);
    const top = Math.min(box.startY, box.currentY);
    const width = Math.abs(box.currentX - box.startX);
    const height = Math.abs(box.currentY - box.startY);
    return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` };
  }

  protected clearSelection(): void {
    if (this.selectionBox()) return;
    this.selectedEntityIds.set(new Set());
    this.selectedEntityId.set('');
    this.syncRuntimeEntityId('');
  }

  protected addEntity(): void {
    // 关键流程：新实体只补充最小字段，后续字段、状态和关系由右侧编辑区继续完善。
    const entities = this.adapter.entities();
    const id = this.adapter.nextId('ENT', entities);
    const entity: EntityDesignEntity = {
      uid: id,
      name: '新实体',
      note: '',
      fields: [],
      relations: [],
      state_transitions: [],
    };
    entities.push(entity);
    this.selectedEntityId.set(id);
    this.syncRuntimeEntityId(id);
    this.editorOpen.set(true);
    this.changed();
  }

  protected resetLayout(): void {
    for (const entity of this.entities()) delete entity.pos;
    this.selectedEntityIds.set(new Set());
    this.changed();
  }

  protected removeEntity(entity: EntityDesignEntity): void {
    const entityId = this.entityId(entity);
    const entities = this.adapter.entities();
    const index = entities.findIndex((item) => this.entityId(item) === entityId);
    if (index < 0) return;
    entities.splice(index, 1);
    const rootRelations = this.adapter.relations();
    for (let index = rootRelations.length - 1; index >= 0; index -= 1) {
      if (this.relationFrom(rootRelations[index]) === entityId || this.relationTo(rootRelations[index]) === entityId) rootRelations.splice(index, 1);
    }
    for (const item of entities) {
      item.relations = (item.relations || []).filter((relation) => this.relationTo(relation) !== entityId && this.relationFrom(relation) !== entityId);
    }
    this.selectedEntityId.set(this.entityId(entities[0]) || '');
    this.syncRuntimeEntityId(this.selectedEntityId());
    this.changed();
  }

  protected setEntityName(entity: EntityDesignEntity, value: string): void {
    entity.name = value;
    this.changed();
  }

  protected setEntityNote(entity: EntityDesignEntity, value: string): void {
    entity.note = value;
    this.changed();
  }

  protected setEntityConstruct(entity: EntityDesignEntity, constructId: string): void {
    entity.businessConstructUid = constructId;
    entity.businessConstructId = constructId;
    entity.constructUid = constructId;
    entity.constructId = constructId;
    this.changed();
  }

  protected addField(entity: EntityDesignEntity): void {
    entity.fields ||= [];
    entity.fields.push({ uid: this.adapter.nextId('FLD', entity.fields), name: '新字段', type: 'string', note: '' });
    this.changed();
  }

  protected setField(field: EntityDesignField, key: 'name' | 'type' | 'note' | 'state_values', value: string): void {
    field[key] = value;
    this.changed();
  }

  protected removeField(entity: EntityDesignEntity, index: number): void {
    entity.fields ||= [];
    entity.fields.splice(index, 1);
    this.changed();
  }

  protected addRelation(entity: EntityDesignEntity): void {
    const candidates = this.entities().filter((item) => this.entityId(item) !== this.entityId(entity));
    const target = candidates[0];
    if (!target) return;
    const relations = this.adapter.relations();
    relations.push({
      uid: this.adapter.nextId('REL', relations),
      from: this.entityId(entity),
      to: this.entityId(target),
      label: '关联',
    });
    this.changed();
  }

  protected setRelation(relation: EntityDesignRelation, key: 'to' | 'label' | 'type', value: string): void {
    relation[key] = value;
    if (key === 'to') relation.target = value;
    this.changed();
  }

  protected removeRelation(entity: EntityDesignEntity, index: number): void {
    const relation = this.relationsForEntity(entity)[index];
    const rootIndex = this.adapter.relations().indexOf(relation);
    if (rootIndex >= 0) this.adapter.relations().splice(rootIndex, 1);
    else {
      entity.relations ||= [];
      const localIndex = entity.relations.indexOf(relation);
      if (localIndex >= 0) entity.relations.splice(localIndex, 1);
    }
    this.changed();
  }

  protected addTransition(entity: EntityDesignEntity): void {
    entity.state_transitions ||= [];
    const values = this.collectStateValues(entity);
    entity.state_transitions.push({
      uid: this.adapter.nextId('TRN', entity.state_transitions),
      from: values[0] || '开始',
      to: values[1] || values[0] || '结束',
      action: '流转',
    });
    this.changed();
  }

  protected setTransition(transition: EntityStateTransition, key: 'from' | 'to' | 'action', value: string): void {
    transition[key] = value;
    this.changed();
  }

  protected removeTransition(entity: EntityDesignEntity, index: number): void {
    entity.state_transitions ||= [];
    entity.state_transitions.splice(index, 1);
    this.changed();
  }

  protected constructLabel(entity: EntityDesignEntity): string {
    const construct = this.constructForEntity(entity);
    return construct?.name || '未分组构件';
  }

  protected constructId(construct: EntityDesignConstruct): string {
    return String(construct.uid || construct.id || '').trim();
  }

  protected constructs(): EntityDesignConstruct[] {
    this.version();
    return this.adapter.constructs();
  }

  protected relationsForEntity(entity: EntityDesignEntity): EntityDesignRelation[] {
    const entityId = this.entityId(entity);
    return [
      ...this.adapter.relations().filter((relation) => this.relationFrom(relation) === entityId),
      ...(entity.relations || []),
    ];
  }

  protected nodeStyle(node: EntityNodeLayout): Record<string, string> {
    return {
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${node.width}px`,
      height: `${node.height}px`,
      '--entity-accent': node.color,
      '--entity-fill': node.fill,
      '--entity-stroke': node.stroke,
      '--entity-bg': node.background,
    };
  }

  protected frameStyle(frame: EntityFrame): Record<string, string> {
    return {
      left: `${frame.left}px`,
      top: `${frame.top}px`,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      '--entity-frame-color': frame.color || '#94a3b8',
      '--entity-frame-fill': frame.fill || 'rgba(148, 163, 184, 0.08)',
    };
  }

  protected relationLabelStyle(line: EntityRelationLine): Record<string, string> {
    return {
      left: `${line.labelX}px`,
      top: `${line.labelY}px`,
      color: line.color,
      opacity: String(line.opacity),
    };
  }

  protected stateNodeStyle(node: StateNodeLayout): Record<string, string> {
    return {
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${node.width}px`,
      height: `${node.height}px`,
    };
  }

  protected stateMarkerStyle(marker: StateNodeLayout['marker']): Record<string, string> {
    if (!marker) return {};
    return {
      left: `${Math.round(marker.x - marker.size / 2)}px`,
      top: `${Math.round(marker.y - marker.size / 2)}px`,
      width: `${marker.size}px`,
      height: `${marker.size}px`,
    };
  }

  protected stateBoardStyle(): Record<string, string> {
    const board = this.stateBoard();
    return { width: `${board.width}px`, height: `${board.height}px` };
  }

  protected selectTransition(index: number, event: Event): void {
    event.stopPropagation();
    this.selectedTransitionIndex.set(this.selectedTransitionIndex() === index ? null : index);
  }

  protected selectRelationLine(line: EntityRelationLine, event: Event): void {
    // Module intent: relation lines are first-class selectable objects, matching the legacy ER graph interaction.
    // Key flow: select both endpoints and keep the drawer open on the source entity for immediate editing.
    event.stopPropagation();
    const selected = new Set([line.from.id, line.to.id].filter(Boolean));
    this.selectedEntityIds.set(selected);
    this.selectedEntityId.set(line.from.id || line.to.id || '');
    this.syncRuntimeEntityId(this.selectedEntityId());
    this.editorOpen.set(true);
  }

  protected startStateNodeDrag(node: StateNodeLayout, event: MouseEvent): void {
    if (!this.editorOpen()) return;
    if (event.button !== 0) return;
    const entity = this.selectedEntity();
    if (!entity) return;
    event.preventDefault();
    event.stopPropagation();
    this.stateNodeDragState = {
      entityId: this.entityId(entity),
      stateName: node.name,
      dragKind: 'node',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: node.x,
      startTop: node.y,
      moved: false,
    };
  }

  protected startStateMarkerDrag(node: StateNodeLayout, event: MouseEvent): void {
    if (!this.editorOpen()) return;
    if (event.button !== 0 || !node.marker) return;
    const entity = this.selectedEntity();
    if (!entity) return;
    // Boundary detail: legacy marker positions are stored as center points, not CSS top-left.
    event.preventDefault();
    event.stopPropagation();
    this.stateNodeDragState = {
      entityId: this.entityId(entity),
      stateName: node.name,
      dragKind: 'marker',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: node.marker.x,
      startTop: node.marker.y,
      moved: false,
    };
  }

  protected startStateLabelDrag(line: StateTransitionLine, event: MouseEvent): void {
    if (!this.editorOpen()) return;
    if (event.button !== 0) return;
    const entity = this.selectedEntity();
    if (!entity) return;
    event.preventDefault();
    event.stopPropagation();
    this.stateLabelDragState = {
      entityId: this.entityId(entity),
      transitionIndex: line.index,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: line.labelX,
      startY: line.labelY,
      moved: false,
    };
  }

  protected boardSize(): Record<string, string> {
    return { width: `${this.boardWidth()}px`, height: `${this.boardHeight()}px` };
  }

  protected boardWidth(): number {
    const nodes = this.nodes();
    const groupFrames = this.groupFrames();
    const componentFrames = this.componentFrames();
    return Math.max(
      900,
      ...nodes.map((node) => node.x + node.width + 80),
      ...groupFrames.map((frame) => frame.left + frame.width + this.entityPad),
      ...componentFrames.map((frame) => frame.left + frame.width + this.entityPad),
    );
  }

  protected boardHeight(): number {
    const nodes = this.nodes();
    const groupFrames = this.groupFrames();
    const componentFrames = this.componentFrames();
    return Math.max(
      520,
      ...nodes.map((node) => node.y + node.height + 100),
      ...groupFrames.map((frame) => frame.top + frame.height + this.entityPad),
      ...componentFrames.map((frame) => frame.top + frame.height + this.entityPad),
    );
  }

  @HostListener('document:mousemove', ['$event'])
  protected onDocumentMouseMove(event: MouseEvent): void {
    if (this.stateNodeDragState) {
      const drag = this.stateNodeDragState;
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      if (!drag.moved) return;
      const entity = this.entities().find((item) => this.entityId(item) === drag.entityId);
      if (!entity) return;
      const nextPoint = {
        x: Math.max(4, Math.round(drag.startLeft + dx)),
        y: Math.max(4, Math.round(drag.startTop + dy)),
      };
      if (drag.dragKind === 'marker') this.setStateMarkerPosition(entity, drag.stateName, nextPoint, false);
      else this.setStateNodePosition(entity, drag.stateName, nextPoint, false);
      this.version.update((value) => value + 1);
      return;
    }
    if (this.stateLabelDragState) {
      const drag = this.stateLabelDragState;
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      if (!drag.moved) return;
      const entity = this.entities().find((item) => this.entityId(item) === drag.entityId);
      if (!entity) return;
      this.setStateLabelPosition(entity, drag.transitionIndex, {
        x: Math.max(4, Math.round(drag.startX + dx)),
        y: Math.max(4, Math.round(drag.startY + dy)),
      }, false);
      this.version.update((value) => value + 1);
      return;
    }
    if (this.selectionBox()) {
      const board = document.querySelector('.entity-board') as HTMLElement | null;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const current = this.selectionBox();
      if (!current) return;
      this.selectionBox.set({ ...current, currentX: event.clientX - rect.left, currentY: event.clientY - rect.top });
      return;
    }
    if (!this.dragState) return;
    const dx = event.clientX - this.dragState.startClientX;
    const dy = event.clientY - this.dragState.startClientY;
    for (const [id, original] of Object.entries(this.dragState.originalPositions)) {
      const entity = this.entities().find((item) => this.entityId(item) === id);
      if (!entity) continue;
      entity.pos = {
        x: Math.max(24, Math.round(original.x + dx)),
        y: Math.max(24, Math.round(original.y + dy)),
      };
    }
    this.version.update((value) => value + 1);
  }

  @HostListener('document:mouseup')
  protected onDocumentMouseUp(): void {
    if (this.stateNodeDragState) {
      const drag = this.stateNodeDragState;
      this.stateNodeDragState = null;
      if (drag.moved) this.adapter.markChanged();
      return;
    }
    if (this.stateLabelDragState) {
      const drag = this.stateLabelDragState;
      this.stateLabelDragState = null;
      if (drag.moved) this.adapter.markChanged();
      return;
    }
    if (this.selectionBox()) {
      this.applySelectionBox();
      this.selectionBox.set(null);
      return;
    }
    if (!this.dragState) return;
    this.dragState = null;
    this.adapter.markChanged();
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectedEntityIds.set(new Set(this.entities().map((entity) => this.entityId(entity))));
    }
  }

  private changed(): void {
    this.adapter.markChanged();
    this.version.update((value) => value + 1);
  }

  private syncRuntimeEntityId(entityId: string): void {
    getAngularRuntimeState().ui['entityId'] = entityId;
  }

  private layoutEntities(): EntityNodeLayout[] {
    const nodes: EntityNodeLayout[] = [];
    const groups = this.sortEntityGroups().map((group) => ({ ...group, layout: this.measureGroup(group.entities) }));
    const gridCols = this.groupGridColumns(groups.length);
    const cellWidth = Math.max(...groups.map((group) => group.layout.width), this.nodeWidth + this.groupPadX * 2);
    const cellHeight = Math.max(...groups.map((group) => group.layout.height), this.nodeHeight + this.groupHeaderHeight + this.groupPadY * 2);
    groups.forEach((group, groupIndex) => {
      const palette = this.palette[groupIndex % this.palette.length];
      const rawRow = Math.floor(groupIndex / gridCols);
      const rawCol = groupIndex % gridCols;
      const itemsInRow = Math.min(gridCols, groups.length - rawRow * gridCols);
      const layoutCol = rawRow % 2 === 0 ? rawCol : (itemsInRow - 1 - rawCol);
      const baseX = this.entityPad + layoutCol * (cellWidth + this.groupGapX);
      const baseY = this.entityPad + rawRow * (cellHeight + this.groupGapY);
      const colOffsets = group.layout.colWidths.reduce((acc: number[], width, index) => {
        acc.push(index === 0 ? 0 : acc[index - 1] + group.layout.colWidths[index - 1] + this.entityGapX);
        return acc;
      }, []);
      group.entities.forEach((entity, entityIndex) => {
        const size = this.entityNodeSize(entity);
        const col = entityIndex % group.layout.colCount;
        const row = Math.floor(entityIndex / group.layout.colCount);
        nodes.push({
          entity,
          id: this.entityId(entity),
          x: entity.pos?.x ?? baseX + this.groupPadX + (colOffsets[col] || 0),
          y: entity.pos?.y ?? baseY + this.groupHeaderHeight + this.groupPadY + row * (this.nodeHeight + this.entityGapY),
          width: size.width,
          height: size.height,
          color: palette.color,
          fill: palette.fill,
          stroke: palette.stroke,
          background: palette.fill,
          componentKey: group.componentKey,
          componentName: group.componentName,
          constructKey: group.key,
          constructName: group.label,
        });
      });
    });
    return nodes;
  }

  private applySelectionBox(): void {
    const box = this.selectionBox();
    if (!box) return;
    const left = Math.min(box.startX, box.currentX);
    const right = Math.max(box.startX, box.currentX);
    const top = Math.min(box.startY, box.currentY);
    const bottom = Math.max(box.startY, box.currentY);
    const selected = this.nodes()
      .filter((node) => node.x < right && node.x + node.width > left && node.y < bottom && node.y + node.height > top)
      .map((node) => node.id);
    this.selectedEntityIds.set(new Set(selected));
    this.selectedEntityId.set(selected[0] || '');
  }

  private entityNodeSize(entity: EntityDesignEntity): { width: number; height: number } {
    const name = String(entity?.name || '未命名实体');
    const width = Array.from(name).reduce((sum, char) => {
      if (/[\u2e80-\u9fff\uff00-\uffef]/.test(char)) return sum + 14;
      if (/[A-Z]/.test(char)) return sum + 8;
      if (/\s/.test(char)) return sum + 4;
      return sum + 7;
    }, 0);
    return { width: Math.max(this.nodeWidth, Math.ceil(width + 32)), height: this.nodeHeight };
  }

  private entityMeta(entity: EntityDesignEntity): { constructKey: string; constructLabel: string; componentKey: string; componentLabel: string } {
    const construct = this.constructForEntity(entity);
    const componentKey = String(construct?.businessComponentUid || construct?.businessComponentId || '').trim();
    const component = this.adapter.components().find((item) => String(item.uid || item.id || '') === componentKey);
    return {
      constructKey: this.constructId(construct || {}) || '__ungrouped_construct__',
      constructLabel: construct?.name || '未归属构件',
      componentKey: componentKey || '__ungrouped_component__',
      componentLabel: component?.name || '未归属组件',
    };
  }

  private sortEntityGroups(): Array<{ key: string; label: string; componentKey: string; componentName: string; entities: EntityDesignEntity[] }> {
    const entities = this.entities();
    const relations = this.allRelations();
    const degree = new Map<string, number>();
    const groupScore = new Map<string, number>();
    const groupLinks = new Map<string, Map<string, number>>();
    for (const entity of entities) {
      const id = this.entityId(entity);
      const meta = this.entityMeta(entity);
      degree.set(id, 0);
      groupScore.set(meta.constructKey, groupScore.get(meta.constructKey) || 0);
      if (!groupLinks.has(meta.constructKey)) groupLinks.set(meta.constructKey, new Map());
    }
    for (const relation of relations) {
      const from = this.relationFrom(relation);
      const to = this.relationTo(relation);
      degree.set(from, (degree.get(from) || 0) + 1);
      degree.set(to, (degree.get(to) || 0) + 1);
      const fromEntity = entities.find((entity) => this.entityId(entity) === from);
      const toEntity = entities.find((entity) => this.entityId(entity) === to);
      const fromGroup = this.entityMeta(fromEntity || {}).constructKey;
      const toGroup = this.entityMeta(toEntity || {}).constructKey;
      groupScore.set(fromGroup, (groupScore.get(fromGroup) || 0) + 1);
      groupScore.set(toGroup, (groupScore.get(toGroup) || 0) + 1);
      if (fromGroup !== toGroup) {
        if (!groupLinks.has(fromGroup)) groupLinks.set(fromGroup, new Map());
        if (!groupLinks.has(toGroup)) groupLinks.set(toGroup, new Map());
        groupLinks.get(fromGroup)?.set(toGroup, (groupLinks.get(fromGroup)?.get(toGroup) || 0) + 1);
        groupLinks.get(toGroup)?.set(fromGroup, (groupLinks.get(toGroup)?.get(fromGroup) || 0) + 1);
      }
    }
    const keys = Array.from(new Set(entities.map((entity) => this.entityMeta(entity).constructKey)));
    const sortedKeys: string[] = [];
    const used = new Set<string>();
    let current = keys.sort((a, b) => (groupScore.get(b) || 0) - (groupScore.get(a) || 0))[0];
    while (current) {
      sortedKeys.push(current);
      used.add(current);
      let nextKey = '';
      let nextScore = -1;
      for (const key of keys) {
        if (used.has(key)) continue;
        const score = (groupLinks.get(current)?.get(key) || 0) * 100 + (groupScore.get(key) || 0);
        if (score > nextScore) {
          nextScore = score;
          nextKey = key;
        }
      }
      current = nextKey;
    }
    return sortedKeys.map((key) => {
      const groupEntities = entities
        .filter((entity) => this.entityMeta(entity).constructKey === key)
        .sort((a, b) => (degree.get(this.entityId(b)) || 0) - (degree.get(this.entityId(a)) || 0) || this.entityId(a).localeCompare(this.entityId(b)));
      const meta = this.entityMeta(groupEntities[0] || {});
      return { key, label: meta.constructLabel, componentKey: meta.componentKey, componentName: meta.componentLabel, entities: groupEntities };
    });
  }

  private measureGroup(entities: EntityDesignEntity[]): { colCount: number; colWidths: number[]; width: number; height: number } {
    const colCount = entities.length >= 12 ? 3 : (entities.length >= 7 ? 2 : 1);
    const rowCount = Math.max(1, Math.ceil(entities.length / colCount));
    const colWidths = Array.from({ length: colCount }, () => this.nodeWidth);
    entities.forEach((entity, index) => {
      const col = index % colCount;
      colWidths[col] = Math.max(colWidths[col], this.entityNodeSize(entity).width);
    });
    const contentWidth = colWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, colCount - 1) * this.entityGapX;
    const contentHeight = rowCount * this.nodeHeight + Math.max(0, rowCount - 1) * this.entityGapY;
    return {
      colCount,
      colWidths,
      width: contentWidth + this.groupPadX * 2,
      height: contentHeight + this.groupHeaderHeight + this.groupPadY * 2,
    };
  }

  private groupGridColumns(groupCount: number): number {
    if (groupCount <= 1) return 1;
    if (groupCount <= 4) return 2;
    if (groupCount <= 9) return 3;
    return 4;
  }

  private computeGroupFrames(nodes: EntityNodeLayout[]): EntityFrame[] {
    const frames = new Map<string, EntityFrame>();
    for (const node of nodes) {
      const left = node.x - this.groupPadX;
      const top = node.y - this.groupHeaderHeight - this.groupPadY;
      const right = node.x + node.width + this.groupPadX;
      const bottom = node.y + node.height + this.groupPadY;
      const current = frames.get(node.constructKey);
      if (!current) {
        frames.set(node.constructKey, {
          key: node.constructKey,
          label: node.constructName,
          componentKey: node.componentKey,
          left,
          top,
          width: right - left,
          height: bottom - top,
          color: node.stroke,
          fill: `${node.fill}66`,
        });
      } else {
        const nextLeft = Math.min(current.left, left);
        const nextTop = Math.min(current.top, top);
        const nextRight = Math.max(current.left + current.width, right);
        const nextBottom = Math.max(current.top + current.height, bottom);
        current.left = nextLeft;
        current.top = nextTop;
        current.width = nextRight - nextLeft;
        current.height = nextBottom - nextTop;
      }
    }
    return Array.from(frames.values());
  }

  private computeComponentFrames(groupFrames: EntityFrame[]): EntityFrame[] {
    const frames = new Map<string, EntityFrame>();
    for (const frame of groupFrames) {
      const key = frame.componentKey || '__ungrouped_component__';
      const left = frame.left - this.componentPadX;
      const top = frame.top - this.componentHeaderHeight - this.componentPadY;
      const right = frame.left + frame.width + this.componentPadX;
      const bottom = frame.top + frame.height + this.componentPadY;
      const current = frames.get(key);
      if (!current) {
        frames.set(key, {
          key,
          label: this.componentLabel(key),
          left,
          top,
          width: right - left,
          height: bottom - top,
        });
      } else {
        const nextLeft = Math.min(current.left, left);
        const nextTop = Math.min(current.top, top);
        const nextRight = Math.max(current.left + current.width, right);
        const nextBottom = Math.max(current.top + current.height, bottom);
        current.left = nextLeft;
        current.top = nextTop;
        current.width = nextRight - nextLeft;
        current.height = nextBottom - nextTop;
      }
    }
    return Array.from(frames.values());
  }

  private collectRelationLines(): EntityRelationLine[] {
    const nodeMap = new Map(this.nodes().map((node) => [node.id, node]));
    const lines: EntityRelationLine[] = [];
    const selectedId = this.entityId(this.selectedEntity());
    this.allRelations().forEach((relation, index) => {
      const from = nodeMap.get(this.relationFrom(relation));
      const to = nodeMap.get(this.relationTo(relation));
      if (!from || !to) return;
      const color = this.relationStrokeColors[index % this.relationStrokeColors.length];
      const crossGroup = from.constructKey !== to.constructKey;
      const focus = Boolean(selectedId && (from.id === selectedId || to.id === selectedId));
      const route = this.routeRelation(from, to, index);
      lines.push({
        from,
        to,
        label: `${relation.type || ''}${relation.type && relation.label ? ' ' : ''}${relation.label || ''}` || '关联',
        path: route.path,
        labelX: route.labelX,
        labelY: route.labelY,
        color,
        opacity: selectedId ? (focus ? 0.96 : 0.16) : (crossGroup ? 0.3 : 0.82),
        width: selectedId ? (focus ? 2.4 : 1.1) : (crossGroup ? 1.1 : 1.7),
        dashed: crossGroup || relation.type === 'N:N',
        focus,
        muted: Boolean(selectedId && !focus),
      });
    });
    return lines;
  }

  private allRelations(): EntityDesignRelation[] {
    const relations = [...this.adapter.relations()];
    for (const entity of this.entities()) {
      for (const relation of entity.relations || []) {
        relations.push({ ...relation, from: this.relationFrom(relation) || this.entityId(entity) });
      }
    }
    return relations;
  }

  private routeRelation(from: EntityNodeLayout, to: EntityNodeLayout, index: number): { path: string; labelX: number; labelY: number } {
    const a = this.nodeRect(from);
    const b = this.nodeRect(to);
    if (from.id === to.id) {
      const loopW = 28 + index * 4;
      const loopH = Math.max(12, a.h / 3);
      const exitY = a.cy - loopH;
      const enterY = a.cy + loopH;
      return {
        path: `M ${a.r} ${exitY} L ${a.r + loopW} ${exitY} L ${a.r + loopW} ${enterY} L ${a.r} ${enterY}`,
        labelX: a.r + loopW + 4,
        labelY: a.cy + 4,
      };
    }
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDy < this.nodeHeight + 4) {
      const yCenter = (a.cy + b.cy) / 2 + (index % 2 === 0 ? 0 : 8);
      const path = dx >= 0
        ? `M ${a.r} ${a.cy} L ${a.r + 4} ${a.cy} L ${a.r + 4} ${yCenter} L ${b.l - 4} ${yCenter} L ${b.l - 4} ${b.cy} L ${b.l} ${b.cy}`
        : `M ${a.l} ${a.cy} L ${a.l - 4} ${a.cy} L ${a.l - 4} ${yCenter} L ${b.r + 4} ${yCenter} L ${b.r + 4} ${b.cy} L ${b.r} ${b.cy}`;
      return { path, labelX: (a.cx + b.cx) / 2, labelY: yCenter - 8 };
    }
    if (absDy >= absDx) {
      const goDown = dy > 0;
      const sy = goDown ? a.b : a.t;
      const ey = goDown ? b.t : b.b;
      const yMid = (sy + ey) / 2 + (index % 2 === 0 ? 0 : 10);
      return {
        path: `M ${a.cx} ${sy} L ${a.cx} ${yMid} L ${b.cx} ${yMid} L ${b.cx} ${ey}`,
        labelX: (a.cx + b.cx) / 2,
        labelY: yMid - 6,
      };
    }
    const goRight = dx > 0;
    const sx = goRight ? a.r : a.l;
    const ex = goRight ? b.l : b.r;
    const xMid = (sx + ex) / 2 + (index % 2 === 0 ? 0 : 10);
    return {
      path: `M ${sx} ${a.cy} L ${xMid} ${a.cy} L ${xMid} ${b.cy} L ${ex} ${b.cy}`,
      labelX: xMid + 8,
      labelY: (a.cy + b.cy) / 2 - 4,
    };
  }

  private nodeRect(node: EntityNodeLayout): { l: number; t: number; r: number; b: number; cx: number; cy: number; w: number; h: number } {
    return {
      l: node.x,
      t: node.y,
      r: node.x + node.width,
      b: node.y + node.height,
      cx: node.x + node.width / 2,
      cy: node.y + node.height / 2,
      w: node.width,
      h: node.height,
    };
  }

  private relationFrom(relation: EntityDesignRelation): string {
    return String(relation.from || relation.source || '').trim();
  }

  private relationTo(relation: EntityDesignRelation): string {
    return String(relation.to || relation.target || '').trim();
  }

  private constructForEntity(entity: EntityDesignEntity): EntityDesignConstruct | undefined {
    const constructId = String(entity.businessConstructUid || entity.businessConstructId || entity.constructUid || entity.constructId || '').trim();
    return this.constructs().find((construct) => this.constructId(construct) === constructId);
  }

  private componentLabel(componentKey: string): string {
    return this.adapter.components().find((component) => String(component.uid || component.id || '') === componentKey)?.name || '未归属组件';
  }

  private layoutStateBoard(entity: EntityDesignEntity | null): StateBoardLayout {
    if (!entity) return { nodes: [], transitions: [], width: 720, height: 360 };
    const values = this.collectStateValues(entity);
    const transitionValues = new Set<string>();
    for (const transition of entity.state_transitions || []) {
      if (transition.from) transitionValues.add(transition.from);
      if (transition.to) transitionValues.add(transition.to);
    }
    const savedNodes = this.syncEntityStateNodes(entity, values);
    const nodes = values.map((name, index) => {
      const incoming = (entity.state_transitions || []).filter((transition) => transition.to === name).length;
      const outgoing = (entity.state_transitions || []).filter((transition) => transition.from === name).length;
      const saved = savedNodes.find((item) => String(item.name || '') === name);
      const kind: StateNodeLayout['kind'] = incoming === 0 && outgoing > 0
        ? 'initial'
        : (outgoing === 0 && incoming > 0 ? 'terminal' : 'intermediate');
      if (saved && saved.kind !== kind) saved.kind = kind;
      return { name, kind, originalIndex: index, savedPos: saved?.pos, savedMarkerPos: saved?.markerPos };
    });
    if (!nodes.length && transitionValues.size) {
      Array.from(transitionValues).forEach((name, index) => nodes.push({ name, kind: 'intermediate', originalIndex: index, savedPos: undefined, savedMarkerPos: undefined }));
    }
    const initial = nodes.filter((node) => node.kind === 'initial');
    const terminal = nodes.filter((node) => node.kind === 'terminal');
    const middle = nodes.filter((node) => node.kind === 'intermediate');
    const orderedRows = [
      ...(initial.length ? [initial] : []),
      ...middle.map((node) => [node]),
      ...(terminal.length ? [terminal] : []),
    ];
    const layouts: StateNodeLayout[] = [];
    const padX = 64;
    const padY = 48;
    const gapX = 68;
    const gapY = 68;
    const nodeH = 36;
    orderedRows.forEach((row, rowIndex) => {
      const rowWidths = row.map((node) => this.stateNodeDisplayWidth(node.name));
      const rowWidth = rowWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, row.length - 1) * gapX;
      const startX = padX + Math.max(0, (520 - rowWidth) / 2);
      row.forEach((node, colIndex) => {
        const autoX = Math.round(startX + rowWidths.slice(0, colIndex).reduce((sum, width) => sum + width, 0) + colIndex * gapX);
        const autoY = padY + rowIndex * (nodeH + gapY);
        const x = Number.isFinite(Number(node.savedPos?.x)) ? Math.max(4, Math.round(Number(node.savedPos?.x))) : autoX;
        const y = Number.isFinite(Number(node.savedPos?.y)) ? Math.max(4, Math.round(Number(node.savedPos?.y))) : autoY;
        const width = rowWidths[colIndex];
        const savedMarker = this.normalizePoint(node.savedMarkerPos);
        const marker = node.kind === 'initial'
          ? { kind: 'initial' as const, x: savedMarker?.x ?? x - 22, y: savedMarker?.y ?? y + 18, size: 16 }
          : (node.kind === 'terminal' ? { kind: 'terminal' as const, x: savedMarker?.x ?? x + width + 28, y: savedMarker?.y ?? y + 18, size: 20 } : undefined);
        layouts.push({ name: node.name, kind: node.kind, row: rowIndex, x, y, width, height: nodeH, marker });
      });
    });
    const nodeMap = new Map(layouts.map((node) => [node.name, node]));
    const transitions = (entity.state_transitions || []).map((transition, index) => {
      const from = nodeMap.get(String(transition.from || ''));
      const to = nodeMap.get(String(transition.to || ''));
      if (!from || !to) return null;
      const route = this.routeStateTransition(from, to, index);
      const labelPos = this.normalizePoint(transition.labelPos);
      return {
        index,
        transition,
        from,
        to,
        path: route.path,
        label: transition.action || transition.label || '流转',
        labelX: labelPos?.x ?? route.labelX,
        labelY: labelPos?.y ?? route.labelY,
        selected: this.selectedTransitionIndex() === index,
      };
    }).filter(Boolean) as StateTransitionLine[];
    const width = Math.max(720, ...layouts.map((node) => node.x + node.width + 96));
    const height = Math.max(360, ...layouts.map((node) => node.y + node.height + 80));
    return { nodes: layouts, transitions, width, height };
  }

  private stateNodeDisplayWidth(label: string): number {
    const text = String(label || '').trim() || '状态';
    let units = 0;
    for (const char of text) {
      if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) units += 1.15;
      else if (/[A-Z0-9]/.test(char)) units += 0.72;
      else if (/[a-z]/.test(char)) units += 0.62;
      else units += 0.9;
    }
    return Math.max(72, Math.min(172, Math.round(22 + units * 15)));
  }

  private syncEntityStateNodes(entity: EntityDesignEntity, values: string[]): NonNullable<EntityDesignEntity['state_nodes']> {
    entity.state_nodes ||= [];
    const names = new Set(values);
    entity.state_nodes = entity.state_nodes.filter((node) => names.has(String(node.name || '')));
    for (const name of values) {
      if (!entity.state_nodes.some((node) => String(node.name || '') === name)) {
        entity.state_nodes.push({ name, kind: 'intermediate' });
      }
    }
    return entity.state_nodes;
  }

  private setStateNodePosition(entity: EntityDesignEntity, stateName: string, pos: { x: number; y: number }, markChanged = true): void {
    const values = this.collectStateValues(entity);
    const nodes = this.syncEntityStateNodes(entity, values);
    const node = nodes.find((item) => String(item.name || '') === stateName);
    if (!node) return;
    node.pos = { x: pos.x, y: pos.y };
    if (markChanged) this.changed();
  }

  private setStateMarkerPosition(entity: EntityDesignEntity, stateName: string, pos: { x: number; y: number }, markChanged = true): void {
    const values = this.collectStateValues(entity);
    const nodes = this.syncEntityStateNodes(entity, values);
    const node = nodes.find((item) => String(item.name || '') === stateName);
    if (!node) return;
    node.markerPos = { x: pos.x, y: pos.y };
    if (markChanged) this.changed();
  }

  private setStateLabelPosition(entity: EntityDesignEntity, transitionIndex: number, pos: { x: number; y: number }, markChanged = true): void {
    const transition = entity.state_transitions?.[transitionIndex];
    if (!transition) return;
    transition.labelPos = { x: pos.x, y: pos.y };
    if (markChanged) this.changed();
  }

  private normalizePoint(point: { x?: number; y?: number } | null | undefined): { x: number; y: number } | null {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.max(4, Math.round(x)), y: Math.max(4, Math.round(y)) };
  }

  private routeStateTransition(from: StateNodeLayout, to: StateNodeLayout, index: number): { path: string; labelX: number; labelY: number } {
    const isSelfLoop = from.name === to.name;
    const isBackward = !isSelfLoop && to.row < from.row;
    const isForwardDetour = !isSelfLoop && to.row - from.row > 1;
    if (isBackward || isForwardDetour) {
      const side = isBackward ? 'left' : 'right';
      const channelX = side === 'left'
        ? Math.min(from.x, to.x) - 42 - index * 10
        : Math.max(from.x + from.width, to.x + to.width) + 42 + index * 10;
      const fromX = side === 'left' ? from.x : from.x + from.width;
      const toX = side === 'left' ? to.x : to.x + to.width;
      const fromY = from.y + from.height / 2;
      const toY = to.y + to.height / 2;
      return {
        path: `M ${fromX} ${fromY} L ${channelX} ${fromY} L ${channelX} ${toY} L ${toX} ${toY}`,
        labelX: channelX + (side === 'left' ? -36 : 10),
        labelY: (fromY + toY) / 2 - 6,
      };
    }
    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height;
    const toX = to.x + to.width / 2;
    const toY = to.y;
    if (isSelfLoop) {
      const loopW = 34 + index * 8;
      const midY = from.y + from.height / 2;
      return {
        path: `M ${from.x + from.width} ${midY} L ${from.x + from.width + loopW} ${midY} L ${from.x + from.width + loopW} ${midY + 42} L ${from.x + from.width} ${midY + 42}`,
        labelX: from.x + from.width + loopW + 8,
        labelY: midY + 24,
      };
    }
    const midY = Math.round((fromY + toY) / 2) + (index % 2 ? 10 : 0);
    return {
      path: `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`,
      labelX: Math.round((fromX + toX) / 2),
      labelY: midY - 8,
    };
  }

  private collectStateValues(entity: EntityDesignEntity | null): string[] {
    if (!entity) return [];
    const values = new Set<string>();
    for (const field of entity.fields || []) {
      const rawValues = [
        ...(Array.isArray(field.states) ? field.states : []),
        ...String(field.state_values || '').split(/[,\n，、]/),
      ];
      rawValues.map((value) => value.trim()).filter(Boolean).forEach((value) => values.add(value));
    }
    for (const transition of entity.state_transitions || []) {
      if (transition.from) values.add(transition.from);
      if (transition.to) values.add(transition.to);
    }
    return Array.from(values);
  }
}
