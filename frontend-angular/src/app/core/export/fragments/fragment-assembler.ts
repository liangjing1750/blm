import { ViewContent } from '../exporters/view-exporter';
import { buildDocxFragment } from './docx-fragment';
import { buildMarkdown } from './md-fragment';

/**
 * 片段汇总器。
 * - exportOne: 单视图独立导出 DOCX 或 MD
 * - assembleAll: 多视图合并为一个完整文档
 */
export class FragmentAssembler {
  /**
   * 单个视图导出为 DOCX。
   * @param content      视图内容
   * @param screenshots  截图 PNG 列表
   */
  async exportOneDocx(
    content: ViewContent,
    screenshots: Uint8Array[] = [],
  ): Promise<Blob> {
    return buildDocxFragment(content, screenshots);
  }

  /**
   * 单个视图导出为 Markdown 字符串。
   */
  exportOneMarkdown(content: ViewContent): string {
    return buildMarkdown(content);
  }

  /**
   * 全部视图合并为一个 DOCX。
   * 将所有片段按顺序放入同一个 Document 中。
   */
  async assembleAllDocx(
    contents: ViewContent[],
    allScreenshots: Uint8Array[][],
  ): Promise<Blob> {
    // 合并所有片段的内容和截图索引重映射
    const merged: ViewContent = {
      title: contents[0]?.title || '导出文档',
      sections: [],
    };
    let screenshotOffset = 0;

    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      const screenshots = allScreenshots[i] || [];

      // fragment 之间加分隔标题
      if (i > 0) {
        merged.sections.push({ type: 'paragraph', text: '' });
      }

      for (const section of content.sections) {
        if (section.type === 'image' && section.imageIndex !== undefined) {
          // 重映射 imageIndex 到全局截图数组
          merged.sections.push({
            ...section,
            imageIndex: screenshotOffset + (section.imageIndex ?? 0),
          });
        } else {
          merged.sections.push(section);
        }
      }
      screenshotOffset += screenshots.length;
    }

    // 收集所有截图
    const allImages: Uint8Array[] = allScreenshots.flat();

    return buildDocxFragment(merged, allImages);
  }

  /**
   * 全部视图合并为一个 Markdown 字符串。
   */
  assembleAllMarkdown(contents: ViewContent[]): string {
    return contents
      .map((c, i) => {
        const md = buildMarkdown(c);
        return i > 0 ? `---\n\n${md}` : md;
      })
      .join('\n\n');
  }
}
