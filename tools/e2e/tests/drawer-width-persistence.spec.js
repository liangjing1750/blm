const { test, expect } = require('@playwright/test');

const {
  createDocument,
  openDocument,
  dragResizeHandle,
} = require('./support/app-helpers');

function buildFixtureDocument(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-04',
    },
    roles: [],
    language: [],
    processes: [
      {
        id: 'P1',
        name: '主流程',
        trigger: '',
        outcome: '',
        tasks: [],
      },
    ],
    entities: [
      {
        id: 'E1',
        name: '订单',
        group: '交易主题域',
        fields: [],
      },
      {
        id: 'E2',
        name: '仓单',
        group: '仓储主题域',
        fields: [],
      },
    ],
    relations: [
      {
        from: 'E1',
        to: 'E2',
        type: '1:N',
        label: '关联',
      },
    ],
    rules: [],
  };
}

test('流程抽屉和实体抽屉宽度会分别记住上次调整结果', async ({ page, request }) => {
  const documentName = `drawer-width-${Date.now()}`;
  await createDocument(request, documentName, buildFixtureDocument(documentName));

  await page.goto('/');
  await openDocument(page, documentName);

  const sidebar = page.locator('#sidebar');
  const sidebarHandle = page.getByTestId('sidebar-resize-handle');
  const sidebarWidthBefore = await sidebar.evaluate((node) => node.offsetWidth);
  await dragResizeHandle(page, sidebarHandle, 120);
  const sidebarWidthAfter = await sidebar.evaluate((node) => node.offsetWidth);
  expect(sidebarWidthAfter).toBeGreaterThan(sidebarWidthBefore + 40);

  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();

  const processDrawer = page.locator('.proc-drawer.open');
  const processHandle = page.getByTestId('process-drawer-resize-handle');
  const processWidthBefore = await processDrawer.evaluate((node) => node.offsetWidth);
  await dragResizeHandle(page, processHandle, -140);
  const processWidthAfter = await processDrawer.evaluate((node) => node.offsetWidth);
  expect(processWidthAfter).toBeGreaterThan(processWidthBefore + 100);

  await page.getByTestId('tab-data').click();
  await page.locator('.ef-node[data-id="E1"]').click();
  await page.getByTestId('entity-editor-open').click();

  const entityDrawer = page.locator('.entity-drawer.open');
  const entityHandle = page.getByTestId('entity-drawer-resize-handle');
  const entityWidthBefore = await entityDrawer.evaluate((node) => node.offsetWidth);
  await dragResizeHandle(page, entityHandle, -90);
  const entityWidthAfter = await entityDrawer.evaluate((node) => node.offsetWidth);
  expect(entityWidthAfter).toBeGreaterThan(entityWidthBefore + 60);

  await page.reload();
  await openDocument(page, documentName);

  await expect
    .poll(async () => {
      const width = await page.locator('#sidebar').evaluate((node) => node.offsetWidth);
      return Math.abs(width - sidebarWidthAfter) <= 4;
    })
    .toBeTruthy();

  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await expect
    .poll(async () => {
      const width = await page.locator('.proc-drawer.open').evaluate((node) => node.offsetWidth);
      return Math.abs(width - processWidthAfter) <= 4;
    })
    .toBeTruthy();

  await page.getByTestId('tab-data').click();
  await page.locator('.ef-node[data-id="E1"]').click();
  await page.getByTestId('entity-editor-open').click();
  await expect
    .poll(async () => {
      const width = await page.locator('.entity-drawer.open').evaluate((node) => node.offsetWidth);
      return Math.abs(width - entityWidthAfter) <= 4;
    })
    .toBeTruthy();
});
