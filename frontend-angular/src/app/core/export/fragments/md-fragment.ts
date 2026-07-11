import { ViewContent } from '../exporters/view-exporter';
import { exportRichTextToMarkdown } from './rich-text-fragment';

/** 生成格式化的 Markdown 字符串，CJK 友好 */
export function buildMarkdown(content: ViewContent): string {
  const lines: string[] = [];
  const { sections } = content;

  for (const section of sections) {
    switch (section.type) {
      case 'heading1':
        lines.push(`# ${section.text || ''}`, '');
        break;
      case 'heading2':
        lines.push(`## ${section.text || ''}`, '');
        break;
      case 'heading3':
        lines.push(`### ${section.text || ''}`, '');
        break;
      case 'heading4':
        lines.push(`#### ${section.text || ''}`, '');
        break;
      case 'heading5':
        lines.push(`##### ${section.text || ''}`, '');
        break;
      case 'heading6':
        lines.push(`###### ${section.text || ''}`, '');
        break;
      case 'heading7':
        lines.push(`####### ${section.text || ''}`, '');
        break;
      case 'paragraph':
        lines.push(section.text || '', '');
        break;
      case 'list':
        for (const item of section.items || []) {
          lines.push(`- ${item}`);
        }
        lines.push('');
        break;
      case 'table':
        renderTable(lines, section.headers || [], section.rows || [], section.richTextColumns || []);
        lines.push('');
        break;
      case 'image':
        // 图片在 MD 中用引用标记，实际图片存在 ZIP 中
        lines.push(`![${section.text || '截图'}](screenshot-${(section.imageIndex ?? 0) + 1}.png)`, '');
        break;
    }
  }

  return lines.join('\n');
}

function renderTable(lines: string[], headers: string[], rows: string[][], richTextColumns: number[] = []): void {
  if (!headers.length) return;
  const richTextColumnSet = new Set(richTextColumns);
  const normalizedRows = rows.map((row) => row.map((cell, index) =>
    richTextColumnSet.has(index) ? exportRichTextToMarkdown(cell) : cell,
  ));

  // 计算每列最大宽度（中文字符计为2宽度）
  const colWidths = headers.map((h, i) => {
    const colValues = [h, ...normalizedRows.map(r => r[i] || '')];
    return Math.max(...colValues.map(v => cjkWidth(v)));
  });

  // 分隔线
  const sep = '| ' + headers.map((_, i) => {
    const dashes = Math.max(3, colWidths[i]);
    return '-'.repeat(dashes);
  }).join(' | ') + ' |';

  // 表头
  const header = formatRow(headers, colWidths);
  lines.push(header, sep);

  // 数据行
  for (const row of normalizedRows) {
    lines.push(formatRow(row, colWidths, headers.length));
  }
}

function formatRow(cells: string[], colWidths: number[], expectedCols?: number): string {
  const padded = [...cells];
  const target = expectedCols ?? colWidths.length;
  while (padded.length < target) padded.push('');

  return '| ' + padded.map((c, i) => {
    const val = formatTableCell(c || '');
    const pad = colWidths[i] || 3;
    const diff = pad - cjkWidth(val);
    return val + ' '.repeat(Math.max(0, diff));
  }).join(' | ') + ' |';
}

function formatTableCell(value: string): string {
  return String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

/** 计算字符串显示宽度（CJK = 2，ASCII = 1） */
function cjkWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (
      (code >= 0x2e80 && code <= 0x9fff) ||   // CJK 统一表意文字
      (code >= 0xff00 && code <= 0xffef) ||    // 全角符号
      (code >= 0x3000 && code <= 0x303f)       // CJK 符号
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}
