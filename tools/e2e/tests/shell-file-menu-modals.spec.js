const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

async function clickToolbarMenuItem(page, menuButtonText, testId) {
  await page.locator('.tbar-dd-btn').filter({ hasText: menuButtonText }).click();
  await page.getByTestId(testId).click();
}

test('shell file menu modals keep new/open/save-as/properties paths working', async ({ page, request }) => {
  const documentName = `shell-file-menu-${Date.now()}`;
  const copiedName = `${documentName}-copy`;
  await createDocument(request, documentName, { meta: { title: documentName }, processes: [] });

  await page.goto('/');

  await clickToolbarMenuItem(page, '文件', 'toolbar-new-button');
  await expect(page.getByTestId('new-doc-modal')).not.toHaveClass(/hidden/);
  await page.getByTestId('new-doc-name-input').fill(`${documentName}-new`);
  await page.getByTestId('new-doc-confirm-button').click();
  await expect(page.getByTestId('new-doc-modal')).toHaveClass(/hidden/);

  await clickToolbarMenuItem(page, '文件', 'toolbar-open-button');
  await expect(page.locator('#open-modal-overlay')).not.toHaveClass(/hidden/);
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);

  await clickToolbarMenuItem(page, '工具', 'toolbar-save-as-button');
  await expect(page.getByTestId('save-as-modal')).not.toHaveClass(/hidden/);
  await page.getByTestId('save-as-name-input').fill(copiedName);
  await page.getByTestId('save-as-confirm-button').click();
  await expect(page.getByTestId('save-as-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toHaveText(copiedName);

  await clickToolbarMenuItem(page, '文件', 'toolbar-properties-button');
  await expect(page.getByTestId('document-properties-modal')).not.toHaveClass(/hidden/);
  await page.locator('#document-properties-author').fill('E2E');
  await page.getByTestId('document-properties-save-button').click();
  await expect(page.getByTestId('document-properties-modal')).toHaveClass(/hidden/);
  await expect.poll(() => page.evaluate(() => window.S?.doc?.meta?.author)).toBe('E2E');
});

test('shell history modal tabs use Angular event bindings', async ({ page, request }) => {
  const documentName = `shell-history-menu-${Date.now()}`;
  await createDocument(request, documentName, { meta: { title: documentName }, processes: [] });
  await page.goto('/');
  await openDocument(page, documentName);

  await clickToolbarMenuItem(page, '历史', 'toolbar-history-button');
  await expect(page.getByTestId('history-modal')).not.toHaveClass(/hidden/);
  await page.locator('.history-tab').filter({ hasText: '本地提交记录' }).click();
  await expect(page.locator('.history-tab[data-tab="local"]')).toHaveClass(/active/);
  await page.locator('#history-modal-overlay .modal-footer .btn').click();
  await expect(page.getByTestId('history-modal')).toHaveClass(/hidden/);
});
