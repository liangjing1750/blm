const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const outDir = path.join(repoRoot, 'tools', 'e2e', '.tmp', 'visual-business-model');
const port = 8903;
const documentName = `business-model-visual-${Date.now()}`;

function buildDocument() {
  return {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-06-17' },
    roles: [],
    language: [],
    processes: [],
    businessComponents: [
      { id: 'BCP1', uid: 'BCP1', name: '交易服务组件', kind: 'core', constructUids: ['C1', 'C2'] },
      { id: 'BCP2', uid: 'BCP2', name: '监管支撑组件', kind: 'core', constructUids: ['C3'] },
      { id: 'BCP3', uid: 'BCP3', name: '通用基础组件', kind: 'generic', constructUids: ['C4'] },
    ],
    businessConstructs: [
      { id: 'C1', uid: 'C1', name: '会员交易构件', businessComponentUid: 'BCP1', entityUids: ['E1'], taskDefinitionUids: ['TD1'] },
      { id: 'C2', uid: 'C2', name: '交割仓储构件', businessComponentUid: 'BCP1', entityUids: ['E2'], taskDefinitionUids: ['TD2'] },
      { id: 'C3', uid: 'C3', name: '风险监管构件', businessComponentUid: 'BCP2', entityUids: ['E3'], taskDefinitionUids: ['TD3'] },
      { id: 'C4', uid: 'C4', name: '消息通知构件', businessComponentUid: 'BCP3', entityUids: [], taskDefinitionUids: [] },
      { id: 'C5', uid: 'C5', name: '未分组构件', entityUids: [], taskDefinitionUids: [] },
    ],
    entities: [
      { id: 'E1', uid: 'E1', name: '交易单', businessConstructUid: 'C1', fields: [] },
      { id: 'E2', uid: 'E2', name: '仓单', businessConstructUid: 'C2', fields: [] },
      { id: 'E3', uid: 'E3', name: '监管记录', businessConstructUid: 'C3', fields: [] },
    ],
    taskDefinitions: [
      { id: 'TD1', uid: 'TD1', name: '提交交易', type: 'Service', constructUid: 'C1' },
      { id: 'TD2', uid: 'TD2', name: '查询仓单', type: 'Query', constructUid: 'C2' },
      { id: 'TD3', uid: 'TD3', name: '同步监管', type: 'Service', constructUid: 'C3' },
    ],
    relations: [],
    rules: [],
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
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.App && window.S, null, { timeout: 15000 });
  await page.locator('#dd-file .tbar-dd-btn').click();
  await page.locator('[data-testid="toolbar-open-button"]:visible').click();
  await page.locator('.file-list-item').filter({ hasText: documentName }).first().click();
  await page.waitForFunction(() => window.S?.doc?.businessComponents?.length >= 3);
}

async function collectView(page, name, rootSelector) {
  await page.screenshot({ path: path.join(outDir, `${name}-page.png`), fullPage: true });
  const root = page.locator(rootSelector).first();
  await root.screenshot({ path: path.join(outDir, `${name}-panel.png`) });

  const styles = await page.evaluate((selector) => {
    const targets = [
      selector,
      '.domain-info-map-block',
      '.domain-info-map-head',
      '.domain-map-shell',
      '.domain-region',
      '.domain-context-node',
      '.business-model',
      '.business-model-head',
      '.business-model-map',
      '.business-model-map-shell',
      '.business-model-editor',
      '.business-model-row',
    ];
    const pick = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 120),
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
    return Object.fromEntries(targets.map((target) => [target, Array.from(document.querySelectorAll(target)).slice(0, 8).map(pick)]));
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

  await page.getByTestId('tab-legacyDomainInfo').click();
  await page.waitForSelector('[data-testid="domain-subdomain-map-card"]', { timeout: 15000 });
  await collectView(page, 'legacy-business-model', '[data-testid="domain-subdomain-map-card"]');

  await page.getByTestId('tab-constructWorkbench').click();
  await page.getByTestId('component-subtab-businessComponents').click();
  await page.waitForSelector('[data-testid="business-model-angular"]', { timeout: 15000 });
  await collectView(page, 'current-business-model', '[data-testid="business-model-angular"]');

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
    console.log(`business model comparison exported to ${outDir}`);
  } finally {
    stopServer(server);
  }
})();
