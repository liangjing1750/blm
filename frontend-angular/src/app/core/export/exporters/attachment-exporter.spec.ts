import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlmDocument } from '../../document/document.model';
import { AttachmentExporter, buildAttachmentContent, processAttachmentRows, stageAttachmentGroups } from './attachment-exporter';

function createDocument(): BlmDocument {
  return {
    meta: { domain: '仓储' },
    roles: [],
    stages: [
      { uid: 'stage-in', name: '入库' },
      { uid: 'stage-empty', name: '无附件阶段' },
    ],
    stageFlowRefs: [
      { uid: 'ref-1', stageUid: 'stage-in', processUid: 'process-in', order: 1 },
      { uid: 'ref-2', stageUid: 'stage-empty', processUid: 'process-empty', order: 2 },
    ],
    processes: [{
      uid: 'process-in',
      name: '入库流程',
      nodes: [{
        uid: 'node-check',
        name: '审核仓单',
        prototypeFiles: [{
          uid: 'file-node',
          name: '审核说明.pdf',
          versionUid: 'v1',
          versions: [{ uid: 'v1', name: 'v1', contentType: 'application/pdf', uploadedAt: '2026-07-13' }],
          contentEncoding: 'base64',
          content: btoa('node attachment'),
          size: 1024,
        }],
      } as any],
      prototypeFiles: [{
        uid: 'file-process',
        name: '流程图附件.png',
        contentType: 'image/png',
        contentEncoding: 'base64',
        content: btoa('process attachment'),
        size: 2048,
      }],
    } as any, {
      uid: 'process-empty',
      name: '空流程',
      nodes: [],
    } as any],
    entities: [],
    businessComponents: [],
    businessConstructs: [],
    taskDefinitions: [],
    serviceGroups: [],
    services: [],
    terms: [],
    dataDictionaries: [],
    rules: [],
  };
}

describe('buildAttachmentContent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups process and node attachments as value-stream headings with zip package files', () => {
    const content = buildAttachmentContent(createDocument());

    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading1', text: '价值流环节' },
      { type: 'heading2', text: '阶段：入库' },
      { type: 'heading3', text: '流程：入库流程' },
      { type: 'heading4', text: '附件名称：流程图附件.png' },
      { type: 'heading4', text: '附件名称：审核说明.pdf' },
    ]));
    expect(content.sections.filter((section) => section.type === 'attachment')).toHaveLength(0);
    expect(content.attachments?.map((attachment) => attachment.path)).toEqual([
      '价值流环节/阶段：入库/流程：入库流程/流程图附件.png',
      '价值流环节/阶段：入库/流程：入库流程/审核说明.pdf',
    ]);
    expect(new TextDecoder().decode(content.attachments?.[0].data)).toBe('process attachment');
  });

  it('filters empty stages and processes from attachment grouping', () => {
    const groups = stageAttachmentGroups(createDocument());

    expect(groups.map((group) => group.stageName)).toEqual(['入库']);
    expect(groups[0].processes.map((process) => process.name)).toEqual(['入库流程']);
  });

  it('normalizes attachment metadata rows for UI reuse', () => {
    const rows = processAttachmentRows(createDocument().processes[0]);

    expect(rows.map((row) => row.name)).toEqual(['流程图附件.png', '审核说明.pdf']);
    expect(rows[1]).toMatchObject({
      scope: '节点附件',
      nodeName: '审核仓单',
      kind: 'application/pdf',
      version: 'v1',
    });
  });

  it('hydrates persisted attachment bytes before building export content', async () => {
    const document = createDocument();
    const file = (document.processes[0] as any).prototypeFiles[0];
    file.versionUid = 'process-v1';
    file.versions = [{ uid: 'process-v1', name: '流程图附件.png', contentType: 'image/png' }];
    delete file.content;
    delete file.contentEncoding;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe('/api/attachment/demo.blm/file-process/process-v1');
      return new Response(new TextEncoder().encode('downloaded process attachment'), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }));

    const content = await new AttachmentExporter(document, 'demo.blm').prepareContent();

    expect(content.sections.filter((section) => section.type === 'attachment')).toHaveLength(0);
    expect(new TextDecoder().decode(content.attachments?.[0].data)).toBe('downloaded process attachment');
  });
});
