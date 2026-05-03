const { test, expect } = require('@playwright/test');

const { createDocument, createNewDocument, openDocument } = require('./support/app-helpers');

function buildSidebarDoc(documentName, longProcessName) {
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
        name: longProcessName,
        subDomain: '仓储仓单管理',
        trigger: '',
        outcome: '',
        tasks: [
      {
        id: 'T1',
        name: '提交预约',
        role: '',
        steps: [
          { name: '填写预约单信息', type: 'manual', note: '' },
          { name: '校验品种与仓容权限', type: 'check', note: '' },
        ],
        orchestrationTasks: [
          {
            name: '校验预约字段',
            taskDefinitionId: 'TD1',
            constructId: 'BC1',
            businessConstructId: 'BC1',
            type: 'Check',
            querySourceKind: '',
            target: '预约服务',
            note: '校验必填项和品种权限',
          },
        ],
        forms: [
          {
            id: 'F1',
            name: '入库预约申请表',
            entity_id: 'E1',
            purpose: '申请填写',
            sections: [
              {
                id: 'SEC1',
                name: '货物信息',
                note: '品种、数量和仓库信息',
                fields: [
                  { id: 'FLD1', name: '仓单编号', type: 'Text', required: true, entity_field: '仓单编号', note: '' },
                ],
              },
            ],
          },
        ],
      },
        ],
      },
      {
        id: 'P2',
        name: '盘库管理',
        subDomain: '示例服务机构管理',
        trigger: '',
        outcome: '',
        tasks: [],
      },
    ],
    entities: [
      {
        id: 'E1',
        name: '仓储仓单',
        businessConstructId: 'BC1',
        businessConstructIds: ['BC1'],
        fields: [
          { name: '仓单编号', type: 'string', note: '' },
          { name: '库存数量', type: 'number', note: '' },
        ],
      },
      {
        id: 'E2',
        name: '监管事项',
        businessConstructId: 'BC2',
        businessConstructIds: ['BC2'],
        fields: [
          { name: '事项名称', type: 'string', note: '' },
        ],
      },
      {
        id: 'E3',
        name: '盘库抽检记录',
        businessConstructId: 'BC2',
        businessConstructIds: ['BC2'],
        fields: [
          { name: '抽检批次', type: 'string', note: '' },
        ],
      },
    ],
    capabilityUnits: [
      { id: 'CU1', name: '仓储仓单管理', kind: 'core', constructIds: ['BC1'], entityIds: [], taskDefinitionIds: ['TD1'] },
      { id: 'CU2', name: '示例服务机构管理', kind: 'generic', constructIds: ['BC2'], entityIds: [], taskDefinitionIds: [] },
    ],
    businessConstructs: [
      { id: 'BC1', name: '仓单办理构件', capabilityUnitId: 'CU1', capabilityUnit: '仓储仓单管理', entityIds: ['E1'], taskDefinitionIds: ['TD1'] },
      { id: 'BC2', name: '服务机构构件', capabilityUnitId: 'CU2', capabilityUnit: '示例服务机构管理', entityIds: ['E2', 'E3'], taskDefinitionIds: [] },
    ],
    taskDefinitions: [
      { id: 'TD1', name: '提交预约', type: 'Service', target: '预约服务', note: '', capabilityUnitId: 'CU1', capabilityUnit: '仓储仓单管理', constructId: 'BC1', constructName: '仓单办理构件' },
    ],
    relations: [],
    rules: [],
  };
}

async function switchToBusinessComponentBrowse(page) {
  await page.getByTestId('sidebar-browse-domain').click();
  await expect(page.getByTestId('sidebar-domain-browse')).toBeVisible();
}

function attachSidebarStage(doc, processId = 'P1', stageName = '预约受理') {
  doc.valueStreams = [{ id: 'VS1', name: '入库价值流' }];
  doc.stages = [{ id: 'S1', name: stageName, valueStreamId: 'VS1', processLinks: [] }];
  doc.stageFlowRefs = [{ id: 'SFR1', stageId: 'S1', processId, order: 1 }];
  const proc = (doc.processes || []).find((item) => item.id === processId);
  if (proc) proc.stageId = 'S1';
}

