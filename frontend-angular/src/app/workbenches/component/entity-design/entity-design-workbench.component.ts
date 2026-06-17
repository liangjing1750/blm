import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, signal } from '@angular/core';
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
  color: string;
  background: string;
  constructName: string;
}

interface EntityRelationLine {
  from: EntityNodeLayout;
  to: EntityNodeLayout;
  label: string;
}

interface EntityDragState {
  entityId: string;
  startClientX: number;
  startClientY: number;
  originalPositions: Record<string, { x: number; y: number }>;
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
export class EntityDesignWorkbenchComponent {
  // 模块意图：实体设计在构件工作台内独立运行，复刻旧实体关系图/状态图的核心体验，但不调用 entity-legacy 渲染函数。
  private readonly nodeWidth = 120;
  private readonly nodeHeight = 38;
  protected readonly view = signal<EntityDesignView>('relation');
  protected readonly version = signal(0);
  protected readonly selectedEntityId = signal('');
  protected readonly selectedEntityIds = signal<Set<string>>(new Set());
  protected readonly editorOpen = signal(true);
  protected readonly selectionBox = signal<SelectionBox | null>(null);
  private readonly adapter: EntityDesignAdapter = createEntityDesignLegacyAdapter();
  private readonly palette = [
    { color: '#3b82f6', background: '#dbeafe' },
    { color: '#22c55e', background: '#dcfce7' },
    { color: '#eab308', background: '#fef9c3' },
    { color: '#ec4899', background: '#fce7f3' },
    { color: '#8b5cf6', background: '#ede9fe' },
    { color: '#06b6d4', background: '#cffafe' },
  ];
  private dragState: EntityDragState | null = null;

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

  protected setView(view: EntityDesignView): void {
    this.view.set(view);
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
    this.editorOpen.set(true);
  }

  protected isSelected(entity: EntityDesignEntity): boolean {
    return this.selectedEntityIds().has(this.entityId(entity));
  }

  protected startEntityDrag(entity: EntityDesignEntity, event: MouseEvent): void {
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
  }

  protected addEntity(): void {
    // 关键流程：新实体只补充最小字段，后续字段、状态和关系由右侧编辑区继续完善。
    const entities = this.adapter.entities();
    const id = this.adapter.nextId('ENT', entities);
    const entity: EntityDesignEntity = {
      uid: id,
      id,
      name: '新实体',
      note: '',
      fields: [],
      relations: [],
      state_transitions: [],
    };
    entities.push(entity);
    this.selectedEntityId.set(id);
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
      '--entity-accent': node.color,
      '--entity-bg': node.background,
    };
  }

  protected linePath(line: EntityRelationLine): string {
    const startX = line.from.x + this.nodeWidth;
    const startY = line.from.y + this.nodeHeight / 2;
    const endX = line.to.x;
    const endY = line.to.y + this.nodeHeight / 2;
    const midX = Math.round((startX + endX) / 2);
    return `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
  }

  protected boardSize(): Record<string, string> {
    const nodes = this.nodes();
    const width = Math.max(900, ...nodes.map((node) => node.x + this.nodeWidth + 120));
    const height = Math.max(520, ...nodes.map((node) => node.y + this.nodeHeight + 96));
    return { width: `${width}px`, height: `${height}px` };
  }

  protected boardWidth(): number {
    const nodes = this.nodes();
    return Math.max(900, ...nodes.map((node) => node.x + this.nodeWidth + 120));
  }

  protected boardHeight(): number {
    const nodes = this.nodes();
    return Math.max(520, ...nodes.map((node) => node.y + this.nodeHeight + 96));
  }

  @HostListener('document:mousemove', ['$event'])
  protected onDocumentMouseMove(event: MouseEvent): void {
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

  private layoutEntities(): EntityNodeLayout[] {
    const groups = new Map<string, EntityDesignEntity[]>();
    for (const entity of this.entities()) {
      const label = this.constructLabel(entity);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)?.push(entity);
    }

    const nodes: EntityNodeLayout[] = [];
    Array.from(groups.entries()).forEach(([constructName, entities], groupIndex) => {
      const palette = this.palette[groupIndex % this.palette.length];
      entities.forEach((entity, entityIndex) => {
        nodes.push({
          entity,
          id: this.entityId(entity),
          x: entity.pos?.x ?? 60 + entityIndex * 180,
          y: entity.pos?.y ?? 84 + groupIndex * 142,
          color: palette.color,
          background: palette.background,
          constructName,
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
      .filter((node) => node.x < right && node.x + this.nodeWidth > left && node.y < bottom && node.y + this.nodeHeight > top)
      .map((node) => node.id);
    this.selectedEntityIds.set(new Set(selected));
    this.selectedEntityId.set(selected[0] || '');
    if (selected.length) this.editorOpen.set(true);
  }

  private collectRelationLines(): EntityRelationLine[] {
    const nodeMap = new Map(this.nodes().map((node) => [node.id, node]));
    const lines: EntityRelationLine[] = [];
    for (const relation of this.adapter.relations()) {
      const from = nodeMap.get(this.relationFrom(relation));
      const to = nodeMap.get(this.relationTo(relation));
      if (from && to) lines.push({ from, to, label: relation.label || relation.type || '关联' });
    }
    for (const entity of this.entities()) {
      for (const relation of entity.relations || []) {
        const from = nodeMap.get(this.relationFrom(relation) || this.entityId(entity));
        const to = nodeMap.get(this.relationTo(relation));
        if (from && to) lines.push({ from, to, label: relation.label || relation.type || '关联' });
      }
    }
    return lines;
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
