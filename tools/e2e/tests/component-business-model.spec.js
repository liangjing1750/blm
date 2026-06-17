const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('构件工作台业务组件与构件使用独立 Angular 入口维护组件和构件', async ({ page, request }) => {
  const documentName = `component-business-model-${Date.now()}`;
  const doc = {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-06' },
    roles: [],
    language: [],
    processes: [],
    businessComponents: [
      { id: 'BCP1', uid: 'BCP1', name: '仓储组件', kind: 'core', constructUids: ['C1'] },
      { id: 'BCP2', uid: 'BCP2', name: '公共组件', kind: 'generic', constructUids: [] },
    ],
    businessConstructs: [
      { id: 'C1', uid: 'C1', name: '仓储构件', businessComponentUid: 'BCP1', entityUids: ['E1'], taskDefinitionUids: ['TD1'] },
      { id: 'C2', uid: 'C2', name: '未分组构件', entityUids: [], taskDefinitionUids: [] },
    ],
    entities: [
      { id: 'E1', uid: 'E1', name: '仓单', businessConstructUid: 'C1', fields: [] },
    ],
    taskDefinitions: [
      { id: 'TD1', uid: 'TD1', name: '仓单查询', type: 'Service', constructUid: 'C1' },
    ],
    relations: [],
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('tab-constructWorkbench').click();
  await page.getByTestId('component-subtab-businessComponents').click();

  await expect(page.getByTestId('business-model-angular')).toBeVisible();
  await expect(page.getByTestId('business-model-card')).toBeVisible();
  await expect(page.getByTestId('business-model-summary')).toContainText('组件 2');
  await expect(page.getByTestId('business-model-summary')).toContainText('构件 2');

  await page.getByTestId('subdomain-map-node').filter({ hasText: '公共组件' }).click();
  await page.getByTestId('capability-name-input').fill('公共能力组件');
  await expect.poll(() => page.evaluate(() => S.doc.businessComponents.find((item) => item.uid === 'BCP2')?.name)).toBe('公共能力组件');

  await page.getByTestId('construct-attach-button').filter({ hasText: '加入' }).first().click();
  await expect.poll(() => page.evaluate(() => S.doc.businessConstructs.find((item) => item.uid === 'C2')?.businessComponentUid)).toBe('BCP2');
  await expect(page.getByTestId('business-model-construct-editor')).toBeVisible();
  await page.getByTestId('construct-name-input').fill('公共支撑构件');
  await expect.poll(() => page.evaluate(() => S.doc.businessConstructs.find((item) => item.uid === 'C2')?.name)).toBe('公共支撑构件');

  await page.getByTestId('construct-add-button').click();
  await expect.poll(() => page.evaluate(() => S.doc.businessConstructs.length)).toBe(3);
});
