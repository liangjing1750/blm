// 模块意图：导出所需的底层工具函数 — CRC32、zip 打包、简易 DOCX 生成。
// 与 Angular 无关，可独立测试。

/** CRC32 校验（zip 文件格式需要） */
export function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** 简易 zip 打包（store 模式，无压缩） */
export function buildZip(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const parts: any[] = [];
  let localOffset = 0;
  const centralMeta: Array<{ offset: number; size: number; nameLen: number; crc: number }> = [];

  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const crcVal = crc32(f.data);
    const size = f.data.length;
    // Local file header
    const local = new ArrayBuffer(30 + nameBytes.length);
    const v = new DataView(local);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); v.setUint16(6, 0, true); v.setUint16(8, 0, true);
    v.setUint16(10, 0, true); v.setUint16(12, 0, true);
    v.setUint32(14, crcVal, true);
    v.setUint32(18, size, true); v.setUint32(22, size, true);
    v.setUint16(26, nameBytes.length, true); v.setUint16(28, 0, true);
    new Uint8Array(local).set(nameBytes, 30);
    parts.push(local, f.data);
    centralMeta.push({ offset: localOffset, size, nameLen: nameBytes.length, crc: crcVal });
    localOffset += 30 + nameBytes.length + size;
  }

  // Central directory — collect all entries and track total size
  const centralStart = localOffset;
  let centralSize = 0;
  for (const m of centralMeta) {
    const f = files[centralMeta.indexOf(m)];
    const nameBytes = encoder.encode(f.name);
    const entryLen = 46 + nameBytes.length;
    const entry = new ArrayBuffer(entryLen);
    const ev = new DataView(entry);
    ev.setUint32(0, 0x02014b50, true);
    ev.setUint16(4, 20, true); ev.setUint16(6, 20, true);
    ev.setUint16(8, 0, true); ev.setUint16(10, 0, true);
    ev.setUint16(12, 0, true); ev.setUint16(14, 0, true);
    ev.setUint32(16, m.crc, true);
    ev.setUint32(20, m.size, true); ev.setUint32(24, m.size, true);
    ev.setUint16(28, m.nameLen, true); ev.setUint16(30, 0, true);
    ev.setUint16(32, 0, true); ev.setUint16(34, 0, true);
    ev.setUint16(36, 0, true); ev.setUint32(38, 0, true);
    ev.setUint32(42, m.offset, true);
    new Uint8Array(entry).set(nameBytes, 46);
    parts.push(entry);
    centralSize += entryLen;
  }

  // End of central directory
  const eocd = new ArrayBuffer(22);
  const ev2 = new DataView(eocd);
  ev2.setUint32(0, 0x06054b50, true);
  ev2.setUint16(4, 0, true); ev2.setUint16(6, 0, true);
  ev2.setUint16(8, files.length, true); ev2.setUint16(10, files.length, true);
  ev2.setUint32(12, centralSize, true);
  ev2.setUint32(16, centralStart, true);
  ev2.setUint16(20, 0, true);
  parts.push(eocd);
  return new Blob(parts, { type: 'application/zip' });
}

/** 从 PNG 字节中读取实际像素尺寸 */
export function readPngSize(bytes: Uint8Array): { w: number; h: number } {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return { w: 1200, h: 800 };
  const v = (off: number) => (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
  return { w: v(16), h: v(20) };
}

/** 生成仅含一张图片的简易 DOCX（图片自适应页面宽度，按实际像素等比缩放） */
export function buildSimpleDocx(pngBytes: Uint8Array, filename = 'snapshot'): Blob {
  const encoder = new TextEncoder();
  const img = readPngSize(pngBytes);
  // A4 页面：宽 11906 twips，左右边距各 720 twips，内容区宽度 = 10466 twips
  // 1 twip = 635 EMU（1 inch = 914400 EMU，1 inch = 1440 twips）
  const maxW = (11906 - 720 - 720) * 635;
  const cx = maxW;
  const cy = img.h > 0 ? Math.round(cx * img.h / img.w) : Math.round(cx * 800 / 1200);

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body><w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="image.png"/>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image.png"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
</w:body></w:document>`;

  return buildZip([
    { name: 'word/document.xml', data: encoder.encode(doc) },
    { name: `word/media/${filename}.png`, data: pngBytes },
    { name: '[Content_Types].xml', data: encoder.encode(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>') },
    { name: '_rels/.rels', data: encoder.encode(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>') },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + filename + '.png"/>' +
      '</Relationships>') },
  ]);
}

// ── 富文本 DOCX 构建器 ──

/**
 * DOCX 内容块类型。
 * - title/heading1-3/paragraph/list: 文本块，用 text 指定内容
 * - image: 图片块，用 imageData/imageName 指定
 */
export interface DocxBlock {
  type: 'title' | 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'list' | 'image';
  text?: string;
  imageData?: Uint8Array;
  imageName?: string;
}

const FONT_LATIN = 'Calibri';
const FONT_CJK = '微软雅黑';
const FONT_CODE = 'Consolas';
const COLOR_BODY = '333333';
const COLOR_CODE = 'd63384';
const COLOR_H1 = '1a3c6e';
const COLOR_H2 = '2c5f8a';
const COLOR_H3 = '3d7ab5';
const COLOR_TITLE = '1a3c6e';

/** 将 HTML 特殊字符转义为 XML 实体 */
function esc(text: string): string {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 去除 null 字符 */
function clean(text: string): string {
  return String(text).replace(/\x00/g, '');
}

/**
 * 内联 Markdown 解析正则：**粗体** *斜体* `代码`
 */
const INLINE_RE = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;

/** 将内联 Markdown 转换为一组 Word <w:r> 片段 */
function richTextRuns(text: string): string {
  const runs: string[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastEnd) {
      runs.push(plainRun(text.slice(lastEnd, match.index)));
    }
    if (match[1]) {
      runs.push(boldRun(match[1]));
    } else if (match[2]) {
      runs.push(italicRun(match[2]));
    } else if (match[3]) {
      runs.push(codeRun(match[3]));
    }
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < text.length) {
    runs.push(plainRun(text.slice(lastEnd)));
  }
  if (runs.length === 0) {
    runs.push(plainRun(text));
  }
  return runs.join('');
}

function plainRun(text: string): string {
  return `<w:r><w:t xml:space="preserve">${esc(clean(text))}</w:t></w:r>`;
}

function boldRun(text: string): string {
  return `<w:r><w:rPr><w:b/><w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}"/></w:rPr><w:t xml:space="preserve">${esc(clean(text))}</w:t></w:r>`;
}

