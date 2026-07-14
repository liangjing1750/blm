import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type HistoryDialogTab = 'remote' | 'local';

@Component({
  selector: 'app-history-dialog',
  imports: [CommonModule],
  templateUrl: './history-dialog.component.html',
  styleUrl: './history-dialog.component.scss',
})
export class HistoryDialogComponent {
  // 模块意图：历史记录弹窗只负责“看”和“触发动作”，避免把密集列表 UI 继续堆在全局 shell。
  // 关键流程：shell 传入归档版本、协作快照和本地提交，组件按当前 tab 渲染并把用户动作向上抛出。
  // 边界细节：这里不直接访问后端，也不改变文档模型；只读打开、归档等修改行为都由上层命令处理。
  @Input() documentLabel = '';
  @Input() activeTab: HistoryDialogTab = 'remote';
  @Input() versionRows: any[] = [];
  @Input() historyRows: any[] = [];
  @Input() submitRows: any[] = [];
  @Input() canLoadMore = false;
  @Input() loadingMore = false;
  @Input() loadingSubmits = false;

  @Output() activeTabChange = new EventEmitter<HistoryDialogTab>();
  @Output() openVersion = new EventEmitter<any>();
  @Output() copyVersionLink = new EventEmitter<any>();
  @Output() openHistory = new EventEmitter<any>();
  @Output() archiveHistory = new EventEmitter<any>();
  @Output() restoreHistory = new EventEmitter<any>();
  @Output() openSubmit = new EventEmitter<any>();
  @Output() restoreSubmit = new EventEmitter<any>();
  @Output() loadMore = new EventEmitter<void>();

  selectTab(tab: HistoryDialogTab): void {
    this.activeTabChange.emit(tab);
  }

  versionTitle(row: any): string {
    const title = String(row?.label || row?.message || row?.id || row?.version_id || '').trim();
    return title.replace(/\s*[（(]\d{4}年\d{2}月\d{2}日\s+\d{2}时\d{2}分\d{2}秒[）)]\s*$/, '').trim() || title;
  }

  versionTime(row: any): string {
    return this.formatDateTime(
      row?.timestamp_label ||
        row?.createdAt ||
        row?.created_at ||
        row?.timestamp ||
        row?.time ||
        row?.date ||
        '',
    );
  }

  historyTime(row: any): string {
    return this.formatDateTime(row?.timestamp_label || row?.timestamp || row?.createdAt || row?.created_at || row?.time || row?.date || row?.id || '');
  }

  historyTitle(row: any): string {
    return String(row?.message || '协作同步').trim();
  }

  historySubmitter(row: any): string {
    const user = String(row?.user || row?.userName || row?.author || '').trim();
    return user ? `提交者：${user}` : '';
  }

  submitTime(row: any): string {
    return this.formatDateTime(row?.createdAt || row?.created_at || row?.timestamp || row?.time || row?.date || row?.submitId || '');
  }

  private formatDateTime(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const cnMatch = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2})时(\d{1,2})分(\d{1,2})秒$/);
    if (cnMatch) {
      const [, year, month, day, hour, minute, second] = cnMatch;
      return this.renderDateTime(year, month, day, hour, minute, second);
    }

    const plainMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (plainMatch) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = plainMatch;
      return this.renderDateTime(year, month, day, hour, minute, second);
    }

    return raw;
  }

  private renderDateTime(year: string, month: string, day: string, hour: string, minute: string, second: string): string {
    const pad = (part: string) => part.padStart(2, '0');
    return `${year}年${pad(month)}月${pad(day)}日 ${pad(hour)}时${pad(minute)}分${pad(second)}秒`;
  }
}
