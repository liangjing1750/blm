const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('数据关系图重置布局后保留全部实体组并采用多行分组铺排', async ({ page, request }) => {
  const documentName = `entity-layout-${Date.now()}`;
  const groups = [
    '示例服务机构管理主题域',
    '仓储仓单管理主题域',
    '厂库库存管理主题域',
    '车船板示例管理主题域',
    '基础数据管理主题域',
    '示例仓单同步数据管理主题域',
    '视频监控管理主题域',
  ];

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
    capabilityUnits: [
      { id: 'CU1', name: '核心业务组件', kind: 'core', constructIds: groups.slice(0, 4).map((_, index) => `BC${index + 1}`), entityIds: [], taskDefinitionIds: [] },
      { id: 'CU2', name: '通用支撑组件', kind: 'generic', constructIds: groups.slice(4).map((_, index) => `BC${index + 5}`), entityIds: [], taskDefinitionIds: [] },
    ],
    businessConstructs: groups.map((group, index) => ({
      id: `BC${index + 1}`,
      name: group,
      capabilityUnitId: index < 4 ? 'CU1' : 'CU2',
      capabilityUnit: index < 4 ? '核心业务组件' : '通用支撑组件',
      entityIds: [`E${index + 1}`],
      taskDefinitionIds: [],
    })),
    entities: groups.map((group, index) => ({
      id: `E${index + 1}`,
      name: `${group}-实体`,
      businessConstructId: `BC${index + 1}`,
      businessConstructIds: [`BC${index + 1}`],
      fields: [],
    })),
    relations: groups.slice(1).map((_, index) => ({
      from: `E${index + 1}`,
      to: `E${index + 2}`,
      type: '1:N',
      label: `关系${index + 1}`,
    })),
    rules: [],
  };

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await page.getByTestId('tab-data').click();
  await page.getByRole('button', { name: '重置布局' }).click();

  const groupFrames = page.locator('.ef-group-frame');
  await expect(groupFrames).toHaveCount(groups.length);
  await expect(page.locator('.ef-component-frame')).toHaveCount(2);

  const distinctTopCount = await groupFrames.evaluateAll((frames) => (
    new Set(frames.map((frame) => Math.round(frame.getBoundingClientRect().top))).size
  ));

  expect(distinctTopCount).toBeGreaterThan(1);
});
