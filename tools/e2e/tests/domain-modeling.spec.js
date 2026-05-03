const { test, expect } = require('@playwright/test');

const { createDocument } = require('./support/app-helpers');

async function openDocumentFromList(page, name) {
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('domain-scroll')).toBeVisible();
  if (await page.locator('#sidebar.sb-collapsed').count()) {
    await page.locator('#sb-toggle-btn').click();
  }
}

function buildDomainModelingDoc(documentName) {
  return {
    meta: {
      title: documentName,
      domain: '示例平台-v2',
      author: 'Liang Jing',
      date: '2026-04-24',
    },
    roles: [],
    language: [
      { term: '示例预报', definition: '客户向仓库发货前提交的预报信息。' },
      { term: '现货仓单', definition: '平台内记录仓储实物状态的仓单。' },
    ],
    stages: [
      { id: 'S1', name: '预约阶段', subDomain: '示例服务', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S2', name: '办理阶段', subDomain: '示例服务', pos: { x: 0, y: 0 }, processLinks: [] },
    ],
    stageLinks: [
      { fromStageId: 'S1', toStageId: 'S2' },
    ],
    stageFlowRefs: [
      { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1, pos: { x: 0, y: 0 } },
      { id: 'SFR2', stageId: 'S1', processId: 'P2', order: 2, pos: { x: 0, y: 0 } },
      { id: 'SFR3', stageId: 'S2', processId: 'P3', order: 1, pos: { x: 0, y: 0 } },
    ],
    stageFlowLinks: [
      { id: 'SFL1', stageId: 'S1', fromRefId: 'SFR1', toRefId: 'SFR2' },
    ],
    processes: [
      {
        id: 'P1',
        name: '预约录入',
        subDomain: '',
        flowGroup: '核心流程',
        stageId: 'S1',
        trigger: '',
        outcome: '',
        nodes: [
          {
            id: 'N1',
            name: '预约提交',
            role: '会员',
            orchestrationTasks: [
              { id: 'OT1', taskDefinitionId: 'TD1', constructId: 'BC1', businessConstructId: 'BC1', name: '保存预约信息', type: 'Service', target: '预约办理服务', note: '' },
            ],
          },
        ],
      },
      { id: 'P2', name: '账号鉴权', subDomain: '', flowGroup: '平台支撑', stageId: 'S1', trigger: '', outcome: '', nodes: [] },
      { id: 'P3', name: '视频取证', subDomain: '', flowGroup: '监控支撑', stageId: 'S2', trigger: '', outcome: '', nodes: [] },
    ],
    capabilityUnits: [
      { id: 'CU1', name: '示例服务', kind: 'core', constructIds: ['BC1'], entityIds: [], taskDefinitionIds: ['TD1'] },
      { id: 'CU2', name: '用户管理', kind: 'generic', constructIds: [], entityIds: [], taskDefinitionIds: [] },
      { id: 'CU3', name: '视频监控', kind: 'generic', constructIds: [], entityIds: [], taskDefinitionIds: [] },
    ],
    businessConstructs: [
      { id: 'BC1', name: '预约办理构件', capabilityUnitId: 'CU1', capabilityUnit: '示例服务', entityIds: [], taskDefinitionIds: ['TD1'] },
    ],
    taskDefinitions: [
      { id: 'TD1', name: '保存预约信息', type: 'Service', target: '预约办理服务', note: '', capabilityUnitId: 'CU1', capabilityUnit: '示例服务', constructId: 'BC1', constructName: '预约办理构件' },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('业务域页术语表支持统一样式的快捷操作', async ({ page, request }) => {
  const documentName = `domain-language-quick-${Date.now()}`;
  await createDocument(request, documentName, buildDomainModelingDoc(documentName));

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('term-row')).toHaveCount(2);

  const firstRow = page.getByTestId('term-row').first();
  await expect(firstRow.locator('.stage-quick-btn')).toHaveCount(4);

  await firstRow.getByTestId('term-row-add').click();
  await expect(page.getByTestId('term-row')).toHaveCount(3);
  await expect(page.getByTestId('term-input').nth(1)).toHaveValue('');

  await page.getByTestId('term-input').nth(1).fill('监管指令');
  await page.getByTestId('term-definition-input').nth(1).fill('由监管方发起的处理指令。');
  await page.getByTestId('term-row').nth(1).getByTestId('term-row-move-up').click();
  await expect(page.getByTestId('term-input').first()).toHaveValue('监管指令');

  await page.getByTestId('term-row').first().getByTestId('term-row-remove').click();
  await expect(page.getByTestId('term-row')).toHaveCount(2);
  await expect(page.getByTestId('term-input').first()).toHaveValue('示例预报');
});

test('业务域页显示单图版核心通用地图并支持分类切换', async ({ page, request }) => {
  const documentName = `domain-map-${Date.now()}`;
  await createDocument(request, documentName, buildDomainModelingDoc(documentName));

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await expect(page.getByTestId('domain-subdomain-map-card')).toBeVisible();
  await expect(page.getByTestId('domain-subdomain-figure')).toBeVisible();
  await expect(page.locator('.domain-map-svg')).toHaveCount(0);
  await expect(page.locator('.domain-map-outline')).toHaveCount(0);
  await expect(page.locator('.domain-map-partition-primary')).toHaveCount(0);
  await expect(page.locator('.domain-map-partition-guide')).toHaveCount(0);
  await expect(page.locator('.subdomain-kind-btn')).toHaveCount(0);
  await expect(page.locator('.domain-subdomain-separator')).toHaveCount(3);
  await expect(page.locator('.domain-map-region-label-core')).toHaveCSS('color', 'rgb(37, 99, 235)');
  await expect(page.locator('.domain-map-region-label-generic')).toHaveCSS('color', 'rgb(4, 120, 87)');
  await expect(page.getByTestId('subdomain-core-oval')).toContainText('示例服务');
  await expect(page.getByTestId('subdomain-generic-oval')).toContainText('用户管理');
  await expect(page.getByTestId('subdomain-generic-oval')).toContainText('视频监控');

  const userNode = page.getByTestId('subdomain-map-node').filter({ hasText: '用户管理' });
  await userNode.click();
  await expect(page.getByTestId('business-model-dialog')).toBeVisible();
  await page.getByTestId('capability-kind-select').selectOption('core');
  await page.getByTestId('business-model-dialog-close').click();

  await expect(page.getByTestId('subdomain-core-oval')).toContainText('用户管理');
  await expect(page.getByTestId('subdomain-generic-oval')).not.toContainText('用户管理');
});

test('业务域页可维护组件构件并绑定实体和任务定义', async ({ page, request }) => {
  const documentName = `domain-business-model-${Date.now()}`;
  const doc = buildDomainModelingDoc(documentName);
  doc.entities = [
    { id: 'E1', name: '仓单', fields: [] },
    { id: 'E2', name: '仓库', fields: [] },
  ];
  doc.taskDefinitions.push(
    { id: 'TD2', name: '校验仓单状态', type: 'Service', target: '仓单服务', note: '' },
  );
  doc.capabilityUnits = [];
  doc.businessConstructs = [];
  doc.taskDefinitions = doc.taskDefinitions.filter((task) => task.id === 'TD2');
  doc.processes = doc.processes.map((process) => ({
    ...process,
    nodes: (process.nodes || []).map((node) => ({ ...node, orchestrationTasks: [] })),
  }));
  doc.capabilityUnits = [
    { id: 'CU1', name: '示例服务', kind: 'core', constructIds: [], entityIds: [], taskDefinitionIds: [] },
  ];
  await createDocument(request, documentName, doc);

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await expect(page.getByTestId('business-model-card')).toBeVisible();
  await expect(page.locator('.business-model-compact')).toHaveCount(0);
  await page.getByTestId('business-model-capability-chip').filter({ hasText: '示例服务' }).click();
  await expect(page.getByTestId('business-model-dialog')).toBeVisible();
  await page.getByTestId('capability-kind-select').selectOption('generic');
  await page.getByTestId('construct-add-button').click();
  await expect(page.getByTestId('business-model-dialog')).toContainText('业务构件');
  await page.getByTestId('construct-name-input').fill('仓单办理构件');
  await page.locator('.business-model-move-row').filter({ hasText: '仓单' }).getByTestId('construct-entity-add').click();
  await page.locator('.business-model-move-row').filter({ hasText: '校验仓单状态' }).getByTestId('construct-task-add').click();
  await page.locator('.business-model-move-row').filter({ hasText: '校验仓单状态' }).getByTestId('construct-task-edit').click();
  await expect(page.getByTestId('task-definition-name-input')).toHaveValue('校验仓单状态');
  await page.getByTestId('task-definition-type-select').selectOption('Query');
  await page.getByTestId('task-definition-query-source-select').selectOption('Enum');
  await page.getByTestId('task-definition-target-input').fill('仓单状态枚举');
  await page.getByTestId('task-definition-note-input').fill('按状态字典校验');
  await page.getByTestId('business-model-dialog-close').click();

  const modelState = await page.evaluate(() => ({
    capabilities: S.doc.capabilityUnits || [],
    constructs: S.doc.businessConstructs || [],
    entities: S.doc.entities || [],
    tasks: S.doc.taskDefinitions || [],
  }));
  expect(modelState.capabilities.some((capability) => (
    capability.name === '示例服务'
    && capability.kind === 'generic'
    && capability.constructIds.includes('BC1')
  ))).toBeTruthy();
  expect(modelState.constructs.some((construct) => (
    construct.name === '仓单办理构件'
    && construct.entityIds.includes('E1')
    && construct.taskDefinitionIds.includes('TD2')
  ))).toBeTruthy();
  expect(modelState.entities.find((entity) => entity.id === 'E1')).toMatchObject({
    businessConstructId: 'BC1',
  });
  expect(modelState.tasks.find((task) => task.id === 'TD2')).toMatchObject({
    name: '校验仓单状态',
    type: 'Query',
    querySourceKind: 'Enum',
    target: '仓单状态枚举',
    note: '按状态字典校验',
    capabilityUnit: '示例服务',
    constructName: '仓单办理构件',
  });

  await page.getByTestId('tab-process').click();
  await page.getByTestId('sidebar-browse-domain').click();
  await page.locator('.sb-capability-head').filter({ hasText: '示例服务' }).click();
  await expect(page.locator('.sb-construct-head').filter({ hasText: '仓单办理构件' })).toBeVisible();
  await page.locator('.sb-construct-head').filter({ hasText: '仓单办理构件' }).click();
  await expect(page.locator('[data-asset-entity-id="E1"]')).toContainText('仓单');
  await expect(page.getByTestId('construct-task-asset')).toContainText('校验仓单状态');
});

test('业务构件弹窗中的实体编辑跳转到数据页，未分组实体可移入组件', async ({ page, request }) => {
  const documentName = `domain-construct-entity-edit-${Date.now()}`;
  const doc = buildDomainModelingDoc(documentName);
  doc.entities = [
    { id: 'E1', name: '预约单', businessConstructId: 'BC1', businessConstructIds: ['BC1'], fields: [{ name: '预约编号', type: 'string', note: '' }] },
    { id: 'E2', name: '仓库', fields: [] },
  ];
  doc.businessConstructs[0].entityIds = ['E1'];
  await createDocument(request, documentName, doc);

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await expect(page.getByTestId('domain-entity-card')).toHaveCount(0);
  await page.getByTestId('business-model-capability-chip').filter({ hasText: '示例服务' }).click();
  await page.locator('.business-model-move-row').filter({ hasText: '预约办理构件' }).getByTestId('construct-open-button').click();
  await expect(page.locator('.business-model-move-row').filter({ hasText: '预约单' }).getByTestId('construct-entity-edit')).toBeVisible();
  await expect(page.locator('.business-model-move-row').filter({ hasText: '预约单' }).getByTestId('construct-entity-remove')).toBeVisible();
  await expect(page.locator('.business-model-move-row').filter({ hasText: '仓库' }).getByTestId('construct-entity-edit')).toBeVisible();
  await page.locator('.business-model-move-row').filter({ hasText: '仓库' }).getByTestId('construct-entity-add').click();

  await expect.poll(() => page.evaluate(() => ({
    entityName: S.doc.entities.find((entity) => entity.id === 'E2')?.name,
    entityConstructId: S.doc.entities.find((entity) => entity.id === 'E2')?.businessConstructId,
    constructEntityIds: S.doc.businessConstructs.find((construct) => construct.id === 'BC1')?.entityIds || [],
  }))).toEqual({
    entityName: '仓库',
    entityConstructId: 'BC1',
    constructEntityIds: ['E1', 'E2'],
  });

  await page.locator('.business-model-move-row').filter({ hasText: '预约单' }).getByTestId('construct-entity-edit').click();
  await expect(page.getByTestId('data-switch-relation')).toBeVisible();
  await expect(page.locator('.entity-drawer.open')).toBeVisible();
  await expect(page.getByTestId('entity-name-input')).toHaveValue('预约单');
  await expect.poll(() => page.evaluate(() => ({ tab: S.ui.tab, dataView: S.ui.dataView, entityId: S.ui.entityId }))).toEqual({
    tab: 'data',
    dataView: 'relation',
    entityId: 'E1',
  });
  await expect(page.getByTestId('nav-back-button')).toBeEnabled();
  await page.getByTestId('nav-back-button').click();
  await expect(page.getByTestId('tab-domain')).toHaveClass(/active/);
  await expect(page.getByTestId('business-model-dialog')).toBeVisible();
  await expect(page.getByTestId('construct-name-input')).toHaveValue('预约办理构件');
});

test('业务组件和业务构件名称按模型范围保持唯一', async ({ page, request }) => {
  const documentName = `domain-model-unique-name-${Date.now()}`;
  await createDocument(request, documentName, buildDomainModelingDoc(documentName));

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await page.getByTestId('capability-add-button').click();
  await expect(page.getByTestId('capability-name-input')).toHaveValue('新业务组件');
  await page.getByTestId('business-model-dialog-close').click();

  await page.getByTestId('capability-add-button').click();
  await expect(page.getByTestId('capability-name-input')).toHaveValue('新业务组件2');
  await page.getByTestId('capability-name-input').fill('示例服务');
  await expect(page.getByTestId('app-dialog-message')).toContainText('业务组件“示例服务”已存在');
  await page.getByTestId('app-dialog-confirm').click();
  await expect(page.getByTestId('capability-name-input')).toHaveValue('新业务组件2');
  await page.getByTestId('business-model-dialog-close').click();

  await page.getByTestId('business-model-capability-chip').filter({ hasText: '示例服务' }).click();
  await page.getByTestId('construct-add-button').click();
  await expect(page.getByTestId('construct-name-input')).toHaveValue('新业务构件');
  await page.getByTestId('business-model-dialog-close').click();

  await page.getByTestId('business-model-capability-chip').filter({ hasText: '示例服务' }).click();
  await page.getByTestId('construct-add-button').click();
  await expect(page.getByTestId('construct-name-input')).toHaveValue('新业务构件2');
  await page.getByTestId('construct-name-input').fill('新业务构件');
  await expect(page.getByTestId('app-dialog-message')).toContainText('当前范围已存在业务构件“新业务构件”');
  await page.getByTestId('app-dialog-confirm').click();
  await expect(page.getByTestId('construct-name-input')).toHaveValue('新业务构件2');
  await page.getByTestId('business-model-dialog-close').click();

  await page.getByTestId('business-model-capability-chip').filter({ hasText: '用户管理' }).click();
  await page.getByTestId('construct-add-button').click();
  await expect(page.getByTestId('construct-name-input')).toHaveValue('新业务构件');
});

test('业务组件和业务构件弹窗支持删除并清理引用', async ({ page, request }) => {
  const documentName = `domain-model-delete-${Date.now()}`;
  await createDocument(request, documentName, buildDomainModelingDoc(documentName));

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await page.getByTestId('business-model-capability-chip').filter({ hasText: '示例服务' }).click();
  await expect(page.getByTestId('capability-delete-button')).toBeVisible();
  await page.getByTestId('capability-delete-button').click();
  await expect(page.getByTestId('app-dialog-message')).toContainText('当前业务组件下还有 1 个业务构件');
  await page.getByTestId('app-dialog-confirm').click();
  await expect(page.getByTestId('business-model-dialog')).toBeVisible();

  await page.locator('.business-model-move-row').filter({ hasText: '预约办理构件' }).getByTestId('construct-open-button').click();
  await expect(page.getByTestId('construct-delete-button')).toBeVisible();
  await page.getByTestId('construct-delete-button').click();
  await expect(page.getByTestId('app-dialog-message')).toContainText('确认删除业务构件“预约办理构件”');
  await page.getByTestId('app-dialog-confirm').click();
  await expect(page.getByTestId('business-model-dialog')).toBeVisible();
  await expect(page.getByTestId('capability-name-input')).toHaveValue('示例服务');
  await expect(page.getByTestId('business-model-dialog')).not.toContainText('预约办理构件');

  await expect.poll(() => page.evaluate(() => ({
    hasConstruct: (S.doc.businessConstructs || []).some((construct) => construct.id === 'BC1'),
    capabilityConstructIds: (S.doc.capabilityUnits || []).find((capability) => capability.id === 'CU1')?.constructIds || [],
    taskConstructId: (S.doc.taskDefinitions || []).find((task) => task.id === 'TD1')?.constructId || '',
    processTaskConstructId: (S.doc.processes || [])[0]?.nodes?.[0]?.orchestrationTasks?.[0]?.businessConstructId || '',
  }))).toEqual({
    hasConstruct: false,
    capabilityConstructIds: [],
    taskConstructId: '',
    processTaskConstructId: '',
  });

  await page.getByTestId('capability-delete-button').click();
  await expect(page.getByTestId('app-dialog-message')).toContainText('确认删除业务组件“示例服务”');
  await page.getByTestId('app-dialog-confirm').click();
  await expect(page.getByTestId('business-model-dialog')).toHaveCount(0);

  await expect.poll(() => page.evaluate(() => ({
    hasCapability: (S.doc.capabilityUnits || []).some((capability) => capability.id === 'CU1'),
    taskCapabilityId: (S.doc.taskDefinitions || []).find((task) => task.id === 'TD1')?.capabilityUnitId || '',
  }))).toEqual({
    hasCapability: false,
    taskCapabilityId: '',
  });
  await expect(page.getByTestId('business-model-card')).not.toContainText('示例服务');
});

test('左侧目录同时展示流程目录和组件目录', async ({ page, request }) => {
  const documentName = `sidebar-browse-stacked-${Date.now()}`;
  await createDocument(request, documentName, buildDomainModelingDoc(documentName));

  await page.goto('/');
  await openDocumentFromList(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('sidebar-browse-stage')).toBeVisible();
  await expect(page.getByTestId('sidebar-browse-domain')).toBeVisible();
  await expect(page.getByTestId('sidebar-process-mode-switch')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();

  const componentBrowse = page.getByTestId('sidebar-domain-browse');
  const firstCapabilityHead = componentBrowse.locator('.sb-capability-head').filter({ hasText: '示例服务' });
  const firstProcessItem = componentBrowse.locator('.sb-proc-head').filter({ hasText: '预约录入' });

  await firstCapabilityHead.click();
  await page.locator('.sb-construct-head').filter({ hasText: '预约办理构件' }).click();
  await expect(firstProcessItem).toBeVisible();
  await expect(firstProcessItem).toContainText('组件：示例服务');
  await expect(firstProcessItem).not.toContainText('分组：核心流程');

  await firstCapabilityHead.click();
  await expect(firstProcessItem).not.toBeVisible();

  await page.getByTestId('process-switch-stage').click();
  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();
  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
});

test('业务模型子弹窗支持返回且点击遮罩不关闭', async ({ page, request }) => {
  const documentName = `business-model-dialog-back-${Date.now()}`;
  const capabilityName = '\u4ea4\u5272\u670d\u52a1\u673a\u6784\u7ba1\u7406';
  const constructName = '\u4ed3\u5e93\u4fe1\u606f\u7ef4\u62a4';
  const taskName = '\u63d0\u4ea4\u4ed3\u5e93\u57fa\u672c\u4fe1\u606f';
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04' },
    roles: [],
    language: [],
    stages: [],
    stageLinks: [],
    processes: [],
    capabilityUnits: [
      { id: 'CU1', name: capabilityName, kind: 'core', constructIds: ['BC1'], entityIds: [], taskDefinitionIds: ['TD1'] },
    ],
    businessConstructs: [
      { id: 'BC1', name: constructName, capabilityUnitId: 'CU1', capabilityUnit: capabilityName, entityIds: [], taskDefinitionIds: ['TD1'] },
    ],
    taskDefinitions: [
      { id: 'TD1', name: taskName, type: 'Service', target: '', note: '', capabilityUnitId: 'CU1', capabilityUnit: capabilityName, constructId: 'BC1', constructName },
    ],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocumentFromList(page, documentName);

  await page.getByTestId('business-model-capability-chip').filter({ hasText: capabilityName }).click();
  await page.locator('.business-model-move-row').filter({ hasText: constructName }).getByTestId('construct-open-button').click();
  await expect(page.getByTestId('construct-name-input')).toHaveValue(constructName);

  await page.getByTestId('business-model-dialog-backdrop').click({ position: { x: 6, y: 6 } });
  await expect(page.getByTestId('construct-name-input')).toHaveValue(constructName);

  await page.getByTestId('business-model-dialog-back').click();
  await expect(page.getByTestId('capability-name-input')).toHaveValue(capabilityName);

  await page.locator('.business-model-move-row').filter({ hasText: constructName }).getByTestId('construct-open-button').click();
  await page.locator('.business-model-move-row').filter({ hasText: taskName }).getByTestId('construct-task-edit').click();
  await expect(page.getByTestId('task-definition-name-input')).toHaveValue(taskName);

  await page.getByTestId('business-model-dialog-backdrop').click({ position: { x: 6, y: 6 } });
  await expect(page.getByTestId('task-definition-name-input')).toHaveValue(taskName);

  await page.getByTestId('task-definition-delete-button').click();
  await expect(page.getByTestId('app-dialog-message')).toContainText(`确认删除任务定义“${taskName}”`);
  await page.getByTestId('app-dialog-confirm').click();
  await expect(page.getByTestId('construct-name-input')).toHaveValue(constructName);
  await expect(page.getByTestId('business-model-dialog')).not.toContainText(taskName);

  await page.getByTestId('business-model-dialog-back').click();
  await expect(page.getByTestId('capability-name-input')).toHaveValue(capabilityName);

  await page.getByTestId('business-model-dialog-close').click();
  await expect(page.getByTestId('business-model-dialog')).toHaveCount(0);
});
