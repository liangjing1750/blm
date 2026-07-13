import { describe, expect, it } from 'vitest';
import {
  exportRichTextToMarkdown,
  exportRichTextToPlainText,
  normalizeExportRichText,
} from './rich-text-fragment';

describe('rich-text-fragment', () => {
  it('keeps bold text, ordered lists, and nested indentation for Markdown export', () => {
    const html = [
      '<ol>',
      '<li><strong>核对仓单</strong><ol><li>查看现货货转记录</li></ol></li>',
      '<li>提交复核结果</li>',
      '</ol>',
    ].join('');

    expect(exportRichTextToMarkdown(html)).toBe([
      '1. **核对仓单**',
      '  1. 查看现货货转记录',
      '2. 提交复核结果',
    ].join('\n'));
  });

  it('exposes structured blocks so DOCX can render native paragraphs and lists', () => {
    const html = '<p>先<strong>确认</strong></p><ul><li>客户查看货物</li><li>仓库查看货物</li></ul>';

    expect(normalizeExportRichText(html)).toEqual([
      {
        type: 'paragraph',
        runs: [
          { text: '先' },
          { text: '确认', bold: true },
        ],
      },
      {
        type: 'listItem',
        ordered: false,
        level: 0,
        listId: 1,
        runs: [{ text: '客户查看货物' }],
      },
      {
        type: 'listItem',
        ordered: false,
        level: 0,
        listId: 1,
        runs: [{ text: '仓库查看货物' }],
      },
    ]);
  });

  it('scopes ordered numbering to each original ordered list', () => {
    const html = [
      '<ul>',
      '<li>仓单类型<ol><li>期货仓单</li><li>交割预报仓单</li></ol></li>',
      '<li>批号<ol><li>棉花显示批号</li><li>其他品种不显示</li></ol></li>',
      '</ul>',
    ].join('');

    expect(normalizeExportRichText(html)).toEqual([
      { type: 'listItem', ordered: false, level: 0, listId: 1, runs: [{ text: '仓单类型' }] },
      { type: 'listItem', ordered: true, level: 1, listId: 2, runs: [{ text: '期货仓单' }] },
      { type: 'listItem', ordered: true, level: 1, listId: 2, runs: [{ text: '交割预报仓单' }] },
      { type: 'listItem', ordered: false, level: 0, listId: 1, runs: [{ text: '批号' }] },
      { type: 'listItem', ordered: true, level: 1, listId: 3, runs: [{ text: '棉花显示批号' }] },
      { type: 'listItem', ordered: true, level: 1, listId: 3, runs: [{ text: '其他品种不显示' }] },
    ]);
  });

  it('renders unordered rich text as readable list text for DOCX table cells', () => {
    const html = '<ul><li>客户查看<strong>自己</strong>存放的货物</li><li>仓库查看本仓库货物</li></ul>';

    expect(exportRichTextToPlainText(html)).toBe([
      '• 客户查看自己存放的货物',
      '• 仓库查看本仓库货物',
    ].join('\n'));
  });

  it('normalizes paragraphs and line breaks without exposing raw HTML', () => {
    const html = '<p>用户点击<strong>查询</strong></p><p>系统返回结果<br>并展示状态</p>';

    expect(exportRichTextToMarkdown(html)).toBe([
      '用户点击**查询**',
      '',
      '系统返回结果',
      '并展示状态',
    ].join('\n'));
    expect(exportRichTextToPlainText(html)).toBe([
      '用户点击查询',
      '',
      '系统返回结果',
      '并展示状态',
    ].join('\n'));
  });
  it('preserves textarea line breaks for node export rich-text columns', () => {
    const text = ['line one', 'line two', '', 'line four'].join('\n');

    expect(exportRichTextToMarkdown(text)).toBe(text);
    expect(exportRichTextToPlainText(text)).toBe(text);
    expect(normalizeExportRichText(text)).toEqual([
      { type: 'paragraph', runs: [{ text: 'line one\nline two\n\nline four' }] },
    ]);
  });
});
