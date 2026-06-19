const { expect } = require('@playwright/test');

async function createDocument(request, name, doc) {
  const response = await request.post(`/api/save/${encodeURIComponent(name)}`, {
    data: doc,
  });
  expect(response.ok()).toBeTruthy();
}

async function openDocument(page, name, options = {}) {
  const { expandSidebar = true } = options;
  const emptyOpenButton = page.locator('.empty-state button').filter({ hasText: /打开|鎵撳紑/ });
  if (await emptyOpenButton.count()) {
    await emptyOpenButton.first().click();
  } else {
    const fileMenuButton = page.locator('#dd-file .tbar-dd-btn');
    const openMenuItem = page.getByTestId('toolbar-open-button');
    await fileMenuButton.click();
    if (!(await openMenuItem.isVisible().catch(() => false))) {
      await fileMenuButton.click();
    }
    if (await openMenuItem.isVisible().catch(() => false)) {
      await openMenuItem.click();
    } else {
      await page.evaluate(() => window.App?.cmdOpen?.());
    }
  }
  const searchBox = page.locator('#open-file-search');
  if (await searchBox.count()) {
    await searchBox.fill(name);
  }
  await clickOpenDocumentCard(page, name);
  await expect(page.getByTestId('current-file-name')).toHaveText(name);
  if (expandSidebar && await page.locator('#sidebar.sb-collapsed').count()) {
    const angularToggle = page.locator('#angular-sb-toggle-btn');
    if (await angularToggle.count()) {
      await angularToggle.click();
    } else {
      await page.locator('#sb-toggle-btn').click();
    }
  }
}

async function clickOpenDocumentCard(page, name) {
  const card = page.locator('.file-list-item, [data-testid="workspace-doc-card"]').filter({ hasText: name }).first();
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    if (await card.count()) {
      await card.click();
      return;
    }
    const next = page.locator('[data-testid="workspace-pagination"] button, #workspace-pagination button').filter({ hasText: /下一页|Next/ }).first();
    if (!(await next.count()) || await next.isDisabled().catch(() => true)) break;
    await next.click();
    await page.waitForTimeout(300);
  }
  throw new Error(`未找到文档卡片：${name}`);
}

async function expandValueStreams(page) {
  const heads = page.locator('.sb-value-head');
  const count = await heads.count();
  for (let index = 0; index < count; index += 1) {
    const head = heads.nth(index);
    if (await head.locator('.sb-caret.is-collapsed').count()) {
      await head.click();
    }
  }
}

async function createNewDocument(page, name) {
  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(name);
  await page.getByTestId('new-doc-confirm-button').click();
  await expect(page.getByTestId('new-doc-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toHaveText(name);
}

async function expectAppDialogCentered(page) {
  await expect(page.getByTestId('app-dialog')).not.toHaveClass(/hidden/);
  const metrics = await page.getByTestId('app-dialog').evaluate((overlay) => {
    const dialog = overlay.querySelector('.app-dialog');
    const overlayRect = overlay.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    return {
      overlayCenterX: overlayRect.left + overlayRect.width / 2,
      overlayCenterY: overlayRect.top + overlayRect.height / 2,
      dialogCenterX: dialogRect.left + dialogRect.width / 2,
      dialogCenterY: dialogRect.top + dialogRect.height / 2,
    };
  });
  expect(Math.abs(metrics.overlayCenterX - metrics.dialogCenterX)).toBeLessThanOrEqual(2);
  expect(Math.abs(metrics.overlayCenterY - metrics.dialogCenterY)).toBeLessThanOrEqual(2);
}

async function expectAppDialogMessage(page, text) {
  await expect(page.getByTestId('app-dialog')).not.toHaveClass(/hidden/);
  await expect(page.getByTestId('app-dialog-message')).toContainText(text);
}

async function acceptAppDialog(page) {
  await page.getByTestId('app-dialog-confirm').click();
  await expect(page.getByTestId('app-dialog')).toHaveClass(/hidden/);
}

async function cancelAppDialog(page) {
  await page.getByTestId('app-dialog-cancel').click();
  await expect(page.getByTestId('app-dialog')).toHaveClass(/hidden/);
}

async function submitAppPrompt(page, value) {
  await page.getByTestId('app-dialog-input').fill(value);
  await acceptAppDialog(page);
}

async function dragResizeHandle(page, handleLocator, deltaX) {
  const box = await handleLocator.boundingBox();
  if (!box) {
    throw new Error('未找到可拖拽的抽屉拉伸手柄');
  }
  const x = box.x + box.width / 2;
  const y = box.y + Math.max(24, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y, { steps: 12 });
  await page.mouse.up();
}

module.exports = {
  createDocument,
  openDocument,
  expandValueStreams,
  createNewDocument,
  expectAppDialogCentered,
  expectAppDialogMessage,
  acceptAppDialog,
  cancelAppDialog,
  submitAppPrompt,
  dragResizeHandle,
};
