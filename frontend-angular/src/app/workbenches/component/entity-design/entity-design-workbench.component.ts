import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output, computed, signal, OnInit, OnDestroy } from '@angular/core';
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

interface StateTransitionRoutePlan {
  side: 'left' | 'right';
  channelIndex: number;
  routeX: number;
}

interface StateTransitionLine {
  index: number;
  transition: EntityStateTransition;
  from: StateNodeLayout;
  to: StateNodeLayout;
  points: Array<{ x: number; y: number }>;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  labelAngle: number;
  selected: boolean;
}

interface StateMarkerLink {
  path: string;
  terminal: boolean;
}

interface StateBoardLayout {
  nodes: StateNodeLayout[];
  transitions: StateTransitionLine[];
  markerLinks: StateMarkerLink[];
  width: number;
  height: number;
}

interface StateFieldPanel {
  field: EntityDesignField;
  name: string;
  label: string;
  values: string[];
  board: StateBoardLayout;
  active: boolean;
  role: 'primary' | 'secondary' | 'none';
}

interface StateEntityGroup {
  name: string;
  items: EntityDesignEntity[];
}

interface EntityDragState {
  entityId: string;
  startClientX: number;
  startClientY: number;
  originalPositions: Record<string, { x: number; y: number }>;
  moved: boolean;
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

interface StateRouteDragState {
  entityId: string;
  transitionIndex: number;
  segmentIndex: number;
  points: Array<{ x: number; y: number }>;
  startClientX: number;
  startClientY: number;
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
  @Input() showEditorToggle = true;
  @Input() exportGraphId = '';
  @Input() initialView: EntityDesignView = 'relation';
  @Input() initialEntityId = '';
  @Output() editRequested = new EventEmitter<void>();
  @Input() set editing(value: boolean) {
    const editable = Boolean(value);
    this.externalEditing.set(editable);
    if (!editable) {
      this.editorOpen.set(false);
      this.stateEditorOpen.set(false);
      return;
    }
    if (this.view() === 'state') {
      this.ensureActiveStateField(this.selectedEntity());
      this.stateEditorOpen.set(true);
    }
  }

  // 远端同步后通过 blm-workbench-refresh 事件刷新视图
  private readonly onRefresh = () => {
    this.version.update((v) => v + 1);
  };

