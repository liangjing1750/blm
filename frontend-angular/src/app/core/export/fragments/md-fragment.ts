import { ViewContent } from '../exporters/view-exporter';
import { exportRichTextToMarkdown } from './rich-text-fragment';

/** 生成格式化的 Markdown 字符串，CJK 友好。 */
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
        for (const item of section.items || []) lines.push(`- ${item}`);
        lines.push('');
        break;
      case 'table':
        renderTable(lines, section.headers || [], section.rows || [], section.richTextColumns || []);
        lines.push('');
        break;
      case 'image':
        lines.push(`![${section.text || '截图'}](screenshot-${(section.imageIndex ?? 0) + 1}.png)`, '');
        break;
      case 'attachment': {
        const attachment = content.attachments?.find((item) => item.id === section.attachmentId);
        const fileName = attachment ? `attachments/${safeAttachmentFileName(attachment.name)}` : '';
        lines.push(fileName ? `[${section.text || attachment?.name || '附件'}](${fileName})` : (section.text || '附件'), '');
        break;
      }
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
  const colWidths = headers.map((header, index) => {
    const colValues = [header, ...normalizedRows.map((row) => row[index] || '')];
    return Math.max(...colValues.map((value) => cjkWidth(value)));
  });

  lines.push(formatRow(headers, colWidths));
  lines.push('| ' + headers.map((_, index) => '-'.repeat(Math.max(3, colWidths[index]))).join(' | ') + ' |');
  for (const row of normalizedRows) lines.push(formatRow(row, colWidths, headers.length));
}

function formatRow(cells: string[], colWidths: number[], expectedCols?: number): string {
  const padded = [...cells];
  const target = expectedCols ?? colWidths.length;
  while (padded.length < target) padded.push('');
  return '| ' + padded.map((cell, index) => {
    const value = formatTableCell(cell || '');
    const diff = (colWidths[index] || 3) - cjkWidth(value);
    return value + ' '.repeat(Math.max(0, diff));
  }).join(' | ') + ' |';
}

function formatTableCell(value: string): string {
  return String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function cjkWidth(s: string): number {
  let width = 0;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    width += (
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x3000 && code <= 0x303f)
    ) ? 2 : 1;
  }
  return width;
}

function safeAttachmentFileName(name: string): string {
  return String(name || 'attachment')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'attachment';
}
