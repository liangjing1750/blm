import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { ApiService, TrashEntry, WorkspaceSummary } from '../core/api/api.service';
import { DocumentPropertiesForm, applyDocumentProperties, readDocumentProperties, validateDocumentProperties } from '../core/document/document-properties';
import { DocumentStore } from '../core/document/document-store';
import { getAngularRuntimeState, replaceRuntimeDocument, switchAngularMainTab } from '../core/runtime/angular-runtime';
import { ShellLayoutQuery } from '../core/shell/layout/shell-layout-query';
import { OpenDocumentQuery, OpenSpaceSummary } from '../core/shell/open-document/open-document-query';
import { workbenchIdFromUrl } from '../core/shell/routing/main-workbench-route';
import { SidebarDirectoryComponent } from '../core/shell/sidebar/sidebar-directory.component';
import { ShellTabBarComponent } from '../core/shell/tab-bar/shell-tab-bar.component';
import { WaitDialogComponent } from '../core/shell/wait-dialog/wait-dialog.component';
import { SyncService } from '../core/sync/sync.service';
import { ComponentWorkbenchShellComponent } from '../workbenches/component/shell/component-workbench-shell.component';
import { EntityWorkbench } from '../workbenches/entity/entity-workbench';
import { KnowledgeWorkbenchComponent } from '../workbenches/knowledge/knowledge-workbench';
import { OrchestrationWorkbench } from '../workbenches/orchestration/orchestration-workbench';
import { PanoramaWorkbench } from '../workbenches/panorama/panorama-workbench';
import { ProcessWorkbenchShellComponent } from '../workbenches/process/shell/process-workbench-shell.component';
import { RoleWorkbenchComponent } from '../workbenches/role/role-workbench';

type ToolbarModal = '' | 'create' | 'copy' | 'open' | 'properties' | 'history' | 'placeholder';
type OpenDocumentTab = 'workspace' | 'trash';

interface WaitDialogState {
  title: string;
  description: string;
}

export const TRANSITION_SHELL = 'angular-shell';

