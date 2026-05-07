const { test, expect } = require('@playwright/test');

const {
  acceptAppDialog,
  createDocument,
  createNewDocument,
  expandValueStreams,
  openDocument,
  submitAppPrompt,
} = require('./support/app-helpers');

function buildStagePanoramaDoc(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '2026-04-25' },
    roles: [],
    language: [],
    stages: [
      { id: 'S1', name: 'Stage A', subDomain: 'Domain', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S2', name: 'Stage B', subDomain: 'Domain', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S3', name: 'Stage C', subDomain: 'Domain', pos: { x: 0, y: 0 }, processLinks: [] },
    ],
    stageLinks: [
      { fromStageId: 'S1', toStageId: 'S2' },
      { fromStageId: 'S2', toStageId: 'S3' },
    ],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

function buildPanoramaWithUnassignedProcessDoc(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '2026-04-25' },
    roles: [],
    language: [],
    stages: [
      { id: 'S1', name: '真实业务阶段', subDomain: 'Domain', pos: { x: 0, y: 0 }, processLinks: [] },
    ],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [
      {
        id: 'P1',
        name: '待归类流程',
        subDomain: 'Domain',
        flowGroup: '',
        trigger: '',
        outcome: '',
        tasks: [],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

function buildLongStagePanoramaDoc(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '2026-04-25' },
    roles: [],
    language: [],
    stages: Array.from({ length: 14 }, (_, index) => ({
      id: `S${index + 1}`,
      name: `Stage ${index + 1}`,
      subDomain: index < 7 ? 'Core' : 'Support',
      pos: { x: 0, y: 0 },
      processLinks: [],
    })),
    stageLinks: [
      { fromStageId: 'S1', toStageId: 'S2' },
      { fromStageId: 'S2', toStageId: 'S3' },
    ],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

function buildProcessWorkbenchDoc(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '2026-04-26' },
    roles: [
      { id: 'R1', name: '会员', desc: '发起业务申请', group: '业务参与方' },
      { id: 'R2', name: '仓库管理员', desc: '办理仓储作业', group: '仓库作业方' },
    ],
    language: [],
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
      { id: 'SFR3', stageId: 'S2', processId: 'P2', order: 1, pos: { x: 0, y: 0 } },
    ],
    stageFlowLinks: [
      { id: 'SFL1', stageId: 'S1', fromRefId: 'SFR1', toRefId: 'SFR2' },
    ],
    processes: [
      {
        id: 'P1',
        name: '提交预约',
        subDomain: '示例服务',
        flowGroup: '预约组',
        trigger: '',
        outcome: '',
        tasks: [
          {
            id: 'T1',
            name: '填写预约',
            role_id: 'R1',
            steps: [{ name: '填写预约信息', type: 'Fill', note: '' }],
            entity_ops: [],
          },
        ],
      },
      {
        id: 'P2',
        name: '资料审核',
        subDomain: '示例服务',
        flowGroup: '审核组',
        trigger: '',
        outcome: '',
        tasks: [
          {
            id: 'T2',
            name: '审核资料',
            role_id: 'R2',
            steps: [{ name: '核对预约材料', type: 'Check', note: '' }],
            entity_ops: [],
          },
        ],
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

const DELIVERY_BUSINESS_STAGE_NAMES = [
  '会员客户管理',
  '仓库信息维护',
  '品种参数维护',
  '入库预约',
  '质量检验',
  '仓单注册',
  '仓单过户',
  '仓单抵押',
  '示例配对',
  '出库注销',
  '库存监管',
  '风险预警',
];

const DELIVERY_PROCESS_TASK_NAMES = ['入库预约', '质量检验', '仓单注册', '仓单过户', '出库注销'];

function buildBusinessGuideDoc(name) {
  const stageAssignments = [
    ['C1', 'L1'],
    ['C1', 'L1'],
    ['C1', 'L1'],
    ['C2', 'L1'],
    ['C2', 'L1'],
    ['C2', 'L1'],
    ['C3', 'L1'],
    ['C3', 'L1'],
    ['C3', 'L2'],
    ['C3', 'L2'],
    ['C2', 'L2'],
    ['C2', 'L2'],
  ];
  return {
    meta: { title: name, domain: name, author: '', date: '2026-04-26' },
    roles: [
      { id: 'R1', name: '货主', desc: '', group: '业务申请方' },
      { id: 'R2', name: '仓库经办', desc: '', group: '仓库作业方' },
    ],
    language: [],
    stages: DELIVERY_BUSINESS_STAGE_NAMES.map((stageName, index) => ({
      id: `S${index + 1}`,
      name: stageName,
      subDomain: '仓单注册',
      panoramaColumnId: stageAssignments[index]?.[0] || '',
      panoramaLaneId: stageAssignments[index]?.[1] || '',
      pos: { x: 0, y: 0 },
      processLinks: [],
    })),
    panorama: {
      columns: [
        { id: 'C1', name: '客户入口', scope: '会员/货主/仓库' },
        { id: 'C2', name: '规则参数', scope: '品种/商品/质检' },
        { id: 'C3', name: '仓单生命周期', scope: '注册/流转/注销' },
      ],
      lanes: [
        { id: 'L1', name: '示例业务域2', badge: '存量域', note: '当前承载仓库信息、仓单注册注销和结算部流转活动。' },
        { id: 'L2', name: '示例业务域1', badge: '目标域', note: '逐步承接监管协同、风险核验和职责边界沉淀。' },
      ],
      cells: [
        { columnId: 'C1', laneId: 'L1', status: '现状承载', text: '会员、仓库和客户入口由存量系统提供。' },
        { columnId: 'C2', laneId: 'L1', status: '现状承载', text: '品种参数和质检规则仍由存量系统维护。' },
        { columnId: 'C3', laneId: 'L1', status: '目标保留', text: '仓单注册后到注销前的流转和示例活动保留。' },
        { columnId: 'C1', laneId: 'L2', status: '二期沉淀', text: '主体档案、准入关系和仓库信息逐步沉淀到示例平台。' },
        { columnId: 'C2', laneId: 'L2', status: '二期协同', text: '形成监管口径下的规则参数视图。' },
        { columnId: 'C3', laneId: 'L2', status: '过程监管', text: '对注册、注销、风险预警等作业形成监管闭环。' },
      ],
    },
    stageLinks: DELIVERY_BUSINESS_STAGE_NAMES.slice(1).map((_, index) => ({
      fromStageId: `S${index + 1}`,
      toStageId: `S${index + 2}`,
    })),
    stageFlowRefs: [
      { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1, pos: { x: 0, y: 0 } },
    ],
    stageFlowLinks: [],
    processes: [
      {
        id: 'P1',
        name: '仓库仓单注册业务',
        subDomain: '仓单注册',
        flowGroup: '机构业务指引',
        trigger: '客户提交仓单注册申请',
        outcome: '生成可流转仓单',
        tasks: DELIVERY_PROCESS_TASK_NAMES.map((taskName, index) => ({
          id: `T${index + 1}`,
          name: taskName,
          role_id: index === 0 ? 'R1' : 'R2',
          steps: [{ name: `${taskName}办理`, type: 'Handle', note: '' }],
          entity_ops: [],
        })),
      },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

function buildDefaultPanoramaDoc(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '2026-04-26' },
    roles: [],
    language: [],
    stages: [
      { id: 'S1', name: '账号管理', subDomain: '示例业务域1', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S2', name: '品种参数管理', subDomain: '示例业务域1', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S3', name: '仓单注册', subDomain: '示例业务域1', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S4', name: '仓单流转', subDomain: '示例业务域1', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S5', name: '风险监管', subDomain: '示例业务域1', pos: { x: 0, y: 0 }, processLinks: [] },
    ],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

function buildSmartPlatformPanoramaDoc(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '2026-04-26' },
    roles: [],
    language: [],
    stages: [
      { id: 'S1', name: '登录接入', subDomain: '用户管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S2', name: '账号管理', subDomain: '用户管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S3', name: '角色与菜单鉴权', subDomain: '用户管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S4', name: '仓库主体维护', subDomain: '示例服务机构管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S5', name: '仓库资质维护', subDomain: '示例服务机构管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S6', name: '仓房维护', subDomain: '示例服务机构管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S7', name: '垛位维护', subDomain: '示例服务机构管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S8', name: '提货地点与点位', subDomain: '示例服务机构管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S9', name: '质检机构管理', subDomain: '示例服务机构管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S10', name: '品种参数管理', subDomain: '基础数据管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S11', name: '仓单注册', subDomain: '仓储仓单管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S12', name: '仓单流转', subDomain: '仓储仓单管理', pos: { x: 0, y: 0 }, processLinks: [] },
      { id: 'S13', name: '风险监管', subDomain: '风险监管', pos: { x: 0, y: 0 }, processLinks: [] },
    ],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('business guide view uses editable document value stream matrix and vertical process nodes', async ({ page, request }) => {
  const documentName = `process-business-guide-${Date.now()}`;
  await createDocument(request, documentName, buildBusinessGuideDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('stage-panorama-graph')).toBeVisible();
  await expect(page.getByTestId('value-stream-matrix')).toBeVisible();
  await expect(page.locator('.value-stream-axis')).toHaveText('业务域 / 价值流');
  await expect(page.locator('.stage-card-title').filter({ hasText: '业务价值流全景' })).toHaveCount(0);
  await expect(page.getByTestId('stage-panorama-graph').locator('.stage-graph-svg')).toHaveCount(0);
  await expect(page.getByTestId('value-stream-header')).toHaveCount(3);
  await expect(page.getByTestId('value-stream-row')).toHaveCount(2);
  await expect(page.locator('[data-column-id="C1"][data-testid="value-stream-header"]')).toContainText('客户入口');
  await expect(page.locator('[data-column-id="C3"][data-testid="value-stream-header"]')).toContainText('仓单生命周期');
  await expect(page.locator('[data-testid="value-stream-row"][data-lane-id="L1"]')).toContainText('示例业务域2');
  await expect(page.locator('[data-testid="value-stream-row"][data-lane-id="L1"]')).toContainText('存量域');
  await expect(page.locator('[data-testid="value-stream-row"][data-lane-id="L2"]')).toContainText('示例业务域1');
  await expect(page.locator('[data-cell-id="L2::C3"]')).toContainText('过程监管');
  await expect(page.locator('[data-cell-id="L2::C3"]')).toContainText('监管闭环');
  await expect(page.getByTestId('value-stream-more')).toHaveCount(0);

  const matrixMetrics = await page.getByTestId('value-stream-scroll').evaluate((node) => {
    const tab = document.getElementById('tab-content');
    const nodeBox = node.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    return {
      width: nodeBox.width,
      tabWidth: tabBox.width,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    };
  });
  expect(matrixMetrics.width).toBeLessThanOrEqual(matrixMetrics.tabWidth);
  expect(matrixMetrics.scrollWidth).toBeGreaterThanOrEqual(matrixMetrics.clientWidth);
  const stageCountsByCell = await page.locator('.value-stream-cell').evaluateAll((cells) => (
    cells.map((cell) => cell.querySelectorAll('[data-testid="stage-graph-node"]').length)
  ));
  expect(Math.max(...stageCountsByCell)).toBeLessThanOrEqual(5);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(DELIVERY_BUSINESS_STAGE_NAMES.length);

  await page.getByTestId('process-switch-card').click();

  await expect(page.getByTestId('business-process-flow')).toHaveCount(0);
  await expect(page.getByTestId('process-tasklevel-stack')).toBeVisible();
  await expect(page.locator('#proc-context-diagram .pf-wrap')).toBeVisible();
  await expect(page.locator('#proc-context-diagram .pf-task')).toHaveCount(5);
  await expect(page.locator('#proc-diagram .ptf-wrap')).toBeVisible();
  await expect(page.locator('#proc-diagram .ptf-node-frame')).toHaveCount(5);
  await expect(page.locator('#proc-diagram .ptf-node-frame[data-id="T1"]')).toContainText('入库预约');
  await expect(page.getByTestId('process-flow-zoom-in')).toBeVisible();
  await expect(page.getByTestId('process-diagram-resize-handle')).toHaveCount(0);

  const flowMetrics = await page.locator('.process-main-diag.taskflow-mode').evaluate((node) => {
    const diagram = document.getElementById('proc-diagram');
    const card = node.closest('.process-flow-card');
    const wrap = diagram.querySelector('.ptf-wrap');
    const diagramBox = diagram.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const wrapBox = wrap.getBoundingClientRect();
    const styles = window.getComputedStyle(diagram);
    return {
      height: node.getBoundingClientRect().height,
      cardHeight: cardBox.height,
      diagramWidth: diagramBox.width,
      wrapWidth: wrapBox.width,
      overflowX: styles.overflowX,
      overflowY: styles.overflowY,
    };
  });
  expect(flowMetrics.height).toBeGreaterThan(flowMetrics.cardHeight * 0.35);
  expect(flowMetrics.overflowX).toBe('scroll');
  expect(flowMetrics.overflowY).toBe('scroll');
  const wrapWidthBeforeZoom = flowMetrics.wrapWidth;
  await page.getByTestId('process-flow-zoom-in').click();
  await expect.poll(() => page.locator('#proc-diagram .ptf-wrap').evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(wrapWidthBeforeZoom);
});

test('default delivery panorama centers smart supervision platform with compact value streams', async ({ page, request }) => {
  const documentName = `process-default-panorama-${Date.now()}`;
  await createDocument(request, documentName, buildDefaultPanoramaDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('value-stream-header')).toHaveCount(4);
  await expect(page.locator('[data-testid="value-stream-header"][data-column-id="participants"]')).toContainText('会员客户');
  await expect(page.locator('[data-testid="value-stream-header"][data-column-id="businessHandling"]')).toContainText('业务办理');
  await expect(page.locator('[data-testid="value-stream-header"][data-column-id="riskSupervision"]')).toContainText('风险监管');
  await expect(page.locator('[data-testid="value-stream-row"]').first()).toContainText('示例业务域1');
  await expect(page.locator('[data-testid="value-stream-row"][data-lane-id="receipt-system"]')).toContainText('示例业务域2');
  await expect(page.locator('[data-cell-id="receipt-system::participants"]')).not.toContainText('现状承载');
  await expect(page.locator('[data-cell-id="receipt-system::businessHandling"]')).toContainText('仓单注册');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"] [data-node-id="S1"]')).toContainText('账号管理');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::parameters"] [data-node-id="S2"]')).toContainText('品种参数管理');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::businessHandling"] [data-node-id="S3"]')).toContainText('仓单注册');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::businessHandling"] [data-node-id="S4"]')).toContainText('仓单流转');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::riskSupervision"] [data-node-id="S5"]')).toContainText('风险监管');
  await expect(page.locator('[data-testid="stage-graph-node"]').filter({ hasText: '同步仓单数据' })).toHaveCount(0);
  await page.getByTestId('stage-editor-open').click();
  const scrollMetrics = await page.getByTestId('value-stream-scroll').evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThanOrEqual(scrollMetrics.clientWidth);
  const matrixWidthBeforeZoom = await page.getByTestId('value-stream-matrix').evaluate((node) => node.getBoundingClientRect().width);
  await page.getByTestId('stage-zoom-in').click();
  await expect.poll(() => page.getByTestId('value-stream-matrix').evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(matrixWidthBeforeZoom);
});

test('smart supervision platform panorama shows maintained fine-grained stages', async ({ page, request }) => {
  const documentName = `process-smart-platform-panorama-${Date.now()}`;
  await createDocument(request, documentName, buildSmartPlatformPanoramaDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  const participantStageCount = await page.locator('[data-cell-id="smart-platform-phase2::participants"] [data-testid="stage-graph-node"]').count();
  expect(participantStageCount).toBe(9);
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"] [data-testid="stage-graph-node"]')).toHaveCount(9);
  await expect(page.locator('[data-cell-id="smart-platform-phase2::parameters"] [data-testid="stage-graph-node"]')).toHaveCount(1);
  await expect(page.locator('[data-cell-id="smart-platform-phase2::businessHandling"] [data-testid="stage-graph-node"]')).toHaveCount(2);
  await expect(page.locator('[data-cell-id="smart-platform-phase2::riskSupervision"] [data-testid="stage-graph-node"]')).toHaveCount(1);
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"]')).toContainText('登录接入');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"]')).toContainText('角色与菜单鉴权');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"]')).toContainText('仓库主体维护');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"]')).toContainText('仓房维护');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"]')).toContainText('垛位维护');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"]')).toContainText('提货地点与点位');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"]')).toContainText('质检机构管理');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::participants"] [data-testid="stage-graph-node"]').filter({ hasText: '仓库管理' })).toHaveCount(0);
  await expect(page.locator('[data-cell-id="smart-platform-phase2::businessHandling"]')).toContainText('仓单注册');
  await expect(page.locator('[data-cell-id="smart-platform-phase2::businessHandling"]')).toContainText('仓单流转');
  await expect(page.locator('[data-cell-id="receipt-system::businessHandling"] [data-testid="stage-graph-node"]')).toHaveCount(0);
});