test('左侧目录在业务组件视角折叠到组件层级，实体作为组件资产展示', async ({ page, request }) => {
  const documentName = `sidebar-collapse-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await switchToBusinessComponentBrowse(page);

  await expect(page.locator('[data-subdomain="仓储仓单管理"]')).toBeVisible();
  await expect(page.locator('[data-section="entity"]')).toHaveCount(0);
  await expect(page.locator('[data-group="仓储仓单管理主题域"]')).toHaveCount(0);
  await expect(page.locator('[data-process-id="P1"]')).toHaveCount(0);
  await expect(page.locator('[data-entity-id="E1"]')).toHaveCount(0);

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await page.locator('.sb-construct-head', { hasText: '仓单办理构件' }).click();
  await expect(page.locator('[data-process-id="P1"]')).toBeVisible();
  await expect(page.locator('[data-asset-entity-id="E1"]')).toBeVisible();
  await expect(page.locator('.sb-task-item', { hasText: '提交预约' })).toHaveCount(0);
});

test('打开文档后目录区保持展开，价值流默认折叠', async ({ page, request }) => {
  const documentName = `sidebar-value-stream-default-collapsed-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');
  doc.valueStreams = [{ id: 'VS1', name: '入库办理' }];
  doc.stages = [{ id: 'S1', name: '预约受理', valueStreamId: 'VS1', processLinks: [] }];
  doc.stageFlowRefs = [{ id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1 }];
  doc.processes[0].stageId = 'S1';
  doc.processes[0].primaryStageId = 'S1';

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);

  await expect(page.locator('#sidebar')).not.toHaveClass(/sb-collapsed/);
  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await expect(page.getByTestId('sidebar-browse-stage')).toHaveClass(/active/);

  const valueStream = page.locator('.sb-value-head', { hasText: '入库办理' });
  await expect(valueStream).toBeVisible();
  await expect(page.locator('.sb-stage-head', { hasText: '预约受理' })).toHaveCount(0);

  await valueStream.click();
  await expect(page.locator('.sb-stage-head', { hasText: '预约受理' })).toBeVisible();
});

test('新建文档的业务流程目录纳入默认业务域和价值流', async ({ page }) => {
  const documentName = `sidebar-new-doc-no-virtual-stage-${Date.now()}`;

  await createNewDocument(page, documentName);

  await expect(page.getByTestId('sidebar-stage-browse')).toBeVisible();
  await expect(page.getByTestId('sidebar-browse-stage')).toHaveClass(/active/);
  await expect(page.getByTestId('sidebar-business-domain-filter')).toContainText('示例业务域1');
  await expect(page.getByTestId('sidebar-business-domain-filter')).toContainText('示例业务域2');
  await expect(page.locator('.sb-value-head')).toHaveCount(4);
  await expect(page.locator('.sb-value-head', { hasText: '会员客户' })).toBeVisible();
  await expect(page.locator('.sb-value-head', { hasText: '品种参数' })).toBeVisible();
  await expect(page.locator('.sb-value-head', { hasText: '业务办理' })).toBeVisible();
  await expect(page.locator('.sb-value-head', { hasText: '风险监管' })).toBeVisible();
  await expect(page.getByTestId('sidebar-stage-browse')).not.toContainText('未归类价值流');
  await expect(page.getByTestId('sidebar-stage-browse')).not.toContainText('未设置业务阶段');
  await expect(page.getByTestId('sidebar-stage-browse')).not.toContainText('主流程');
});

