import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  ShadingType,
  LevelFormat,
  VerticalMergeType,
} from 'docx';
import { ViewContent } from '../exporters/view-exporter';
import { readPngSize } from '../export-builders';
import { normalizeExportRichText, ExportRichTextBlock } from './rich-text-fragment';

const RICH_TEXT_NUMBERING_REFERENCE = 'export-rich-text-numbering';

interface DocxBuildContext {
  nextOrderedListReference: number;
  orderedListReferences: Set<string>;
}

/**
 * 从 ViewContent 构建 DOCX Blob。
 *
 * @param content   视图结构化内容
 * @param screenshots 截图 PNG 字节数组（按 imageIndex 引用）
 * @returns DOCX 文件的 Blob
 */
export async function buildDocxFragment(
  content: ViewContent,
  screenshots: Uint8Array[] = [],
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];
  const context: DocxBuildContext = {
    nextOrderedListReference: 1,
    orderedListReferences: new Set<string>(),
  };

  for (const section of content.sections) {
    switch (section.type) {
      case 'heading1':
        children.push(
          new Paragraph({
            text: section.text || '',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 360, after: 160, line: 480 },
          }),
        );
        break;

      case 'heading2':
        children.push(
          new Paragraph({
            text: section.text || '',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 280, after: 120, line: 480 },
          }),
        );
        break;

      case 'heading3':
        children.push(
          new Paragraph({
            text: section.text || '',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 80, line: 480 },
          }),
        );
        break;

      case 'heading4':
        children.push(
          new Paragraph({
            text: section.text || '',
            heading: HeadingLevel.HEADING_4,
            spacing: { before: 160, after: 60, line: 420 },
          }),
        );
        break;

      case 'heading5':
        children.push(
          new Paragraph({
            text: section.text || '',
            heading: HeadingLevel.HEADING_5,
            spacing: { before: 140, after: 60, line: 400 },
          }),
        );
        break;

      case 'heading6':
        children.push(
          new Paragraph({
            text: section.text || '',
            heading: HeadingLevel.HEADING_6,
            spacing: { before: 120, after: 50, line: 360 },
          }),
        );
        break;

      case 'heading7':
        children.push(
          new Paragraph({
            text: section.text || '',
            style: 'Heading7',
            spacing: { before: 100, after: 40, line: 340 },
          }),
        );
        break;

      case 'paragraph':
        children.push(
          new Paragraph({
            spacing: { after: 120, line: 360 },
            indent: { firstLine: 420 },
            children: parseInlineText(section.text || ''),
          }),
        );
        break;

      case 'list': {
        const items = section.items || (section.text ? [section.text] : []);
        for (const item of items) {
          children.push(
            new Paragraph({
              text: item,
              bullet: { level: 0 },
              spacing: { after: 60, line: 340 },
            }),
          );
        }
        break;
      }

      case 'table':
        if (section.headers && section.headers.length > 0) {
          children.push(buildTableRows(section.headers, section.rows || [], section.richTextColumns || [], section.columnWidths, section.mergeSameColumns || [], context));
        }
        break;

      case 'image': {
        const idx = section.imageIndex ?? 0;
        if (idx < screenshots.length) {
          let imgW = 1200, imgH = 800;
          try { const s = readPngSize(screenshots[idx]); imgW = s.w; imgH = s.h; } catch {}
          // docx 库 ImageRun.transformation 使用像素，内部自动转 EMU
          const pageWidthPx = Math.round((11906 - 1200 - 1200) / 1440 * 96);
          const cx = pageWidthPx;
          const cy = imgH > 0 ? Math.round(cx * imgH / imgW) : Math.round(cx * 0.75);
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 120 },
              children: [
                new ImageRun({
                  data: screenshots[idx],
                  transformation: { width: cx, height: cy },
                  type: 'png',
                }),
              ],
            }),
          );
        }
        break;
      }
    }
  }

  const doc = new Document({
    numbering: {
      config: Array.from(context.orderedListReferences).map((reference) => orderedListNumberingConfig(reference)),
    },
    styles: {
      default: {
        document: {
          run: {
            font: { name: 'Calibri', eastAsia: '微软雅黑' },
            size: 21, // 10.5pt
            color: '333333',
          },
          paragraph: {
            spacing: { after: 120, line: 360 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1200,
              right: 1200,
            },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/** 构建 DOCX 表格 */
function buildTableRows(
  headers: string[],
  rows: string[][],
  richTextColumns: number[] = [],
  preferredColumnWidths?: number[],
  mergeSameColumns: number[] = [],
  context?: DocxBuildContext,
): Table {
  const richTextColumnSet = new Set(richTextColumns);
  const mergeColumnSet = new Set(mergeSameColumns);
  const totalCols = Math.max(
    headers.length,
    ...rows.map(r => r.length),
  );

  const pad = (arr: string[], n: number) =>
    arr.length >= n ? arr : [...arr, ...Array(n - arr.length).fill('')];
  const columnWidths = preferredColumnWidths?.length === totalCols
    ? preferredColumnWidths
    : tableColumnWidths(totalCols);

  const headerRow = new TableRow({
    tableHeader: true,
    children: pad(headers, totalCols).map((h, columnIndex) =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: '1a3c6e', fill: '1a3c6e' },
        verticalAlign: 'center',
        width: { size: columnWidths[columnIndex], type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, line: 300 },
            children: [new TextRun({ text: h, bold: true, color: 'ffffff', size: 18 })],
          }),
        ],
      }),
    ),
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: pad(row, totalCols).map((c, columnIndex) =>
        buildDataCell({
          value: c,
          rowIndex: ri,
          columnIndex,
          rows,
          columnWidths,
          richTextColumnSet,
          mergeColumnSet,
          context,
        }),
      ),
    }),
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildDataCell(options: {
  value: string;
  rowIndex: number;
  columnIndex: number;
  rows: string[][];
  columnWidths: number[];
  richTextColumnSet: Set<number>;
  mergeColumnSet: Set<number>;
  context?: DocxBuildContext;
}): TableCell {
  const merge = mergeState(options.rows, options.rowIndex, options.columnIndex, options.mergeColumnSet);
  const continued = merge === VerticalMergeType.CONTINUE;
  return new TableCell({
    shading: options.rowIndex % 2 === 1
      ? { type: ShadingType.SOLID, color: 'f0f4fa', fill: 'f0f4fa' }
      : undefined,
    verticalAlign: 'center',
    width: { size: options.columnWidths[options.columnIndex], type: WidthType.PERCENTAGE },
    verticalMerge: merge,
    children: continued
      ? plainTableCellParagraphs('')
      : options.richTextColumnSet.has(options.columnIndex)
        ? richTextToDocxParagraphs(options.value, options.context)
        : plainTableCellParagraphs(options.value),
  });
}

function mergeState(
  rows: string[][],
  rowIndex: number,
  columnIndex: number,
  mergeColumns: Set<number>,
): (typeof VerticalMergeType)[keyof typeof VerticalMergeType] | undefined {
  if (!mergeColumns.has(columnIndex)) return undefined;
  const value = rows[rowIndex]?.[columnIndex] || '';
  if (!value) return undefined;
  const previous = rows[rowIndex - 1]?.[columnIndex] || '';
  const next = rows[rowIndex + 1]?.[columnIndex] || '';
  if (previous === value) return VerticalMergeType.CONTINUE;
  if (next === value) return VerticalMergeType.RESTART;
  return undefined;
}

function orderedListNumberingConfig(reference: string) {
  return {
    reference,
    levels: Array.from({ length: 4 }, (_, level) => ({
      level,
      format: LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      alignment: AlignmentType.LEFT,
      style: {
        paragraph: {
          indent: { left: 420 + level * 360, hanging: 240 },
        },
      },
    })),
  };
}

function tableColumnWidths(totalCols: number): number[] {
  if (totalCols === 2) return [18, 82];
  if (totalCols === 3) return [24, 18, 58];
  if (totalCols === 4) return [50, 18, 15, 17];
  return Array.from({ length: totalCols }, () => Math.floor(100 / Math.max(totalCols, 1)));
}

function plainTableCellParagraphs(value: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { after: 0, line: 300 },
      children: parseInlineText(value || '', { size: 18, color: '333333' }),
    }),
  ];
}

