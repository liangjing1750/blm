import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, FeedbackDocument, FeedbackItem } from '../../../core/api/api.service';

const CATEGORIES = ['需求功能', '体验改进', '轻微缺陷', '严重问题'];
const STATUSES = ['待处理', '处理中', '已解决', '已关闭'];

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
    await this.saveFeedback({
      action: 'add',
      item: {
        category: this.newCategory,
        status: '待处理',
        title,
        description: this.newDescription.trim(),
        author: this.currentUserName(),
      },
    }, '反馈已提交。');
    this.creating.set(false);
  }

  protected async sendReply(item: FeedbackItem): Promise<void> {
    const content = this.replyContent.trim();
    if (!content) {
      this.statusMessage.set('请先填写对话内容。');
      return;
    }
    await this.saveFeedback({
      action: 'message',
      uid: item.uid,
      message: {
        author: this.currentUserName(),
        content,
      },
    }, '对话已追加。');
    this.replyContent = '';
  }

  protected async updateItem(item: FeedbackItem): Promise<void> {
    await this.saveFeedback({
      action: 'update',
      uid: item.uid,
      patch: {
        category: item.category,
        status: item.status,
      },
    }, '反馈状态已更新。');
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

  private async saveFeedback(payload: Record<string, unknown>, message: string): Promise<void> {
    this.loading.set(true);
    this.statusMessage.set('');
    try {
      const saved = await this.api.saveFeedback({
        user: this.currentUserName(),
        ...payload,
      });
      this.doc.set(saved || { items: [] });
      this.statusMessage.set(message);
      if ((payload['action'] === 'add') && this.items()[0]?.uid) this.selectedUid.set(this.items()[0].uid);
    } catch (error) {
      this.statusMessage.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  private currentUserName(): string {
    return localStorage.getItem('blm.collab.userName')?.trim() || 'agent';
  }

  private feedbackSortKey(item: FeedbackItem): string {
    return item.updatedAt || item.createdAt || item.uid || '';
  }
}
