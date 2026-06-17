const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

async function clickToolbarMenuItem(page, dropdownId, testId) {
  await page.locator(`#${dropdownId} .tbar-dd-btn`).click();
  await page.getByTestId(testId).click();
}

test('shell general modals keep Angular event forwarding working', async ({ page, request }) => {
  const documentName = `shell-general-modals-${Date.now()}`;
  const peerDocumentName = `${documentName}-peer`;
  await createDocument(request, documentName, { meta: { title: documentName }, processes: [] });
  await createDocument(request, peerDocumentName, { meta: { title: peerDocumentName }, processes: [] });

  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('user-account-button').click();
  await expect(page.getByTestId('user-modal')).not.toHaveClass(/hidden/);
  await page.locator('#user-display-name-input').fill('E2E User');
  await page.getByTestId('user-save-button').click();
  await expect(page.getByTestId('user-modal')).toHaveClass(/hidden/);

  await clickToolbarMenuItem(page, 'dd-tools', 'toolbar-compare-button');
  await expect(page.getByTestId('compare-modal')).not.toHaveClass(/hidden/);
  await page.getByTestId('compare-close-button').click();
  await expect(page.getByTestId('compare-modal')).toHaveClass(/hidden/);

  await clickToolbarMenuItem(page, 'dd-tools', 'toolbar-merge-button');
  await expect(page.getByTestId('merge-modal')).not.toHaveClass(/hidden/);
  await page.locator('#merge-modal-overlay .modal-footer .btn-ghost').click();
  await expect(page.getByTestId('merge-modal')).toHaveClass(/hidden/);

  await page.evaluate(() => {
    window.showAppConfirm?.('E2E confirm');
  });
  await expect(page.getByTestId('app-dialog')).not.toHaveClass(/hidden/);
  await page.getByTestId('app-dialog-cancel').click();
  await expect(page.getByTestId('app-dialog')).toHaveClass(/hidden/);

  await clickToolbarMenuItem(page, 'dd-tools', 'toolbar-ai-button');
  await expect(page.locator('#ai-drawer')).not.toHaveClass(/hidden/);
  await page.locator('.ai-drawer-close').click();
  await expect(page.locator('#ai-drawer')).toHaveClass(/hidden/);
});