test('左侧目录会显示带标签的顶层统计摘要', async ({ page, request }) => {
  const documentName = `sidebar-count-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');
  doc.valueStreams = [
    { id: 'VS1', name: '入库价值流' },
    { id: 'VS2', name: '盘库价值流' },
  ];
  doc.stages = [
    { id: 'S1', name: '预约受理', valueStreamId: 'VS1', processLinks: [] },
    { id: 'S2', name: '盘库受理', valueStreamId: 'VS2', processLinks: [] },
  ];
  doc.stageFlowRefs = [
    { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1 },
    { id: 'SFR2', stageId: 'S2', processId: 'P2', order: 1 },
  ];
  doc.processes[0].stageId = 'S1';
  doc.processes[1].stageId = 'S2';

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await switchToBusinessComponentBrowse(page);

  await expect(page.locator('[data-section="process"]')).toContainText(/流程\s*2/);
  await expect(page.locator('[data-section="process"]')).toContainText(/节点\s*1/);
  await expect(page.locator('[data-section="process"]')).toContainText(/任务\s*1/);
  await expect(page.locator('[data-section="process"]')).toContainText('业务统计');
  await expect(page.locator('.sb-metric')).toHaveCount(10);
  await expect(page.locator('.sb-metric-flow')).toHaveCount(4);
  await expect(page.locator('.sb-metric-interaction')).toHaveCount(2);
  await expect(page.locator('.sb-metric-model')).toHaveCount(4);
  const sidebarOrder = await page.evaluate(() => {
    const filter = document.querySelector('.sb-domain-filter-panel');
    const stats = document.querySelector('[data-section="process"]');
    return {
      filterTop: filter?.getBoundingClientRect().top || 0,
      statsTop: stats?.getBoundingClientRect().top || 0,
    };
  });
  expect(sidebarOrder.filterTop).toBeLessThan(sidebarOrder.statsTop);
  await expect(page.locator('[data-section="entity"]')).toHaveCount(0);
  await expect(page.locator('[data-subdomain="仓储仓单管理"] .sb-count')).toHaveText('1');

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await page.locator('.sb-construct-head', { hasText: '仓单办理构件' }).click();
  await expect(page.locator('[data-process-id="P1"] .sb-count')).toHaveText('1');
  await expect(page.locator('[data-asset-entity-id="E1"]')).toContainText('仓储仓单');
});

test('业务统计随业务域切换同步变化', async ({ page, request }) => {
  const documentName = `sidebar-domain-stats-${Date.now()}`;
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04' },
    roles: [],
    language: [],
    businessDomains: [
      { id: 'BD1', name: '业务域一' },
      { id: 'BD2', name: '业务域二' },
    ],
    panorama: {
      lanes: [
        { id: 'BD1', name: '业务域一' },
        { id: 'BD2', name: '业务域二' },
      ],
      columns: [
        { id: 'VS1', name: '价值流一' },
        { id: 'VS2', name: '价值流二' },
      ],
      cells: [],
    },
    valueStreams: [
      { id: 'VS1', name: '价值流一' },
      { id: 'VS2', name: '价值流二' },
    ],
    stages: [
      { id: 'S1', name: '阶段一', valueStreamId: 'VS1', businessDomainId: 'BD1', processLinks: [] },
      { id: 'S2', name: '阶段二', valueStreamId: 'VS2', businessDomainId: 'BD2', processLinks: [] },
    ],
    stageFlowRefs: [
      { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1 },
      { id: 'SFR2', stageId: 'S2', processId: 'P2', order: 1 },
    ],
    stageLinks: [],
    processes: [
      {
        id: 'P1',
        name: '流程一',
        stageId: 'S1',
        businessDomainId: 'BD1',
        nodes: [{
          id: 'N1',
          name: '节点一',
          userSteps: [{ name: '步骤一', type: 'manual' }],
          forms: [{ id: 'F1', name: '表单一', sections: [] }],
          orchestrationTasks: [{ id: 'OT1', taskDefinitionId: 'TD1', name: '任务一', type: 'Service' }],
        }],
      },
      {
        id: 'P2',
        name: '流程二',
        stageId: 'S2',
        businessDomainId: 'BD2',
        nodes: [{
          id: 'N2',
          name: '节点二',
          userSteps: [],
          forms: [],
          orchestrationTasks: [{ id: 'OT2', taskDefinitionId: 'TD2', name: '任务二', type: 'Service' }],
        }],
      },
      {
        id: 'P0',
        name: '主流程',
        businessDomainId: 'BD1',
        nodes: [{
          id: 'N0',
          name: '历史残留节点',
          userSteps: [{ name: '历史残留步骤', type: 'manual' }],
          forms: [{ id: 'F0', name: '历史残留表单', sections: [] }],
          orchestrationTasks: [],
        }],
      },
    ],
    capabilityUnits: [
      { id: 'CU1', name: '组件一', kind: 'core', businessDomainId: 'BD1', constructIds: ['BC1'], entityIds: ['E1'], taskDefinitionIds: ['TD1'] },
      { id: 'CU2', name: '组件二', kind: 'generic', businessDomainId: 'BD2', constructIds: ['BC2'], entityIds: ['E2'], taskDefinitionIds: ['TD2'] },
    ],
    businessConstructs: [
      { id: 'BC1', name: '构件一', businessDomainId: 'BD1', capabilityUnitId: 'CU1', capabilityUnit: '组件一', entityIds: ['E1'], taskDefinitionIds: ['TD1'] },
      { id: 'BC2', name: '构件二', businessDomainId: 'BD2', capabilityUnitId: 'CU2', capabilityUnit: '组件二', entityIds: ['E2'], taskDefinitionIds: ['TD2'] },
    ],
    taskDefinitions: [
      { id: 'TD1', name: '任务一', businessDomainId: 'BD1', capabilityUnitId: 'CU1', capabilityUnit: '组件一', constructId: 'BC1', constructName: '构件一' },
      { id: 'TD2', name: '任务二', businessDomainId: 'BD2', capabilityUnitId: 'CU2', capabilityUnit: '组件二', constructId: 'BC2', constructName: '构件二' },
    ],
    entities: [
      { id: 'E1', name: '实体一', businessDomainId: 'BD1', businessConstructId: 'BC1', fields: [] },
      { id: 'E2', name: '实体二', businessDomainId: 'BD2', businessConstructId: 'BC2', fields: [] },
    ],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await expect(page.locator('[data-section="process"]')).toContainText(/流程\s*2/);
  await expect(page.locator('[data-section="process"]')).toContainText(/节点\s*2/);
  await expect(page.locator('[data-section="process"]')).toContainText(/组件\s*2/);

  await page.getByTestId('sidebar-business-domain-filter').selectOption('BD1');

  const stats = page.locator('[data-section="process"]');
  await expect(stats).toContainText(/价值流\s*1/);
  await expect(stats).toContainText(/阶段\s*1/);
  await expect(stats).toContainText(/流程\s*1/);
  await expect(stats).toContainText(/节点\s*1/);
  await expect(stats).toContainText(/步骤\s*1/);
  await expect(stats).toContainText(/表单\s*1/);
  await expect(stats).toContainText(/任务\s*1/);
  await expect(stats).toContainText(/实体\s*1/);
  await expect(stats).toContainText(/构件\s*1/);
  await expect(stats).toContainText(/组件\s*1/);
  await page.locator('.sb-value-head', { hasText: '价值流一' }).click();
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();
  await expect(page.getByTestId('sidebar-stage-browse')).toContainText('流程一');
  await expect(page.getByTestId('sidebar-stage-browse')).not.toContainText('流程二');
  await expect(page.getByTestId('sidebar-domain-browse')).toContainText('组件一');
  await expect(page.getByTestId('sidebar-domain-browse')).not.toContainText('组件二');
});

test('流程目录显示未归阶段流程但统计只计算真实阶段流程', async ({ page, request }) => {
  const documentName = `sidebar-unassigned-process-${Date.now()}`;
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04' },
    roles: [],
    language: [],
    valueStreams: [{ id: 'VS1', name: '入库价值流' }],
    stages: [{ id: 'S1', name: '预约受理', valueStreamId: 'VS1', processLinks: [] }],
    stageFlowRefs: [{ id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1 }],
    stageLinks: [],
    processes: [
      {
        id: 'P1',
        name: '阶段内流程',
        stageId: 'S1',
        nodes: [{ id: 'N1', name: '阶段内节点', userSteps: [], forms: [], orchestrationTasks: [] }],
      },
      {
        id: 'P2',
        name: '待归阶段流程',
        nodes: [{ id: 'N2', name: '待归阶段节点', userSteps: [], forms: [], orchestrationTasks: [] }],
      },
    ],
    capabilityUnits: [],
    businessConstructs: [],
    taskDefinitions: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);

  const stats = page.locator('[data-section="process"]');
  await expect(stats).toContainText(/流程\s*1/);
  await expect(stats).toContainText(/节点\s*1/);
  await expect(page.getByTestId('sidebar-stage-browse')).toContainText('未设置业务阶段');
  await page.locator('.sb-stage-head[data-stage-id="__unassigned__"]').click();
  await expect(page.getByTestId('sidebar-stage-browse')).toContainText('待归阶段流程');
});

test('流程目录展示依赖的多个业务组件且组件目录关联流程只显示阶段', async ({ page, request }) => {
  const documentName = `sidebar-process-capabilities-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');
  attachSidebarStage(doc);
  doc.processes[0].flowGroup = '基础展示屏';
  doc.processes[0].tasks[0].orchestrationTasks.push({
    name: '同步服务机构监管事项',
    taskDefinitionId: 'TD2',
    constructId: 'BC2',
    businessConstructId: 'BC2',
    type: 'Service',
    querySourceKind: '',
    target: '服务机构监管服务',
    note: '',
  });
  doc.taskDefinitions.push({
    id: 'TD2',
    name: '同步服务机构监管事项',
    type: 'Service',
    target: '',
    note: '',
    capabilityUnitId: 'CU2',
    capabilityUnit: '示例服务机构管理',
    constructId: 'BC2',
    constructName: '服务机构构件',
  });
  doc.capabilityUnits[1].taskDefinitionIds = ['TD2'];
  doc.businessConstructs[1].taskDefinitionIds = ['TD2'];

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await page.locator('.sb-value-head', { hasText: '入库价值流' }).click();
  await page.locator('.sb-stage-head[data-stage-id="S1"]').click();

  const flowDirectoryProcessHead = page.getByTestId('sidebar-stage-browse').locator('[data-process-id="P1"]');
  await expect(flowDirectoryProcessHead).toContainText('组件：仓储仓单管理、示例服务机构管理');
  await expect(flowDirectoryProcessHead).not.toContainText('分组：基础展示屏');

  await switchToBusinessComponentBrowse(page);

  const capabilityHead = page.locator('[data-subdomain="仓储仓单管理"]').first();
  await capabilityHead.click();
  await page.locator('.sb-construct-head', { hasText: '仓单办理构件' }).click();

  const processHead = page.getByTestId('sidebar-domain-browse').locator('[data-process-id="P1"]');
  await expect(processHead).toContainText('阶段：预约受理');
  await expect(processHead).not.toContainText('组件：');
  await expect(processHead).not.toContainText('分组：基础展示屏');

  const metrics = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="sidebar-domain-browse"]');
    const capabilityName = root?.querySelector('[data-subdomain="仓储仓单管理"] .sb-name');
    const processName = root?.querySelector('[data-process-id="P1"] .sb-name');
    const tag = root?.querySelector('[data-process-id="P1"] .sb-proc-tag');
    const capabilitySize = parseFloat(window.getComputedStyle(capabilityName).fontSize || '0');
    const processSize = parseFloat(window.getComputedStyle(processName).fontSize || '0');
    const tagSize = parseFloat(window.getComputedStyle(tag).fontSize || '0');
    return {
      capabilitySize,
      processSize,
      tagSize,
      tagRadius: window.getComputedStyle(tag).borderRadius,
    };
  });

  expect(metrics.processSize).toBeLessThan(metrics.capabilitySize);
  expect(metrics.tagSize).toBeLessThanOrEqual(metrics.processSize);
  expect(metrics.tagRadius).not.toBe('0px');
});