function italicRun(text: string): string {
  return `<w:r><w:rPr><w:i/><w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}"/></w:rPr><w:t xml:space="preserve">${esc(clean(text))}</w:t></w:r>`;
}

function codeRun(text: string): string {
  return `<w:r><w:rPr><w:rFonts w:ascii="${FONT_CODE}" w:hAnsi="${FONT_CODE}" w:eastAsia="${FONT_CODE}"/><w:sz w:val="18"/><w:color w:val="${COLOR_CODE}"/></w:rPr><w:t xml:space="preserve">${esc(clean(text))}</w:t></w:r>`;
}

/** 根据块类型生成段落 XML */
function paragraphXml(block: DocxBlock): string {
  const style = block.type;
  const text = block.text || '';

  const ppr: string[] = [];

  switch (style) {
    case 'title':
      ppr.push('<w:pStyle w:val="Title"/>');
      ppr.push('<w:jc w:val="center"/>');
      ppr.push('<w:spacing w:after="360"/>');
      break;
    case 'heading1':
      ppr.push('<w:pStyle w:val="Heading1"/>');
      ppr.push('<w:spacing w:before="360" w:after="160" w:line="480" w:lineRule="auto"/>');
      ppr.push('<w:outlineLvl w:val="0"/>');
      break;
    case 'heading2':
      ppr.push('<w:pStyle w:val="Heading2"/>');
      ppr.push('<w:spacing w:before="280" w:after="120" w:line="480" w:lineRule="auto"/>');
      ppr.push('<w:outlineLvl w:val="1"/>');
      break;
    case 'heading3':
      ppr.push('<w:pStyle w:val="Heading3"/>');
      ppr.push('<w:spacing w:before="200" w:after="80" w:line="480" w:lineRule="auto"/>');
      ppr.push('<w:outlineLvl w:val="2"/>');
      break;
    case 'paragraph':
      ppr.push('<w:pStyle w:val="Body"/>');
      ppr.push('<w:spacing w:after="120" w:line="360" w:lineRule="auto"/>');
      ppr.push('<w:ind w:firstLine="420"/>');
      break;
    case 'list':
      ppr.push('<w:pStyle w:val="ListParagraph"/>');
      ppr.push('<w:spacing w:after="80" w:line="340" w:lineRule="auto"/>');
      ppr.push('<w:ind w:left="720" w:hanging="360"/>');
      break;
  }

  const pprXml = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : '';
  const runs = richTextRuns(text);
  return `<w:p>${pprXml}${runs}</w:p>`;
}

/** 生成图片段落 XML */
function imageParagraphXml(relId: string, imageData: Uint8Array, imageName: string): string {
  const img = readPngSize(imageData);
  const maxW = (11906 - 1200 - 1200) * 635; // twips → EMU
  const cx = maxW;
  const cy = img.h > 0 ? Math.round(cx * img.h / img.w) : Math.round(cx * 800 / 1200);
  const name = esc(imageName || 'image');
  return (
    '<w:p>' +
    '<w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>' +
    '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="${name}"/>` +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="' + name + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' + esc(relId) + '"/><a:stretch><a:fillRect/></a:stretch>' +
    '</pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/>' +
    `<a:ext cx="${cx}" cy="${cy}"/>` +
    '</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '</pic:spPr></pic:pic></a:graphicData></a:graphic>' +
    '</wp:inline></w:drawing></w:r></w:p>'
  );
}

