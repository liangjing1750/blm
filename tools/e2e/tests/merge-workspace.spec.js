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
  await page.locator('#merge-right-select').selectOption(rightName);
  await page.locator('#merge-left-select').selectOption(leftName);
  await expect(page.locator('#merge-left-select')).toHaveValue(leftName);
  await expect(page.locator('#merge-right-select')).toHaveValue(rightName);

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await expect(page.getByTestId('merge-confirm-button')).toHaveText('合并前检查');
  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-modal')).not.toHaveClass(/hidden/);
  await expect(page.getByTestId('merge-analysis')).toContainText('未检测到冲突');
  await expect(page.getByTestId('merge-confirm-button')).toHaveText('生成合并文档');
  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toContainText('-合并');
});

test('用户可以选择当前版本和历史版本做只读比对', async ({ page, request }) => {
  const documentName = `compare-history-${Date.now()}`;

  await createDocument(request, documentName, buildDocument(documentName, '原始流程'));
  await createDocument(request, documentName, buildDocument(documentName, '当前流程'));
  let releaseHistoryLoad;
  let markHistoryLoadStarted;
  const historyLoadStarted = new Promise((resolve) => {
    markHistoryLoadStarted = resolve;
  });
  await page.route('**/api/history/load', async (route) => {
    markHistoryLoadStarted();
    await new Promise((resolve) => {
      releaseHistoryLoad = resolve;
    });
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId('toolbar-compare-button').click();

  await expect(page.getByTestId('compare-modal')).not.toHaveClass(/hidden/);
  await page.getByTestId('compare-modal').click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('compare-modal')).not.toHaveClass(/hidden/);
  await page.getByTestId('compare-left-select').selectOption(documentName);
  await page.getByTestId('compare-right-select').selectOption(documentName);
  await expect(page.getByTestId('compare-left-select')).toHaveValue(documentName);
  await expect(page.getByTestId('compare-right-select')).toHaveValue(documentName);
  await expect.poll(() => page.evaluate(() => S.compare.workspaceNames.right)).toBe(documentName);
  await expect.poll(async () => page.getByTestId('compare-right-version-select').locator('option').count()).toBeGreaterThan(1);
  await expect(page.getByTestId('compare-left-version-select')).toHaveValue('');
  await expect(page.getByTestId('compare-right-version-select')).toHaveValue('');

  const historyOptionValue = await page.getByTestId('compare-right-version-select').locator('option').nth(1).getAttribute('value');
  expect(historyOptionValue).toBeTruthy();
  await page.getByTestId('compare-right-version-select').selectOption(historyOptionValue);
  await expect(page.getByTestId('compare-right-version-select')).toHaveValue(historyOptionValue);
  await expect(page.getByTestId('compare-result')).toContainText('开始比对');
  await expect(page.getByTestId('compare-result')).not.toContainText('版本比对报告');

  await expect(page.getByTestId('compare-start-button')).toBeEnabled();
  await page.getByTestId('compare-start-button').click();
  await historyLoadStarted;
  await expect(page.getByTestId('compare-progress')).toBeVisible();
  await expect(page.getByTestId('compare-start-button')).toBeDisabled();
  releaseHistoryLoad();
  await expect(page.getByTestId('compare-result')).toContainText('差异');
  await expect(page.getByTestId('compare-result')).toContainText('版本比对报告');
  await expect(page.getByTestId('compare-result')).toContainText('总体结论');
  await expect(page.getByTestId('compare-result')).toContainText('重点变化');
  await expect(page.getByTestId('compare-result')).toContainText('流程 P1');
  await expect(page.getByTestId('compare-result')).toContainText('流程名称');
  await expect(page.getByTestId('compare-result')).not.toContainText('processes[0].name');
  await expect(page.getByTestId('compare-result')).toContainText('当前流程');
  await expect(page.getByTestId('compare-result')).toContainText('原始流程');
  await expect(page.getByTestId('compare-modal').locator('[data-testid="merge-confirm-button"]')).toHaveCount(0);
  await page.getByTestId('compare-close-button').click();
  await expect(page.getByTestId('compare-modal')).toHaveClass(/hidden/);
});

test('比对报告将图形坐标变化汇总为布局变化', async ({ page, request }) => {
  const documentName = `compare-layout-${Date.now()}`;
  const original = buildDocument(documentName, '布局流程');
  original.entities = [{ id: 'E1', name: '仓库', group: '', note: '', pos: { x: 20, y: 30 }, fields: [], state_transitions: [] }];
  const current = buildDocument(documentName, '布局流程');
  current.entities = [{ id: 'E1', name: '仓库', group: '', note: '', pos: { x: 7777, y: 8888 }, fields: [], state_transitions: [] }];

  await createDocument(request, documentName, original);
  await createDocument(request, documentName, current);

  await page.goto('/');
  await page.getByTestId('toolbar-compare-button').click();
  await page.getByTestId('compare-left-select').selectOption(documentName);
  await page.getByTestId('compare-right-select').selectOption(documentName);
  await expect.poll(() => page.evaluate(() => S.compare.workspaceNames.right)).toBe(documentName);
  await expect.poll(async () => page.getByTestId('compare-right-version-select').locator('option').count()).toBeGreaterThan(1);
  const historyOptionValue = await page.getByTestId('compare-right-version-select').locator('option').nth(1).getAttribute('value');
  await page.getByTestId('compare-right-version-select').selectOption(historyOptionValue);
  await expect(page.getByTestId('compare-right-version-select')).toHaveValue(historyOptionValue);
  await page.getByTestId('compare-start-button').click();

  await expect(page.getByTestId('compare-result')).toContainText('图形与布局变化');
  await expect(page.getByTestId('compare-result')).toContainText('实体 E1 仓库');
  await expect(page.getByTestId('compare-result')).not.toContainText('pos.x');
  await expect(page.getByTestId('compare-result')).not.toContainText('7777');
});

test('合并同名规则冲突时提供裁决选项', async ({ page, request }) => {
  const leftName = `merge-rule-left-${Date.now()}`;
  const rightName = `merge-rule-right-${Date.now()}`;
  const leftDoc = buildDocument(leftName, '规则流程');
  const rightDoc = buildDocument(rightName, '规则流程');
  leftDoc.rules = [
    { uid: 'left-rule-uid', id: 'R1', name: '校验规则', type: 'Check', applies_to: 'P1', description: '左侧口径', formula: 'amount > 0' },
  ];
  rightDoc.rules = [
    { uid: 'right-rule-uid', id: 'R1', name: '校验规则', type: 'Check', applies_to: 'P1', description: '右侧口径', formula: 'amount >= 1' },
  ];

  await createDocument(request, leftName, leftDoc);
  await createDocument(request, rightName, rightDoc);

  await page.goto('/');
  await page.getByTestId('toolbar-merge-button').click();
  await page.locator('#merge-right-select').selectOption(rightName);
  await page.locator('#merge-left-select').selectOption(leftName);
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByTestId('merge-confirm-button').click();

  await expect(page.getByTestId('merge-confirm-button')).toHaveText('生成合并文档');
  await expect(page.locator('.merge-conflict-card')).toContainText('规则同名但内容不同');
  await expect(page.locator('.merge-conflict-card')).toContainText('校验规则');
  await expect(page.locator('[data-merge-conflict]').first()).toContainText('保留左侧');
  await expect(page.locator('[data-merge-conflict]').first()).toContainText('保留右侧');
  await expect(page.locator('[data-merge-conflict]').first()).toContainText('两者都保留');
});

test('合并校验问题提供推荐修复后才能生成结果', async ({ page, request }) => {
  const leftName = `merge-validation-left-${Date.now()}`;
  const rightName = `merge-validation-right-${Date.now()}`;
  const leftDoc = buildDocument(leftName, '校验流程');
  const rightDoc = buildDocument(rightName, '校验流程');
  leftDoc.rules = [
    { id: 'R1', name: '孤立规则', type: 'Check', applies_to: 'P-missing', description: '引用已删除流程', formula: '' },
  ];

  await createDocument(request, leftName, leftDoc);
  await createDocument(request, rightName, rightDoc);

  await page.goto('/');
  await page.getByTestId('toolbar-merge-button').click();
  await page.locator('#merge-right-select').selectOption(rightName);
  await page.locator('#merge-left-select').selectOption(leftName);
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-validation-guide')).toContainText('需要人工选择');
  await expect(page.getByTestId('merge-validation-guide')).toContainText('孤立规则');
  await page.getByTestId('merge-validation-fix-clear').first().click();
  await expect(page.getByTestId('merge-validation-guide')).toHaveCount(0);

  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toContainText('-合并');
});
