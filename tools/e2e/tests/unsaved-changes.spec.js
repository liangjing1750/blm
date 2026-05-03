const { test, expect } = require('@playwright/test');

const {
  acceptAppDialog,
  cancelAppDialog,
  createDocument,
  createNewDocument,
  expectAppDialogMessage,
  openDocument,
} = require('./support/app-helpers');

function buildDocument(name, date = '') {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date,
    },
    roles: [],
    language: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('未保存修改时切换文档会先确认', async ({ page, request }) => {
  const sourceName = `unsaved-source-${Date.now()}`;
  const targetName = `unsaved-target-${Date.now()}`;

  await createDocument(request, sourceName, buildDocument(sourceName));
  await createDocument(request, targetName, buildDocument(targetName, '2026-04-20'));

  await page.goto('/');
  await openDocument(page, sourceName);
  await page.getByTestId('domain-date-input').fill('2026-04');
  await expect(page.getByTestId('modified-badge')).toBeVisible();

  async function tryOpenTarget(handleDialog) {
    await page.getByTestId('toolbar-open-button').click();
    await expect(page.locator('#open-modal-overlay')).not.toHaveClass(/hidden/);

    await page.locator('.file-list-item').filter({ hasText: targetName }).first().click();
    await expectAppDialogMessage(page, '未保存');
    await handleDialog();
  }

  await tryOpenTarget(() => cancelAppDialog(page));
  await expect(page.getByTestId('current-file-name')).toHaveText(sourceName);
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await expect(page.locator('#open-modal-overlay')).not.toHaveClass(/hidden/);

  await page.locator('#open-modal-overlay').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('#open-modal-overlay')).toHaveClass(/hidden/);

  await tryOpenTarget(() => acceptAppDialog(page));
  await expect(page.getByTestId('current-file-name')).toHaveText(targetName);
  await expect(page.getByTestId('modified-badge')).toBeHidden();
});

test('未保存修改时关闭页面会触发离开提醒', async ({ page }) => {
  const documentName = `unsaved-beforeunload-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('domain-date-input').fill('2026-04-20');
  await expect(page.getByTestId('modified-badge')).toBeVisible();

  const dialogTypePromise = new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      const type = dialog.type();
      await dialog.dismiss();
      resolve(type);
    });
  });

  await page.close({ runBeforeUnload: true });
  expect(await dialogTypePromise).toBe('beforeunload');
  expect(page.isClosed()).toBe(false);

  await page.close();
});
