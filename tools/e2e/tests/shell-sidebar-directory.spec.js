const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('shell sidebar directory is rendered by Angular and keeps process/component navigation visible', async ({ page, request }) => {
  const documentName = `shell-sidebar-${Date.now()}`;
  const doc = {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-06' },
    businessDomains: [
      { uid: 'domain-warehouse', id: 'domain-warehouse', name: 'Warehouse Domain' },
    ],
    valueStreams: [
      { uid: 'stream-inbound', id: 'stream-inbound', name: 'Inbound Stream' },
    ],
    stages: [
      {
        uid: 'stage-register',
        id: 'stage-register',
        name: 'Register Stage',
        valueStreamUid: 'stream-inbound',
        businessDomainUid: 'domain-warehouse',
        subDomain: 'Warehouse Domain',
      },
    ],
    stageFlowRefs: [
      { uid: 'ref-register', stageUid: 'stage-register', processUid: 'process-register' },
    ],
    processes: [
      {
        uid: 'process-register',
        id: 'process-register',
        name: 'Register Process',
        businessDomainUid: 'domain-warehouse',
        subDomain: 'Warehouse Domain',
        nodes: [
          { uid: 'node-apply', id: 'node-apply', name: 'Apply Node', userSteps: [{}], forms: [{}] },
        ],
      },
    ],
    businessComponents: [
      { uid: 'component-warehouse', id: 'component-warehouse', name: 'Warehouse Component', kind: 'core', businessDomainUid: 'domain-warehouse', subDomain: 'Warehouse Domain' },
    ],
    businessConstructs: [
      { uid: 'construct-receipt', id: 'construct-receipt', name: 'Receipt Construct', businessComponentUid: 'component-warehouse' },
    ],
    entities: [
      { uid: 'entity-receipt', id: 'entity-receipt', name: 'Receipt', businessConstructUid: 'construct-receipt' },
    ],
    taskDefinitions: [
      { uid: 'task-query', id: 'task-query', name: 'Query Task', constructUid: 'construct-receipt' },
    ],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await expect(page.getByTestId('angular-sidebar-directory')).toBeVisible();
  await expect(page.getByTestId('sidebar-business-domain-filter')).toBeVisible();
  await expect(page.getByTestId('sidebar-stage-browse')).toContainText('Inbound Stream');
  await expect(page.getByTestId('sidebar-stage-browse')).toContainText('Register Stage');
  if (!(await page.getByTestId('sidebar-process-row').count())) {
    await page.locator('.sb-stage-head').filter({ hasText: 'Register Stage' }).click();
  }
  await expect(page.getByTestId('sidebar-process-row')).toContainText('Register Process');
  await expect(page.getByTestId('sidebar-domain-browse')).toContainText('Warehouse Component');

  await page.getByTestId('sidebar-business-domain-filter').selectOption('domain-warehouse');
  if (!(await page.getByTestId('sidebar-process-row').count())) {
    await page.locator('.sb-stage-head').filter({ hasText: 'Register Stage' }).click();
  }
  await expect(page.getByTestId('sidebar-process-row')).toContainText('Register Process');

  await page.getByTestId('sidebar-process-row').first().click();
  await expect(page.getByTestId('tab-processWorkbench')).toHaveClass(/active/);
});
