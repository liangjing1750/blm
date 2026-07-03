import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AgentHandoffPayload, ApiService, TrashEntry, WorkspaceSummary } from '../core/api/api.service';
import { CollaborationService } from '../core/collaboration/collaboration.service';
import { LocalCollabDraftService } from '../core/collaboration/local-collab-draft.service';
import { DocumentPropertiesForm, applyDocumentProperties, readDocumentProperties, validateDocumentProperties } from '../core/document/document-properties';
import { DocumentStore } from '../core/document/document-store';
import { RuntimeConfirmEventDetail, getAngularRuntimeState, replaceRuntimeDocument, switchAngularMainTab } from '../core/runtime/angular-runtime';
import { HistoryDialogComponent, HistoryDialogTab } from '../core/shell/history/history-dialog.component';
import { ShellLayoutQuery } from '../core/shell/layout/shell-layout-query';
import { ShellNotificationComponent, ShellNotificationKind } from '../core/shell/notification/shell-notification.component';
import { OpenDocumentQuery, OpenSpaceSummary } from '../core/shell/open-document/open-document-query';
import { routePathFromWorkbenchId, workbenchIdFromUrl } from '../core/shell/routing/main-workbench-route';
import { SidebarDirectoryComponent } from '../core/shell/sidebar/sidebar-directory.component';
import { ShellTabBarComponent } from '../core/shell/tab-bar/shell-tab-bar.component';
import { WaitDialogComponent } from '../core/shell/wait-dialog/wait-dialog.component';
import { SyncService } from '../core/sync/sync.service';
import { ComponentWorkbenchShellComponent } from '../workbenches/component/shell/component-workbench-shell.component';
import { ApplicationWorkbenchShellComponent } from '../workbenches/application/app-workbench-shell.component';
import { EntityWorkbench } from '../workbenches/entity/entity-workbench';
import { KnowledgeWorkbenchComponent } from '../workbenches/knowledge/knowledge-workbench';
import { OrchestrationWorkbench } from '../workbenches/orchestration/orchestration-workbench';
import { PanoramaWorkbench } from '../workbenches/panorama/panorama-workbench';
import { PreviewWorkbench } from '../workbenches/preview/preview-workbench';
import { ProcessWorkbenchShellComponent } from '../workbenches/process/shell/process-workbench-shell.component';
import { RoleWorkbenchComponent } from '../workbenches/role/role-workbench';
import { FeedbackWorkbenchComponent } from '../workbenches/support/feedback/feedback-workbench.component';
import { ManualWorkbenchComponent } from '../workbenches/support/manual/manual-workbench.component';

type ToolbarModal = '' | 'create' | 'copy' | 'archive' | 'open' | 'properties' | 'history' | 'compare' | 'merge' | 'placeholder';
type OpenDocumentTab = 'workspace' | 'trash';
type CompareSource = 'current' | 'version' | 'history' | 'submit';

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

interface LocatorAction {
  id: string;
  label: string;
  params: Record<string, string>;
  testId: string;
}

interface LocatorMenuState {
  x: number;
  y: number;
  actions: LocatorAction[];
}

interface CompareRow {
  section: string;
  kind: '新增' | '删除' | '修改' | '相同';
  name: string;
  detail: string;
}

interface CompareResult {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  rows: CompareRow[];
}

interface CompareGroup {
  section: string;
  rows: CompareRow[];
}

interface MergeAnalysis {
  suggested_name?: string;
  summary?: {
    autoMergedCount?: number;
    validationIssueCount?: number;
  };
  conflicts?: any[];
  validation_issues?: any[];
  merged_document?: any;
}

interface MergePreviewMetric {
  label: string;
  value: string | number;
}