/** 将导出富文本块映射成 DOCX 原生段落，供表格单元格和后续任务导出复用。 */
export function richTextToDocxParagraphs(value: unknown, context?: DocxBuildContext): Paragraph[] {
  const blocks = normalizeExportRichText(value);
  if (!blocks.length) {
    return [new Paragraph({ spacing: { after: 0, line: 300 }, children: [new TextRun({ text: '', size: 18, color: '333333' })] })];
  }
  const listReferences = new Map<number, string>();
  return blocks.map((block) => richTextBlockToParagraph(block, context, listReferences));
}

function richTextBlockToParagraph(
  block: ExportRichTextBlock,
  context: DocxBuildContext | undefined,
  listReferences: Map<number, string>,
): Paragraph {
  const base = {
    spacing: { after: 60, line: 300 },
    children: block.runs.flatMap((run) => parseInlineText(run.bold ? `**${run.text}**` : run.text, { size: 18, color: '333333' })),
  };
  if (block.type === 'paragraph') return new Paragraph(base);
  if (block.ordered) {
    const reference = orderedListReferenceFor(block.listId, listReferences, context);
    return new Paragraph({
      ...base,
      numbering: {
        reference,
        level: Math.min(block.level, 3),
      },
    });
  }
  return new Paragraph({
    ...base,
    bullet: { level: Math.min(block.level, 3) },
    indent: { left: 420 + Math.min(block.level, 3) * 360, hanging: 240 },
  });
}

