const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('实体编辑抽屉只展示当前实体关系，并在关系图中突出当前实体邻域', async ({ page, request }) => {
  const documentName = `entity-focus-${Date.now()}`;
  const doc = {
    meta: {
      title: documentName,
      domain: documentName,
      author: '',
      date: '2026-04',
    },
    roles: [],
    language: [],
    processes: [
      { id: 'P1', name: '主流程', trigger: '', outcome: '', tasks: [] },
    ],
    capabilityUnits: [
      { id: 'CU1', name: '交易组件', kind: 'core', constructIds: ['BC1'], entityIds: [], taskDefinitionIds: [] },
      { id: 'CU2', name: '仓储监管组件', kind: 'generic', constructIds: ['BC2', 'BC3'], entityIds: [], taskDefinitionIds: [] },
    ],
    businessConstructs: [
      { id: 'BC1', name: '交易构件', capabilityUnitId: 'CU1', capabilityUnit: '交易组件', entityIds: ['E1'], taskDefinitionIds: [] },
      { id: 'BC2', name: '仓储构件', capabilityUnitId: 'CU2', capabilityUnit: '仓储监管组件', entityIds: ['E2'], taskDefinitionIds: [] },
      { id: 'BC3', name: '监管构件', capabilityUnitId: 'CU2', capabilityUnit: '仓储监管组件', entityIds: ['E3'], taskDefinitionIds: [] },
    ],
    entities: [
      { id: 'E1', name: '订单', businessConstructId: 'BC1', businessConstructIds: ['BC1'], fields: [] },
      { id: 'E2', name: '仓单', businessConstructId: 'BC2', businessConstructIds: ['BC2'], fields: [] },
      { id: 'E3', name: '监管记录', businessConstructId: 'BC3', businessConstructIds: ['BC3'], fields: [] },
    ],
    relations: [
      { from: 'E1', to: 'E2', type: '1:N', label: '订单关联仓单' },
      { from: 'E2', to: 'E3', type: '1:N', label: '仓单触发监管' },
    ],
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('tab-data').click();
  await expect(page.locator('.live-diagram-toolbar .zoom-controls')).toHaveCount(0);
  await expect(page.locator('.ef-group-frame')).toHaveCount(3);
  await expect(page.locator('.ef-component-frame')).toHaveCount(2);
  await expect(page.locator('.entity-shortcut-hint')).toContainText('Ctrl+A');
  await expect(page.locator('.entity-shortcut-hint')).toContainText('Ctrl+点击');
  await expect(page.locator('.entity-shortcut-hint')).toContainText('Shift+左键拖拽');
  await expect(page.locator('.entity-shortcut-hint strong')).toHaveText([
    '拖拽',
    'Ctrl+A',
    'Ctrl+点击',
    'Shift+左键拖拽',
  ]);
  const layerMetrics = await page.evaluate(() => {
    const board = document.getElementById('ef-board-entity-diagram');
    const svg = document.getElementById('ef-svg-entity-diagram');
    const componentFrame = document.querySelector('.ef-component-frame');
    const groupFrame = document.querySelector('.ef-group-frame');
    const componentTitle = document.querySelector('.ef-component-title');
    const node = document.querySelector('.ef-node');
    const diagram = document.getElementById('entity-diagram');
    const titleRect = componentTitle.getBoundingClientRect();
    const groupRect = groupFrame.getBoundingClientRect();
    const diagramRect = diagram.getBoundingClientRect();
    return {
      svgParentId: svg.parentElement?.id || '',
      svgZ: Number(window.getComputedStyle(svg).zIndex),
      componentZ: Number(window.getComputedStyle(componentFrame).zIndex),
      groupZ: Number(window.getComputedStyle(groupFrame).zIndex),
      titleZ: Number(window.getComputedStyle(componentTitle).zIndex),
      nodeZ: Number(window.getComputedStyle(node).zIndex),
      titleTop: titleRect.top,
      titleLeft: titleRect.left,
      titleBottom: titleRect.bottom,
      groupTop: groupRect.top,
      diagramTop: diagramRect.top,
      diagramLeft: diagramRect.left,
      boardChildOrder: Array.from(board.children).map((child) => child.className.baseVal || child.className || child.tagName),
    };
  });
  expect(layerMetrics.svgParentId).toBe('ef-board-entity-diagram');
  expect(layerMetrics.svgZ).toBeGreaterThan(layerMetrics.groupZ);
  expect(layerMetrics.svgZ).toBeGreaterThan(layerMetrics.componentZ);
  expect(layerMetrics.titleZ).toBeGreaterThan(layerMetrics.svgZ);
  expect(layerMetrics.nodeZ).toBeGreaterThan(layerMetrics.titleZ);
  expect(layerMetrics.titleTop).toBeGreaterThanOrEqual(layerMetrics.diagramTop);
  expect(layerMetrics.titleLeft).toBeGreaterThan(layerMetrics.diagramLeft + 12);
  expect(layerMetrics.titleBottom).toBeLessThanOrEqual(layerMetrics.groupTop - 2);
  expect(layerMetrics.boardChildOrder.some((item, index, arr) => String(item).includes('ef-svg') && index > arr.findIndex((name) => String(name).includes('ef-group-frame')))).toBeTruthy();
  await expect(page.getByTestId('entity-editor-open')).toBeVisible();
  await expect(page.locator('.entity-drawer.open')).toHaveCount(0);

  const beforeMove = await page.evaluate(() => ({ ...S.doc.entities.find((entity) => entity.id === 'E2').pos }));
  const warehouseBox = await page.locator('.ef-node[data-id="E2"]').boundingBox();
  expect(warehouseBox).not.toBeNull();
  await page.mouse.move(warehouseBox.x + warehouseBox.width / 2, warehouseBox.y + warehouseBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(warehouseBox.x + warehouseBox.width / 2 + 48, warehouseBox.y + warehouseBox.height / 2 + 24);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => S.doc.entities.find((entity) => entity.id === 'E2').pos.x)).toBeGreaterThan(beforeMove.x + 24);
  await expect(page.locator('.entity-drawer.open')).toHaveCount(0);

  await page.keyboard.press('Control+A');
  await expect(page.locator('.ef-node.ef-selected')).toHaveCount(3);
  const beforeGroupMove = await page.evaluate(() => Object.fromEntries(
    S.doc.entities.map((entity) => [entity.id, { x: entity.pos.x, y: entity.pos.y }]),
  ));
  const orderBox = await page.locator('.ef-node[data-id="E1"]').boundingBox();
  expect(orderBox).not.toBeNull();
  await page.mouse.move(orderBox.x + orderBox.width / 2, orderBox.y + orderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(orderBox.x + orderBox.width / 2 + 42, orderBox.y + orderBox.height / 2 + 18);
  await page.mouse.up();
  await expect.poll(() => page.evaluate((before) => {
    const entity = S.doc.entities.find((item) => item.id === 'E3');
    return entity.pos.x - before.E3.x;
  }, beforeGroupMove)).toBeGreaterThan(20);

  await page.locator('.ef-node[data-id="E1"]').click();

  await expect(page.locator('.entity-drawer.open')).toHaveCount(0);
  await expect(page.locator('.ef-node[data-id="E1"]')).toHaveClass(/ef-focus/);
  await expect(page.locator('.ef-node[data-id="E3"]')).toHaveClass(/ef-muted/);
  await expect(page.locator('#ef-svg-entity-diagram path[data-related="false"]')).toHaveCount(1);
  await page.getByTestId('entity-editor-open').click();
  await expect(page.getByTestId('entity-relation-list').locator('.rel-row')).toHaveCount(1);
});

test('实体关系支持快捷新增删除上下移并保持抽屉滚动位置', async ({ page, request }) => {
  const documentName = `entity-rel-actions-${Date.now()}`;
  const doc = {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: '订单',
        group: '交易主题域',
        fields: Array.from({ length: 14 }, (_, index) => ({
          name: `字段${index + 1}`,
          type: 'string',
          is_key: false,
          is_status: false,
          note: '',
        })),
      },
      { id: 'E2', name: '仓单', group: '仓储主题域', fields: [] },
      { id: 'E3', name: '监管记录', group: '监管主题域', fields: [] },
    ],
    relations: [
      { from: 'E1', to: 'E2', type: '1:N', label: '订单关联仓单' },
    ],
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.locator('.ef-node[data-id="E1"]').click();
  await page.getByTestId('entity-editor-open').click();

  const drawerBody = page.locator('.entity-drawer .drawer-body');
  await drawerBody.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const beforeScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  expect(beforeScrollTop).toBeGreaterThan(0);

  const actionCounts = await page.locator('[data-testid="entity-relation-list"] .rel-row').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.rel-actions button').length),
  );
  expect(actionCounts).toEqual([4]);

  await page.getByTestId('entity-relation-add-after-0').click();
  await expect(page.getByTestId('entity-relation-list').locator('.rel-row')).toHaveCount(2);
  await page.getByTestId('entity-relation-label-1').fill('订单关联监管记录');

  let labels = await page.locator('[data-testid^="entity-relation-label-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(labels).toEqual(['订单关联仓单', '订单关联监管记录']);

  let afterScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  expect(afterScrollTop).toBeGreaterThanOrEqual(beforeScrollTop - 24);
  expect(afterScrollTop - beforeScrollTop).toBeLessThanOrEqual(48);

  await page.getByTestId('entity-relation-move-up-1').click();
  labels = await page.locator('[data-testid^="entity-relation-label-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(labels).toEqual(['订单关联监管记录', '订单关联仓单']);

  await page.getByTestId('entity-relation-delete-0').click();
  await expect(page.getByTestId('entity-relation-list').locator('.rel-row')).toHaveCount(1);
  labels = await page.locator('[data-testid^="entity-relation-label-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(labels).toEqual(['订单关联仓单']);
});
