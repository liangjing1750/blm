const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildGroupAssignmentDoc(name) {
  return {
    meta: { title: name, domain: name, author: 'tester', date: '2026-06-02' },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    businessComponents: [
      { id: 'CU1', name: '组件一', kind: 'core', constructIds: ['BC1'], entityIds: [], taskDefinitionIds: [] },
      { id: 'CU2', name: '组件二', kind: 'generic', constructIds: ['BC2'], entityIds: [], taskDefinitionIds: [] },
    ],
    businessConstructs: [
      { id: 'BC1', name: '构件一', entityIds: ['E1'], taskDefinitionIds: ['TD1'] },
      { id: 'BC2', name: '构件二', businessComponentId: 'CU2', entityIds: [], taskDefinitionIds: [] },
    ],
    taskDefinitions: [
      { id: 'TD1', name: '任务一', constructIds: ['BC1'], type: 'Service', target: '', note: '' },
      { id: 'TD2', name: '任务二', type: 'Service', target: '', note: '' },
    ],
    entities: [
      { id: 'E1', name: '实体一', businessConstructIds: ['BC1'], fields: [] },
      { id: 'E2', name: '实体二', fields: [] },
    ],
    relations: [],
    rules: [],
  };
}

test('assigned constructs entities and tasks are not offered as ungrouped in other groups', async ({ page, request }) => {
  const documentName = `group-assignment-${Date.now()}`;
  await createDocument(request, documentName, buildGroupAssignmentDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-domain').click();

  await page.getByTestId('business-model-capability-chip').filter({ hasText: '组件二' }).click();
  await expect(page.getByTestId('business-model-dialog')).toBeVisible();
  await expect(page.locator('.business-model-move-row').filter({ hasText: '构件二' }).getByTestId('construct-open-button')).toBeVisible();
  await expect(page.locator('.business-model-move-row').filter({ hasText: '构件一' }).getByTestId('construct-attach-button')).toHaveCount(0);

  await page.locator('.business-model-move-row').filter({ hasText: '构件二' }).getByTestId('construct-open-button').click();
  await expect(page.locator('.business-model-move-row').filter({ hasText: '实体一' }).getByTestId('construct-entity-add')).toHaveCount(0);
  await expect(page.locator('.business-model-move-row').filter({ hasText: '任务一' }).getByTestId('construct-task-add')).toHaveCount(0);
  await expect(page.locator('.business-model-move-row').filter({ hasText: '实体二' }).getByTestId('construct-entity-add')).toBeVisible();
  await expect(page.locator('.business-model-move-row').filter({ hasText: '任务二' }).getByTestId('construct-task-add')).toBeVisible();
});