/** 生成完整的 styles.xml */
function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr>
  <w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}" w:cs="${FONT_LATIN}"/>
  <w:sz w:val="21"/><w:szCs w:val="21"/>
  <w:lang w:val="en-US" w:eastAsia="zh-CN"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:styleId="Body" w:default="1">
  <w:name w:val="Normal"/>
  <w:rPr><w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}"/><w:color w:val="${COLOR_BODY}"/><w:sz w:val="21"/></w:rPr>
  <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Title">
  <w:name w:val="Title"/>
  <w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/><w:color w:val="${COLOR_TITLE}"/><w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}"/></w:rPr>
  <w:pPr><w:spacing w:after="360"/><w:jc w:val="center"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading1">
  <w:name w:val="heading 1"/>
  <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="${COLOR_H1}"/><w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}"/></w:rPr>
  <w:pPr><w:spacing w:before="360" w:after="160" w:line="480" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading2">
  <w:name w:val="heading 2"/>
  <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="${COLOR_H2}"/><w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}"/></w:rPr>
  <w:pPr><w:spacing w:before="280" w:after="120" w:line="480" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading3">
  <w:name w:val="heading 3"/>
  <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="${COLOR_H3}"/><w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}"/></w:rPr>
  <w:pPr><w:spacing w:before="200" w:after="80" w:line="480" w:lineRule="auto"/><w:outlineLvl w:val="2"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph">
  <w:name w:val="List Paragraph"/>
  <w:rPr><w:color w:val="${COLOR_BODY}"/><w:sz w:val="21"/><w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_CJK}"/></w:rPr>
  <w:pPr><w:spacing w:after="80" w:line="340" w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/></w:pPr>
</w:style>
</w:styles>`;
}

/**
 * 构建带富文本和图片的 DOCX。
 *
 * @param blocks  内容块列表（文字和图片按序排列）
 * @param title   文档标题
 * @returns       可下载的 ZIP/DOCX Blob
 *
 * @example
 * const docx = buildRichDocx([
 *   { type: 'heading1', text: '第一章' },
 *   { type: 'paragraph', text: '这是**粗体**和*斜体*文字。' },
 *   { type: 'image', imageData: pngBytes, imageName: 'chart-1' },
 * ], '我的文档');
 */
export function buildRichDocx(blocks: DocxBlock[], title: string): Blob {
  const encoder = new TextEncoder();
  const files: Array<{ name: string; data: Uint8Array }> = [];

  // 收集图片，分配关系 ID
  const imageEntries: Array<{ blockIdx: number; data: Uint8Array; name: string }> = [];
  let imgCounter = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === 'image' && blocks[i].imageData) {
      imgCounter++;
      imageEntries.push({
        blockIdx: i,
        data: blocks[i].imageData!,
        name: blocks[i].imageName || `image-${imgCounter}`,
      });
    }
  }

  // 构建 document.xml 主体
  const bodyParts: string[] = [];

  // Title 块
  const titleBlock: DocxBlock = { type: 'title', text: title };
  bodyParts.push(paragraphXml(titleBlock));

  let imgIndex = 0;
  for (const block of blocks) {
    if (block.type === 'image') {
      if (imgIndex < imageEntries.length) {
        const entry = imageEntries[imgIndex];
        const relId = `rImage${imgIndex + 1}`;
        bodyParts.push(imageParagraphXml(relId, entry.data, entry.name));
        imgIndex++;
      }
    } else {
      bodyParts.push(paragraphXml(block));
    }
  }

  // 页面设置
  bodyParts.push(
    '<w:sectPr>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/>' +
    '</w:sectPr>'
  );

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${bodyParts.join('')}</w:body></w:document>`;

  // 构建 relationships
  const docRels: string[] = [
    '<Relationship Id="rStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  ];
  for (let i = 0; i < imageEntries.length; i++) {
    const ext = (imageEntries[i].name.match(/\.(\w+)$/) || [])[1] || 'png';
    const target = `media/${imageEntries[i].name}.${ext === imageEntries[i].name.split('.').pop() ? '' : ext}`;
    docRels.push(
      `<Relationship Id="rImage${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image-${i + 1}.png"/>`
    );
  }

  // 内容类型
  const contentTypes = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
  ];

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes.join('')}</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${docRels.join('')}</Relationships>`;

  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${esc(title)}</dc:title><dc:creator>BLM</dc:creator>
</cp:coreProperties>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>BLM</Application></Properties>`;

  // 组装 zip 文件
  files.push({ name: 'word/document.xml', data: encoder.encode(documentXml) });
  files.push({ name: 'word/styles.xml', data: encoder.encode(stylesXml()) });
  files.push({ name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) });
  files.push({ name: '_rels/.rels', data: encoder.encode(relsXml) });
  files.push({ name: 'word/_rels/document.xml.rels', data: encoder.encode(docRelsXml) });
  files.push({ name: 'docProps/core.xml', data: encoder.encode(coreXml) });
  files.push({ name: 'docProps/app.xml', data: encoder.encode(appXml) });

  for (let i = 0; i < imageEntries.length; i++) {
    files.push({ name: `word/media/image-${i + 1}.png`, data: imageEntries[i].data });
  }

  return buildZip(files);
}

/** 下载 Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
