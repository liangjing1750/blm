import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, HostListener, Inject, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SidebarAdapter,
  SidebarComponentGroup,
  SidebarProcessSummary,
  SidebarStageGroup,
  SidebarValueStreamGroup,
  createSidebarLegacyAdapter,
} from './sidebar-legacy-adapter';

@Component({
  selector: 'app-sidebar-directory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sidebar-directory.component.html',
  styleUrl: './sidebar-directory.component.scss',
})
export class SidebarDirectoryComponent implements OnInit {
  // 模块意图：目录区是壳层的导航聚合根，负责把流程目录和组件目录统一呈现。
  // 它只读取旧文档模型并调用公开导航入口，不再拼接旧 HTML 字符串。
  private readonly adapter: SidebarAdapter = createSidebarLegacyAdapter();
  protected readonly version = signal(0);
  protected readonly resizing = signal(false);
  protected readonly collapsed = signal(false);
  protected readonly sidebarWidth = signal(360);
  protected readonly model = computed(() => {
    this.version();
    return this.adapter.model();
  });

  constructor(@Inject(DOCUMENT) private readonly documentRef: Document) {}

  ngOnInit(): void {
    this.refreshFromRuntime();
    this.applySidebarWidth();
  }

  protected refreshFromRuntime(): void {
    this.collapsed.set(this.adapter.isCollapsed());
    this.sidebarWidth.set(this.adapter.width());
    this.version.update((value) => value + 1);
    this.applySidebarWidth();
  }

  protected toggleSidebar(): void {
    this.adapter.toggleCollapsed();
    this.refreshFromRuntime();
  }

  protected setBusinessDomain(domainId: string): void {
    this.adapter.setBusinessDomain(domainId);
    this.refreshFromRuntime();
  }

  protected isCollapsedNode(key: string): boolean {
    this.version();
    return this.adapter.isNodeCollapsed(key);
  }

  protected toggleNode(key: string): void {
    this.adapter.toggleNode(key);
    this.version.update((value) => value + 1);
  }

  protected openProcess(process: SidebarProcessSummary): void {
    this.adapter.openProcess(process.id);
  }

  protected openComponentWorkbench(): void {
    this.adapter.openComponentWorkbench();
  }

  protected startResize(event: MouseEvent): void {
    event.preventDefault();
    this.resizing.set(true);
  }

  @HostListener('document:mousemove', ['$event'])
  protected onResizeMove(event: MouseEvent): void {
    if (!this.resizing()) return;
    const nextWidth = Math.max(260, Math.min(620, event.clientX));
    this.sidebarWidth.set(nextWidth);
    this.adapter.setWidth(nextWidth);
    this.applySidebarWidth();
  }

  @HostListener('document:mouseup')
  protected stopResize(): void {
    if (!this.resizing()) return;
    this.resizing.set(false);
  }

  protected streamKey(stream: SidebarValueStreamGroup): string {
    return `vs-${stream.id}`;
  }

  protected stageKey(stage: SidebarStageGroup): string {
    return `stage-tree-${stage.id}`;
  }

  protected componentKey(component: SidebarComponentGroup): string {
    return `cap-${component.id}`;
  }

  // 边界细节：旧壳层的宽度样式在 #sidebar 上，Angular 组件挂在 #sidebar-content 内部；
  // 所以这里仍需同步父容器宽度，等整个壳层组件化后再改为模板绑定。
  private applySidebarWidth(): void {
    const sidebar = this.documentRef.getElementById('sidebar');
    const toggle = this.documentRef.getElementById('sb-toggle-btn');
    if (!sidebar) return;
    sidebar.classList.toggle('sb-collapsed', this.collapsed());
    if (this.collapsed()) {
      sidebar.style.width = '';
      sidebar.style.minWidth = '';
    } else {
      sidebar.style.width = `${this.sidebarWidth()}px`;
      sidebar.style.minWidth = `${this.sidebarWidth()}px`;
    }
    if (toggle) toggle.textContent = this.collapsed() ? '展开' : '折叠';
  }
}
