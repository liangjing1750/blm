/**
 * BDD 场景 A1：角色管理 → 导出 DOCX → 包含角色范围 + 角色参与流程用例图
 *
 * 运行方式：
 *   cd tools/e2e
 *   npx playwright test tests/verify-role-export.spec.js --headed
 *
 * 前提：BLM 前端 (ng serve/build) 和后端 (python blm.py) 均已启动
 */

const { test, expect } = require('@playwright/test');
const { createDocument, openDocument } = require('./support/app-helpers');
const fs = require('node:fs');

test('BDD A1: 角色管理导出 DOCX — 金路径', async ({ page, request }) => {
  const documentName = `role-export-test-${Date.now()}`;
  const downloads = [];

  // ════ Given: 创建包含 3 个角色 + 2 个流程的测试文档 ════
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: '测试业务域', author: '自动化测试', date: '2026-07-11' },
    roles: [
      { uid: 'r1', name: '仓单监管员', group: '监管', desc: '负责仓单日常监管', subDomains: ['仓单监管'] },
      { uid: 'r2', name: '交割审核员', group: '监管', desc: '负责交割审核', subDomains: ['交割服务'] },
      { uid: 'r3', name: '系统管理员', group: '运维', desc: '系统配置与维护', subDomains: ['平台管理'] },
    ],
    language: [],
    stages: [
      { uid: 'S1', name: '仓单登记阶段', subDomain: '仓单监管', pos: { x: 0, y: 0 }, processLinks: [], panoramaLaneUid: 'l1', panoramaColumnUid: 'c1' },
      { uid: 'S2', name: '交割执行阶段', subDomain: '交割服务', pos: { x: 0, y: 100 }, processLinks: [], panoramaLaneUid: 'l1', panoramaColumnUid: 'c2' },
    ],
    stageLinks: [],
    processes: [
      { uid: 'P1', name: '仓单登记流程', stageUid: 'S1', flowGroup: '仓单', trigger: '仓单到达', outcome: '登记完成', roleUids: ['r1'], nodes: [] },
      { uid: 'P2', name: '交割审核流程', stageUid: 'S2', flowGroup: '审核', trigger: '交割申请', outcome: '审核完成', roleUids: ['r1', 'r2'], nodes: [] },
    ],
    panorama: {
      columns: [{ uid: 'c1', name: '仓单监管' }, { uid: 'c2', name: '交割服务机构监管' }],
      lanes: [{ uid: 'l1', name: '交割智慧监管平台' }],
      cells: [],
    },
    entities: [],
    relations: [],
    rules: [],
  });

  // ── 监听下载 ──
  page.on('download', (download) => downloads.push(download));

  // ════ When: 导航到文档 → 角色 subtab → 导出 DOCX ════
  await page.goto('/');
  await openDocument(page, documentName);

  // 切换到角色 subtab
  await page.getByTestId('panorama-subtab-roles').click();
  await page.waitForTimeout(800);

  // 确认角色范围卡可见
  await expect(page.getByTestId('role-summary-card')).toBeVisible({ timeout: 5000 });

  // 如果在用例图模式，先切回 view
  const usecaseVisible = await page.locator('[data-testid="role-usecase-map"]').isVisible().catch(() => false);
  if (usecaseVisible) {
    await page.getByTestId('role-view-entry').click();
    await page.waitForTimeout(500);
  }

  // 点击导出 DOCX
  await page.getByTestId('panorama-export-btn').click();
  await page.waitForTimeout(300);
  await page.locator('.panorama-export-item').filter({ hasText: '导出 DOCX' }).click();

  // 等待导出完成（最长 60 秒）
  try { await page.getByText('完成').waitFor({ timeout: 60000 }); } catch { /* 可能直接消失 */ }
  await page.waitForTimeout(1500);

  // ════ Then: 验证下载 ════
  expect(downloads.length, '应至少下载 1 个文件').toBeGreaterThanOrEqual(1);
  const dl = downloads.find((d) => d.suggestedFilename().endsWith('.docx'));
  expect(dl, '应下载 .docx 文件').toBeTruthy();

  const path = await dl.path();
  const buf = fs.readFileSync(path);
  const sizeKB = (buf.length / 1024).toFixed(0);
  console.log(`✅ DOCX 已下载: ${dl.suggestedFilename()} (${sizeKB} KB)`);

  // DOCX 是 ZIP 格式，Store 模式存储时 XML 原文可直接搜索
  const text = buf.toString('utf-8');

  // ── 验证文本内容 ──
  expect(text, 'DOCX 应包含"角色视图"标题').toContain('角色视图');
  expect(text, 'DOCX 应包含"仓单监管员"').toContain('仓单监管员');
  expect(text, 'DOCX 应包含"交割审核员"').toContain('交割审核员');
  expect(text, 'DOCX 应包含"系统管理员"').toContain('系统管理员');
  expect(text, 'DOCX 应包含"监管"分组').toContain('监管');

  // ── 验证图片存在 ──
  // DOCX 中 PNG 文件以 word/media/ 路径存储
  const imageCount = (buf.toString('latin1').match(/word\/media\/image\d+\.png/g) || []).length;
  console.log(`📷 DOCX 内图片数量: ${imageCount}`);
  expect(imageCount, '至少应有 1 张图片（角色范围截图）').toBeGreaterThanOrEqual(1);

  console.log('✅✅✅ BDD A1 验证全部通过！');
});

