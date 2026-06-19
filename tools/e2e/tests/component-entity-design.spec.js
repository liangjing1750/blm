const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('构件工作台实体设计使用独立 Angular 入口维护关系和状态', async ({ page, request }) => {
  const documentName = `component-entity-design-${Date.now()}`;
  const doc = {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-06' },
    roles: [],
    language: [],
    processes: [],
    businessComponents: [
      { id: 'BCP1', uid: 'BCP1', name: '仓储组件', kind: 'core' },
    ],
    businessConstructs: [
      { id: 'C1', uid: 'C1', name: '仓储构件', businessComponentUid: 'BCP1' },
    ],
    entities: [
      {
        id: 'E1',
        uid: 'E1',
        name: '仓单',
        businessConstructUid: 'C1',
        fields: [
          { uid: 'F1', name: '状态', type: 'string', state_values: '待提交,已提交' },
        ],
        state_transitions: [
          { uid: 'T1', from: '待提交', to: '已提交', action: '提交' },
        ],
      },
      { id: 'E2', uid: 'E2', name: '客户', fields: [] },
    ],
    relations: [
      { uid: 'R1', from: 'E1', to: 'E2', label: '归属客户' },
    ],
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('tab-constructWorkbench').click();
  await page.getByTestId('component-subtab-entities').click();

  await expect(page.getByTestId('entity-design-angular')).toBeVisible();
  await expect(page.getByTestId('entity-design-relation-view')).toBeVisible();
  await expect(page.getByTestId('entity-design-node')).toHaveCount(2);
  await expect(page.locator('.entity-rel-line')).toHaveCount(1);
  await expect(page.locator('[data-testid="entity-design-editor-open"], [data-testid="entity-design-editor-hide"]')).toBeVisible();

  await page.getByTestId('entity-design-switch-state').click();
  await expect(page.getByTestId('entity-design-state-view')).toBeVisible();
  await expect(page.locator('.entity-state-node')).toContainText(['待提交', '已提交']);

  await page.getByTestId('entity-design-switch-relation').click();
  const firstNode = page.getByTestId('entity-design-node').first();
  const firstNodeBox = await firstNode.boundingBox();
  expect(firstNodeBox).not.toBeNull();
  await page.mouse.move(firstNodeBox.x + firstNodeBox.width / 2, firstNodeBox.y + firstNodeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstNodeBox.x + firstNodeBox.width / 2 + 48, firstNodeBox.y + firstNodeBox.height / 2 + 28);
  await page.mouse.up();
  await expect.poll(async () => {
    const movedBox = await firstNode.boundingBox();
    return Math.round((movedBox?.x || 0) - firstNodeBox.x);
  }).toBeGreaterThan(36);

  await page.keyboard.press('Control+A');
  await expect(page.locator('.entity-node.is-selected')).toHaveCount(2);
  await page.getByTestId('entity-design-reset-layout').click();
  await expect.poll(async () => {
    const resetBox = await firstNode.boundingBox();
    return Math.abs(Math.round((resetBox?.x || 0) - firstNodeBox.x));
  }).toBeLessThanOrEqual(6);

  await page.getByTestId('entity-design-add-entity').click();
  await expect(page.getByTestId('entity-design-node')).toHaveCount(3);
});
