/** 视图导出器接口 — 每个视图实现此接口，导出逻辑统一 */
export interface ViewExporter {
  /** 导出项标题，用于命名文件 */
  readonly label: string;

  /** 截图：截取特定 DOM 区域 → PNG 字节 */
  capture(): Promise<Uint8Array>;

  /** 可选：截取多张截图（优先级高于 capture），索引与 getContent 的 imageIndex 对应 */
  captureAll?(onProgress?: (done: number, total: number, label?: string) => void): Promise<Uint8Array[]>;

  /** 结构化 Markdown 文本（旧接口，逐步迁移到 getContent） */
  toMarkdown(): string;

  /** 结构化视图内容（新接口，供 DOCX 和 MD 双通道消费） */
  getContent(): ViewContent;
}

/** 视图的结构化内容 */
export interface ViewContent {
  title: string;
  sections: ViewSection[];
}

/** 内容片段类型 */
export type ViewSectionType = 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' | 'heading7' | 'paragraph' | 'list' | 'table' | 'image';

/** 内容片段 */
export interface ViewSection {
  type: ViewSectionType;
  text?: string;
  headers?: string[];  // table 专用：表头行
  rows?: string[][];   // table 专用：数据行
  richTextColumns?: number[]; // table 专用：这些列保留预览富文本 HTML，由导出通道分别渲染
  columnWidths?: number[]; // table 专用：DOCX 百分比列宽
  mergeSameColumns?: number[]; // table 专用：相邻同值单元格在 DOCX 中纵向合并
  items?: string[];     // list 专用：列表项
  imageIndex?: number;  // image 专用，引用 screenshots 数组中的索引
}
