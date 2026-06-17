const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const outDir = path.join(repoRoot, 'tools', 'e2e', '.tmp', 'visual-entity-design');
const port = 8902;
const documentName = `entity-visual-${Date.now()}`;

function buildDocument() {
  return {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-06-17' },
    roles: [],
    language: [],
    processes: [],
    businessComponents: [
      { id: 'BCP1', uid: 'BCP1', name: '交易组件', kind: 'core' },
      { id: 'BCP2', uid: 'BCP2', name: '仓储监管组件', kind: 'generic' },
    ],
    businessConstructs: [
      { id: 'C1', uid: 'C1', name: '交易构件', businessComponentUid: 'BCP1' },
      { id: 'C2', uid: 'C2', name: '仓储构件', businessComponentUid: 'BCP2' },
      { id: 'C3', uid: 'C3', name: '监管构件', businessComponentUid: 'BCP2' },
    ],
    entities: [
      {
        id: 'E1',
        uid: 'E1',
        name: '订单',
        businessConstructUid: 'C1',
        fields: [
          { uid: 'F1', name: '订单号', type: 'string', note: '业务唯一编号' },
          { uid: 'F2', name: '状态', type: 'string', state_values: '待提交,已提交,已完成' },
        ],
        state_transitions: [
          { uid: 'T1', from: '待提交', to: '已提交', action: '提交' },
          { uid: 'T2', from: '已提交', to: '已完成', action: '完成' },
        ],
      },
      { id: 'E2', uid: 'E2', name: '仓单', businessConstructUid: 'C2', fields: [{ uid: 'F3', name: '仓单号', type: 'string' }] },
      { id: 'E3', uid: 'E3', name: '监管记录', businessConstructUid: 'C3', fields: [{ uid: 'F4', name: '记录编号', type: 'string' }] },
      { id: 'E4', uid: 'E4', name: '客户', fields: [{ uid: 'F5', name: '客户名称', type: 'string' }] },
    ],
    relations: [
      { uid: 'R1', from: 'E1', to: 'E2', type: '1:N', label: '订单关联仓单' },
      { uid: 'R2', from: 'E2', to: 'E3', type: '1:N', label: '仓单触发监管' },
      { uid: 'R3', from: 'E1', to: 'E4', type: 'N:1', label: '订单归属客户' },
    ],
    rules: [],
    taskDefinitions: [],
  };
}

function startServer() {
  fs.mkdirSync(outDir, { recursive: true });
  const workspace = path.join(outDir, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const child = spawn('python', ['blm.py'], {
    cwd: repoRoot,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BLM_PORT: String(port), BLM_NO_BROWSER: '1', BLM_WORKSPACE_DIR: workspace },
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
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

async function waitForServer() {
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

async function saveDocument() {
  await fetch(`http://127.0.0.1:${port}/api/save/${encodeURIComponent(documentName)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildDocument()),
  });
}

async function openDocument(page) {
  const baseURL = `http://127.0.0.1:${port}`;
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.App && window.S, null, { timeout: 15000 });
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.locator('[data-testid="toolbar-open-button"]:visible').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await page.waitForFunction(() => window.S?.doc?.entities?.length >= 4);
}

async function collectView(page, name, rootSelector) {
  await page.screenshot({ path: path.join(outDir, `${name}-page.png`), fullPage: true });
  const root = page.locator(rootSelector).first();
  await root.screenshot({ path: path.join(outDir, `${name}-panel.png`) });

  const styles = await page.evaluate((selector) => {
    const targets = [
      selector,
      '.live-diagram-toolbar',
      '.data-view-switch',
      '.entity-shortcut-hint',
      '.live-diagram',
      '.ef-canvas',
      '.ef-board',
      '.ef-node',
      '.ef-rel',
      '.entity-design-toolbar',
      '.entity-design-canvas-shell',
      '.entity-relation-canvas',
      '.entity-board',
      '.entity-node',
      '.entity-rel-line',
      '.entity-design-drawer',
      '.entity-edit-section',
    ];
    const pick = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 100),
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
    return Object.fromEntries(targets.map((target) => [
      target,
      Array.from(document.querySelectorAll(target)).slice(0, 8).map(pick),
    ]));
  }, rootSelector);
  fs.writeFileSync(path.join(outDir, `${name}-styles.json`), JSON.stringify(styles, null, 2), 'utf8');
}

async function collect(browser) {
  const context = await browser.newContext({
    viewport: { width: 1520, height: 860 },
    storageState: {
      cookies: [],
      origins: [{
        origin: `http://127.0.0.1:${port}`,
        localStorage: [{ name: 'blm.user.profile', value: JSON.stringify({ id: 'visual-user', name: '视觉比对' }) }],
      }],
    },
  });
  const page = await context.newPage();
  await openDocument(page);

  await page.getByTestId('tab-legacyEntityDiagram').click();
  await page.waitForSelector('#entity-diagram .ef-node', { timeout: 15000 });
  await page.locator('.ef-node[data-id="E1"]').click();
  await page.getByTestId('entity-editor-open').click();
  await page.waitForSelector('.entity-drawer.open', { timeout: 15000 });
  await collectView(page, 'legacy-relation', '.entity-diag-full');

  await page.getByTestId('tab-constructWorkbench').click();
  await page.getByTestId('component-subtab-entities').click();
  await page.waitForSelector('[data-testid="entity-design-angular"] [data-testid="entity-design-node"]', { timeout: 15000 });
  await collectView(page, 'current-relation', '[data-testid="entity-design-angular"]');

  await page.getByTestId('entity-design-switch-state').click();
  await page.waitForSelector('[data-testid="entity-design-state-view"]', { timeout: 15000 });
  await collectView(page, 'current-state', '[data-testid="entity-design-angular"]');

  await context.close();
}

(async () => {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const server = startServer();
  try {
    await waitForServer();
    await saveDocument();
    const browser = await chromium.launch({ headless: true });
    try {
      await collect(browser);
    } finally {
      await browser.close();
    }
    console.log(`entity design comparison exported to ${outDir}`);
  } finally {
    stopServer(server);
  }
})();
