import { describe, expect, it, vi } from 'vitest';
import { createProcessEditorLegacyAdapter } from './process-editor-legacy-adapter';

describe('ProcessEditorLegacyAdapter', () => {
  it('selects a task as navigation without marking the document modified', () => {
    const win = {
      S: {
        doc: {
          processes: [{
            uid: 'process-1',
            id: 'process-1',
            name: '流程1',
            nodes: [{ uid: 'node-1', id: 'node-1', name: '节点1' }],
          }],
        },
        ui: { procId: 'process-1', taskId: null },
      },
      markModified: () => {
        win.modified = true;
      },
      renderSidebar: () => {
        win.sidebarRendered = true;
      },
      modified: false,
      sidebarRendered: false,
    } as any;
    const adapter = createProcessEditorLegacyAdapter(win);

    adapter.selectTask('node-1');

    expect(win.S.ui.taskId).toBe('node-1');
    expect(win.modified).toBe(false);
    expect(win.sidebarRendered).toBe(true);
  });

  it('previews node attachments by resolving the node owner directly', () => {
    const open = vi.fn(() => ({ closed: false }));
    const fallback = vi.fn();
    const win = {
      S: {
        currentFile: 'demo.json',
        doc: {
          meta: { domain: 'Demo' },
          processes: [{
            uid: 'process-1',
            id: 'process-1',
            name: '流程1',
            nodes: [{
              uid: 'node-1',
              id: 'node-1',
              name: '节点1',
              prototypeFiles: [{
                uid: 'node-file-1',
                name: '节点说明.txt',
                versionUid: 'node-file-1-v1',
                versions: [{
                  uid: 'node-file-1-v1',
                  name: '节点说明.txt',
                  contentType: 'text/plain',
                  content: 'node attachment',
                }],
              }],
            }],
          }],
        },
        ui: { procId: 'process-1', taskId: null },
      },
      openProcessPrototypeFile: fallback,
      URL: {
        createObjectURL: vi.fn(() => 'blob:node-file-1'),
        revokeObjectURL: vi.fn(),
      },
      Blob: globalThis.Blob,
      open,
    } as any;
    const adapter = createProcessEditorLegacyAdapter(win);

    adapter.previewPrototype('node-1', 'node-file-1');

    expect(open).toHaveBeenCalledWith('blob:node-file-1', '_blank', 'noopener');
    expect(fallback).not.toHaveBeenCalled();
  });
});
