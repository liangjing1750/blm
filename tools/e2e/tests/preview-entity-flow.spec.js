const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('preview entity overview uses readonly entity flow renderer', async ({ page, request }) => {
  const documentName = `preview-entity-flow-${Date.now()}`;
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName },
    roles: [],
    language: [],
    stages: [],
    processes: [],
    businessComponents: [{ id: 'BCP1', name: '仓储组件', kind: 'core' }],
    businessConstructs: [{ id: 'BC1', uid: 'BC1', name: '仓单构件', businessComponentUid: 'BCP1', businessComponent: '仓储组件' }],
    entities: [
      { id: 'E1', name: '仓单', businessConstructUid: 'BC1' },
      { id: 'E2', name: '货物', businessConstructUid: 'BC1' },
    ],
    relations: [{ id: 'REL1', from: 'E1', to: 'E2', type: '1:N', label: '包含' }],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-preview').click();
  await expect(page.locator('#preview-entity-overview')).toBeVisible();
  await expect(page.locator('#pv-entity-diag .ef-canvas')).toBeVisible();
  await expect(page.locator('#pv-entity-diag .ef-node')).toHaveCount(2);
  await expect(page.locator('#pv-entity-diag .ef-rel')).toHaveCount(1);
  await expect(page.locator('#pv-entity-diag')).toContainText('仓单');
  await expect(page.locator('#pv-entity-diag')).toContainText('货物');
});