test('目录组件层三角与标题等大等色且切换状态不改变大小，流程层不再展开步骤', async ({ page, request }) => {
  const documentName = `sidebar-hierarchy-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');
  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await switchToBusinessComponentBrowse(page);

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await page.locator('.sb-construct-head', { hasText: '仓单办理构件' }).click();

  const expandedMetrics = await page.evaluate(() => {
    function readLevel(head) {
      const name = head?.querySelector('.sb-name');
      const caret = head?.querySelector('.sb-caret');
      return {
        nameFontSize: parseFloat(window.getComputedStyle(name).fontSize || '0'),
        caretFontSize: parseFloat(window.getComputedStyle(caret).fontSize || '0'),
        nameColor: window.getComputedStyle(name).color,
        caretColor: window.getComputedStyle(caret).color,
      };
    }

    const capabilityHead = document.querySelector('[data-subdomain="仓储仓单管理"]');
    const processHead = document.querySelector('[data-process-id="P1"]');
    const processTaskItem = document.querySelector('.sb-task-item');
    return {
      capability: readLevel(capabilityHead),
      processNameFontSize: parseFloat(window.getComputedStyle(processHead?.querySelector('.sb-name')).fontSize || '0'),
      processPaddingLeft: parseFloat(window.getComputedStyle(processHead).paddingLeft || '0'),
      processCaretCount: processHead?.querySelectorAll('.sb-caret').length || 0,
      processTaskItemCount: processTaskItem ? 1 : 0,
      capabilityPaddingLeft: parseFloat(window.getComputedStyle(capabilityHead).paddingLeft || '0'),
    };
  });

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  const subdomainCollapsedCaretSize = await page.evaluate(() => {
    const caret = document.querySelector('[data-subdomain="仓储仓单管理"] .sb-caret');
    return parseFloat(window.getComputedStyle(caret).fontSize || '0');
  });

  await page.locator('[data-subdomain="仓储仓单管理"]').click();

  expect(expandedMetrics.processPaddingLeft).toBeGreaterThan(expandedMetrics.capabilityPaddingLeft);
  expect(expandedMetrics.capability.nameFontSize).toBeGreaterThan(expandedMetrics.processNameFontSize);
  expect(expandedMetrics.capability.caretFontSize).toBe(expandedMetrics.capability.nameFontSize);
  expect(expandedMetrics.capability.caretColor).toBe(expandedMetrics.capability.nameColor);
  expect(expandedMetrics.processCaretCount).toBe(0);
  expect(expandedMetrics.processTaskItemCount).toBe(0);
  expect(subdomainCollapsedCaretSize).toBe(expandedMetrics.capability.caretFontSize);
});

test('业务组件显示轻量标签且标签字体弱于名称', async ({ page, request }) => {
  const documentName = `sidebar-badge-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await switchToBusinessComponentBrowse(page);
  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await page.locator('.sb-construct-head', { hasText: '仓单办理构件' }).click();

  const metrics = await page.evaluate(() => {
    const subdomainHead = document.querySelector('[data-subdomain="仓储仓单管理"]');
    const subdomainBadge = subdomainHead?.querySelector('.sb-grp-badge');
    const subdomainName = subdomainHead?.querySelector('.sb-name');
    const processName = document.querySelector('[data-process-id="P1"] .sb-name');
    return {
      capabilityBadgeText: subdomainBadge?.textContent?.trim() || '',
      badgeFontSize: parseFloat(window.getComputedStyle(subdomainBadge).fontSize || '0'),
      nameFontSize: parseFloat(window.getComputedStyle(subdomainName).fontSize || '0'),
      processNameFontSize: parseFloat(window.getComputedStyle(processName).fontSize || '0'),
      badgeRadius: window.getComputedStyle(subdomainBadge).borderRadius,
    };
  });

  expect(metrics.capabilityBadgeText).toBe('业务组件');
  expect(metrics.badgeFontSize).toBeLessThan(metrics.nameFontSize);
  expect(metrics.nameFontSize).toBeGreaterThan(metrics.processNameFontSize);
  expect(metrics.badgeRadius).not.toBe('0px');
});

