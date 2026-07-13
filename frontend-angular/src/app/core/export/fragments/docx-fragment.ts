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
import JSZip from 'jszip';
import { ViewContent } from '../exporters/view-exporter';
import { readPngSize } from '../export-builders';
import { normalizeExportRichText, ExportRichTextBlock } from './rich-text-fragment';

const RICH_TEXT_NUMBERING_REFERENCE = 'export-rich-text-numbering';
const OLE_OBJECT_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.oleObject';
const OLE_ICON_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

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
          const pageWidthPx = Math.round((11906 - 1200 - 1200) / 1440 * 96);
          const { width: cx, height: cy } = fitImageToDocxPage(imgW, imgH, pageWidthPx);
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

      case 'attachment':
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 120, line: 320 },
            children: [
              new TextRun({
                text: attachmentMarker(section.attachmentId || section.text || ''),
                color: '1d4ed8',
                underline: {},
              }),
            ],
          }),
        );
        break;
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

  const blob = await patchHeading4Style(await Packer.toBlob(doc));
  return content.attachments?.length && content.sections.some((section) => section.type === 'attachment')
    ? embedAttachments(blob, content)
    : blob;
}

async function patchHeading4Style(blob: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const styles = await zip.file('word/styles.xml')?.async('string');
  if (!styles) return blob;
  const patched = styles.replace(
    /(<w:style[^>]+w:styleId="Heading4"[\s\S]*?<w:rPr>)([\s\S]*?)(<\/w:rPr>)/,
    (_match, start: string, runProps: string, end: string) => {
      const cleanRunProps = runProps
        .replace(/<w:i\/>/g, '')
        .replace(/<w:iCs\/>/g, '')
        .replace(/<w:i\s+w:val="true"\/>/g, '')
        .replace(/<w:iCs\s+w:val="true"\/>/g, '');
      return `${start}${cleanRunProps}<w:i w:val="false"/>${end}`;
    },
  );
  zip.file('word/styles.xml', patched);
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function fitImageToDocxPage(
  imageWidth: number,
  imageHeight: number,
  pageWidthPx: number,
): { width: number; height: number } {
  const safePageWidth = Math.max(1, pageWidthPx);
  const safeImageWidth = imageWidth > 0 ? imageWidth : 1200;
  const safeImageHeight = imageHeight > 0 ? imageHeight : 800;
  const aspectHeight = (width: number) => Math.max(1, Math.round(width * safeImageHeight / safeImageWidth));

  // 模块意图：导出截图在 Word 中按“可读”而不是“铺满”展示，避免少节点流程图被无意义放大。
  // 关键流程：大图压到页宽；小图保持原始宽度；低矮流程图即便接近页宽，也保留更克制的展示宽度。
  // 边界细节：不在这里判断具体视图类型，保证全景图、流程图、角色图共享同一套图片展示约束。
  const smallDiagramMaxWidth = Math.round(safePageWidth * 0.72);
  const looksLikeCompactDiagram = safeImageWidth <= safePageWidth && safeImageHeight <= safePageWidth * 0.75;
  const targetWidth = looksLikeCompactDiagram
    ? Math.min(safeImageWidth, smallDiagramMaxWidth)
    : Math.min(safeImageWidth, safePageWidth);
  return { width: targetWidth, height: aspectHeight(targetWidth) };
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
    const base = {
      ...(typeof config === 'string' ? { text: config } : config),
      size: typeof config === 'string' ? options.size : config.size ?? options.size,
      color: typeof config === 'string' ? options.color : config.color ?? options.color,
      break: pendingBreak ? 1 : (typeof config === 'string' ? undefined : config.break),
    };
    const runText = String(base.text || '');
    if (!runText.includes('\n')) {
      parts.push(new TextRun(base));
      pendingBreak = false;
      return;
    }
    const segments = runText.replace(/\r\n?/g, '\n').split('\n');
    segments.forEach((segment, index) => {
      parts.push(new TextRun({
        ...base,
        text: segment,
        break: index === 0 ? base.break : 1,
      }));
    });
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

function attachmentMarker(id: string): string {
  return `__BLM_ATTACHMENT_${id}__`;
}

async function embedAttachments(blob: Blob, content: ViewContent): Promise<Blob> {
  const attachments = content.attachments || [];
  if (!attachments.length) return blob;

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const relsPath = 'word/_rels/document.xml.rels';
  const contentTypesPath = '[Content_Types].xml';
  let documentXml = await zip.file('word/document.xml')?.async('string') || '';
  let relsXml = await zip.file(relsPath)?.async('string') || '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  let contentTypesXml = await zip.file(contentTypesPath)?.async('string') || '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>';

  documentXml = ensureOleNamespaces(documentXml);
  contentTypesXml = ensureDefaultContentType(contentTypesXml, 'bin', OLE_OBJECT_CONTENT_TYPE);
  contentTypesXml = ensureDefaultContentType(contentTypesXml, 'png', 'image/png');

  for (const [index, attachment] of attachments.entries()) {
    const objectIndex = index + 1;
    const objectRelId = `rOleObject${objectIndex}`;
    const iconRelId = `rOleIcon${objectIndex}`;
    const objectFileName = `oleObject${objectIndex}.bin`;
    const iconFileName = `oleIcon${objectIndex}.png`;
    const objectTarget = `embeddings/${objectFileName}`;
    const iconTarget = `media/${iconFileName}`;
    zip.file(`word/embeddings/${objectFileName}`, await createOlePackage(attachment.name, attachment.data));
    zip.file(`word/media/${iconFileName}`, base64ToBytes(OLE_ICON_PNG));

    if (!relsXml.includes(`Id="${objectRelId}"`)) {
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${objectRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="${xmlEscape(objectTarget)}"/></Relationships>`,
      );
    }
    if (!relsXml.includes(`Id="${iconRelId}"`)) {
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${iconRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${xmlEscape(iconTarget)}"/></Relationships>`,
      );
    }

    const marker = attachmentMarker(attachment.id);
    const escapedMarker = xmlEscape(marker);
    const objectXml = [
      `<w:r><w:t>${xmlEscape(`附件：${attachment.name}`)}</w:t></w:r>`,
      '<w:r><w:object w:dxaOrig="1520" w:dyaOrig="1058">',
      '<v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f">',
      '<v:stroke joinstyle="miter"/>',
      '<v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/><v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/><v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/><v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/></v:formulas>',
      '<v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/>',
      '<o:lock v:ext="edit" aspectratio="t"/></v:shapetype>',
      `<v:shape id="_x0000_i${1024 + objectIndex}" type="#_x0000_t75" style="width:76pt;height:53pt" o:ole="">`,
      `<v:imagedata r:id="${iconRelId}" o:title=""/></v:shape>`,
      `<o:OLEObject Type="Embed" ProgID="Package" ShapeID="_x0000_i${1024 + objectIndex}" DrawAspect="Icon" ObjectID="_blm_attachment_${objectIndex}" r:id="${objectRelId}"/>`,
      '</w:object></w:r>',
    ].join('');
    documentXml = documentXml.replace(new RegExp(`<w:r[^>]*>(?:(?!</w:r>).)*<w:t[^>]*>${escapeRegExp(escapedMarker)}</w:t>(?:(?!</w:r>).)*</w:r>`, 'g'), objectXml);
    documentXml = documentXml.replace(escapedMarker, xmlEscape(`附件：${attachment.name}`));
  }

  zip.file('word/document.xml', documentXml);
  zip.file(relsPath, relsXml);
  zip.file(contentTypesPath, contentTypesXml);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new Blob([uint8ToArrayBuffer(bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function ensureOleNamespaces(documentXml: string): string {
  let xml = documentXml;
  if (!xml.includes('xmlns:o=')) {
    xml = xml.replace('<w:document ', '<w:document xmlns:o="urn:schemas-microsoft-com:office:office" ');
  }
  if (!xml.includes('xmlns:v=')) {
    xml = xml.replace('<w:document ', '<w:document xmlns:v="urn:schemas-microsoft-com:vml" ');
  }
  return xml;
}

function ensureDefaultContentType(contentTypesXml: string, extension: string, contentType: string): string {
  if (contentTypesXml.includes(`Extension="${extension}"`)) return contentTypesXml;
  return contentTypesXml.replace(
    '</Types>',
    `<Default Extension="${extension}" ContentType="${xmlEscape(contentType)}"/></Types>`,
  );
}

async function createOlePackage(name: string, data: Uint8Array): Promise<Uint8Array> {
  const CFB = await import('cfb');
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '\u0001CompObj', hexToBytes('0100feff030a0000ffffffff0c00030000000000c0000000000000460c0000004f4c45205061636b6167650000000000080000005061636b61676500f439b271'));
  CFB.utils.cfb_add(cfb, '\u0003ObjInfo', new Uint8Array([0x40, 0x00, 0x03, 0x00, 0x01, 0x00]));
  CFB.utils.cfb_add(cfb, '\u0001Ole10Native', createOle10NativeStream(name, data));
  const bytes = CFB.write(cfb, { type: 'array', fileType: 'cfb' }) as number[] | Uint8Array;
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function createOle10NativeStream(name: string, data: Uint8Array): Uint8Array {
  const fileName = safeOleFileName(name);
  const fileNameBytes = nullTerminatedUtf8(fileName);
  const sourcePathBytes = nullTerminatedUtf8(fileName);
  const tempPathBytes = nullTerminatedUtf8(fileName);
  const payloadSize = 2 + fileNameBytes.length + sourcePathBytes.length + 4 + tempPathBytes.length + 4 + data.length;
  return concatBytes(
    le32(payloadSize),
    le16(2),
    fileNameBytes,
    sourcePathBytes,
    le32(0x00030000),
    tempPathBytes,
    le32(data.length),
    data,
  );
}

function safeOleFileName(name: string): string {
  const safe = safeAttachmentFileName(0, name).replace(/^0-/, '');
  return safe || 'attachment.bin';
}

function safeAttachmentFileName(index: number, name: string): string {
  const base = String(name || `attachment-${index}`)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || `attachment-${index}`;
  return `${index}-${base}`;
}

function xmlEscape(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(value.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function nullTerminatedUtf8(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  return concatBytes(encoded, new Uint8Array([0]));
}

function le16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function le32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
