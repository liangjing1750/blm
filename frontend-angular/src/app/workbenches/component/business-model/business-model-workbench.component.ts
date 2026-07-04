import { CommonModule } from '@angular/common';
import { Component, computed, signal, OnInit, OnDestroy } from '@angular/core';
import {
  BusinessModelAdapter,
  BusinessModelComponent,
  BusinessModelConstruct,
  BusinessModelEntity,
  BusinessModelTask,
  createBusinessModelLegacyAdapter,
} from './business-model-legacy-adapter';
import { confirmRuntimeAction, getAngularRuntimeState } from '../../../core/runtime/angular-runtime';

type BusinessModelMode = 'component' | 'construct';

interface BusinessModelStats {
  componentCount: number;
  constructCount: number;
  taskCount: number;
  entityCount: number;
}

@Component({
  selector: 'app-business-model-workbench',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './business-model-workbench.component.html',
  styleUrl: './business-model-workbench.component.scss',
})
export class BusinessModelWorkbenchComponent implements OnInit, OnDestroy {

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
  // 模块意图：业务组件与构件是构件工作台的聚合入口，负责组件、构件、实体、任务之间的归属关系维护。
  protected readonly version = signal(0);
  protected readonly mode = signal<BusinessModelMode>('component');
  protected readonly selectedComponentId = signal('');
  protected readonly selectedConstructId = signal('');
  private readonly adapter: BusinessModelAdapter = createBusinessModelLegacyAdapter();

  protected readonly components = computed(() => {
    this.version();
    return this.adapter.components();
  });
  protected readonly constructs = computed(() => {
    this.version();
    return this.adapter.constructs();
  });
  protected readonly entities = computed(() => {
    this.version();
    return this.adapter.entities();
  });
  protected readonly tasks = computed(() => {
    this.version();
    return this.adapter.tasks();
  });
  protected readonly stats = computed<BusinessModelStats>(() => ({
    componentCount: this.components().length,
    constructCount: this.constructs().length,
    taskCount: this.tasks().length,
    entityCount: this.entities().length,
  }));
  protected readonly selectedComponent = computed(() => this.components().find((item) => this.componentId(item) === this.selectedComponentId()) || this.components()[0] || null);
  protected readonly selectedConstruct = computed(() => this.constructs().find((item) => this.constructId(item) === this.selectedConstructId()) || this.constructsForSelectedComponent()[0] || null);
  protected readonly coreComponents = computed(() => this.components().filter((item) => this.componentKind(item) === 'core'));
  protected readonly genericComponents = computed(() => this.components().filter((item) => this.componentKind(item) !== 'core'));
  protected readonly constructsForSelectedComponent = computed(() => {
    const component = this.selectedComponent();
    if (!component) return [];
    return this.constructs().filter((construct) => this.constructBelongsToComponent(construct, component));
  });
  protected readonly ungroupedConstructs = computed(() => this.constructs().filter((construct) => !this.constructComponentRef(construct)));

  constructor() {
    const initialComponentId = String(getAngularRuntimeState().ui['businessModelComponentId'] || '').trim();
    if (initialComponentId) this.selectedComponentId.set(initialComponentId);
  }

  protected setMode(mode: BusinessModelMode): void {
    this.mode.set(mode);
  }

  protected componentId(component: BusinessModelComponent | null | undefined): string {
    return String(component?.uid || component?.id || component?.name || '').trim();
  }

  protected constructId(construct: BusinessModelConstruct | null | undefined): string {
    return String(construct?.uid || construct?.id || construct?.name || '').trim();
  }

  protected taskId(task: BusinessModelTask | null | undefined): string {
    return String(task?.uid || task?.id || task?.name || '').trim();
  }

  protected entityId(entity: BusinessModelEntity | null | undefined): string {
    return String(entity?.uid || entity?.id || entity?.name || '').trim();
  }

  protected componentKind(component: BusinessModelComponent): string {
    return component.kind === 'generic' || component.kind === 'common' ? 'generic' : 'core';
  }

