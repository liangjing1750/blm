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

  @Output() activeTabChange = new EventEmitter<HistoryDialogTab>();
  @Output() openVersion = new EventEmitter<any>();
  @Output() openHistory = new EventEmitter<any>();
  @Output() archiveHistory = new EventEmitter<any>();
  @Output() openSubmit = new EventEmitter<any>();

  selectTab(tab: HistoryDialogTab): void {
    this.activeTabChange.emit(tab);
  }
}
