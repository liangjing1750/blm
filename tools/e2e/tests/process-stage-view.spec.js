const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const { createDocument, expandValueStreams, openDocument } = require('./support/app-helpers');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const samplePlatformDocPath = path.join(repoRoot, 'workspace', '示例平台', 'manifest.json');

function buildStageDoc(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-04-23',
    },
    roles: [],
    language: [],
    stages: [
      {
        id: 'S1',
        name: '开户准备',
        subDomain: '账户',
        pos: { x: 0, y: 0 },
        processLinks: [
          { fromProcessId: 'P1', toProcessId: 'P2' },
        ],
      },
      {
        id: 'S2',
        name: '开户完成',
        subDomain: '账户',
        pos: { x: 0, y: 0 },
        processLinks: [],
      },
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
        name: '资料录入',
        subDomain: '账户',
        stageId: 'S1',
        flowGroup: '开户组',
        trigger: '',
        outcome: '',
        nodes: [],
      },
      {
        id: 'P2',
        name: '资料审核',
        subDomain: '账户',
        stageId: 'S1',
        flowGroup: '开户组',
        trigger: '',
        outcome: '',
        nodes: [],
      },
      {
        id: 'P3',
        name: '账户开通',
        subDomain: '账户',
        stageId: 'S2',
        flowGroup: '开户组',
        trigger: '',
        outcome: '',
        nodes: [],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

function buildSharedFlowDoc(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-04-24',
    },
    roles: [],
    language: [],
    stages: [
      { id: 'S1', name: '预约阶段', subDomain: '示例', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S2', name: '办理阶段', subDomain: '示例', pos: { x: 0, y: 0 }, processLinks: [] },
    ],
    stageLinks: [
      { fromStageId: 'S1', toStageId: 'S2' },
    ],
    stageFlowRefs: [
      { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1, pos: { x: 0, y: 0 } },
      { id: 'SFR2', stageId: 'S1', processId: 'P2', order: 2, pos: { x: 0, y: 0 } },
      { id: 'SFR3', stageId: 'S2', processId: 'P2', order: 1, pos: { x: 0, y: 0 } },
      { id: 'SFR4', stageId: 'S2', processId: 'P3', order: 2, pos: { x: 0, y: 0 } },
    ],
    stageFlowLinks: [
      { id: 'SFL1', stageId: 'S1', fromRefId: 'SFR1', toRefId: 'SFR2' },
      { id: 'SFL2', stageId: 'S2', fromRefId: 'SFR3', toRefId: 'SFR4' },
    ],
    processes: [
      { id: 'P1', name: '预约录入', subDomain: '示例', stageId: 'S1', flowGroup: '预约组', trigger: '', outcome: '', nodes: [] },
      {
        id: 'P2',
        name: '资料审核',
        subDomain: '示例',
        stageId: 'S1',
        flowGroup: '审核组',
        trigger: '',
        outcome: '',
        nodes: [
          {
            id: 'N2',
            name: '审核资料',
            taskDefinitionId: 'TD2',
            businessConstructId: 'BC1',
            role: '机构',
            orchestrationTasks: [
              { id: 'OT2', name: '校验资料完整性', type: 'Service', target: '资料审核服务', note: '' },
            ],
          },
        ],
      },
      { id: 'P3', name: '入库办理', subDomain: '示例', stageId: 'S2', flowGroup: '办理组', trigger: '', outcome: '', nodes: [] },
    ],
    capabilityUnits: [
      { id: 'CU1', name: '示例组件', kind: 'core', constructIds: ['BC1'], entityIds: [], taskDefinitionIds: ['TD2'] },
    ],
    businessConstructs: [
      { id: 'BC1', name: '审核构件', capabilityUnitId: 'CU1', capabilityUnit: '示例组件', entityIds: [], taskDefinitionIds: ['TD2'] },
    ],
    taskDefinitions: [
      { id: 'TD2', name: '审核资料', type: 'Service', target: '资料审核服务', note: '', capabilityUnitId: 'CU1', capabilityUnit: '示例组件', constructId: 'BC1', constructName: '审核构件' },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

function buildUngroupedStageDoc(name) {
  const doc = buildStageDoc(name);
  doc.stages = [
    { id: 'S1', name: '单流程阶段', subDomain: '账户', pos: { x: 0, y: 0 }, processLinks: [] },
  ];
  doc.stageLinks = [];
  doc.stageFlowRefs = [
    { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1, pos: { x: 0, y: 0 } },
  ];
  doc.stageFlowLinks = [];
  doc.processes = [
    { id: 'P1', name: '资料录入', subDomain: '账户', stageId: 'S1', flowGroup: '', trigger: '', outcome: '', nodes: [] },
  ];
  return doc;
}

function buildParallelUngroupedStageDoc(name) {
  const doc = buildStageDoc(name);
  doc.stages = [
    { id: 'S1', name: '并列阶段', subDomain: '账户', pos: { x: 0, y: 0 }, processLinks: [] },
  ];
  doc.stageLinks = [];
  doc.stageFlowRefs = [
    { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1, pos: { x: 0, y: 0 } },
    { id: 'SFR2', stageId: 'S1', processId: 'P2', order: 2, pos: { x: 0, y: 0 } },
    { id: 'SFR3', stageId: 'S1', processId: 'P3', order: 3, pos: { x: 0, y: 0 } },
  ];
  doc.stageFlowLinks = [
    { id: 'SFL1', stageId: 'S1', fromRefId: 'SFR1', toRefId: 'SFR2' },
    { id: 'SFL2', stageId: 'S1', fromRefId: 'SFR2', toRefId: 'SFR3' },
  ];
  doc.processes = [
    { id: 'P1', name: '会员信息维护', subDomain: '账户', stageId: 'S1', flowGroup: '', trigger: '', outcome: '', nodes: [] },
    { id: 'P2', name: '客户资料维护', subDomain: '账户', stageId: 'S1', flowGroup: '', trigger: '', outcome: '', nodes: [] },
    { id: 'P3', name: '会贸客户关系维护', subDomain: '账户', stageId: 'S1', flowGroup: '', trigger: '', outcome: '', nodes: [] },
  ];
  return doc;
}

async function openStageBrowse(page) {
  await page.getByTestId('sidebar-browse-stage').click();
  await expandValueStreams(page);
}

test('左侧目录按业务流程视角展示价值流、阶段和流程，点击阶段进入阶段详情', async ({ page, request }) => {
  const documentName = `process-stage-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await expect(page.getByTestId('sidebar-browse-stage')).toHaveClass(/active/);
  await openStageBrowse(page);
  await expect(page.locator('.sb-stage-head[data-stage-id="S1"]')).toBeVisible();
  await expect(page.locator('.sb-stage-head[data-stage-id="S2"]')).toBeVisible();

  const s1StageHead = page.locator('.sb-stage-head[data-stage-id="S1"]');
  const s1ProcessRows = page.locator('.sb-proc-head[data-process-id="P1"], .sb-proc-head[data-process-id="P2"]');
  await expect(s1ProcessRows).toHaveCount(0);

  await s1StageHead.click();
  await expect(s1ProcessRows).toHaveCount(2);

  await s1StageHead.click();
  await expect(s1ProcessRows).toHaveCount(0);

  await s1StageHead.click();
  await expect(s1ProcessRows).toHaveCount(2);

  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-graph-node"] .stage-flow-node-meta')).toHaveCount(0);
  await expect(page.getByTestId('stage-flow-group')).toHaveCount(1);
  await expect(page.getByTestId('stage-flow-group')).toContainText('开户组');
  await expect
    .poll(() => page.evaluate(() => {
      const groupTitle = document.querySelector('.stage-flow-group-title');
      const firstNode = document.querySelector('[data-testid="stage-graph-node"]');
      if (!groupTitle || !firstNode) return false;
      const titleBox = groupTitle.getBoundingClientRect();
      const nodeBox = firstNode.getBoundingClientRect();
      return titleBox.bottom <= nodeBox.top - 2;
    }))
    .toBe(true);
  await expect(page.getByTestId('stage-flow-group-editor')).toHaveCount(0);
  const nodeBoxes = await page.locator('[data-testid="stage-graph-node"]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    })
  ));
  expect(nodeBoxes[1].left).toBeGreaterThan(nodeBoxes[0].left);
  const writingMode = await page.locator('[data-testid="stage-graph-node"][data-process-id="P1"] .stage-flow-node-title').evaluate((node) => getComputedStyle(node).writingMode);
  expect(writingMode).toBe('vertical-lr');
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-business-domain-readonly')).toBeVisible();
  await expect(page.getByTestId('stage-name-input')).toHaveCount(0);
  await expect(page.getByTestId('stage-subdomain-input')).toHaveCount(0);
  await expect(page.getByTestId('stage-flow-name-input')).toHaveCount(2);
  await expect(page.getByTestId('stage-flow-node-group-editor')).toHaveCount(2);
  await expect(page.getByTestId('stage-flow-node-group-input')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-flow-node-group-input"][data-process-id="P1"]')).toHaveValue('开户组');
  await page.locator('[data-testid="stage-flow-node-group-input"][data-process-id="P1"]').fill('开户资料组');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => S.doc.processes.find((proc) => proc.id === 'P1')?.flowGroup)).toBe('开户资料组');
  await expect.poll(() => page.evaluate(() => S.doc.processes.find((proc) => proc.id === 'P2')?.flowGroup)).toBe('开户组');
  await expect(page.getByTestId('stage-flow-group').filter({ hasText: '开户资料组' })).toHaveCount(1);
});

test('阶段详情可单独编辑并列流程中的单个流程分组', async ({ page, request }) => {
  const documentName = `process-stage-single-group-${Date.now()}`;
  await createDocument(request, documentName, buildParallelUngroupedStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await openStageBrowse(page);
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await expect(page.getByTestId('stage-flow-group')).toHaveCount(0);
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-node-group-input')).toHaveCount(3);

  await page.locator('[data-testid="stage-flow-node-group-input"][data-process-id="P2"]').fill('客户维护');
  await page.keyboard.press('Enter');

  await expect.poll(() => page.evaluate(() => {
    const groups = Object.fromEntries((S.doc.processes || []).map((proc) => [proc.id, proc.flowGroup || '']));
    return JSON.stringify(groups);
  })).toBe(JSON.stringify({ P1: '', P2: '客户维护', P3: '' }));
  await expect(page.getByTestId('stage-flow-group').filter({ hasText: '客户维护' })).toHaveCount(1);
  await expect(page.getByTestId('stage-flow-node-group-input')).toHaveCount(3);
});

test('阶段详情可为未分组流程新建并显示分组', async ({ page, request }) => {
  const documentName = `process-stage-new-group-${Date.now()}`;
  await createDocument(request, documentName, buildUngroupedStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await openStageBrowse(page);
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await expect(page.getByTestId('stage-flow-group')).toHaveCount(0);
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-group')).toHaveCount(0);
  await expect(page.getByTestId('stage-flow-node-group-input')).toHaveValue('');

  await page.getByTestId('stage-flow-node-group-input').fill('资料组');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => S.doc.processes.find((proc) => proc.id === 'P1')?.flowGroup)).toBe('资料组');
  await expect(page.getByTestId('stage-flow-group')).toContainText('资料组');
});

test('示例平台全景编辑态与阅读态都按真实细阶段显示', async ({ page, request }) => {
  test.skip(!fs.existsSync(samplePlatformDocPath), '本地未提供示例平台样例文档');
  const documentName = '示例平台';
  const document = JSON.parse(fs.readFileSync(samplePlatformDocPath, 'utf8'));
  await createDocument(request, documentName, document);

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-panorama').click();

  const matrix = page.getByTestId('value-stream-matrix');
  await expect(matrix).toHaveAttribute('data-editing', 'false');
  const readLabels = await matrix.locator('[data-testid="stage-graph-node"] .stage-graph-node-title').allTextContents();
  expect(readLabels).toContain('场内基础资料维护');
  expect(readLabels).toContain('仓库仓单注册');
  expect(readLabels).toContain('厂库仓单注册');
  expect(readLabels).toContain('仓单注销办理');
  expect(readLabels).toContain('参与方准入与授权');
  expect(readLabels).toContain('示例仓库主体管理');
  expect(readLabels).toContain('提货地点与监管点位标定');
  expect(readLabels).toContain('入库预约受理');
  expect(readLabels).toContain('入库验收核对');
  expect(readLabels).toContain('货转办理');
  expect(readLabels).toContain('仓库出库预约');
  expect(readLabels).toContain('厂库出库办理与复检');
  expect(readLabels).toContain('查库整改');

  const longStageTitle = matrix.locator('[data-testid="stage-graph-node"]').filter({ hasText: '提货地点与监管点位标定' }).locator('.stage-graph-node-title');
  await expect(longStageTitle).toHaveText('提货地点与监管点位标定');
  await expect.poll(async () => longStageTitle.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);

  await page.getByTestId('stage-editor-open').click();
  await expect(matrix).toHaveAttribute('data-editing', 'true');
  const editLabels = await matrix.locator('[data-testid="stage-graph-node"] .stage-graph-node-title').allTextContents();
  expect(editLabels).toEqual(readLabels);

  const warehouseRegistrationStage = matrix.locator('[data-testid="stage-graph-node"]').filter({ hasText: '仓库仓单注册' });
  await expect(warehouseRegistrationStage).toHaveAttribute('data-flow-count', '1');
  await expect(warehouseRegistrationStage.getByTestId('matrix-stage-delete')).toHaveCount(1);

  const factoryRegistrationStage = matrix.locator('[data-testid="stage-graph-node"]').filter({ hasText: '厂库仓单注册' });
  await expect(factoryRegistrationStage).toHaveAttribute('data-flow-count', '1');

  const warehouseOutboundReservationStage = matrix.locator('[data-testid="stage-graph-node"]').filter({ hasText: '仓库出库预约' });
  await expect(warehouseOutboundReservationStage).toHaveAttribute('data-flow-count', '3');

  const warehouseOutboundStage = matrix.locator('[data-testid="stage-graph-node"]').filter({ hasText: '仓库出库办理' });
  await expect(warehouseOutboundStage).toHaveAttribute('data-flow-count', '1');

  const factoryOutboundReservationStage = matrix.locator('[data-testid="stage-graph-node"]').filter({ hasText: '厂库出库预约' });
  await expect(factoryOutboundReservationStage).toHaveAttribute('data-flow-count', '3');

  const factoryOutboundStage = matrix.locator('[data-testid="stage-graph-node"]').filter({ hasText: '厂库出库办理与复检' });
  await expect(factoryOutboundStage).toHaveAttribute('data-flow-count', '2');
});

test('阶段详情支持画布编辑并提供统一快捷操作', async ({ page, request }) => {
  const documentName = `process-stage-actions-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await openStageBrowse(page);
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);

  await expect(page.getByTestId('stage-detail-title')).toContainText('开户准备');
  await page.locator('[data-testid="stage-detail-title"] .stage-detail-name-text').dblclick();
  await expect(page.getByTestId('stage-name-inline-input')).toHaveValue('开户准备');
  await page.getByTestId('stage-name-inline-input').fill('开户资料准备');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('stage-detail-title')).toContainText('开户资料准备');
  await expect(page.locator('.sb-stage-head[data-stage-id="S1"]')).toContainText('开户资料准备');
  await expect.poll(() => page.evaluate(() => S.doc.stages.find((stage) => stage.id === 'S1')?.name)).toBe('开户资料准备');

  const firstMember = page.locator('[data-testid="stage-graph-node"][data-process-id="P1"]');
  await expect(firstMember.getByTestId('stage-member-view-button')).toBeVisible();
  await expect(firstMember.getByTestId('stage-flow-link-source-button')).toBeVisible();
  await expect(firstMember.getByTestId('stage-member-remove-button')).toBeVisible();
  await expect(firstMember.getByTestId('stage-member-delete-button')).toBeVisible();
  await expect(firstMember.locator('.stage-quick-btn')).toHaveCount(4);
  await expect(page.getByTestId('stage-process-link-row')).toHaveCount(0);
  await expect(page.getByTestId('stage-process-link-remove-button')).toHaveCount(1);

  await page.getByTestId('stage-process-link-remove-button').click();
  await expect(page.getByTestId('stage-process-link-remove-button')).toHaveCount(0);
  await firstMember.getByTestId('stage-flow-link-source-button').click();
  await expect(firstMember).toHaveClass(/is-link-source/);
  await page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]').getByTestId('stage-flow-link-target-button').click();
  await expect(page.getByTestId('stage-process-link-remove-button')).toHaveCount(1);

  const linkPath = page.locator('.stage-flow-link').first();
  const beforePath = await linkPath.getAttribute('d');
  const secondMember = page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]');
  const secondBox = await secondMember.boundingBox();
  expect(secondBox).not.toBeNull();
  await page.mouse.move(secondBox.x + 4, secondBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 4, secondBox.y + 244, { steps: 6 });
  await expect.poll(async () => linkPath.getAttribute('d')).not.toBe(beforePath);
  const verticalPath = await linkPath.getAttribute('d');
  const pathNumbers = (verticalPath.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  expect(pathNumbers.length).toBeGreaterThanOrEqual(8);
  const lastSegmentStartX = pathNumbers[pathNumbers.length - 4];
  const lastSegmentEndX = pathNumbers[pathNumbers.length - 2];
  expect(lastSegmentEndX).toBeGreaterThan(lastSegmentStartX);
  await page.mouse.up();

  await firstMember.getByTestId('stage-flow-name-input').fill('资料录入调整');
  await expect(firstMember.getByTestId('stage-flow-name-input')).toHaveValue('资料录入调整');
  await expect.poll(async () => page.evaluate(() => S.doc.processes.find((proc) => proc.id === 'P1')?.name)).toBe('资料录入调整');

  const beforeAddBoxes = await page.locator('[data-testid="stage-graph-node"]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { processId: node.dataset.processId, top: rect.top };
    })
  ));
  await page.getByTestId('stage-flow-node-add-button').click();
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(3);
  const afterAddBoxes = await page.locator('[data-testid="stage-graph-node"]').evaluateAll((nodes) => (
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { processId: node.dataset.processId, top: rect.top };
    })
  ));
  const linkedTop = beforeAddBoxes.find((item) => item.processId === 'P1').top;
  const newNodeTop = afterAddBoxes.find((item) => item.processId === 'P4').top;
  expect(newNodeTop).toBeGreaterThan(linkedTop);

  await page.getByTestId('stage-editor-hide').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toHaveCount(0);
  await expect(page.getByTestId('stage-editor-open')).toBeVisible();

  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
});