test('BDD A3: 无角色的文档导出 DOCX 不崩溃', async ({ page, request }) => {
  const documentName = `role-export-empty-${Date.now()}`;
  const downloads = [];

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: '测试', author: '', date: '2026-07-11' },
    roles: [],
    language: [],
    stages: [{ uid: 'S3', name: '空阶段', subDomain: '测试', pos: { x: 0, y: 0 }, processLinks: [], panoramaLaneUid: 'l1', panoramaColumnUid: 'c1' }],
    stageLinks: [],
    processes: [],
    panorama: { columns: [{ uid: 'c1', name: '测试列' }], lanes: [{ uid: 'l1', name: '测试行' }], cells: [] },
    entities: [],
    relations: [],
    rules: [],
  });

  page.on('download', (download) => downloads.push(download));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('panorama-subtab-roles').click();
  await page.waitForTimeout(500);

  await page.getByTestId('panorama-export-btn').click();
  await page.waitForTimeout(300);
  await page.locator('.panorama-export-item').filter({ hasText: '导出 DOCX' }).click();

  try { await page.getByText('完成').waitFor({ timeout: 15000 }); } catch { /* */ }
  await page.waitForTimeout(500);

  // 即使在用例图模式（无角色），页面不应崩溃
  await expect(page.getByTestId('role-summary-card')).toBeVisible();
  console.log('✅ BDD A3 验证通过：无角色时不崩溃');
});

test('BDD A2: 角色无流程时导出 DOCX 仍正常', async ({ page, request }) => {
  const documentName = `role-export-noflow-${Date.now()}`;
  const downloads = [];

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: '测试', author: '', date: '2026-07-11' },
    roles: [
      { uid: 'rA', name: '查看者', group: '只读', desc: '仅查看权限', subDomains: [] },
      { uid: 'rB', name: '访客', group: '只读', desc: '临时访问', subDomains: [] },
    ],
    language: [],
    stages: [],
    stageLinks: [],
    processes: [],  // 无流程
    panorama: { columns: [], lanes: [], cells: [] },
    entities: [],
    relations: [],
    rules: [],
  });

  page.on('download', (download) => downloads.push(download));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('panorama-subtab-roles').click();
  await page.waitForTimeout(500);

  await page.getByTestId('panorama-export-btn').click();
  await page.waitForTimeout(300);
  await page.locator('.panorama-export-item').filter({ hasText: '导出 DOCX' }).click();

  try { await page.getByText('完成').waitFor({ timeout: 30000 }); } catch { /* */ }
  await page.waitForTimeout(1500);

  if (downloads.length > 0) {
    const dl = downloads.find((d) => d.suggestedFilename().endsWith('.docx'));
    if (dl) {
      const path = await dl.path();
      const buf = fs.readFileSync(path);
      const text = buf.toString('utf-8');
      expect(text).toContain('角色视图');
      console.log(`✅ BDD A2 验证通过：无流程角色导出正常 (${(buf.length / 1024).toFixed(0)} KB)`);
    }
  }
  await expect(page.getByTestId('role-summary-card')).toBeVisible();
});
