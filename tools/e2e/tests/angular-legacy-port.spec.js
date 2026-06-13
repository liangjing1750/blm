const { test, expect } = require('@playwright/test');

const { createDocument } = require('./support/app-helpers');

function buildSmokeDocument(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-06-11',
    },
    roles: [],
    language: [],
    rules: [],
    processes: [],
    entities: [],
    relations: [],
    components: [],
    taskDefinitions: [],
    stages: [],
    stageFlowRefs: [],
    panorama: {
      columns: [],
      lanes: [],
      cells: [],
      strategy: {
        vision: '',
        values: '',
        goals: '',
      },
    },
  };
}

function buildKnowledgeDocument(name) {
  const doc = buildSmokeDocument(name);
  doc.language = [
    { term: '现货仓单', definition: '平台内记录仓储实物状态的仓单。' },
  ];
  doc.processes = [
    {
      uid: 'P1',
      name: '入库办理',
      tasks: [
        {
          uid: 'T1',
          name: '确认到货',
          businessRules: [
            { uid: 'BR1', name: '前置条件', content: '预约通过且货物到库。' },
          ],
        },
      ],
    },
    {
      uid: 'P2',
      name: '出库办理',
      tasks: [
        {
          uid: 'T2',
          name: '核对出库指令',
          businessRules: [
            { uid: 'BR2', name: '授权校验', content: '出库前必须确认授权关系。' },
          ],
        },
      ],
    },
  ];
  for (let index = 0; index < 32; index += 1) {
    doc.processes[1].tasks[0].businessRules.push({
      uid: `BR2-${index}`,
      name: `授权校验${index + 1}`,
      content: `出库前必须确认授权关系、客户状态、仓单状态和操作留痕。第 ${index + 1} 条。`,
    });
  }
  for (let index = 0; index < 24; index += 1) {
    doc.processes.push({
      uid: `PX${index}`,
      name: `会员信息维护${index + 1}`,
      outcome: '形成会员信息维护结果并记录留痕',
      tasks: [],
    });
  }
  return doc;
}

function buildStageSmokeDocument(name) {
  const doc = buildSmokeDocument(name);
  doc.panorama = {
    columns: [{ id: 'value-a', name: '价值流A', badge: '', scope: '' }],
    lanes: [{ id: 'domain-a', name: '业务域A', badge: '', note: '' }],
    cells: [],
    strategy: { vision: '', values: '', goals: '' },
  };
  doc.stages = [
    { id: 'S1', name: '阶段一', subDomain: '业务域A', panoramaColumnUid: 'value-a', panoramaLaneUid: 'domain-a' },
  ];
  doc.processes = [
    { id: 'P1', name: '流程一', flowGroup: '分组一', nodes: [] },
    { id: 'P2', name: '流程二', flowGroup: '分组一', nodes: [] },
    { id: 'P3', name: '流程三', flowGroup: '分组二', nodes: [] },
  ];
  doc.stageFlowRefs = [
    { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1 },
    { id: 'SFR2', stageId: 'S1', processId: 'P2', order: 2 },
    { id: 'SFR3', stageId: 'S1', processId: 'P3', order: 3 },
  ];
  doc.stageFlowLinks = [
    { id: 'SFL1', stageId: 'S1', fromRefId: 'SFR1', toRefId: 'SFR2' },
  ];
  return doc;
}

