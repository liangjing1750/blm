import { BlmDocument } from '../../document/document.model';
import { captureFullElement } from './process-exporter';
import { buildAttachmentContent, hydratePersistedAttachmentBytes } from './attachment-exporter';
import { buildDictionaryContent, buildTermsContent } from './knowledge-exporters';
import { buildRoleContent, RoleExporter } from './role-exporter';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

export class PanoramaExporter implements ViewExporter {
  readonly label = 'panorama';

  constructor(
    private readonly document: BlmDocument,
    private readonly documentName = '',
  ) {}

  toMarkdown(): string {
    return this.getContent().sections
      .map((section) => section.text || '')
      .filter(Boolean)
      .join('\n');
  }

  getContent(): ViewContent {
    const roleImageCount = (this.document.roles || []).length;
    const attachmentContent = buildAttachmentContent(this.document);
    const sections: ViewSection[] = [
      { type: 'heading1', text: '1.引言' },
      { type: 'heading2', text: '1.1 全景视图' },
      { type: 'image', text: '全景视图', imageIndex: 0 },
      ...renameFirstHeading(buildRoleContent(this.document, {
        headingType: 'heading2',
        imageOffset: 1,
      }).sections, '1.2 角色管理'),
      ...renameFirstHeading(buildTermsContent(this.document, { headingType: 'heading2' }).sections, '1.3 术语管理'),
      ...renameFirstHeading(buildDictionaryContent(this.document, { headingType: 'heading2' }).sections, '1.4 字典管理'),
      ...attachmentContent.sections,
    ];

    // 模块意图：全景导出是第一章引言的聚合入口，角色用例图从 screenshots[1] 开始。
    // 关键流程：全景截图占 index 0，角色模块内容在 buildRoleContent 中按 imageOffset 绑定后续截图。
    // 边界细节：术语和字典没有截图，因此不会影响 imageIndex 连续性。
    if (roleImageCount === 0) {
      return { title: '引言', sections, attachments: attachmentContent.attachments };
    }
    return { title: '引言', sections, attachments: attachmentContent.attachments };
  }

  async prepareContent(): Promise<ViewContent> {
    await hydratePersistedAttachmentBytes(this.document, this.documentName);
    return this.getContent();
  }

  async capture(): Promise<Uint8Array> {
    if (typeof document === 'undefined') return new Uint8Array();
    const el = document.querySelector<HTMLElement>('[data-testid="panorama-overview-rich"]');
    if (!el) return new Uint8Array();

    const zoomEl = el.closest<HTMLElement>('[data-testid="panorama-zoom-canvas"]');
    const oldZoom = zoomEl?.style.zoom;
    if (zoomEl) zoomEl.style.zoom = '1';

    try {
      return captureFullElement(el);
    } finally {
      if (zoomEl) zoomEl.style.zoom = oldZoom ?? '';
    }
  }

  async captureAll(onProgress?: (done: number, total: number, label?: string) => void): Promise<Uint8Array[]> {
    const overview = await this.capture();
    onProgress?.(1, Math.max(1, (this.document.roles || []).length + 1), '全景视图');
    const shouldRestoreOverview = Boolean(document.querySelector('[data-testid="panorama-overview-rich"]'));
    if (!document.querySelector('[data-testid="role-usecase-map"]')) {
      document.querySelector<HTMLElement>('[data-testid="panorama-subtab-roles"]')?.click();
      await new Promise((r) => setTimeout(r, 800));
    }
    const total = Math.max(1, (this.document.roles || []).length + 1);
    const roleImages = await new RoleExporter(this.document).captureAll((done, roleTotal, label) => {
      onProgress?.(done + 1, Math.max(total, roleTotal + 1), label);
    });
    if (shouldRestoreOverview) {
      document.querySelector<HTMLElement>('[data-testid="panorama-subtab-overview"]')?.click();
      await new Promise((r) => setTimeout(r, 300));
    }
    return [overview, ...roleImages];
  }
}

function renameFirstHeading(sections: ViewSection[], text: string): ViewSection[] {
  return sections.map((section, index) => index === 0 ? { ...section, text } : section);
}
