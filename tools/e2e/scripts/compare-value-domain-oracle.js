const fs = require('node:fs');
const path = require('node:path');

// 模块意图：比较两次视觉 Oracle 采集结果，把“看起来不像”转成可修改的样式差异清单。
const [, , expectedDirArg, actualDirArg] = process.argv;

if (!expectedDirArg || !actualDirArg) {
  console.error('Usage: node scripts/compare-value-domain-oracle.js <expected-dir> <actual-dir>');
  process.exit(1);
}

const expectedDir = path.resolve(expectedDirArg);
const actualDir = path.resolve(actualDirArg);
const states = ['view', 'edit', 'dialog'];
const importantProperties = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'padding',
  'margin',
  'border',
  'borderRadius',
  'backgroundColor',
  'color',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'boxShadow',
  'gap',
  'gridTemplateColumns',
];

const report = {
  expectedDir,
  actualDir,
  generatedAt: new Date().toISOString(),
  states: {},
};

for (const state of states) {
  report.states[state] = compareState(state);
}

const outputFile = path.join(actualDir, `compare-against-${path.basename(expectedDir)}.json`);
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Value-domain visual comparison written to ${outputFile}`);
printSummary(report);

function compareState(state) {
  const expectedFile = path.join(expectedDir, `${state}.styles.json`);
  const actualFile = path.join(actualDir, `${state}.styles.json`);
  if (!fs.existsSync(expectedFile) || !fs.existsSync(actualFile)) {
    return {
      compared: false,
      reason: `Missing ${state}.styles.json`,
      expectedFile,
      actualFile,
    };
  }

  const expected = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
  const actual = JSON.parse(fs.readFileSync(actualFile, 'utf8'));
  const actualByName = new Map(actual.map((item) => [item.name, item]));
  const entries = [];

  for (const expectedEntry of expected) {
    const actualEntry = actualByName.get(expectedEntry.name);
    if (!actualEntry) {
      entries.push({ name: expectedEntry.name, missing: 'actual' });
      continue;
    }
    entries.push(compareEntry(expectedEntry, actualEntry));
  }

  return {
    compared: true,
    screenshotPairs: {
      expected: path.join(expectedDir, `${state}.png`),
      actual: path.join(actualDir, `${state}.png`),
      expectedFull: path.join(expectedDir, `${state}.full.png`),
      actualFull: path.join(actualDir, `${state}.full.png`),
    },
    entries,
  };
}

function compareEntry(expected, actual) {
  const rectDiff = diffRect(expected.rect, actual.rect);
  const styleDiffs = [];

  for (const property of importantProperties) {
    const expectedValue = expected.styles?.[property] ?? '';
    const actualValue = actual.styles?.[property] ?? '';
    if (expectedValue !== actualValue) {
      styleDiffs.push({
        property,
        expected: expectedValue,
        actual: actualValue,
      });
    }
  }

  // 关键流程：报告保留 className/text 片段，方便确认比较的是同一类元素，而不是选择器抓错。
  return {
    name: expected.name,
    selector: expected.selector,
    found: Boolean(expected.found && actual.found),
    expectedClassName: expected.className,
    actualClassName: actual.className,
    expectedText: expected.text,
    actualText: actual.text,
    rectDiff,
    styleDiffs,
  };
}

function diffRect(expected = {}, actual = {}) {
  const keys = ['x', 'y', 'width', 'height'];
  const diff = {};
  for (const key of keys) {
    const expectedValue = Number(expected[key] || 0);
    const actualValue = Number(actual[key] || 0);
    const delta = actualValue - expectedValue;
    if (delta !== 0) {
      diff[key] = { expected: expectedValue, actual: actualValue, delta };
    }
  }
  return diff;
}

function printSummary(data) {
  // 边界细节：控制台只打印摘要，完整差异放 JSON，避免大段输出淹没真正有用的信息。
  for (const [state, stateReport] of Object.entries(data.states)) {
    if (!stateReport.compared) {
      console.log(`${state}: skipped - ${stateReport.reason}`);
      continue;
    }
    const changedEntries = stateReport.entries.filter((entry) => (
      Object.keys(entry.rectDiff || {}).length || (entry.styleDiffs || []).length
    ));
    const styleDiffCount = changedEntries.reduce((total, entry) => total + (entry.styleDiffs || []).length, 0);
    console.log(`${state}: ${changedEntries.length} changed elements, ${styleDiffCount} style diffs`);
  }
}
