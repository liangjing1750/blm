const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

const LEGACY_NUMBERED_LIST_TEXT = `1. 仓库，点击出库预约管理列表页面中的【审核】按钮。
2. 系统，显示审核弹窗提示
3. 仓库
a. 点击提示中的【取消】按钮，系统关闭提示。
b. 选择审核结果，填写审核意见并点击提示中的【确定】按钮，系统进行审核前的检
查。
4. 系统，检查数据版本是否发生变化：数据版本已发生变化，则提示”数据已发生变化，请
刷新后重试“，客户点击提示中的【确定】按钮，系统关闭提示并刷新出库预约管理列
表，检查通过则继续
a. 审核通过：更新出库预约申请状态为“已通过”并提示“出库预约申请审核通过成功”。
b. 审核驳回：更新出库预约申请状态为“已驳回”并提示“出库预约申请审核驳回成功”。
3. 仓库，点击提示中的【确定】按钮，系统关闭提示并返回出库预约申请管理列表页面。`;

function buildRichTextDoc(name) {
  return {
    meta: { title: name, domain: name, author: 'tester', date: '2026-06-02' },
    roles: [{ id: 'R1', name: '用户', group: '业务参与方' }],
    language: [],
    stages: [],
    stageLinks: [],
    stageFlowRefs: [],
    stageFlowLinks: [],
    processes: [{
      id: 'P1',
      name: '富文本流程',
      nodes: [{
        id: 'T1',
        name: '填写资料',
        role_id: 'R1',
        role_ids: ['R1'],
        userSteps: [{ name: '填写备注', type: 'Fill', note: '' }],
        orchestrationTasks: [],
        businessRules: [{ id: 'BR1', name: '规则', content: '' }],
        forms: [],
        entity_ops: [],
      }],
      flow: { edges: [{ from: 'START', to: 'T1' }, { from: 'T1', to: 'END' }] },
    }],
    businessComponents: [],
    businessConstructs: [],
    taskDefinitions: [],
    entities: [],
    relations: [],
    rules: [],
  };
}

function buildPreviewRichTextDoc(name) {
  const doc = buildRichTextDoc(name);
  const richHtml = '<ol><li value="1"><strong>第一条</strong><ol><li value="1">二级说明</li></ol></li><li value="2">第二条</li></ol>';
  const node = doc.processes[0].nodes[0];
  node.userSteps[0].note = richHtml;
  node.orchestrationTasks = [{
    name: '复用任务',
    type: 'Query',
    querySourceKind: 'service',
    target: '目标服务',
    note: richHtml,
  }];
  node.businessRules[0].content = richHtml;
  return doc;
}

async function focusFirstProcessNode(page) {
  const task = page.locator('#proc-context-diagram .pf-task, #proc-diagram .pf-task, #proc-context-diagram .ps-task, #proc-diagram .ps-task').first();
  if (await task.isVisible().catch(() => false)) {
    await task.click();
  }
}

async function showFirstBusinessRuleEditor(page) {
  if (await page.getByTestId('process-switch-card').isVisible().catch(() => false)) {
    await page.getByTestId('process-switch-card').click();
  }
  if (await page.getByTestId('process-editor-open').isVisible().catch(() => false)) {
    await page.getByTestId('process-editor-open').click();
  }
  const contentEditVisible = await page.getByTestId('task-rule-content-edit').first().isVisible().catch(() => false);
  const contentEditorVisible = await page.getByTestId('task-rule-rich-text-editor').first().isVisible().catch(() => false);
  if (!contentEditVisible && !contentEditorVisible) {
    await focusFirstProcessNode(page);
  }
  if (await page.getByTestId('node-perspective-engineering').isVisible().catch(() => false)) {
    await page.getByTestId('node-perspective-engineering').click();
  }
  if (await page.getByTestId('task-rule-content-edit').first().isVisible().catch(() => false)) {
    await page.getByTestId('task-rule-content-edit').first().click();
  }
  const editor = page.getByTestId('task-rule-rich-text-editor').first();
  await expect(editor).toBeVisible();
  return editor;
}

