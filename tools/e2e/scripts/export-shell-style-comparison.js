const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const LEGACY_URL = process.env.BLM_LEGACY_URL || 'http://127.0.0.1:8086';
const ANGULAR_URL = process.env.BLM_ANGULAR_URL || 'http://127.0.0.1:8081';
const OUT = path.resolve(__dirname, '../artifacts/shell-style-comparison.json');
const LEGACY_APP_DIR = process.env.BLM_LEGACY_APP_DIR || path.resolve(__dirname, '../../../../blm_old/app');

const SELECTORS = [
  '#topbar',
  '#main',
  '#sidebar',
  '#sidebar-content',
  '#sidebar-resize-handle',
  '#sb-toggle-btn',
  '#tab-bar',
  '[data-testid="angular-shell-tab-bar"]',
  '[data-testid="angular-sidebar-directory"]',
  '[data-testid="angular-sidebar-resize-handle"]',
  '#angular-sb-toggle-btn',
  '.sb-value-stream-head',
  '.sb-value-head',
  '.sb-stage-head',
  '.sb-flow-group-head',
  '.sb-capability-head',
  '.sb-construct-head',
  '.sb-asset-head',
  '.sb-asset-section',
  '.sb-asset-item',
  '.sb-related-processes',
  '.view-toggle-group',
  '.vtb',
  '[data-testid="panorama-editor-open"]',
];

async function ensureDocumentOpen(page) {
  await page.goto(page.url() || ANGULAR_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  if (await page.locator('#sidebar').count()) return;
  const openButton = page.locator('[data-testid="no-document-open-button"]:visible, [data-testid="toolbar-open-button"]:visible, button:visible:has-text("打开")').first();
  if (await openButton.count()) {
    await openButton.click().catch(() => {});
    await page.waitForTimeout(500);
    const firstCard = page.locator('[data-testid="workspace-document-card"], .doc-card, .workspace-doc-card').first();
    if (await firstCard.count()) {
      await firstCard.click().catch(() => {});
      await page.waitForTimeout(1000);
      if (await page.locator('#sidebar').count()) return;
    }
  }
  const newButton = page.locator('[data-testid="no-document-new-button"]:visible, [data-testid="toolbar-new-button"]:visible').first();
  if (await newButton.count()) {
    await newButton.click().catch(() => {});
    await page.waitForTimeout(200);
    const nameInput = page.locator('[data-testid="create-document-name-input"]').first();
    if (await nameInput.count()) {
      await nameInput.fill(`visual-shell-${Date.now()}`);
      await page.locator('[data-testid="create-document-submit-button"]').click().catch(() => {});
      await page.waitForTimeout(1000);
      if (await page.locator('#sidebar').count()) return;
    }
  }
  if (!await page.locator('#sidebar').count()) {
    throw new Error('未进入文档态，无法导出 #sidebar。');
  }
}

async function expandSidebar(page) {
  const toggle = page.locator('#angular-sb-toggle-btn, #sb-toggle-btn').first();
  const collapsed = await page.locator('[data-testid="angular-sidebar-collapsed"], #sidebar.sb-collapsed').count();
  if (collapsed && await toggle.count()) {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(200);
  }
  for (const selector of ['.sb-value-stream-head', '.sb-stage-head', '.sb-capability-head', '.sb-construct-head']) {
    const item = page.locator(selector).first();
    if (await item.count()) {
      await item.click().catch(() => {});
      await page.waitForTimeout(80);
    }
  }
}

async function collect(url, label) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const entry = { label, url, ok: true, selectors: {}, error: null };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await ensureDocumentOpen(page);
    await expandSidebar(page);
    entry.selectors = await page.evaluate((selectors) => {
      const pick = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
          rect: {
            x: Math.round(rect.x * 100) / 100,
            y: Math.round(rect.y * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
          },
          style: {
            display: style.display,
            position: style.position,
            overflow: style.overflow,
            overflowY: style.overflowY,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            padding: style.padding,
            margin: style.margin,
            borderRadius: style.borderRadius,
            backgroundColor: style.backgroundColor,
            color: style.color,
          },
        };
      };
      return Object.fromEntries(selectors.map((selector) => [
        selector,
        Array.from(document.querySelectorAll(selector)).slice(0, 8).map(pick),
      ]));
    }, SELECTORS);
    entry.sidebarTree = await page.evaluate(() => {
      const root = document.querySelector('#sidebar');
      const walk = (node, depth = 0) => {
        if (!node || depth > 5) return null;
        const element = node;
        return {
          tag: element.tagName?.toLowerCase(),
          id: element.id || '',
          className: element.className || '',
          testId: element.getAttribute?.('data-testid') || '',
          text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
          children: Array.from(element.children || []).slice(0, 40).map((child) => walk(child, depth + 1)).filter(Boolean),
        };
      };
      return walk(root);
    });
    entry.sidebarClassStyles = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('#sidebar [class*="sb-"], #sidebar-content [class*="sb-"]'));
      const byClass = new Map();
      for (const node of nodes) {
        const classes = Array.from(node.classList || []).filter((item) => item.startsWith('sb-'));
        for (const className of classes) {
          if (byClass.has(className)) continue;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          byClass.set(className, {
            text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
            rect: {
              x: Math.round(rect.x * 100) / 100,
              y: Math.round(rect.y * 100) / 100,
              width: Math.round(rect.width * 100) / 100,
              height: Math.round(rect.height * 100) / 100,
            },
            style: {
              display: style.display,
              overflow: style.overflow,
              overflowY: style.overflowY,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              lineHeight: style.lineHeight,
              padding: style.padding,
              borderTop: style.borderTop,
              borderBottom: style.borderBottom,
              backgroundColor: style.backgroundColor,
              color: style.color,
            },
          });
        }
      }
      return Object.fromEntries([...byClass.entries()].sort(([a], [b]) => a.localeCompare(b)));
    });
  } catch (error) {
    entry.ok = false;
    entry.error = error instanceof Error ? error.message : String(error);
  } finally {
    await page.close();
  }
  return entry;
}

function extractBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) return '';
  const end = text.indexOf(endMarker, start + startMarker.length);
  return text.slice(start, end > start ? end : undefined);
}

function collectLegacySourceOracle() {
  const renderPath = path.join(LEGACY_APP_DIR, 'render.js');
  const stylePath = path.join(LEGACY_APP_DIR, 'style.css');
  const renderText = fs.existsSync(renderPath) ? fs.readFileSync(renderPath, 'utf8') : '';
  const styleText = fs.existsSync(stylePath) ? fs.readFileSync(stylePath, 'utf8') : '';
  return {
    renderPath,
    stylePath,
    renderSidebarSnippet: extractBetween(renderText, 'function _defaultSbCollapse', 'function render()').slice(0, 28000),
    sidebarStyleSnippet: extractBetween(styleText, '/* ─── 滚动条', '/* ─── move 按钮').slice(0, 26000),
  };
}

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const result = {
    generatedAt: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
    legacySourceOracle: collectLegacySourceOracle(),
    legacy: await collect(LEGACY_URL, 'legacy'),
    angular: await collect(ANGULAR_URL, 'angular'),
  };
  await browser.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(OUT);
})().catch(async (error) => {
  if (browser) await browser.close().catch(() => {});
  console.error(error);
  process.exit(1);
});
