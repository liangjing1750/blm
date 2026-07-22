import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { buildAttachmentGroups, buildAttachmentStageTabs } from './attachment-management-workbench';

function createDocument(): any {
  return {
    stages: [
      { uid: 'stage-a', name: '阶段A' },
      { uid: 'stage-b', name: '阶段B' },
    ],
    stageFlowRefs: [
      { stageUid: 'stage-a', processUid: 'process-a', order: 1 },
      { stageUid: 'stage-b', processUid: 'process-b', order: 1 },
    ],
    processes: [
      {
        uid: 'process-a',
        name: '流程A',
        prototypeFiles: [
          { uid: 'file-pa', name: '流程说明.pdf', contentType: 'application/pdf' },
        ],
        nodes: [
          {
            uid: 'node-a1',
            name: '节点A1',
            prototypeFiles: [
              { uid: 'file-na1', name: '节点图.png', contentType: 'image/png' },
              { uid: 'file-na2', name: '节点模板.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            ],
          },
          { uid: 'node-a2', name: '无附件节点', prototypeFiles: [] },
        ],
      },
      {
        uid: 'process-b',
        name: '流程B',
        prototypeFiles: [],
        nodes: [
          {
            uid: 'node-b1',
            name: '节点B1',
            prototypeFiles: [
              { uid: 'file-nb1', name: '节点B附件.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
            ],
          },
        ],
      },
    ],
  };
}

describe('AttachmentManagementWorkbench helpers', () => {
  it('uses attachment counts, not process counts, for stage tab badges', () => {
    const tabs = buildAttachmentStageTabs(createDocument());

    expect(tabs).toEqual([
      { id: 'stage-a', name: '阶段A', processCount: 1, attachmentCount: 3 },
      { id: 'stage-b', name: '阶段B', processCount: 1, attachmentCount: 1 },
    ]);
  });

  it('summarizes attachment-specific process card metrics', () => {
    const groups = buildAttachmentGroups(createDocument(), 'stage-a', '');

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      processId: 'process-a',
      processName: '流程A',
      processAttachmentCount: 1,
      nodeAttachmentCount: 2,
      attachedNodeCount: 1,
    });
    expect(groups[0].attachments.map((attachment) => attachment.name)).toEqual(['流程说明.pdf', '节点图.png', '节点模板.xlsx']);
  });
  it('does not count a process twice when stale stage references point to another stage', () => {
    const document = createDocument();
    document.processes[0].stageUid = 'stage-a';
    document.stageFlowRefs.push({ stageUid: 'stage-b', processUid: 'process-a', order: 2 });

    const tabs = buildAttachmentStageTabs(document);

    expect(tabs.map(({ id, processCount, attachmentCount }) => ({ id, processCount, attachmentCount }))).toEqual([
      { id: 'stage-a', processCount: 1, attachmentCount: 3 },
      { id: 'stage-b', processCount: 1, attachmentCount: 1 },
    ]);
  });
});