@Component({
  selector: 'app-legacy-shell',
  templateUrl: './legacy-shell.component.html',
  styleUrl: './legacy-shell.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    WaitDialogComponent,
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
export class LegacyShellComponent implements OnInit, OnDestroy {
  // 模块意图：用 Angular 壳层承接顶栏、文件入口、同步入口和主工作台挂载。
  // 关键流程：菜单动作通过 ApiService/SyncService/DocumentStore 完成，工作台切换只写入 Angular runtime。
  // 边界细节：比对、合并、预览、手册、反馈、AI 暂时只保留占位入口，避免重新引入旧脚本。
  protected readonly runtime = getAngularRuntimeState();
  protected readonly layoutQuery = new ShellLayoutQuery(this.runtime);
  protected readonly openDocumentQuery = new OpenDocumentQuery();
  protected readonly activeDropdown = signal<string>('');
  protected readonly modal = signal<ToolbarModal>('');
  protected readonly placeholderTitle = signal('新版迁移中');
  protected readonly workspaceFiles = signal<WorkspaceSummary[]>([]);
  protected readonly trashEntries = signal<TrashEntry[]>([]);
  protected readonly openTab = signal<OpenDocumentTab>('workspace');
  protected readonly activeOpenSpace = signal('');
  protected readonly activeOpenTag = signal('');
  protected readonly workspacePage = signal(1);
  protected readonly trashPage = signal(1);
  protected readonly selectedTrashIds = signal<Set<string>>(new Set());
  protected readonly waitDialog = signal<WaitDialogState | null>(null);
  protected readonly historyRows = signal<any[]>([]);
  protected readonly busy = signal(false);
  protected readonly toast = signal('');
  protected openQuery = '';
  protected createDocumentName = '';
  protected copyDocumentName = '';
  protected documentProperties: DocumentPropertiesForm = readDocumentProperties(null);
  private routeSubscription: Subscription | null = null;

  protected readonly activeMainTab = computed(() => this.runtime.ui['mainTab'] || 'panoramaWorkbench');

  constructor(
    private readonly api: ApiService,
    private readonly documentStore: DocumentStore,
    private readonly syncService: SyncService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.syncMainTabFromRoute(this.router.url);
    this.routeSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.syncMainTabFromRoute(event.urlAfterRedirects));
    void this.refreshWorkspaceFiles();
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
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

  protected openCopyDocument(): void {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档。');
      return;
    }
    this.copyDocumentName = this.defaultCopyDocumentName(this.runtime.currentFile);
    this.modal.set('copy');
    this.activeDropdown.set('');
  }

  protected async submitCopyDocument(): Promise<void> {
    const targetName = this.copyDocumentName.trim();
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档。');
      return;
    }
    if (!targetName) {
      this.showToast('请填写复制后的文档名称。');
      return;
    }
    await this.runBusy(async () => {
      const result = await this.api.copyDocument(this.runtime.currentFile, targetName);
      const name = result?.name || targetName;
      const loaded = await this.api.load(name).catch(() => null);
      if (loaded) this.openLoadedDocument(name, loaded);
      this.modal.set('');
      await this.refreshWorkspaceFiles();
      this.showToast('文档已复制');
    });
  }

  protected async archiveCurrentVersion(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档。');
      return;
    }
    await this.runBusy(async () => {
      await this.api.createVersion(this.runtime.currentFile, this.runtime.doc, '手动归档');
      this.showToast('归档版本已创建');
    });
  }

  protected async deleteCurrentDocument(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档。');
      return;
    }
    if (!window.confirm(`确定删除“${this.currentDocumentLabel()}”吗？删除后会进入回收站。`)) return;
    const deletingName = this.runtime.currentFile;
    await this.runBusy(async () => {
      await this.api.deleteDocument(deletingName);
      replaceRuntimeDocument({}, '');
      this.modal.set('');
      await this.refreshWorkspaceFiles();
      this.showToast('文档已删除');
    });
  }

  protected async openDocument(name: string): Promise<void> {
    const file = this.workspaceFiles().find((item) => item.name === name);
    const label = file?.title || name;
    this.waitDialog.set({
      title: `正在打开“${label}”...`,
      description: '正在读取文档、附件索引和协作会话信息。',
    });
    await this.runBusy(async () => {
      const loaded = await this.api.load(name);
      this.openLoadedDocument(name, loaded);
      this.modal.set('');
    });
    this.waitDialog.set(null);
  }

  protected async openDocumentModal(): Promise<void> {
    await this.refreshOpenDialogData();
    this.openTab.set('workspace');
    this.workspacePage.set(1);
    this.trashPage.set(1);
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

  protected openDocumentProperties(): void {
    if (!this.runtime.doc) {
      this.showToast('请先打开或新建一个文档。');
      return;
    }
    this.documentProperties = readDocumentProperties(this.runtime.doc, this.runtime.currentFile);
    this.modal.set('properties');
    this.activeDropdown.set('');
  }

  protected saveDocumentProperties(): void {
    const message = validateDocumentProperties(this.documentProperties);
    if (message) {
      this.showToast(message);
      return;
    }
    applyDocumentProperties(this.runtime.doc, this.documentProperties);
    this.documentStore.markModified();
    this.modal.set('');
    this.showToast('属性已保存');
  }

  protected showPlaceholder(title: string): void {
    this.placeholderTitle.set(title);
    this.modal.set('placeholder');
    this.activeDropdown.set('');
  }

  protected closeModal(): void {
    this.modal.set('');
  }

  protected switchOpenTab(tab: OpenDocumentTab): void {
    this.openTab.set(tab);
  }

  protected selectedTrashCount(): number {
    return this.selectedTrashIds().size;
  }

  protected isTrashSelected(entry: TrashEntry): boolean {
    return this.selectedTrashIds().has(entry.id);
  }

  protected toggleTrashSelection(entry: TrashEntry, checked: boolean): void {
    const next = new Set(this.selectedTrashIds());
    if (checked) {
      next.add(entry.id);
    } else {
      next.delete(entry.id);
    }
    this.selectedTrashIds.set(next);
  }

  protected async clearSelectedTrash(): Promise<void> {
    const entryIds = Array.from(this.selectedTrashIds());
    if (!entryIds.length) return;
    if (!window.confirm(`确定彻底清理选中的 ${entryIds.length} 个回收站文档吗？`)) return;
    await this.runBusy(async () => {
      await this.api.deleteTrash(entryIds);
      this.selectedTrashIds.set(new Set());
      await this.refreshOpenDialogData();
      this.showToast('已清理选中文档');
    });
  }

  protected async clearAllTrash(): Promise<void> {
    if (!this.sortedTrashEntries().length) return;
    if (!window.confirm('确定彻底清空回收站吗？该操作不可恢复。')) return;
    await this.runBusy(async () => {
      await this.api.clearTrash();
      this.selectedTrashIds.set(new Set());
      await this.refreshOpenDialogData();
      this.showToast('回收站已清空');
    });
  }

  protected selectOpenSpace(space: string): void {
    this.activeOpenSpace.set(space);
    this.activeOpenTag.set('');
    this.workspacePage.set(1);
  }

  protected selectOpenTag(tag: string): void {
    this.activeOpenTag.set(tag);
    this.workspacePage.set(1);
  }

  protected selectWorkspacePage(page: number): void {
    this.workspacePage.set(this.openDocumentQuery.clampPage(page, this.workspaceTotalPages()));
  }

  protected selectTrashPage(page: number): void {
    this.trashPage.set(this.openDocumentQuery.clampPage(page, this.trashTotalPages()));
  }

  protected workspaceSpaces(): OpenSpaceSummary[] {
    return this.openDocumentQuery.workspaceSpaces(this.workspaceFiles());
  }

  protected openTags(): string[] {
    return this.openDocumentQuery.tags(this.workspaceFiles(), this.activeOpenSpace());
  }

  protected filteredWorkspaceFiles(): WorkspaceSummary[] {
    return this.openDocumentQuery.filterWorkspaceFiles(this.workspaceFiles(), {
      activeSpace: this.activeOpenSpace(),
      activeTag: this.activeOpenTag(),
      query: this.openQuery,
    });
  }

  protected workspacePageItems(): WorkspaceSummary[] {
    return this.openDocumentQuery.pageItems(this.filteredWorkspaceFiles(), this.workspacePage());
  }

  protected workspaceTotalPages(): number {
    return this.openDocumentQuery.totalPages(this.filteredWorkspaceFiles().length);
  }

  protected sortedTrashEntries(): TrashEntry[] {
    return this.openDocumentQuery.sortTrash(this.trashEntries());
  }

  protected trashPageItems(): TrashEntry[] {
    return this.openDocumentQuery.pageItems(this.sortedTrashEntries(), this.trashPage());
  }

  protected trashTotalPages(): number {
    return this.openDocumentQuery.totalPages(this.sortedTrashEntries().length);
  }

  protected paginationLabel(page: number, totalItems: number): string {
    return this.openDocumentQuery.paginationLabel(page, totalItems);
  }

  protected async restoreTrashEntry(entry: TrashEntry): Promise<void> {
    if (!entry.id) return;
    await this.runBusy(async () => {
      const restored = await this.api.restoreTrash(entry.id);
      const name = restored?.name || entry.doc_name || entry.label || entry.id;
      this.openLoadedDocument(name, restored);
      this.modal.set('');
      await this.refreshOpenDialogData();
      this.showToast('\u6587\u6863\u5df2\u6062\u590d');
    });
  }

  private async refreshWorkspaceFiles(): Promise<void> {
    const summaries = await this.api.fileSummaries().catch(() => []);
    this.workspaceFiles.set(summaries);
  }

  private async refreshOpenDialogData(): Promise<void> {
    const [summaries, trashEntries] = await Promise.all([
      this.api.fileSummaries().catch(() => []),
      this.api.trash().catch(() => []),
    ]);
    this.workspaceFiles.set(summaries);
    this.trashEntries.set(trashEntries);
    this.syncSelectedTrashIds(trashEntries);
    this.ensureActiveOpenSpace();
    this.ensureActiveOpenTag();
    this.workspacePage.set(this.openDocumentQuery.clampPage(this.workspacePage(), this.workspaceTotalPages()));
    this.trashPage.set(this.openDocumentQuery.clampPage(this.trashPage(), this.trashTotalPages()));
  }

  private ensureActiveOpenSpace(): void {
    const spaces = this.workspaceSpaces().map((space) => space.name);
    if (!spaces.length) {
      this.activeOpenSpace.set('');
      return;
    }
    if (!spaces.includes(this.activeOpenSpace())) {
      const defaultSpace = this.openDocumentQuery.normalizeWorkspaceSpace('');
      this.activeOpenSpace.set(spaces.includes(defaultSpace) ? defaultSpace : spaces[0]);
    }
  }

  private ensureActiveOpenTag(): void {
    if (this.activeOpenTag() && !this.openTags().includes(this.activeOpenTag())) {
      this.activeOpenTag.set('');
    }
  }

  private syncSelectedTrashIds(entries: TrashEntry[]): void {
    const availableIds = new Set(entries.map((entry) => entry.id));
    const next = new Set(Array.from(this.selectedTrashIds()).filter((entryId) => availableIds.has(entryId)));
    this.selectedTrashIds.set(next);
  }

  private openLoadedDocument(name: string, payload: any): void {
    const document = payload?.document || payload;
    this.documentStore.load(document, name);
    this.syncMainTabFromRoute(this.router.url);
  }

  // 关键流程：浏览器 URL 是用户可见入口，进入 /panorama、刷新或前进后退时必须反向校正 runtime 主 tab。
  private syncMainTabFromRoute(url: string): void {
    const nextMainTab = workbenchIdFromUrl(url);
    if (this.runtime.ui['mainTab'] === nextMainTab) return;
    this.runtime.ui['mainTab'] = nextMainTab;
    window.dispatchEvent(new CustomEvent('blm-shell-tabbar-refresh'));
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

  private defaultCopyDocumentName(name: string): string {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.json')
      ? `${trimmed.slice(0, -5)}-copy.json`
      : `${trimmed}-copy`;
  }
}
