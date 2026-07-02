export function plainTextToStructuredRichHtml(value: string): string {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let listType = '';
  let items: string[] = [];
  const flush = () => {
    if (!listType) return;
    blocks.push(`<${listType}>${items.map((item) => `<li>${inlineRichText(item)}</li>`).join('')}</${listType}>`);
    listType = '';
    items = [];
  };
  lines.forEach((line) => {
    const ordered = line.match(/^\s*\d+[\.\)]\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (ordered || unordered) {
      const next = ordered ? 'ol' : 'ul';
      if (listType && listType !== next) flush();
      listType = next;
      items.push((ordered || unordered)?.[1] || '');
      return;
    }
    flush();
    blocks.push(line.trim() ? `<div>${inlineRichText(line)}</div>` : '<div><br></div>');
  });
  flush();
  return sanitizeRichTextHtml(blocks.join(''));
}

export function sanitizeRichTextHtml(value: unknown): string {
  const raw = String(value || '');
  if (!raw.trim()) return '';
  if (!/<[a-z][\s\S]*>/i.test(raw)) return escapeHtml(raw).replace(/\r?\n/g, '<br>');
  const template = document.createElement('template');
  template.innerHTML = raw;
  return Array.from(template.content.childNodes).map((node) => sanitizeRichTextNode(node)).join('');
}

export function richTextValueFromEditor(editor: HTMLElement | null): string {
  return sanitizeRichTextHtml(String(editor?.innerHTML || ''));
}

function inlineRichText(value: string): string {
  return escapeHtml(value).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function sanitizeRichTextNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map((child) => sanitizeRichTextNode(child)).join('');
  const allowedTags = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'ol', 'ul', 'li', 'p', 'br', 'div', 'span', 'blockquote', 'code', 'pre']);
  if (!allowedTags.has(tag)) return children;
  if (tag === 'br') return '<br>';
  const style = sanitizeRichTextStyle(element.getAttribute('style') || '');
  return `<${tag}${style ? ` style="${style}"` : ''}>${children}</${tag}>`;
}

function sanitizeRichTextStyle(style: string): string {
  const allowed = ['color', 'background-color', 'text-align', 'font-weight', 'margin-left', 'padding-left'];
  return style.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf(':');
    if (separator < 1) return '';
    const property = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (!allowed.includes(property) || !value || /url\s*\(|expression\s*\(|javascript:|[<>]/i.test(value)) return '';
    if (property === 'text-align' && !/^(left|right|center|justify)$/i.test(value)) return '';
    if ((property === 'margin-left' || property === 'padding-left') && !/^-?\d+(\.\d+)?(px|em|rem|%)$/i.test(value)) return '';
    return `${property}:${escapeHtml(value)}`;
  }).filter(Boolean).join(';');
}

function escapeHtml(value: unknown): string {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}
