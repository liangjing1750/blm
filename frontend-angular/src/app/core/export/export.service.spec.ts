import { describe, expect, it } from 'vitest';
import { buildSingleViewDocxBlob, buildSingleViewZipFiles } from './export.service';
import { ViewContent } from './exporters/view-exporter';

describe('buildSingleViewZipFiles', () => {
  it('omits image files when a text-only exporter has no screenshots', () => {
    const content: ViewContent = {
      title: '节点：复核订单',
      sections: [{ type: 'heading2', text: '节点：复核订单' }],
    };

    const files = buildSingleViewZipFiles('node-node-review', content, []);

    expect(files.map((file) => file.name)).toEqual(['node-node-review.md']);
    expect(new TextDecoder().decode(files[0].data)).toContain('节点：复核订单');
  });

  it('wraps DOCX blobs with the Word MIME type instead of generic zip', async () => {
    const content: ViewContent = {
      title: '节点：复核订单',
      sections: [{ type: 'heading2', text: '节点：复核订单' }],
    };

    const blob = await buildSingleViewDocxBlob(content, []);

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});