  ngOnInit(): void {
    this.view.set(this.initialView);
    const startupEntityId = String(this.initialEntityId || getAngularRuntimeState().ui['entityId'] || '').trim();
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
  protected readonly stateEditorOpen = signal(false);
  private readonly externalEditing = signal(false);
  protected readonly stateFieldName = signal('');
  protected readonly drawerWidth = signal(620);
  protected readonly stateDrawerWidth = signal(620);
  protected readonly relationZoom = signal(1);
  protected readonly stateZoom = signal(1);
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
  protected readonly fieldTypes = [
    { value: 'string', label: '字符' },
    { value: 'number', label: '数值' },
    { value: 'decimal', label: '金额' },
    { value: 'date', label: '日期' },
    { value: 'datetime', label: '日期时间' },
    { value: 'boolean', label: '布尔' },
    { value: 'enum', label: '枚举' },
    { value: 'text', label: '长文本' },
    { value: 'id', label: '标识ID' },
    { value: 'list', label: '列表' },
  ];
  private dragState: EntityDragState | null = null;
  private stateNodeDragState: StateNodeDragState | null = null;
  private stateLabelDragState: StateLabelDragState | null = null;
  private stateRouteDragState: StateRouteDragState | null = null;

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
  protected readonly stateFields = computed(() => this.collectStateFields(this.selectedEntity()));
  protected readonly selectedStateField = computed(() => {
    const fields = this.stateFields();
    const selected = this.stateFieldName();
    return fields.find((field) => String(field.name || '') === selected) || fields[0] || null;
  });
  protected readonly stateValues = computed(() => this.collectStateValues(this.selectedEntity(), this.selectedStateField()?.name || ''));
  protected readonly statePanels = computed(() => this.buildStatePanels(this.selectedEntity()));
  protected readonly stateEntityGroups = computed(() => this.groupStateEntities());
  protected readonly groupFrames = computed(() => this.computeGroupFrames(this.nodes()));
  protected readonly componentFrames = computed(() => this.computeComponentFrames(this.groupFrames()));
  protected readonly stateBoard = computed(() => {
    this.version();
    return this.layoutStateBoard(this.selectedEntity());
  });

  protected setView(view: EntityDesignView): void {
    this.view.set(view);
    if (view === 'state') {
      this.ensureActiveStateField(this.selectedEntity());
      this.stateEditorOpen.set(this.externalEditing() && !this.showEditorToggle ? true : false);
    }
  }

  protected drawerGridColumns(): string {
    if (this.view() === 'state') return 'minmax(0, 1fr)';
    return 'minmax(0, 1fr)';
  }

  protected relationDrawerOffset(): number {
    return this.view() === 'relation' && this.editorOpen() && this.selectedEntity() ? this.drawerWidth() : 0;
  }

  protected canEditRelation(): boolean {
    return this.externalEditing() || this.editorOpen();
  }

  protected canEditState(): boolean {
    return this.externalEditing() || this.editorOpen() || this.stateEditorOpen();
  }

  protected stateMainShellStyle(): Record<string, string> {
    return { marginRight: '0px' };
  }

  // 模块意图：实体抽屉复刻旧版的右侧面板体验，宽度由建模人员按字段和关系复杂度自由拉伸。
  // 关键流程：记录起点宽度后监听 document mousemove，按横向拖拽距离实时更新右侧抽屉宽度。
  // 边界细节：只保留最小可用宽度，不设置最大宽度；用户向左拉伸时不再被旧版迁移中的 860px 上限挡住。
  protected startDrawerResize(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.drawerWidth();
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      this.drawerWidth.set(Math.max(420, Math.round(startWidth + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  protected startStateDrawerResize(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.stateDrawerWidth();
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      this.stateDrawerWidth.set(Math.max(520, startWidth + delta));
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
    this.ensureActiveStateField(entity);
    this.syncRuntimeEntityId(id);
  }

  protected openEntityDrawer(entity: EntityDesignEntity, event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.editRequested.emit();
    this.selectEntity(entity);
    this.editorOpen.set(true);
  }

  protected openSelectedEntityDrawer(): void {
    const entity = this.selectedEntity();
    if (!entity) return;
    this.openEntityDrawer(entity);
  }

  protected isSelected(entity: EntityDesignEntity): boolean {
    return this.selectedEntityIds().has(this.entityId(entity));
  }

  protected startEntityDrag(entity: EntityDesignEntity, event: MouseEvent): void {
    if (!this.canEditRelation()) return;
    if (event.button !== 0) return;
    if (event.ctrlKey || event.metaKey) return;
    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      this.startSelectionBox(event);
      return;
    }
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
    this.dragState = { entityId: id, startClientX: event.clientX, startClientY: event.clientY, originalPositions, moved: false };
  }

  protected startSelectionBox(event: MouseEvent): void {
    if (!this.canEditRelation()) return;
    if (!event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const board = document.getElementById('ef-board-entity-diagram') as HTMLElement | null;
    const rect = (board || event.currentTarget as HTMLElement).getBoundingClientRect();
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
    if (!this.canEditRelation()) return;
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
    this.stateFieldName.set('');
    this.syncRuntimeEntityId(id);
    this.editorOpen.set(true);
    this.changed();
  }

  protected resetLayout(): void {
    if (!this.canEditRelation() && !this.canEditState()) return;
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

  protected duplicateEntity(entity: EntityDesignEntity): void {
    const entities = this.adapter.entities();
    const id = this.adapter.nextId('ENT', entities);
    const copy = JSON.parse(JSON.stringify(entity)) as EntityDesignEntity;
    copy.uid = id;
    copy.id = id;
    copy.name = `${entity.name || '未命名实体'} 副本`;
    copy.pos = entity.pos ? { x: Number(entity.pos.x || 0) + 40, y: Number(entity.pos.y || 0) + 40 } : undefined;
    copy.fields = Array.isArray(copy.fields) ? copy.fields.map((field, index) => ({ ...field, uid: this.adapter.nextId(`FLD${index}`, []) })) : [];
    copy.relations = [];
    entities.push(copy);
    this.selectedEntityId.set(id);
    this.selectedEntityIds.set(new Set([id]));
    this.syncRuntimeEntityId(id);
    this.editorOpen.set(true);
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
    const previousName = key === 'name' ? String(field.name || '') : '';
    field[key] = value;
    if (key === 'name' && previousName && this.stateFieldName() === previousName) this.stateFieldName.set(value);
    this.changed();
  }

  protected setFieldBoolean(field: EntityDesignField, key: 'is_key' | 'is_status', value: boolean): void {
    field[key] = value;
    if (key === 'is_status' && value && !field.status_role) field.status_role = 'primary';
    if (key === 'is_status' && !value) field.status_role = '';
    this.changed();
  }

  protected setFieldStatusRole(field: EntityDesignField, value: string): void {
    field.status_role = value === 'primary' || value === 'secondary' ? value : '';
    field.is_status = Boolean(field.status_role);
    this.changed();
  }

  protected removeField(entity: EntityDesignEntity, index: number): void {
    entity.fields ||= [];
    const removedName = String(entity.fields[index]?.name || '');
    entity.fields.splice(index, 1);
    if (removedName && this.stateFieldName() === removedName) this.stateFieldName.set('');
    this.changed();
  }

  protected moveField(entity: EntityDesignEntity, index: number, direction: -1 | 1): void {
    entity.fields ||= [];
    const target = index + direction;
    if (target < 0 || target >= entity.fields.length) return;
    [entity.fields[index], entity.fields[target]] = [entity.fields[target], entity.fields[index]];
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
      type: '1:N',
      label: '',
    });
    this.changed();
  }

  protected setRelation(relation: EntityDesignRelation, key: 'from' | 'to' | 'label' | 'type', value: string): void {
    relation[key] = value;
    if (key === 'from') relation.source = value;
    if (key === 'to') relation.target = value;
    this.changed();
  }

  protected relationFromValue(relation: EntityDesignRelation): string {
    return this.relationFrom(relation);
  }

  protected relationToValue(relation: EntityDesignRelation): string {
    return this.relationTo(relation);
  }

  protected relationTypeValue(relation: EntityDesignRelation): string {
    const type = String(relation.type || '').trim();
    return type === '1:1' || type === '1:N' || type === 'N:N' ? type : '1:1';
  }

  protected fieldRuleHeight(field: EntityDesignField): number {
    const text = String(field.note || field.state_values || '');
    const lineCount = Math.max(1, Math.ceil(text.length / 18), text.split(/\r?\n/).length);
    return Math.max(28, Math.min(120, 10 + lineCount * 20));
  }

  protected entityReferences(entity: EntityDesignEntity): Array<{ processName: string; taskName: string }> {
    const entityId = this.entityId(entity);
    const refs: Array<{ processName: string; taskName: string }> = [];
    const doc = getAngularRuntimeState().doc as { processes?: any[] };
    for (const process of doc.processes || []) {
      for (const task of this.processNodes(process)) {
        const entityOps = Array.isArray(task?.entity_ops) ? task.entity_ops : [];
        if (entityOps.some((op: any) => String(op.entity_uid || op.entity_id || op.entityId || '') === entityId)) {
          refs.push({ processName: process.name || process.title || process.uid || process.id || '未命名流程', taskName: task.name || task.title || task.uid || task.id || '未命名节点' });
        }
      }
    }
    return refs;
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

  protected moveRelation(entity: EntityDesignEntity, index: number, direction: -1 | 1): void {
    const scoped = this.relationsForEntity(entity);
    const relation = scoped[index];
    const targetRelation = scoped[index + direction];
    if (!relation || !targetRelation) return;
    const root = this.adapter.relations();
    const currentIndex = root.indexOf(relation);
    const targetIndex = root.indexOf(targetRelation);
    if (currentIndex < 0 || targetIndex < 0) return;
    [root[currentIndex], root[targetIndex]] = [root[targetIndex], root[currentIndex]];
    this.changed();
  }

  protected addTransition(entity: EntityDesignEntity): void {
    entity.state_transitions ||= [];
    const fieldName = this.selectedStateField()?.name || '';
    const values = this.collectStateValues(entity, fieldName);
    entity.state_transitions.push({
      uid: this.adapter.nextId('TRN', entity.state_transitions),
      from: values[0] || '开始',
      to: values[1] || values[0] || '结束',
      action: '流转',
      field_name: fieldName,
    });
    this.changed();
  }

  protected setTransition(transition: EntityStateTransition, key: 'from' | 'to' | 'action' | 'field_name', value: string): void {
    transition[key] = value;
    this.changed();
  }

  protected setTransitionNote(transition: EntityStateTransition, value: string): void {
    transition.note = value;
    transition.action = value;
    this.changed();
  }

  protected resetAllStateTransitionRoutes(entity: EntityDesignEntity): void {
    const fieldName = this.selectedStateField()?.name || '';
    let touched = false;
    for (const transition of this.transitionsForField(entity, fieldName)) {
      if (transition.labelPos || transition.route || transition.waypoints) {
        delete transition.labelPos;
        delete transition.route;
        delete transition.waypoints;
        touched = true;
      }
    }
    if (touched) this.changed();
  }

  protected removeTransition(entity: EntityDesignEntity, index: number): void {
    entity.state_transitions ||= [];
    entity.state_transitions.splice(index, 1);
    this.changed();
  }

  protected moveTransition(entity: EntityDesignEntity, index: number, direction: -1 | 1): void {
    entity.state_transitions ||= [];
    const target = index + direction;
    if (target < 0 || target >= entity.state_transitions.length) return;
    [entity.state_transitions[index], entity.state_transitions[target]] = [entity.state_transitions[target], entity.state_transitions[index]];
    this.selectedTransitionIndex.set(target);
    this.changed();
  }

  protected setStateField(fieldName: string): void {
    this.stateFieldName.set(fieldName);
    this.selectedTransitionIndex.set(null);
  }

  protected selectedStateTransitions(entity: EntityDesignEntity): Array<{ transition: EntityStateTransition; index: number }> {
    const fieldName = this.selectedStateField()?.name || '';
    return (entity.state_transitions || [])
      .map((transition, index) => ({ transition, index }))
      .filter(({ transition }) => !fieldName || !transition.field_name || transition.field_name === fieldName);
  }

  protected transitionStateOptions(transition: EntityStateTransition): string[] {
    const values = new Set(this.stateValues());
    if (transition.from) values.add(String(transition.from));
    if (transition.to) values.add(String(transition.to));
    return Array.from(values);
  }

  protected setStateNodeKind(entity: EntityDesignEntity, stateName: string, kind: string): void {
    if (kind !== 'initial' && kind !== 'intermediate' && kind !== 'terminal') return;
    const fieldName = this.selectedStateField()?.name || '';
    const nodes = this.syncEntityStateNodes(entity, this.collectStateValues(entity, fieldName), fieldName);
    const node = nodes.find((item) => String(item.name || '') === stateName);
    if (!node) return;
    node.kind = kind;
    this.changed();
  }

  protected nudgeStateZoom(delta: number): void {
    this.stateZoom.set(Math.max(0.6, Math.min(1.8, Math.round((this.stateZoom() + delta) * 10) / 10)));
  }

  protected onStateDiagramWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    event.preventDefault();
    this.nudgeStateZoom(event.deltaY < 0 ? 0.1 : -0.1);
  }

  protected resetStateZoom(): void {
    this.stateZoom.set(1);
  }

  protected stateZoomLabel(): string {
    return `${Math.round(this.stateZoom() * 100)}%`;
  }

  protected constructLabel(entity: EntityDesignEntity): string {
    const construct = this.constructForEntity(entity);
    return construct?.name || '未分组构件';
  }

  protected constructOptionLabel(construct: EntityDesignConstruct): string {
    const legacyConstruct = construct as EntityDesignConstruct & { businessComponent?: string };
    const componentKey = String(legacyConstruct.businessComponentUid || legacyConstruct.businessComponentId || legacyConstruct.businessComponent || '').trim();
    const component = this.adapter.components().find((item) => String(item.uid || item.id || item.name || '') === componentKey);
    const constructLabel = construct.name || this.constructId(construct);
    return component?.name ? `${component.name} / ${constructLabel}` : constructLabel;
  }

  protected stateRoleLabel(role: StateFieldPanel['role']): string {
    if (role === 'primary') return '主状态';
    if (role === 'secondary') return '子状态';
    return '状态字段';
  }

  protected stateNodeKindLabel(kind: StateNodeLayout['kind']): string {
    if (kind === 'initial') return '初始状态';
    if (kind === 'terminal') return '结束状态';
    return '中间状态';
  }

  protected activeStateFieldLabel(): string {
    return this.selectedStateField()?.name || '未命名状态字段';
  }

  protected stateFieldOptionLabel(field: EntityDesignField | null | undefined): string {
    const fieldName = String(field?.name || '').trim() || '未命名状态字段';
    const role = field?.status_role === 'secondary' ? 'secondary' : (field?.status_role === 'primary' || field?.is_status ? 'primary' : '');
    if (role === 'primary') return `主：${fieldName}`;
    if (role === 'secondary') return `子：${fieldName}`;
    return fieldName;
  }

  protected selectedStateFieldOptionLabel(): string {
    return this.stateFieldOptionLabel(this.selectedStateField());
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
      ...this.adapter.relations().filter((relation) => this.relationFrom(relation) === entityId || this.relationTo(relation) === entityId),
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

  protected stateRouteHitboxStyle(line: StateTransitionLine, segmentIndex: number): Record<string, string> {
    const point = line.points[segmentIndex];
    const next = line.points[segmentIndex + 1];
    if (!point || !next) return {};
    const horizontal = Math.abs(point.y - next.y) <= Math.abs(point.x - next.x);
    const left = Math.min(point.x, next.x) - (horizontal ? 0 : 6);
    const top = Math.min(point.y, next.y) - (horizontal ? 6 : 0);
    const width = Math.max(horizontal ? Math.abs(next.x - point.x) : 12, 12);
    const height = Math.max(horizontal ? 12 : Math.abs(next.y - point.y), 12);
    return {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
      height: `${Math.round(height)}px`,
    };
  }

  protected stateEndpointHandleStyle(line: StateTransitionLine, endpoint: 'from' | 'to'): Record<string, string> {
    const point = endpoint === 'from' ? line.points[0] : line.points[line.points.length - 1];
    if (!point) return {};
    return {
      left: `${Math.round(point.x - 6)}px`,
      top: `${Math.round(point.y - 6)}px`,
    };
  }

  protected stateBoardStyle(board = this.stateBoard()): Record<string, string> {
    return { width: `${board.width}px`, height: `${board.height}px` };
  }

  protected stateZoomStyle(board = this.stateBoard()): Record<string, string> {
    const zoom = this.stateZoom();
    return {
      width: `${Math.max(180, Math.round(board.width * zoom))}px`,
      height: `${Math.max(160, Math.round(board.height * zoom))}px`,
    };
  }

  protected stateZoomTargetStyle(board = this.stateBoard()): Record<string, string> {
    return {
      width: `${board.width}px`,
      height: `${board.height}px`,
      transform: `scale(${this.stateZoom()})`,
      transformOrigin: '0 0',
    };
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
    if (!this.canEditState()) return;
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
    if (!this.canEditState()) return;
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
    if (!this.canEditState()) return;
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

  protected startStateRouteDrag(line: StateTransitionLine, segmentIndex: number, event: MouseEvent): void {
    if (!this.canEditState()) return;
    if (event.button !== 0) return;
    const entity = this.selectedEntity();
    if (!entity) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectTransition(line.index, event);
    this.stateRouteDragState = {
      entityId: this.entityId(entity),
      transitionIndex: line.index,
      segmentIndex,
      points: line.points.map((point) => ({ x: point.x, y: point.y })),
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
  }

  protected boardSize(): Record<string, string> {
    const zoom = this.relationZoom();
    return {
      width: `${this.boardWidth()}px`,
      height: `${this.boardHeight()}px`,
      transform: `scale(${zoom})`,
      transformOrigin: '0 0',
    };
  }

  protected relationCanvasSize(): Record<string, string> {
    const zoom = this.relationZoom();
    return {
      width: `${Math.max(0, Math.round(this.boardWidth() * zoom))}px`,
      height: `${Math.max(0, Math.round(this.boardHeight() * zoom))}px`,
    };
  }

  protected onRelationWheel(event: WheelEvent): void {
    if (!event.ctrlKey || this.view() !== 'relation') return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    this.relationZoom.update((zoom) => Math.max(0.5, Math.min(2, Math.round((zoom + direction * 0.1) * 10) / 10)));
  }

  protected boardWidth(): number {
    const nodes = this.nodes();
    const groupFrames = this.groupFrames();
    const componentFrames = this.componentFrames();
    return Math.max(
      0,
      ...nodes.map((node) => node.x + node.width + 80),
      ...groupFrames.map((frame) => frame.left + frame.width + this.entityPad),
      ...componentFrames.map((frame) => frame.left + frame.width + this.entityPad * 2),
    );
  }

  protected boardHeight(): number {
    const nodes = this.nodes();
    const groupFrames = this.groupFrames();
    const componentFrames = this.componentFrames();
    return Math.max(
      0,
      ...nodes.map((node) => node.y + node.height + 100),
      ...groupFrames.map((frame) => frame.top + frame.height + this.entityPad),
      ...componentFrames.map((frame) => frame.top + frame.height + this.componentHeaderHeight + this.componentPadY + this.componentPadX),
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
    if (this.stateRouteDragState) {
      const drag = this.stateRouteDragState;
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      if (!drag.moved) return;
      const entity = this.entities().find((item) => this.entityId(item) === drag.entityId);
      if (!entity) return;
      this.setStateTransitionRoute(entity, drag.transitionIndex, this.shiftStateRouteSegment(drag.points, drag.segmentIndex, dx, dy), false);
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
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragState.moved = true;
    if (!this.dragState.moved) return;
    const originals = Object.values(this.dragState.originalPositions);
    const minOrigX = Math.min(...originals.map((point) => point.x));
    const minOrigY = Math.min(...originals.map((point) => point.y));
    const safeDx = Math.max(dx, 24 - minOrigX);
    const safeDy = Math.max(dy, 24 - minOrigY);
    for (const [id, original] of Object.entries(this.dragState.originalPositions)) {
      const entity = this.entities().find((item) => this.entityId(item) === id);
      if (!entity) continue;
      entity.pos = {
        x: Math.max(24, Math.round(original.x + safeDx)),
        y: Math.max(24, Math.round(original.y + safeDy)),
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
    if (this.stateRouteDragState) {
      const drag = this.stateRouteDragState;
      this.stateRouteDragState = null;
      if (drag.moved) this.adapter.markChanged();
      return;
    }
    if (this.selectionBox()) {
      this.applySelectionBox();
      this.selectionBox.set(null);
      return;
    }
    if (!this.dragState) return;
    const drag = this.dragState;
    this.dragState = null;
    if (drag.moved) this.adapter.markChanged();
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (!this.isRelationShortcutActive()) return;
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      this.selectedEntityIds.set(new Set(this.entities().map((entity) => this.entityId(entity))));
    }
  }

  private isRelationShortcutActive(): boolean {
    return this.view() === 'relation' && Boolean(document.getElementById('ef-canvas-entity-diagram'));
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
      const baseX = this.entityPad + this.componentPadX + layoutCol * (cellWidth + this.groupGapX);
      const baseY = this.entityPad + this.componentHeaderHeight + this.componentPadY + rawRow * (cellHeight + this.groupGapY);
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
    const selectedId = this.selectedEntityId();
    const channelCount: Record<string, number> = {};
    const channelIndex = (key: string): number => {
      const index = channelCount[key] || 0;
      channelCount[key] = index + 1;
      return index;
    };
    this.allRelations().forEach((relation, index) => {
      const from = nodeMap.get(this.relationFrom(relation));
      const to = nodeMap.get(this.relationTo(relation));
      if (!from || !to) return;
      const color = this.relationStrokeColors[index % this.relationStrokeColors.length];
      const crossGroup = from.constructKey !== to.constructKey;
      const focus = Boolean(selectedId && (from.id === selectedId || to.id === selectedId));
      const route = this.routeRelation(from, to, channelIndex);
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

  private routeRelation(from: EntityNodeLayout, to: EntityNodeLayout, channelIndex: (key: string) => number): { path: string; labelX: number; labelY: number } {
    const a = this.nodeRect(from);
    const b = this.nodeRect(to);
    if (from.id === to.id) {
      const index = channelIndex(`self-${from.id}`);
      const loopW = 28 + index * 22;
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
      const key = `h-${Math.round(((a.cy + b.cy) / 2) / 8) * 8}`;
      const index = channelIndex(key);
      const yOffset = (index % 2 === 0 ? 1 : -1) * Math.ceil(index / 2) * 8;
      const yCenter = (a.cy + b.cy) / 2 + yOffset;
      const path = dx >= 0
        ? `M ${a.r} ${a.cy} L ${a.r + 4} ${a.cy} L ${a.r + 4} ${yCenter} L ${b.l - 4} ${yCenter} L ${b.l - 4} ${b.cy} L ${b.l} ${b.cy}`
        : `M ${a.l} ${a.cy} L ${a.l - 4} ${a.cy} L ${a.l - 4} ${yCenter} L ${b.r + 4} ${yCenter} L ${b.r + 4} ${b.cy} L ${b.r} ${b.cy}`;
      return { path, labelX: (a.cx + b.cx) / 2, labelY: yCenter - 8 };
    }
    if (absDy >= absDx) {
      const goDown = dy > 0;
      const sy = goDown ? a.b : a.t;
      const ey = goDown ? b.t : b.b;
      const key = `v-${Math.round(Math.min(sy, ey))}-${Math.round(Math.max(sy, ey))}`;
      const index = channelIndex(key);
      const sign = index % 2 === 0 ? 1 : -1;
      const yMid = (sy + ey) / 2 + sign * Math.ceil(index / 2) * 10;
      return {
        path: `M ${a.cx} ${sy} L ${a.cx} ${yMid} L ${b.cx} ${yMid} L ${b.cx} ${ey}`,
        labelX: (a.cx + b.cx) / 2,
        labelY: yMid - 6,
      };
    }
    const goRight = dx > 0;
    const sx = goRight ? a.r : a.l;
    const ex = goRight ? b.l : b.r;
    const key = `r-${Math.round(Math.min(sx, ex))}-${Math.round(Math.max(sx, ex))}`;
    const index = channelIndex(key);
    const sign = index % 2 === 0 ? 1 : -1;
    const xMid = (sx + ex) / 2 + sign * Math.ceil(index / 2) * 10;
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

  private layoutStateBoard(entity: EntityDesignEntity | null, fieldName = this.selectedStateField()?.name || ''): StateBoardLayout {
    if (!entity) return { nodes: [], transitions: [], markerLinks: [], width: 720, height: 360 };
    const values = this.collectStateValues(entity, fieldName);
    const transitionValues = new Set<string>();
    for (const transition of this.transitionsForField(entity, fieldName)) {
      if (transition.from) transitionValues.add(transition.from);
      if (transition.to) transitionValues.add(transition.to);
    }
    const savedNodes = this.syncEntityStateNodes(entity, values, fieldName);
    const nodes = values.map((name, index) => {
      const scopedTransitions = this.transitionsForField(entity, fieldName);
      const incoming = scopedTransitions.filter((transition) => transition.to === name).length;
      const outgoing = scopedTransitions.filter((transition) => transition.from === name).length;
      const saved = savedNodes.find((item) => String(item.name || '') === name);
      const inferredKind: StateNodeLayout['kind'] = incoming === 0 && outgoing > 0
        ? 'initial'
        : (outgoing === 0 && incoming > 0 ? 'terminal' : 'intermediate');
      const savedKind = saved?.kind === 'initial' || saved?.kind === 'terminal' || saved?.kind === 'intermediate'
        ? saved.kind
        : inferredKind;
      return { name, kind: savedKind, originalIndex: index, savedPos: saved?.pos, savedMarkerPos: saved?.markerPos };
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
    const scopedTransitions = this.transitionsForField(entity, fieldName);
    const rowByState = new Map<string, number>();
    orderedRows.forEach((row, rowIndex) => row.forEach((node) => rowByState.set(node.name, rowIndex)));
    const padX = 48;
    const padY = 28;
    const gapX = 68;
    const gapY = 68;
    const nodeH = 36;
    const markerGap = 28;
    const startDotR = 8;
    const endOuterR = 10;
    const topMarkerSpace = initial.length ? markerGap + startDotR * 2 : 0;
    const bottomMarkerSpace = terminal.length ? markerGap + endOuterR * 2 : 0;
    const rowWidths = orderedRows.map((row) => {
      const widths = row.map((node) => this.stateNodeDisplayWidth(node.name));
      return widths.reduce((sum, width) => sum + width, 0) + Math.max(0, row.length - 1) * gapX;
    });
    const specialCount = scopedTransitions.filter((transition) => {
      const fromRow = rowByState.get(String(transition.from || ''));
      const toRow = rowByState.get(String(transition.to || ''));
      if (!Number.isFinite(fromRow) || !Number.isFinite(toRow)) return false;
      const isSelfLoop = transition.from === transition.to;
      const isBackward = !isSelfLoop && (toRow! < fromRow!);
      const isForwardDetour = !isSelfLoop && !isBackward && (toRow! - fromRow! > 1);
      return isSelfLoop || isBackward || isForwardDetour;
    }).length;
    const sideChannelEstimate = specialCount ? Math.max(1, Math.ceil(specialCount / 2)) : 0;
    const sideReserve = sideChannelEstimate ? 92 + Math.max(0, sideChannelEstimate - 1) * 18 : 0;
    const layoutBoardW = Math.max(360, padX * 2 + Math.max(...rowWidths, 0));
    orderedRows.forEach((row, rowIndex) => {
      const rowWidths = row.map((node) => this.stateNodeDisplayWidth(node.name));
      const rowWidth = rowWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, row.length - 1) * gapX;
      const startX = sideReserve + Math.max(padX, (layoutBoardW - rowWidth) / 2);
      row.forEach((node, colIndex) => {
        const autoX = Math.round(startX + rowWidths.slice(0, colIndex).reduce((sum, width) => sum + width, 0) + colIndex * gapX);
        const autoY = padY + topMarkerSpace + rowIndex * (nodeH + gapY);
        const x = Number.isFinite(Number(node.savedPos?.x)) ? Math.max(4, Math.round(Number(node.savedPos?.x))) : autoX;
        const y = Number.isFinite(Number(node.savedPos?.y)) ? Math.max(4, Math.round(Number(node.savedPos?.y))) : autoY;
        const width = rowWidths[colIndex];
        const savedMarker = this.normalizePoint(node.savedMarkerPos);
        const marker = node.kind === 'initial'
          ? { kind: 'initial' as const, x: savedMarker?.x ?? x + width / 2, y: savedMarker?.y ?? y - markerGap, size: startDotR * 2 }
          : (node.kind === 'terminal' ? { kind: 'terminal' as const, x: savedMarker?.x ?? x + width / 2, y: savedMarker?.y ?? y + nodeH + markerGap, size: endOuterR * 2 } : undefined);
        layouts.push({ name: node.name, kind: node.kind, row: rowIndex, x, y, width, height: nodeH, marker });
      });
    });
    const nodeMap = new Map(layouts.map((node) => [node.name, node]));
    const routePlans = this.planLegacyStateTransitionRoutes(scopedTransitions, nodeMap, layouts);
    const transitions = scopedTransitions.map((transition) => {
      const index = (entity.state_transitions || []).indexOf(transition);
      const from = nodeMap.get(String(transition.from || ''));
      const to = nodeMap.get(String(transition.to || ''));
      if (!from || !to) return null;
      const route = this.routeStateTransition(from, to, index, transition, routePlans.get(transition));
      const metrics = this.stateLinkLabelMetrics(transition.action || transition.label || '流转');
      const placement = this.stateLinkLabelPlacement(route.points, (from.x + from.width / 2 + to.x + to.width / 2) / 2, (from.y + from.height / 2 + to.y + to.height / 2) / 2, metrics);
      const labelPos = this.normalizePoint(transition.labelPos);
      return {
        index,
        transition,
        from,
        to,
        path: route.path,
        label: transition.action || transition.label || '流转',
        labelX: labelPos?.x ?? placement.x,
        labelY: labelPos?.y ?? placement.y,
        labelWidth: metrics.width,
        labelHeight: metrics.height,
        labelAngle: labelPos ? 0 : placement.angle,
        points: route.points,
        selected: this.selectedTransitionIndex() === index,
      };
    }).filter(Boolean) as StateTransitionLine[];
    const markerLinks = layouts
      .filter((node) => node.marker)
      .map((node) => {
        const marker = node.marker!;
        const from = marker.kind === 'initial'
          ? { x: marker.x, y: marker.y }
          : { x: node.x + node.width / 2, y: node.y + node.height };
        const to = marker.kind === 'initial'
          ? { x: node.x + node.width / 2, y: node.y }
          : { x: marker.x, y: marker.y };
        return { path: this.statePathFromPoints([from, to]), terminal: marker.kind === 'terminal' };
      });
    const routeBounds = transitions.flatMap((line) => line.points);
    const labelBounds = transitions.map((line) => ({ x: line.labelX + line.labelWidth / 2, y: line.labelY + line.labelHeight / 2 }));
    const width = Math.max(sideReserve * 2 + layoutBoardW, 720, ...layouts.map((node) => node.x + node.width + 96), ...routeBounds.map((point) => point.x + 96), ...labelBounds.map((point) => point.x + 48));
    const height = Math.max(360, padY * 2 + topMarkerSpace + bottomMarkerSpace + orderedRows.length * nodeH + Math.max(0, orderedRows.length - 1) * gapY, ...layouts.map((node) => node.y + node.height + bottomMarkerSpace + 80), ...routeBounds.map((point) => point.y + 80), ...labelBounds.map((point) => point.y + 48));
    return { nodes: layouts, transitions, markerLinks, width, height };
  }

  private planLegacyStateTransitionRoutes(
    transitions: EntityStateTransition[],
    nodeMap: Map<string, StateNodeLayout>,
    nodes: StateNodeLayout[],
  ): Map<EntityStateTransition, StateTransitionRoutePlan> {
    const plans = new Map<EntityStateTransition, StateTransitionRoutePlan>();
    const rows = Math.max(1, ...nodes.map((node) => node.row + 1));
    const minNodeLeft = Math.min(...nodes.map((node) => node.x), 48);
    const maxNodeRight = Math.max(...nodes.map((node) => node.x + node.width), 280);
    const sideUsage: Record<'left' | 'right', number[]> = {
      left: Array.from({ length: rows }, () => 0),
      right: Array.from({ length: rows }, () => 0),
    };
    const endpointUsage: Record<'left' | 'right', number[]> = {
      left: Array.from({ length: rows }, () => 0),
      right: Array.from({ length: rows }, () => 0),
    };
    const anchorUsage: Record<'left' | 'right', Record<string, number>> = { left: {}, right: {} };
    const metas = transitions.map((transition, index) => {
      const from = nodeMap.get(String(transition.from || ''));
      const to = nodeMap.get(String(transition.to || ''));
      const rowDelta = from && to ? to.row - from.row : 0;
      const isSelfLoop = Boolean(from && to && from.name === to.name);
      const isBackward = Boolean(from && to && !isSelfLoop && (to.row < from.row || (to.row === from.row && nodes.indexOf(to) < nodes.indexOf(from))));
      const isForwardDetour = Boolean(from && to && !isSelfLoop && !isBackward && rowDelta > 1);
      return { transition, index, from, to, rowDelta, isSelfLoop, isBackward, isForwardDetour };
    }).filter((meta) => meta.from && meta.to && (meta.isSelfLoop || meta.isBackward || meta.isForwardDetour));
    const spanRows = (fromRow: number, toRow: number): number[] => {
      const start = Math.max(0, Math.min(fromRow, toRow));
      const end = Math.max(start, Math.max(fromRow, toRow));
      return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
    };
    const sideRouteX = (side: 'left' | 'right', channelIndex: number): number => (
      side === 'right'
        ? maxNodeRight + 28 + channelIndex * 18
        : minNodeLeft - 28 - channelIndex * 18
    );
    const priority = (meta: typeof metas[number]): number => {
      if (meta.isBackward) return 0;
      if (meta.isForwardDetour) return 1;
      return 2;
    };

    metas
      .slice()
      .sort((left, right) => {
        const spanDiff = spanRows(right.from!.row, right.to!.row).length - spanRows(left.from!.row, left.to!.row).length;
        if (spanDiff) return spanDiff;
        const priorityDiff = priority(left) - priority(right);
        if (priorityDiff) return priorityDiff;
        return left.index - right.index;
      })
      .forEach((meta) => {
        const from = meta.from!;
        const to = meta.to!;
        const rowsCovered = spanRows(from.row, to.row);
        const preferredSides: Array<'left' | 'right'> = meta.isBackward ? ['left', 'right'] : ['right', 'left'];
        const [best] = (['left', 'right'] as const)
          .map((side) => {
            const channelIndex = rowsCovered.reduce((max, row) => Math.max(max, sideUsage[side][row] || 0), 0);
            const routeX = sideRouteX(side, channelIndex);
            const sourceHookX = side === 'right' ? from.x + from.width : from.x;
            const targetHookX = side === 'right' ? to.x + to.width : to.x;
            const distanceScore = Math.abs(sourceHookX - routeX) + Math.abs(targetHookX - routeX) + Math.abs((from.y + from.height / 2) - (to.y + to.height / 2));
            const crowdScore = rowsCovered.reduce((sum, row) => sum + (sideUsage[side][row] || 0), 0) * (meta.isBackward ? 104 : 64);
            const endpointRows = Array.from(new Set([from.row, to.row]));
            const endpointScore = endpointRows.reduce((sum, row) => sum + (endpointUsage[side][row] || 0), 0) * 108;
            const sourceAnchorKey = `${from.name}:${from.row}`;
            const targetAnchorKey = `${to.name}:${to.row}`;
            const anchorScore = ((anchorUsage[side][sourceAnchorKey] || 0) + (anchorUsage[side][targetAnchorKey] || 0)) * 88;
            const preferencePenalty = preferredSides.indexOf(side) * (meta.isBackward ? 36 : 14);
            return { side, channelIndex, routeX, score: distanceScore + crowdScore + endpointScore + anchorScore + preferencePenalty };
          })
          .sort((left, right) => left.score - right.score);
        rowsCovered.forEach((row) => {
          sideUsage[best.side][row] = Math.max(sideUsage[best.side][row] || 0, best.channelIndex + 1);
        });
        [from.row, to.row].forEach((row) => {
          endpointUsage[best.side][row] = (endpointUsage[best.side][row] || 0) + 1;
        });
        anchorUsage[best.side][`${from.name}:${from.row}`] = (anchorUsage[best.side][`${from.name}:${from.row}`] || 0) + 1;
        anchorUsage[best.side][`${to.name}:${to.row}`] = (anchorUsage[best.side][`${to.name}:${to.row}`] || 0) + 1;
        plans.set(meta.transition, { side: best.side, channelIndex: best.channelIndex, routeX: best.routeX });
      });
    return plans;
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

  private syncEntityStateNodes(entity: EntityDesignEntity, values: string[], fieldName = ''): NonNullable<EntityDesignEntity['state_nodes']> {
    const owner = fieldName && !(entity.state_nodes || []).length
      ? (this.fieldByName(entity, fieldName) || entity)
      : entity;
    owner.state_nodes ||= [];
    const names = new Set(values);
    owner.state_nodes = owner.state_nodes.filter((node) => names.has(String(node.name || '')));
    for (const [index, name] of values.entries()) {
      if (!owner.state_nodes.some((node) => String(node.name || '') === name)) {
        owner.state_nodes.push({ name, kind: this.defaultStateNodeKind(index, values.length) });
      }
    }
    return owner.state_nodes;
  }

  private defaultStateNodeKind(index: number, total: number): StateNodeLayout['kind'] {
    if (total <= 1) return 'intermediate';
    if (index === 0) return 'initial';
    if (index === total - 1) return 'terminal';
    return 'intermediate';
  }

  private setStateNodePosition(entity: EntityDesignEntity, stateName: string, pos: { x: number; y: number }, markChanged = true): void {
    const fieldName = this.selectedStateField()?.name || '';
    const values = this.collectStateValues(entity, fieldName);
    const nodes = this.syncEntityStateNodes(entity, values, fieldName);
    const node = nodes.find((item) => String(item.name || '') === stateName);
    if (!node) return;
    node.pos = { x: pos.x, y: pos.y };
    if (markChanged) this.changed();
  }

  private setStateMarkerPosition(entity: EntityDesignEntity, stateName: string, pos: { x: number; y: number }, markChanged = true): void {
    const fieldName = this.selectedStateField()?.name || '';
    const values = this.collectStateValues(entity, fieldName);
    const nodes = this.syncEntityStateNodes(entity, values, fieldName);
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

  private setStateTransitionRoute(entity: EntityDesignEntity, transitionIndex: number, points: Array<{ x: number; y: number }>, markChanged = true): void {
    const transition = entity.state_transitions?.[transitionIndex];
    if (!transition || points.length < 2) return;
    const waypoints = points.slice(1, -1).map((point) => ({ x: Math.max(4, Math.round(point.x)), y: Math.max(4, Math.round(point.y)) }));
    transition.route = {
      ...(transition.route || {}),
      mode: waypoints.length ? 'manual' : 'auto',
      waypoints,
    };
    transition.waypoints = waypoints;
    if (markChanged) this.changed();
  }

  private shiftStateRouteSegment(points: Array<{ x: number; y: number }>, segmentIndex: number, dx: number, dy: number): Array<{ x: number; y: number }> {
    const next = points.map((point) => ({ x: point.x, y: point.y }));
    const current = next[segmentIndex];
    const target = next[segmentIndex + 1];
    if (!current || !target) return next;
    const horizontal = Math.abs(current.y - target.y) <= Math.abs(current.x - target.x);
    const delta = horizontal ? { x: 0, y: dy } : { x: dx, y: 0 };
    if (segmentIndex > 0) {
      next[segmentIndex] = { x: Math.max(4, Math.round(current.x + delta.x)), y: Math.max(4, Math.round(current.y + delta.y)) };
    }
    if (segmentIndex + 1 < next.length - 1) {
      next[segmentIndex + 1] = { x: Math.max(4, Math.round(target.x + delta.x)), y: Math.max(4, Math.round(target.y + delta.y)) };
    }
    if (segmentIndex === 0 && next.length === 2) {
      next.splice(1, 0, { x: Math.max(4, Math.round(current.x + delta.x)), y: Math.max(4, Math.round(current.y + delta.y)) });
    }
    return next;
  }

  private normalizePoint(point: { x?: number; y?: number } | null | undefined): { x: number; y: number } | null {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.max(4, Math.round(x)), y: Math.max(4, Math.round(y)) };
  }

  private routeStateTransition(
    from: StateNodeLayout,
    to: StateNodeLayout,
    index: number,
    transition?: EntityStateTransition,
    plan?: StateTransitionRoutePlan,
  ): { path: string; points: Array<{ x: number; y: number }>; labelX: number; labelY: number } {
    const isSelfLoop = from.name === to.name;
    const isBackward = !isSelfLoop && to.row < from.row;
    const isForwardDetour = !isSelfLoop && to.row - from.row > 1;
    if (isBackward || isForwardDetour) {
      const side = plan?.side || (isBackward ? 'left' : 'right');
      const channelX = plan?.routeX ?? (side === 'left'
        ? Math.min(from.x, to.x) - 28
        : Math.max(from.x + from.width, to.x + to.width) + 28);
      const fromX = side === 'left' ? from.x : from.x + from.width;
      const toX = side === 'left' ? to.x : to.x + to.width;
      const fromY = from.y + from.height / 2;
      const toY = to.y + to.height / 2;
      const points = [
        { x: fromX, y: fromY },
        { x: channelX, y: fromY },
        { x: channelX, y: toY },
        { x: toX, y: toY },
      ];
      const routedPoints = this.applyStateManualRoute(points, transition, from, to);
      return {
        path: this.statePathFromPoints(routedPoints),
        points: routedPoints,
        labelX: channelX + (side === 'left' ? -36 : 10),
        labelY: (fromY + toY) / 2 - 6,
      };
    }
    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height;
    const toX = to.x + to.width / 2;
    const toY = to.y;
    if (isSelfLoop) {
      const side = plan?.side || 'right';
      const routeX = plan?.routeX ?? (from.x + from.width + 34);
      const loopW = Math.abs(routeX - (side === 'right' ? from.x + from.width : from.x));
      const midY = from.y + from.height / 2;
      const startX = side === 'right' ? from.x + from.width : from.x;
      const points = [
        { x: startX, y: midY - 7 - (plan?.channelIndex || 0) * 3 },
        { x: routeX, y: midY - 7 - (plan?.channelIndex || 0) * 3 },
        { x: routeX, y: midY + 7 + (plan?.channelIndex || 0) * 3 },
        { x: startX, y: midY + 7 + (plan?.channelIndex || 0) * 3 },
      ];
      const routedPoints = this.applyStateManualRoute(points, transition, from, to);
      return {
        path: this.statePathFromPoints(routedPoints),
        points: routedPoints,
        labelX: routeX + (side === 'left' ? -36 : 10),
        labelY: midY + 14,
      };
    }
    const midY = Math.round((fromY + toY) / 2) + (index % 2 ? 10 : 0);
    const points = [
      { x: fromX, y: fromY },
      { x: fromX, y: midY },
      { x: toX, y: midY },
      { x: toX, y: toY },
    ];
    const routedPoints = this.applyStateManualRoute(points, transition, from, to);
    return {
      path: this.statePathFromPoints(routedPoints),
      points: routedPoints,
      labelX: Math.round((fromX + toX) / 2),
      labelY: midY - 8,
    };
  }

  private applyStateManualRoute(
    points: Array<{ x: number; y: number }>,
    transition?: EntityStateTransition,
    from?: StateNodeLayout,
    to?: StateNodeLayout,
  ): Array<{ x: number; y: number }> {
    const fromAnchor = this.normalizeStateTransitionAnchor(transition?.route?.fromAnchor);
    const toAnchor = this.normalizeStateTransitionAnchor(transition?.route?.toAnchor);
    const anchored = points.map((point) => ({ ...point }));
    if (fromAnchor !== 'auto') {
      anchored[0] = this.stateAnchorPoint(from, fromAnchor, anchored[0]);
    }
    if (toAnchor !== 'auto') {
      anchored[anchored.length - 1] = this.stateAnchorPoint(to, toAnchor, anchored[anchored.length - 1]);
    }
    const waypoints = (transition?.route?.waypoints?.length ? transition.route.waypoints : transition?.waypoints) || [];
    const normalized = waypoints
      .map((point) => this.normalizePoint(point))
      .filter((point): point is { x: number; y: number } => Boolean(point));
    return normalized.length ? [anchored[0], ...normalized, anchored[anchored.length - 1]] : anchored;
  }

  private normalizeStateTransitionAnchor(anchor: unknown): 'auto' | 'top' | 'right' | 'bottom' | 'left' {
    return anchor === 'top' || anchor === 'right' || anchor === 'bottom' || anchor === 'left' ? anchor : 'auto';
  }

  private stateAnchorPoint(
    node: StateNodeLayout | undefined,
    anchor: 'top' | 'right' | 'bottom' | 'left',
    fallback: { x: number; y: number },
  ): { x: number; y: number } {
    // Boundary detail: the legacy renderer rewrites only the endpoint anchor; the rest of
    // the route stays intact so manually dragged waypoints do not jump during redraw.
    if (!node) return fallback;
    if (anchor === 'top') return { x: node.x + node.width / 2, y: node.y };
    if (anchor === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 };
    if (anchor === 'bottom') return { x: node.x + node.width / 2, y: node.y + node.height };
    if (anchor === 'left') return { x: node.x, y: node.y + node.height / 2 };
    return fallback;
  }

  private stateLinkLabelMetrics(label: string): { text: string; width: number; height: number } {
    const text = String(label || '').trim() || '流转';
    let units = 0;
    for (const ch of text) {
      if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(ch)) units += 1.1;
      else if (/[A-Z0-9]/.test(ch)) units += 0.72;
      else if (/[a-z]/.test(ch)) units += 0.62;
      else units += 0.9;
    }
    return {
      text,
      width: Math.max(34, Math.min(160, Math.round(18 + units * 12))),
      height: 20,
    };
  }

  private stateLinkLabelPlacement(
    points: Array<{ x: number; y: number }>,
    preferredX: number,
    preferredY: number,
    metrics: { width: number; height: number },
  ): { x: number; y: number; angle: number } {
    const segments: Array<{ axis: 'horizontal' | 'vertical' | 'diagonal'; length: number; midX: number; midY: number }> = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const horizontal = Math.abs(dy) < 0.5;
      const vertical = Math.abs(dx) < 0.5;
      segments.push({
        axis: horizontal ? 'horizontal' : (vertical ? 'vertical' : 'diagonal'),
        length: Math.hypot(dx, dy),
        midX: (start.x + end.x) / 2,
        midY: (start.y + end.y) / 2,
      });
    }
    const xs = points.map((point) => point.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const ranked = segments
      .filter((segment) => segment.length > 0)
      .sort((left, right) => {
        const score = (segment: typeof segments[number]): number => {
          const axisPenalty = segment.axis === 'horizontal' ? 0 : (segment.axis === 'vertical' ? 6 : 999);
          const edgeGap = Math.min(Math.abs(segment.midX - minX), Math.abs(segment.midX - maxX));
          const edgePenalty = segment.axis === 'diagonal' ? 999 : (edgeGap < 16 ? 70 : 0);
          return Math.abs(segment.midX - preferredX) * 1.6
            + Math.abs(segment.midY - preferredY) * 0.28
            + axisPenalty
            + edgePenalty
            - Math.min(segment.length, 160) * 0.18;
        };
        return score(left) - score(right);
      });
    const target = ranked[0];
    if (!target) return { x: points[0]?.x || 0, y: points[0]?.y || 0, angle: 0 };
    return {
      x: target.axis === 'vertical'
        ? target.midX + ((target.midX <= preferredX ? 1 : -1) * Math.max(24, Math.min(34, Math.round(metrics.width / 2 - 2))))
        : target.midX,
      y: target.midY,
      angle: 0,
    };
  }

  private statePathFromPoints(points: Array<{ x: number; y: number }>): string {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${Math.round(point.x)} ${Math.round(point.y)}`).join(' ');
  }

  private collectStateValues(entity: EntityDesignEntity | null, fieldName = ''): string[] {
    if (!entity) return [];
    const values = new Set<string>();
    const fields = fieldName ? (entity.fields || []).filter((field) => String(field.name || '') === fieldName) : (entity.fields || []);
    const explicitStatus = fields.some((field) => field.is_status || field.status_role);
    for (const field of fields) {
      const delimiter = field.is_status || field.status_role ? '/' : /[,\n，、/]/;
      const rawValues = [
        ...(Array.isArray(field.states) ? field.states : []),
        ...String(field.state_values || '').split(delimiter),
        ...this.stateValuesFromNote(field.note || ''),
      ];
      rawValues.map((value) => value.trim()).filter(Boolean).forEach((value) => values.add(value));
    }
    if (!explicitStatus || !values.size) {
      for (const transition of this.transitionsForField(entity, fieldName)) {
        if (transition.from) values.add(transition.from);
        if (transition.to) values.add(transition.to);
      }
    }
    return Array.from(values);
  }

  private collectStateFields(entity: EntityDesignEntity | null): EntityDesignField[] {
    if (!entity) return [];
    const explicit = (entity.fields || [])
      .filter((field) => field.is_status || field.status_role)
      .sort((left, right) => {
        const leftPriority = left.status_role === 'primary' ? 0 : 1;
        const rightPriority = right.status_role === 'primary' ? 0 : 1;
        return leftPriority - rightPriority;
      });
    return explicit.length ? explicit : (entity.fields || []).filter((field) => field.state_values || this.stateValuesFromNote(field.note || '').length);
  }

  private buildStatePanels(entity: EntityDesignEntity | null): StateFieldPanel[] {
    if (!entity) return [];
    const activeName = this.selectedStateField()?.name || '';
    return this.stateFields().map((field) => {
      const name = String(field.name || '');
      const role = field.status_role === 'secondary' ? 'secondary' : (field.status_role === 'primary' || field.is_status ? 'primary' : 'none');
      return {
        field,
        name,
        label: `${name || '未命名状态字段'}${role === 'primary' ? ' · 主状态' : role === 'secondary' ? ' · 子状态' : ''}`,
        values: this.collectStateValues(entity, name),
        board: this.layoutStateBoard(entity, name),
        active: name === activeName,
        role,
      };
    });
  }

  private groupStateEntities(): StateEntityGroup[] {
    const groups = new Map<string, StateEntityGroup>();
    for (const entity of this.entities()) {
      const name = this.constructLabel(entity);
      const group = groups.get(name) || { name, items: [] };
      group.items.push(entity);
      groups.set(name, group);
    }
    return Array.from(groups.values());
  }

  protected ensureActiveStateField(entity: EntityDesignEntity | null): void {
    if (!entity) return;
    const fields = this.collectStateFields(entity);
    if (!fields.length) return;
    if (!fields.some((field) => String(field.name || '') === this.stateFieldName())) {
      this.stateFieldName.set(String(fields[0].name || ''));
    }
  }

  private fieldByName(entity: EntityDesignEntity, fieldName: string): EntityDesignField | null {
    return (entity.fields || []).find((field) => String(field.name || '') === fieldName) || null;
  }

  private transitionsForField(entity: EntityDesignEntity, fieldName = ''): EntityStateTransition[] {
    const transitions = entity.state_transitions || [];
    if (!fieldName) return transitions;
    return transitions.filter((transition) => !transition.field_name || transition.field_name === fieldName);
  }

  private processNodes(process: any): any[] {
    const pools = [process?.tasks, process?.nodes, process?.steps, process?.flow?.nodes, process?.taskDefinitions];
    return pools.flatMap((items) => Array.isArray(items) ? items : []);
  }

  private stateValuesFromNote(note: string): string[] {
    const text = String(note || '');
    const match = text.match(/(?:状态|取值|枚举)[：:]\s*([^。；;\n]+)/);
    return (match?.[1] || '')
      .split(/[\/,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
