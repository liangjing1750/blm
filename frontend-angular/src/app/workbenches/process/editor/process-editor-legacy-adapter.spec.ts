import { describe, expect, it } from 'vitest';
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
});