test('Angular legacy port loads the old BLM shell and workbench tabs', async ({ page, request }) => {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  const documentName = `angular-legacy-${Date.now()}`;
  await createDocument(request, documentName, buildSmokeDocument(documentName));

  await page.goto('/');

  await expect(page.locator('#toolbar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/no-doc-shell/);
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#sb-toggle-wrap')).toBeHidden();
  await expect(page.locator('#tab-content')).toContainText('BLM（Business Language Modeling）业务语言建模');
  await expect(page.getByTestId('toolbar-new-button')).toHaveCount(1);
  await page.locator('#dd-file').hover();
  await page.locator('#dd-file .tbar-dd-btn').click();
  await expect(page.getByTestId('toolbar-new-button')).toBeVisible();
  await expect(page.getByTestId('toolbar-open-button')).toBeVisible();
  await expect(page.getByTestId('current-file-name')).toBeVisible();
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);

  await expect(page.getByTestId('tab-panoramaWorkbench')).toBeVisible();
  await expect(page.getByTestId('tab-processWorkbench')).toBeVisible();
  await expect(page.getByTestId('tab-constructWorkbench')).toBeVisible();
  await expect(page.getByTestId('tab-orchestrationWorkbench')).toBeVisible();

  const runtimeState = await page.evaluate(() => ({
    hasApp: Boolean(window.App),
    hasState: Boolean(window.S),
    hasAI: Boolean(window.AI),
    legacyLoaded: Boolean(window.__BLM_LEGACY_RUNTIME_LOADED__),
  }));

  expect(runtimeState).toEqual({
    hasApp: true,
    hasState: true,
    hasAI: true,
    legacyLoaded: true,
  });
  expect(errors).toEqual([]);
});

test('Angular child routes refresh back into the old shell', async ({ page }) => {
  for (const route of ['/process', '/role', '/entity', '/component', '/orchestration', '/knowledge']) {
    await page.goto(route);
    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.getByTestId('toolbar-new-button')).toHaveCount(1);
    await expect(page.locator('#tab-content')).toContainText('BLM');
  }
});

test('main workbench tabs keep a minimal user journey while still in legacy mode', async ({ page, request }) => {
  const documentName = `workbench-smoke-${Date.now()}`;
  await createDocument(request, documentName, buildSmokeDocument(documentName));

  await page.goto('/');
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);

  const workbenches = [
    { tab: 'tab-panoramaWorkbench', content: '[data-testid="panorama-overview-map"], .panorama-map, #tab-content' },
    { tab: 'tab-processWorkbench', content: '#tab-content' },
    { tab: 'tab-constructWorkbench', content: '[data-testid="entity-state-empty"], .entity-state-graph, #tab-content' },
    { tab: 'tab-orchestrationWorkbench', content: '[data-testid="orchestration-workbench"], .orchestration-board, #tab-content' },
  ];

  for (const workbench of workbenches) {
    await page.getByTestId(workbench.tab).click();
    await expect(page.getByTestId(workbench.tab)).toHaveClass(/active/);
    await expect(page.locator(workbench.content).first()).toBeVisible();
    await expect(page.locator('#tab-content')).not.toHaveText('');
  }
});

test('panorama workbench hosts old value-domain panorama as a separate tab', async ({ page, request }) => {
  const documentName = `panorama-value-domain-${Date.now()}`;
  await createDocument(request, documentName, buildSmokeDocument(documentName));

  await page.goto('/');
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);

  await page.getByTestId('tab-panoramaWorkbench').click();
  await expect(page.getByTestId('domain-subtab-panorama')).toHaveText('全景视图');
  await expect(page.getByTestId('domain-subtab-valueDomain')).toHaveText('价值流与业务域');
  await expect(page.getByTestId('domain-subtab-roles')).toHaveText('角色管理');
  await expect(page.getByTestId('domain-subtab-termManagement')).toHaveText('术语管理');
  await expect(page.getByTestId('domain-subtab-dictionaryManagement')).toHaveText('字典管理');
  await expect(page.getByTestId('domain-subtab-rules')).toHaveText('规则条目');

  await expect(page.getByTestId('panorama-business-map')).toBeVisible();
  await page.getByTestId('domain-subtab-valueDomain').click();
  await expect(page.getByTestId('value-domain-angular-host')).toBeVisible();
  await expect(page.getByTestId('value-domain-angular')).toBeVisible();
  await expect(page.getByTestId('value-domain-matrix')).toBeVisible();
  await expect(page.getByTestId('process-switch-panorama')).toHaveCount(0);
  await expect(page.getByTestId('stage-editor-open')).toBeVisible();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-editor-hide')).toBeVisible();
  await expect(page.getByTestId('matrix-column-name').first()).toBeVisible();
  await expect(page.getByTestId('matrix-lane-name').first()).toBeVisible();

  const columnNameCount = await page.getByTestId('matrix-column-name').count();
  const laneNameCount = await page.getByTestId('matrix-lane-name').count();
  await page.getByTestId('matrix-column-add-after').first().click();
  await expect(page.getByTestId('matrix-column-name')).toHaveCount(columnNameCount + 1);
  await page.getByTestId('matrix-lane-add-after').first().click();
  await expect(page.getByTestId('matrix-lane-name')).toHaveCount(laneNameCount + 1);
  await page.getByTestId('stage-overview-add-button').first().click();
  await expect(page.getByTestId('stage-dialog-backdrop')).toBeVisible();
  await page.getByTestId('stage-dialog-name').fill('入库');
  await page.getByTestId('stage-dialog-confirm').click();
  await expect(page.getByTestId('value-domain-stage-card')).toHaveCount(1);
  await page.getByTestId('panorama-cell-status').first().fill('关键');
  await page.getByTestId('panorama-cell-text').first().fill('需确认口径');
  await expect(page.getByTestId('panorama-cell-text').first()).toHaveValue('需确认口径');

  const editState = await page.evaluate(() => ({
    modified: Boolean(window.S?.modified),
    hasDraftHooks: Boolean(window.S?.collab || window.queueCollabSnapshotSync),
  }));
  expect(editState.modified).toBe(true);
});

