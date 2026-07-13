type RichTextNode = RichTextElement | RichTextText;

interface RichTextElement {
  type: 'element';
  tag: string;
  children: RichTextNode[];
}

interface RichTextText {
  type: 'text';
  text: string;
}

interface RenderContext {
  mode: 'markdown' | 'plain';
  bold: boolean;
  depth: number;
}

export interface ExportRichTextRun {
  text: string;
  bold?: boolean;
}

export type ExportRichTextBlock =
  | { type: 'paragraph'; runs: ExportRichTextRun[] }
  | { type: 'listItem'; ordered: boolean; level: number; listId: number; runs: ExportRichTextRun[] };

/** 将预览富文本 HTML 转成 Markdown，供 MD 导出通道复用。 */
export function exportRichTextToMarkdown(value: unknown): string {
  return normalizeOutput(renderChildren(parseRichText(value), {
    mode: 'markdown',
    bold: false,
    depth: 0,
  }));
}

/** 将预览富文本 HTML 转成纯文本，供 DOCX 表格等不支持 HTML 的位置复用。 */
export function exportRichTextToPlainText(value: unknown): string {
  return normalizeOutput(renderChildren(parseRichText(value), {
    mode: 'plain',
    bold: false,
    depth: 0,
  }));
}

/** 将预览富文本 HTML 归一为段落/列表块，供 DOCX 等结构化导出通道复用。 */
export function normalizeExportRichText(value: unknown): ExportRichTextBlock[] {
  const blocks: ExportRichTextBlock[] = [];
  collectBlocks(parseRichText(value), blocks, { bold: false, depth: 0, nextListId: { value: 1 } });
  return blocks.filter((block) => block.runs.some((run) => run.text.trim()));
}

/**
 * 模块意图：导出侧只需要承接预览富文本的很小 HTML 子集，因此这里不引入浏览器 DOM 依赖。
 * 关键流程：先把标签 token 化为轻量树，再按 Markdown/Plain 两种模式渲染，避免每个导出器各写 stripHtml。
 * 边界细节：未知标签只透传子内容；样式属性不参与导出，防止预览 CSS 细节泄漏进文件格式。
 */
function parseRichText(value: unknown): RichTextNode[] {
  const raw = String(value || '');
  const root: RichTextElement = { type: 'element', tag: 'root', children: [] };
  const stack: RichTextElement[] = [root];
  const tokenRegex = /<[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(raw)) !== null) {
    const token = match[0];
    const current = stack[stack.length - 1];
    if (!token.startsWith('<')) {
      current.children.push({ type: 'text', text: decodeHtml(token) });
      continue;
    }

    const tagMatch = token.match(/^<\/?\s*([a-z0-9]+)[^>]*\/?\s*>$/i);
    if (!tagMatch) continue;
    const tag = tagMatch[1].toLowerCase();
    if (tag === 'br') {
      current.children.push({ type: 'element', tag: 'br', children: [] });
      continue;
    }
    if (token.startsWith('</')) {
      closeTag(stack, tag);
      continue;
    }
    const element: RichTextElement = { type: 'element', tag, children: [] };
    current.children.push(element);
    if (!token.endsWith('/>')) stack.push(element);
  }

  return root.children;
}

function closeTag(stack: RichTextElement[], tag: string): void {
  for (let index = stack.length - 1; index > 0; index -= 1) {
    const element = stack[index];
    stack.pop();
    if (element.tag === tag) return;
  }
}

function renderChildren(nodes: RichTextNode[], context: RenderContext): string {
  return nodes.map((node) => renderNode(node, context)).join('');
}

function renderNode(node: RichTextNode, context: RenderContext): string {
  if (node.type === 'text') return renderText(node.text, context);

  switch (node.tag) {
    case 'strong':
    case 'b':
      return renderChildren(node.children, { ...context, bold: true });
    case 'ol':
      return renderList(node.children, context, 'ordered');
    case 'ul':
      return renderList(node.children, context, 'unordered');
    case 'li':
      return renderChildren(node.children, context);
    case 'p':
    case 'div':
      return `${renderChildren(node.children, context)}\n\n`;
    case 'br':
      return '\n';
    default:
      return renderChildren(node.children, context);
  }
}

