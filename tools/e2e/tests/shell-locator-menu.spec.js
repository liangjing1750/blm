const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('shell locator menu is rendered by Angular and keeps context actions visible', async ({ page, request }) => {
  const documentName = `shell-locator-${Date.now()}`;
  await createDocument(request, documentName, { meta: { title: documentName }, processes: [] });

  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('current-file-name').click({ button: 'right' });
  await expect(page.getByTestId('locator-menu')).not.toHaveClass(/hidden/);
  await expect(page.getByTestId('locator-menu').locator('button')).toContainText(['复制当前视图链接']);

  await page.mouse.click(20, 20);
  await expect(page.getByTestId('locator-menu')).toHaveClass(/hidden/);
});
