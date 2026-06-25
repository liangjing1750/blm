import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { ApiService, TrashEntry, WorkspaceSummary } from '../core/api/api.service';
import { CollaborationService } from '../core/collaboration/collaboration.service';
import { DocumentPropertiesForm, applyDocumentProperties, readDocumentProperties, validateDocumentProperties } from '../core/document/document-properties';
import { DocumentStore } from '../core/document/document-store';
import { RuntimeConfirmEventDetail, getAngularRuntimeState, replaceRuntimeDocument, switchAngularMainTab } from '../core/runtime/angular-runtime';
import { HistoryDialogComponent, HistoryDialogTab } from '../core/shell/history/history-dialog.component';
import { ShellLayoutQuery } from '../core/shell/layout/shell-layout-query';
import { ShellNotificationComponent, ShellNotificationKind } from '../core/shell/notification/shell-notification.component';
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
import { FeedbackWorkbenchComponent } from '../workbenches/support/feedback/feedback-workbench.component';
import { ManualWorkbenchComponent } from '../workbenches/support/manual/manual-workbench.component';

type ToolbarModal = '' | 'create' | 'copy' | 'archive' | 'open' | 'properties' | 'history' | 'placeholder';
type OpenDocumentTab = 'workspace' | 'trash';

interface WaitDialogState {
  title: string;
  description: string;
}

interface ShellToastState {
  message: string;
  kind: ShellNotificationKind;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (confirmed: boolean) => void;
}

export const TRANSITION_SHELL = 'angular-shell';

@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    WaitDialogComponent,
    HistoryDialogComponent,
    ShellNotificationComponent,
    ShellTabBarComponent,
    SidebarDirectoryComponent,
    PanoramaWorkbench,
    ProcessWorkbenchShellComponent,
    ComponentWorkbenchShellComponent,
    OrchestrationWorkbench,
    EntityWorkbench,
    KnowledgeWorkbenchComponent,
    RoleWorkbenchComponent,
    ManualWorkbenchComponent,
    FeedbackWorkbenchComponent,
  ],
})
export class ShellComponent implements OnInit, OnDestroy {
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
  protected readonly versionRows = signal<any[]>([]);
  protected readonly submitRows = signal<any[]>([]);
  protected readonly historyTab = signal<HistoryDialogTab>('remote');
  protected readonly busy = signal(false);
  protected readonly toast = signal<ShellToastState | null>(null);
  protected readonly confirmDialog = signal<ConfirmDialogState | null>(null);
  protected readonly collabUsersOpen = signal(false);
  private readonly shellVersion = signal(0);
  protected openQuery = '';
  protected createDocumentName = '';
  protected copyDocumentName = '';
  protected archiveVersionMessage = '';
  protected documentProperties: DocumentPropertiesForm = readDocumentProperties(null);
  private routeSubscription: Subscription | null = null;

  protected readonly activeMainTab = computed(() => {
    this.shellVersion();
    return this.runtime.ui['mainTab'] || 'panoramaWorkbench';
  });
  protected readonly isUtilityWorkbench = computed(() => ['manual', 'feedback'].includes(this.activeMainTab()));