function renderList(nodes: RichTextNode[], context: RenderContext, kind: 'ordered' | 'unordered'): string {
  const items = nodes.filter((node): node is RichTextElement =>
    node.type === 'element' && node.tag === 'li',
  );
  return items.map((item, index) => {
    const textNodes: RichTextNode[] = [];
    const nestedLists: RichTextElement[] = [];
    for (const child of item.children) {
      if (child.type === 'element' && (child.tag === 'ol' || child.tag === 'ul')) nestedLists.push(child);
      else textNodes.push(child);
    }

    const indent = '  '.repeat(context.depth);
    const marker = kind === 'ordered' ? `${index + 1}.` : context.mode === 'markdown' ? '-' : '•';
    const itemText = normalizeInline(renderChildren(textNodes, context));
    const nested = nestedLists
      .map((list) => renderNode(list, { ...context, depth: context.depth + 1 }))
      .filter(Boolean)
      .join('\n');
    return [itemText ? `${indent}${marker} ${itemText}` : '', nested]
      .filter(Boolean)
      .join('\n');
  }).join('\n');
}

function collectBlocks(
  nodes: RichTextNode[],
  blocks: ExportRichTextBlock[],
  context: { bold: boolean; depth: number; nextListId: { value: number } },
): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      const runs = normalizeRuns([{ text: node.text, bold: context.bold }]);
      if (runs.length) blocks.push({ type: 'paragraph', runs });
      continue;
    }
    switch (node.tag) {
      case 'p':
      case 'div': {
        const runs = normalizeRuns(collectInlineRuns(node.children, context));
        if (runs.length) blocks.push({ type: 'paragraph', runs });
        break;
      }
      case 'ol':
      case 'ul':
        collectListBlocks(node, blocks, context, node.tag === 'ol', context.nextListId.value++);
        break;
      default:
        collectBlocks(node.children, blocks, context);
        break;
    }
  }
}

function collectListBlocks(
  node: RichTextElement,
  blocks: ExportRichTextBlock[],
  context: { bold: boolean; depth: number; nextListId: { value: number } },
  ordered: boolean,
  listId: number,
): void {
  for (const item of node.children.filter((child): child is RichTextElement => child.type === 'element' && child.tag === 'li')) {
    const inlineNodes: RichTextNode[] = [];
    const nestedLists: RichTextElement[] = [];
    for (const child of item.children) {
      if (child.type === 'element' && (child.tag === 'ol' || child.tag === 'ul')) nestedLists.push(child);
      else inlineNodes.push(child);
    }
    const runs = normalizeRuns(collectInlineRuns(inlineNodes, context));
    if (runs.length) blocks.push({ type: 'listItem', ordered, level: context.depth, listId, runs });
    nestedLists.forEach((list) =>
      collectListBlocks(list, blocks, { ...context, depth: context.depth + 1 }, list.tag === 'ol', context.nextListId.value++),
    );
  }
}

function collectInlineRuns(
  nodes: RichTextNode[],
  context: { bold: boolean; depth: number },
): ExportRichTextRun[] {
  const runs: ExportRichTextRun[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      runs.push({ text: normalizeTextWhitespace(node.text), bold: context.bold || undefined });
      continue;
    }
    if (node.tag === 'strong' || node.tag === 'b') {
      runs.push(...collectInlineRuns(node.children, { ...context, bold: true }));
    } else if (node.tag === 'br') {
      runs.push({ text: '\n' });
    } else {
      runs.push(...collectInlineRuns(node.children, context));
    }
  }
  return runs;
}

function normalizeRuns(runs: ExportRichTextRun[]): ExportRichTextRun[] {
  return runs
    .map((run) => ({ text: normalizeTextWhitespace(run.text), bold: run.bold || undefined }))
    .filter((run) => run.text.trim())
    .map((run) => run.bold ? run : { text: run.text });
}

function renderText(text: string, context: RenderContext): string {
  const normalized = normalizeTextWhitespace(text);
  if (context.mode !== 'markdown' || !context.bold || !normalized.trim()) return normalized;
  return `**${normalized}**`;
}

function normalizeTextWhitespace(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ');
}

function normalizeInline(value: string): string {
  return value
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function normalizeOutput(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
