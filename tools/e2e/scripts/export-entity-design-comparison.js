const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const outDir = path.join(repoRoot, 'tools', 'e2e', '.tmp', 'visual-entity-design');
const legacyURL = process.env.BLM_LEGACY_URL || 'http://127.0.0.1:8086';
const currentURL = process.env.BLM_CURRENT_URL || 'http://127.0.0.1:8081';
const documentName = process.env.BLM_VISUAL_DOC || `entity-visual-${Date.now()}`;

function buildDocument() {
  return {
    meta: { title: documentName, domain: documentName, author: 'Visual Oracle', date: '2026-06-20' },
    roles: [],
    language: [],
    processes: [],
    businessComponents: [
      { uid: 'BCP1', name: '交易组件', kind: 'core' },
      { uid: 'BCP2', name: '仓储监管组件', kind: 'generic' },
    ],
    businessConstructs: [
      { uid: 'C1', name: '交易构件', businessComponentUid: 'BCP1' },
      { uid: 'C2', name: '仓储构件', businessComponentUid: 'BCP2' },
      { uid: 'C3', name: '监管构件', businessComponentUid: 'BCP2' },
    ],
    entities: [
      {
        uid: 'E1',
        name: '订单',
        businessConstructUid: 'C1',
        fields: [
          { uid: 'F1', name: '订单号', type: 'string', note: '业务唯一编号' },
          { uid: 'F2', name: '状态', type: 'string', state_values: '待提交，已提交，已完成' },
        ],
        state_transitions: [
          { uid: 'T1', from: '待提交', to: '已提交', action: '提交' },
          { uid: 'T2', from: '已提交', to: '已完成', action: '完成' },
        ],
      },
      { uid: 'E2', name: '仓单', businessConstructUid: 'C2', fields: [{ uid: 'F3', name: '仓单号', type: 'string' }] },
      { uid: 'E3', name: '监管记录', businessConstructUid: 'C3', fields: [{ uid: 'F4', name: '记录编号', type: 'string' }] },
      { uid: 'E4', name: '客户', fields: [{ uid: 'F5', name: '客户名称', type: 'string' }] },
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

async function waitForServer(baseURL) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${baseURL} is not reachable`);
}

async function saveDocument(baseURL) {
  const response = await fetch(`${baseURL}/api/save/${encodeURIComponent(documentName)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildDocument()),
  });
  if (!response.ok) throw new Error(`save failed on ${baseURL}: ${response.status}`);
}

async function openDocument(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('blm.user.profile', JSON.stringify({ id: 'visual-user', name: 'Visual Oracle' }));
    window.closeUserAccountModal?.();
  }).catch(() => {});
  if (await page.getByTestId('user-modal').isVisible().catch(() => false)) {
    await page.locator('#user-display-name-input').fill('Visual Oracle');
    await page.getByTestId('user-save-button').click();
    await page.getByTestId('user-modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.evaluate(() => {
      const modal = document.getElementById('user-modal-overlay');
      if (!modal) return;
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.style.pointerEvents = 'none';
    }).catch(() => {});
  }
  if (baseURL === legacyURL) {
    await page.waitForFunction(() => window.App?.openFile, null, { timeout: 15000 });
    await page.evaluate((name) => window.App.openFile(name), documentName);
    await page.waitForFunction((name) => {
      const current = document.querySelector('[data-testid="current-file-name"]')?.textContent || '';
      return current.includes(name);
    }, documentName, { timeout: 15000 });
    return;
  }
  const emptyOpenButton = page.locator('.empty-state button').filter({ hasText: /打开|開啟|Open/ });
  if (await emptyOpenButton.count()) {
    await emptyOpenButton.first().click();
  } else {
    const fileMenuButton = page.locator('#dd-file .tbar-dd-btn');
    if (await fileMenuButton.count()) await fileMenuButton.click();
    const openMenuItem = page.getByTestId('toolbar-open-button');
    if (await openMenuItem.isVisible().catch(() => false)) await openMenuItem.click();
    else await page.evaluate(() => window.App?.cmdOpen?.());
  }
  const searchBox = page.locator('#open-file-search');
  await searchBox.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await searchBox.count()) await searchBox.fill(documentName);
  await page.waitForTimeout(500);
  await clickDocumentCard(page, documentName);
  await page.waitForFunction((name) => {
    const current = document.querySelector('[data-testid="current-file-name"]')?.textContent || '';
    return current.includes(name) || window.S?.doc?.meta?.title === name || window.S?.doc?.meta?.domain === name;
  }, documentName, { timeout: 15000 });
}

