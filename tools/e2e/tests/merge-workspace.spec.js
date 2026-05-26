const { test, expect } = require('@playwright/test');

const { createDocument } = require('./support/app-helpers');

function buildDocument(name, processName) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '',
    },
    roles: [],
    language: [],
    processes: [
      {
        id: 'P1',
        name: processName,
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

function buildPanoramaDocument(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '',
    },
    roles: [],
    language: [],
    panorama: {
      columns: [
        { uid: 'participants', name: '参与人', scope: '参与方' },
        { uid: 'businessHandling', name: '业务办理', scope: '申请、审核、撤销' },
      ],
      lanes: [
        { uid: 'collateral-system', name: '担保品管理系统', badge: '目标平台', note: '' },
      ],
      cells: [],
    },
    stages: [
      {
        uid: 'stage-pledge',
        name: '仓单作为保证金',
        panoramaColumnUid: 'participants',
        panoramaLaneUid: 'collateral-system',
        processLinks: [],
      },
      {
        uid: 'stage-release',
        name: '解除仓单作为保证金',
        panoramaColumnUid: 'businessHandling',
        panoramaLaneUid: 'collateral-system',
        processLinks: [],
      },
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

async function getFirstHistoryOptionValue(page, kind = 'right') {
  const select = page.getByTestId(`compare-${kind}-version-select`);
  await expect.poll(async () => (
    await select.locator('option').evaluateAll((options) => (
      options.map((option) => option.value).find(Boolean) || ''
    ))
  )).not.toBe('');
  return select.locator('option').evaluateAll((options) => (
    options.map((option) => option.value).find(Boolean) || ''
  ));
}

test('用户可以从工作区选择两个文档并确认合并', async ({ page, request }) => {
  const leftName = `merge-left-${Date.now()}`;
  const rightName = `merge-right-${Date.now()}`;

  await createDocument(request, leftName, buildDocument(leftName, '左侧流程'));
  await createDocument(request, rightName, buildDocument(rightName, '右侧流程'));

  await page.goto('/');
  await page.getByTestId('toolbar-merge-button').click();

  await expect(page.getByTestId('merge-modal')).not.toHaveClass(/hidden/);
  await page.locator('#merge-right-select').selectOption(rightName);
  await page.locator('#merge-left-select').selectOption(leftName);
  await expect(page.locator('#merge-left-select')).toHaveValue(leftName);
  await expect(page.locator('#merge-right-select')).toHaveValue(rightName);

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await expect(page.getByTestId('merge-confirm-button')).toHaveText('合并前检查');
  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-modal')).not.toHaveClass(/hidden/);
  await expect(page.getByTestId('merge-analysis')).toContainText('未检测到冲突');
  await expect(page.getByTestId('merge-confirm-button')).toHaveText('生成合并文档');
  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toContainText('-合并');
});

test('复制文档合并后保留阶段的全景价值流归类', async ({ page, request }) => {
  const leftName = `merge-panorama-left-${Date.now()}`;
  const rightName = `${leftName}-副本`;
  const leftDocument = buildPanoramaDocument(leftName);
  const rightDocument = {
    ...buildPanoramaDocument(rightName),
    meta: {
      title: rightName,
      domain: rightName,
      author: '副本作者',
      date: '',
    },
  };

  await createDocument(request, leftName, leftDocument);
  await createDocument(request, rightName, rightDocument);

  await page.goto('/');
  await page.getByTestId('toolbar-merge-button').click();
  await expect(page.getByTestId('merge-modal')).not.toHaveClass(/hidden/);
  await page.locator('#merge-left-select').selectOption(leftName);
  await page.locator('#merge-right-select').selectOption(rightName);

  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-analysis')).toContainText('未检测到冲突');
  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-modal')).toHaveClass(/hidden/);

  const mergedState = await page.evaluate(() => ({
    columns: (S.doc?.panorama?.columns || []).map((item) => item.uid),
    lanes: (S.doc?.panorama?.lanes || []).map((item) => item.uid),
    stages: (S.doc?.stages || []).map((stage) => ({
      name: stage.name,
      column: stage.panoramaColumnUid,
      lane: stage.panoramaLaneUid,
    })),
  }));
  expect(mergedState.stages.length).toBe(2);
  for (const stage of mergedState.stages) {
    expect(mergedState.columns).toContain(stage.column);
    expect(mergedState.lanes).toContain(stage.lane);
    expect(stage.column).not.toBe('');
    expect(stage.lane).not.toBe('');
  }

  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-panorama').click();
  await expect(page.getByTestId('sidebar-stage-browse')).not.toContainText('未归类价值流');
});

test('用户可以选择当前版本和历史版本做只读比对', async ({ page, request }) => {
  const documentName = `compare-history-${Date.now()}`;
  const original = buildDocument(documentName, '原始流程');
  original.processes[0].tasks = [{
    id: 'N1',
    name: '申请节点',
    userSteps: [{ id: 'S1', content: '录入原始申请信息' }],
    forms: [{ id: 'F1', name: '原始申请表', fields: [] }],
    orchestrationTasks: [{ id: 'T1', name: '原始校验任务' }],
  }];
  original.entities = [{ id: 'E1', name: '仓库', group: '', note: '', fields: [], state_transitions: [] }];

  const current = buildDocument(documentName, '当前流程');
  current.processes[0].tasks = [{
    id: 'N1',
    name: '申请节点',
    userSteps: [{ id: 'S1', content: '录入当前申请信息' }],
    forms: [{ id: 'F1', name: '当前申请表', fields: [] }],
    orchestrationTasks: [{ id: 'T1', name: '当前校验任务' }],
  }];
  current.entities = [{ id: 'E1', name: '库区', group: '', note: '', fields: [], state_transitions: [] }];

  await createDocument(request, documentName, original);
  await createDocument(request, documentName, current);
  let releaseHistoryLoad;
  let markHistoryLoadStarted;
  const historyLoadStarted = new Promise((resolve) => {
    markHistoryLoadStarted = resolve;
  });
  await page.route('**/api/history/load', async (route) => {
    markHistoryLoadStarted();
    await new Promise((resolve) => {
      releaseHistoryLoad = resolve;
    });
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId('toolbar-compare-button').click();

  await expect(page.getByTestId('compare-modal')).not.toHaveClass(/hidden/);
  await page.getByTestId('compare-modal').click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('compare-modal')).not.toHaveClass(/hidden/);
  await page.getByTestId('compare-left-select').selectOption(documentName);
  await page.getByTestId('compare-right-select').selectOption(documentName);
  await expect(page.getByTestId('compare-left-select')).toHaveValue(documentName);
  await expect(page.getByTestId('compare-right-select')).toHaveValue(documentName);
  await expect.poll(() => page.evaluate(() => S.compare.workspaceNames.right)).toBe(documentName);
  const historyOptionValue = await getFirstHistoryOptionValue(page, 'right');
  await expect(page.getByTestId('compare-left-version-select')).toHaveValue('');
  await expect(page.getByTestId('compare-right-version-select')).toHaveValue('');
  expect(historyOptionValue).toBeTruthy();
  await page.getByTestId('compare-right-version-select').selectOption(historyOptionValue);
  await expect(page.getByTestId('compare-right-version-select')).toHaveValue(historyOptionValue);
  await expect(page.getByTestId('compare-result')).toContainText('开始比对');
  await expect(page.getByTestId('compare-result')).not.toContainText('版本比对报告');

  await expect(page.getByTestId('compare-start-button')).toBeEnabled();
  await page.getByTestId('compare-start-button').click();
  await historyLoadStarted;
  await expect(page.getByTestId('compare-progress')).toBeVisible();
  await expect(page.getByTestId('compare-start-button')).toBeDisabled();
  releaseHistoryLoad();
  await expect(page.getByTestId('compare-result')).toContainText('差异');
  await expect(page.getByTestId('compare-result')).toContainText('版本比对报告');
  await expect(page.getByTestId('compare-result')).toContainText('新版本');
  await expect(page.getByTestId('compare-result')).toContainText('旧版本');
  await expect(page.getByTestId('compare-result')).toContainText('流程6级模型影响');
  await expect(page.getByTestId('compare-result')).toContainText('业务差异分析');
  await expect(page.getByTestId('compare-result')).toContainText('（四）流程差异分析结果');
  await expect(page.getByTestId('compare-result')).toContainText('（六-1）步骤差异分析结果');
  await expect(page.getByTestId('compare-result')).toContainText('（六-2）表单差异分析结果');
  await expect(page.getByTestId('compare-result')).toContainText('（六-3）实体差异分析结果');
  await expect(page.getByTestId('compare-result')).toContainText('（六-4）任务差异分析结果');
  await expect(page.getByTestId('compare-result')).toContainText('序号');
  await expect(page.getByTestId('compare-result')).toContainText('差异类型');
  await expect(page.getByTestId('compare-result')).toContainText('差异说明');
  await expect(page.getByTestId('compare-result')).not.toContainText('重要程度');
  await expect(page.getByTestId('compare-result')).toContainText('修改');
  await expect(page.getByTestId('compare-result')).toContainText('图形布局差异分析');
  await expect(page.getByTestId('compare-result')).toContainText('没有发现图形位置');
  await expect(page.getByTestId('compare-result')).not.toContainText('无变化');
  await expect(page.getByTestId('compare-result')).toContainText('流程 P1');
  await expect(page.getByTestId('compare-result')).toContainText('L4 流程');
  await expect(page.getByTestId('compare-result')).toContainText('流程名称');
  await expect(page.getByTestId('compare-result')).not.toContainText('processes[0].name');
  await expect(page.getByTestId('compare-result')).toContainText('当前流程');
  await expect(page.getByTestId('compare-result')).toContainText('原始流程');
  await expect(page.getByTestId('compare-result')).toContainText('当前申请表');
  await expect(page.getByTestId('compare-result')).toContainText('当前校验任务');
  await expect(page.getByTestId('compare-result')).not.toContainText('模型明细');
  await expect(page.getByTestId('compare-result')).not.toContainText('请确认');
  await expect(page.locator('.compare-business-table th .compare-th-help').first()).toHaveAttribute('title', /序号/);
  await expect(page.getByTestId('compare-report-mode-toggle')).toHaveText('全部报告');
  await page.getByTestId('compare-report-mode-toggle').click();
  await expect(page.getByTestId('compare-report-mode-toggle')).toHaveText('只看差异');
  await expect(page.getByTestId('compare-result')).toContainText('（一）价值流差异分析结果');
  await expect(page.getByTestId('compare-result')).toContainText('没有价值流层差异');
  await expect(page.getByTestId('compare-result')).toContainText('阶段视图');
  await expect(page.getByTestId('compare-result')).toContainText('实体关系图');
  await expect(page.getByTestId('compare-result')).toContainText('无变化');
  await page.getByTestId('compare-report-mode-toggle').click();
  await expect(page.getByTestId('compare-report-mode-toggle')).toHaveText('全部报告');
  await expect(page.getByTestId('compare-result')).not.toContainText('没有价值流层差异');
  await expect(page.getByTestId('compare-modal').locator('[data-testid="merge-confirm-button"]')).toHaveCount(0);
  await expect(page.getByTestId('compare-modal').locator('[data-testid="compare-footer-close-button"]')).toHaveCount(0);
  await expect(page.locator('.compare-modal .modal-title-row')).toHaveCSS('position', 'sticky');
  await page.getByTestId('compare-close-button').click();
  await expect(page.getByTestId('compare-modal')).toHaveClass(/hidden/);
});

test('比对报告将图形坐标变化汇总为布局变化', async ({ page, request }) => {
  const documentName = `compare-layout-${Date.now()}`;
  const original = buildDocument(documentName, '布局流程');
  original.entities = [{ id: 'E1', name: '仓库', group: '', note: '', pos: { x: 20, y: 30 }, fields: [], state_transitions: [] }];
  const current = buildDocument(documentName, '布局流程');
  current.entities = [{ id: 'E1', name: '仓库', group: '', note: '', pos: { x: 7777, y: 8888 }, fields: [], state_transitions: [] }];

  await createDocument(request, documentName, original);
  await createDocument(request, documentName, current);

  await page.goto('/');
  await page.getByTestId('toolbar-compare-button').click();
  await page.getByTestId('compare-left-select').selectOption(documentName);
  await page.getByTestId('compare-right-select').selectOption(documentName);
  await expect.poll(() => page.evaluate(() => S.compare.workspaceNames.right)).toBe(documentName);
  const historyOptionValue = await getFirstHistoryOptionValue(page, 'right');
  await page.getByTestId('compare-right-version-select').selectOption(historyOptionValue);
  await expect(page.getByTestId('compare-right-version-select')).toHaveValue(historyOptionValue);
  await page.getByTestId('compare-start-button').click();

  await expect(page.getByTestId('compare-result')).toContainText('图形布局差异分析');
  await expect(page.getByTestId('compare-result')).toContainText('实体关系图');
  await expect(page.locator('.compare-summary > div').filter({ hasText: '布局变化' })).toContainText('1');
  await expect(page.getByTestId('compare-result')).toContainText('1 个实体/关系位置或布局变化');
  await expect(page.getByTestId('compare-result')).toContainText('实体 E1 仓库');
  await expect(page.getByTestId('compare-result')).not.toContainText('pos.x');
  await expect(page.getByTestId('compare-result')).not.toContainText('7777');
});

test('比对报告将新增实体关系规则归入业务差异而不是布局变化', async ({ page, request }) => {
  const documentName = `compare-relation-rule-${Date.now()}`;
  const original = buildDocument(documentName, '关系流程');
  original.entities = [
    { id: 'E1', name: '读者', group: '', note: '', fields: [], state_transitions: [] },
    { id: 'E2', name: '借阅记录', group: '', note: '', fields: [], state_transitions: [] },
  ];
  original.relations = [];

  const current = buildDocument(documentName, '关系流程');
  current.entities = original.entities;
  current.relations = [{
    id: 'REL1',
    from: 'E1',
    to: 'E2',
    type: '1:N',
    label: '读者产生借阅记录',
    labelPos: { x: 9999, y: 8888 },
  }];

  await createDocument(request, documentName, original);
  await createDocument(request, documentName, current);

  await page.goto('/');
  await page.getByTestId('toolbar-compare-button').click();
  await page.getByTestId('compare-left-select').selectOption(documentName);
  await page.getByTestId('compare-right-select').selectOption(documentName);
  await expect.poll(() => page.evaluate(() => S.compare.workspaceNames.right)).toBe(documentName);
  const historyOptionValue = await getFirstHistoryOptionValue(page, 'right');
  await page.getByTestId('compare-right-version-select').selectOption(historyOptionValue);
  await page.getByTestId('compare-start-button').click();

  const entitySection = page.locator('.compare-business-section').filter({ hasText: '（六-3）实体差异分析结果' });
  await expect(entitySection).toBeVisible();
  await expect(entitySection).toContainText('新增');
  await expect(entitySection).toContainText('实体关系 E1 → E2（读者产生借阅记录）');
  await expect(entitySection).toContainText('读者产生借阅记录');
  await expect(page.locator('.compare-summary > div').filter({ hasText: '布局变化' })).toContainText('0');
  await expect(page.getByTestId('compare-result')).toContainText('没有发现图形位置');
  await expect(page.getByTestId('compare-result')).not.toContainText('1 个实体/关系位置或布局变化');
  await expect(page.getByTestId('compare-result')).not.toContainText('9999');

  await page.getByTestId('compare-report-mode-toggle').click();
  await expect(page.getByTestId('compare-result')).toContainText('实体关系图');
  await expect(page.getByTestId('compare-result')).toContainText('无变化');
});

test('比对报告删除整张表单时合并模块片段', async ({ page, request }) => {
  const documentName = `compare-form-delete-${Date.now()}`;
  const original = buildDocument(documentName, '表单删除流程');
  original.processes[0].tasks = [{
    id: 'N1',
    name: '申请节点',
    forms: [{
      id: 'F_DEL',
      name: '删除测试表单',
      sections: [
        {
          id: 'SEC1',
          title: '基础信息',
          fields: [
            { id: 'F1', name: '客户名称', type: 'text', required: true },
            { id: 'F2', name: '联系电话', type: 'text', required: false },
          ],
        },
        {
          id: 'SEC2',
          title: '业务信息',
          fields: [
            { id: 'F3', name: '申请数量', type: 'number', required: true },
          ],
        },
      ],
    }],
  }];
  const current = buildDocument(documentName, '表单删除流程');
  current.processes[0].tasks = [{ id: 'N1', name: '申请节点', forms: [] }];

  await createDocument(request, documentName, original);
  await createDocument(request, documentName, current);

  await page.goto('/');
  await page.getByTestId('toolbar-compare-button').click();
  await page.getByTestId('compare-left-select').selectOption(documentName);
  await page.getByTestId('compare-right-select').selectOption(documentName);
  await expect.poll(() => page.evaluate(() => S.compare.workspaceNames.right)).toBe(documentName);
  const historyOptionValue = await getFirstHistoryOptionValue(page, 'right');
  await page.getByTestId('compare-right-version-select').selectOption(historyOptionValue);
  await page.getByTestId('compare-start-button').click();

  const formSection = page.locator('.compare-business-section').filter({ hasText: '（六-2）表单差异分析结果' });
  await expect(formSection).toBeVisible();
  await expect(formSection.locator('tbody tr')).toHaveCount(1);
  await expect(formSection).toContainText('删除');
  await expect(formSection).toContainText('表单 F_DEL 删除测试表单');
  await expect(formSection).toContainText('合并 2 个模块/片段、3 个字段');
  await expect(formSection).not.toContainText('请确认');
  await expect(formSection).not.toContainText('基础信息');
  await expect(formSection).not.toContainText('业务信息');
});

test('合并同名规则冲突时提供裁决选项', async ({ page, request }) => {
  const leftName = `merge-rule-left-${Date.now()}`;
  const rightName = `merge-rule-right-${Date.now()}`;
  const leftDoc = buildDocument(leftName, '规则流程');
  const rightDoc = buildDocument(rightName, '规则流程');
  leftDoc.rules = [
    { uid: 'left-rule-uid', id: 'R1', name: '校验规则', type: 'Check', applies_to: 'P1', description: '左侧口径', formula: 'amount > 0' },
  ];
  rightDoc.rules = [
    { uid: 'right-rule-uid', id: 'R1', name: '校验规则', type: 'Check', applies_to: 'P1', description: '右侧口径', formula: 'amount >= 1' },
  ];

  await createDocument(request, leftName, leftDoc);
  await createDocument(request, rightName, rightDoc);

  await page.goto('/');
  await page.getByTestId('toolbar-merge-button').click();
  await page.locator('#merge-right-select').selectOption(rightName);
  await page.locator('#merge-left-select').selectOption(leftName);
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.getByTestId('merge-confirm-button').click();

  await expect(page.getByTestId('merge-confirm-button')).toHaveText('生成合并文档');
  await expect(page.locator('.merge-conflict-card')).toContainText('规则同名但内容不同');
  await expect(page.locator('.merge-conflict-card')).toContainText('校验规则');
  await expect(page.locator('[data-merge-conflict]').first()).toContainText('保留左侧');
  await expect(page.locator('[data-merge-conflict]').first()).toContainText('保留右侧');
  await expect(page.locator('[data-merge-conflict]').first()).toContainText('两者都保留');
});

test('合并校验问题提供推荐修复后才能生成结果', async ({ page, request }) => {
  const leftName = `merge-validation-left-${Date.now()}`;
  const rightName = `merge-validation-right-${Date.now()}`;
  const leftDoc = buildDocument(leftName, '校验流程');
  const rightDoc = buildDocument(rightName, '校验流程');
  leftDoc.rules = [
    { id: 'R1', name: '孤立规则', type: 'Check', applies_to: 'P-missing', description: '引用已删除流程', formula: '' },
  ];

  await createDocument(request, leftName, leftDoc);
  await createDocument(request, rightName, rightDoc);

  await page.goto('/');
  await page.getByTestId('toolbar-merge-button').click();
  await page.locator('#merge-right-select').selectOption(rightName);
  await page.locator('#merge-left-select').selectOption(leftName);
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-validation-guide')).toContainText('需要人工选择');
  await expect(page.getByTestId('merge-validation-guide')).toContainText('孤立规则');
  await page.getByTestId('merge-validation-fix-clear').first().click();
  await expect(page.getByTestId('merge-validation-guide')).toHaveCount(0);

  await page.getByTestId('merge-confirm-button').click();
  await expect(page.getByTestId('merge-modal')).toHaveClass(/hidden/);
  await expect(page.getByTestId('current-file-name')).toContainText('-合并');
});
