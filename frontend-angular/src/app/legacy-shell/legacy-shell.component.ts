import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, WorkspaceSummary } from '../core/api/api.service';
import { DocumentStore } from '../core/document/document-store';
import { getAngularRuntimeState, switchAngularMainTab } from '../core/runtime/angular-runtime';
import { ShellLayoutQuery } from '../core/shell/layout/shell-layout-query';
import { SidebarDirectoryComponent } from '../core/shell/sidebar/sidebar-directory.component';
import { ShellTabBarComponent } from '../core/shell/tab-bar/shell-tab-bar.component';
import { SyncService } from '../core/sync/sync.service';
import { ComponentWorkbenchShellComponent } from '../workbenches/component/shell/component-workbench-shell.component';
import { EntityWorkbench } from '../workbenches/entity/entity-workbench';
import { KnowledgeWorkbenchComponent } from '../workbenches/knowledge/knowledge-workbench';
import { OrchestrationWorkbench } from '../workbenches/orchestration/orchestration-workbench';
import { PanoramaWorkbench } from '../workbenches/panorama/panorama-workbench';
import { ProcessWorkbenchShellComponent } from '../workbenches/process/shell/process-workbench-shell.component';
import { RoleWorkbenchComponent } from '../workbenches/role/role-workbench';

type ToolbarModal = '' | 'create' | 'open' | 'history' | 'placeholder';

export const TRANSITION_SHELL = 'angular-shell';

@Component({
  selector: 'app-legacy-shell',
  templateUrl: './legacy-shell.component.html',
  styleUrl: './legacy-shell.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    ShellTabBarComponent,
    SidebarDirectoryComponent,
    PanoramaWorkbench,
    ProcessWorkbenchShellComponent,
    ComponentWorkbenchShellComponent,
    OrchestrationWorkbench,
    EntityWorkbench,
    KnowledgeWorkbenchComponent,
    RoleWorkbenchComponent,
  ],
})
export class LegacyShellComponent implements OnInit {
  // 模块意图：用 Angular 壳层承接顶栏、文件入口、同步入口和主工作台挂载。
  // 关键流程：菜单动作通过 ApiService/SyncService/DocumentStore 完成，工作台切换只写入 Angular runtime。
  // 边界细节：比对、合并、预览、手册、反馈、AI 暂时只保留占位入口，避免重新引入旧脚本。
  protected readonly runtime = getAngularRuntimeState();
  protected readonly layoutQuery = new ShellLayoutQuery(this.runtime);
  protected readonly activeDropdown = signal<string>('');
  protected readonly modal = signal<ToolbarModal>('');
  protected readonly placeholderTitle = signal('新版迁移中');
  protected readonly workspaceFiles = signal<WorkspaceSummary[]>([]);
  protected readonly historyRows = signal<any[]>([]);
  protected readonly busy = signal(false);
  protected readonly toast = signal('');
  protected openQuery = '';
  protected createDocumentName = '';

  protected readonly activeMainTab = computed(() => this.runtime.ui['mainTab'] || 'panoramaWorkbench');

  constructor(
    private readonly api: ApiService,
    private readonly documentStore: DocumentStore,
    private readonly syncService: SyncService,
  ) {}

  ngOnInit(): void {
    void this.refreshWorkspaceFiles();
  }

  @HostListener('document:click', ['$event'])
  protected closeDropdownOnOutsideClick(event: MouseEvent): void {
    if ((event.target as HTMLElement | null)?.closest('.tbar-dd')) return;
    this.activeDropdown.set('');
  }

  @HostListener('window:keydown', ['$event'])
  protected handleShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.syncNow();
    }
  }

  protected currentDocumentLabel(): string {
    return this.runtime.currentFile || '未打开文档';
  }

  protected modifiedLabel(): string {
    if (this.runtime.collab.syncing) return '同步中';
    return this.runtime.modified ? '本地未提交' : '';
  }

  protected toggleDropdown(name: string, event?: Event): void {
    event?.stopPropagation();
    this.activeDropdown.set(this.activeDropdown() === name ? '' : name);
  }

  protected switchWorkbench(tabId: string): void {
    switchAngularMainTab(tabId);
  }

  protected async createDocument(): Promise<void> {
    this.createDocumentName = '';
    this.modal.set('create');
    this.activeDropdown.set('');
  }

  protected async submitCreateDocument(): Promise<void> {
    const name = this.createDocumentName.trim();
    if (!name) {
      this.showToast('请输入文档名称');
      return;
    }
    await this.runBusy(async () => {
      const created = await this.api.create(name);
      const loaded = created?.document ? created : await this.api.load(name);
      this.openLoadedDocument(name, loaded);
      this.modal.set('');
      await this.refreshWorkspaceFiles();
      this.showToast('文档已创建');
    });
  }

  protected async openDocument(name: string): Promise<void> {
    await this.runBusy(async () => {
      const loaded = await this.api.load(name);
      this.openLoadedDocument(name, loaded);
      this.modal.set('');
      this.showToast('文档已打开');
    });
  }

  protected async openDocumentModal(): Promise<void> {
    await this.refreshWorkspaceFiles();
    this.modal.set('open');
    this.activeDropdown.set('');
  }

  protected async syncNow(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档');
      return;
    }
    await this.runBusy(async () => {
      await this.syncService.syncNow();
      this.showToast('同步完成');
    });
  }

  protected async openHistory(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档');
      return;
    }
    await this.runBusy(async () => {
      const [history, versions] = await Promise.all([
        this.api.history(this.runtime.currentFile).catch(() => []),
        this.api.versions(this.runtime.currentFile).catch(() => []),
      ]);
      this.historyRows.set([...(versions || []), ...(history || [])]);
      this.modal.set('history');
      this.activeDropdown.set('');
    });
  }

  protected showPlaceholder(title: string): void {
    this.placeholderTitle.set(title);
    this.modal.set('placeholder');
    this.activeDropdown.set('');
  }

  protected closeModal(): void {
    this.modal.set('');
  }

  protected filteredWorkspaceFiles(): WorkspaceSummary[] {
    const query = this.openQuery.trim().toLowerCase();
    const files = this.workspaceFiles();
    if (!query) return files;
    return files.filter((file) => `${file.name} ${file.title || ''}`.toLowerCase().includes(query));
  }

  private async refreshWorkspaceFiles(): Promise<void> {
    const summaries = await this.api.fileSummaries().catch(() => []);
    this.workspaceFiles.set(summaries);
  }

  private openLoadedDocument(name: string, payload: any): void {
    const document = payload?.document || payload;
    this.documentStore.load(document, name);
    this.runtime.ui['mainTab'] = this.runtime.ui['mainTab'] || 'panoramaWorkbench';
  }

  private async runBusy(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

  private showToast(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => {
      if (this.toast() === message) this.toast.set('');
    }, 2400);
  }
}