test('business user edits panorama directly in the matrix canvas', async ({ page, request }) => {
  const documentName = `process-business-panorama-edit-${Date.now()}`;
  await createDocument(request, documentName, buildBusinessGuideDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('stage-editor-open').click();

  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await expect(page.getByTestId('value-stream-matrix')).toHaveAttribute('data-editing', 'true');
  await expect(page.getByTestId('value-stream-scroll')).toBeVisible();
  await expect(page.getByTestId('stage-editor-hide')).toBeVisible();
  await expect(page.getByTestId('stage-zoom-in')).toBeVisible();
  const zoomResetWidth = await page.getByTestId('stage-zoom-reset').evaluate((node) => node.getBoundingClientRect().width);
  expect(zoomResetWidth).toBeLessThan(48);
  const matrixSizing = await page.getByTestId('value-stream-scroll').evaluate((node) => {
    const matrix = node.querySelector('[data-testid="value-stream-matrix"]');
    const cell = node.querySelector('.value-stream-cell.is-editing');
    return {
      matrixWidth: matrix.getBoundingClientRect().width,
      clientWidth: node.getBoundingClientRect().width,
      cellOverflowY: window.getComputedStyle(cell).overflowY,
    };
  });
  expect(matrixSizing.matrixWidth).toBeGreaterThanOrEqual(matrixSizing.clientWidth - 2);
  expect(matrixSizing.cellOverflowY).toBe('visible');
  await expect(page.getByTestId('matrix-column-name').first()).toBeVisible();
  await expect(page.getByTestId('matrix-cell-status').first()).toBeVisible();
  await expect(page.locator('[data-field-scope="column-badge"][data-column-id="C1"] [data-testid="matrix-field-caption"]')).toHaveText('价值链环节');
  await expect(page.locator('[data-field-scope="column-name"][data-column-id="C1"] [data-testid="matrix-field-caption"]')).toHaveText('环节定义/说明');
  await expect(page.locator('[data-field-scope="column-scope"][data-column-id="C1"] [data-testid="matrix-field-caption"]')).toHaveText('创造价值');
  await expect(page.locator('[data-field-scope="lane-name"][data-lane-id="L1"] [data-testid="matrix-field-caption"]')).toHaveText('正文');
  await expect(page.locator('[data-field-scope="cell-status"][data-cell-id="L1::C1"] [data-testid="matrix-field-caption"]')).toHaveText('标签');
  await page.getByTestId('process-view-help').hover();
  await expect(page.getByTestId('inline-help-tooltip')).toBeVisible();
  const helpBox = await page.getByTestId('inline-help-tooltip').boundingBox();
  const viewport = page.viewportSize();
  expect(helpBox.y).toBeGreaterThanOrEqual(0);
  expect(helpBox.y + helpBox.height).toBeLessThanOrEqual(viewport.height);

  const zoomBefore = await page.getByTestId('value-stream-matrix').evaluate((node) => node.style.zoom || window.getComputedStyle(node).zoom || '1');
  await page.getByTestId('stage-zoom-in').click();
  await expect.poll(() => page.getByTestId('value-stream-matrix').evaluate((node) => node.style.zoom || window.getComputedStyle(node).zoom || '1')).not.toBe(zoomBefore);
  await page.locator('[data-testid="matrix-column-name"][data-column-id="C2"]').click();
  const scrollBeforeEdit = await page.getByTestId('value-stream-scroll').evaluate((node) => {
    node.scrollLeft = 30;
    node.scrollTop = 20;
    return { left: node.scrollLeft, top: node.scrollTop };
  });
  await page.keyboard.press('Backspace');
  const scrollAfterEdit = await page.getByTestId('value-stream-scroll').evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
  expect(scrollAfterEdit.left).toBe(scrollBeforeEdit.left);
  expect(scrollAfterEdit.top).toBe(scrollBeforeEdit.top);

  await page.getByTestId('matrix-column-name').first().fill('客户服务');
  await expect(page.locator('[data-testid="matrix-column-name"][data-column-id="C1"]')).toHaveValue('客户服务');
  await page.locator('[data-testid="matrix-column-name"][data-column-id="C2"]').fill('');
  await page.getByTestId('stage-editor-hide').click();
  await page.getByTestId('stage-editor-open').click();
  await expect(page.locator('[data-testid="matrix-column-name"][data-column-id="C2"]')).toHaveValue('');

  await page.getByTestId('matrix-lane-name').first().fill('仓单存量系统');
  await expect(page.locator('[data-testid="matrix-lane-name"][data-lane-id="L1"]')).toHaveValue('仓单存量系统');

  await page.getByTestId('matrix-cell-status').first().fill('结算部主责');
  await page.getByTestId('matrix-cell-text').first().fill('用户自定义的单元格说明');
  await expect(page.locator('[data-testid="matrix-cell-status"][data-cell-id="L1::C1"]')).toHaveValue('结算部主责');
  await expect(page.locator('[data-testid="matrix-cell-text"][data-cell-id="L1::C1"]')).toHaveValue('用户自定义的单元格说明');

  await page.locator('[data-testid="matrix-column-add-after"][data-column-id="C1"]').click();
  await expect(page.getByTestId('value-stream-header')).toHaveCount(4);
  await expect(page.locator('[data-testid="matrix-column-name"][data-column-id="C4"]')).toHaveValue('');
  await page.locator('[data-testid="matrix-column-delete"][data-column-id="C4"]').click();
  await acceptAppDialog(page);
  await expect(page.getByTestId('value-stream-header')).toHaveCount(3);

  await page.locator('[data-testid="matrix-lane-add-after"][data-lane-id="L1"]').click();
  await expect(page.getByTestId('value-stream-row')).toHaveCount(3);
  await expect(page.locator('[data-testid="matrix-lane-name"][data-lane-id="L3"]')).toHaveValue('');
  await page.locator('[data-testid="matrix-lane-delete"][data-lane-id="L3"]').click();
  await acceptAppDialog(page);
  await expect(page.getByTestId('value-stream-row')).toHaveCount(2);

  await page.locator('[data-testid="matrix-stage-add"][data-cell-id="L1::C2"]').click();
  await submitAppPrompt(page, '新增监管阶段');
  await expect(page.locator('[data-cell-id="L1::C2"] [data-testid="stage-graph-node"]').filter({ hasText: '新增监管阶段' })).toBeVisible();

  await page.locator('[data-cell-id="L1::C1"] [data-node-id="S1"]').dragTo(page.locator('.value-stream-cell[data-cell-id="L2::C2"]'));
  await expect(page.locator('[data-cell-id="L2::C2"] [data-node-id="S1"]')).toContainText('会员客户管理');
  await expect(page.locator('[data-cell-id="L1::C1"] [data-node-id="S1"]')).toHaveCount(0);
  await expect(page.locator('[data-cell-id="L2::C2"] [data-node-id="S1"]')).toHaveAttribute('data-grid-row', /\d+/);
  await expect(page.locator('[data-cell-id="L2::C2"] [data-node-id="S1"]')).toHaveAttribute('data-grid-col', /\d+/);
  await page.getByTestId('value-stream-scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.scrollLeft = node.scrollWidth;
  });
  await expect(page.getByTestId('stage-editor-hide')).toBeVisible();

  await page.getByTestId('stage-editor-hide').click();
  await expect(page.locator('[data-column-id="C1"][data-testid="value-stream-header"]')).toContainText('客户服务');
  await expect(page.locator('[data-column-id="C1"][data-testid="value-stream-header"]')).not.toContainText('客户入口');
  await expect(page.locator('[data-testid="value-stream-row"][data-lane-id="L1"]')).toContainText('仓单存量系统');
  await expect(page.locator('.value-stream-cell[data-cell-id="L1::C1"]')).toContainText('结算部主责');
  await expect(page.locator('.value-stream-cell[data-cell-id="L1::C1"]')).toContainText('用户自定义的单元格说明');
});

