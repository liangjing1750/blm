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
  await expect(page.getByTestId('domain-subtab-roles')).toHaveText('角色视图');
  await expect(page.getByTestId('domain-subtab-language')).toHaveText('术语字典');
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
