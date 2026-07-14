import { describe, expect, it } from 'vitest';
import { buildDetachedAttachmentZipFiles, buildSingleViewDocxBlob, buildSingleViewZipFiles } from './export.service';
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

  it('uses explicit zip file paths for detached attachment packages', () => {
    const content: ViewContent = {
      title: '附件',
      sections: [{ type: 'heading1', text: '附件' }],
      attachments: [{
        id: 'att-1',
        name: '说明.pdf',
        contentType: 'application/pdf',
        data: new TextEncoder().encode('attachment bytes'),
        path: '附件/阶段：入库/流程：入库流程/说明.pdf',
      }],
    };

    const files = buildSingleViewZipFiles('attachments', content, []);

    expect(files.map((file) => file.name)).toEqual([
      'attachments.md',
      '附件/阶段：入库/流程：入库流程/说明.pdf',
    ]);
    expect(new TextDecoder().decode(files[1].data)).toBe('attachment bytes');
  });

  it('builds detached attachment zip files without markdown index files', () => {
    const content: ViewContent = {
      title: '附件',
      sections: [{ type: 'heading1', text: '附件' }],
      attachments: [{
        id: 'att-1',
        name: '说明.pdf',
        contentType: 'application/pdf',
        data: new TextEncoder().encode('attachment bytes'),
        path: '附件/阶段：入库/流程：入库流程/说明.pdf',
      }],
    };

    const files = buildDetachedAttachmentZipFiles(content);

    expect(files.map((file) => file.name)).toEqual(['附件/阶段：入库/流程：入库流程/说明.pdf']);
  });

});