test('process tab defaults to display-only hierarchy views', async ({ page }) => {
  const documentName = `process-home-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('stage-panorama-graph')).toBeVisible();
  await expect(page.getByTestId('process-switch-panorama')).toHaveText('全景视图');
  await expect(page.getByTestId('process-switch-panorama')).toHaveClass(/active/);
  await expect(page.getByTestId('process-switch-stage')).toHaveText('阶段视图');
  await expect(page.getByTestId('process-switch-card')).toHaveText('流程视图');
  await expect(page.getByTestId('process-switch-role')).toHaveText('角色视图');
  await expect(page.getByTestId('process-switch-overview')).toHaveCount(0);
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await expect(page.getByTestId('stage-add-button')).toHaveCount(0);
  await expect(page.getByTestId('stage-editor-open')).toBeVisible();
  await expect(page.getByTestId('process-view-help')).toBeVisible();
  await expect(page.getByTestId('process-delete-button')).toHaveCount(0);
  await expect(page.locator('[data-testid="value-stream-row"][data-lane-id="smart-platform-phase2"]')).toContainText('示例业务域1');
  await expect(page.locator('[data-testid="value-stream-row"][data-lane-id="receipt-system"]')).toContainText('示例业务域2');
  await expect(page.getByTestId('value-stream-header')).toHaveCount(4);

  await page.getByTestId('process-switch-stage').click();

  await expect(page.getByTestId('process-stage-view')).toBeVisible();
  await expect(page.getByTestId('process-switch-stage')).toHaveClass(/active/);
  await expect(page.getByTestId('stage-detail-graph')).toHaveCount(0);
  await expect(page.getByTestId('stage-panorama-graph')).toBeVisible();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);

  await page.getByTestId('stage-editor-open').click();

  await expect(page.getByTestId('value-stream-matrix')).toHaveAttribute('data-editing', 'true');
  await expect(page.getByTestId('matrix-stage-add').first()).toBeVisible();
  await expect(page.getByTestId('stage-flow-canvas-tools')).toHaveCount(0);
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await expect(page.getByTestId('stage-member-add-button')).toHaveCount(0);
  await expect(page.getByTestId('stage-process-link-row')).toHaveCount(0);

  await page.getByTestId('stage-editor-hide').click();
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);

  await page.getByTestId('process-switch-card').click();

  await expect(page.getByTestId('process-switch-card')).toHaveClass(/active/);
  await expect(page.getByTestId('process-flow-view')).toHaveCount(0);
  await expect(page.getByTestId('process-card-view')).toHaveCount(0);
  await expect(page.getByTestId('process-overview-view')).toHaveCount(0);
  await expect(page.locator('.proc-drawer.open')).toHaveCount(0);
  await expect(page.getByTestId('process-editor-open')).toHaveCount(0);
  await expect(page.locator('#tab-content')).toContainText('暂无流程');
  await expect(page.getByTestId('process-diagram-resize-handle')).toHaveCount(0);
  await expect(page.locator('#proc-diagram')).toHaveCount(0);
});

test('stage and process switches keep the last selected business context', async ({ page, request }) => {
  const documentName = `process-view-memory-${Date.now()}`;
  await createDocument(request, documentName, buildProcessWorkbenchDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('sidebar-browse-stage').click();
  await expandValueStreams(page);
  await page.locator('.sb-stage-head[data-stage-id="S2"]').click();

  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]')).toContainText('资料审核');

  await page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]').click();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();

  await page.getByTestId('process-switch-stage').click();
  await expect(page.getByTestId('stage-detail-graph')).toBeVisible();
  await expect(page.locator('[data-testid="stage-graph-node"][data-process-id="P2"]')).toContainText('资料审核');
  await expect(page.locator('[data-testid="stage-graph-node"][data-process-id="P1"]')).toHaveCount(0);

  await page.getByTestId('process-switch-card').click();
  await expect(page.getByTestId('process-flow-select')).toHaveValue('P2');
  await expect(page.getByTestId('process-tasklevel-stack')).toBeVisible();
  await expect(page.locator('#proc-context-diagram .pf-wrap')).toBeVisible();
  await expect(page.locator('#proc-diagram .ptf-wrap')).toBeVisible();
});

test('stage panorama matrix edit mode keeps stage actions in the canvas', async ({ page, request }) => {
  const documentName = `process-stage-panorama-editor-${Date.now()}`;
  await createDocument(request, documentName, buildStagePanoramaDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('stage-editor-open').click();

  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await expect(page.getByTestId('value-stream-matrix')).toHaveAttribute('data-editing', 'true');
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(3);
  await expect(page.getByTestId('matrix-stage-add').first()).toBeVisible();
  await expect(page.getByTestId('matrix-stage-delete').first()).toBeVisible();

  const stageB = page.locator('[data-testid="stage-graph-node"][data-node-id="S2"]');
  await stageB.dblclick();
  await expect(page.getByTestId('stage-name-inline-input')).toHaveValue('Stage B');
  await page.getByTestId('stage-name-inline-input').fill('Stage B 已改名');
  await page.keyboard.press('Enter');
  await expect(stageB).toContainText('Stage B 已改名');
  await expect.poll(() => page.evaluate(() => S.doc.stages.find((stage) => stage.id === 'S2')?.name)).toBe('Stage B 已改名');

  await page.getByTestId('matrix-stage-add').first().click();
  await submitAppPrompt(page, 'Stage D');
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(4);
  await expect(page.getByTestId('stage-graph-node').filter({ hasText: 'Stage D' })).toBeVisible();
  await page.getByTestId('stage-graph-node').filter({ hasText: 'Stage D' }).getByTestId('matrix-stage-delete').click();
  await acceptAppDialog(page);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(3);
  await expect(page.getByTestId('stage-panorama-graph')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toHaveCount(0);

  await page.locator('[data-testid="stage-graph-node"][data-node-id="S2"]').click();
  await expect(page.getByTestId('stage-panorama-graph')).toBeVisible();
  await expect(page.getByTestId('stage-detail-graph')).toHaveCount(0);
  await expect(page.locator('.stage-graph-node.is-selected[data-node-id="S2"]')).toBeVisible();
});

test('stage panorama hides the virtual unassigned bucket from read and edit modes', async ({ page, request }) => {
  const documentName = `process-stage-panorama-unassigned-${Date.now()}`;
  await createDocument(request, documentName, buildPanoramaWithUnassignedProcessDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  const matrix = page.getByTestId('value-stream-matrix');
  await expect(matrix).toHaveAttribute('data-editing', 'false');
  await expect(matrix).not.toContainText('未设置业务阶段');
  await expect(page.locator('[data-testid="stage-graph-node"][data-node-id="__unassigned__"]')).toHaveCount(0);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(1);

  await page.getByTestId('stage-editor-open').click();

  await expect(matrix).toHaveAttribute('data-editing', 'true');
  await expect(matrix).not.toContainText('未设置业务阶段');
  await expect(page.locator('[data-testid="stage-graph-node"][data-node-id="__unassigned__"]')).toHaveCount(0);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(1);

  await page.getByTestId('matrix-stage-delete').click();
  await acceptAppDialog(page);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(0);
  await expect(matrix).not.toContainText('未设置业务阶段');
});

test('stage panorama matrix shows all stages when the stage list is long', async ({ page, request }) => {
  const documentName = `process-stage-panorama-long-${Date.now()}`;
  await createDocument(request, documentName, buildLongStagePanoramaDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('stage-editor-open').click();

  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);
  await expect(page.getByTestId('value-stream-more')).toHaveCount(0);
  await expect(page.getByTestId('stage-graph-node')).toHaveCount(14);

  await page.locator('[data-testid="stage-graph-node"][data-node-id="S2"]').click();
  await expect(page.locator('.stage-graph-node.is-selected[data-node-id="S2"]')).toBeVisible();
});

test('process workbench guides the four views from hierarchy drilldown to role projection', async ({ page, request }) => {
  const documentName = `process-workbench-${Date.now()}`;
  await createDocument(request, documentName, buildProcessWorkbenchDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();

  await expect(page.getByTestId('process-view-context')).toHaveCount(0);
  await expect(page.getByTestId('process-switch-panorama')).toHaveClass(/active/);

  await page.locator('[data-testid="stage-graph-node"][data-node-id="S1"]').click();

  await expect(page.getByTestId('process-switch-stage')).toHaveClass(/active/);
  await expect(page.locator('.stage-card-title')).toContainText('预约阶段');
  await expect(page.locator('[data-testid="stage-graph-node"][data-node-id="SFR2"]')).toContainText('资料审核');
  await expect(page.locator('[data-testid="stage-graph-node"] .stage-flow-node-meta')).toHaveCount(0);
  await expect(page.getByTestId('stage-drawer')).toHaveCount(0);

  await page.locator('[data-testid="stage-graph-node"][data-node-id="SFR2"]').click();

  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.getByTestId('process-switch-card')).toHaveClass(/active/);
  await expect(page.locator('.process-flow-kicker')).toHaveCount(0);
  await expect(page.getByTestId('process-flow-summary')).toHaveCount(0);
  await expect(page.getByTestId('process-flow-select')).toHaveValue('P2');
  await expect(page.locator('.proc-drawer.open')).toBeVisible();
  await expect(page.getByTestId('proc-stage-ref-chip')).toHaveCount(2);

  await page.getByTestId('process-switch-role').click();

  await expect(page.getByTestId('process-role-view')).toBeVisible();
  await expect(page.getByTestId('process-switch-role')).toHaveClass(/active/);
  await expect(page.getByTestId('role-projection-summary')).toContainText('仓库管理员');
  await expect(page.getByTestId('role-projection-summary')).toContainText('涉及流程 1');

  await page.locator('.role-usecase-process[data-process-id="P2"]').click();

  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();
  await expect(page.locator('#proc-name-input')).toHaveValue('资料审核');
});
