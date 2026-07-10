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