function orderedListReferenceFor(
  listId: number,
  listReferences: Map<number, string>,
  context?: DocxBuildContext,
): string {
  const existing = listReferences.get(listId);
  if (existing) return existing;
  const reference = context
    ? `${RICH_TEXT_NUMBERING_REFERENCE}-${context.nextOrderedListReference++}`
    : RICH_TEXT_NUMBERING_REFERENCE;
  listReferences.set(listId, reference);
  context?.orderedListReferences.add(reference);
  return reference;
}

/** 解析内联 Markdown（粗体/斜体/代码）为 TextRun 数组 */
function parseInlineText(
  text: string,
  options: { size?: number; color?: string; breakBefore?: boolean } = {},
): TextRun[] {
  if (!text) return [new TextRun({ text: '', size: options.size, color: options.color, break: options.breakBefore ? 1 : undefined })];

  const parts: TextRun[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  let pendingBreak = options.breakBefore;

  const pushRun = (config: ConstructorParameters<typeof TextRun>[0]) => {
    parts.push(new TextRun({
      ...(typeof config === 'string' ? { text: config } : config),
      size: typeof config === 'string' ? options.size : config.size ?? options.size,
      color: typeof config === 'string' ? options.color : config.color ?? options.color,
      break: pendingBreak ? 1 : (typeof config === 'string' ? undefined : config.break),
    }));
    pendingBreak = false;
  };

  while ((match = regex.exec(text)) !== null) {
    // 匹配前的纯文本
    if (match.index > lastEnd) {
      pushRun({ text: text.slice(lastEnd, match.index) });
    }

    if (match[1]) {
      // **bold**
      pushRun({ text: match[1], bold: true });
    } else if (match[2]) {
      // *italic*
      pushRun({ text: match[2], italics: true });
    } else if (match[3]) {
      // `code`
      pushRun({
        text: match[3],
        font: 'Consolas',
        size: 18,
        color: 'd63384',
      });
    }

    lastEnd = regex.lastIndex;
  }

  // 剩余纯文本
  if (lastEnd < text.length) {
    pushRun({ text: text.slice(lastEnd) });
  }

  return parts.length > 0 ? parts : [new TextRun({ text: text || '', size: options.size, color: options.color, break: options.breakBefore ? 1 : undefined })];
}
