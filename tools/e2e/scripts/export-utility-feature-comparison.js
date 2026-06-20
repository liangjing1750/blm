const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const LEGACY_URL = process.env.BLM_LEGACY_URL || 'http://127.0.0.1:8086';
const ANGULAR_URL = process.env.BLM_ANGULAR_URL || 'http://127.0.0.1:8081';
const OUT = path.resolve(__dirname, '../artifacts/utility-feature-comparison.json');

const SELECTORS = [
  '#history-modal-overlay .history-modal-shell',
  '.history-modal-shell',
  '#history-list',
  '.history-list',
  '.history-tab',
  '.history-section-title',
  '.recovery-item',
  '.manual-wrap',
  '.manual-nav',
  '.manual-reader',
  '.manual-article',
  '.feedback-hero',
  '.feedback-workbench',
  '.feedback-left',
  '.feedback-main',
  '.feedback-detail',
  '.fb-tile',
];

async function collect(url, label) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const entry = { label, ok: true, selectors: {}, error: '' };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(600);
    entry.selectors = await page.evaluate((selectors) => {
      const pick = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
          rect: {
            x: Math.round(rect.x * 100) / 100,
            y: Math.round(rect.y * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
          },
          style: {
            display: style.display,
            gridTemplateColumns: style.gridTemplateColumns,
            overflow: style.overflow,
            overflowY: style.overflowY,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            padding: style.padding,
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
    legacy: {
      manual: await collect(`${LEGACY_URL}/manual`, 'legacy-manual'),
      feedback: await collect(`${LEGACY_URL}/feedback`, 'legacy-feedback'),
    },
    angular: {
      manual: await collect(`${ANGULAR_URL}/manual`, 'angular-manual'),
      feedback: await collect(`${ANGULAR_URL}/feedback`, 'angular-feedback'),
    },
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
