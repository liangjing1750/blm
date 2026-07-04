import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, FeedbackDocument, FeedbackItem } from '../../../core/api/api.service';

const CATEGORIES = ['需求功能', '体验改进', '轻微缺陷', '严重问题'];
const STATUSES = ['待处理', '处理中', '已解决', '已关闭'];
const NEW_FEEDBACK_ATTACHMENT_KEY = '__new__';
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

interface PendingFeedbackAttachment {
  uid: string;
  filename: string;
  size: number;
  contentType: string;
  dataBase64: string;
}

@Component({
  selector: 'app-feedback-workbench',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './feedback-workbench.component.html',
  styleUrl: './feedback-workbench.component.scss',
})
export class FeedbackWorkbenchComponent implements OnInit {
  // 模块意图：复刻旧版“反馈建议”工作区，把筛选、列表、详情和提交动作集中在独立组件内。
  // 关键流程：查询反馈文档 -> 本地筛选分页 -> 通过 /api/feedback 提交 add/message/update。
  // 边界细节：只承接前端交互，不改变 feedback 文档结构；附件上传后续仍走既有 API 扩展。
  protected readonly categories = CATEGORIES;
  protected readonly statuses = STATUSES;
  protected readonly doc = signal<FeedbackDocument>({ items: [] });
  protected readonly loading = signal(false);
  protected readonly statusMessage = signal('');
  protected readonly pendingAttachments = signal<Record<string, PendingFeedbackAttachment[]>>({});
  protected readonly uploading = signal<Record<string, boolean>>({});
  protected readonly ownerFilter = signal<'mine' | 'all'>('mine');
  protected readonly categoryFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly selectedUid = signal('');
  protected readonly creating = signal(false);
  protected readonly page = signal(1);
  protected readonly pageSize = 20;
  protected newCategory = '体验改进';
  protected newTitle = '';
  protected newDescription = '';
  protected replyContent = '';

