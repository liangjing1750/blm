const { test, expect } = require('@playwright/test');

test('save shows a blocking progress overlay while the server is writing', async ({ page }) => {
  const documentName = `save-overlay-${Date.now()}`;
  await page.route('**/api/save/**', async (route) => {
    if (route.request().postData()?.includes('Overlay Tester')) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-author-input').fill('Overlay Tester');
  await page.keyboard.press('Control+S');

  const progress = page.getByTestId('save-progress');
  await expect(progress).toBeVisible();
  await expect(progress).toHaveCSS('position', 'fixed');
  await expect(page.getByTestId('toolbar-save-as-button')).toBeDisabled();
  await expect(page.getByTestId('toolbar-export-button')).toBeDisabled();
  await expect(progress.locator('#save-progress-message')).toHaveText(/正在保存|正在准备保存|正在发送保存请求|数据已发送|保存完成/);

  await expect(page.getByTestId('modified-badge')).toBeHidden();
  await expect(progress).toHaveClass(/hidden/);
});
