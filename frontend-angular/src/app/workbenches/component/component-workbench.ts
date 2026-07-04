import { CommonModule } from '@angular/common';
import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntityDesignWorkbenchComponent } from './entity-design/entity-design-workbench.component';
import { confirmRuntimeAction, getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';
import { RichTextEditorComponent } from '../../shared/rich-text/rich-text-editor.component';

type ComponentTab = 'businessComponent' | 'businessConstruct' | 'taskDef' | 'entity';
const UNASSIGNED_COMPONENT_ID = '__unassigned_component__';
const UNASSIGNED_CONSTRUCT_ID = '__unassigned_construct__';

interface LegacyComp { uid?: string; id?: string; name?: string; kind?: string; note?: string; entityUids?: string[]; taskDefinitionUids?: string[]; constructUids?: string[]; }
interface LegacyConstruct { uid?: string; id?: string; name?: string; note?: string; businessComponentUid?: string; businessComponentId?: string; businessComponent?: string; }
interface LegacyEntity { uid?: string; id?: string; name?: string; fields?: any[]; businessConstructUid?: string; businessConstructId?: string; businessConstructUids?: string[]; constructUid?: string; constructId?: string; }
interface TaskParam { name: string; type: string; required: boolean; note: string; }
interface LegacyTaskDef { uid?: string; id?: string; name?: string; type?: string; querySourceKind?: string; target?: string; address?: string; desc?: string; note?: string; parameters?: { inputs?: TaskParam[]; outputs?: TaskParam[] }; constructUid?: string; businessComponentUid?: string; }

@Component({
  selector: 'app-component-workbench', standalone: true, imports: [CommonModule, FormsModule, EntityDesignWorkbenchComponent, RichTextEditorComponent],
  templateUrl: './component-workbench.html',
  styleUrls: ['./component-workbench.scss', './component-workbench-tree.scss'],
})
export class ComponentWorkbenchComponent implements OnInit, OnDestroy {
  private readonly onRefresh = () => this.version.update((v) => v + 1);
  private readonly onMindMapCommand = (event: Event) => this.handleMindMapCommand(event as CustomEvent<{ command?: string }>);
  private readonly runtime = getAngularRuntimeState();
  ngOnInit(): void {
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
    window.addEventListener('blm-business-mindmap-command', this.onMindMapCommand);
  }
  ngOnDestroy(): void {
    window.removeEventListener('blm-workbench-refresh', this.onRefresh);
    window.removeEventListener('blm-business-mindmap-command', this.onMindMapCommand);
  }

  protected readonly version = signal(0);
  protected readonly activeTab = signal<ComponentTab>(this.restoreActiveTab());
  protected readonly editorOpen = signal(false);
  protected readonly selectedConstructId = signal(String(this.runtime.ui['componentWorkbenchConstructId'] || '').trim());
  protected readonly expandedComp = signal('');
  protected readonly expandedTreeComponentId = signal('');
  protected readonly expandedTreeConstructId = signal('');
  protected readonly mindMapZoom = signal(0.8);
  protected readonly selectedMindNode = signal<{ type: 'component' | 'construct' | 'entity' | 'task'; id: string } | null>(null);
  protected readonly editingMindNode = signal<{ type: 'component' | 'construct' | 'entity' | 'task'; id: string } | null>(null);
  protected readonly mindChildMenu = signal<{ constructId: string; active: 'entity' | 'task' } | null>(null);
  protected readonly collapsedMindComponents = signal<Set<string>>(new Set());
  protected readonly collapsedMindConstructs = signal<Set<string>>(new Set());
  protected readonly draggingMindNode = signal<{ type: 'component' | 'construct' | 'entity' | 'task'; id: string } | null>(null);
  protected readonly editTaskDef = signal<Partial<LegacyTaskDef> | null>(null);
  protected readonly taskDefKeyword = signal('');
  // 抽屉状态
  protected readonly compDrawer = signal<Partial<LegacyComp> | null>(null);
  protected readonly constructDrawer = signal<Partial<LegacyConstruct> | null>(null);
  protected readonly newConstructCompId = signal('');

  protected doc(): any { this.version(); return getAngularRuntimeState().doc || {}; }
  protected components(): LegacyComp[] { return this.doc().businessComponents || []; }
  protected coreComponents(): LegacyComp[] { return this.components().filter((comp) => this.componentKind(comp) === 'core'); }
  protected genericComponents(): LegacyComp[] { return this.components().filter((comp) => this.componentKind(comp) === 'generic'); }
  protected unassignedComponent(): LegacyComp {
    return { uid: UNASSIGNED_COMPONENT_ID, name: '未归属组件', kind: 'generic' };
  }
  protected unassignedConstruct(): LegacyConstruct {
    return { uid: UNASSIGNED_CONSTRUCT_ID, name: '未归属构件', businessComponentUid: UNASSIGNED_COMPONENT_ID };
  }
  protected groupedTreeComponents(): Array<{ kind: 'core' | 'generic'; title: string; components: LegacyComp[] }> {
    const groups: Array<{ kind: 'core' | 'generic'; title: string; components: LegacyComp[] }> = [
      { kind: 'core', title: '核心组件', components: this.coreComponents() },
      { kind: 'generic', title: '通用组件', components: this.genericComponents() },
    ];
    if (this.unclassifiedEntities().length || this.unclassifiedTaskDefs().length || this.ungroupedConstructs().length) {
      groups[1].components = [...groups[1].components, this.unassignedComponent()];
    }
    return groups.filter((group) => group.components.length);
  }
  protected constructs(): LegacyConstruct[] { return this.doc().businessConstructs || []; }
  protected entities(): LegacyEntity[] { return this.doc().entities || []; }
  protected taskDefs(): LegacyTaskDef[] { return this.doc().taskDefinitions || []; }

  protected canEdit(): boolean { return this.editorOpen() && !this.runtime.readOnly; }
  protected enableEditor(): void {
    if (this.runtime.readOnly) return;
    this.editorOpen.set(true);
  }
  protected toggleEditor(): void {
    if (this.runtime.readOnly) {
      this.editorOpen.set(false);
      return;
    }
    this.editorOpen.update((open) => {
      const next = !open;
      if (!next) {
        this.compDrawer.set(null);
        this.constructDrawer.set(null);
        this.editingTaskId.set('');
      }
      return next;
    });
  }

  // 业务组件/业务构件：总览只展示分组关系，详情页再展开实体与任务资产。
  protected constructsFor(comp: LegacyComp): LegacyConstruct[] {
    if (this.uid(comp) === UNASSIGNED_COMPONENT_ID) {
      return [this.unassignedConstruct(), ...this.ungroupedConstructs()];
    }
    const cid = this.uid(comp);
    const explicitIds = new Set(comp.constructUids || []);
    return this.constructs().filter((c) => this.constructComponentId(c) === cid || explicitIds.has(this.uid(c)));
  }
  protected visibleConstructsFor(comp: LegacyComp): LegacyConstruct[] {
    const list = this.constructsFor(comp);
    return this.expandedComp() === this.uid(comp) ? list : list.slice(0, 3);
  }
  protected hiddenConstructCount(comp: LegacyComp): number {
    return Math.max(0, this.constructsFor(comp).length - this.visibleConstructsFor(comp).length);
  }
  protected isTreeComponentExpanded(comp: LegacyComp): boolean {
    return this.expandedTreeComponentId() === this.uid(comp);
  }
  protected isTreeConstructExpanded(construct: LegacyConstruct): boolean {
    return this.expandedTreeConstructId() === this.uid(construct);
  }
  protected toggleTreeComponent(comp: LegacyComp): void {
    const id = this.uid(comp);
    const next = this.expandedTreeComponentId() === id ? '' : id;
    this.expandedTreeComponentId.set(next);
    this.expandedTreeConstructId.set('');
  }
  protected toggleTreeConstruct(construct: LegacyConstruct, event?: Event): void {
    event?.stopPropagation();
    const id = this.uid(construct);
    this.expandedTreeConstructId.set(this.expandedTreeConstructId() === id ? '' : id);
  }
  protected mindMapZoomPercent(): number {
    return Math.round(this.mindMapZoom() * 100);
  }
  protected resetMindMapZoom(): void {
    this.mindMapZoom.set(0.8);
  }
  private handleMindMapCommand(event: CustomEvent<{ command?: string }>): void {
    if (this.activeTab() !== 'businessComponent') return;
    const command = event.detail?.command;
    if (command === 'mind-toggle-selected') this.toggleSelectedMindNode();
    if (command === 'mind-collapse-all') this.collapseAllMindNodes();
    if (command === 'mind-expand-all') this.expandAllMindNodes();
    if (command === 'mind-reset-zoom') this.resetMindMapZoom();
  }
  protected onMindMapWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    this.mindMapZoom.update((zoom) => Math.min(1.6, Math.max(0.5, Math.round((zoom + delta) * 10) / 10)));
  }
  protected selectMindNode(type: 'component' | 'construct' | 'entity' | 'task', id: string, event?: Event): void {
    event?.stopPropagation();
    this.selectedMindNode.set({ type, id });
    this.mindChildMenu.set(null);
    if (type === 'component') this.expandedTreeComponentId.set(id);
    if (type === 'construct') this.expandedTreeConstructId.set(id);
  }
  protected isMindNodeSelected(type: 'component' | 'construct' | 'entity' | 'task', id: string): boolean {
    const selected = this.selectedMindNode();
    return selected?.type === type && selected.id === id;
  }
  protected onMindMapKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault();
      this.collapseAllMindNodes();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
      event.preventDefault();
      this.expandAllMindNodes();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault();
      this.resetMindMapZoom();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.toggleSelectedMindNode();
      return;
    }
    if (!this.canEdit()) return;
    const menu = this.mindChildMenu();
    if (menu && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.key)) {
      event.preventDefault();
      this.handleMindChildMenuKey(event.key, menu);
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      this.moveMindSelection(event.key);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selectedForDelete = this.selectedMindNode();
      if (selectedForDelete) {
        event.preventDefault();
        void this.deleteSelectedMindNode(selectedForDelete);
      }
      return;
    }
    if (event.key !== 'Enter' && event.key !== 'Tab') return;
    const selected = this.selectedMindNode();
    if (!selected) return;
    event.preventDefault();
    if (event.key === 'Enter') {
      this.createMindSibling(selected);
      return;
    }
    this.openOrCreateMindChild(selected);
  }
  protected isMindChildMenuOpenFor(construct: LegacyConstruct): boolean {
    return this.mindChildMenu()?.constructId === this.uid(construct);
  }
  protected isMindChildOptionActive(option: 'entity' | 'task'): boolean {
    return this.mindChildMenu()?.active === option;
  }
  protected isMindComponentCollapsed(comp: LegacyComp): boolean {
    return this.collapsedMindComponents().has(this.uid(comp));
  }
  protected isMindConstructCollapsed(construct: LegacyConstruct): boolean {
    return this.collapsedMindConstructs().has(this.uid(construct));
  }
  protected toggleMindComponent(comp: LegacyComp, event?: Event): void {
    event?.stopPropagation();
    this.toggleMindSet(this.collapsedMindComponents, this.uid(comp));
  }
  protected toggleMindConstruct(construct: LegacyConstruct, event?: Event): void {
    event?.stopPropagation();
    this.toggleMindSet(this.collapsedMindConstructs, this.uid(construct));
  }
  protected collapseAllMindNodes(): void {
    this.collapsedMindComponents.set(new Set(this.components().map((comp) => this.uid(comp))));
    this.collapsedMindConstructs.set(new Set(this.constructs().map((construct) => this.uid(construct))));
    this.mindChildMenu.set(null);
  }
  protected expandAllMindNodes(): void {
    this.collapsedMindComponents.set(new Set());
    this.collapsedMindConstructs.set(new Set());
    this.mindChildMenu.set(null);
  }
  protected startMindRename(type: 'component' | 'construct' | 'entity' | 'task', id: string, event: Event): void {
    if (!this.canEdit()) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedMindNode.set({ type, id });
    this.editingMindNode.set({ type, id });
  }
  protected isMindNodeEditing(type: 'component' | 'construct' | 'entity' | 'task', id: string): boolean {
    const editing = this.editingMindNode();
    return editing?.type === type && editing.id === id;
  }
  protected updateMindNodeName(type: 'component' | 'construct' | 'entity' | 'task', id: string, value: string): void {
    if (!this.canEdit()) return;
    const target = type === 'component'
      ? this.components().find((item) => this.uid(item) === id)
      : type === 'construct'
        ? this.constructs().find((item) => this.uid(item) === id)
        : type === 'entity'
          ? this.entities().find((item) => this.uid(item) === id)
          : this.taskDefs().find((item) => this.uid(item) === id);
    if (!target) return;
    target.name = value;
    this.touch();
  }
  protected finishMindRename(event?: Event): void {
    event?.stopPropagation();
    this.editingMindNode.set(null);
  }
  private handleMindChildMenuKey(key: string, menu: { constructId: string; active: 'entity' | 'task' }): void {
    if (key === 'Escape') {
      this.mindChildMenu.set(null);
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      this.mindChildMenu.set({ constructId: menu.constructId, active: menu.active === 'entity' ? 'task' : 'entity' });
      return;
    }
    const construct = this.constructs().find((item) => this.uid(item) === menu.constructId);
    if (!construct) return;
    const created = menu.active === 'entity' ? this.createEntityForConstruct(construct) : this.createTaskForConstruct(construct);
    if (created) this.focusMindNode(menu.active, this.uid(created), true);
    this.mindChildMenu.set(null);
  }
  private toggleSelectedMindNode(): void {
    const selected = this.selectedMindNode();
    if (!selected) return;
    if (selected.type === 'component') this.toggleMindSet(this.collapsedMindComponents, selected.id);
    if (selected.type === 'construct') this.toggleMindSet(this.collapsedMindConstructs, selected.id);
  }
  private toggleMindSet(target: typeof this.collapsedMindComponents, id: string): void {
    target.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  private moveMindSelection(key: string): void {
    const selected = this.selectedMindNode();
    if (!selected) return;
    if (key === 'ArrowRight') {
      const child = this.firstMindChild(selected);
      if (child) this.focusMindNode(child.type, child.id);
      return;
    }
    if (key === 'ArrowLeft') {
      const parent = this.mindParent(selected);
      if (parent) this.focusMindNode(parent.type, parent.id);
      return;
    }
    const nodes = this.flatMindNodes();
    const index = nodes.findIndex((node) => node.type === selected.type && node.id === selected.id);
    if (index < 0) return;
    const nextIndex = key === 'ArrowDown' ? Math.min(nodes.length - 1, index + 1) : Math.max(0, index - 1);
    const next = nodes[nextIndex];
    this.focusMindNode(next.type, next.id);
  }
  private focusMindNode(type: 'component' | 'construct' | 'entity' | 'task', id: string, rename = false): void {
    this.selectedMindNode.set({ type, id });
    this.mindChildMenu.set(null);
    this.editingMindNode.set(rename ? { type, id } : null);
    if (type === 'construct') this.expandedTreeConstructId.set(id);
    if (type === 'component') this.expandedTreeComponentId.set(id);
  }
  private flatMindNodes(): Array<{ type: 'component' | 'construct' | 'entity' | 'task'; id: string }> {
    const nodes: Array<{ type: 'component' | 'construct' | 'entity' | 'task'; id: string }> = [];
    for (const group of this.groupedTreeComponents()) {
      for (const comp of group.components) {
        nodes.push({ type: 'component', id: this.uid(comp) });
        if (this.isMindComponentCollapsed(comp)) continue;
        for (const construct of this.constructsFor(comp)) {
          nodes.push({ type: 'construct', id: this.uid(construct) });
          if (this.isMindConstructCollapsed(construct)) continue;
          for (const entity of this.entitiesFor(construct)) nodes.push({ type: 'entity', id: this.uid(entity) });
          for (const task of this.taskDefsFor(construct)) nodes.push({ type: 'task', id: this.uid(task) });
        }
      }
    }
    return nodes;
  }
  private firstMindChild(node: { type: 'component' | 'construct' | 'entity' | 'task'; id: string }): { type: 'component' | 'construct' | 'entity' | 'task'; id: string } | null {
    if (node.type === 'component') {
      const comp = this.components().find((item) => this.uid(item) === node.id);
      if (comp && this.isMindComponentCollapsed(comp)) return null;
      const construct = comp ? this.constructsFor(comp)[0] : null;
      return construct ? { type: 'construct', id: this.uid(construct) } : null;
    }
    if (node.type === 'construct') {
      const construct = this.constructs().find((item) => this.uid(item) === node.id);
      if (construct && this.isMindConstructCollapsed(construct)) return null;
      const entity = construct ? this.entitiesFor(construct)[0] : null;
      if (entity) return { type: 'entity', id: this.uid(entity) };
      const task = construct ? this.taskDefsFor(construct)[0] : null;
      return task ? { type: 'task', id: this.uid(task) } : null;
    }
    return null;
  }
  private mindParent(node: { type: 'component' | 'construct' | 'entity' | 'task'; id: string }): { type: 'component' | 'construct' | 'entity' | 'task'; id: string } | null {
    if (node.type === 'construct') {
      const construct = this.constructs().find((item) => this.uid(item) === node.id);
      const compId = construct ? this.constructComponentId(construct) : '';
      return compId ? { type: 'component', id: compId } : null;
    }
    if (node.type === 'entity') {
      const entity = this.entities().find((item) => this.uid(item) === node.id);
      const constructId = entity?.businessConstructUid || entity?.constructUid || '';
      return constructId ? { type: 'construct', id: constructId } : null;
    }
    if (node.type === 'task') {
      const task = this.taskDefs().find((item) => this.uid(item) === node.id);
      return task?.constructUid ? { type: 'construct', id: task.constructUid } : null;
    }
    return null;
  }
  protected startMindDrag(type: 'component' | 'construct' | 'entity' | 'task', id: string, event: DragEvent): void {
    if (!this.canEdit()) return;
    event.stopPropagation();
    this.draggingMindNode.set({ type, id });
    event.dataTransfer?.setData('text/plain', `${type}:${id}`);
  }
  protected dropMindNode(targetType: 'component' | 'construct', targetId: string, event: DragEvent): void {
    if (!this.canEdit()) return;
    event.preventDefault();
    event.stopPropagation();
    const dragging = this.draggingMindNode();
    if (!dragging) return;
    if (targetType === 'component' && dragging.type === 'construct') {
      const construct = this.constructs().find((item) => this.uid(item) === dragging.id);
      if (construct) this.moveConstructToComponent(construct, targetId);
    }
    if (targetType === 'construct' && dragging.type === 'entity') {
      const entity = this.entities().find((item) => this.uid(item) === dragging.id);
      if (entity) this.moveEntityToConstruct(entity, targetId);
    }
    if (targetType === 'construct' && dragging.type === 'task') {
      const task = this.taskDefs().find((item) => this.uid(item) === dragging.id);
      if (task) this.moveTaskToConstruct(task, targetId);
    }
    this.draggingMindNode.set(null);
  }
  private createMindSibling(node: { type: 'component' | 'construct' | 'entity' | 'task'; id: string }): void {
    if (node.type === 'component') {
      this.addComponentInline('core');
      return;
    }
    if (node.type === 'construct') {
      const construct = this.constructs().find((item) => this.uid(item) === node.id);
      const component = construct ? this.components().find((item) => this.uid(item) === this.constructComponentId(construct)) : null;
      if (component) this.createTreeConstructForComponent(component);
    }
    if (node.type === 'entity') {
      const entity = this.entities().find((item) => this.uid(item) === node.id);
      const construct = entity ? this.constructs().find((item) => this.uid(item) === (entity.businessConstructUid || entity.constructUid)) : null;
      if (construct) this.createEntityForConstruct(construct);
    }
    if (node.type === 'task') {
      const task = this.taskDefs().find((item) => this.uid(item) === node.id);
      const construct = task ? this.constructs().find((item) => this.uid(item) === task.constructUid) : null;
      if (construct) this.createTaskForConstruct(construct);
    }
  }
  private openOrCreateMindChild(node: { type: 'component' | 'construct' | 'entity' | 'task'; id: string }): void {
    if (node.id === UNASSIGNED_COMPONENT_ID || node.id === UNASSIGNED_CONSTRUCT_ID) return;
    if (node.type === 'component') {
      const component = this.components().find((item) => this.uid(item) === node.id);
      if (component) this.createTreeConstructForComponent(component);
    }
    if (node.type === 'construct') {
      this.mindChildMenu.set({ constructId: node.id, active: 'entity' });
    }
  }
  private async deleteSelectedMindNode(node: { type: 'component' | 'construct' | 'entity' | 'task'; id: string }): Promise<void> {
    if (!this.canEdit() || node.id === UNASSIGNED_COMPONENT_ID || node.id === UNASSIGNED_CONSTRUCT_ID) return;
    const label = this.mindNodeLabel(node);
    const confirmed = await confirmRuntimeAction(`确认删除“${label}”吗？`, { title: '删除节点', confirmLabel: '删除' });
    if (!confirmed) return;
    if (node.type === 'component') {
      const component = this.components().find((item) => this.uid(item) === node.id);
      if (component) {
        for (const construct of this.constructsFor(component)) this.detachConstructFromComponent(construct);
        this.doc().businessComponents = this.components().filter((item) => this.uid(item) !== node.id);
      }
    }
    if (node.type === 'construct') {
      const construct = this.constructs().find((item) => this.uid(item) === node.id);
      if (construct) this.deleteConstruct(construct);
    }
    if (node.type === 'entity') {
      this.doc().entities = this.entities().filter((item) => this.uid(item) !== node.id);
    }
    if (node.type === 'task') {
      this.doc().taskDefinitions = this.taskDefs().filter((item) => this.uid(item) !== node.id);
    }
    this.selectedMindNode.set(null);
    this.editingMindNode.set(null);
    this.mindChildMenu.set(null);
    this.touch();
  }
  private mindNodeLabel(node: { type: 'component' | 'construct' | 'entity' | 'task'; id: string }): string {
    const source = node.type === 'component'
      ? this.components()
      : node.type === 'construct'
        ? this.constructs()
        : node.type === 'entity'
          ? this.entities()
          : this.taskDefs();
    const item = source.find((candidate) => this.uid(candidate) === node.id);
    return item?.name || node.id;
  }
  protected toggleComponentConstructs(comp: LegacyComp): void {
    const id = this.uid(comp);
    this.expandedComp.set(this.expandedComp() === id ? '' : id);
  }
  protected ungroupedConstructs(): LegacyConstruct[] {
    const groupedIds = new Set<string>();
    for (const comp of this.components()) {
      for (const construct of this.constructsFor(comp)) groupedIds.add(this.uid(construct));
    }
    return this.constructs().filter((construct) => !groupedIds.has(this.uid(construct)) && !this.constructComponentId(construct));
  }
  protected entitiesFor(construct: LegacyConstruct): LegacyEntity[] {
    if (this.uid(construct) === UNASSIGNED_CONSTRUCT_ID) return this.unclassifiedEntities();
    const cid = this.uid(construct);
    return this.entities().filter((e) => e.businessConstructUid === cid || (e.businessConstructUids || []).includes(cid));
  }
  protected taskDefsFor(construct: LegacyConstruct): LegacyTaskDef[] {
    if (this.uid(construct) === UNASSIGNED_CONSTRUCT_ID) return this.unclassifiedTaskDefs();
    const cid = this.uid(construct);
    return this.taskDefs().filter((t) => t.constructUid === cid);
  }
  protected treeComponentSummary(comp: LegacyComp): string {
    const constructs = this.constructsFor(comp);
    const entities = constructs.reduce((sum, construct) => sum + this.entitiesFor(construct).length, 0);
    const tasks = constructs.reduce((sum, construct) => sum + this.taskDefsFor(construct).length, 0);
    return `${constructs.length} 个构件 · ${entities} 个实体 · ${tasks} 个任务`;
  }
  protected selectedConstruct(): LegacyConstruct | null {
    const selectedId = this.selectedConstructId();
    return this.constructs().find((c) => this.uid(c) === selectedId) || this.constructs()[0] || null;
  }
  protected componentForConstruct(construct: LegacyConstruct | null): LegacyComp | null {
    if (!construct) return null;
    const compId = this.constructComponentId(construct);
    return this.components().find((c) => this.uid(c) === compId) || null;
  }
  protected selectedConstructComponentId(): string {
    const construct = this.selectedConstruct();
    return this.constructComponentId(construct || {});
  }
  protected constructsForSelectedConstructComponent(): LegacyConstruct[] {
    const compId = this.selectedConstructComponentId();
    if (!compId) return this.constructs();
    return this.constructs().filter((construct) => this.constructComponentId(construct) === compId);
  }
  protected selectConstructComponent(compId: string): void {
    const constructs = compId
      ? this.constructs().filter((construct) => this.constructComponentId(construct) === compId)
      : this.constructs();
    this.setSelectedConstruct(constructs[0] || null);
  }
  protected isSelectedConstruct(construct: LegacyConstruct): boolean {
    return this.uid(construct) === this.selectedConstructId();
  }
  protected openBusinessConstruct(construct: LegacyConstruct): void {
    if (this.canEdit()) {
      this.selectMindNode('construct', this.uid(construct));
      return;
    }
    if (this.uid(construct) === UNASSIGNED_CONSTRUCT_ID) return;
    this.setSelectedConstruct(construct);
    this.switchTab('businessConstruct');
  }
  protected openBusinessConstructById(constructId: string): void {
    const construct = this.constructs().find((c) => this.uid(c) === constructId);
    if (construct) this.openBusinessConstruct(construct);
  }
  protected returnToBusinessComponents(): void {
    this.switchTab('businessComponent');
  }
  protected openTaskDefinitionsForConstruct(construct: LegacyConstruct): void {
    const constructId = this.uid(construct);
    this.setSelectedConstruct(construct);
    this.taskDefCompId.set(String(construct.businessComponentUid || '').trim());
    this.taskDefConstructId.set(constructId);
    this.taskDefPage.set(1);
    this.switchTab('taskDef');
  }
  protected openEntitiesForConstruct(construct: LegacyConstruct): void {
    this.setSelectedConstruct(construct);
    this.switchTab('entity');
  }
  protected openEntityFromTree(entity: LegacyEntity, construct: LegacyConstruct): void {
    this.setSelectedConstruct(construct);
    this.runtime.ui['componentWorkbenchReturnTab'] = 'businessComponent';
    this.runtime.ui['entityId'] = this.uid(entity);
    this.runtime.ui['entityView'] = this.runtime.ui['entityView'] || 'relation';
    this.switchTab('entity');
  }
  protected openTaskFromTree(task: LegacyTaskDef, construct: LegacyConstruct): void {
    this.openTaskDefinitionsForConstruct(construct);
    this.taskDefKeyword.set(task.name || this.uid(task));
  }
  protected updateConstructInline(construct: LegacyConstruct, key: 'name' | 'note' | 'businessComponentUid', value: string): void {
    if (!this.canEdit()) return;
    if (key === 'businessComponentUid') {
      const comp = this.components().find((item) => this.uid(item) === value) || null;
      if (comp) this.attachConstructToComponent(construct, comp);
      else this.detachConstructFromComponent(construct);
      return;
    }
    construct[key] = value;
    this.touch();
  }
  protected addComponentInline(kind: 'core' | 'generic' = 'core'): void {
    if (!this.canEdit()) return;
    const doc = this.doc();
    doc.businessComponents ||= [];
    const component: LegacyComp = {
      uid: 'COMP' + Date.now(),
      name: this.uniqueComponentName('新业务组件'),
      kind,
      note: '',
      constructUids: [],
    };
    doc.businessComponents.push(component);
    this.expandedComp.set(this.uid(component));
    this.focusMindNode('component', this.uid(component), true);
    this.touch();
  }
  protected updateComponentInline(comp: LegacyComp, key: 'name' | 'kind' | 'note', value: string): void {
    if (!this.canEdit()) return;
    if (key === 'kind') comp.kind = value === 'generic' ? 'generic' : 'core';
    else comp[key] = value;
    if (key === 'name') {
      for (const construct of this.constructsFor(comp)) construct.businessComponent = value;
      for (const taskDef of this.taskDefs()) {
        if (taskDef.businessComponentUid === this.uid(comp)) taskDef.businessComponentUid = this.uid(comp);
      }
    }
    this.touch();
  }
  protected attachConstructToComponent(construct: LegacyConstruct, comp: LegacyComp): void {
    if (!this.canEdit()) return;
    this.detachConstructFromComponents(construct);
    const constructId = this.uid(construct);
    construct.businessComponentUid = this.uid(comp);
    construct.businessComponentId = this.uid(comp);
    construct.businessComponent = comp.name || '';
    comp.constructUids = [...new Set([...(comp.constructUids || []), constructId])];
    this.setSelectedConstruct(construct);
    this.expandedComp.set(this.uid(comp));
    this.touch();
  }
  protected detachConstructFromComponent(construct: LegacyConstruct): void {
    if (!this.canEdit()) return;
    this.detachConstructFromComponents(construct);
    construct.businessComponentUid = '';
    construct.businessComponentId = '';
    construct.businessComponent = '';
    this.touch();
  }
  protected fieldCount(entity: LegacyEntity): number {
    return (entity.fields || []).length;
  }
  protected taskNodeCount(taskDef: LegacyTaskDef): number {
    return this.taskNodes(taskDef).length;
  }
  protected unclassifiedEntities(): LegacyEntity[] {
    const used = new Set(this.entities().filter((e) => e.businessConstructUid || (e.businessConstructUids || [])[0]).map((e) => e.uid || e.id));
    return this.entities().filter((e) => !used.has(e.uid || e.id));
  }
  protected unclassifiedTaskDefs(): LegacyTaskDef[] {
    const used = new Set(this.taskDefs().filter((t) => t.constructUid).map((t) => t.uid || t.id));
    return this.taskDefs().filter((t) => !used.has(t.uid || t.id));
  }
  protected addEntityTo(entity: LegacyEntity, construct: LegacyConstruct): void { if (!this.canEdit()) return; entity.businessConstructUid = this.uid(construct); entity.businessConstructUids = [this.uid(construct)]; this.touch(); }
  protected removeEntity(entity: LegacyEntity): void { if (!this.canEdit()) return; entity.businessConstructUid = ''; entity.businessConstructId = ''; entity.businessConstructUids = []; entity.constructUid = ''; entity.constructId = ''; this.touch(); }
  protected addTaskDefTo(td: LegacyTaskDef, construct: LegacyConstruct): void { if (!this.canEdit()) return; td.constructUid = this.uid(construct); this.touch(); }
  protected removeTaskDef(td: LegacyTaskDef): void { if (!this.canEdit()) return; td.constructUid = ''; this.touch(); }
  protected createEntityForConstruct(construct: LegacyConstruct): LegacyEntity | null {
    if (!this.canEdit()) return null;
    const doc = this.doc();
    doc.entities ||= [];
    const id = 'ENT' + Date.now();
    const entity: LegacyEntity = {
      uid: id,
      id,
      name: this.uniqueEntityName('新实体'),
      fields: [],
      businessConstructUid: this.uid(construct),
      businessConstructUids: [this.uid(construct)],
    };
    doc.entities.push(entity);
    this.touch();
    return entity;
  }
  protected createTaskForConstruct(construct: LegacyConstruct): LegacyTaskDef | null {
    if (!this.canEdit()) return null;
    const doc = this.doc();
    doc.taskDefinitions ||= [];
    const id = 'TASK' + Date.now();
    const task: LegacyTaskDef = {
      uid: id,
      id,
      name: this.uniqueTaskName('新任务'),
      type: 'Query',
      constructUid: this.uid(construct),
      businessComponentUid: this.constructComponentId(construct),
      parameters: { inputs: [], outputs: [] },
    };
    doc.taskDefinitions.push(task);
    this.touch();
    return task;
  }
  protected createConstructForComponent(comp: LegacyComp | null): void {
    if (!this.canEdit()) return;
    const doc = this.doc();
    doc.businessConstructs ||= [];
    const id = 'CSTR' + Date.now();
    const construct: LegacyConstruct = {
      uid: id,
      id,
      name: this.uniqueConstructName('新构件'),
      note: '',
      businessComponentUid: comp ? this.uid(comp) : '',
      businessComponentId: comp ? this.uid(comp) : '',
      businessComponent: comp?.name || '',
    };
    doc.businessConstructs.push(construct);
    if (comp) comp.constructUids = [...new Set([...(comp.constructUids || []), id])];
    this.setSelectedConstruct(construct);
    this.switchTab('businessConstruct');
    this.touch();
  }
  protected createTreeConstructForComponent(comp: LegacyComp): void {
    if (!this.canEdit()) return;
    const doc = this.doc();
    doc.businessConstructs ||= [];
    const id = 'CSTR' + Date.now();
    const construct: LegacyConstruct = {
      uid: id,
      id,
      name: this.uniqueConstructName('新构件'),
      note: '',
      businessComponentUid: this.uid(comp),
      businessComponentId: this.uid(comp),
      businessComponent: comp.name || '',
    };
    doc.businessConstructs.push(construct);
    comp.constructUids = [...new Set([...(comp.constructUids || []), id])];
    this.expandedTreeComponentId.set(this.uid(comp));
    this.expandedTreeConstructId.set(id);
    this.setSelectedConstruct(construct);
    this.touch();
  }
  protected moveConstructToComponent(construct: LegacyConstruct, componentId: string): void {
    if (!this.canEdit()) return;
    const comp = this.components().find((item) => this.uid(item) === componentId) || null;
    if (comp) {
      this.attachConstructToComponent(construct, comp);
      this.expandedTreeComponentId.set(this.uid(comp));
      this.expandedTreeConstructId.set(this.uid(construct));
    }
  }
  protected moveEntityToConstruct(entity: LegacyEntity, constructId: string): void {
    if (!this.canEdit()) return;
    const construct = this.constructs().find((item) => this.uid(item) === constructId);
    if (!construct) return;
    entity.businessConstructUid = constructId;
    entity.businessConstructId = constructId;
    entity.businessConstructUids = [constructId];
    entity.constructUid = constructId;
    entity.constructId = constructId;
    this.expandedTreeConstructId.set(constructId);
    this.touch();
  }
  protected moveTaskToConstruct(task: LegacyTaskDef, constructId: string): void {
    if (!this.canEdit()) return;
    const construct = this.constructs().find((item) => this.uid(item) === constructId);
    if (!construct) return;
    task.constructUid = constructId;
    task.businessComponentUid = this.constructComponentId(construct);
    this.expandedTreeConstructId.set(constructId);
    this.touch();
  }
  protected createConstructForSelectedComponent(): void {
    const comp = this.components().find((item) => this.uid(item) === this.selectedConstructComponentId()) || null;
    this.createConstructForComponent(comp);
  }

  // ─── 组件编辑抽屉 ──────────────────────────────
  protected openCompDrawer(comp?: LegacyComp): void {
    if (!this.canEdit()) return;
    this.compDrawer.set(comp ? { ...comp } : { uid: '', name: '', kind: 'core', note: '' });
  }
  protected saveComp(): void {
    if (!this.canEdit()) return;
    const d = this.compDrawer(); if (!d || !d.name?.trim()) return;
    const doc = this.doc();
    if (!d.uid) { d.uid = 'COMP' + Date.now(); doc.businessComponents ||= []; doc.businessComponents.push(d); }
    else { const ex = (doc.businessComponents || []).find((c: any) => (c.uid || c.id) === d.uid); if (ex) Object.assign(ex, d); }
    this.compDrawer.set(null); this.touch();
  }
  protected async deleteComp(comp: LegacyComp): Promise<void> {
    if (!this.canEdit()) return;
    const confirmed = await confirmRuntimeAction(`确认删除业务组件“${comp.name || this.uid(comp)}”吗？组件下的构件会移入未分组。`, {
      title: '删除业务组件',
      confirmLabel: '删除',
    });
    if (!confirmed) return;
    for (const construct of this.constructsFor(comp)) {
      construct.businessComponentUid = '';
      construct.businessComponentId = '';
      construct.businessComponent = '';
    }
    this.doc().businessComponents = this.components().filter((c) => (c.uid || c.id) !== (comp.uid || comp.id));
    this.compDrawer.set(null); this.touch();
  }
  // 抽屉内部操作：类型转换由方法内部处理
  protected saveDrawerComp(): void { this.saveComp(); }
  protected deleteDrawerComp(): void { const d = this.compDrawer(); if (d) this.deleteComp(d as LegacyComp); }

  // ─── 构件编辑抽屉 ──────────────────────────────
  protected openConstructDrawer(construct?: LegacyConstruct, compId?: string): void {
    if (!this.canEdit()) return;
    this.constructDrawer.set(construct ? { ...construct } : { uid: '', name: '', businessComponentUid: compId || '' });
  }
  protected saveConstruct(): void {
    if (!this.canEdit()) return;
    const d = this.constructDrawer(); if (!d || !d.name?.trim()) return;
    const doc = this.doc();
    if (!d.uid) { d.uid = 'CSTR' + Date.now(); doc.businessConstructs ||= []; doc.businessConstructs.push(d); }
    else { const ex = (doc.businessConstructs || []).find((c: any) => (c.uid || c.id) === d.uid); if (ex) Object.assign(ex, d); }
    if (d.businessComponentUid) {
      const comp = this.components().find((item) => this.uid(item) === d.businessComponentUid);
      if (comp) this.attachConstructToComponent(d as LegacyConstruct, comp);
    }
    this.setSelectedConstruct(d as LegacyConstruct);
    this.constructDrawer.set(null); this.touch();
  }
  protected deleteConstruct(construct: LegacyConstruct): void {
    if (!this.canEdit()) return;
    this.doc().businessConstructs = this.constructs().filter((c) => (c.uid || c.id) !== (construct.uid || construct.id));
    if (this.selectedConstructId() === this.uid(construct)) this.setSelectedConstruct(this.constructs()[0] || null);
    this.constructDrawer.set(null); this.touch();
  }
  protected saveDrawerConstruct(): void { this.saveConstruct(); }
  protected deleteDrawerConstruct(): void { const d = this.constructDrawer(); if (d) this.deleteConstruct(d as LegacyConstruct); }
  protected drawerConstruct(): LegacyConstruct { return this.constructDrawer() as LegacyConstruct; }
  // 抽屉内关联操作
  protected addEntityToDrawerConstruct(entityId: string): void {
    if (!this.canEdit()) return;
    const e = this.unclassifiedEntities().find((x) => this.uid(x) === entityId);
    const c = this.constructDrawer();
    if (e && c) { e.businessConstructUid = this.uid(c as any); e.businessConstructUids = [this.uid(c as any)]; this.touch(); }
  }
  protected addTaskDefToDrawerConstruct(taskDefId: string): void {
    if (!this.canEdit()) return;
    const t = this.unclassifiedTaskDefs().find((x) => this.uid(x) === taskDefId);
    const c = this.constructDrawer();
    if (t && c) { t.constructUid = this.uid(c as any); this.touch(); }
  }

  // ─── Tab 2: 任务定义 ──────────────────────────────
  protected readonly taskDefCompId = signal('');
  protected readonly taskDefConstructId = signal('');
  protected readonly taskDefPage = signal(1);
  readonly taskDefPageSize = 15;

  // 按已选组件筛选的构件列表（联动）
  protected filteredConstructsForTaskDef(): LegacyConstruct[] {
    const cid = this.taskDefCompId();
    if (!cid) return this.constructs();
    return this.constructs().filter((c) => this.constructComponentId(c) === cid);
  }

  protected selectTaskDefComp(compId: string): void {
    this.taskDefCompId.set(compId);
    this.taskDefConstructId.set('');
    this.taskDefPage.set(1);
  }
  protected pagedTaskDefs(): LegacyTaskDef[] {
    const list = this.filteredTaskDefs();
    const start = (this.taskDefPage() - 1) * this.taskDefPageSize;
    return list.slice(start, start + this.taskDefPageSize);
  }
  protected taskDefTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTaskDefs().length / this.taskDefPageSize));
  }

  protected taskDefConstructGroups(): Array<{ id: string; constructName: string; componentName: string; tasks: LegacyTaskDef[] }> {
    const groups = new Map<string, { id: string; constructName: string; componentName: string; tasks: LegacyTaskDef[] }>();
    for (const task of this.filteredTaskDefs()) {
      const constructId = this.tdConstructId(task);
      const construct = this.constructs().find((item) => this.uid(item) === constructId) || null;
      const groupId = construct ? this.uid(construct) : 'unclassified';
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          constructName: construct?.name || '未归类任务',
          componentName: construct ? this.componentName(this.constructComponentId(construct)) : '未归属组件',
          tasks: [],
        });
      }
      groups.get(groupId)!.tasks.push(task);
    }
    return Array.from(groups.values());
  }

  protected tdConstructId(td: LegacyTaskDef): string {
    return String(td.constructUid || '').trim();
  }

  protected taskDefEditComponentId(td: LegacyTaskDef): string {
    const explicit = String(td.businessComponentUid || '').trim();
    if (explicit) return explicit;
    const construct = this.constructs().find((item) => this.uid(item) === this.tdConstructId(td));
    return construct ? this.constructComponentId(construct) : '';
  }

  protected constructsForTaskEdit(td: LegacyTaskDef): LegacyConstruct[] {
    const componentId = this.taskDefEditComponentId(td);
    if (!componentId) return this.constructs();
    return this.constructs().filter((construct) => this.constructComponentId(construct) === componentId);
  }

  protected selectTaskDefEditComponent(td: LegacyTaskDef, componentId: string): void {
    if (!this.canEdit()) return;
    td.businessComponentUid = componentId;
    if (td.constructUid && !this.constructsForTaskEdit(td).some((construct) => this.uid(construct) === td.constructUid)) {
      td.constructUid = '';
    }
    this.touch();
  }

  protected selectTaskDefEditConstruct(td: LegacyTaskDef, constructId: string): void {
    if (!this.canEdit()) return;
    td.constructUid = constructId;
    const construct = this.constructs().find((item) => this.uid(item) === constructId);
    td.businessComponentUid = construct ? this.constructComponentId(construct) : this.taskDefEditComponentId(td);
    this.touch();
  }

  protected filteredTaskDefs(): LegacyTaskDef[] {
    const compId = this.taskDefCompId();
    const constructId = this.taskDefConstructId();
    const kw = this.taskDefKeyword().toLowerCase();
    let list = this.taskDefs();
    if (constructId) {
      list = list.filter((t) => this.tdConstructId(t) === constructId);
    } else if (compId) {
      const comp = this.components().find((c) => this.uid(c) === compId);
      if (comp) {
        const cids = new Set(this.constructsFor(comp).map((c) => this.uid(c)));
        list = list.filter((t) => cids.has(this.tdConstructId(t)));
      }
    }
    if (kw) list = list.filter((t) => [t.name, t.target, t.address].join(' ').toLowerCase().includes(kw));
    return list;
  }
  protected taskNodes(td: LegacyTaskDef): Array<{ uid: string; name: string; pname: string }> {
    const nodes: Array<{ uid: string; name: string; pname: string }> = [];
    for (const p of this.doc().processes || []) for (const n of p.nodes || p.tasks || []) if (n.taskDefinitionUid === (td.uid || td.id)) nodes.push({ uid: n.uid || n.id, name: n.name || '节点', pname: p.name || '' });
    return nodes;
  }
  protected editingTaskId = signal('');
  protected expandedTaskIds = signal(new Set<string>());
  protected toggleTaskExpand(id: string): void {
    this.expandedTaskIds.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  protected isTaskExpanded(id: string): boolean { return this.expandedTaskIds().has(id); }
  protected startEditInline(td?: LegacyTaskDef): void {
    if (!this.canEdit()) return;
    if (td) { this.editingTaskId.set(this.uid(td)); return; }
    // 新建
    const selectedConstructId = this.taskDefConstructId();
    const selectedConstruct = this.constructs().find((construct) => this.uid(construct) === selectedConstructId);
    const base: LegacyTaskDef = {
      uid: '',
      name: '',
      type: 'Query',
      querySourceKind: '',
      target: '',
      address: '',
      note: '',
      constructUid: selectedConstructId,
      businessComponentUid: selectedConstruct ? this.constructComponentId(selectedConstruct) : this.taskDefCompId(),
      parameters: { inputs: [], outputs: [] },
    };
    this.doc().taskDefinitions ||= [];
    this.doc().taskDefinitions.push(base);
    this.editingTaskId.set('');
    this.touch();
  }
  protected saveInlineEdit(td: LegacyTaskDef): void {
    if (!this.canEdit()) return;
    td.parameters ||= { inputs: [], outputs: [] };
    this.editingTaskId.set('');
    this.touch();
  }
  protected cancelInlineEdit(td: LegacyTaskDef): void {
    if (!this.canEdit()) return;
    if (!td.uid) {
      this.doc().taskDefinitions = this.taskDefs().filter((t) => t !== td);
    }
    this.editingTaskId.set('');
    this.touch();
  }
  protected async deleteTaskDef(td: LegacyTaskDef): Promise<void> {
    if (!this.canEdit()) return;
    const confirmed = await confirmRuntimeAction(`确认删除“${td.name || this.uid(td)}”吗？`, {
      title: '删除任务定义',
      confirmLabel: '删除',
    });
    if (!confirmed) return;
    this.doc().taskDefinitions = this.taskDefs().filter((t) => (t.uid || t.id) !== (td.uid || td.id));
    this.touch();
  }
  protected addParam(arr: TaskParam[]): void { if (!this.canEdit()) return; arr.push({ name: '', type: 'String', required: false, note: '' }); }
  protected removeParam(arr: TaskParam[], idx: number): void { if (!this.canEdit()) return; arr.splice(idx, 1); }
  protected isEditingTask(td: LegacyTaskDef): boolean { return this.editingTaskId() === this.uid(td) || (!td.uid && this.editingTaskId() === ''); }

  // ─── Utils ────────────────────────────────────────
  protected uid(item: any): string { return String(item?.uid || item?.id || item?.name || '').trim(); }
  protected constructName(constructId: string): string { const c = this.constructs().find((x) => this.uid(x) === constructId); return c?.name || constructId || '未归类'; }
  protected componentName(componentId: string): string {
    const comp = this.components().find((item) => this.uid(item) === componentId);
    return comp?.name || componentId || '未归属组件';
  }
  protected componentKind(comp: LegacyComp): 'core' | 'generic' {
    return comp.kind === 'generic' || comp.kind === 'common' ? 'generic' : 'core';
  }
  protected constructComponentId(construct: LegacyConstruct): string {
    return String(construct.businessComponentUid || construct.businessComponentId || '').trim();
  }
  private detachConstructFromComponents(construct: LegacyConstruct): void {
    const constructId = this.uid(construct);
    for (const comp of this.components()) {
      comp.constructUids = (comp.constructUids || []).filter((id) => id !== constructId);
    }
  }
  private uniqueComponentName(baseName: string): string {
    const names = new Set(this.components().map((comp) => String(comp.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }
  private uniqueConstructName(baseName: string): string {
    const names = new Set(this.constructs().map((construct) => String(construct.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }
  private uniqueEntityName(baseName: string): string {
    const names = new Set(this.entities().map((entity) => String(entity.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }
  private uniqueTaskName(baseName: string): string {
    const names = new Set(this.taskDefs().map((task) => String(task.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }
  protected switchTab(t: ComponentTab): void {
    if (t === 'businessConstruct' && !this.selectedConstructId()) this.setSelectedConstruct(this.constructs()[0] || null);
    this.runtime.ui['componentWorkbenchTab'] = t;
    this.activeTab.set(t);
  }
  protected toggleExp(id: string): void { this.expandedComp.set(this.expandedComp() === id ? '' : id); }
  protected isExp(id: string): boolean { return this.expandedComp() === id; }
  // ─── 抽屉宽度拖拽 ──────────────────────────
  protected readonly drawerWidth = signal(400);
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  protected startDrawerResize(event: MouseEvent): void {
    event.preventDefault();
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.drawerWidth();
    const onMove = (e: MouseEvent) => {
      const dx = this.resizeStartX - e.clientX;
      this.drawerWidth.set(Math.max(280, Math.min(900, this.resizeStartWidth + dx)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  protected touch(): void { markAngularRuntimeModified(); this.version.update((v) => v + 1); }

  private setSelectedConstruct(construct: LegacyConstruct | null): void {
    const id = construct ? this.uid(construct) : '';
    this.selectedConstructId.set(id);
    this.runtime.ui['componentWorkbenchConstructId'] = id;
  }

  private restoreActiveTab(): ComponentTab {
    const saved = String(this.runtime.ui['componentWorkbenchTab'] || '').trim();
    if (saved === 'component' || saved === 'service' || saved === 'orchestration') return 'businessComponent';
    if (saved === 'businessConstructNew') return 'businessComponent';
    return ['businessComponent', 'businessConstruct', 'taskDef', 'entity'].includes(saved)
      ? saved as ComponentTab
      : 'businessComponent';
  }
}
