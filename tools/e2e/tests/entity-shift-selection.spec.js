const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('Shift 加左键可以从实体节点上直接起手框选多个实体', async ({ page, request }) => {
  const documentName = `entity-shift-select-${Date.now()}`;
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
      { id: 'P1', name: '总流程', trigger: '', outcome: '', tasks: [] },
    ],
    entities: [
      { id: 'E1', name: '预约单', group: '仓储仓单管理主题域', fields: [] },
      { id: 'E2', name: '仓储仓单', group: '仓储仓单管理主题域', fields: [] },
      { id: 'E3', name: '操作流水', group: '仓储仓单管理主题域', fields: [] },
    ],
    relations: [
      { from: 'E1', to: 'E2', type: '1:N', label: '生成仓单' },
      { from: 'E2', to: 'E3', type: '1:N', label: '记录流水' },
    ],
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();

  const firstNode = page.locator('.ef-node[data-id="E1"]');
  const thirdNode = page.locator('.ef-node[data-id="E3"]');
  const firstBox = await firstNode.boundingBox();
  const thirdBox = await thirdNode.boundingBox();

  expect(firstBox).not.toBeNull();
  expect(thirdBox).not.toBeNull();

  const startPoint = {
    x: firstBox.x + firstBox.width * 0.4,
    y: firstBox.y + firstBox.height * 0.4,
  };
  const endPoint = {
    x: thirdBox.x + thirdBox.width + 24,
    y: thirdBox.y + thirdBox.height + 24,
  };

  await page.evaluate(({ startPoint: start, endPoint: end }) => {
    const startTarget = document.elementFromPoint(start.x, start.y);
    if (!startTarget) throw new Error('未找到 Shift 框选的起点元素');

    startTarget.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: start.x,
      clientY: start.y,
      shiftKey: true,
      buttons: 1,
    }));
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: end.x,
      clientY: end.y,
      shiftKey: true,
      buttons: 1,
    }));
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: end.x,
      clientY: end.y,
      shiftKey: true,
      button: 0,
      buttons: 0,
    }));
  }, { startPoint, endPoint });

  await expect(page.locator('.ef-node.ef-selected')).toHaveCount(2);
  await expect(firstNode).toHaveClass(/ef-selected/);
  await expect(thirdNode).toHaveClass(/ef-selected/);
});
