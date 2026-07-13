import { ViewContent } from '../exporters/view-exporter';
import { buildDocxFragment } from './docx-fragment';
import { buildMarkdown } from './md-fragment';

/**
 * Module intent: merge independently exported view fragments into one document while keeping image and attachment indexes valid.
 * Key flow: every fragment owns local screenshot indexes and attachment ids; mergeContents remaps them to final document ids.
 * Boundary detail: this class only assembles fragments and does not know how each workbench captures images or loads files.
 */
export class FragmentAssembler {
  async exportOneDocx(
    content: ViewContent,
    screenshots: Uint8Array[] = [],
  ): Promise<Blob> {
    return buildDocxFragment(content, screenshots);
  }

  exportOneMarkdown(content: ViewContent): string {
    return buildMarkdown(content);
  }

  async assembleAllDocx(
    contents: ViewContent[],
    allScreenshots: Uint8Array[][],
  ): Promise<Blob> {
    const merged = this.mergeContents(contents, allScreenshots);
    return buildDocxFragment(merged.content, merged.screenshots);
  }

  assembleAllMarkdown(
    contents: ViewContent[],
    allScreenshots: Uint8Array[][] = [],
  ): string {
    return buildMarkdown(this.mergeContents(contents, allScreenshots).content);
  }

  mergeContents(
    contents: ViewContent[],
    allScreenshots: Uint8Array[][] = [],
  ): { content: ViewContent; screenshots: Uint8Array[] } {
    const merged: ViewContent = {
      title: contents[0]?.title || '导出文档',
      sections: [],
      attachments: [],
    };
    let screenshotOffset = 0;

    for (let i = 0; i < contents.length; i += 1) {
      const content = contents[i];
      const screenshots = allScreenshots[i] || [];
      if (i > 0) merged.sections.push({ type: 'paragraph', text: '' });

      for (const section of content.sections) {
        if (section.type === 'image' && section.imageIndex !== undefined) {
          merged.sections.push({
            ...section,
            imageIndex: screenshotOffset + (section.imageIndex ?? 0),
          });
        } else if (section.type === 'attachment' && section.attachmentId) {
          merged.sections.push({
            ...section,
            attachmentId: `${i}-${section.attachmentId}`,
          });
        } else {
          merged.sections.push(section);
        }
      }

      for (const attachment of content.attachments || []) {
        merged.attachments?.push({ ...attachment, id: `${i}-${attachment.id}` });
      }
      screenshotOffset += screenshots.length;
    }

    return { content: merged, screenshots: allScreenshots.flat() };
  }
}
