const { test, expect } = require('@playwright/test');

const { createDocument } = require('./support/app-helpers');

function buildDocument(name, processName) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '',
    },
    roles: [],
    language: [],
    processes: [
      {
        id: 'P1',
        name: processName,
        trigger: '',
        outcome: '',
        tasks: [],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('用户可以从工作区选择两个文档并确认合并', async ({ page, request }) => {
  const leftName = `merge-left-${Date.now()}`;
  const rightName = `merge-right-${Date.now()}`;

  await createDocument(request, leftName, buildDocument(leftName, '左侧流程'));
  await createDocument(request, rightName, buildDocument(rightName, '右侧流程'));

  await page.goto('/');
  await page.getByTestId('toolbar-merge-button').click();

  await expect(page.getByTestId('merge-modal')).not.toHaveClass(/hidden/);
  await page.locator('#merge-left-select').selectOption(leftName);
  await page.locator('#merge-right-select').selectOption(rightName);
  await expect(page.locator('#merge-left-select')).toHaveValue(leftName);
  await expect(page.locator('#merge-right-select')).toHaveValue(rightName);

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toContainText('-合并');
});