  protected selectComponent(component: BusinessModelComponent): void {
    this.selectedComponentId.set(this.componentId(component));
    this.selectedConstructId.set('');
    this.mode.set('component');
  }

  protected selectConstruct(construct: BusinessModelConstruct): void {
    this.selectedConstructId.set(this.constructId(construct));
    this.mode.set('construct');
  }

  protected addComponent(kind: 'core' | 'generic' = 'core'): void {
    const components = this.adapter.components();
    const id = this.adapter.nextId('BCP', components);
    const component: BusinessModelComponent = {
      uid: id,
      id,
      name: this.uniqueName('新业务组件', components),
      kind,
      note: '',
      constructUids: [],
      entityUids: [],
      taskDefinitionUids: [],
    };
    components.push(component);
    this.selectedComponentId.set(id);
    this.mode.set('component');
    this.changed();
  }

  protected addConstruct(component: BusinessModelComponent | null = this.selectedComponent()): void {
    const constructs = this.adapter.constructs();
    const id = this.adapter.nextId('BC', constructs);
    const construct: BusinessModelConstruct = {
      uid: id,
      id,
      name: this.uniqueName('新业务构件', constructs),
      note: '',
      businessComponentUid: this.componentId(component),
      businessComponent: component?.name || '',
      entityUids: [],
      taskDefinitionUids: [],
    };
    constructs.push(construct);
    if (component) component.constructUids = [...new Set([...(component.constructUids || []), id])];
    this.selectedComponentId.set(this.componentId(component));
    this.selectedConstructId.set(id);
    this.mode.set('construct');
    this.changed();
  }

  protected updateComponent(component: BusinessModelComponent, key: 'name' | 'kind' | 'note', value: string): void {
    if (key === 'kind') component.kind = value === 'generic' ? 'generic' : 'core';
    else component[key] = value;
    if (key === 'name') {
      for (const construct of this.constructs()) {
        if (this.constructBelongsToComponent(construct, component)) construct.businessComponent = value;
      }
      for (const task of this.tasks()) {
        if (task.businessComponentUid === this.componentId(component) || task.businessComponentId === this.componentId(component)) task.businessComponent = value;
      }
    }
    this.changed();
  }

  protected updateConstruct(construct: BusinessModelConstruct, key: 'name' | 'note' | 'businessComponentUid', value: string): void {
    if (key === 'businessComponentUid') {
      this.detachConstructFromComponents(construct);
      const nextComponent = this.components().find((component) => this.componentId(component) === value) || null;
      construct.businessComponentUid = this.componentId(nextComponent);
      construct.businessComponentId = this.componentId(nextComponent);
      construct.businessComponent = nextComponent?.name || '';
      if (nextComponent) nextComponent.constructUids = [...new Set([...(nextComponent.constructUids || []), this.constructId(construct)])];
    } else {
      construct[key] = value;
    }
    this.changed();
  }

  protected async deleteComponent(component: BusinessModelComponent): Promise<void> {
    if (this.constructs().some((construct) => this.constructBelongsToComponent(construct, component))) {
      await confirmRuntimeAction('当前业务组件下还有业务构件，请先调整或删除构件。', {
        title: '无法删除组件',
        confirmLabel: '知道了',
        cancelLabel: '关闭',
      });
      return;
    }
    const components = this.adapter.components();
    components.splice(components.indexOf(component), 1);
    this.selectedComponentId.set(this.componentId(components[0]) || '');
    this.changed();
  }

