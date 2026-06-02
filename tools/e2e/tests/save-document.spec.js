const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const { workspaceDir } = require('./support/test-env');
const { createDocument, openDocument, submitAppPrompt } = require('./support/app-helpers');

async function saveDocumentFromToolbar(page) {
  await page.locator('#btn-save').click();
  await confirmOptionalAppDialog(page);
}

async function confirmOptionalAppDialog(page) {
  const dialog = page.getByTestId('app-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByTestId('app-dialog-confirm').click();
  }
}

test('用户可以修改文档并点击保存落盘', async ({ page }) => {
  const documentName = '端到端保存文档';
  const documentPath = path.join(workspaceDir, documentName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-author-input').fill('Codex Tester');
  await page.getByTestId('domain-date-input').fill('2026-04');
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await expect(page.locator('#btn-save')).toContainText('立即同步');

  await saveDocumentFromToolbar(page);
  await expect(page.getByTestId('modified-badge')).toBeHidden();

  await expect
    .poll(() => {
      if (!fs.existsSync(documentPath)) {
        return null;
      }
      const saved = JSON.parse(fs.readFileSync(documentPath, 'utf-8'));
      return {
        author: saved.meta?.author || null,
        date: saved.meta?.date || null,
      };
    }, {
      message: `等待 ${documentName}/manifest.json 写入保存后的作者和日期`,
    })
    .toEqual({
      author: 'Codex Tester',
      date: '2026-04',
    });
});

test('保存后保留当前数据状态图工作位', async ({ page }) => {
  const documentName = `save-stay-put-${Date.now()}`;

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();
  await page.getByTestId('entity-name-input').fill('用户账号');
  await page.getByTestId('entity-draft-save').click();
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('状态');
  await page.getByTestId('entity-field-type-0').selectOption('enum');
  await page.getByTestId('entity-status-role-0').selectOption('primary');
  await page.locator('.field-td-note textarea').first().fill('草稿/待审核/已完成');

  await page.getByTestId('data-switch-state').click();
  await expect(page.getByTestId('state-editor-drawer')).toHaveCount(0);
  await page.getByTestId('state-editor-open').click();
  await expect(page.getByTestId('state-editor-drawer')).toBeVisible();
  const selectedEntityName = await page.getByTestId('data-state-entity-select').locator('option:checked').textContent();
  expect(selectedEntityName).toContain('用户账号');

  await saveDocumentFromToolbar(page);

  await expect(page.getByTestId('modified-badge')).toBeHidden();
  await expect(page.getByTestId('tab-data')).toHaveClass(/active/);
  await expect(page.getByTestId('state-editor-drawer')).toBeVisible();
  await expect(page.getByTestId('data-state-entity-select').locator('option:checked')).toContainText('用户账号');
  await expect(page.getByTestId('entity-state-field-select')).toHaveValue('状态');
});

test('用户可以通过另存生成新的业务域文档副本', async ({ page }) => {
  const originalName = `原业务域-${Date.now()}`;
  const copiedName = `另存业务域-${Date.now()}`;
  const originalPath = path.join(workspaceDir, originalName, 'manifest.json');
  const copiedPath = path.join(workspaceDir, copiedName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(originalName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-date-input').fill('2026-04-20');
  await page.getByTestId('toolbar-save-as-button').click();
  await page.getByTestId('save-as-name-input').fill(copiedName);
  await page.getByTestId('save-as-confirm-button').click();
  await confirmOptionalAppDialog(page);

  await expect(page.getByTestId('current-file-name')).toHaveText(copiedName);
  await expect(page.getByTestId('save-as-modal')).toHaveClass(/hidden/);

  await expect
    .poll(() => fs.existsSync(originalPath) && fs.existsSync(copiedPath), {
      message: '等待原文档和另存文档都写入工作区',
    })
    .toBeTruthy();

  const copied = JSON.parse(fs.readFileSync(copiedPath, 'utf-8'));
  expect(copied.meta?.domain).toBe(copiedName);
  expect(copied.meta?.title).toBe(copiedName);
  expect(copied.meta?.date).toBe('2026-04-20');
});

test('autosync persists panorama edits before showing synced state', async ({ page }) => {
  const documentName = `autosync-panorama-${Date.now()}`;
  const stageName = '自动同步阶段';
  const documentPath = path.join(workspaceDir, documentName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('tab-process').click();
  await page.getByTestId('stage-editor-open').click();
  await page.getByTestId('matrix-stage-add').first().click();
  await submitAppPrompt(page, stageName);

  await expect(page.getByTestId('stage-graph-node').filter({ hasText: stageName })).toBeVisible();
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await expect(page.getByTestId('modified-badge')).toBeHidden({ timeout: 10000 });

  await expect
    .poll(() => {
      if (!fs.existsSync(documentPath)) {
        return [];
      }
      const saved = JSON.parse(fs.readFileSync(documentPath, 'utf-8'));
      return (saved.stages || []).map((stage) => stage.name);
    }, {
      message: 'wait for autosync to persist the added stage before the synced badge disappears',
      timeout: 10000,
    })
    .toContain(stageName);

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await expect(page.getByTestId('stage-graph-node').filter({ hasText: stageName })).toBeVisible();
});

test('Ctrl+S triggers immediate sync for collaboration documents', async ({ page }) => {
  const documentName = `ctrl-s-sync-${Date.now()}`;
  const authorName = 'CtrlS Tester';
  const documentPath = path.join(workspaceDir, documentName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-author-input').fill(authorName);
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await page.keyboard.press('Control+S');

  await expect
    .poll(() => {
      if (!fs.existsSync(documentPath)) return '';
      const saved = JSON.parse(fs.readFileSync(documentPath, 'utf-8'));
      return saved.meta?.author || '';
    }, {
      message: 'wait for Ctrl+S immediate sync to persist the author change',
      timeout: 10000,
    })
    .toBe(authorName);

  await expect(page.getByTestId('modified-badge')).toBeHidden({ timeout: 10000 });
});

test('Ctrl+S does not fall back to the legacy save prompt while collaboration reconnects', async ({ page }) => {
  const documentName = `ctrl-s-reconnect-${Date.now()}`;

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-author-input').fill('Reconnect Tester');
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await page.evaluate(() => {
    S.collab.connected = false;
    try {
      S.collab.socket?.close();
    } catch (_) {}
    S.collab.socket = null;
  });

  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('collab-reconnect-overlay')).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(page.getByTestId('app-dialog')).toHaveClass(/hidden/);
  await expect(page.getByTestId('app-dialog-input')).toHaveClass(/hidden/);
  await expect(page.getByTestId('collab-reconnect-overlay')).toBeHidden({ timeout: 10000 });
});

test('collaboration conflict banner only exposes immediate sync', async ({ page }) => {
  const documentName = `collab-conflict-sync-${Date.now()}`;

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-author-input').fill('本地编辑者');
  await page.evaluate(() => {
    const remote = JSON.parse(JSON.stringify(S.doc));
    remote.meta = { ...(remote.meta || {}), author: '远端编辑者' };
    S.collab.pendingRemoteSnapshot = remote;
    S.collab.hasConflict = true;
    renderCollabConflictBanner();
  });

  const banner = page.getByTestId('collab-conflict-alert');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('检测到其他人更新');
  await expect(banner).toContainText('点击“立即同步”');
  await expect(banner.getByRole('button')).toHaveCount(1);
  await expect(banner.getByRole('button', { name: '立即同步' })).toBeVisible();
  await expect(banner).not.toContainText('应用远程');
  await expect(banner).not.toContainText('保留本地');
  await expect(banner).not.toContainText('稍后处理');

  await banner.getByRole('button', { name: '立即同步' }).click();
  await expect
    .poll(() => page.evaluate(() => ({
      hasConflict: Boolean(S.collab.hasConflict),
      pendingRemote: Boolean(S.collab.pendingRemoteSnapshot),
    })), {
      message: 'wait for immediate sync to clear the pending remote state',
      timeout: 10000,
    })
    .toEqual({ hasConflict: false, pendingRemote: false });
});

test('opening another document first syncs current collaboration edits without an unsaved prompt', async ({ page, request }) => {
  const firstName = `open-after-sync-source-${Date.now()}`;
  const secondName = `open-after-sync-target-${Date.now()}`;
  const firstPath = path.join(workspaceDir, firstName, 'manifest.json');
  await createDocument(request, secondName, {
    meta: { title: secondName, domain: secondName },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(firstName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-author-input').fill('Open After Sync Tester');
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: secondName }).first().click();

  await expect(page.getByTestId('app-dialog')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toHaveText(secondName, { timeout: 15000 });
  await expect
    .poll(() => {
      if (!fs.existsSync(firstPath)) return '';
      const saved = JSON.parse(fs.readFileSync(firstPath, 'utf-8'));
      return saved.meta?.author || '';
    }, {
      message: 'wait for current document edits to sync before switching documents',
      timeout: 10000,
    })
    .toBe('Open After Sync Tester');
});

test('collaboration ack keeps the focused field and cursor position', async ({ page }) => {
  const documentName = `focus-after-sync-${Date.now()}`;
  const authorName = 'Focus Cursor Tester';

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  const authorInput = page.getByTestId('domain-author-input');
  await authorInput.fill(authorName);
  await authorInput.evaluate((input) => input.setSelectionRange(6, 6));
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await expect(page.getByTestId('modified-badge')).toBeHidden({ timeout: 10000 });

  const focusState = await page.evaluate(() => ({
    testId: document.activeElement?.getAttribute('data-testid') || '',
    value: document.activeElement?.value || '',
    selectionStart: document.activeElement?.selectionStart ?? null,
  }));
  expect(focusState).toEqual({
    testId: 'domain-author-input',
    value: authorName,
    selectionStart: 6,
  });
});

test('autosync keeps full panorama value stream text while typing', async ({ page }) => {
  const documentName = `autosync-panorama-column-${Date.now()}`;
  const columnName = '测试';
  const documentPath = path.join(workspaceDir, documentName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('tab-process').click();
  await page.getByTestId('stage-editor-open').click();
  await page.getByTestId('matrix-column-name').first().fill(columnName);
  await expect(page.getByTestId('matrix-column-name').first()).toHaveValue(columnName);
  await expect(page.getByTestId('modified-badge')).toBeHidden({ timeout: 10000 });

  await expect
    .poll(() => {
      if (!fs.existsSync(documentPath)) {
        return [];
      }
      const saved = JSON.parse(fs.readFileSync(documentPath, 'utf-8'));
      return (saved.panorama?.columns || []).map((column) => column.name);
    }, {
      message: 'wait for autosync to persist the complete value stream name',
      timeout: 10000,
    })
    .toContain(columnName);

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('matrix-column-name').first()).toHaveValue(columnName);
});

test('stage flow created in stage view is not duplicated after reload', async ({ page }) => {
  const documentName = `autosync-stage-flow-${Date.now()}`;
  const stageName = '阶段流程测试';
  const flowName = '阶段内流程';
  const documentPath = path.join(workspaceDir, documentName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('tab-process').click();
  await page.getByTestId('stage-editor-open').click();
  await page.getByTestId('matrix-stage-add').first().click();
  await submitAppPrompt(page, stageName);
  await page.evaluate(() => {
    const stageId = S.doc.stages[0].id;
    addStageFlowNode(stageId);
  });
  await page.getByTestId('stage-flow-name-input').first().fill(flowName);
  await expect(page.getByTestId('stage-flow-name-input').first()).toHaveValue(flowName);
  await expect(page.getByTestId('modified-badge')).toBeHidden({ timeout: 10000 });

  await expect
    .poll(() => {
      if (!fs.existsSync(documentPath)) return null;
      const saved = JSON.parse(fs.readFileSync(documentPath, 'utf-8'));
      const process = (saved.processes || []).find((item) => item.name === flowName);
      if (!process) return null;
      const processUid = process.uid || process.id;
      const refCount = (saved.stageFlowRefs || []).filter((ref) => (
        (ref.processUid || ref.processId) === processUid
      )).length;
      return refCount;
    }, {
      message: 'wait for the stage flow reference to be persisted once',
      timeout: 10000,
    })
    .toBe(1);

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  const state = await page.evaluate((name) => {
    const processes = (S.doc.processes || []).filter((item) => item.name === name);
    const processIds = new Set(processes.map((item) => item.id));
    return {
      processCount: processes.length,
      refCount: (S.doc.stageFlowRefs || []).filter((ref) => processIds.has(ref.processId)).length,
    };
  }, flowName);
  expect(state).toEqual({ processCount: 1, refCount: 1 });
});

test('opening a document uses the centered operation progress dialog', async ({ page, request }) => {
  const documentName = `open-progress-${Date.now()}`;
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.route('**/api/load/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await expect(page.getByTestId('save-progress')).toBeVisible();
  await expect(page.locator('#save-progress-message')).toContainText('正在打开');
  await expect(page.locator('.workspace-doc-loading')).toHaveCount(0);
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);
  await expect(page.getByTestId('save-progress')).toBeHidden();
});

test('open workspace paginates document cards by ten per page', async ({ page, request }) => {
  const prefix = `open-page-${Date.now()}`;
  const spaceName = `分页空间-${Date.now()}`;
  for (let index = 1; index <= 12; index += 1) {
    const name = `${prefix}-${String(index).padStart(2, '0')}`;
    await createDocument(request, name, {
      meta: {
        title: name,
        domain: name,
        author: '分页测试',
        date: '2026-06-01',
        space: spaceName,
      },
      roles: [],
      language: [],
      stages: [],
      stageLinks: [],
      stageFlowRefs: [],
      stageFlowLinks: [],
      processes: [],
      entities: [],
      relations: [],
      rules: [],
    });
  }

  await page.goto('/');
  await page.getByTestId('toolbar-open-button').click();
  await page.getByTestId('open-space-tabs').locator('button').filter({ hasText: spaceName }).click({ timeout: 15000 });
  await expect(page.getByTestId('workspace-doc-card')).toHaveCount(10);
  await expect(page.getByTestId('workspace-pagination')).toContainText('1 / 2');

  await page.getByTestId('workspace-pagination').locator('button').last().click();
  await expect(page.getByTestId('workspace-doc-card')).toHaveCount(2);
  await expect(page.getByTestId('workspace-pagination')).toContainText('2 / 2');
});

test('open workspace waits for document summaries before rendering document cards', async ({ page, request }) => {
  const documentName = `open-summary-lazy-${Date.now()}`;
  await createDocument(request, documentName, {
    meta: {
      title: documentName,
      domain: documentName,
      space: `摘要空间-${Date.now()}`,
    },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.route('**/api/files/meta', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId('toolbar-open-button').click();
  await expect(page.getByTestId('workspace-doc-card')).toHaveCount(0);
  await expect(page.locator('#file-list')).toContainText('正在加载');
  await expect(page.getByTestId('workspace-doc-card').filter({ hasText: documentName })).toBeVisible({ timeout: 15000 });
});

test('slow initial collaboration join does not show the reconnect blocker while editing', async ({ page, request }) => {
  const documentName = `large-initial-collab-${Date.now()}`;
  const largeNote = 'x'.repeat(2_800_000);
  await createDocument(request, documentName, {
    meta: {
      title: documentName,
      domain: documentName,
      note: largeNote,
    },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class SlowJoinWebSocket extends NativeWebSocket {
      send(data) {
        let payload = null;
        try {
          payload = JSON.parse(String(data));
        } catch (_) {}
        if (payload?.type === 'join') {
          setTimeout(() => super.send(data), 1200);
          return undefined;
        }
        return super.send(data);
      }
    };
    window.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    window.WebSocket.OPEN = NativeWebSocket.OPEN;
    window.WebSocket.CLOSING = NativeWebSocket.CLOSING;
    window.WebSocket.CLOSED = NativeWebSocket.CLOSED;
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('domain-author-input').fill('Slow Initial Join Tester');
  await expect(page.getByTestId('collab-reconnect-overlay')).toBeHidden();
  await expect(page.getByTestId('collab-reconnect-overlay')).toBeHidden({ timeout: 7000 });
  await expect(page.getByTestId('collab-status')).toContainText('在线', { timeout: 10000 });
});
