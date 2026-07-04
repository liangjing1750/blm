import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ApiService, ManualDocSummary } from '../../../core/api/api.service';

interface ManualDocContent extends ManualDocSummary {
  content: string;
}

interface ManualOutlineItem {
  id: string;
  label: string;
  depth: number;
}

interface ManualOutlineGroup {
  id: string;
  label: string;
  children: ManualOutlineItem[];
}

interface ManualRenderResult {
  html: string;
  outline: ManualOutlineItem[];
}

@Component({
  selector: 'app-manual-workbench',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manual-workbench.component.html',
  styleUrl: './manual-workbench.component.scss',
})
export class ManualWorkbenchComponent implements OnInit {
  // 模块意图：复刻旧版“使用手册”的文档导航、章节目录和正文阅读体验。
  // 关键流程：读取文档 -> 渲染 Markdown -> 从标题生成 outline -> 左侧目录点击滚动正文锚点。
  // 边界细节：只做前端只读渲染，不修改手册文档结构；相对资源仍映射到 /api/docs/assets。
  protected readonly docs = signal<ManualDocSummary[]>([]);
  protected readonly selectedDoc = signal<ManualDocContent | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly collapsedGroups = signal<Record<string, boolean>>({});
  protected readonly activeDocId = computed(() => this.selectedDoc()?.id || this.docs()[0]?.id || '');
  protected readonly rendered = computed<ManualRenderResult>(() => {
    const doc = this.selectedDoc();
    return doc ? this.renderMarkdown(doc.id, doc.content) : { html: '', outline: [] };
  });
  protected readonly outlineGroups = computed(() => this.buildOutlineGroups(this.rendered().outline));

  constructor(private readonly api: ApiService) {}

  async ngOnInit(): Promise<void> {
    await this.loadDocs();
  }