test('左侧目录不再渲染独立实体目录区', async ({ page, request }) => {
  const documentName = `sidebar-entity-caret-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await switchToBusinessComponentBrowse(page);

  await expect(page.locator('[data-section="entity"]')).toHaveCount(0);
  await expect(page.locator('[data-group]')).toHaveCount(0);
  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await page.locator('.sb-construct-head', { hasText: '仓单办理构件' }).click();
  await expect(page.locator('[data-asset-entity-id="E1"]')).toBeVisible();
});

test('左侧目录悬停显示移动按钮时不应把目录项挤成两行', async ({ page, request }) => {
  const documentName = `sidebar-hover-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程名称很长用于验证悬停后不要换行');

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await switchToBusinessComponentBrowse(page);

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await page.locator('.sb-construct-head', { hasText: '仓单办理构件' }).click();
  const processRow = page.locator('[data-process-id="P1"]');
  const processName = processRow.locator('.sb-name');

  const beforeBox = await processRow.boundingBox();
  await processRow.hover();
  const afterBox = await processRow.boundingBox();
  const nameMetrics = await processName.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    paddingRight: parseFloat(window.getComputedStyle(node.parentElement).paddingRight || '0'),
  }));

  expect(beforeBox).not.toBeNull();
  expect(afterBox).not.toBeNull();
  expect(Math.abs(afterBox.height - beforeBox.height)).toBeLessThanOrEqual(1);
  expect(nameMetrics.scrollHeight - nameMetrics.clientHeight).toBeLessThanOrEqual(1);
  expect(nameMetrics.paddingRight).toBeLessThanOrEqual(16);
});

