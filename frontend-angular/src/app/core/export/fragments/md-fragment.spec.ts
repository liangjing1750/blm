import { describe, expect, it } from 'vitest';
import { buildMarkdown } from './md-fragment';

describe('buildMarkdown heading numbering', () => {
  it('numbers headings from section hierarchy and strips stale manual prefixes', () => {
    const markdown = buildMarkdown({
      title: '导出文档',
      sections: [
        { type: 'heading1', text: '1.引言' },
        { type: 'heading2', text: '全景视图' },
        { type: 'heading1', text: '价值流环节：入库' },
        { type: 'heading2', text: '阶段：入库' },
        { type: 'heading4', text: '流程：入库流程' },
      ],
    });

    expect(markdown).toContain('# 1 引言');
    expect(markdown).toContain('## 1.1 全景视图');
    expect(markdown).toContain('# 2 价值流环节：入库');
    expect(markdown).toContain('## 2.1 阶段：入库');
    expect(markdown).toContain('#### 2.1.1.1 流程：入库流程');
  });
});
