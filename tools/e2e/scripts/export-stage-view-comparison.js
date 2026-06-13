const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const legacyRoot = path.join(repoRoot, 'tools', 'e2e', '.tmp', 'legacy-oracle-worktree');
const outDir = path.join(repoRoot, 'tools', 'e2e', '.tmp', 'visual-stage-view');

const targets = [
  { name: 'legacy', root: legacyRoot, port: 8898 },
  { name: 'current', root: repoRoot, port: 8899 },
];

const documentName = `stage-visual-${Date.now()}`;

function buildDocument() {
  return {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-06-13' },
    roles: [],
    language: [],
    rules: [],
    panorama: {
      columns: [{ id: 'value-a', uid: 'value-a', name: '价值流A', badge: '环节', scope: '定义说明' }],
      lanes: [{ id: 'domain-a', uid: 'domain-a', name: '业务域A', badge: '业务系统', note: '业务域说明' }],
      cells: [],
      strategy: { vision: '', values: '', goals: '' },
    },
    stages: [
      { id: 'S1', uid: 'S1', name: '开户准备', subDomain: '账户', panoramaColumnUid: 'value-a', panoramaLaneUid: 'domain-a' },
    ],
    stageLinks: [],
    stageFlowRefs: [
      { id: 'SFR1', uid: 'SFR1', stageId: 'S1', stageUid: 'S1', processId: 'P1', processUid: 'P1', order: 1 },
      { id: 'SFR2', uid: 'SFR2', stageId: 'S1', stageUid: 'S1', processId: 'P2', processUid: 'P2', order: 2 },
      { id: 'SFR3', uid: 'SFR3', stageId: 'S1', stageUid: 'S1', processId: 'P3', processUid: 'P3', order: 3 },
    ],
    stageFlowLinks: [
      { id: 'SFL1', uid: 'SFL1', stageId: 'S1', stageUid: 'S1', fromRefId: 'SFR1', fromRefUid: 'SFR1', toRefId: 'SFR2', toRefUid: 'SFR2' },
      { id: 'SFL2', uid: 'SFL2', stageId: 'S1', stageUid: 'S1', fromRefId: 'SFR2', fromRefUid: 'SFR2', toRefId: 'SFR3', toRefUid: 'SFR3' },
    ],
    processes: [
      { id: 'P1', uid: 'P1', name: '资料录入', subDomain: '账户', flowGroup: '开户组', trigger: '', outcome: '', nodes: [] },
      { id: 'P2', uid: 'P2', name: '资料审核', subDomain: '账户', flowGroup: '开户组', trigger: '', outcome: '', nodes: [] },
      { id: 'P3', uid: 'P3', name: '账户开通', subDomain: '账户', flowGroup: '开户组', trigger: '', outcome: '', nodes: [] },
    ],
    entities: [],
    relations: [],
    components: [],
    taskDefinitions: [],
  };
}

function startServer(target) {
  const workspace = path.join(outDir, `${target.name}-workspace`);
  fs.mkdirSync(workspace, { recursive: true });
  const child = spawn('python', ['blm.py'], {
    cwd: target.root,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BLM_PORT: String(target.port),
      BLM_NO_BROWSER: '1',
      BLM_WORKSPACE_DIR: workspace,
    },
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${target.name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${target.name}] ${chunk}`));
  return child;
}

function stopServer(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  child.kill();
}

async function waitForServer(port) {
  const url = `http://127.0.0.1:${port}/`;
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`server ${port} did not start`);
}

async function preparePage(browser, target) {
  const baseURL = `http://127.0.0.1:${target.port}`;
  await fetch(`${baseURL}/api/save/${encodeURIComponent(documentName)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildDocument()),
  });

  const context = await browser.newContext({
    viewport: { width: 1520, height: 860 },
    storageState: {
      cookies: [],
      origins: [{
        origin: baseURL,
        localStorage: [{ name: 'blm.user.profile', value: JSON.stringify({ id: 'visual-user', name: '视觉比对' }) }],
      }],
    },
  });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.App && window.S, null, { timeout: 15000 });
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.locator('[data-testid="toolbar-open-button"]:visible').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await page.waitForFunction(() => window.S?.doc?.meta?.title || window.S?.doc?.meta?.domain);
  await page.getByTestId('tab-processWorkbench').click();
  await page.waitForSelector('#tab-content', { timeout: 15000 });
  await page.evaluate(() => {
    window.S.ui.procView = 'stage';
    window.S.ui.stageViewMode = 'detail';
    window.S.ui.stageId = 'S1';
    window.S.ui.stageEditorCollapsed = false;
    window.renderProcessTab?.();
  });
  try {
    await page.waitForSelector('[data-testid="process-stage-view"]', { timeout: 15000 });
    await page.waitForSelector('[data-testid="stage-detail-graph"]', { timeout: 15000 });
    await page.waitForSelector('[data-testid="stage-flow-name-input"]', { timeout: 15000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outDir, `${target.name}-prepare-failed.png`), fullPage: true });
    const html = await page.locator('#tab-content').evaluate((node) => node.innerHTML).catch(() => '');
    fs.writeFileSync(path.join(outDir, `${target.name}-prepare-failed.html`), html, 'utf8');
    throw error;
  }
  await page.waitForTimeout(300);
  return page;
}

async function collect(page, target) {
  const prefix = path.join(outDir, target.name);
  await page.screenshot({ path: `${prefix}-page.png`, fullPage: true });
  const stage = page.locator('[data-testid="process-stage-view"]');
  await stage.screenshot({ path: `${prefix}-stage.png` });

  const data = await page.evaluate(() => {
    const selectors = [
      '.proc-view-toolbar',
      '.stage-workbench',
      '.stage-main-shell',
      '.stage-card',
      '.stage-compact-head',
      '[data-testid="stage-detail-graph"]',
      '.stage-flow-canvas-tools',
      '.stage-flow-zoom-shell',
      '.stage-flow-board',
      '.stage-flow-group-box',
      '[data-testid="stage-graph-node"]',
      '.stage-flow-name-input',
      '.stage-flow-node-group-editor',
    ];
    const pickStyle = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent.trim().slice(0, 80),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        display: style.display,
        position: style.position,
        overflow: `${style.overflowX}/${style.overflowY}`,
        padding: style.padding,
        margin: style.margin,
        border: style.border,
        radius: style.borderRadius,
        background: style.backgroundColor,
        color: style.color,
        font: `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`,
      };
    };
    return Object.fromEntries(selectors.map((selector) => [
      selector,
      [...document.querySelectorAll(selector)].slice(0, 8).map(pickStyle),
    ]));
  });
  fs.writeFileSync(`${prefix}-styles.json`, JSON.stringify(data, null, 2), 'utf8');
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const servers = targets.map(startServer);
  try {
    await Promise.all(targets.map((target) => waitForServer(target.port)));
    const browser = await chromium.launch({ headless: true });
    try {
      for (const target of targets) {
        const page = await preparePage(browser, target);
        await collect(page, target);
        await page.context().close();
      }
    } finally {
      await browser.close();
    }
    console.log(`visual comparison exported to ${outDir}`);
  } finally {
    servers.forEach(stopServer);
  }
})();