test('业务组件目录只展示实体、任务和使用任务的关联流程', async ({ page, request }) => {
  const documentName = `sidebar-asset-click-${Date.now()}`;
  const doc = buildSidebarDoc(documentName, '仓储入库预约与仓单联动流程');
  attachSidebarStage(doc);
  doc.processes.push({
    id: 'P3',
    name: '同组件但未使用任务的流程',
    subDomain: '',
    trigger: '',
    outcome: '',
    tasks: [],
  });
  doc.processes[0].tasks[0].orchestrationTasks = Array.from({ length: 10 }, (_, index) => ({
    name: `校验预约字段${index + 1}`,
    taskDefinitionId: index === 0 ? 'TD1' : '',
    constructId: index === 0 ? 'BC1' : '',
    businessConstructId: index === 0 ? 'BC1' : '',
    type: 'Check',
    querySourceKind: '',
    target: '预约服务',
    note: '校验必填项和品种权限',
  }));

  await createDocument(request, documentName, doc);
  await page.goto('/');
  await openDocument(page, documentName);
  await switchToBusinessComponentBrowse(page);

  await page.locator('[data-subdomain="仓储仓单管理"]').click();
  await page.locator('.sb-construct-head', { hasText: '仓单办理构件' }).click();

  const componentBrowse = page.getByTestId('sidebar-domain-browse');
  await expect(componentBrowse).toContainText('实体');
  await expect(componentBrowse).toContainText('任务');
  await expect(componentBrowse).toContainText('关联流程');
  await expect(componentBrowse).not.toContainText('表单片段');
  await expect(componentBrowse).not.toContainText('规则');
  await expect(componentBrowse.locator('.sb-asset-more')).toHaveCount(0);
  await expect(page.getByTestId('construct-task-asset')).toHaveCount(1);
  await expect(page.getByTestId('construct-task-asset').filter({ hasText: '提交预约' })).toBeVisible();
  await expect(componentBrowse).toContainText('仓储入库预约与仓单联动流程');
  await expect(componentBrowse.locator('[data-process-id="P1"]')).toContainText('阶段：预约受理');
  await expect(componentBrowse.locator('[data-process-id="P1"]')).not.toContainText('组件：');
  await expect(componentBrowse).not.toContainText('同组件但未使用任务的流程');
  await expect(page.locator('[data-section="process"] .sb-add-btn[title*="新建流程"]')).toHaveCount(0);

  await componentBrowse.getByRole('button', { name: /提交预约/ }).click();
  await expect(page.getByTestId('orchestration-section')).toBeVisible();
  await expect(page.locator('.node-perspective-btn.active')).toContainText('节点任务');
  await expect(page.locator('.orch-card .orch-name').first()).toHaveValue('校验预约字段1');
});