async function clickDocumentCard(page, name) {
  const card = page.locator('.file-list-item, [data-testid="workspace-doc-card"]').filter({ hasText: name }).first();
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    if (await card.count()) {
      await card.click();
      return;
    }
    const next = page.locator('[data-testid="workspace-pagination"] button, #workspace-pagination button').filter({ hasText: /下一页|Next/ }).first();
    if (!(await next.count()) || await next.isDisabled().catch(() => true)) break;
    await next.click();
    await page.waitForTimeout(300);
  }
  throw new Error(`document card not found: ${name}`);
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
      '.ef-canvas',
      '.ef-board',
      '.ef-component-frame',
      '.ef-group-frame',
      '.ef-node',
      '.ef-rel',
      '.entity-state-workbench',
      '.entity-state-board',
      '.entity-state-node',
      '.entity-state-link',
      '.entity-design-toolbar',
      '.entity-design-canvas-shell',
      '.entity-relation-canvas',
      '.entity-board',
      '.entity-component-frame',
      '.entity-group-frame',
      '.entity-node',
      '.entity-rel-line',
      '.entity-state-canvas',
      '.entity-state-svg',
      '.entity-design-drawer',
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
    return Object.fromEntries(targets.map((target) => [
      target,
      Array.from(document.querySelectorAll(target)).slice(0, 10).map(pick),
    ]));
  }, rootSelector);
  fs.writeFileSync(path.join(outDir, `${name}-styles.json`), JSON.stringify(styles, null, 2), 'utf8');
}

async function collectLegacy(browser) {
  const context = await browser.newContext({
    viewport: { width: 1520, height: 860 },
    storageState: {
      cookies: [],
      origins: [{
        origin: legacyURL,
        localStorage: [{ name: 'blm.user.profile', value: JSON.stringify({ id: 'visual-user', name: 'Visual Oracle' }) }],
      }],
    },
  });
  const page = await context.newPage();
  await openDocument(page, legacyURL);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-relation').click().catch(() => {});
  await page.waitForSelector('#entity-diagram .ef-node', { timeout: 15000 });
  await collectView(page, 'legacy-relation', '.entity-diag-full');

  await page.getByTestId('data-switch-state').click().catch(async () => {
    await page.evaluate(() => {
      window.S.ui.dataView = 'state';
      window.render?.();
    });
  });
  await page.waitForSelector('.entity-state-board, .entity-state-graph, .entity-state-workbench', { timeout: 15000 });
  await collectView(page, 'legacy-state', '.entity-diag-full, .entity-state-workbench');
  await context.close();
}

async function collectCurrent(browser) {
  const context = await browser.newContext({
    viewport: { width: 1520, height: 860 },
    storageState: {
      cookies: [],
      origins: [{
        origin: currentURL,
        localStorage: [{ name: 'blm.user.profile', value: JSON.stringify({ id: 'visual-user', name: 'Visual Oracle' }) }],
      }],
    },
  });
  const page = await context.newPage();
  await openDocument(page, currentURL);
  await page.getByTestId('tab-constructWorkbench').click();
  await page.getByTestId('component-subtab-entities').click();
  await page.waitForSelector('[data-testid="entity-design-angular"] [data-testid="entity-design-node"]', { timeout: 15000 });
  await collectView(page, 'current-relation', '[data-testid="entity-design-angular"]');

  await page.getByTestId('entity-design-switch-state').click();
  await page.waitForSelector('[data-testid="entity-design-state-view"] .entity-state-node', { timeout: 15000 });
  await collectView(page, 'current-state', '[data-testid="entity-design-angular"]');
  await context.close();
}

(async () => {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  await Promise.all([waitForServer(legacyURL), waitForServer(currentURL)]);
  await Promise.all([saveDocument(legacyURL), saveDocument(currentURL)]);
  const browser = await chromium.launch({ headless: true });
  try {
    await collectLegacy(browser);
    await collectCurrent(browser);
  } finally {
    await browser.close();
  }
  console.log(`entity design comparison exported to ${outDir}`);
})();