test('rich text toolbar formats step notes and business rules', async ({ page, request }) => {
  const documentName = `rich-text-${Date.now()}`;
  await createDocument(request, documentName, buildRichTextDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await page.locator('#proc-context-diagram .pf-task, #proc-diagram .pf-task, #proc-context-diagram .ps-task, #proc-diagram .ps-task').first().click();
  await expect(page.getByTestId('user-steps-section')).toBeVisible();

  const firstStep = page.locator('.step-row[data-step-index="0"]');
  await firstStep.getByTestId('step-note-add').click();
  const stepEditor = firstStep.getByTestId('step-note-rich-text-editor');
  await stepEditor.fill('bold');
  await stepEditor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await firstStep.getByTestId('step-note-rich-text-bold').click();
  await expect(stepEditor.locator('strong,b')).toContainText('bold');
  await stepEditor.fill('line one\nline two');
  await stepEditor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await firstStep.getByTestId('step-note-rich-text-unordered').click();
  await expect(stepEditor.locator('ul li')).toHaveCount(2);
  await expect(stepEditor.locator('ul li').first()).toContainText('line one');
  await firstStep.getByTestId('step-note-save').click();
  await expect(firstStep.getByTestId('step-note-preview').locator('ul li').first()).toContainText('line one');

  const ruleEditor = await showFirstBusinessRuleEditor(page);
  await ruleEditor.fill('first\nsecond');
  await ruleEditor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.getByTestId('task-rule-rich-text-ordered').first().click();
  await expect(ruleEditor.locator('ol li')).toHaveCount(2);
  await expect(ruleEditor.locator('ol li').nth(1)).toContainText('second');
  await page.getByTestId('task-rule-content-save').first().click();
  await expect(page.getByTestId('task-rule-content-preview').first().locator('ol li')).toHaveCount(2);
});

test('rich text paste converts legacy numbered text into nested visual lists', async ({ page, request }) => {
  const documentName = `rich-text-paste-${Date.now()}`;
  await createDocument(request, documentName, buildRichTextDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await page.locator('#proc-context-diagram .pf-task, #proc-diagram .pf-task, #proc-context-diagram .ps-task, #proc-diagram .ps-task').first().click();

  const firstStep = page.locator('.step-row[data-step-index="0"]');
  await firstStep.getByTestId('step-note-add').click();
  const stepEditor = firstStep.getByTestId('step-note-rich-text-editor');
  await stepEditor.evaluate((node, text) => {
    node.innerHTML = '';
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    node.dispatchEvent(event);
  }, LEGACY_NUMBERED_LIST_TEXT);

  await expect(stepEditor.locator(':scope > ol > li')).toHaveCount(5);
  await expect(stepEditor.locator(':scope > ol > li').first()).toContainText('仓库，点击出库预约管理列表页面');
  await expect(stepEditor.locator(':scope > ol > li').first()).not.toContainText('1.');
  await expect(stepEditor.locator(':scope > ol > li').nth(2).locator(':scope > ol > li')).toHaveCount(2);
  await expect(stepEditor.locator(':scope > ol > li').nth(3).locator(':scope > ol > li')).toHaveCount(2);
  await expect(stepEditor.locator(':scope > ol > li').nth(3).locator(':scope > ol > li').first()).toContainText('审核通过');
  await expect(stepEditor.locator(':scope > ol > li').last()).toHaveAttribute('value', '3');

  const markerColor = await stepEditor.locator(':scope > ol > li').first().evaluate((el) => getComputedStyle(el, '::marker').color);
  expect(markerColor).toBe('rgb(37, 99, 235)');
  const nestedListType = await stepEditor.locator(':scope > ol > li').nth(2).locator(':scope > ol').evaluate((el) => getComputedStyle(el).listStyleType);
  expect(nestedListType).toBe('lower-alpha');
});

test('rich text shortcuts create lists without toolbar covering the first line', async ({ page, request }) => {
  const documentName = `rich-text-shortcuts-${Date.now()}`;
  await createDocument(request, documentName, buildRichTextDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await page.locator('#proc-context-diagram .pf-task, #proc-diagram .pf-task, #proc-context-diagram .ps-task, #proc-diagram .ps-task').first().click();

  const firstStep = page.locator('.step-row[data-step-index="0"]');
  await firstStep.getByTestId('step-note-add').click();
  const stepEditor = firstStep.getByTestId('step-note-rich-text-editor');
  const paddingTop = await stepEditor.evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingTop));
  expect(paddingTop).toBeGreaterThanOrEqual(32);

  await stepEditor.fill('tab item');
  await stepEditor.press('Tab');
  await expect(stepEditor.locator(':scope > ul > li')).toContainText('tab item');

  await stepEditor.evaluate((node) => { node.innerHTML = ''; });
  await stepEditor.fill('ordered item');
  await stepEditor.press(process.platform === 'darwin' ? 'Meta+1' : 'Control+1');
  await expect(stepEditor.locator(':scope > ol > li')).toContainText('ordered item');

  await stepEditor.evaluate((node) => { node.innerHTML = ''; });
  await stepEditor.fill('unordered item');
  await stepEditor.press(process.platform === 'darwin' ? 'Meta+0' : 'Control+0');
  await expect(stepEditor.locator(':scope > ul > li')).toContainText('unordered item');

  await stepEditor.evaluate((node) => {
    node.innerHTML = '<ol><li>一级</li><li>二级</li></ol>';
    node.focus();
    const target = node.querySelectorAll('li')[1];
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await stepEditor.press(process.platform === 'darwin' ? 'Meta+2' : 'Control+2');
  await expect(stepEditor.locator(':scope > ol > li > ol > li')).toContainText('二级');
  const nestedListType = await stepEditor.locator(':scope > ol > li > ol').evaluate((el) => getComputedStyle(el).listStyleType);
  expect(nestedListType).toBe('lower-alpha');
});

test('preview renders saved rich text consistently with editor display', async ({ page, request }) => {
  const documentName = `rich-text-preview-${Date.now()}`;
  await createDocument(request, documentName, buildPreviewRichTextDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-preview').click();
  await page.locator('#preview-outline .preview-outline-link', { hasText: '富文本流程' }).click();

  const richBlocks = page.locator('#preview-rendered .pv-rich-text');
  await expect(richBlocks.first()).toBeVisible();
  await expect(richBlocks).toHaveCount(3);
  await expect(richBlocks.nth(0).locator(':scope > ol > li')).toHaveCount(2);
  await expect(richBlocks.nth(0).locator('strong')).toContainText('第一条');
  await expect(richBlocks.nth(0).locator(':scope > ol > li > ol > li')).toContainText('二级说明');
  await expect(page.locator('#preview-rendered')).not.toContainText('<ol>');

  const markerColor = await richBlocks.nth(0).locator(':scope > ol > li').first().evaluate((el) => getComputedStyle(el, '::marker').color);
  expect(markerColor).toBe('rgb(37, 99, 235)');
  const nestedListType = await richBlocks.nth(0).locator(':scope > ol > li > ol').evaluate((el) => getComputedStyle(el).listStyleType);
  expect(nestedListType).toBe('lower-alpha');
});

test('business rule rich text is a draft until explicitly saved', async ({ page, request }) => {
  const documentName = `rich-text-rule-draft-${Date.now()}`;
  await createDocument(request, documentName, buildRichTextDoc(documentName));

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await page.locator('#proc-context-diagram .pf-task, #proc-diagram .pf-task, #proc-context-diagram .ps-task, #proc-diagram .ps-task').first().click();

  const draftHtml = '<ol><li value="1"><strong>draft rule line</strong><ol><li value="1">draft sub rule</li></ol></li></ol>';
  const ruleEditor = await showFirstBusinessRuleEditor(page);
  await ruleEditor.evaluate((node, html) => {
    node.innerHTML = html;
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, draftHtml);

  await page.getByTestId('tab-preview').click();
  await expect(page.locator('#preview-rendered')).not.toContainText('draft rule line');
  await expect(page.locator('#preview-rendered')).not.toContainText('draft sub rule');

  await page.getByTestId('tab-process').click();
  if (await page.getByTestId('process-switch-card').isVisible().catch(() => false)) {
    await page.getByTestId('process-switch-card').click();
  }
  if (await page.getByTestId('process-editor-open').isVisible().catch(() => false)) {
    await page.getByTestId('process-editor-open').click();
  }
  await page.locator('#proc-context-diagram .pf-task, #proc-diagram .pf-task, #proc-context-diagram .ps-task, #proc-diagram .ps-task').first().click();
  const savedRuleEditor = await showFirstBusinessRuleEditor(page);
  await savedRuleEditor.evaluate((node, html) => {
    node.innerHTML = html;
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, draftHtml);
  await page.getByTestId('task-rule-content-save').first().click();

  await page.getByTestId('tab-preview').click();
  const renderedRule = page.locator('#preview-rendered .pv-rule-table .pv-rich-text').first();
  await expect(renderedRule.locator('strong')).toContainText('draft rule line');
  await expect(renderedRule.locator(':scope > ol > li > ol > li')).toContainText('draft sub rule');
});
