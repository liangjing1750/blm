const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

// 模块意图：把“价值流与业务域”的视觉复刻变成可重复采集的截图和样式数据。
const toolDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(toolDir, '..', '..');
const serverCwd = process.env.BLM_VISUAL_SERVER_CWD
  ? path.resolve(process.env.BLM_VISUAL_SERVER_CWD)
  : repoRoot;
const baseUrl = process.env.BLM_VISUAL_BASE_URL || 'http://127.0.0.1:8899';
const target = process.env.BLM_VISUAL_TARGET || 'panorama';
const state = process.env.BLM_VISUAL_STATE || 'both';
const outputRoot = process.env.BLM_VISUAL_OUTPUT_DIR
  || path.join(toolDir, 'artifacts', 'value-domain-oracle');
const viewport = {
  width: Number(process.env.BLM_VISUAL_WIDTH || 1512),
  height: Number(process.env.BLM_VISUAL_HEIGHT || 800),
};
const serverPort = new URL(baseUrl).port || '8899';
const workspaceDir = process.env.BLM_E2E_WORKSPACE_DIR
  || path.join(toolDir, '.tmp', `visual-oracle-workspace-${Date.now()}`);

const styleSelectors = [
  ['matrix', '[data-testid="value-domain-matrix"], .value-stream-matrix'],
  ['corner', '.value-domain-corner, .value-stream-corner'],
  ['header', '[data-testid="value-stream-header"]'],
  ['lane', '.value-domain-lane, .value-stream-lane'],
  ['cell', '[data-testid="value-domain-cell"], .value-stream-cell'],
  ['stage', '[data-testid="value-domain-stage-card"], [data-testid="stage-graph-node"]'],
  ['field', '.matrix-edit-field'],
  ['input', '.matrix-inline-input'],
  ['miniButton', '.matrix-mini-btn'],
  ['stageBoard', '[data-testid="value-stream-stage-board"]'],
  ['dialog', '[data-testid="stage-dialog-backdrop"], [data-testid="app-dialog"]'],
];

async function main() {
  const label = process.env.BLM_VISUAL_LABEL || `${target}-${Date.now()}`;
  const outputDir = path.join(outputRoot, label);
  fs.mkdirSync(outputDir, { recursive: true });

  fs.mkdirSync(workspaceDir, { recursive: true });
  const server = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseUrl,
          localStorage: [
            {
              name: 'blm.user.profile',
              value: JSON.stringify({ id: 'visual-oracle', name: '视觉采集' }),
            },
          ],
        },
      ],
    },
  });
  const page = await context.newPage();

  try {
    const docName = `visual-value-domain-${Date.now()}`;
    await saveFixtureDocument(docName);
    await openDocument(page, docName);
    await openValueDomain(page);

    const states = state === 'both' ? ['view', 'edit', 'dialog'] : [state];
    for (const item of states) {
      await setVisualState(page, item);
      await captureState(page, outputDir, item);
    }

    const manifest = {
      label,
      baseUrl,
      target,
      state,
      viewport,
      outputDir,
      capturedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Value-domain visual oracle written to ${outputDir}`);
  } finally {
    await browser.close();
    if (server) server.kill();
  }
}

async function ensureServer() {
  if (await isServerReady()) return null;
  // 关键流程：脚本可独立运行；没有现成服务时启动临时后端，采集完成后关闭。
  const outLog = fs.openSync(path.join(workspaceDir, 'visual-oracle-server.out.log'), 'a');
  const errLog = fs.openSync(path.join(workspaceDir, 'visual-oracle-server.err.log'), 'a');
  const server = spawn('python', ['blm.py'], {
    cwd: serverCwd,
    env: {
      ...process.env,
      BLM_PORT: serverPort,
      BLM_NO_BROWSER: '1',
      BLM_WORKSPACE_DIR: workspaceDir,
    },
    stdio: ['ignore', outLog, errLog],
    windowsHide: true,
  });
  await waitForServer();
  return server;
}

async function isServerReady() {
  try {
    const response = await fetch(baseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isServerReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function saveFixtureDocument(name) {
  const response = await fetch(`${baseUrl}/api/save/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildFixtureDocument(name)),
  });
  if (!response.ok) {
    throw new Error(`Failed to save fixture document: ${response.status} ${await response.text()}`);
  }
}

async function openDocument(page, name) {
  await page.goto(baseUrl);
  await page.locator('#dd-file').hover();
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.getByTestId('toolbar-open-button').click();
  await page.locator('.file-list-item').filter({ hasText: name }).first().click();
  await page.getByTestId('current-file-name').waitFor({ state: 'visible' });
}

async function openValueDomain(page) {
  if (target === 'process') {
    await page.getByTestId('tab-processWorkbench').click();
    await page.getByTestId('process-switch-panorama').click();
    return;
  }
  await page.getByTestId('tab-panoramaWorkbench').click();
  await page.getByTestId('domain-subtab-valueDomain').click();
}

