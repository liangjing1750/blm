const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const { workspaceDir } = require('./support/test-env');
const { acceptAppDialog, expectAppDialogCentered, expectAppDialogMessage } = require('./support/app-helpers');

test('用户可以通过点击按钮新建文档', async ({ page }) => {
  const documentName = '端到端新建文档';
  const documentPath = path.join(workspaceDir, documentName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await expect(page.getByTestId('new-doc-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);
  await expect
    .poll(() => fs.existsSync(documentPath), {
      message: `等待工作区生成 ${documentName}/manifest.json`,
    })
    .toBeTruthy();
});

test('空名称提示以居中弹窗显示', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-confirm-button').click();

  await expectAppDialogMessage(page, '请输入名称');
  await expectAppDialogCentered(page);
  await acceptAppDialog(page);
  await expect(page.getByTestId('new-doc-modal')).not.toHaveClass(/hidden/);
});