test('process stage view is rendered by Angular and keeps stage editing actions', async ({ page, request }) => {
  const documentName = `process-stage-angular-${Date.now()}`;
  await createDocument(request, documentName, buildStageSmokeDocument(documentName));

  await page.goto('/');
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);

  await page.getByTestId('tab-processWorkbench').click();
  await expect(page.getByTestId('process-stage-angular-host')).toBeVisible();
  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.getByTestId('stage-panorama-graph')).toHaveCount(0);
  await expect(page.getByTestId('stage-flow-group')).toHaveCount(2);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(3);

  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-process-select')).toBeVisible();
  await expect(page.getByTestId('stage-flow-node-add-button')).toBeVisible();
  await expect(page.getByTestId('stage-flow-name-input')).toHaveCount(3);
  await expect(page.getByTestId('stage-flow-node-group-input')).toHaveCount(3);
  await expect(page.getByTestId('stage-member-delete-button')).toHaveCount(3);
  await expect(page.locator('[data-testid="stage-flow-node-group-editor"] button[aria-label="清空分组"]')).toHaveCount(3);
  await page.getByTestId('stage-flow-node-group-input').first().fill('新分组');
  await expect.poll(() => page.evaluate(() => window.S.doc.processes.find((process) => process.name === '流程一')?.flowGroup)).toBe('新分组');

  const secondNode = page.getByTestId('stage-graph-node').nth(1);
  const secondProcessId = await secondNode.getAttribute('data-process-id');
  const secondBox = await secondNode.boundingBox();
  expect(secondBox).not.toBeNull();
  expect(secondProcessId).not.toBeNull();
  await page.mouse.move(secondBox.x + 6, secondBox.y + 6);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 6, secondBox.y + 126, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate((id) => {
    const ref = window.S.doc.stageFlowRefs.find((item) => item.processId === id || item.processUid === id);
    return Boolean(ref?.pos && Math.abs(ref.pos.y) > 0);
  }, secondProcessId)).toBe(true);

  const firstNode = page.getByTestId('stage-graph-node').first();
  const firstProcessId = await firstNode.getAttribute('data-process-id');
  const targetGroup = page.getByTestId('stage-flow-group').last();
  const targetGroupName = await targetGroup.getAttribute('data-flow-group');
  const firstBox = await firstNode.boundingBox();
  const groupBox = await targetGroup.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(groupBox).not.toBeNull();
  expect(firstProcessId).not.toBeNull();
  expect(targetGroupName).not.toBeNull();
  await page.mouse.move(firstBox.x + 6, firstBox.y + 6);
  await page.mouse.down();
  await page.mouse.move(groupBox.x + groupBox.width / 2, groupBox.y + groupBox.height / 2, { steps: 12 });
  await expect(targetGroup).toHaveClass(/is-drag-target/);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(({ processId }) => {
    return window.S.doc.processes.find((process) => process.id === processId || process.uid === processId)?.flowGroup;
  }, { processId: firstProcessId })).toBe(targetGroupName);
});