async function setVisualState(page, nextState) {
  const editorOpen = page.getByTestId('stage-editor-open');
  const editorHide = page.getByTestId('stage-editor-hide');

  if (nextState === 'view') {
    if (await editorHide.count()) await editorHide.click();
    await page.waitForTimeout(120);
    return;
  }

  if (await editorOpen.count()) await editorOpen.click();
  await page.waitForTimeout(120);

  if (nextState === 'dialog') {
    const addButton = await firstExistingLocator(page, [
      '[data-testid="stage-overview-add-button"]',
      '[data-testid="matrix-stage-add"]',
    ]);
    if (!addButton) {
      throw new Error('No stage add button found for dialog capture');
    }
    await addButton.click();
    await page.waitForTimeout(120);
  }
}

async function firstExistingLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) return locator;
  }
  return null;
}

async function captureState(page, outputDir, stateName) {
  // 关键流程：同一状态同时保存截图、DOM 尺寸和 computed styles，后续可以做像素和样式双重对比。
  const root = page.locator('[data-testid="value-domain-angular"], .stage-workbench').first();
  await root.screenshot({ path: path.join(outputDir, `${stateName}.png`) });

  const styleReport = await page.evaluate((selectors) => {
    const properties = [
      'display',
      'position',
      'width',
      'height',
      'minWidth',
      'minHeight',
      'padding',
      'margin',
      'border',
      'borderRadius',
      'background',
      'backgroundColor',
      'color',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'boxShadow',
      'gap',
      'gridTemplateColumns',
    ];
    return selectors.map(([name, selector]) => {
      const element = document.querySelector(selector);
      if (!element) return { name, selector, found: false };
      const rect = element.getBoundingClientRect();
      const computed = window.getComputedStyle(element);
      const styles = {};
      properties.forEach((property) => {
        styles[property] = computed[property];
      });
      return {
        name,
        selector,
        found: true,
        className: element.className,
        text: (element.textContent || '').trim().slice(0, 120),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        styles,
      };
    });
  }, styleSelectors);

  fs.writeFileSync(path.join(outputDir, `${stateName}.styles.json`), `${JSON.stringify(styleReport, null, 2)}\n`, 'utf8');
  await page.locator('body').screenshot({ path: path.join(outputDir, `${stateName}.full.png`) });
}

function buildFixtureDocument(name) {
  // 边界细节：样本文档只覆盖矩阵视觉所需字段，不引入新后端字段；阶段槽位沿用旧版 panoramaSlot。
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-06-12',
    },
    roles: [],
    language: [],
    rules: [],
    processes: [],
    entities: [],
    relations: [],
    components: [],
    taskDefinitions: [],
    stageFlowRefs: [],
    stages: [
      { id: 'S1', name: '业务阶段7', subDomain: '', panoramaLaneUid: 'lane-smart', panoramaColumnUid: 'col-basic', panoramaSlot: { row: 0, col: 0 } },
      { id: 'S2', name: '入库', subDomain: '', panoramaLaneUid: 'lane-smart', panoramaColumnUid: 'col-warehouse', panoramaSlot: { row: 0, col: 0 } },
      { id: 'S3', name: '在库', subDomain: '', panoramaLaneUid: 'lane-smart', panoramaColumnUid: 'col-warehouse', panoramaSlot: { row: 0, col: 1 } },
      { id: 'S4', name: '出库', subDomain: '', panoramaLaneUid: 'lane-smart', panoramaColumnUid: 'col-warehouse', panoramaSlot: { row: 1, col: 0 } },
      { id: 'S5', name: '业务阶段6', subDomain: '', panoramaLaneUid: 'lane-smart', panoramaColumnUid: 'col-warehouse', panoramaSlot: { row: 1, col: 1 } },
      { id: 'S6', name: '仓库平面图监控', subDomain: '', panoramaLaneUid: 'lane-smart', panoramaColumnUid: 'col-service', panoramaSlot: { row: 0, col: 0 } },
      { id: 'S7', name: '仓库信息管理', subDomain: '', panoramaLaneUid: 'lane-smart', panoramaColumnUid: 'col-service', panoramaSlot: { row: 0, col: 1 } },
    ],
    panorama: {
      columns: [
        { id: 'col-basic', badge: '1', name: '2基础数据@樊朝鹏', scope: '3账号、参数' },
        { id: 'col-warehouse', badge: '价值链环节', name: '仓单监管@杨伟', scope: '入库、在库、出库、仓单链' },
        { id: 'col-service', badge: '价值链环节', name: '交割服务机构监管@樊朝鹏', scope: '考核评级、查库、年审、仓库基本信息、监控视频' },
        { id: 'col-board', badge: '价值链环节', name: '车船板交割@杨伟', scope: '' },
        { id: 'col-home', badge: '价值链环节', name: '首页/大屏展示 //TODO', scope: '' },
      ],
      lanes: [
        { id: 'lane-smart', badge: '8业务系统8', name: '9交割智慧监管平台', note: '10' },
        { id: 'lane-order', badge: '', name: '交割电子仓单系统', note: '' },
      ],
      cells: [
        { laneUid: 'lane-smart', columnUid: 'col-basic', status: '4', text: '5' },
        { laneUid: 'lane-smart', columnUid: 'col-service', status: '2', text: '' },
      ],
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
