const { test, expect } = require('@playwright/test');

test('process view uses one focused flow diagram instead of the dense card wall', async ({ page }) => {
  const documentName = `process-flow-view-${Date.now()}`;

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await expect(page.getByTestId('new-doc-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();

  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.getByTestId('process-flow-select')).toBeVisible();
  await expect(page.getByTestId('process-flow-summary')).toHaveCount(0);
  await expect(page.locator('.process-flow-kicker')).toHaveCount(0);
  await expect(page.locator('.process-flow-view .live-diagram-hint')).toHaveCount(0);
  await expect(page.locator('#proc-diagram')).toBeVisible();
  await expect(page.getByTestId('process-card-view')).toHaveCount(0);
  await expect(page.getByTestId('process-overview-view')).toHaveCount(0);
  await expect(page.locator('.proc-card')).toHaveCount(0);
});
