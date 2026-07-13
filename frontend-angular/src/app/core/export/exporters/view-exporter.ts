/** 视图导出器接口：每个视图实现此接口，导出逻辑统一消费。 */
export interface ViewExporter {
  /** 导出项标题，用于命名文件。 */
  readonly label: string;

  /** 截图：截取特定 DOM 区域为 PNG 字节。 */
  capture(): Promise<Uint8Array>;

  /** 可选：截取多张截图，索引与 getContent 的 imageIndex 对应。 */
  captureAll?(onProgress?: (done: number, total: number, label?: string) => void): Promise<Uint8Array[]>;

  /** 结构化 Markdown 文本旧接口，逐步迁移到 getContent。 */
  toMarkdown(): string;

  /** 结构化视图内容，供 DOCX 和 MD 双通道消费。 */
  getContent(): ViewContent;

  /** 可选：导出前异步补齐截图以外的外部资源，例如持久化附件二进制。 */
  prepareContent?(): Promise<ViewContent>;
}

/** 视图的结构化内容。 */
export interface ViewContent {
  title: string;
  sections: ViewSection[];
  attachments?: ViewAttachment[];
}

/** 可写入导出文件包的附件二进制。 */
export interface ViewAttachment {
  id: string;
  name: string;
  contentType: string;
  data: Uint8Array;
}

/** 内容片段类型。 */
export type ViewSectionType =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'heading7'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'image'
  | 'attachment';

/** 内容片段。 */
export interface ViewSection {
  type: ViewSectionType;
  text?: string;
  headers?: string[];
  rows?: string[][];
  richTextColumns?: number[];
  columnWidths?: number[];
  mergeSameColumns?: number[];
  items?: string[];
  imageIndex?: number;
  attachmentId?: string;
}
