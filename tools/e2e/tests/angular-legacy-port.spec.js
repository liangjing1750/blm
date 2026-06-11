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
    { tab: 'tab-processWorkbench', content: '[data-testid="process-switch-panorama"], #tab-content' },
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
