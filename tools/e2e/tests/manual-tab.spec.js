const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildManualBackDoc(documentName) {
  return {
    meta: {
      title: documentName,
      domain: documentName,
      author: 'Codex',
      date: '2026-04-25',
    },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('用户可以在使用手册页查看文档列表和目录', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('toolbar-manual-button').click();
  await expect(page.getByTestId('manual-tab')).toBeVisible();
  await expect(page.locator('#tab-bar')).toBeHidden();
  await expect(page.locator('.manual-reader-head')).toBeVisible();
  await expect(page.locator('.manual-panel-title').first()).toContainText('文档');
  await expect(page.getByTestId('manual-doc-list')).toBeVisible();
  const docButtons = page.getByTestId('manual-doc-button');
  await expect(docButtons).toHaveCount(3);
  await expect(docButtons.nth(0)).toHaveAttribute('data-doc-id', 'user-manual');
  await expect(docButtons.nth(1)).toHaveAttribute('data-doc-id', 'design');
  await expect(docButtons.nth(2)).toHaveAttribute('data-doc-id', 'modeling-thinking');
  await expect(page.locator('.manual-doc-button.active')).toHaveAttribute('data-doc-id', 'user-manual');
  await expect(page.locator('.manual-doc-button[data-doc-id="modeling-thinking"]')).toBeVisible();
  await expect(page.locator('.manual-doc-button[data-doc-id="test-cases"]')).toHaveCount(0);
  await expect(page.locator('.manual-doc-button-summary')).toHaveCount(0);
  const docListLayout = await page.getByTestId('manual-doc-list').evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      display: style.display,
      columnCount: style.gridTemplateColumns.split(' ').filter(Boolean).length,
    };
  });
  expect(docListLayout.display).toBe('grid');
  expect(docListLayout.columnCount).toBe(3);
  await expect(page.locator('.manual-panel-title').nth(1)).toContainText('目录');
  await expect(page.getByTestId('manual-title')).toContainText('用户手册');
  await expect(page.getByTestId('manual-doc-intro')).toBeVisible();
  const introText = await page.getByTestId('manual-doc-intro').textContent();
  expect((introText || '').trim().length).toBeGreaterThan(0);
  await expect(page.locator('.manual-article h1').first()).toContainText('BLM用户手册');
  await expect(page.locator('.manual-article')).not.toContainText('# BLM用户手册');
  await expect(page.locator('.manual-article img').first()).toBeVisible();
  await expect(page.locator('.manual-outline-group').first()).toBeVisible();

  const firstChildren = page.locator('.manual-outline-children').first();
  await expect(firstChildren).toHaveClass(/collapsed/);
  await page.locator('.manual-outline-toggle').first().click();
  await expect(firstChildren).not.toHaveClass(/collapsed/);
  await expect(page.locator('.manual-outline-link.group-link').first()).toBeVisible();
  await expect(page.locator('.manual-article img').first()).toBeVisible();
  await expect(page.locator('.manual-rail')).toHaveCount(0);

  const manualReaderMetrics = await page.locator('.manual-reader').evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    overflowY: window.getComputedStyle(node).overflowY,
  }));
  expect(manualReaderMetrics.overflowY).toBe('auto');
  expect(manualReaderMetrics.scrollHeight).toBeGreaterThan(manualReaderMetrics.clientHeight);
});

test('使用手册支持打开业务建模思考并返回编辑界面', async ({ page, request }) => {
  const documentName = `manual-back-${Date.now()}`;
  await createDocument(request, documentName, buildManualBackDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await expect(page.getByTestId('domain-scroll')).toBeVisible();

  await page.getByTestId('toolbar-manual-button').click();
  await expect(page.getByTestId('manual-tab')).toBeVisible();

  await page.locator('.manual-doc-button[data-doc-id="modeling-thinking"]').click();
  await expect(page.getByTestId('manual-title')).toContainText('业务建模思考');
  await expect(page.locator('.manual-article h1').first()).toContainText('业务建模思考');
  await expect(page.locator('.manual-article')).not.toContainText('# 业务建模思考');

  await page.getByTestId('manual-back-button').click();
  await expect(page.getByTestId('manual-tab')).toHaveCount(0);
  await expect(page.locator('#tab-bar')).toBeVisible();
  await expect(page.getByTestId('domain-scroll')).toBeVisible();
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);
});

test('使用手册在 Markdown 渲染库缺失时仍渲染为 HTML', async ({ page }) => {
  await page.route('**/vendor/marked.umd.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.markedLib = null;',
    });
  });

  await page.goto('/');
  await page.getByTestId('toolbar-manual-button').click();

  await expect(page.getByTestId('manual-tab')).toBeVisible();
  await expect(page.locator('.manual-article h1').first()).toContainText('BLM用户手册');
  await expect(page.locator('.manual-article')).not.toContainText('# BLM用户手册');
});
