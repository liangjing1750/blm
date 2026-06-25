import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { BusinessModelWorkbenchComponent } from '../business-model/business-model-workbench.component';
import { EntityDesignWorkbenchComponent } from '../entity-design/entity-design-workbench.component';
import { getAngularRuntimeState } from '../../../core/runtime/angular-runtime';

type ComponentWorkbenchTab = 'businessComponents' | 'contracts' | 'orchestration' | 'tasks' | 'entities';

interface ComponentShellTask {
  id?: string;
  name?: string;
  type?: string;
  target?: string;
  address?: string;
  constructName?: string;
  constructUid?: string;
}

interface ComponentShellState {
  S?: {
    ui?: { componentTab?: ComponentWorkbenchTab };
    doc?: { taskDefinitions?: ComponentShellTask[] };
  };
}

interface ComponentTabItem {
  id: ComponentWorkbenchTab;
  label: string;
}

@Component({
  selector: 'app-component-workbench-shell',
  standalone: true,
  imports: [CommonModule, BusinessModelWorkbenchComponent, EntityDesignWorkbenchComponent],
  templateUrl: './component-workbench-shell.component.html',
  styleUrl: './component-workbench-shell.component.scss',
})
export class ComponentWorkbenchShellComponent implements OnInit, OnDestroy {

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
  // 模块意图：构件工作台外壳负责二级 tab 与承接页布局，具体业务组件和实体设计交给子工作台。
  // 关键流程：legacy 主导航仍调用 ComponentWorkbench.render，这里通过全局状态保持当前 tab 并由 Angular 渲染。
  // 边界细节：本组件不调用旧 component-legacy/entity-legacy 渲染函数，避免新工作台继续被旧 HTML 拼接牵制。
  protected readonly version = signal(0);
  protected readonly tabs: ComponentTabItem[] = [
    { id: 'businessComponents', label: '业务组件与构件' },
    { id: 'contracts', label: '交互契约' },
    { id: 'orchestration', label: '任务编排' },
    { id: 'tasks', label: '任务定义' },
    { id: 'entities', label: '实体设计' },
  ];
  protected readonly activeTab = computed<ComponentWorkbenchTab>(() => {
    this.version();
    const tab = this.state().S?.ui?.componentTab;
    return this.tabs.some((item) => item.id === tab) ? tab as ComponentWorkbenchTab : 'businessComponents';
  });
  protected readonly tasks = computed(() => {
    this.version();
    return this.state().S?.doc?.taskDefinitions || [];
  });

  constructor(private readonly changeDetectorRef: ChangeDetectorRef) {}

  protected switchTab(tabId: ComponentWorkbenchTab): void {
    this.state().S ||= {};
    this.state().S!.ui ||= {};
    this.state().S!.ui!.componentTab = tabId;
    this.version.update((value) => value + 1);
  }

  protected taskRows(): string[][] {
    return this.tasks().slice(0, 8).map((task) => [
      task.name || task.id || '未命名任务',
      task.type || '-',
      task.target || task.address || '-',
      task.constructName || task.constructUid || '-',
    ]);
  }

  @HostListener('window:blm-component-workbench-refresh')
  protected refreshFromLegacy(): void {
    this.version.update((value) => value + 1);
    this.changeDetectorRef.detectChanges();
  }

  private state(): ComponentShellState {
    const runtime = getAngularRuntimeState();
    return { S: { ui: runtime.ui, doc: runtime.doc } };
  }
}
