import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ApiService, ManualDocSummary } from '../../../core/api/api.service';

interface ManualDocContent extends ManualDocSummary {
  content: string;
}

@Component({
  selector: 'app-manual-workbench',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manual-workbench.component.html',
  styleUrl: './manual-workbench.component.scss',
})
export class ManualWorkbenchComponent implements OnInit {
  // 模块意图：把旧版“使用手册”从全局 render/manual 模式收敛为只读 Angular 工作区。
  // 关键流程：先查询文档目录，再按选中文档读取 Markdown；模板只消费渲染后的安全片段。
  // 边界细节：这里不修改手册内容和服务端文档结构，图片路径仍沿用 /api/docs/assets。
  protected readonly docs = signal<ManualDocSummary[]>([]);
  protected readonly selectedDoc = signal<ManualDocContent | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly activeDocId = computed(() => this.selectedDoc()?.id || this.docs()[0]?.id || '');

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
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected renderedManualHtml(): string {
    const doc = this.selectedDoc();
    return doc ? this.renderMarkdown(doc.content) : '';
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

  private renderMarkdown(markdown: string): string {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html: string[] = [];
    let listOpen = false;
    let tableRows: string[][] = [];
    const flushList = () => {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
    };
    const flushTable = () => {
      if (!tableRows.length) return;
      const [head, ...rows] = tableRows;
      html.push('<table><thead><tr>', head.map((cell) => `<th>${this.inline(cell)}</th>`).join(''), '</tr></thead><tbody>');
      for (const row of rows) html.push('<tr>', row.map((cell) => `<td>${this.inline(cell)}</td>`).join(''), '</tr>');
      html.push('</tbody></table>');
      tableRows = [];
    };
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushList();
        flushTable();
        continue;
      }
      if (/^\|.+\|$/.test(line) && !/^\|\s*-/.test(line)) {
        flushList();
        tableRows.push(line.slice(1, -1).split('|').map((cell) => cell.trim()));
        continue;
      }
      flushTable();
      const heading = /^(#{1,4})\s+(.+)$/.exec(line);
      if (heading) {
        flushList();
        const level = heading[1].length;
        html.push(`<h${level}>${this.inline(heading[2])}</h${level}>`);
        continue;
      }
      const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
      if (image) {
        flushList();
        const src = image[2].startsWith('http') || image[2].startsWith('/api/')
          ? image[2]
          : `/api/docs/assets/${image[2].replace(/^\.?\//, '')}`;
        html.push(`<figure class="manual-figure"><img src="${this.escapeAttr(src)}" alt="${this.escapeAttr(image[1])}"><figcaption>${this.inline(image[1])}</figcaption></figure>`);
        continue;
      }
      const item = /^[-*]\s+(.+)$/.exec(line);
      if (item) {
        if (!listOpen) {
          html.push('<ul>');
          listOpen = true;
        }
        html.push(`<li>${this.inline(item[1])}</li>`);
        continue;
      }
      flushList();
      html.push(`<p>${this.inline(line)}</p>`);
    }
    flushList();
    flushTable();
    return html.join('');
  }

  private inline(value: string): string {
    return this.escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
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