interface MergeValidationFixView {
  kind: 'stage_flow_link' | 'stage_flow_ref' | 'stage_process_link' | 'relation' | 'unknown';
  group: 'auto' | 'manual';
  title: string;
  recommendation: string;
  actionLabel?: string;
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
    ApplicationWorkbenchShellComponent,
    OrchestrationWorkbench,
    PreviewWorkbench,
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
  protected readonly compareResult = signal<CompareResult | null>(null);
  protected readonly compareReportMode = signal<'diff' | 'all'>('diff');
  protected readonly compareLeftVersions = signal<any[]>([]);
  protected readonly compareRightVersions = signal<any[]>([]);
  protected readonly mergeAnalysis = signal<MergeAnalysis | null>(null);
  protected readonly mergeResolutions = signal<Record<string, string>>({});
  protected readonly mergeCustomValues = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly toast = signal<ShellToastState | null>(null);
  protected readonly confirmDialog = signal<ConfirmDialogState | null>(null);
  protected readonly collabUsersOpen = signal(false);
  protected readonly locatorMenu = signal<LocatorMenuState | null>(null);
  private readonly shellVersion = signal(0);
  protected openQuery = '';
  protected createDocumentName = '';
  protected copyDocumentName = '';
  protected compareLeftName = '';
  protected compareLeftSource: CompareSource = 'current';
  protected compareLeftVersionId = '';
  protected compareRightName = '';
  protected compareRightSource: CompareSource = 'current';
  protected compareRightVersionId = '';
  protected mergeLeftName = '';
  protected mergeRightName = '';
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
    private readonly localDrafts: LocalCollabDraftService,
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
    void this.openStartupLocatorIfPresent();
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.collaboration.stop();
  }

  @HostListener('document:click', ['$event'])
  protected closeDropdownOnOutsideClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.locator-menu')) return;
    if (target?.closest('.tbar-dd')) return;
    if (target?.closest('.collab-users-popup') || target?.closest('.collab-status')) return;
    this.activeDropdown.set('');
    this.collabUsersOpen.set(false);
    this.locatorMenu.set(null);
  }

  @HostListener('document:contextmenu', ['$event'])
  protected showLocatorMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('#tab-content, #sidebar-content, .file-name, .collab-status');
    if (!anchor || !this.runtime.currentFile) return;
    const actions = this.locatorActions();
    if (!actions.length) return;
    event.preventDefault();
    this.activeDropdown.set('');
    this.collabUsersOpen.set(false);
    const width = 210;
    const height = Math.max(48, actions.length * 36 + 12);
    this.locatorMenu.set({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 12)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 12)),
      actions,
    });
  }

  @HostListener('window:blur')
  protected hideLocatorMenu(): void {
    this.locatorMenu.set(null);
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
    this.persistLocalDraftIfNeeded();
  }

  @HostListener('window:blm-runtime-local-change')
  protected handleRuntimeLocalChange(): void {
    void this.localDrafts.saveCurrentDraft();
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
    this.waitDialog.set({
      title: '正在加载历史版本...',
      description: '正在读取远程历史、归档版本和本地恢复记录。',
    });
    try {
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
    } finally {
      this.waitDialog.set(null);
    }
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

  protected locatorActions(): LocatorAction[] {
    if (!this.runtime.currentFile) return [];
    const mainTab = String(this.runtime.ui['mainTab'] || 'panoramaWorkbench');
    const processView = String(this.runtime.ui['procDiagramMode'] || '').trim() === 'linear' ? 'summary' : 'swimlane';
    const actions: LocatorAction[] = [{
      id: 'view',
      label: '复制当前视图链接',
      params: { tab: this.locatorTabFromMainTab(mainTab) },
      testId: 'context-copy-view-link',
    }];
    const procId = String(this.runtime.ui['procId'] || '').trim();
    const taskId = String(this.runtime.ui['taskId'] || '').trim();
    if (mainTab === 'processWorkbench' || procId || taskId) {
      if (procId) {
        actions.push({
          id: 'process',
          label: '复制当前流程链接',
          params: { tab: 'process', proc: procId, view: processView },
          testId: 'context-copy-process-link',
        });
      }
      if (procId && taskId) {
        actions.push({
          id: 'node',
          label: '复制当前节点链接',
          params: { tab: 'process', proc: procId, task: taskId, view: processView },
          testId: 'context-copy-node-link',
        });
      }
    }
    const entityId = String(this.runtime.ui['entityId'] || '').trim();
    if (entityId) {
      actions.push({
        id: 'entity',
        label: '复制当前实体链接',
        params: { tab: 'data', entity: entityId },
        testId: 'context-copy-entity-link',
      });
    }
    if (this.runtime.readOnly && this.runtime.doc?.meta?.version_id) {
      actions.push({
        id: 'readonly-version',
        label: '复制当前只读版本链接',
        params: { tab: this.locatorTabFromMainTab(mainTab) },
        testId: 'context-copy-readonly-version-link',
      });
    }
    return actions;
  }

  protected async copyLocatorAction(action: LocatorAction): Promise<void> {
    const copied = await this.copyLocatorUrl(this.buildLocatorUrl(action.params));
    this.activeDropdown.set('');
    this.locatorMenu.set(null);
    this.showToast(copied ? `已复制${action.label.replace(/^复制/, '')}` : '链接复制失败，请手动复制', copied ? 'success' : 'error');
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

  protected async openAiAssistant(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档');
      return;
    }
    this.activeDropdown.set('');
    await this.runBusy(async () => {
      const handoff = await this.api.createAgentHandoff(this.buildAgentHandoffPayload());
      const handoffId = String(handoff?.handoffId || '').trim();
      if (!handoffId) throw new Error('Easy Agent handoff 创建失败');
      const url = new URL('http://127.0.0.1:8088/');
      url.searchParams.set('plugin', 'blm-agent-plugin');
      url.searchParams.set('source', 'blm');
      url.searchParams.set('handoffId', handoffId);
      window.open(url.toString(), '_blank', 'noopener');
    });
  }

  private buildAgentHandoffPayload(): AgentHandoffPayload {
    const doc = this.runtime.doc || {};
    const user = this.collaboration.currentUser();
    return {
      sourceApp: 'blm',
      workspaceId: String(doc?.meta?.space || '').trim(),
      documentId: this.runtime.currentFile,
      currentRoute: this.router.url || window.location.pathname + window.location.search,
      selectedBusinessObject: this.currentBusinessObjectSelection(),
      currentPageTitle: this.currentDocumentLabel(),
      pluginId: 'blm-agent-plugin',
      user: {
        id: String(user.id || '').trim() || 'anonymous',
        name: String(user.name || '').trim() || 'agent',
      },
      documentSummary: this.documentSummary(doc),
    };
  }

  private currentBusinessObjectSelection(): Record<string, unknown> {
    const ui = this.runtime.ui || {};
    return {
      mainTab: String(ui['mainTab'] || 'panoramaWorkbench'),
      processId: String(ui['procId'] || ''),
      taskId: String(ui['taskId'] || ''),
      entityId: String(ui['entityId'] || ''),
      applicationServiceId: String(ui['applicationServiceUid'] || ui['applicationServiceId'] || ''),
    };
  }

  private documentSummary(doc: any): Record<string, unknown> {
    return {
      title: String(doc?.meta?.title || doc?.meta?.domain || this.runtime.currentFile || ''),
      roles: this.asArray(doc?.roles).length,
      stages: this.asArray(doc?.stages).length,
      processes: this.asArray(doc?.processes).length,
      entities: this.asArray(doc?.entities).length,
      businessComponents: this.asArray(doc?.businessComponents).length,
      taskDefinitions: this.asArray(doc?.taskDefinitions).length,
      applications: this.asArray(doc?.applications).length,
      applicationServices: this.asArray(doc?.applicationServices).length,
    };
  }

  protected async openCompareDialog(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档');
      return;
    }
    this.activeDropdown.set('');
    await this.refreshWorkspaceFiles();
    this.compareLeftName = this.workspaceFiles().find((file) => file.name !== this.runtime.currentFile)?.name || this.runtime.currentFile;
    this.compareLeftSource = 'current';
    this.compareLeftVersionId = '';
    this.compareRightName = this.runtime.currentFile;
    this.compareRightSource = 'current';
    this.compareRightVersionId = '';
    await this.refreshCompareLeftVersions();
    this.compareRightVersions.set([]);
    this.compareReportMode.set('diff');
    this.compareResult.set(null);
    this.modal.set('compare');
  }

  protected async onCompareLeftNameChanged(): Promise<void> {
    this.compareResult.set(null);
    this.compareLeftVersionId = '';
    await this.refreshCompareLeftVersions();
  }

  protected async onCompareLeftSourceChanged(): Promise<void> {
    this.compareResult.set(null);
    this.compareLeftVersionId = '';
    await this.refreshCompareLeftVersions();
  }

  protected async onCompareRightNameChanged(): Promise<void> {
    this.compareResult.set(null);
    this.compareRightVersionId = '';
    await this.refreshCompareRightVersions();
  }

  protected async onCompareRightSourceChanged(): Promise<void> {
    this.compareResult.set(null);
    this.compareRightVersionId = '';
    await this.refreshCompareRightVersions();
  }

  protected async runCompare(): Promise<void> {
    if (!this.compareLeftName) return;
    if (!this.compareRightName) return;
    if (this.compareLeftSource !== 'current' && !this.compareLeftVersionId) return;
    if (this.compareRightSource !== 'current' && !this.compareRightVersionId) return;
    this.waitDialog.set({
      title: '正在比对文档...',
      description: '正在加载两侧文档并生成业务模型差异摘要。',
    });
    try {
      await this.runBusy(async () => {
        this.compareReportMode.set('diff');
        const [leftLoaded, rightLoaded] = await Promise.all([
          this.loadCompareDocument(
            this.compareLeftName,
            this.compareLeftSource,
            this.compareLeftVersionId,
            this.compareLeftName === this.runtime.currentFile ? this.runtime.doc : null,
          ),
          this.loadCompareDocument(
            this.compareRightName,
            this.compareRightSource,
            this.compareRightVersionId,
            this.compareRightName === this.runtime.currentFile ? this.runtime.doc : null,
          ),
        ]);
        this.compareResult.set(this.buildCompareResult(leftLoaded, rightLoaded));
      });
    } finally {
      this.waitDialog.set(null);
    }
  }

  private async refreshCompareLeftVersions(): Promise<void> {
    const versions = await this.loadCompareOptions(this.compareLeftName, this.compareLeftSource);
    this.compareLeftVersions.set(versions);
    if (!this.compareLeftVersionId) {
      this.compareLeftVersionId = this.compareEntryId(versions[0]);
    }
  }

  private async refreshCompareRightVersions(): Promise<void> {
    const versions = await this.loadCompareOptions(this.compareRightName, this.compareRightSource);
    this.compareRightVersions.set(versions);
    if (!this.compareRightVersionId) {
      this.compareRightVersionId = this.compareEntryId(versions[0]);
    }
  }

  // 模块意图：比对弹窗恢复旧版“左右来源可选”的能力，但仍把后端加载细节封装在壳层 API 边界内。
  // 关键流程：来源切换只刷新候选记录，点击开始比对时才按来源加载两侧文档，避免切换下拉框时产生隐式比对。
  // 边界细节：左侧“当前版本”使用运行时文档以保留未提交编辑态；右侧“当前版本”按工作区文件重新加载，符合跨文档比对语义。
  private async loadCompareDocument(name: string, source: CompareSource, versionId: string, currentDocument?: any): Promise<any> {
    if (source === 'current') {
      if (currentDocument) return currentDocument;
      const loaded = await this.api.load(name);
      return loaded?.document || loaded;
    }
    const loaded = source === 'version'
      ? await this.api.loadVersion(name, versionId)
      : source === 'history'
        ? await this.api.loadHistory(name, versionId)
        : await this.api.loadCollabSubmit(name, versionId);
    return loaded?.document || loaded;
  }

  private async loadCompareOptions(name: string, source: CompareSource): Promise<any[]> {
    if (!name) return [];
    const entries = source === 'history'
      ? await this.api.history(name).catch(() => [])
      : source === 'submit'
        ? ((await this.api.collabSubmits(name).catch(() => ({ submits: [] })))?.submits || [])
        : await this.api.versions(name).catch(() => []);
    return Array.isArray(entries) ? entries : [];
  }

  protected compareEntryId(entry: any): string {
    return String(entry?.id || entry?.version_id || entry?.snapshot_id || entry?.submitId || '');
  }

  protected compareDocumentLabel(side: 'left' | 'right'): string {
    const name = side === 'left' ? this.compareLeftName : this.compareRightName;
    const source = side === 'left' ? this.compareLeftSource : this.compareRightSource;
    const versionId = side === 'left' ? this.compareLeftVersionId : this.compareRightVersionId;
    const sourceLabel: Record<CompareSource, string> = {
      current: '当前版本',
      version: '归档版本',
      history: '历史快照',
      submit: '本地提交',
    };
    return [name || '未选择文档', sourceLabel[source] || source, versionId || (source === 'current' ? '当前' : '未选择版本')].join(' / ');
  }

  protected toggleCompareReportMode(): void {
    this.compareReportMode.set(this.compareReportMode() === 'all' ? 'diff' : 'all');
  }

  protected visibleCompareRows(result: CompareResult): CompareRow[] {
    return this.compareReportMode() === 'all'
      ? result.rows
      : result.rows.filter((row) => row.kind !== '相同');
  }

  protected downloadCompareReport(result: CompareResult): void {
    const markdown = this.compareReportMarkdown(result);
    const filename = `${this.safeDownloadBaseName(this.compareRightName || this.runtime.currentFile || 'compare-report')}-compare-report.md`;
    this.downloadText(markdown, 'text/markdown;charset=utf-8', filename);
  }

  private compareReportMarkdown(result: CompareResult): string {
    const lines: string[] = [
      '# 版本差异说明',
      '',
      '> 新版本相对基线的模型变化。',
      '',
      '## 一、比对范围',
      '',
      `- 基线文档：${this.compareDocumentLabel('left')}`,
      `- 新版本文档：${this.compareDocumentLabel('right')}`,
      '',
      '## 二、变更概览',
      '',
      `- 新增：${result.added}`,
      `- 修改：${result.changed}`,
      `- 删除：${result.removed}`,
      `- 相同：${result.unchanged}`,
      '',
      '## 三、变更说明',
      '',
    ];
    const groups = this.compareGroups(result);
    if (!groups.length) {
      lines.push('没有发现模型差异。', '');
      return lines.join('\n');
    }
    groups.forEach((group) => {
      lines.push(`### ${group.section}`, '');
      this.visibleCompareGroupRows(group).forEach((row, index) => {
        lines.push(`${index + 1}. **${row.kind}** ${row.name}`);
        lines.push(`   - ${row.detail}`);
      });
      if (this.isCompareGroupTruncated(group)) {
        lines.push(`   - 本小节仅导出前 ${this.visibleCompareGroupRows(group).length} 条。`);
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  protected compareGroups(result: CompareResult): CompareGroup[] {
    const groups = new Map<string, CompareRow[]>();
    this.visibleCompareRows(result).forEach((row) => {
      const rows = groups.get(row.section) || [];
      rows.push(row);
      groups.set(row.section, rows);
    });
    return Array.from(groups.entries()).map(([section, rows]) => ({ section, rows }));
  }

  protected visibleCompareGroupRows(group: CompareGroup): CompareRow[] {
    return group.rows.slice(0, 40);
  }

  protected isCompareGroupTruncated(group: CompareGroup): boolean {
    return group.rows.length > this.visibleCompareGroupRows(group).length;
  }

  // 模块意图：把合并结果文档压缩成旧版可读摘要，帮助用户在生成文档前先确认结果轮廓。
  // 关键流程：模板只读取 merged_document，不触发保存、不修正文档，避免预览行为改变合并裁决链路。
  // 边界细节：历史文档可能用 terms 或 language 表达术语，这里只兼容计数展示，不迁移字段。
  protected mergePreviewMetrics(document: any): MergePreviewMetric[] {
    if (!document) return [];
    const terms = Array.isArray(document.terms) ? document.terms : document.language;
    return [
      { label: '标题', value: String(document.meta?.title || '未命名') },
      { label: '业务域', value: String(document.meta?.domain || '') },
      { label: '角色', value: this.arrayCount(document.roles) },
      { label: '流程', value: this.arrayCount(document.processes) },
      { label: '实体', value: this.arrayCount(document.entities) },
      { label: '任务', value: this.arrayCount(document.taskDefinitions) },
      { label: '术语', value: this.arrayCount(terms) },
    ];
  }

  private arrayCount(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
  }

  protected hasMergeValidationIssues(analysis: MergeAnalysis): boolean {
    return Boolean((analysis.validation_issues || []).length);
  }

  protected hasMergeConflicts(analysis: MergeAnalysis): boolean {
    return Boolean((analysis.conflicts || []).length);
  }

  // 模块意图：Shell 恢复旧版“左右文档合并”的入口、前置检查、冲突裁决和生成文档反馈。
  // 关键流程：选择左右文档 -> 加载两侧文档 -> 调用后端分析/应用接口 -> 在弹窗展示冲突、校验和保存结果。
  // 边界细节：左侧选中当前打开文档时使用 runtime.doc，保留未保存编辑态；其他文档从工作区重新加载。
  protected mergeValidationFix(issue: any): MergeValidationFixView {
    const path = String(issue?.path || '');
    if (/^stageFlowLinks\./.test(path)) {
      return {
        kind: 'stage_flow_link',
        group: 'auto',
        title: '阶段流程连线失效',
        recommendation: '删除这条失效连线，保留其他合并结果。',
        actionLabel: '删除连线',
      };
    }
    if (/^stageFlowRefs\./.test(path)) {
      return {
        kind: 'stage_flow_ref',
        group: 'auto',
        title: '阶段流程引用失效',
        recommendation: '删除这条失效引用及相关连线，保留其他合并结果。',
        actionLabel: '删除引用',
      };
    }
    if (/^stages\.[^.]+\.processLinks\./.test(path)) {
      return {
        kind: 'stage_process_link',
        group: 'auto',
        title: '阶段内流程连线失效',
        recommendation: '删除这条阶段内失效连线，保留阶段和流程内容。',
        actionLabel: '删除连线',
      };
    }
    if (/^relations\./.test(path)) {
      return {
        kind: 'relation',
        group: 'auto',
        title: '实体关系失效',
        recommendation: '删除这条引用不存在实体的关系，保留实体定义。',
        actionLabel: '删除关系',
      };
    }
    return {
      kind: 'unknown',
      group: 'manual',
      title: '需要人工确认',
      recommendation: String(issue?.message || issue?.reason || '请检查该问题对应的模型内容。'),
    };
  }

  // 模块意图：恢复旧版合并校验项的最小自动修复能力，让用户能在生成合并文档前处理明确失效的引用。
  // 关键流程：复制 merged_document 草稿 -> 应用本地修复 -> 调用服务端文档校验 -> 用返回结果刷新合并分析区。
  // 边界细节：本轮覆盖明确的删除类修复；修复只作用于弹窗内草稿，不保存工作区文档。
  protected async applyMergeValidationFix(issueIndex: number): Promise<void> {
    const analysis = this.mergeAnalysis();
    const issue = (analysis?.validation_issues || [])[issueIndex];
    if (!analysis || !issue || !analysis.merged_document) return;
    const draft = this.cloneMergeDocument(analysis.merged_document);
    if (!this.applyMergeValidationFixToDocument(draft, issue)) {
      this.showToast('这个校验问题暂时不能自动修复，请手动调整源文档后再试。', 'error');
      return;
    }
    await this.runBusy(async () => {
      const validated = await this.api.validateDocument(draft);
      this.mergeAnalysis.set({
        ...analysis,
        merged_document: validated?.document || draft,
        validation_issues: validated?.validation_issues || [],
        summary: {
          ...(analysis.summary || {}),
          validationIssueCount: (validated?.validation_issues || []).length,
        },
      });
    });
  }

  private applyMergeValidationFixToDocument(document: any, issue: any): boolean {
    const path = String(issue?.path || '');
    const fix = this.mergeValidationFix(issue);
    if (fix.kind === 'stage_flow_link') {
      const token = String(path.split('.')[1] || '').trim();
      if (!token) return false;
      document.stageFlowLinks = (document.stageFlowLinks || []).filter((link: any) => String(link.id || link.uid || '').trim() !== token);
      return true;
    }
    if (fix.kind === 'stage_flow_ref') {
      const token = String(path.split('.')[1] || '').trim();
      if (!token) return false;
      document.stageFlowRefs = (document.stageFlowRefs || []).filter((ref: any) => String(ref.id || ref.uid || '').trim() !== token);
      document.stageFlowLinks = (document.stageFlowLinks || []).filter((link: any) => link.fromRefId !== token && link.toRefId !== token);
      return true;
    }
    if (fix.kind === 'stage_process_link') {
      const parts = path.split('.');
      const stageToken = String(parts[1] || '').trim();
      const linkToken = String(parts[3] || '').trim();
      const stage = this.findMergeItemByToken(document.stages || [], stageToken);
      if (!stage || !linkToken) return false;
      stage.processLinks = (stage.processLinks || []).filter((link: any) => String(link.uid || link.id || '').trim() !== linkToken);
      return true;
    }
    if (fix.kind === 'relation') {
      const token = String(path.split('.')[1] || '').trim();
      if (!token) return false;
      document.relations = (document.relations || []).filter((relation: any) => String(relation.uid || relation.id || '').trim() !== token);
      return true;
    }
    return false;
  }

  private findMergeItemByToken(items: any[], token: string): any {
    const normalized = String(token || '').trim();
    return (items || []).find((item) => (
      String(item?.uid || '').trim() === normalized ||
      String(item?.id || '').trim() === normalized ||
      String(item?.name || '').trim() === normalized
    )) || null;
  }

  private cloneMergeDocument(document: any): any {
    return JSON.parse(JSON.stringify(document || {}));
  }

  protected async openMergeDialog(): Promise<void> {
    if (!this.runtime.currentFile) {
      this.showToast('请先打开文档');
      return;
    }
    this.activeDropdown.set('');
    await this.refreshWorkspaceFiles();
    this.mergeLeftName = this.runtime.currentFile;
    this.mergeRightName = this.workspaceFiles().find((file) => file.name !== this.mergeLeftName)?.name || '';
    this.mergeAnalysis.set(null);
    this.mergeResolutions.set({});
    this.mergeCustomValues.set({});
    this.modal.set('merge');
  }

  protected clearMergeAnalysis(): void {
    this.mergeAnalysis.set(null);
    this.mergeResolutions.set({});
    this.mergeCustomValues.set({});
  }

  protected async runMergeAnalyze(): Promise<void> {
    if (!this.mergeLeftName) return;
    if (!this.mergeRightName) return;
    this.waitDialog.set({
      title: '正在执行合并前检查...',
      description: '正在加载右侧文档，并检查冲突项和模型校验问题。',
    });
    try {
      await this.runBusy(async () => {
        const [leftDocument, rightDocument] = await Promise.all([
          this.loadMergeDocument(this.mergeLeftName),
          this.loadMergeDocument(this.mergeRightName),
        ]);
        const result = await this.api.analyzeMerge({
          left_name: this.mergeLeftName,
          right_name: this.mergeRightName,
          left_document: leftDocument,
          right_document: rightDocument,
        });
        this.mergeAnalysis.set(result || {});
        this.mergeResolutions.set({});
        this.mergeCustomValues.set({});
      });
    } finally {
      this.waitDialog.set(null);
    }
  }

  protected canSaveMergeResult(analysis: MergeAnalysis | null): boolean {
    const conflicts = analysis?.conflicts || [];
    return Boolean(
      analysis?.merged_document &&
      (!conflicts.length || conflicts.every((conflict) => this.mergeResolutions()[String(conflict?.id || '')])) &&
      !(analysis?.validation_issues || []).length,
    );
  }

  protected setMergeResolution(conflictId: string, choice: string): void {
    const key = String(conflictId || '').trim();
    if (!key) return;
    const next = { ...this.mergeResolutions() };
    if (choice) next[key] = choice;
    else delete next[key];
    this.mergeResolutions.set(next);
  }

  protected setMergeCustomValue(conflictId: string, value: string): void {
    const key = String(conflictId || '').trim();
    if (!key) return;
    this.mergeCustomValues.set({ ...this.mergeCustomValues(), [key]: value });
  }

  protected async saveMergeResult(): Promise<void> {
    const analysis = this.mergeAnalysis();
    if (!analysis) {
      this.showToast('请先执行合并前检查');
      return;
    }
    let result = analysis;
    if ((result.conflicts || []).length) {
      result = await this.applyMergeResolutions(result);
      if ((result.conflicts || []).length) {
        this.mergeAnalysis.set(result);
        this.showToast('仍有未解决的冲突项。', 'error');
        return;
      }
    }
    if ((result.validation_issues || []).length) {
      this.showToast('合并结果存在模型校验问题，暂不能生成文档。', 'error');
      return;
    }
    const mergedDocument = result.merged_document;
    if (!mergedDocument) {
      this.showToast('合并检查没有返回可保存的文档。', 'error');
      return;
    }
    const nextName = this.mergeResultName(result);
    mergedDocument.meta = mergedDocument.meta || {};
    mergedDocument.meta.title = nextName;
    mergedDocument.meta.domain = nextName;
    await this.runBusy(async () => {
      const saved = await this.api.save(nextName, mergedDocument, { saveMessage: '通过合并检查生成文档' });
      this.openLoadedDocument(saved?.name || nextName, saved?.document ? saved : { document: mergedDocument });
      this.modal.set('');
      await this.refreshWorkspaceFiles();
      this.showToast('合并文档已生成');
    });
  }

  private async applyMergeResolutions(analysis: MergeAnalysis): Promise<MergeAnalysis> {
    const conflicts = analysis.conflicts || [];
    const selected = this.mergeResolutions();
    const unresolved = conflicts.filter((conflict) => !selected[String(conflict?.id || '')]);
    if (unresolved.length) {
      this.showToast('请先处理所有冲突项，再生成合并文档。', 'error');
      return analysis;
    }
    const customValues = this.mergeCustomValues();
    const resolutions = Object.fromEntries(Object.entries(selected).map(([id, choice]) => [
      id,
      choice === 'custom'
        ? { choice, custom_value: customValues[id] || '' }
        : { choice },
    ]));
    const [leftDocument, rightDocument] = await Promise.all([
      this.loadMergeDocument(this.mergeLeftName),
      this.loadMergeDocument(this.mergeRightName),
    ]);
    const result = await this.api.applyMerge({
      left_name: this.mergeLeftName,
      right_name: this.mergeRightName,
      left_document: leftDocument,
      right_document: rightDocument,
      resolutions,
    });
    this.mergeAnalysis.set(result || analysis);
    return result || analysis;
  }

  private async loadMergeDocument(name: string): Promise<any> {
    if (name === this.runtime.currentFile) return this.runtime.doc;
    const loaded = await this.api.load(name);
    return loaded?.document || loaded;
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
    if (!this.runtime.readOnly) void this.maybePromptLocalDraftRecovery(name, document);
  }

  private async maybePromptLocalDraftRecovery(name: string, serverDocument: any): Promise<void> {
    const draft = await this.localDrafts.findRecoverableDraft(name, serverDocument);
    if (!draft || this.runtime.currentFile !== name || this.runtime.readOnly) return;
    const confirmed = await this.confirmLocalDraftRecovery(draft);
    if (!confirmed) {
      await this.localDrafts.clearDraft(name);
      return;
    }
    if (this.runtime.currentFile !== name || this.runtime.readOnly) return;
    this.localDrafts.applyRecoveredDraft(name, draft);
    this.collaboration.start(name);
    this.runtime.ui['mainTab'] = 'panoramaWorkbench';
    this.refreshShellView();
    void this.router.navigateByUrl('/panorama');
    window.dispatchEvent(new CustomEvent('blm-shell-tabbar-refresh'));
    this.showToast('已恢复本地未提交草稿，请点击“立即同步”提交。', 'success');
  }

  private persistLocalDraftIfNeeded(): void {
    if (!this.runtime.currentFile || this.runtime.readOnly) return;
    if (!this.runtime.modified && !this.runtime.collab.pendingSnapshot) return;
    void this.localDrafts.saveCurrentDraft();
  }

  private confirmLocalDraftRecovery(draft: { updatedAt: string; baseSeq: number }): Promise<boolean> {
    return new Promise((resolve) => {
      const draftSeq = Number(draft.baseSeq || 0);
      const serverSeq = Number(this.runtime.collab.seq || 0);
      const behindInfo = draftSeq < serverSeq
        ? `\n\n注意：草稿基线版本 seq=${draftSeq} 落后于服务端当前版本 seq=${serverSeq}，恢复后会按协作快照流程合并。`
        : '';
      this.confirmDialog.set({
        title: '发现本地草稿',
        message: `检测到当前浏览器存在未同步草稿（${this.localDrafts.formatUpdatedAt(draft.updatedAt)}）。是否恢复草稿？${behindInfo}`,
        confirmLabel: '恢复草稿',
        cancelLabel: '丢弃草稿',
        resolve,
      });
    });
  }

  private mergeResultName(analysis: MergeAnalysis): string {
    return String(
      analysis.suggested_name ||
      analysis.merged_document?.meta?.title ||
      analysis.merged_document?.meta?.domain ||
      `${this.runtime.currentFile || '合并文档'}-合并`,
    ).trim();
  }

  private async openStartupLocatorIfPresent(): Promise<void> {
    const params = this.startupLocatorParams();
    const docName = String(params.get('doc') || '').trim();
    if (!docName) return;
    const at = String(params.get('at') || '').trim();
    this.waitDialog.set({
      title: '正在打开定位链接...',
      description: '正在读取文档并恢复目标工作台位置。',
    });
    try {
      await this.runBusy(async () => {
        const payload = at && at !== 'latest'
          ? await this.api.loadVersion(docName, at.startsWith('version:') ? at.slice('version:'.length) : at)
          : await this.api.load(docName);
        this.openLoadedDocument(docName, payload, Boolean(at && at !== 'latest'));
        this.applyLocatorToRuntime(params);
      });
    } finally {
      this.waitDialog.set(null);
    }
  }

  private startupLocatorParams(): URLSearchParams {
    const url = String(this.router.url || '');
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : window.location.search.replace(/^\?/, '');
    const params = new URLSearchParams(query || '');
    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (hash && !params.has('doc')) {
      const [docPart, queryPart] = hash.split('?');
      if (docPart) params.set('doc', decodeURIComponent(docPart.replace(/^\/+/, '')));
      if (queryPart) {
        const hashParams = new URLSearchParams(queryPart);
        hashParams.forEach((value, key) => {
          if (!params.has(key)) params.set(key, value);
        });
      }
    }
    return params;
  }

  private applyLocatorToRuntime(params: URLSearchParams): void {
    const tab = String(params.get('tab') || '').trim();
    const procId = String(params.get('proc') || params.get('procId') || '').trim();
    const taskId = String(params.get('task') || params.get('taskId') || '').trim();
    const entityId = String(params.get('entity') || params.get('entityId') || '').trim();
    const mainTab = tab === 'process' || procId || taskId
      ? 'processWorkbench'
      : tab === 'data' || entityId
        ? 'constructWorkbench'
        : this.mainTabFromLocatorTab(tab);
    this.runtime.ui['mainTab'] = mainTab;
    if (procId) this.runtime.ui['procId'] = procId;
    if (taskId) this.runtime.ui['taskId'] = taskId;
    if (entityId) this.runtime.ui['entityId'] = entityId;
    if (mainTab === 'processWorkbench') {
      this.runtime.ui['processWorkbenchView'] = taskId ? 'node' : 'flow';
      this.runtime.ui['procView'] = taskId ? 'list' : 'flow';
    }
    this.refreshShellView();
    void this.router.navigateByUrl(routePathFromWorkbenchId(mainTab));
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
    if (this.runtime.currentFile) params.set('doc', this.runtime.currentFile);
    if (this.runtime.readOnly && this.runtime.doc?.meta?.version_id) {
      params.set('at', `version:${this.runtime.doc.meta.version_id}`);
    }
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

  private locatorTabFromMainTab(mainTab: string): string {
    const map: Record<string, string> = {
      panoramaWorkbench: 'domain',
      processWorkbench: 'process',
      constructWorkbench: 'data',
      applicationWorkbench: 'application',
      orchestrationWorkbench: 'orchestration',
      entity: 'entity',
      knowledge: 'knowledge',
      role: 'role',
      preview: 'preview',
    };
    return map[mainTab] || 'domain';
  }

  private mainTabFromLocatorTab(tab: string): string {
    const map: Record<string, string> = {
      domain: 'panoramaWorkbench',
      panorama: 'panoramaWorkbench',
      process: 'processWorkbench',
      data: 'constructWorkbench',
      component: 'constructWorkbench',
      application: 'applicationWorkbench',
      orchestration: 'orchestrationWorkbench',
      entity: 'entity',
      knowledge: 'knowledge',
      role: 'role',
      preview: 'preview',
    };
    return map[tab] || 'panoramaWorkbench';
  }

  private buildCompareResult(leftDocument: any, rightDocument: any): CompareResult {
    const rows: CompareRow[] = [];
    [
      { section: '角色', key: 'roles' },
      { section: '流程', key: 'processes' },
      { section: '实体', key: 'entities' },
      { section: '构件', key: 'businessComponents' },
      { section: '任务', key: 'taskDefinitions' },
    ].forEach((entry) => {
      rows.push(...this.compareCollection(entry.section, leftDocument?.[entry.key], rightDocument?.[entry.key]));
    });
    return {
      added: rows.filter((row) => row.kind === '新增').length,
      removed: rows.filter((row) => row.kind === '删除').length,
      changed: rows.filter((row) => row.kind === '修改').length,
      unchanged: rows.filter((row) => row.kind === '相同').length,
      rows,
    };
  }

  private compareCollection(section: string, leftItems: any[] = [], rightItems: any[] = []): CompareRow[] {
    const left = new Map(this.asArray(leftItems).map((item, index) => [this.compareIdentity(item, index), item]));
    const right = new Map(this.asArray(rightItems).map((item, index) => [this.compareIdentity(item, index), item]));
    const rows: CompareRow[] = [];
    left.forEach((leftItem, id) => {
      const rightItem = right.get(id);
      if (!rightItem) {
        rows.push({ section, kind: '删除', name: this.compareName(leftItem, id), detail: '新版本已移除，基线中存在' });
        return;
      }
      if (this.compareSignature(leftItem) !== this.compareSignature(rightItem)) {
        rows.push({
          section,
          kind: '修改',
          name: this.compareName(rightItem, id),
          detail: `${this.compareName(leftItem, id)} → ${this.compareName(rightItem, id)}`,
        });
        return;
      }
      rows.push({ section, kind: '相同', name: this.compareName(leftItem, id), detail: '基线与新版本一致' });
    });
    right.forEach((rightItem, id) => {
      if (!left.has(id)) {
        rows.push({ section, kind: '新增', name: this.compareName(rightItem, id), detail: '新版本新增，基线中不存在' });
      }
    });
    return rows;
  }

  private downloadText(content: string, type: string, filename: string): void {
    const blob = new Blob([content], { type });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  private safeDownloadBaseName(name: string): string {
    const trimmed = String(name || '').trim().replace(/\.json$/i, '');
    return (trimmed || 'compare-report').replace(/[\\/:*?"<>|]+/g, '-');
  }

  private compareIdentity(item: any, index: number): string {
    return String(item?.uid || item?.id || item?.name || `item-${index}`);
  }

  private compareName(item: any, fallback: string): string {
    return String(item?.name || item?.title || fallback);
  }

  private compareSignature(item: any): string {
    return JSON.stringify(item || {});
  }

  private asArray<T = any>(value: T[] | null | undefined): T[] {
    return Array.isArray(value) ? value : [];
  }

  private defaultCopyDocumentName(name: string): string {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.json')
      ? `${trimmed.slice(0, -5)}-copy.json`
      : `${trimmed}-copy`;
  }
}