  protected readonly items = computed(() => this.doc().items || []);
  protected readonly filteredItems = computed(() => {
    const category = this.categoryFilter();
    const status = this.statusFilter();
    const currentUser = this.currentUserName();
    return this.items()
      .filter((item) => {
        const ownerMatched = this.ownerFilter() === 'all' || !currentUser || item.author === currentUser;
        return ownerMatched && (!category || item.category === category) && (!status || (item.status || '待处理') === status);
      })
      .slice()
      .sort((left, right) => this.feedbackSortKey(right).localeCompare(this.feedbackSortKey(left)));
  });
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize)));
  protected readonly pageItems = computed(() => {
    const page = Math.min(Math.max(1, this.page()), this.totalPages());
    return this.filteredItems().slice((page - 1) * this.pageSize, page * this.pageSize);
  });
  protected readonly selectedItem = computed(() => this.items().find((item) => item.uid === this.selectedUid()) || null);

  constructor(private readonly api: ApiService) {}

  protected returnToWork(): void {
    window.dispatchEvent(new CustomEvent('blm-return-to-workbench'));
  }

  async ngOnInit(): Promise<void> {
    await this.loadFeedback();
  }

  protected countByCategory(category: string): number {
    return this.items().filter((item) => item.category === category).length;
  }

  protected countByStatus(status: string): number {
    return this.items().filter((item) => (item.status || '待处理') === status).length;
  }

  protected selectItem(uid: string): void {
    this.selectedUid.set(uid);
    this.creating.set(false);
    this.replyContent = '';
  }

  protected openCreate(): void {
    this.creating.set(true);
    this.selectedUid.set('');
    this.newCategory = '体验改进';
    this.newTitle = '';
    this.newDescription = '';
    this.statusMessage.set('');
  }

  protected setPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  protected cardSummary(item: FeedbackItem): string {
    return item.description || item.messages?.[0]?.content || '暂无说明';
  }

  protected formatTime(value?: string): string {
    if (!value) return '';
    return value.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');
  }

  protected async createFeedback(): Promise<void> {
    const title = this.newTitle.trim();
    if (!title) {
      this.statusMessage.set('请先填写反馈标题。');
      return;
    }
    const uid = this.createLocalUid('fb');
    const saved = await this.saveFeedback({
      action: 'add',
      data: {
        uid,
        category: this.newCategory,
        title,
        description: this.newDescription.trim(),
      },
    }, '反馈已提交。');
    if (saved) {
      const created = saved.items?.find((item) => item.uid === uid);
      await this.uploadPendingAttachments(uid, created?.messages?.[0]?.uid || '', NEW_FEEDBACK_ATTACHMENT_KEY);
    }
    this.creating.set(false);
  }

  protected async sendReply(item: FeedbackItem): Promise<void> {
    const content = this.replyContent.trim();
    if (!content) {
      this.statusMessage.set('请先填写对话内容。');
      return;
    }
    const saved = await this.saveFeedback({
      action: 'reply',
      uid: item.uid,
      data: {
        reply: content,
        status: '',
      },
    }, '对话已发送。');
    if (!saved) return;
    const savedItem = saved.items?.find((entry) => entry.uid === item.uid);
    const messages = savedItem?.messages || [];
    const messageUid = messages[messages.length - 1]?.uid || '';
    await this.uploadPendingAttachments(item.uid, messageUid, this.replyDraftKey(item.uid));
    this.replyContent = '';
  }

  protected async updateItem(item: FeedbackItem): Promise<void> {
    await this.saveFeedback({
      action: 'update',
      uid: item.uid,
      data: {
        category: item.category,
        status: item.status,
      },
    }, '反馈状态已更新。');
  }

  protected replyDraftKey(uid: string): string {
    return `__message__${uid}`;
  }

  protected pendingFor(key: string): PendingFeedbackAttachment[] {
    return this.pendingAttachments()[key] || [];
  }

  protected attachmentUrl(itemUid: string, attachment: Record<string, unknown>): string {
    return this.api.feedbackAttachmentUrl(itemUid, String(attachment['uid'] || ''));
  }

  protected attachmentName(attachment: Record<string, unknown>): string {
    return String(attachment['filename'] || attachment['name'] || 'attachment');
  }

  protected isImageAttachment(attachment: Record<string, unknown>): boolean {
    const contentType = String(attachment['contentType'] || '').toLowerCase();
    return contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(this.attachmentName(attachment));
  }

  protected async pasteFeedbackAttachments(event: ClipboardEvent, key: string): Promise<void> {
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault();
    await this.queueFeedbackFiles(key, files);
  }

  protected async onAttachmentInput(key: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    await this.queueFeedbackFiles(key, Array.from(input?.files || []));
    if (input) input.value = '';
  }

  protected removePendingAttachment(key: string, attachmentUid: string): void {
    const pending = { ...this.pendingAttachments() };
    pending[key] = (pending[key] || []).filter((entry) => entry.uid !== attachmentUid);
    this.pendingAttachments.set(pending);
  }

  private async loadFeedback(): Promise<void> {
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      const doc = await this.api.feedback();
      this.doc.set(doc || { items: [] });
      const first = this.filteredItems()[0] || this.items()[0];
      if (first?.uid && !this.selectedUid()) this.selectedUid.set(first.uid);
    } catch (error) {
      this.statusMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async saveFeedback(payload: Record<string, unknown>, message: string): Promise<FeedbackDocument | null> {
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      const saved = await this.api.saveFeedback({
        user: { name: this.currentUserName() },
        ...payload,
      });
      this.doc.set(saved || { items: [] });
      this.statusMessage.set(message);
      if ((payload['action'] === 'add') && payload['data'] && typeof payload['data'] === 'object') {
        const uid = String((payload['data'] as Record<string, unknown>)['uid'] || '');
        if (uid) this.selectedUid.set(uid);
      }
      return saved || { items: [] };
    } catch (error) {
      this.statusMessage.set(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  private async queueFeedbackFiles(key: string, files: File[]): Promise<void> {
    const entries = await this.readFeedbackAttachmentFiles(files);
    if (!entries.length) return;
    const safeKey = key || NEW_FEEDBACK_ATTACHMENT_KEY;
    const pending = { ...this.pendingAttachments() };
    pending[safeKey] = [...(pending[safeKey] || []), ...entries];
    this.pendingAttachments.set(pending);
    this.statusMessage.set('附件已添加。');
  }

  private async readFeedbackAttachmentFiles(files: File[]): Promise<PendingFeedbackAttachment[]> {
    const result: PendingFeedbackAttachment[] = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        this.statusMessage.set(`附件过大：${file.name || '未命名文件'}，单个附件不能超过 20MB。`);
        continue;
      }
      const dataBase64 = await this.readFileBase64(file);
      if (!dataBase64) {
        this.statusMessage.set(`附件读取失败：${file.name || '未命名文件'}`);
        continue;
      }
      result.push({
        uid: this.createLocalUid('fbatt-local'),
        filename: file.name || 'clipboard-image.png',
        size: Number(file.size || 0),
        contentType: file.type || 'application/octet-stream',
        dataBase64,
      });
    }
    return result;
  }

  private readFileBase64(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  private async uploadPendingAttachments(itemUid: string, messageUid: string, key: string): Promise<void> {
    const entries = this.pendingFor(key);
    if (!itemUid || !messageUid || !entries.length) return;
    this.uploading.set({ ...this.uploading(), [key]: true });
    let latest: FeedbackDocument | null = null;
    try {
      for (const entry of entries) {
        latest = await this.api.uploadFeedbackAttachment({
          uid: itemUid,
          messageUid,
          filename: entry.filename,
          contentType: entry.contentType,
          dataBase64: entry.dataBase64,
          user: { name: this.currentUserName() },
        });
      }
      if (latest) this.doc.set(latest);
      const pending = { ...this.pendingAttachments() };
      pending[key] = [];
      this.pendingAttachments.set(pending);
    } catch (error) {
      this.statusMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.uploading.set({ ...this.uploading(), [key]: false });
    }
  }

  private currentUserName(): string {
    return localStorage.getItem('blm.collab.userName')?.trim() || 'agent';
  }

  private createLocalUid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  }

  private feedbackSortKey(item: FeedbackItem): string {
    return item.updatedAt || item.createdAt || item.uid || '';
  }
}