  constructor(
    private readonly api: ApiService,
    protected readonly collaboration: CollaborationService,
    private readonly documentStore: DocumentStore,
    private readonly syncService: SyncService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.syncMainTabFromRoute(this.router.url);
    this.routeSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.syncMainTabFromRoute(event.urlAfterRedirects));
    if (this.runtime.currentFile) this.collaboration.start(this.runtime.currentFile);
    void this.refreshWorkspaceFiles();
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.collaboration.stop();
  }

  @HostListener('document:click', ['$event'])
  protected closeDropdownOnOutsideClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.tbar-dd')) return;
    if (target?.closest('.collab-users-popup') || target?.closest('.collab-status')) return;
    this.activeDropdown.set('');
    this.collabUsersOpen.set(false);
  }

  @HostListener('window:keydown', ['$event'])
  protected handleShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.syncNow();
    }
  }

  @HostListener('window:blm-angular-runtime-refresh')
  protected handleRuntimeRefresh(): void {
    this.refreshShellView();
  }

  @HostListener('window:blm-runtime-confirm', ['$event'])
  protected handleRuntimeConfirm(event: Event): void {
    const detail = (event as CustomEvent<RuntimeConfirmEventDetail>).detail;
    detail.markHandled();
    this.confirmDialog.set({
      title: detail.options.title || '确认操作',
      message: detail.message,
      confirmLabel: detail.options.confirmLabel || '确认',
      cancelLabel: detail.options.cancelLabel || '取消',
      resolve: detail.resolve,
    });
  }

  protected currentDocumentLabel(): string {
    // 模块意图：顶部展示给用户的是业务文档名称，而不是服务端持久化 key。
    // 关键流程：属性保存会更新 meta.title/domain；这里优先读取 meta，刷新界面时能立即看到已生效的文档名。
    // 边界细节：currentFile 仍作为接口读写用的稳定 key，不在展示层隐式触发重命名。
    const meta = this.runtime.doc?.meta || {};
    return String(meta.title || meta.domain || this.runtime.currentFile || '未打开文档').trim();
  }

  protected modifiedLabel(): string {
    if (this.runtime.collab.syncing) return '同步中';
    return this.runtime.modified || this.runtime.collab.pendingSnapshot ? '待同步' : '';
  }

  protected collaborationLabel(): string {
    return this.collaboration.statusText();
  }

  protected collaborationTitle(): string {
    return this.collaboration.allOnlineUsers().map((u) =>
      u.connectionCount > 1 ? `${u.name}（${u.connectionCount}个窗口）` : u.name
    ).join('、') || '协作在线';
  }

  protected collaborationOnlineUsers(): Array<{ name: string; connectionCount: number }> {
    return this.collaboration.allOnlineUsers();
  }

  protected toggleCollabUsers(event: Event): void {
    event.stopPropagation();
    this.collabUsersOpen.update((v) => !v);
  }

  protected closeCollabUsers(): void {
    this.collabUsersOpen.set(false);
  }

  // 模块意图：区分"当前版本"（本地已确认基线）和"最新版本"（远端已知最高版本），
  // 消除原来笼统显示 seq 的歧义。
  protected currentVersionLabel(): string {
    if (!this.runtime.currentFile) return '';
    if (this.runtime.readOnly) {
      const versionId = String(this.runtime.doc?.meta?.version_id || '').trim();
      const versionLabel = String(this.runtime.doc?.meta?.version_label || '').trim();
      if (versionLabel) return versionLabel;
      if (versionId) return versionId.startsWith('history:') ? '历史快照' : `版本 ${versionId}`;
      return '只读版本';
    }
    if (!this.runtime.runtime.supportsCollab) return '';
    const base = Number(this.runtime.collab.acceptedSeq || 0);
    return base > 0 ? `当前版本 v${base}` : '';
  }

  protected latestVersionLabel(): string {
    if (!this.runtime.currentFile || this.runtime.readOnly) return '';
    if (!this.runtime.runtime.supportsCollab) return '';
    const latest = Number(this.runtime.collab.seq || 0);
    const base = Number(this.runtime.collab.acceptedSeq || 0);
    return latest > base ? `最新版本 v${latest}` : '';
  }

  protected hasVersionBadge(): boolean {
    return Boolean(this.currentVersionLabel() || this.latestVersionLabel());
  }


  protected hasLocalUnsubmitted(): boolean {
    if (!this.runtime.currentFile || this.runtime.readOnly) return false;
    return Boolean(this.runtime.modified || this.runtime.collab.pendingSnapshot || this.runtime.collab.syncing);
  }

  protected hasRemoteUnsynced(): boolean {
    return Boolean(this.runtime.currentFile && !this.runtime.readOnly && this.runtime.collab.hasRemoteUpdate);
  }

  protected hasSyncBadge(): boolean {
    return this.hasLocalUnsubmitted() || this.hasRemoteUnsynced();
  }

  protected localSyncLabel(): string {
    return this.runtime.collab.syncing ? '\u672c\u5730\u540c\u6b65\u4e2d' : '\u672c\u5730\u672a\u63d0\u4ea4';
  }

  protected remoteSyncLabel(): string {
    return '\u8fdc\u7aef\u5f85\u540c\u6b65';
  }

  protected syncBadgeTitle(): string {
    return [
      this.hasRemoteUnsynced() ? '\u8fdc\u7aef\u5df2\u6709\u5176\u4ed6\u4eba\u63d0\u4ea4\uff0c\u70b9\u51fb\u7acb\u5373\u540c\u6b65\u62c9\u53d6\u5e76\u5408\u5e76\u3002' : '',
      this.hasLocalUnsubmitted() ? '\u672c\u5730\u4fee\u6539\u5c1a\u672a\u63d0\u4ea4\u5230\u670d\u52a1\u7aef\u3002' : '',
    ].filter(Boolean).join('\n');
  }


  protected toggleDropdown(name: string, event?: Event): void {
    event?.stopPropagation();
    this.activeDropdown.set(this.activeDropdown() === name ? '' : name);
  }

  protected switchWorkbench(tabId: string): void {
    switchAngularMainTab(tabId);
    this.refreshShellView();
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
    if (this.runtime.readOnly) {
      this.showToast('当前查看的是只读版本，不能再次归档。');
      return;
    }
    this.archiveVersionMessage = '';
    this.modal.set('archive');
    this.activeDropdown.set('');
  }

  protected async submitArchiveVersion(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档。');
      return;
    }
    if (this.runtime.readOnly) {
      this.showToast('当前查看的是只读版本，不能再次归档。');
      this.modal.set('');
      return;
    }
    this.waitDialog.set({
      title: '正在归档版本...',
      description: '正在保存当前文档为稳定只读版本。',
    });
    try {
      await this.runBusy(async () => {
        await this.api.createVersion(this.runtime.currentFile, this.runtime.doc, this.archiveVersionMessage.trim());
        this.archiveVersionMessage = '';
        this.modal.set('');
        this.showToast('归档版本已创建');
      });
    } finally {
      this.waitDialog.set(null);
    }
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
      this.collaboration.stop();
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
    try {
      await this.runBusy(async () => {
        const loaded = await this.api.load(name);
        this.openLoadedDocument(name, loaded);
        this.modal.set('');
      });
    } finally {
      this.waitDialog.set(null);
    }
  }

  protected async openDocumentModal(): Promise<void> {
    this.activeDropdown.set('');
    this.openQuery = '';
    this.activeOpenSpace.set('');
    this.activeOpenTag.set('');
    await this.refreshOpenDialogData();
    this.openTab.set('workspace');
    this.workspacePage.set(1);
    this.trashPage.set(1);
    this.modal.set('open');
  }

  protected async syncNow(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('\u8bf7\u5148\u6253\u5f00\u6587\u6863');
      return;
    }
    this.waitDialog.set({
      title: '\u6b63\u5728\u540c\u6b65\u6587\u6863...',
      description: '\u6b63\u5728\u63d0\u4ea4\u672c\u5730\u4fee\u6539\u5e76\u62c9\u53d6\u8fdc\u7aef\u6700\u65b0\u7248\u672c\u3002',
    });
    try {
      await this.runBusy(async () => {
        await this.syncService.syncNow();
      });
    } finally {
      this.waitDialog.set(null);
    }
  }

  protected async openHistory(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档');
      return;
    }
    await this.runBusy(async () => {
      const [history, versions, submits] = await Promise.all([
        this.api.history(this.runtime.currentFile).catch(() => []),
        this.api.versions(this.runtime.currentFile).catch(() => []),
        this.api.collabSubmits(this.runtime.currentFile).catch(() => ({ submits: [] })),
      ]);
      this.historyRows.set(history || []);
      this.versionRows.set(versions || []);
      this.submitRows.set(Array.isArray(submits?.submits) ? submits.submits : []);
      this.historyTab.set('remote');
      this.modal.set('history');
      this.activeDropdown.set('');
    });
  }

  protected openManual(): void {
    this.runtime.ui['mainTab'] = 'manual';
    this.activeDropdown.set('');
    this.refreshShellView();
    void this.router.navigateByUrl('/manual');
    window.dispatchEvent(new CustomEvent('blm-shell-tabbar-refresh'));
  }

  protected openFeedback(): void {
    this.runtime.ui['mainTab'] = 'feedback';
    this.activeDropdown.set('');
    this.refreshShellView();
    void this.router.navigateByUrl('/feedback');
    window.dispatchEvent(new CustomEvent('blm-shell-tabbar-refresh'));
  }

  protected selectHistoryTab(tab: HistoryDialogTab): void {
    this.historyTab.set(tab);
  }

  protected async openVersionReadOnly(row: any): Promise<void> {
    const id = String(row?.id || row?.version_id || '').trim();
    if (!this.runtime.currentFile || !id) return;
    await this.runBusy(async () => {
      const loaded = await this.api.loadVersion(this.runtime.currentFile, id);
      this.openLoadedDocument(this.runtime.currentFile, loaded, true);
      this.modal.set('');
    });
  }

  protected async copyVersionLink(row: any): Promise<void> {
    const id = String(row?.id || row?.version_id || '').trim();
    if (!this.runtime.currentFile || !id) return;
    const copied = await this.copyLocatorUrl(this.buildLocatorUrl({ doc: this.runtime.currentFile, at: `version:${id}` }));
    this.showToast(copied ? '版本链接已复制' : '复制链接失败', copied ? 'success' : 'error');
  }

  protected async openHistoryReadOnly(row: any): Promise<void> {
    const id = String(row?.id || row?.snapshot_id || '').trim();
    if (!this.runtime.currentFile || !id) return;
    await this.runBusy(async () => {
      const loaded = await this.api.loadHistory(this.runtime.currentFile, id);
      const document = loaded?.document || loaded;
      document.meta = document.meta && typeof document.meta === 'object' ? document.meta : {};
      document.meta.readonly = true;
      document.meta.version_id = `history:${id}`;
      document.meta.version_label = document.meta.version_label || '历史快照';
      this.openLoadedDocument(this.runtime.currentFile, loaded, true);
      this.modal.set('');
    });
  }

  protected async openSubmitReadOnly(row: any): Promise<void> {
    const submitId = String(row?.submitId || '').trim();
    if (!this.runtime.currentFile || !submitId) return;
    await this.runBusy(async () => {
      const loaded = await this.api.loadCollabSubmit(this.runtime.currentFile, submitId);
      const document = loaded?.document || loaded;
      document.meta = document.meta && typeof document.meta === 'object' ? document.meta : {};
      document.meta.readonly = true;
      document.meta.version_id = `submit:${submitId}`;
      document.meta.version_label = document.meta.version_label || '本地提交';
      this.openLoadedDocument(this.runtime.currentFile, loaded, true);
      this.modal.set('');
    });
  }

  protected async archiveHistorySnapshot(row: any): Promise<void> {
    const id = String(row?.id || row?.snapshot_id || '').trim();
    if (!this.runtime.currentFile || !id) return;
    const message = window.prompt('给这个归档版本填写说明：', `历史记录 ${id}`);
    if (message === null) return;
    await this.runBusy(async () => {
      const loaded = await this.api.loadHistory(this.runtime.currentFile, id);
      await this.api.createVersion(this.runtime.currentFile, loaded?.document || loaded, String(message || '').trim());
      const versions = await this.api.versions(this.runtime.currentFile).catch(() => []);
      this.versionRows.set(versions || []);
      this.showToast('历史记录已归档为版本。');
    });
  }

  protected async restoreHistorySnapshot(row: any): Promise<void> {
    const id = String(row?.id || row?.snapshot_id || '').trim();
    if (!this.runtime.currentFile || !id) return;
    if (!window.confirm('本地恢复会把这个历史版本设为当前文档，点击“立即同步”后才会影响其他人。继续吗？')) return;
    await this.runBusy(async () => {
      const loaded = await this.api.loadHistory(this.runtime.currentFile, id);
      const document = loaded?.document || loaded;
      this.restoreLoadedDocument(this.runtime.currentFile, document, Number(row?.seq || 0));
      this.modal.set('');
      this.showToast('已本地恢复历史版本，点击“立即同步”后才会影响其他人。');
    });
  }

  protected async restoreSubmitSnapshot(row: any): Promise<void> {
    const submitId = String(row?.submitId || '').trim();
    if (!this.runtime.currentFile || !submitId) return;
    if (!window.confirm('本地恢复会把这次提交设为当前文档，点击“立即同步”后才会影响其他人。继续吗？')) return;
    await this.runBusy(async () => {
      const loaded = await this.api.loadCollabSubmit(this.runtime.currentFile, submitId);
      const document = loaded?.document || loaded;
      this.restoreLoadedDocument(this.runtime.currentFile, document, Number(row?.baseSeq || loaded?.baseSeq || 0));
      this.modal.set('');
      this.showToast('已本地恢复提交记录，点击“立即同步”后才会影响其他人。');
    });
  }

  protected openDocumentProperties(): void {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开或新建一个文档。');
      return;
    }
    this.documentProperties = readDocumentProperties(this.runtime.doc, this.runtime.currentFile);
    this.modal.set('properties');
    this.activeDropdown.set('');
  }

  protected async saveDocumentProperties(): Promise<void> {
    const message = validateDocumentProperties(this.documentProperties);
    if (message) {
      this.showToast(message);
      return;
    }
    applyDocumentProperties(this.runtime.doc, this.documentProperties);
    this.documentStore.markModified();
    this.waitDialog.set({
      title: '正在保存属性...',
      description: '正在提交文档属性并同步到当前工作区。',
    });
    this.busy.set(true);
    this.collaboration.beginSync();
    try {
      const result = await this.api.save(
        this.runtime.currentFile,
        this.runtime.doc,
        { saveMessage: '修改文档属性' },
      );
      const document = result?.document || this.runtime.doc;
      replaceRuntimeDocument(document, this.runtime.currentFile);
      this.documentStore.load(document, this.runtime.currentFile);
      this.collaboration.finishSync(Number(result?.seq || this.runtime.collab.seq || 0));
      this.collaboration.announceDocumentSaved(this.runtime.currentFile);
      await this.refreshWorkspaceFiles();
      this.modal.set('');
      this.showToast('属性已保存');
    } catch (error) {
      this.collaboration.failSync(error);
      this.showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      this.busy.set(false);
      this.waitDialog.set(null);
    }
  }

  protected showPlaceholder(title: string): void {
    this.placeholderTitle.set(title);
    this.modal.set('placeholder');
    this.activeDropdown.set('');
  }

  protected closeModal(): void {
    this.modal.set('');
  }

  protected closeConfirmDialog(confirmed: boolean): void {
    const dialog = this.confirmDialog();
    if (!dialog) return;
    this.confirmDialog.set(null);
    dialog.resolve(confirmed);
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

  private openLoadedDocument(name: string, payload: any, readOnly = false): void {
    const document = payload?.document || payload;
    this.documentStore.load(document, name);
    this.runtime.readOnly = readOnly || !!document?.meta?.readonly;
    this.runtime.collab.hasRemoteUpdate = false;
    this.runtime.collab.pendingSnapshot = false;
    if (this.runtime.readOnly) this.collaboration.stop();
    else this.collaboration.start(name);
    this.runtime.ui['mainTab'] = 'panoramaWorkbench';
    this.refreshShellView();
    void this.router.navigateByUrl('/panorama');
    window.dispatchEvent(new CustomEvent('blm-shell-tabbar-refresh'));
  }

  private restoreLoadedDocument(name: string, document: any, baseSeq = 0): void {
    const restored = structuredClone(document || {});
    restored.meta = restored.meta && typeof restored.meta === 'object' ? restored.meta : {};
    restored.meta.readonly = false;
    delete restored.meta.version_id;
    delete restored.meta.version_label;
    this.documentStore.load(restored, name);
    this.runtime.readOnly = false;
    this.runtime.modified = true;
    this.runtime.collab.pendingSnapshot = true;
    this.runtime.collab.draftBaseSeqOverride = Number(baseSeq || 0);
    this.runtime.collab.recoveryMode = true;
    this.runtime.collab.forceSnapshotSync = true;
    this.collaboration.start(name);
    this.runtime.ui['mainTab'] = 'panoramaWorkbench';
    this.refreshShellView();
    void this.router.navigateByUrl('/panorama');
    window.dispatchEvent(new CustomEvent('blm-shell-tabbar-refresh'));
  }

  // 关键流程：浏览器 URL 是用户可见入口，进入 /panorama、刷新或前进后退时必须反向校正 runtime 主 tab。
  private syncMainTabFromRoute(url: string): void {
    const nextMainTab = workbenchIdFromUrl(url);
    if (this.runtime.ui['mainTab'] === nextMainTab) return;
    this.runtime.ui['mainTab'] = nextMainTab;
    this.refreshShellView();
    window.dispatchEvent(new CustomEvent('blm-shell-tabbar-refresh'));
  }

  protected refreshShellView(): void {
    this.shellVersion.update((value) => value + 1);
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

  private showToast(message: string, kind: ShellNotificationKind = 'info'): void {
    const resolvedKind = kind === 'info' && /(已|成功|完成)/.test(message) ? 'success' : kind;
    this.toast.set({ message, kind: resolvedKind });
    window.setTimeout(() => {
      if (this.toast()?.message === message) this.toast.set(null);
    }, 2400);
  }

  private buildLocatorUrl(extra: Record<string, string>): string {
    const params = new URLSearchParams(window.location.search || '');
    Object.entries(extra).forEach(([key, value]) => {
      const text = String(value || '').trim();
      if (text) params.set(key, text);
    });
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  private async copyLocatorUrl(url: string): Promise<boolean> {
    if (!url) return false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch {
        // 浏览器权限或非安全上下文会拒绝 Clipboard API；保留旧版同类降级路径。
      }
    }
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  }

  private defaultCopyDocumentName(name: string): string {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.json')
      ? `${trimmed.slice(0, -5)}-copy.json`
      : `${trimmed}-copy`;
  }
}
