import { describe, expect, it } from 'vitest';
import { buildMarkdown } from './md-fragment';

describe('buildMarkdown', () => {
  it('keeps multiline rich-text table cells inside the markdown table row', () => {
    const markdown = buildMarkdown({
      title: '节点',
      sections: [{
        type: 'table',
        headers: ['规则名称', '规则内容'],
        rows: [['功能描述', '• 客户查看货物\n• 仓库查看货物']],
      }],
    });

    expect(markdown).toContain('| 功能描述 | • 客户查看货物<br>• 仓库查看货物 |');
  });

  it('escapes table pipes so business text does not create extra columns', () => {
    const markdown = buildMarkdown({
      title: '节点',
      sections: [{
        type: 'table',
        headers: ['字段', '内容'],
        rows: [['规则', 'A | B']],
      }],
    });

    expect(markdown).toContain('A \\| B');
  });
});
