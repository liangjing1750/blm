const { test, expect } = require('@playwright/test');
const { createDocument, openDocument } = require('./support/app-helpers');

test('process view uses one focused flow diagram instead of the dense card wall', async ({ page, request }) => {
  const documentName = `process-flow-view-${Date.now()}`;

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '' },
    roles: [],
    language: [],
    processes: [
      {
        id: 'P1',
        name: '示例流程',
        trigger: '',
        outcome: '',
        nodes: [
          {
            id: 'N1',
            name: '提交预约',
            role: '',
            userSteps: [],
            orchestrationTasks: [],
            forms: [],
          },
        ],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
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
