import { CommonModule, Location } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, Output, computed, signal } from '@angular/core';
import { routePathFromWorkbenchId } from '../routing/main-workbench-route';
import { ShellTabBarAdapter, createShellTabBarLegacyAdapter } from './shell-tab-bar-legacy-adapter';

@Component({
  selector: 'app-shell-tab-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shell-tab-bar.component.html',
  styleUrl: './shell-tab-bar.component.scss',
})
export class ShellTabBarComponent {
  // 模块意图：主导航是工作壳的公共入口，Angular 组件负责渲染与事件；
  // 旧 runtime 仅保留 tab 状态切换能力，避免继续拼接 onclick 字符串。
  private readonly adapter: ShellTabBarAdapter = createShellTabBarLegacyAdapter();
  @Input() showBackAction = true;
  @Output() tabSwitched = new EventEmitter<string>();
  protected readonly version = signal(0);
  protected readonly tabs = this.adapter.tabs();
  protected readonly activeTabId = computed(() => {
    this.version();
    return this.adapter.activeTabId();
  });
  protected readonly canGoBack = computed(() => {
    this.version();
    return this.adapter.canGoBack();
  });
  protected readonly backTitle = computed(() => {
    this.version();
    return this.adapter.backTitle();
  });
  protected readonly isPreviewRendering = computed(() => {
    this.version();
    return this.adapter.isPreviewRendering();
  });

  constructor(
    private readonly changeDetector: ChangeDetectorRef,
    private readonly location: Location,
  ) {}

  protected switchTab(tabId: string): void {
    if (this.isPreviewRendering()) return;
    this.adapter.switchTab(tabId);
    this.location.go(routePathFromWorkbenchId(tabId));
    this.version.update((value) => value + 1);
    this.tabSwitched.emit(tabId);
  }

  protected goBack(): void {
    if (!this.canGoBack()) return;
    const targetTab = this.adapter.goBack();
    if (targetTab) this.location.go(routePathFromWorkbenchId(targetTab));
    this.version.update((value) => value + 1);
  }

  @HostListener('window:blm-shell-tabbar-refresh')
  protected refreshFromLegacyRender(): void {
    // 关键流程：侧栏、历史返回、旧 runtime 分发都可能绕过本组件直接改 S.ui.mainTab。
    this.version.update((value) => value + 1);
    this.changeDetector.detectChanges();
  }
}
