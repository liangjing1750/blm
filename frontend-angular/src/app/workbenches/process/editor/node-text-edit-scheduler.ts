/**
 * 模块意图：把节点文本输入与文档级变更提交解耦，避免每个字符都触发全局刷新。
 */
export class NodeTextEditScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingCommit: (() => void) | null = null;

  /**
   * 关键流程：连续输入只保留最后一次定时任务，停止输入后统一提交一次。
   */
  schedule(commit: () => void, delay = 350): void {
    this.cancel();
    this.pendingCommit = commit;
    this.timer = setTimeout(() => {
      this.timer = null;
      const pending = this.pendingCommit;
      this.pendingCommit = null;
      pending?.();
    }, delay);
  }

  /**
   * 关键流程：离开节点或流程前立即落下最后一次输入，再清理原上下文的延迟任务。
   */
  flush(): void {
    const pending = this.pendingCommit;
    this.cancel();
    pending?.();
  }

  /**
   * 边界细节：结构性操作、节点切换和组件销毁前必须清理延迟任务，避免旧输入晚到。
   */
  cancel(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.pendingCommit = null;
  }
}
