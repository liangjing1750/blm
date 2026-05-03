const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const { workspaceDir } = require('./support/test-env');

test('用户可以修改文档并点击保存落盘', async ({ page }) => {
  const documentName = '端到端保存文档';
  const documentPath = path.join(workspaceDir, documentName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-author-input').fill('Codex Tester');
  await page.getByTestId('domain-date-input').fill('2026-04');
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await expect(page.getByTestId('save-alert')).toBeVisible();

  await page.keyboard.press('Control+S');
  await expect(page.getByTestId('modified-badge')).toBeHidden();
  await expect(page.getByTestId('save-alert')).toBeHidden();

  await expect
    .poll(() => {
      if (!fs.existsSync(documentPath)) {
        return null;
      }
      const saved = JSON.parse(fs.readFileSync(documentPath, 'utf-8'));
      return {
        author: saved.meta?.author || null,
        date: saved.meta?.date || null,
      };
    }, {
      message: `等待 ${documentName}/manifest.json 写入保存后的作者和日期`,
    })
    .toEqual({
      author: 'Codex Tester',
      date: '2026-04',
    });
});

test('保存后保留当前数据状态图工作位', async ({ page }) => {
  const documentName = `save-stay-put-${Date.now()}`;

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(documentName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();
  await page.getByTestId('entity-name-input').fill('用户账号');
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('状态');
  await page.getByTestId('entity-field-type-0').selectOption('enum');
  await page.getByTestId('entity-status-role-0').selectOption('primary');
  await page.locator('.field-td-note textarea').first().fill('草稿/待审核/已完成');

  await page.getByTestId('data-switch-state').click();
  await expect(page.getByTestId('state-editor-drawer')).toBeVisible();
  await expect(page.getByTestId('data-state-entity-select')).toHaveValue('E1');

  await page.keyboard.press('Control+S');

  await expect(page.getByTestId('modified-badge')).toBeHidden();
  await expect(page.getByTestId('tab-data')).toHaveClass(/active/);
  await expect(page.getByTestId('state-editor-drawer')).toBeVisible();
  await expect(page.getByTestId('data-state-entity-select')).toHaveValue('E1');
  await expect(page.getByTestId('entity-state-field-select')).toHaveValue('状态');
});

test('用户可以通过另存生成新的业务域文档副本', async ({ page }) => {
  const originalName = `原业务域-${Date.now()}`;
  const copiedName = `另存业务域-${Date.now()}`;
  const originalPath = path.join(workspaceDir, originalName, 'manifest.json');
  const copiedPath = path.join(workspaceDir, copiedName, 'manifest.json');

  await page.goto('/');
  await page.getByTestId('toolbar-new-button').click();
  await page.getByTestId('new-doc-name-input').fill(originalName);
  await page.getByTestId('new-doc-confirm-button').click();

  await page.getByTestId('domain-date-input').fill('2026-04-20');
  await page.getByTestId('toolbar-save-as-button').click();
  await page.getByTestId('save-as-name-input').fill(copiedName);
  await page.getByTestId('save-as-confirm-button').click();

  await expect(page.getByTestId('current-file-name')).toHaveText(copiedName);
  await expect(page.getByTestId('save-as-modal')).toHaveClass(/hidden/);

  await expect
    .poll(() => fs.existsSync(originalPath) && fs.existsSync(copiedPath), {
      message: '等待原文档和另存文档都写入工作区',
    })
    .toBeTruthy();

  const copied = JSON.parse(fs.readFileSync(copiedPath, 'utf-8'));
  expect(copied.meta?.domain).toBe(copiedName);
  expect(copied.meta?.title).toBe(copiedName);
  expect(copied.meta?.date).toBe('2026-04-20');
});
