const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

function buildBranchDoc(name) {
  return {
    meta: { title: name, domain: name, author: '', date: '2026-05' },
    roles: [
      { id: 'R1', name: '申请人', desc: '' },
      { id: 'R2', name: '审核员', desc: '' },
      { id: 'R3', name: '系统', desc: '' },
    ],
    processes: [{
      id: 'P1',
      name: '入库预约',
      subDomain: '仓储',
      trigger: '提交预约',
      outcome: '预约完成',
      nodes: [
        { id: 'T1', name: '提交预约', role_id: 'R1', role: '申请人', userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [{ entity_id: 'E1', ops: ['C', 'R'] }] },
        { id: 'T2', name: '审核通过', role_id: 'R2', role: '审核员', userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
        { id: 'T3', name: '补充材料', role_id: 'R1', role: '申请人', userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
      ],
      flow: {
        version: 2,
        orientation: 'horizontal',
        nodes: [{ id: 'G1', kind: 'gateway', title: '材料是否完整', gatewayType: 'exclusive', role_id: 'R3' }],
        edges: [
          { id: 'E1', from: 'START', to: 'T1', label: '开始' },
          { id: 'E2', from: 'T1', to: 'G1', label: '提交后' },
          { id: 'E3', from: 'G1', to: 'T2', label: '完整' },
          { id: 'E4', from: 'G1', to: 'T3', label: '不完整' },
          { id: 'E5', from: 'T2', to: 'END', label: '完成' },
          { id: 'E6', from: 'T3', to: 'END', label: '补正' },
        ],
      },
    }],
    language: [],
    entities: [{ id: 'E1', name: '预约单', fields: [] }],
    relations: [],
    rules: [],
  };
}

function buildTallSwimlaneDoc(name) {
  const roles = Array.from({ length: 7 }, (_, index) => ({ id: 'R' + (index + 1), name: 'Lane ' + (index + 1), desc: '' }));
  const nodes = roles.map((role, index) => ({
    id: 'T' + (index + 1),
    name: 'Task ' + (index + 1),
    role_id: role.id,
    role: role.name,
    userSteps: [],
    orchestrationTasks: [],
    forms: [],
    entity_ops: [],
  }));
  return {
    meta: { title: name, domain: name, author: '', date: '2026-05' },
    roles,
    processes: [{
      id: 'P1',
      name: 'Tall swimlane',
      nodes,
      flow: {
        version: 2,
        nodes: [],
        edges: nodes.slice(0, -1).map((node, index) => ({ id: 'E' + (index + 1), from: node.id, to: nodes[index + 1].id, label: 'L' + (index + 1) })),
      },
    }],
    language: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

test('process flow renders swimlane branches and linear view omits branch diamonds', async ({ page, request }) => {
  const documentName = 'process-swimlane-' + Date.now();
  await createDocument(request, documentName, buildBranchDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();

  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.getByTestId('process-tasklevel-flow')).toHaveCount(0);
  await expect(page.getByTestId('process-swimlane-view')).toBeVisible();
  await expect(page.locator('.ps-link')).toHaveCount(6);
  await expect(page.locator('.ps-start')).toHaveCount(1);
  await expect(page.locator('.ps-end')).toHaveCount(1);
  await expect(page.locator('.ps-gateway[data-id="G1"]')).toBeVisible();
  await expect(page.locator('.ps-gateway[data-id="G1"]')).not.toContainText('材料是否完整');
  await expect(page.locator('.ps-edge-label')).toContainText(['提交后', '完整', '不完整']);
  await expect(page.locator('.ps-lane-title', { hasText: '申请人' }).first()).toBeVisible();
  await expect(page.locator('.ps-lane-title', { hasText: '审核员' }).first()).toBeVisible();
  await expect(page.locator('.ps-lane-title', { hasText: '系统' }).first()).toBeVisible();
  await expect(page.locator('.ps-entity-tag', { hasText: '预约单·CR' })).toBeVisible();

  await page.getByTestId('process-flow-entity-toggle').locator('input').uncheck();
  await expect(page.locator('.ps-entity-tag')).toHaveCount(0);
  await expect(page.locator('.ps-link')).toHaveCount(6);

  await page.getByTestId('process-flow-mode-linear').click();
  await expect(page.locator('.pf-gateway[data-id="G1"]')).toHaveCount(0);
  await expect(page.locator('.pf-edge-label').filter({ hasText: /^完整$/ }).first()).toBeVisible();
  await expect(page.locator('.pf-edge-label').filter({ hasText: /^不完整$/ }).first()).toBeVisible();

  await page.getByTestId('process-flow-mode-swimlane').click();
  await page.getByTestId('tab-preview').click();
  await expect(page.locator('#preview-rendered [data-testid="process-swimlane-view"]').first()).toBeVisible();
  await expect(page.locator('#preview-rendered .ps-link').first()).toHaveAttribute('points', /,/);
});

test('tall swimlane canvas contributes to the flow view scroll height instead of being clipped', async ({ page, request }) => {
  const documentName = 'process-swimlane-tall-' + Date.now();
  await createDocument(request, documentName, buildTallSwimlaneDoc(documentName));

  await page.setViewportSize({ width: 900, height: 460 });
  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await expect(page.getByTestId('process-tasklevel-flow')).toHaveCount(0);

  const metrics = await page.getByTestId('process-flow-view').evaluate((view) => {
    const board = view.querySelector('[data-testid="process-swimlane-view"]');
    const diagram = board?.closest('.live-diagram');
    return {
      className: view.className,
      diagramOverflow: diagram ? getComputedStyle(diagram).overflow : '',
      diagramClientHeight: diagram?.clientHeight || 0,
      diagramScrollHeight: diagram?.scrollHeight || 0,
      boardHeight: board?.getBoundingClientRect().height || 0,
    };
  });
  expect(metrics.className).not.toContain('has-tasklevel');
  expect(metrics.diagramOverflow).toMatch(/auto|scroll/);
  expect(metrics.boardHeight).toBeGreaterThan(600);
  expect(metrics.diagramScrollHeight).toBeGreaterThan(metrics.diagramClientHeight);

  await page.getByTestId('process-flow-view').evaluate((view) => {
    const diagram = view.querySelector('[data-testid="process-swimlane-view"]')?.closest('.live-diagram');
    diagram.scrollTop = diagram.scrollHeight;
  });
  await page.waitForTimeout(100);
  await expect(page.locator('.ps-lane-title', { hasText: 'Lane 7' })).toBeInViewport();
});

test('process editor exposes only nodes branches and edges as new structure entries', async ({ page, request }) => {
  const documentName = 'process-routing-editor-' + Date.now();
  await createDocument(request, documentName, buildTallSwimlaneDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();

  await expect(page.getByTestId('process-flow-routing-editor')).toBeVisible();
  await expect(page.getByTestId('process-flow-add-task')).toBeVisible();
  await expect(page.getByTestId('process-flow-add-gateway')).toBeVisible();
  await expect(page.getByTestId('process-flow-add-edge')).toBeVisible();
  await expect(page.getByTestId('process-flow-add-end')).toHaveCount(0);
  await expect(page.locator('.flow-node-flag')).toHaveCount(0);

  const edgeCountBefore = await page.getByTestId('process-flow-edge-row').count();
  await page.getByTestId('process-flow-add-task').click();
  await expect(page.getByTestId('process-flow-node-row')).toHaveCount(8);
  const edgesAfterNode = await page.evaluate(() => S.doc.processes[0].flow.edges.map((edge) => edge.from + '->' + edge.to));
  expect(edgesAfterNode.length).toBe(edgeCountBefore);

  await page.getByTestId('process-flow-add-gateway').click();
  await expect(page.getByTestId('process-flow-gateway-row')).toHaveCount(1);
  await page.getByTestId('process-flow-gateway-title-input').fill('是否需要复核');
  await expect(page.locator('.ps-gateway')).not.toContainText('是否需要复核');
  const gatewayId = await page.getByTestId('process-flow-gateway-id-input').inputValue();

  await page.getByTestId('process-flow-add-edge').click();
  const lastEdge = page.getByTestId('process-flow-edge-row').last();
  await expect(lastEdge.locator('select').nth(0)).toHaveValue('');
  await expect(lastEdge.locator('select').nth(1)).toHaveValue('');
  const fromOptions = await lastEdge.locator('select').nth(0).locator('option').evaluateAll((options) => options.map((option) => option.value));
  const toOptions = await lastEdge.locator('select').nth(1).locator('option').evaluateAll((options) => options.map((option) => option.value));
  expect(fromOptions).not.toContain('END');
  expect(toOptions).not.toContain('START');
  await lastEdge.locator('select').nth(0).selectOption('START');
  await lastEdge.locator('select').nth(1).selectOption(gatewayId);
  await lastEdge.locator('input').nth(1).fill('进入分支');
  const explicitEdge = await page.evaluate(() => S.doc.processes[0].flow.edges.at(-1));
  expect(explicitEdge).toMatchObject({ from: 'START', to: gatewayId, label: '进入分支' });
  await expect(page.getByTestId('process-flow-validation')).toBeVisible();
});

test('process editor can add the first edge for a flow without existing routing', async ({ page, request }) => {
  const documentName = 'process-routing-empty-' + Date.now();
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName },
    roles: [
      { id: 'R1', name: '客户' },
      { id: 'R2', name: '系统' },
    ],
    processes: [{
      id: 'P124',
      name: '入库预约申请',
      nodes: [
        { id: 'T1', name: '填写并提交入库预约', role_id: 'R1', role_ids: ['R1'], userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
        { id: 'T2', name: '校验并生成待办', role_id: 'R2', role_ids: ['R2'], userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
      ],
    }],
    language: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();

  await expect(page.getByTestId('process-flow-edge-row')).toHaveCount(0);
  await page.getByTestId('process-flow-add-edge').click();
  await expect(page.getByTestId('process-flow-edge-row')).toHaveCount(1);
  const edge = await page.evaluate(() => S.doc.processes[0].flow.edges[0]);
  expect(edge).toMatchObject({ from: '', to: '' });
  await expect(page.getByTestId('process-flow-edge-row').first().locator('select').nth(0)).toHaveValue('');
  await expect(page.getByTestId('process-flow-edge-row').first().locator('select').nth(1)).toHaveValue('');
});

test('summary view is edge-driven and does not invent branch labels', async ({ page, request }) => {
  const documentName = 'process-summary-' + Date.now();
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName },
    roles: [{ id: 'R1', name: 'Role' }],
    processes: [{
      id: 'P1',
      name: 'Summary flow',
      nodes: [
        { id: 'T1', name: 'First in model', role_id: 'R1', role_ids: ['R1'], userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
        { id: 'T2', name: 'Actual start', role_id: 'R1', role_ids: ['R1'], userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
        { id: 'T3', name: 'Branch target', role_id: 'R1', role_ids: ['R1'], userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
      ],
      flow: {
        version: 2,
        nodes: [{ id: 'G1', kind: 'gateway', title: '' }],
        edges: [
          { id: 'E1', from: 'START', to: 'T2', label: '' },
          { id: 'E2', from: 'T2', to: 'G1', label: '' },
          { id: 'E3', from: 'G1', to: 'T1', label: '' },
          { id: 'E4', from: 'G1', to: 'T3', label: '' },
          { id: 'E5', from: 'T1', to: 'END', label: '' },
          { id: 'E6', from: 'T3', to: 'END', label: '' },
        ],
      },
    }],
    language: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-flow-mode-linear').click();

  await expect(page.getByTestId('process-flow-mode-linear')).toHaveText('摘要图');
  await expect(page.getByTestId('process-summary-help')).toBeVisible();
  await page.getByTestId('process-summary-help').hover();
  await expect(page.getByTestId('process-summary-help-panel')).toBeVisible();
  await expect(page.getByTestId('process-summary-help-card')).toHaveCount(7);
  await expect(page.getByTestId('process-summary-help-panel')).toContainText('纯顺序');
  await expect(page.getByTestId('process-summary-help-panel')).toContainText('分支后归并');
  await expect(page.getByTestId('process-summary-help-panel')).toContainText('回退/撤回');
  const helpBox = await page.getByTestId('process-summary-help-panel').boundingBox();
  expect(helpBox.width).toBeGreaterThan(500);
  expect(helpBox.height).toBeGreaterThan(300);
  const viewport = page.viewportSize();
  expect(Math.abs((helpBox.x + helpBox.width / 2) - viewport.width / 2)).toBeLessThan(8);
  expect(Math.abs((helpBox.y + helpBox.height / 2) - viewport.height / 2)).toBeLessThan(8);
  const cardRows = await page.getByTestId('process-summary-help-card').evaluateAll((cards) => new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top))).size);
  expect(cardRows).toBeLessThanOrEqual(2);
  await page.getByTestId('process-summary-help').click();
  await expect(page.getByTestId('process-summary-help-panel')).toBeVisible();
  await page.getByTestId('process-summary-help').click();
  await expect(page.getByTestId('process-summary-help-panel')).not.toBeVisible();
  await expect(page.locator('.pf-edge-label')).toHaveCount(0);
  const positions = await page.evaluate(() => {
    const read = (id) => document.querySelector(`.pf-col[data-id="${id}"]`)?.getBoundingClientRect().left || 0;
    return { t1: read('T1'), t2: read('T2'), t3: read('T3') };
  });
  expect(positions.t2).toBeLessThan(positions.t1);
  expect(Math.abs(positions.t1 - positions.t3)).toBeLessThan(8);
  const lineShapes = await page.locator('.pf-link').evaluateAll((links) => links.map((link) => link.getAttribute('points') || ''));
  expect(lineShapes.some((points) => points.split(' ').length === 2)).toBeTruthy();
  expect(lineShapes.some((points) => points.split(' ').length > 2)).toBeTruthy();
});

test('swimlane drag stores node label and lane layout adjustments', async ({ page, request }) => {
  const documentName = 'process-swimlane-drag-' + Date.now();
  await createDocument(request, documentName, buildBranchDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await page.getByTestId('process-flow-mode-swimlane').click();

  const task = page.locator('.ps-task[data-id="T1"]').first();
  const taskBox = await task.boundingBox();
  expect(taskBox).toBeTruthy();
  await page.mouse.move(taskBox.x + taskBox.width / 2, taskBox.y + taskBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(260);
  await page.mouse.move(taskBox.x + taskBox.width / 2 + 36, taskBox.y + taskBox.height / 2 + 18, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => S.doc.processes[0].flow.layout.swimlane.items.T1?.dx || 0)).not.toBe(0);

  const label = page.locator('.ps-edge-label').first();
  const labelBox = await label.boundingBox();
  expect(labelBox).toBeTruthy();
  await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(260);
  await page.mouse.move(labelBox.x + labelBox.width / 2 + 20, labelBox.y + labelBox.height / 2 - 10, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => Object.keys(S.doc.processes[0].flow.layout.swimlane.labels).length)).toBeGreaterThan(0);

  const lanes = page.locator('.ps-lane-title');
  const firstLane = await lanes.nth(0).boundingBox();
  const secondLane = await lanes.nth(1).boundingBox();
  expect(firstLane).toBeTruthy();
  expect(secondLane).toBeTruthy();
  await page.mouse.move(secondLane.x + secondLane.width / 2, secondLane.y + secondLane.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstLane.x + firstLane.width / 2, firstLane.y + firstLane.height / 2 - 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => S.doc.processes[0].flow.layout.swimlane.laneOrder.length)).toBeGreaterThan(1);
});

test('swimlane node click edits while long press drags and self loops render as helper arcs', async ({ page, request }) => {
  const documentName = 'process-swimlane-click-loop-' + Date.now();
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName },
    roles: [{ id: 'R1', name: '客户' }, { id: 'R2', name: '系统' }],
    processes: [{
      id: 'P1',
      name: 'Loop flow',
      nodes: [
        { id: 'T1', name: '提交', role_id: 'R1', role_ids: ['R1'], userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
        { id: 'T2', name: '校验', role_id: 'R2', role_ids: ['R2'], userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
      ],
      flow: {
        version: 2,
        nodes: [],
        edges: [
          { id: 'E1', from: 'START', to: 'T1', label: '' },
          { id: 'E2', from: 'T1', to: 'T1', label: '补正' },
          { id: 'E3', from: 'T1', to: 'T2', label: '' },
          { id: 'E4', from: 'T2', to: 'T1', label: '退回' },
          { id: 'E5', from: 'T2', to: 'END', label: '' },
        ],
      },
    }],
    language: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();

  await page.locator('.ps-task[data-id="T1"]').first().click();
  await expect(page.getByTestId('process-task-name-input')).toHaveValue('提交');
  await expect(page.getByTestId('task-returnable-toggle')).toHaveCount(0);

  await page.getByTitle('回到流程', { exact: true }).click();
  await page.getByTestId('process-flow-mode-swimlane').click();
  await expect(page.locator('.ps-loop-link')).toHaveCount(1);
  await expect(page.locator('.ps-return-link')).toHaveCount(1);

  await page.getByTestId('process-flow-mode-linear').click();
  await expect(page.locator('.pf-loop-link')).toHaveCount(1);
  await expect(page.locator('.pf-return-link')).toHaveCount(1);
});

test('swimlane view expands multi-role process nodes without changing the model', async ({ page, request }) => {
  const documentName = 'process-swimlane-multirole-' + Date.now();
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName },
    roles: [
      { id: 'R1', name: '客户' },
      { id: 'R2', name: '经办人' },
      { id: 'R3', name: '系统' },
    ],
    processes: [{
      id: 'P1',
      name: '多角色流程',
      nodes: [
        { id: 'T1', name: '共同提交', role_ids: ['R1', 'R2'], roles: ['客户', '经办人'], role_id: 'R1', role: '客户、经办人', userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
        { id: 'T2', name: '系统校验', role_id: 'R3', role: '系统', userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
        { id: 'T3', name: '人工复核', role_id: 'R2', role: '经办人', userSteps: [], orchestrationTasks: [], forms: [], entity_ops: [] },
      ],
      flow: {
        version: 2,
        nodes: [{ id: 'G1', kind: 'gateway', title: '' }],
        edges: [
          { id: 'E1', from: 'T1', to: 'G1', label: '提交' },
          { id: 'E2', from: 'G1', to: 'T2', label: '自动' },
          { id: 'E3', from: 'G1', to: 'T3', label: '人工' },
        ],
      },
    }],
    language: [],
    entities: [],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();

  await expect(page.locator('.ps-lane-title', { hasText: '客户' })).toBeVisible();
  await expect(page.locator('.ps-lane-title', { hasText: '经办人' })).toBeVisible();
  await expect(page.locator('.ps-task[data-id="T1"]')).toHaveCount(2);
  await expect(page.locator('.ps-task[data-id="T1"].ps-task-shared')).toHaveCount(2);
  await page.getByTestId('process-editor-open').click();
  await expect(page.getByTestId('process-flow-validation')).toContainText('共享节点');
  const modelNodeCount = await page.evaluate(() => S.doc.processes[0].nodes.length);
  expect(modelNodeCount).toBe(3);
});
