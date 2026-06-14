const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const outDir = path.join(repoRoot, 'tools', 'e2e', '.tmp', 'visual-process-flow');
const port = 8901;
const documentName = `flow-visual-${Date.now()}`;

function buildDocument(options = {}) {
  const taskDefinitions = [
    { id: 'TD1', uid: 'TD1', name: '提交申请接口', target: 'POST /applications', address: '/api/applications' },
    { id: 'TD2', uid: 'TD2', name: '资料预审接口', target: 'POST /review/precheck', address: '/api/review/precheck' },
  ];
  const tasks = [
    {
      id: 'T1',
      uid: 'T1',
      name: '提交申请',
      role: '业务人员',
      description: '录入基础信息并提交申请',
      userSteps: [
        { id: 'US1', uid: 'US1', name: '填写客户资料', note: '', type: 'input' },
        { id: 'US2', uid: 'US2', name: '上传证明材料', note: '', type: 'upload' },
        { id: 'US3', uid: 'US3', name: '提交申请', note: '', type: 'submit' },
      ],
      forms: [{ id: 'F1', uid: 'F1', name: '开户申请表', fields: [{ id: 'FF1', uid: 'FF1', name: '客户名称', type: 'text', required: true }] }],
      entity_ops: [{ entity_id: 'E1', ops: ['C', 'R'] }],
      orchestrationTasks: [taskDefinitions[0]],
      businessRules: ['客户名称不能为空'],
    },
    {
      id: 'T2',
      uid: 'T2',
      name: '资料预审',
      role: '审核人员',
      description: '检查材料完整性',
      userSteps: [
        { id: 'US4', uid: 'US4', name: '核对资料完整性', note: '', type: 'check' },
        { id: 'US5', uid: 'US5', name: '标记预审结论', note: '', type: 'check' },
      ],
      forms: [{ id: 'F2', uid: 'F2', name: '预审记录表', fields: [{ id: 'FF2', uid: 'FF2', name: '预审结论', type: 'select', required: true }] }],
      entity_ops: [{ entity_id: 'E1', ops: ['R', 'U'] }],
      orchestrationTasks: [taskDefinitions[1]],
      businessRules: ['资料缺失时退回补充'],
    },
    { id: 'T3', uid: 'T3', name: '业务审核', role: '业务主管', description: '确认业务条件', userSteps: [{ id: 'US6', uid: 'US6', name: '确认业务条件', note: '', type: 'check' }], forms: [], businessRules: [] },
    { id: 'T4', uid: 'T4', name: '结果通知', role: '系统角色', description: '通知客户办理结果', userSteps: [{ id: 'US7', uid: 'US7', name: '发送办理结果', note: '', type: 'notify' }], forms: [], businessRules: [] },
  ];
  if (options.large) {
    for (let index = 5; index <= 16; index += 1) {
      tasks.push({
        id: `T${index}`,
        uid: `T${index}`,
        name: `流程节点${index}`,
        role: `办理角色${(index % 6) + 1}`,
        description: `用于验证横纵滚动的节点${index}`,
        userSteps: Array.from({ length: 5 }, (_, stepIndex) => ({
          id: `US${index}-${stepIndex + 1}`,
          uid: `US${index}-${stepIndex + 1}`,
          name: `步骤${index}-${stepIndex + 1}`,
          note: '',
          type: 'check',
        })),
        forms: [{
          id: `F${index}`,
          uid: `F${index}`,
          name: `表单${index}`,
          fields: Array.from({ length: 4 }, (_, fieldIndex) => ({
            id: `FF${index}-${fieldIndex + 1}`,
            uid: `FF${index}-${fieldIndex + 1}`,
            name: `字段${fieldIndex + 1}`,
            type: fieldIndex % 2 ? 'number' : 'text',
            required: fieldIndex === 0,
          })),
        }],
        entity_ops: [{ entity_id: index % 2 ? 'E1' : 'E2', ops: ['C', 'R', 'U'] }],
        orchestrationTasks: [{ id: `TD${index}`, uid: `TD${index}`, name: `接口${index}`, target: `POST /large/${index}`, address: `/api/large/${index}` }],
        businessRules: Array.from({ length: 3 }, (_, ruleIndex) => `规则${index}-${ruleIndex + 1}`),
      });
    }
  }
  const edges = [
    { id: 'L1', uid: 'L1', from: 'START', to: 'T1', label: '' },
    { id: 'L2', uid: 'L2', from: 'T1', to: 'B1', label: '提交后' },
    { id: 'L3', uid: 'L3', from: 'B1', to: 'T2', label: '完整' },
    { id: 'L4', uid: 'L4', from: 'T2', to: 'T3', label: '通过' },
    { id: 'L5', uid: 'L5', from: 'T3', to: 'T4', label: '' },
  ];
  if (options.large) {
    for (let index = 4; index < tasks.length; index += 1) {
      edges.push({ id: `L${index + 2}`, uid: `L${index + 2}`, from: `T${index}`, to: `T${index + 1}`, label: '' });
    }
  }
  edges.push({ id: `L${edges.length + 1}`, uid: `L${edges.length + 1}`, from: tasks[tasks.length - 1].id, to: 'END', label: '' });
  return {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-06-13' },
    roles: [
      { id: 'R1', uid: 'R1', name: '业务人员', group: '业务参与方' },
      { id: 'R2', uid: 'R2', name: '审核人员', group: '监督与审核方' },
      { id: 'R3', uid: 'R3', name: '业务主管', group: '监督与审核方' },
      { id: 'R4', uid: 'R4', name: '系统角色', group: '系统角色' },
    ],
    language: [],
    rules: [],
    panorama: {
      columns: [{ id: 'value-a', uid: 'value-a', name: '开户注册', badge: '价值流', scope: '客户开户注册' }],
      lanes: [{ id: 'domain-a', uid: 'domain-a', name: '会员管理', badge: '业务系统', note: '会员管理业务域' }],
      cells: [],
      strategy: { vision: '', values: '', goals: '' },
    },
    stages: [{ id: 'S1', uid: 'S1', name: '开户准备', subDomain: '会员管理', panoramaColumnUid: 'value-a', panoramaLaneUid: 'domain-a' }],
    stageFlowRefs: [{ id: 'SFR1', uid: 'SFR1', stageId: 'S1', stageUid: 'S1', processId: 'P1', processUid: 'P1', order: 1 }],
    stageFlowLinks: [],
    processes: [{
      id: 'P1',
      uid: 'P1',
      name: '会员开户注册',
      subDomain: '会员管理',
      flowGroup: '开户组',
      trigger: '客户发起申请',
      outcome: '完成会员开户',
      nodes: tasks,
      flow: {
        version: 2,
        orientation: 'horizontal',
        nodes: [{ id: 'B1', uid: 'B1', kind: 'gateway', gatewayType: 'exclusive', title: '资料是否完整', role_id: 'R2' }],
        edges,
      },
    }],
    entities: [{ id: 'E1', uid: 'E1', name: '客户' }, { id: 'E2', uid: 'E2', name: '申请单' }],
    relations: [],
    components: [],
    taskDefinitions,
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

async function openDocument(page, doc = buildDocument(), name = documentName) {
  const baseURL = `http://127.0.0.1:${port}`;
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.App && window.S, null, { timeout: 15000 });
  await loadDocument(page, doc, name);
  await page.getByTestId('tab-processWorkbench').click();
}

async function loadDocument(page, doc, name) {
  await page.evaluate(({ doc, name }) => {
    setActiveDocumentSession(doc, { fileName: name, domain: name });
  }, { doc, name });
}

async function collect(page, name, selector) {
  const prefix = path.join(outDir, name);
  // Capture hygiene: native select popups and focused controls can remain painted
  // for one frame after tab switching, so force-close them before taking the
  // Oracle screenshots used for visual equivalence decisions.
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${prefix}-page.png`, fullPage: true });
  await page.locator(selector).screenshot({ path: `${prefix}-view.png` });
  const styles = await page.evaluate(() => {
    const selectors = [
      '.proc-view-toolbar',
      '.process-flow-view',
      '[data-testid="process-flow-canvas-shell"]',
      '[data-testid="process-flow-canvas"]',
      '[data-testid="process-flow-attachment-panel"]',
      '.process-flow-card',
      '.process-flow-head',
      '.process-flow-actions',
      '.proc-drawer',
      '.drawer-head',
      '.drawer-body',
      '.form-section',
      '.process-editor-main-diag',
      '[data-testid="process-flow-node"]',
      '[data-testid="process-editor-node"]',
      '[data-testid="process-editor-graph"]',
      '[data-testid="process-editor-graph-node"]',
      '[data-testid="process-editor-graph"] .ps-wrap',
      '[data-testid="process-editor-graph"] .ps-task',
      '[data-testid="process-editor-node"]',
      '[data-testid="process-editor-graph"] .ps-link',
      '[data-testid="process-editor-graph"].live-diagram',
      '.process-editor-edges',
      '.process-editor-edge',
      '[data-testid="process-flow-node-row"]',
      '[data-testid="process-user-step-row"]',
      '[data-testid="process-form-card"]',
      '[data-testid="process-task-definition-row"]',
    ];
    const pick = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent.trim().slice(0, 120),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scroll: {
          width: element.scrollWidth,
          height: element.scrollHeight,
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
        },
        display: style.display,
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
    return Object.fromEntries(selectors.map((item) => [item, [...document.querySelectorAll(item)].slice(0, 8).map(pick)]));
  });
  const data = await page.evaluate(() => {
    const process = window.S?.doc?.processes?.[0] || null;
    const task = process?.nodes?.[0] || null;
    return {
      procView: window.S?.ui?.procView,
      procId: window.S?.ui?.procId,
      taskId: window.S?.ui?.taskId,
      process: process ? { name: process.name, trigger: process.trigger, outcome: process.outcome, nodeCount: process.nodes?.length || 0 } : null,
      flow: process?.flow || null,
      task: task ? {
        name: task.name,
        role: task.role,
        userSteps: task.userSteps || [],
        forms: task.forms || [],
        entity_ops: task.entity_ops || [],
        orchestrationTasks: task.orchestrationTasks || [],
        businessRules: task.businessRules || [],
      } : null,
    };
  });
  fs.writeFileSync(`${prefix}-styles.json`, JSON.stringify(styles, null, 2), 'utf8');
  fs.writeFileSync(`${prefix}-data.json`, JSON.stringify(data, null, 2), 'utf8');
}

async function writeDebugState(page, name) {
  const state = await page.evaluate(() => ({
    procView: window.S?.ui?.procView,
    procId: window.S?.ui?.procId,
    taskId: window.S?.ui?.taskId,
    hasShell: Boolean(document.querySelector('[data-testid="process-workbench-angular"]')),
    hasFlow: Boolean(document.querySelector('[data-testid="process-flow-view"]')),
    hasEditor: Boolean(document.querySelector('[data-testid="process-editor-workbench"]')),
    openButtons: document.querySelectorAll('[data-testid="process-editor-open"]').length,
    text: document.getElementById('tab-content')?.innerText?.slice(0, 1000),
  }));
  fs.writeFileSync(path.join(outDir, `${name}-debug.json`), JSON.stringify(state, null, 2), 'utf8');
}

async function forceMountAngularProcessShell(page) {
  await page.evaluate(() => {
    const tabContent = document.querySelector('#tab-content');
    if (!tabContent) return;
    tabContent.innerHTML = '<div id="process-workbench-angular-host" data-testid="process-workbench-angular-host"></div>';
    if (window.BlmAngularMounts?.mountProcessWorkbenchShell) {
      window.BlmAngularMounts.mountProcessWorkbenchShell('process-workbench-angular-host');
    }
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function firstStyle(styles, selector) {
  return styles[selector]?.[0] || null;
}

function rectDelta(left, right) {
  if (!left || !right) return null;
  return {
    dx: Math.round((right.rect.x - left.rect.x) * 10) / 10,
    dy: Math.round((right.rect.y - left.rect.y) * 10) / 10,
    dw: Math.round((right.rect.width - left.rect.width) * 10) / 10,
    dh: Math.round((right.rect.height - left.rect.height) * 10) / 10,
    left: left.rect,
    right: right.rect,
  };
}

function imageBytes(name) {
  const file = path.join(outDir, `${name}-view.png`);
  return fs.existsSync(file) ? fs.statSync(file).size : 0;
}

function writeComparisonSummary() {
  const legacy = readJson(path.join(outDir, 'legacy-editor-process-styles.json'));
  const angular = readJson(path.join(outDir, 'angular-editor-process-styles.json'));
  const legacyLarge = readJson(path.join(outDir, 'legacy-editor-large-process-styles.json'));
  const angularLarge = readJson(path.join(outDir, 'angular-editor-large-process-styles.json'));
  const angularMain = firstStyle(angular, '.process-editor-main-diag');
  const angularLargeMain = firstStyle(angularLarge, '.process-editor-main-diag');
  const angularGraph = firstStyle(angular, '[data-testid="process-editor-graph"] .ps-wrap')
    || firstStyle(angular, '[data-testid="process-editor-graph"]');
  const angularLargeGraph = firstStyle(angularLarge, '[data-testid="process-editor-graph"] .ps-wrap')
    || firstStyle(angularLarge, '[data-testid="process-editor-graph"]');
  const summary = {
    screenshots: {
      legacyEditor: imageBytes('legacy-editor-process'),
      angularEditor: imageBytes('angular-editor-process'),
      legacyLargeEditor: imageBytes('legacy-editor-large-process'),
      angularLargeEditor: imageBytes('angular-editor-large-process'),
    },
    editorRectDeltas: {
      flowView: rectDelta(firstStyle(legacy, '.process-flow-view'), firstStyle(angular, '.process-flow-view')),
      flowCard: rectDelta(firstStyle(legacy, '.process-flow-card'), firstStyle(angular, '.process-flow-card')),
      flowHead: rectDelta(firstStyle(legacy, '.process-flow-head'), firstStyle(angular, '.process-flow-head')),
      drawer: rectDelta(firstStyle(legacy, '.proc-drawer'), firstStyle(angular, '.proc-drawer')),
      drawerBody: rectDelta(firstStyle(legacy, '.drawer-body'), firstStyle(angular, '.drawer-body')),
    },
    angularEditorGraph: {
      nodesSampled: (angular['[data-testid="process-editor-graph"] .ps-task']?.length || 0)
        + (angular['[data-testid="process-editor-node"]']?.length || 0),
      edgesSampled: (angular['[data-testid="process-editor-graph"] .ps-link']?.length || 0)
        + (angular['.process-editor-edge']?.length || 0),
      mainScroll: angularMain?.scroll || null,
      graphScroll: angularGraph?.scroll || null,
      mainOverflow: angularMain?.overflow || null,
    },
    angularLargeEditorGraph: {
      nodesSampled: (angularLarge['[data-testid="process-editor-graph"] .ps-task']?.length || 0)
        + (angularLarge['[data-testid="process-editor-node"]']?.length || 0),
      edgesSampled: (angularLarge['[data-testid="process-editor-graph"] .ps-link']?.length || 0)
        + (angularLarge['.process-editor-edge']?.length || 0),
      mainScroll: angularLargeMain?.scroll || null,
      graphScroll: angularLargeGraph?.scroll || null,
      mainOverflow: angularLargeMain?.overflow || null,
      horizontalOverflow: Boolean(
        angularLargeGraph && angularLargeGraph.scroll.width > angularLargeGraph.scroll.clientWidth,
      ),
      verticalOverflow: Boolean(
        angularLargeGraph && angularLargeGraph.scroll.height > angularLargeMain.scroll.clientHeight,
      ),
    },
  };
  fs.writeFileSync(path.join(outDir, 'comparison-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
}

(async () => {
  const server = startServer();
  try {
    await waitForServer();
    const browser = await chromium.launch({ headless: true });
    try {
      const baseURL = `http://127.0.0.1:${port}`;
      const context = await browser.newContext({
        viewport: { width: 1520, height: 860 },
        storageState: {
          cookies: [],
          origins: [{
            origin: baseURL,
            localStorage: [{ name: 'blm.user.profile', value: JSON.stringify({ id: 'visual-user', name: '视觉对比' }) }],
          }],
        },
      });
      const page = await context.newPage();
      await openDocument(page);

      await page.getByTestId('process-switch-flow-legacy').click();
      await page.waitForSelector('[data-testid="process-flow-view"]', { timeout: 15000 });
      await collect(page, 'legacy-view', '[data-testid="process-flow-view"]');

      await page.getByTestId('process-switch-card').click();
      await page.waitForSelector('[data-testid="process-workbench-angular"] [data-testid="process-flow-view"]', { timeout: 15000 });
      await collect(page, 'angular-view', '[data-testid="process-flow-view"]');

      await page.evaluate(() => openProcessEditorLegacy('P1', null));
      await page.waitForSelector('.proc-drawer.open', { timeout: 15000 });
      await collect(page, 'legacy-editor-process', '#tab-content');

      await openDocument(page, buildDocument(), documentName);
      await page.getByTestId('process-switch-card').click();
      await page.waitForSelector('[data-testid="process-workbench-angular"] [data-testid="process-flow-view"]', { timeout: 15000 });
      await page.getByTestId('process-switch-node').click();
      await writeDebugState(page, 'angular-editor-process-before-wait');
      await page.waitForSelector('[data-testid="process-workbench-angular"] [data-testid="process-editor-workbench"]', { timeout: 15000 });
      await collect(page, 'angular-editor-process', '#tab-content');

      await page.waitForSelector('[data-testid="process-task-lite-panel"]', { timeout: 15000 });
      await collect(page, 'angular-editor-task', '#tab-content');

      await loadDocument(page, buildDocument({ large: true }), `${documentName}-large`);
      await page.getByTestId('tab-processWorkbench').click();
      await page.evaluate(() => openProcessEditorLegacy('P1', null));
      await page.waitForSelector('.proc-drawer.open', { timeout: 15000 });
      await collect(page, 'legacy-editor-large-process', '#tab-content');

      await openDocument(page, buildDocument({ large: true }), `${documentName}-large`);
      await page.getByTestId('process-switch-card').click();
      await page.waitForSelector('[data-testid="process-workbench-angular"] [data-testid="process-flow-view"]', { timeout: 15000 });
      await page.getByTestId('process-switch-node').click();
      await page.waitForSelector('[data-testid="process-workbench-angular"] [data-testid="process-editor-workbench"]', { timeout: 15000 });
      await collect(page, 'angular-editor-large-process', '#tab-content');

      await context.close();
    } finally {
      await browser.close();
    }
    writeComparisonSummary();
    console.log(`process flow comparison exported to ${outDir}`);
  } finally {
    stopServer(server);
  }
})();