  protected deleteConstruct(construct: BusinessModelConstruct): void {
    this.detachConstructFromComponents(construct);
    for (const entity of this.entities()) {
      if (this.entityConstructRef(entity) === this.constructId(construct)) {
        entity.businessConstructUid = '';
        entity.businessConstructId = '';
        entity.constructUid = '';
        entity.constructId = '';
      }
    }
    for (const task of this.tasks()) {
      if (this.taskConstructRef(task) === this.constructId(construct)) {
        task.constructUid = '';
        task.constructId = '';
        task.businessConstructUid = '';
        task.businessConstructId = '';
        task.constructName = '';
      }
    }
    const constructs = this.adapter.constructs();
    constructs.splice(constructs.indexOf(construct), 1);
    this.selectedConstructId.set(this.constructId(this.constructsForSelectedComponent()[0]) || '');
    this.changed();
  }

  protected attachConstructToSelected(construct: BusinessModelConstruct): void {
    const component = this.selectedComponent();
    if (!component) return;
    this.updateConstruct(construct, 'businessComponentUid', this.componentId(component));
    this.selectedConstructId.set(this.constructId(construct));
    this.mode.set('construct');
  }

  protected detachConstruct(construct: BusinessModelConstruct): void {
    this.updateConstruct(construct, 'businessComponentUid', '');
  }

  protected entitiesForConstruct(construct: BusinessModelConstruct | null): BusinessModelEntity[] {
    if (!construct) return [];
    const constructId = this.constructId(construct);
    return this.entities().filter((entity) => this.entityConstructRef(entity) === constructId || (construct.entityUids || []).includes(this.entityId(entity)));
  }

  protected tasksForConstruct(construct: BusinessModelConstruct | null): BusinessModelTask[] {
    if (!construct) return [];
    const constructId = this.constructId(construct);
    return this.tasks().filter((task) => this.taskConstructRef(task) === constructId || (construct.taskDefinitionUids || []).includes(this.taskId(task)));
  }

  protected constructCount(component: BusinessModelComponent): number {
    return this.constructs().filter((construct) => this.constructBelongsToComponent(construct, component)).length;
  }

  protected taskCount(component: BusinessModelComponent): number {
    const componentId = this.componentId(component);
    const constructIds = new Set(this.constructs().filter((construct) => this.constructBelongsToComponent(construct, component)).map((construct) => this.constructId(construct)));
    return this.tasks().filter((task) => task.businessComponentUid === componentId || task.businessComponentId === componentId || constructIds.has(this.taskConstructRef(task))).length;
  }

  protected entityCount(component: BusinessModelComponent): number {
    const constructIds = new Set(this.constructs().filter((construct) => this.constructBelongsToComponent(construct, component)).map((construct) => this.constructId(construct)));
    return this.entities().filter((entity) => constructIds.has(this.entityConstructRef(entity))).length;
  }

  private constructBelongsToComponent(construct: BusinessModelConstruct, component: BusinessModelComponent): boolean {
    const componentId = this.componentId(component);
    return this.constructComponentRef(construct) === componentId || (component.constructUids || []).includes(this.constructId(construct));
  }

  private constructComponentRef(construct: BusinessModelConstruct): string {
    return String(construct.businessComponentUid || construct.businessComponentId || '').trim();
  }

  private entityConstructRef(entity: BusinessModelEntity): string {
    return String(entity.businessConstructUid || entity.businessConstructId || entity.constructUid || entity.constructId || '').trim();
  }

  private taskConstructRef(task: BusinessModelTask): string {
    return String(task.constructUid || task.constructId || task.businessConstructUid || task.businessConstructId || '').trim();
  }

  private detachConstructFromComponents(construct: BusinessModelConstruct): void {
    const constructId = this.constructId(construct);
    for (const component of this.components()) {
      component.constructUids = (component.constructUids || []).filter((id) => id !== constructId);
    }
  }

  private uniqueName(baseName: string, items: Array<{ name?: string }>): string {
    const names = new Set(items.map((item) => String(item.name || '').trim()).filter(Boolean));
    if (!names.has(baseName)) return baseName;
    let index = 2;
    while (names.has(`${baseName}${index}`)) index += 1;
    return `${baseName}${index}`;
  }

  private changed(): void {
    this.adapter.markChanged();
    this.version.update((value) => value + 1);
  }
}
