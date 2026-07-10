/** 视图导出器接口 — 每个视图实现此接口，导出逻辑统一 */
export interface ViewExporter {
  /** 导出项标题，用于命名文件 */
  readonly label: string;

  /** 截图：截取特定 DOM 区域 → PNG 字节 */
  capture(): Promise<Uint8Array>;

  /** 结构化 Markdown 文本 */
  toMarkdown(): string;
}