test('process workbench main tab resets old panorama state to stage detail', async ({ page, request }) => {
  const documentName = `process-stage-default-${Date.now()}`;
  await createDocument(request, documentName, buildStageSmokeDocument(documentName));

  await page.goto('/');
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);

  await page.evaluate(() => {
    window.S.ui.procView = 'stage';
    window.S.ui.stageViewMode = 'panorama';
  });
  await page.getByTestId('tab-panoramaWorkbench').click();
  await page.getByTestId('tab-processWorkbench').click();

  await expect(page.getByTestId('process-stage-angular-host')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.getByTestId('stage-panorama-graph')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.S.ui.stageViewMode)).toBe('detail');
});

test('panorama knowledge tabs are rendered by Angular without editing the data model', async ({ page, request }) => {
  const documentName = `panorama-knowledge-${Date.now()}`;
  await createDocument(request, documentName, buildKnowledgeDocument(documentName));

  await page.goto('/');
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await expect(page.getByTestId('current-file-name')).toHaveText(documentName);

  await page.getByTestId('tab-panoramaWorkbench').click();
  await page.getByTestId('domain-subtab-termManagement').click();
  await expect(page.getByTestId('knowledge-angular-host')).toBeVisible();
  await expect(page.getByTestId('knowledge-language-panel')).toBeVisible();
  await expect(page.getByTestId('knowledge-term-name').first()).toHaveValue('现货仓单');
  await page.getByTestId('knowledge-term-add').click();
  await expect(page.getByTestId('knowledge-language-item')).toHaveCount(2);
  await page.getByTestId('knowledge-term-name').last().fill('担保品');
  await page.getByTestId('knowledge-term-description').last().fill('业务中用于担保的资产或权益。');
  await expect(page.getByTestId('knowledge-term-name').last()).toHaveValue('担保品');

  await page.getByTestId('domain-subtab-dictionaryManagement').click();
  await expect(page.getByTestId('knowledge-dictionary-panel')).toBeVisible();
  await expect(page.getByTestId('knowledge-dictionary-empty')).toContainText('字典管理后续单独设计');

  await page.getByTestId('domain-subtab-rules').click();
  await expect(page.getByTestId('knowledge-angular-host')).toBeVisible();
  await expect(page.getByTestId('knowledge-rules-panel')).toBeVisible();
  await expect(page.getByTestId('knowledge-function-item')).toHaveCount(26);
  await expect(page.getByTestId('knowledge-rule-row').first()).toContainText('前置条件');
  await expect(page.getByTestId('knowledge-rule-row').first()).toContainText('入库办理');
  await page.getByTestId('knowledge-function-item').filter({ hasText: '出库办理' }).click();
  await expect(page.getByTestId('knowledge-rule-row').filter({ hasText: '授权校验' }).first()).toBeVisible();
  const functionOverflow = await page.locator('.knowledge-function-scroll').evaluate((node) => ({
    horizontal: node.scrollWidth >= node.clientWidth,
    vertical: node.scrollHeight > node.clientHeight,
  }));
  expect(functionOverflow.vertical).toBe(true);
  const ruleOverflow = await page.getByTestId('knowledge-rules-table').evaluate((node) => ({
    horizontal: node.scrollWidth > node.clientWidth,
    vertical: node.scrollHeight > node.clientHeight,
  }));
  expect(ruleOverflow).toEqual({ horizontal: true, vertical: true });
  await page.getByTestId('knowledge-rule-search').fill('预约');
  await expect(page.getByTestId('knowledge-rules-empty')).toBeVisible();
  await page.getByTestId('knowledge-rule-search').fill('授权');
  await expect(page.getByTestId('knowledge-rule-row').filter({ hasText: '授权校验' }).first()).toBeVisible();
});