  protected async selectDoc(docId: string): Promise<void> {
    if (!docId || this.selectedDoc()?.id === docId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const doc = await this.api.doc(docId);
      this.selectedDoc.set({
        id: String(doc?.id || docId),
        title: String(doc?.title || docId),
        summary: String(doc?.summary || ''),
        content: String(doc?.content || ''),
      });
      this.collapsedGroups.set({});
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected renderedManualHtml(): string {
    return this.rendered().html;
  }

  protected returnToWork(): void {
    window.dispatchEvent(new CustomEvent('blm-return-to-workbench'));
  }

  protected isGroupCollapsed(groupId: string): boolean {
    return this.collapsedGroups()[groupId] !== false;
  }

  protected toggleOutlineGroup(groupId: string): void {
    if (!groupId) return;
    this.collapsedGroups.update((value) => ({
      ...value,
      [groupId]: !this.isGroupCollapsed(groupId),
    }));
  }

  protected jumpTo(anchorId: string): void {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private async loadDocs(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const docs = await this.api.docs();
      this.docs.set(docs);
      if (docs[0]?.id) await this.selectDoc(docs[0].id);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  private buildOutlineGroups(outline: ManualOutlineItem[]): ManualOutlineGroup[] {
    const groups: ManualOutlineGroup[] = [];
    let current: ManualOutlineGroup | null = null;
    let fallbackIndex = 0;
    for (const item of outline) {
      if (!item.id || item.depth <= 0) continue;
      if (item.depth === 1) {
        current = { id: item.id, label: item.label, children: [] };
        groups.push(current);
        continue;
      }
      if (!current) {
        current = { id: `manual-outline-group-${fallbackIndex += 1}`, label: '核心功能', children: [] };
        groups.push(current);
      }
      current.children.push({ ...item, depth: item.depth - 1 });
    }
    return groups;
  }

  private renderMarkdown(docId: string, markdown: string): ManualRenderResult {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html: string[] = [];
    const outline: ManualOutlineItem[] = [];
    let paragraph: string[] = [];
    let listItems: string[] = [];
    let listTag: 'ul' | 'ol' = 'ul';
    let codeLang = '';
    let codeLines: string[] = [];
    let quoteLines: string[] = [];
    let tableRows: string[][] = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${this.inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!listItems.length) return;
      html.push(`<${listTag}>${listItems.map((item) => `<li>${this.inline(item)}</li>`).join('')}</${listTag}>`);
      listItems = [];
    };
    const flushQuote = () => {
      if (!quoteLines.length) return;
      html.push(`<blockquote>${quoteLines.map((line) => `<p>${this.inline(line)}</p>`).join('')}</blockquote>`);
      quoteLines = [];
    };
    const flushTable = () => {
      if (!tableRows.length) return;
      const [head, ...rows] = tableRows;
      html.push('<table><thead><tr>', head.map((cell) => `<th>${this.inline(cell)}</th>`).join(''), '</tr></thead><tbody>');
      for (const row of rows) html.push('<tr>', row.map((cell) => `<td>${this.inline(cell)}</td>`).join(''), '</tr>');
      html.push('</tbody></table>');
      tableRows = [];
    };
    const flushCode = () => {
      if (!codeLang && !codeLines.length) return;
      const className = codeLang ? ` class="language-${this.escapeAttr(codeLang)}"` : '';
      html.push(`<pre><code${className}>${this.escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLang = '';
      codeLines = [];
    };
    const flushBlocks = () => {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
    };
    const pushListItem = (tag: 'ul' | 'ol', value: string) => {
      if (listItems.length && listTag !== tag) flushList();
      listTag = tag;
      listItems.push(value);
    };

    lines.forEach((rawLine) => {
      const fence = rawLine.match(/^```\s*([A-Za-z0-9_-]*)\s*$/);
      if (fence) {
        if (codeLang || codeLines.length) flushCode();
        else {
          flushBlocks();
          codeLang = fence[1] || 'plain';
          codeLines = [];
        }
        return;
      }
      if (codeLang || codeLines.length) {
        codeLines.push(rawLine);
        return;
      }
      const line = rawLine.trim();
      if (!line) {
        flushBlocks();
        return;
      }
      if (/^\|.+\|$/.test(line)) {
        if (/^\|\s*:?-{3,}:?/.test(line)) return;
        flushParagraph();
        flushList();
        flushQuote();
        tableRows.push(line.slice(1, -1).split('|').map((cell) => cell.trim()));
        return;
      }
      flushTable();
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        flushBlocks();
        const level = heading[1].length;
        const label = this.stripMarkdown(heading[2]);
        const id = `manual-${this.slugify(`${docId}-${label}-${outline.length}`)}`;
        outline.push({ id, label: label || `章节 ${outline.length + 1}`, depth: Math.max(level - 1, 0) });
        html.push(`<h${level} id="${this.escapeAttr(id)}">${this.inline(heading[2])}</h${level}>`);
        return;
      }
      const quote = /^>\s*(.+)$/.exec(line);
      if (quote) {
        flushParagraph();
        flushList();
        quoteLines.push(quote[1]);
        return;
      }
      const bullet = /^\s*[-*]\s+(.+)$/.exec(rawLine);
      if (bullet) {
        flushParagraph();
        flushQuote();
        pushListItem('ul', bullet[1]);
        return;
      }
      const ordered = /^\s*\d+\.\s+(.+)$/.exec(rawLine);
      if (ordered) {
        flushParagraph();
        flushQuote();
        pushListItem('ol', ordered[1]);
        return;
      }
      flushQuote();
      paragraph.push(line);
    });

    flushCode();
    flushBlocks();
    return { html: html.join('\n'), outline };
  }

  private inline(value: string): string {
    const tokens: Array<{ token: string; html: string }> = [];
    const push = (html: string) => {
      const token = `@@MANUAL_INLINE_${tokens.length}@@`;
      tokens.push({ token, html });
      return token;
    };
    let text = String(value || '');
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => (
      push(`<img src="${this.escapeAttr(this.rewriteRelativeUrl(src))}" alt="${this.escapeAttr(alt || '')}" loading="lazy" decoding="async">`)
    ));
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => (
      push(`<a href="${this.escapeAttr(this.rewriteRelativeUrl(href))}"${/^https?:/i.test(String(href || '')) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${this.escapeHtml(label || '')}</a>`)
    ));
    text = text.replace(/`([^`]+)`/g, (_, code) => push(`<code>${this.escapeHtml(code || '')}</code>`));
    let html = this.escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    for (const token of tokens) html = html.split(token.token).join(token.html);
    return html;
  }

  private rewriteRelativeUrl(value: string): string {
    const raw = String(value || '').trim();
    if (!raw || /^(https?:|data:|mailto:|#|\/)/i.test(raw)) return raw;
    return `/api/docs/assets/${raw.replace(/^\.?\//, '')}`;
  }

  private stripMarkdown(value: string): string {
    return String(value || '')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*_#]/g, '')
      .trim();
  }

  private slugify(value: string): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      || 'section';
  }

  private escapeHtml(value: string): string {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char] || char);
  }

  private escapeAttr(value: string): string {
    return this.escapeHtml(value).replace(/"/g, '&quot;');
  }
}