test('跨阶段、流程和数据切换后支持返回到上一视图', async ({ page, request }) => {
  const documentName = `process-stage-back-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await openStageBrowse(page);
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();

  await page.locator('[data-testid="stage-graph-node"][data-process-id="P1"]').getByTestId('stage-member-view-button').click();
  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();

  await page.getByTestId('tab-data').click();
  await expect(page.getByTestId('tab-data')).toHaveClass(/active/);
  await expect(page.getByTestId('nav-back-button')).toBeEnabled();

  await page.getByTestId('nav-back-button').click();
  await expect(page.getByTestId('tab-process')).toHaveClass(/active/);
  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();
  await expect(page.locator('#proc-name-input')).toHaveValue('资料录入');

  await page.getByTestId('nav-back-button').click();
  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
});

test('同一流程可被两个阶段引用且阶段详情仍指向同一流程实体', async ({ page, request }) => {
  const documentName = `process-stage-shared-${Date.now()}`;
  await createDocument(request, documentName, buildSharedFlowDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await openStageBrowse(page);

  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-name-input')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-flow-name-input"][data-process-id="P2"]')).toHaveValue('资料审核');

  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-flow-name-input')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-flow-name-input"][data-process-id="P2"]')).toHaveValue('资料审核');

  await page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]').getByTestId('stage-member-view-button').click();
  await expect(page.locator('#proc-name-input')).toHaveValue('资料审核');
  await expect(page.getByTestId('proc-stage-ref-list')).toBeVisible();
  await expect(page.getByTestId('proc-stage-ref-chip')).toHaveCount(2);
  await expect(page.getByTestId('proc-stage-ref-list')).toContainText('预约阶段');
  await expect(page.getByTestId('proc-stage-ref-list')).toContainText('办理阶段');
  await expect(page.getByTestId('proc-stage-select')).toHaveCount(0);
});

test('从阶段视图打开流程后侧边栏切到业务组件浏览并定位同一流程', async ({ page, request }) => {
  const documentName = `process-stage-domain-browse-${Date.now()}`;
  await createDocument(request, documentName, buildSharedFlowDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await openStageBrowse(page);
  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await page.getByTestId('stage-editor-open').click();
  await page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]').getByTestId('stage-member-view-button').click();

  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await page.getByTestId('sidebar-browse-domain').click();
  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();
  await page.getByTestId('sidebar-domain-browse').locator('.sb-capability-head').first().click();
  await page.getByTestId('sidebar-domain-browse').locator('.sb-construct-head').first().click();
  await expect(page.locator('.sb-proc-head.active')).toContainText('P2 资料审核');
  await expect(page.locator('.sb-proc-head.active')).toContainText('组件：示例组件');
  await expect(page.locator('.sb-proc-head.active')).not.toContainText('分组：审核组');
});

test('阶段中加入已有流程只新增引用而不复制流程实体', async ({ page, request }) => {
  const documentName = `process-stage-join-existing-${Date.now()}`;
  await createDocument(request, documentName, buildStageDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await openStageBrowse(page);
  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(1);

  await page.getByTestId('stage-process-select').selectOption('P2');

  await expect(page.getByTestId('stage-graph-node')).toHaveCount(2);
  await expect(page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]')).toBeVisible();

  const counts = await page.evaluate(() => ({
    processCount: (S.doc?.processes || []).length,
    refPairs: (S.doc?.stageFlowRefs || []).map((ref) => `${ref.stageId}:${ref.processId}`),
  }));

  expect(counts.processCount).toBe(3);
  expect(counts.refPairs).toContain('S2:P2');
  expect(counts.refPairs.filter((item) => item === 'S2:P2')).toHaveLength(1);
});
