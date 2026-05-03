const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const toolDir = path.resolve(__dirname, '..');
const workspaceDir = path.join(toolDir, '.tmp', 'doc-screenshots-workspace');
const screenshotDir = path.join(repoRoot, 'docs', 'screenshots');
const port = '8898';
const baseUrl = `http://127.0.0.1:${port}`;

function buildDocument(name, { processName, entityName, relationLabel }) {
  return {
    meta: {
      title: name,
      domain: name,
      author: 'BLM',
      date: '2026-04-21',
    },
    roles: [
      {
        id: 'R1',
        name: '馆员',
        desc: '',
        group: '业务参与方',
        subDomains: ['图书馆借阅管理'],
      },
    ],
    language: [
      {
        term: '借阅',
        definition: '读者借出馆藏图书的业务动作',
      },
      {
        term: '归还',
        definition: '读者将馆藏图书归还至图书馆',
      },
    ],
    processes: [
      {
        id: 'P1',
        name: processName,
        trigger: '读者发起请求',
        outcome: '完成借阅或归还处理',
        tasks: [
          {
            id: 'T1',
            name: '处理馆藏',
            role_id: 'R1',
            role: '馆员',
            repeatable: false,
            rules_note: '必须先核对读者资格与馆藏状态',
            steps: [
              {
                name: '核对借阅信息',
                type: 'Fill',
                note: '登记读者、馆藏条码和业务状态',
              },
            ],
            entity_ops: [
              {
                entity_id: 'E1',
                ops: ['C', 'R'],
              },
            ],
          },
        ],
      },
    ],
    entities: [
      {
        id: 'E1',
        name: entityName,
        group: '图书馆借阅管理',
        note: '',
        fields: [
          {
            name: '记录编号',
            type: 'id',
            is_key: true,
            is_status: false,
            state_values: '',
            note: '',
          },
          {
            name: '状态',
            type: 'enum',
            is_key: false,
            is_status: true,
            state_values: '草稿/处理中/已完成',
            note: '业务主状态',
          },
        ],
        state_transitions: [
          {
            from: '草稿',
            to: '处理中',
            action: '提交处理',
            note: '进入馆员处理阶段',
            field_name: '状态',
          },
        ],
      },
    ],
    relations: [
      {
        from: 'E1',
        to: 'E1',
        type: 'reference',
        label: relationLabel,
      },
    ],
    rules: [
      {
        id: 'RULE-1',
        name: '馆藏状态校验',
        type: 'check',
        applies_to: 'P1',
        description: '只有可借馆藏才能进入借阅流程',
        formula: '',
      },
    ],
  };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/files`);
      if (response.ok) return;
    } catch (_) {
      // wait until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('等待 BLM 服务启动超时');
}

async function createDocument(name, document) {
  const response = await fetch(`${baseUrl}/api/save/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  });
  if (!response.ok) {
    throw new Error(`创建文档失败: ${name}`);
  }
}

async function ensureWorkspace() {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function captureScreenshots() {
  await ensureWorkspace();

  const serverProcess = spawn('python', ['blm.py'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BLM_PORT: port,
      BLM_NO_BROWSER: '1',
      BLM_WORKSPACE_DIR: workspaceDir,
    },
    stdio: 'ignore',
  });

  try {
    await waitForServer();

    await createDocument(
      '图书馆借阅管理-v1',
      buildDocument('图书馆借阅管理-v1', {
        processName: '借阅流程',
        entityName: '借阅记录',
        relationLabel: '关联借阅',
      }),
    );
    await createDocument(
      '图书馆借阅管理-v2',
      buildDocument('图书馆借阅管理-v2', {
        processName: '归还流程',
        entityName: '归还记录',
        relationLabel: '关联归还',
      }),
    );

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });

    await page.goto(baseUrl);
    await page.getByTestId('toolbar-open-button').click();
    await page.locator('.open-modal-shell').screenshot({
      path: path.join(screenshotDir, '05_open_dialog.png'),
    });

    await page.locator('.file-list-item').filter({ hasText: '图书馆借阅管理-v1' }).first().click();
    await page.screenshot({
      path: path.join(screenshotDir, '06_workspace_editor.png'),
      fullPage: true,
    });

    await page.getByTestId('toolbar-merge-button').click();
    await page.locator('.merge-modal').screenshot({
      path: path.join(screenshotDir, '07_merge_dialog.png'),
    });

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByTestId('merge-confirm-button').click();
    await page.getByTestId('merge-modal').waitFor({ state: 'hidden' });
    await page.screenshot({
      path: path.join(screenshotDir, '08_merge_result.png'),
      fullPage: true,
    });

    await page.goto(baseUrl);
    await page.getByTestId('toolbar-manual-button').click();
    await page.getByTestId('manual-title').waitFor();
    await page.locator('.manual-outline-toggle').first().click();
    await page.locator('#tab-content').screenshot({
      path: path.join(screenshotDir, '09_manual_tab.png'),
    });

    await browser.close();
  } finally {
    serverProcess.kill();
    await Promise.race([
      new Promise((resolve) => serverProcess.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
}

captureScreenshots().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
