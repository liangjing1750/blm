const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildSidebarDoc(documentName) {
  return {
    meta: {
      title: documentName,
      domain: documentName,
      author: '',
      date: '2026-04',
    },
    roles: [],
    language: [],
    processes: [
      {
        id: 'P1',
        name: '仓储入库预约',
        subDomain: '',
        trigger: '',
        outcome: '',
        tasks: [{ id: 'T1', name: '提交预约', taskDefinitionId: 'TD1', businessConstructId: 'BC1', role: '', steps: [], orchestrationTasks: [] }],
      },
      {
        id: 'P2',
        name: '查库管理',
        subDomain: '',
        trigger: '',
        outcome: '',
        tasks: [{ id: 'T2', name: '查库处理', taskDefinitionId: 'TD2', businessConstructId: 'BC2', role: '', steps: [], orchestrationTasks: [] }],
      },
    ],
    entities: [
      { id: 'E1', name: '仓储仓单', businessConstructId: 'BC1', businessConstructIds: ['BC1'], fields: [] },
    ],
    capabilityUnits: [
      { id: 'CU1', name: '仓储仓单管理', kind: 'core', constructIds: ['BC1'], entityIds: [], taskDefinitionIds: ['TD1'] },
      { id: 'CU2', name: '示例服务机构管理', kind: 'generic', constructIds: ['BC2'], entityIds: [], taskDefinitionIds: ['TD2'] },
    ],
    businessConstructs: [
      { id: 'BC1', name: '仓储构件', capabilityUnitId: 'CU1', capabilityUnit: '仓储仓单管理', entityIds: ['E1'], taskDefinitionIds: ['TD1'] },
      { id: 'BC2', name: '查库构件', capabilityUnitId: 'CU2', capabilityUnit: '示例服务机构管理', entityIds: [], taskDefinitionIds: ['TD2'] },
    ],
    taskDefinitions: [
      { id: 'TD1', name: '提交预约', type: 'Service', target: '', note: '', capabilityUnitId: 'CU1', capabilityUnit: '仓储仓单管理', constructId: 'BC1', constructName: '仓储构件' },
      { id: 'TD2', name: '查库处理', type: 'Service', target: '', note: '', capabilityUnitId: 'CU2', capabilityUnit: '示例服务机构管理', constructId: 'BC2', constructName: '查库构件' },
    ],
    relations: [],
    rules: [],
  };
}

test('组件目录分组行不再显示旧的上下移动按钮且标题数量稳定', async ({ page, request }) => {
  const documentName = `sidebar-move-${Date.now()}`;
  const doc = buildSidebarDoc(documentName);

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('sidebar-browse-domain').click();

  const groupRow = page.locator('[data-subdomain="示例服务机构管理"]');
  await groupRow.hover();

  const groupName = groupRow.locator('.sb-name');
  const countBadge = groupRow.locator('.sb-count');
  const moveButtons = groupRow.locator('.sb-move-btn');
  const moveWrap = groupRow.locator('.sb-move-btns');

  await expect(groupName).toBeVisible();
  await expect(countBadge).toBeVisible();
  await expect(moveWrap).toHaveCount(0);
  await expect(moveButtons).toHaveCount(0);

  const nameBox = await groupName.boundingBox();
  const countBox = await countBadge.boundingBox();
  const rowBox = await groupRow.boundingBox();

  expect(nameBox).not.toBeNull();
  expect(countBox).not.toBeNull();
  expect(rowBox).not.toBeNull();

  expect(countBox.x + countBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
});
