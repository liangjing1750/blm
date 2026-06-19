const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const LEGACY_URL = process.env.BLM_LEGACY_URL || 'http://127.0.0.1:8086';
const ANGULAR_URL = process.env.BLM_ANGULAR_URL || 'http://127.0.0.1:8081';
const OUT = path.resolve(__dirname, '../artifacts/shell-style-comparison.json');

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
  '.sb-stage-head',
  '.sb-flow-group-head',
  '.sb-capability-head',
  '.sb-construct-head',
  '.sb-asset-head',
  '.view-toggle-group',
  '.vtb',
  '[data-testid="panorama-editor-open"]',
];

async function ensureDocumentOpen(page) {
  await page.goto(page.url() || ANGULAR_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const openButton = page.locator('[data-testid="no-document-open-button"], [data-testid="toolbar-open-button"], button:has-text("打开")').first();
  if (await openButton.count()) {
    await openButton.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const firstCard = page.locator('[data-testid="workspace-document-card"], .doc-card, .workspace-doc-card').first();
  if (await firstCard.count()) {
    await firstCard.click().catch(() => {});
    await page.waitForTimeout(800);
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
  } catch (error) {
    entry.ok = false;
    entry.error = error instanceof Error ? error.message : String(error);
  } finally {
    await page.close();
  }
  return entry;
}

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const result = {
    generatedAt: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
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