test('组件目录数量按模型层级统计构件和资产', async ({ page, request }) => {
  const documentName = `sidebar-model-count-${Date.now()}`;
  const capabilityName = '\u4ea4\u5272\u670d\u52a1\u673a\u6784\u7ba1\u7406';
  const constructName = '\u4ed3\u5e93\u4fe1\u606f\u7ef4\u62a4';
  const entityName = '\u4ed3\u5e93\u4fe1\u606f';
  const taskName = '\u63d0\u4ea4\u4ed3\u5e93\u57fa\u672c\u4fe1\u606f';
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      { id: 'E1', name: entityName, businessConstructId: 'BC1', businessConstructIds: ['BC1'], fields: [] },
    ],
    capabilityUnits: [
      { id: 'CU1', name: capabilityName, kind: 'core', constructIds: ['BC1'], entityIds: [], taskDefinitionIds: ['TD1'] },
    ],
    businessConstructs: [
      { id: 'BC1', name: constructName, capabilityUnitId: 'CU1', capabilityUnit: capabilityName, entityIds: ['E1'], taskDefinitionIds: ['TD1'] },
    ],
    taskDefinitions: [
      { id: 'TD1', name: taskName, type: 'Service', target: '', note: '', capabilityUnitId: 'CU1', capabilityUnit: capabilityName, constructId: 'BC1', constructName },
    ],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await switchToBusinessComponentBrowse(page);

  const capabilityHead = page.locator('.sb-capability-head').filter({ hasText: capabilityName });
  await expect(capabilityHead.locator('.sb-count')).toHaveText('1');

  await capabilityHead.click();
  const constructHead = page.locator('.sb-construct-head').filter({ hasText: constructName });
  await expect(constructHead).toBeVisible();
  await expect(constructHead.getByTestId('construct-entity-count')).toHaveText('实体1');
  await expect(constructHead.getByTestId('construct-task-count')).toHaveText('任务1');
});
