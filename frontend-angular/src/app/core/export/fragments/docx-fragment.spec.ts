import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import * as CFB from 'cfb';
import { buildDocxFragment, fitImageToDocxPage } from './docx-fragment';

describe('buildDocxFragment', () => {
  it('embeds attachment binaries into the docx package and links them from the document', async () => {
    const blob = await buildDocxFragment({
      title: '附录',
      attachments: [{
        id: 'att-1',
        name: '说明.txt',
        contentType: 'text/plain',
        data: new TextEncoder().encode('hello attachment'),
      }],
      sections: [
        { type: 'heading1', text: '附录' },
        { type: 'heading4', text: '附件名称：说明.txt' },
        { type: 'attachment', text: '附件：说明.txt', attachmentId: 'att-1' },
      ],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const embedded = await zip.file('word/embeddings/oleObject1.bin')?.async('uint8array');
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string') || '';
    const documentXml = await zip.file('word/document.xml')?.async('string') || '';
    const contentTypesXml = await zip.file('[Content_Types].xml')?.async('string') || '';
    expect(embedded).toBeDefined();
    const ole = CFB.read(embedded || new Uint8Array(), { type: 'array' });
    const oleNative = ole.FileIndex.find((entry) => entry.name.includes('Ole10Native'))?.content;

    expect(relsXml).toContain('relationships/oleObject');
    expect(relsXml).toContain('Target="embeddings/oleObject1.bin"');
    expect(relsXml).toContain('relationships/image');
    expect(contentTypesXml).toContain('application/vnd.openxmlformats-officedocument.oleObject');
    expect(documentXml).toContain('<o:OLEObject');
    expect(documentXml).toContain('ProgID="Package"');
    expect(documentXml).toContain('r:id="rOleObject1"');
    expect(new TextDecoder().decode(new Uint8Array(oleNative || []))).toContain('hello attachment');
    expect(documentXml).toContain('附件：说明.txt');
  });

  it('keeps compact screenshots visually modest instead of stretching them to page width', () => {
    expect(fitImageToDocxPage(320, 220, 640)).toEqual({ width: 320, height: 220 });
    expect(fitImageToDocxPage(620, 260, 640)).toEqual({ width: 461, height: 193 });
    expect(fitImageToDocxPage(1600, 900, 640)).toEqual({ width: 640, height: 360 });
  });

  it('renders rich text table cells as native Word paragraphs and lists', async () => {
    const blob = await buildDocxFragment({
      title: '节点',
      sections: [{
        type: 'table',
        headers: ['规则名称', '规则内容'],
        richTextColumns: [1],
        rows: [[
          '功能描述',
          '<ul><li>客户查看自己存放的货物</li><li>仓库查看本仓库货物</li></ul>',
        ]],
      }],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file('word/document.xml')?.async('string');

    expect(documentXml).toMatch(/<w:t[^>]*>功能描述<\/w:t>/);
    expect(documentXml).toMatch(/<w:t[^>]*>客户查看自己存放的货物<\/w:t>/);
    expect(documentXml).toMatch(/<w:t[^>]*>仓库查看本仓库货物<\/w:t>/);
    expect((documentXml?.match(/<w:numPr>/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(documentXml).toMatch(/<w:tcW w:type="pct" w:w="18%"/);
    expect(documentXml).toMatch(/<w:tcW w:type="pct" w:w="82%"/);
    expect(documentXml).not.toContain('• 客户查看自己存放的货物');
  });

  it('restarts ordered numbering for separate ordered lists in the same rich text cell', async () => {
    const blob = await buildDocxFragment({
      title: '节点',
      sections: [{
        type: 'table',
        headers: ['规则名称', '规则内容'],
        richTextColumns: [1],
        rows: [[
          '输出',
          [
            '<ul>',
            '<li>仓单类型<ol><li>期货仓单</li><li>交割预报仓单</li></ol></li>',
            '<li>批号<ol><li>棉花显示批号</li><li>其他品种不显示</li></ol></li>',
            '</ul>',
          ].join(''),
        ]],
      }],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file('word/document.xml')?.async('string') || '';
    const orderedListNumIds = Array.from(
      documentXml.matchAll(/<w:ilvl w:val="1"\/><w:numId w:val="(\d+)"\/>/g),
      (match) => match[1],
    );

    expect(orderedListNumIds).toHaveLength(4);
    expect(orderedListNumIds[0]).toBe(orderedListNumIds[1]);
    expect(orderedListNumIds[2]).toBe(orderedListNumIds[3]);
    expect(orderedListNumIds[0]).not.toBe(orderedListNumIds[2]);
  });

  it('renders five-level headings and preferred material table widths', async () => {
    const blob = await buildDocxFragment({
      title: '节点',
      sections: [
        { type: 'heading5', text: '节点：查询仓储单' },
        { type: 'heading6', text: '办理材料' },
        { type: 'heading7', text: '表单1：过滤条件' },
        {
          type: 'table',
          headers: ['分组', '字段', '类型', '必填', '说明'],
          columnWidths: [16, 20, 14, 10, 40],
          rows: [['过滤条件', '仓储仓单编号', '文本', '是', '支持模糊匹配']],
        },
      ],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file('word/document.xml')?.async('string') || '';

    expect(documentXml).toMatch(/<w:pStyle w:val="Heading5"\/>/);
    expect(documentXml).toMatch(/<w:pStyle w:val="Heading6"\/>/);
    expect(documentXml).toMatch(/<w:pStyle w:val="Heading7"\/>/);
    expect(documentXml).toMatch(/<w:t[^>]*>节点：查询仓储单<\/w:t>/);
    for (const width of ['16%', '20%', '14%', '10%', '40%']) {
      expect(documentXml).toContain(`<w:tcW w:type="pct" w:w="${width}"/>`);
    }
  });

  it('vertically merges adjacent equal group cells when requested', async () => {
    const blob = await buildDocxFragment({
      title: '节点',
      sections: [{
        type: 'table',
        headers: ['分组', '字段', '类型', '必填', '说明'],
        mergeSameColumns: [0],
        rows: [
          ['基本信息', '客户编号', '输入框', '必填', '会员编码'],
          ['基本信息', '客户状态', '只读展示', '非必填', '系统展示'],
          ['附件信息', '附件名称', '下拉选择', '非必填', '下拉选择'],
        ],
      }],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file('word/document.xml')?.async('string') || '';

    expect(documentXml).toContain('<w:vMerge w:val="restart"/>');
    expect(documentXml).toContain('<w:vMerge w:val="continue"/>');
    expect((documentXml.match(/<w:t[^>]*>基本信息<\/w:t>/g) || []).length).toBe(1);
  });
});
