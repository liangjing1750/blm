const { test, expect } = require('@playwright/test');

const {
  acceptAppDialog,
  cancelAppDialog,
  createDocument,
  openDocument,
} = require('./support/app-helpers');

function buildProcessEditorDoc(name) {
  return {
    meta: {
      title: name,
      domain: name,
      author: '',
      date: '2026-04',
    },
    roles: [
      { id: 'R1', name: '用户', desc: '' },
      { id: 'R2', name: '审核员', desc: '' },
      { id: 'R3', name: '运营专员', desc: '' },
    ],
    language: [],
    processes: [
      {
        id: 'P1',
        name: '统一登录',
        subDomain: '用户管理',
        flowGroup: '',
        trigger: '',
        outcome: '',
        tasks: [
          {
            id: 'T1',
            name: '登录校验',
            role_id: 'R1',
            steps: [
              { name: '选择认证方式', type: 'Query', note: '展示认证入口' },
              { name: '输入账号密码', type: 'Input', note: '录入登录凭证' },
            ],
            orchestrationTasks: [
              { taskDefinitionId: 'TD1', constructId: 'BC1', businessConstructId: 'BC1', name: '校验账号状态', type: 'Check', querySourceKind: '', target: '认证服务', note: '冻结账号不可继续' },
              { taskDefinitionId: 'TD3', constructId: 'BC1', businessConstructId: 'BC1', name: '生成登录会话', type: 'Service', querySourceKind: '', target: '会话服务', note: '写入登录态' },
            ],
          },
          {
            id: 'T2',
            name: '生成首页上下文',
            role_id: 'R1',
            steps: [
              { name: '查看工作台', type: 'View', note: '进入首页后展示默认工作台' },
            ],
            orchestrationTasks: [
              { taskDefinitionId: 'TD2', constructId: 'BC1', businessConstructId: 'BC1', name: '加载首页菜单', type: 'Query', querySourceKind: 'QueryService', target: '门户服务', note: '返回角色菜单和快捷入口' },
            ],
          },
        ],
      },
    ],
    capabilityUnits: [
      { id: 'CU1', name: '用户管理', kind: 'core', constructIds: ['BC1'], taskDefinitionIds: ['TD1', 'TD2', 'TD3'], entityIds: [] },
    ],
    businessConstructs: [
      { id: 'BC1', name: '统一登录', capabilityUnitId: 'CU1', capabilityUnit: '用户管理', taskDefinitionIds: ['TD1', 'TD2', 'TD3'], entityIds: [] },
    ],
    taskDefinitions: [
      { id: 'TD1', name: '校验账号状态', type: 'Check', target: '认证服务', note: '冻结账号不可继续', capabilityUnitId: 'CU1', capabilityUnit: '用户管理', constructId: 'BC1', constructName: '统一登录' },
      { id: 'TD2', name: '加载首页菜单', type: 'Query', querySourceKind: 'QueryService', target: '门户服务', note: '返回角色菜单和快捷入口', capabilityUnitId: 'CU1', capabilityUnit: '用户管理', constructId: 'BC1', constructName: '统一登录' },
      { id: 'TD3', name: '生成登录会话', type: 'Service', target: '会话服务', note: '写入登录态', capabilityUnitId: 'CU1', capabilityUnit: '用户管理', constructId: 'BC1', constructName: '统一登录' },
    ],
    entities: [],
    relations: [],
    rules: [],
  };
}

async function openTaskEditor(page, name) {
  await page.goto('/');
  await openDocument(page, name);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await page.locator('#proc-context-diagram .pf-task, #proc-diagram .pf-task, #proc-context-diagram .ps-task, #proc-diagram .ps-task').first().click();
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText('登录校验');
}

async function saveDocument(page) {
  await page.locator('#btn-save').click();
  const dialog = page.getByTestId('app-dialog');
  await dialog.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByTestId('app-dialog-confirm').click();
  }
  await expect(page.getByTestId('modified-badge')).toBeHidden({ timeout: 30000 });
}

test('节点在当前编辑区内展示节点任务与任务级流程图', async ({ page, request }) => {
  const documentName = `process-orchestration-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await expect(page.getByTestId('node-perspective-switch')).toBeVisible();
  await page.getByTestId('node-perspective-engineering').click();
  await expect(page.locator('.node-perspective-btn.active')).toContainText('节点任务');
  await expect(page.getByTestId('orchestration-section')).toBeVisible();
  await expect(page.getByTestId('user-steps-section')).toHaveCount(0);
  await expect(page.getByTestId('orchestration-flow')).toBeVisible();
  await expect(page.locator('.orch-flow-node-label')).toContainText('登录校验');
  await expect(page.locator('.orch-flow-node-label')).not.toContainText('T1');
  await expect(page.locator('.proc-subdrawer')).toHaveCount(0);
  await expect(page.locator('.orch-card .orch-name').first()).toHaveValue('校验账号状态');
  await expect(page.locator('.orch-card input[type="text"]').nth(1)).toHaveValue('认证服务');
  await expect(page.getByTestId('orchestration-task-construct-select').first()).toContainText('统一登录');
});

test('节点任务修改会同步任务定义但不改流程节点', async ({ page, request }) => {
  const documentName = `process-node-task-definition-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();
  await page.locator('.orch-card .orch-name').first().fill('核验账号状态');

  await expect.poll(() => page.evaluate(() => {
    const node = S.doc.processes[0].nodes[0];
    const nodeTask = node.orchestrationTasks[0];
    const taskDefinition = S.doc.taskDefinitions.find((item) => item.id === nodeTask.taskDefinitionId);
    return {
      nodeName: node.name,
      nodeTaskName: nodeTask.name,
      taskDefinitionName: taskDefinition?.name,
    };
  })).toEqual({
    nodeName: '登录校验',
    nodeTaskName: '核验账号状态',
    taskDefinitionName: '核验账号状态',
  });
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText('节点 登录校验');
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).not.toContainText('T1');
});

test('添加节点任务只增加节点下任务，不自动沉淀任务定义', async ({ page, request }) => {
  const documentName = `process-add-node-task-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();
  await page.locator('[data-testid="orchestration-section"] .btn', { hasText: '添加任务' }).click();

  await expect(page.locator('.orch-card')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => ({
    nodeCount: S.doc.processes[0].nodes.length,
    nodeTaskCount: S.doc.processes[0].nodes[0].orchestrationTasks.length,
    createdDefinitionId: S.doc.processes[0].nodes[0].orchestrationTasks.at(-1)?.taskDefinitionId || '',
    definitionCount: S.doc.taskDefinitions.length,
  }))).toEqual({
    nodeCount: 2,
    nodeTaskCount: 3,
    createdDefinitionId: '',
    definitionCount: 3,
  });
});

test('未绑定任务定义的节点任务编辑不会制造复用任务', async ({ page, request }) => {
  const documentName = `process-node-task-local-edit-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].nodes = doc.processes[0].tasks;
  doc.processes[0].nodes[0].orchestrationTasks.push({
    name: '临时查询',
    type: 'Query',
    querySourceKind: 'QueryService',
    target: '临时服务',
    note: '',
  });
  await createDocument(request, documentName, doc);

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();
  const lastTask = page.locator('.orch-card').last();
  await lastTask.locator('.orch-name').fill('临时账号状态核验');
  const constructValue = await lastTask.getByTestId('orchestration-task-construct-select').locator('option').evaluateAll((options) => (
    options.map((option) => option.value).find(Boolean) || ''
  ));
  await lastTask.getByTestId('orchestration-task-construct-select').selectOption(constructValue);

  await expect.poll(() => page.evaluate(() => {
    const nodeTask = (S.doc.processes[0].nodes || S.doc.processes[0].tasks)[0].orchestrationTasks.at(-1);
    return {
      nodeTaskName: nodeTask.name,
      nodeTaskDefinitionId: nodeTask.taskDefinitionId || '',
      constructId: nodeTask.constructId || nodeTask.businessConstructId || '',
      definitionCount: S.doc.taskDefinitions.length,
      dropdownLabels: [...document.querySelectorAll('[data-testid="orchestration-reuse-select"] option')].map((option) => option.textContent || ''),
    };
  })).toEqual({
    nodeTaskName: '临时账号状态核验',
    nodeTaskDefinitionId: '',
    constructId: constructValue,
    definitionCount: 3,
    dropdownLabels: expect.not.arrayContaining([expect.stringContaining('临时账号状态核验 ·')]),
  });
});

test('task definition manager deletes unreferenced dirty definitions', async ({ page, request }) => {
  const documentName = `process-task-definition-manager-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.businessComponents = [
    { id: 'COMP1', name: 'Account component', kind: 'core', constructIds: [], taskDefinitionIds: ['TD_COMPONENT'] },
  ];
  doc.taskDefinitions.push({
    id: 'TD_UNUSED',
    name: 'Unused dirty task',
    type: 'Service',
    target: '',
    note: '',
    constructId: '',
    businessComponentId: '',
  }, {
    id: 'TD_COMPONENT',
    name: 'Component scoped task',
    type: 'Service',
    target: '',
    note: '',
    constructId: '',
    businessComponentId: 'COMP1',
  });
  await createDocument(request, documentName, doc);

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();
  await page.getByTestId('orchestration-task-manager-button').click();
  const dialog = page.getByTestId('business-model-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('任务定义管理');
  await expect(dialog.getByTestId('task-definition-manager-row')).toHaveCount(5);
  await expect(dialog.getByTestId('task-definition-manager-group').filter({ hasText: 'Account component' })).toContainText('Component scoped task');
  await dialog.getByTestId('task-definition-manager-row').filter({ hasText: 'Component scoped task' })
    .getByTestId('task-definition-manager-edit').click();
  await expect(dialog).toContainText('任务定义');
  await page.getByTestId('business-model-dialog-back').click();
  await expect(dialog).toContainText('任务定义管理');
  await expect(dialog.getByText('Unused dirty task')).toBeVisible();
  await expect(dialog.getByText('引用 1').first()).toBeVisible();
  await dialog.getByTestId('task-definition-manager-row').filter({ hasText: 'Unused dirty task' })
    .getByTestId('task-definition-manager-delete').click();
  await acceptAppDialog(page);

  await expect(dialog.getByText('Unused dirty task')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    hasUnused: S.doc.taskDefinitions.some((item) => item.id === 'TD_UNUSED'),
    definitionCount: S.doc.taskDefinitions.length,
  }))).toEqual({ hasUnused: false, definitionCount: 4 });
});

test('鑺傜偣浠诲姟鏀寔鎸変笟鍔＄粍浠跺拰涓氬姟鏋勪欢澶嶇敤宸叉湁浠诲姟', async ({ page, request }) => {
  const documentName = `process-reuse-orchestration-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();

  await expect(page.getByTestId('orchestration-reuse-panel')).toBeVisible();
  await page.getByTestId('orchestration-reuse-capability-select').selectOption({ label: '用户管理' });
  await page.getByTestId('orchestration-reuse-construct-select').selectOption({ label: '统一登录' });
  await page.getByTestId('orchestration-reuse-search').fill('首页');

  const reuseSelect = page.getByTestId('orchestration-reuse-select');
  await expect(reuseSelect).toBeVisible();
  const reusableValue = await reuseSelect.locator('option').evaluateAll((options) => (
    options.map((option) => option.value).find(Boolean) || ''
  ));
  expect(reusableValue).toBeTruthy();
  const reusableLabel = await reuseSelect.locator(`option[value="${reusableValue}"]`).textContent();
  const expectedTaskName = reusableLabel.split(' · ')[0];

  await reuseSelect.selectOption(reusableValue);
  await page.getByTestId('orchestration-reuse-button').click();

  await expect(page.locator('.orch-card')).toHaveCount(3);
  const names = await page.locator('.orch-card .orch-name').evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(names).toContain(expectedTaskName);
  await expect(page.getByTestId('orchestration-flow')).toContainText(expectedTaskName);
});

test('关闭流程编辑后回到可截图的流程展示视图', async ({ page, request }) => {
  const documentName = `process-close-editor-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();
  await expect(page.getByTestId('orchestration-flow')).toBeVisible();

  await page.getByTestId('process-editor-close').click();

  await expect(page.getByTestId('process-switch-card')).toHaveClass(/active/);
  await expect(page.locator('.proc-drawer.open')).toHaveCount(0);
  await expect(page.getByTestId('process-editor-open')).toBeVisible();
  await expect(page.getByTestId('process-flow-view')).toBeVisible();
  await expect(page.locator('#proc-diagram .ps-wrap, #proc-diagram .pf-wrap')).toBeVisible();
  await expect(page.locator('.process-flow-kicker')).toHaveCount(0);
  await expect(page.getByTestId('process-flow-summary')).toHaveCount(0);
  await expect(page.locator('.process-flow-view .drawer-diag-bar')).toHaveCount(0);
  await expect(page.locator('.process-diagram-panel-title')).toHaveCount(0);

  await page.getByTestId('process-editor-open').click();
  await expect(page.locator('.proc-drawer.open')).toBeVisible();
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText('统一登录');
});

test('流程节点可以维护多个表单并映射实体字段', async ({ page, request }) => {
  const documentName = `process-form-model-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.entities = [
    {
      id: 'E1',
      name: '仓库',
      group: '示例服务机构',
      fields: [
        { name: '仓库代码', type: 'string', is_key: true, note: '' },
        { name: '仓库名称', type: 'string', is_key: false, note: '' },
      ],
    },
  ];
  doc.entities.push({
    id: 'E2',
    name: '仓单',
    group: '示例服务机构',
    fields: [
      { name: '仓单编号', type: 'string', is_key: true, note: '' },
      { name: '仓单状态', type: 'string', is_key: false, note: '' },
    ],
  });
  await createDocument(request, documentName, doc);

  await openTaskEditor(page, documentName);
  await expect(page.getByTestId('task-forms-section')).toBeVisible();
  await expect(page.getByTestId('task-form-card')).toHaveCount(0);

  await page.getByTestId('task-form-add').click();
  await expect(page.getByTestId('task-form-card')).toHaveCount(1);
  await page.getByTestId('task-form-name').fill('仓库管理列表');
  const entityOptions = await page.getByTestId('task-form-section-entity').first().locator('option').evaluateAll((options) => (
    options.map((option) => ({ value: option.value, label: option.textContent || '' })).filter((option) => option.value)
  ));
  expect(entityOptions.length).toBeGreaterThanOrEqual(2);
  await page.getByTestId('task-form-section-entity').selectOption(entityOptions[0].value);
  await page.getByTestId('task-form-purpose').fill('筛选、列表、新增、详情');
  await page.getByTestId('task-form-field-add').click();
  await expect(page.getByTestId('task-form-field-row')).toHaveCount(1);
  await page.getByTestId('task-form-field-name').fill('仓库名称');
  await page.getByTestId('task-form-field-type').selectOption('Select');
  await page.getByTestId('task-form-field-required').check();
  await page.getByTestId('task-form-entity-field').selectOption('仓库名称');
  await page.getByTestId('task-form-field-note').fill('最多50个字符');

  await page.getByTestId('task-form-section-add').click();
  const formSections = page.getByTestId('task-form-section-card');
  await expect(formSections).toHaveCount(2);
  await formSections.nth(1).getByTestId('task-form-section-name').fill('仓单信息');
  await formSections.nth(1).getByTestId('task-form-section-entity').selectOption(entityOptions[1].value);
  await expect(page.getByTestId('task-form-entity-summary').first()).toContainText('仓库');
  await expect(page.getByTestId('task-form-entity-summary').first()).toContainText('仓单');

  await page.getByTestId('task-form-add').click();
  await expect(page.getByTestId('task-form-card')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => {
    const node = S.doc.processes[0].nodes[0];
    return {
      forms: node.forms.length,
      firstName: node.forms[0].name,
      entityId: node.forms[0].entity_id,
      sectionEntityIds: node.forms[0].sections.map((section) => section.entity_id),
      fieldName: node.forms[0].sections[0].fields[0].name,
      fieldType: node.forms[0].sections[0].fields[0].type,
      required: node.forms[0].sections[0].fields[0].required,
      mapped: node.forms[0].sections[0].fields[0].entity_field,
    };
  })).toEqual({
    forms: 2,
    firstName: '仓库管理列表',
    entityId: '',
    sectionEntityIds: [entityOptions[0].value, entityOptions[1].value],
    fieldName: '仓库名称',
    fieldType: 'Select',
    required: true,
    mapped: '仓库名称',
  });
});

test('删除表单前需要二次确认', async ({ page, request }) => {
  const documentName = `process-form-delete-confirm-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('task-form-add').click();
  await page.getByTestId('task-form-name').fill('待删除表单');

  await page.getByTestId('task-form-delete').click();
  await expect(page.getByTestId('app-dialog-message')).toContainText('确认删除表单“待删除表单”');
  await cancelAppDialog(page);
  await expect(page.getByTestId('task-form-card')).toHaveCount(1);

  await page.getByTestId('task-form-delete').click();
  await acceptAppDialog(page);
  await expect(page.getByTestId('task-form-card')).toHaveCount(0);
});

test('表单分组和字段支持行内插入、删除、上移和下移', async ({ page, request }) => {
  const documentName = `process-form-actions-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.entities = [
    {
      id: 'E1',
      name: '仓库',
      group: '示例服务机构',
      fields: [
        { name: '仓库代码', type: 'string', is_key: true, note: '' },
        { name: '仓库名称', type: 'string', is_key: false, note: '' },
      ],
    },
  ];
  await createDocument(request, documentName, doc);

  await openTaskEditor(page, documentName);
  await page.getByTestId('task-form-add').click();
  await page.getByTestId('task-form-name').fill('仓库维护表单');
  const entityValue = await page.getByTestId('task-form-section-entity').first().locator('option').evaluateAll((options) => (
    options.map((option) => option.value).find(Boolean) || ''
  ));
  await page.getByTestId('task-form-section-entity').selectOption(entityValue);

  let sections = page.getByTestId('task-form-section-card');
  await expect(sections).toHaveCount(1);
  await sections.first().getByTestId('task-form-section-name').fill('基础信息');
  await sections.first().getByTestId('task-form-section-add-after').click();
  sections = page.getByTestId('task-form-section-card');
  await expect(sections).toHaveCount(2);
  await sections.nth(1).getByTestId('task-form-section-name').fill('审核意见');

  await sections.nth(1).getByTestId('task-form-section-move-up').click();
  sections = page.getByTestId('task-form-section-card');
  await expect(sections.nth(0).getByTestId('task-form-section-name')).toHaveValue('审核意见');
  await sections.nth(0).getByTestId('task-form-section-move-down').click();
  sections = page.getByTestId('task-form-section-card');
  await expect(sections.nth(1).getByTestId('task-form-section-name')).toHaveValue('审核意见');

  const firstSection = sections.nth(0);
  await firstSection.getByTestId('task-form-field-add').click();
  let rows = firstSection.getByTestId('task-form-field-row');
  await rows.first().getByTestId('task-form-field-name').fill('仓库代码');
  await rows.first().getByTestId('task-form-field-add-after').click();
  rows = firstSection.getByTestId('task-form-field-row');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByTestId('task-form-field-name').fill('仓库名称');

  await rows.nth(0).getByTestId('task-form-field-move-down').click();
  rows = firstSection.getByTestId('task-form-field-row');
  await expect(rows.nth(0).getByTestId('task-form-field-name')).toHaveValue('仓库名称');
  await expect(rows.nth(0).getByTestId('task-form-field-move-up')).toBeDisabled();
  await rows.nth(1).getByTestId('task-form-field-delete').click();
  await expect(firstSection.getByTestId('task-form-field-row')).toHaveCount(1);

  await sections.nth(1).getByTestId('task-form-section-delete').click();
  await expect(page.getByTestId('task-form-section-card')).toHaveCount(1);
});

test('任务级备注默认收起，按需添加并按纯文本保存', async ({ page, request }) => {
  const documentName = `process-orch-note-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[0].orchestrationTasks[0].note = '';

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();

  const firstTask = page.locator('.orch-card[data-orch-index="0"]');
  await expect(firstTask.locator('.step-note')).toHaveCount(0);
  await expect(firstTask.getByTestId('orchestration-note-add')).toBeVisible();

  await firstTask.getByTestId('orchestration-note-add').click();
  await firstTask.locator('.step-note').fill('#不是标题\n输入：账号；输出：校验结果');
  await firstTask.getByTestId('orchestration-note-save').click();

  await expect(firstTask.locator('.step-note')).toHaveCount(0);
  await expect(firstTask.getByTestId('orchestration-note-preview')).toContainText('#不是标题');
  await expect(firstTask.locator('h1', { hasText: '不是标题' })).toHaveCount(0);

  await firstTask.getByTestId('orchestration-note-edit').click();
  await expect(firstTask.locator('.step-note')).toHaveValue(/输入：账号/);
});

test('任务级视图切回用户步骤视图后步骤区不重复插入操作按钮', async ({ page, request }) => {
  const documentName = `process-toggle-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();
  await page.getByTestId('node-perspective-user').click();

  const stepRows = page.locator('.step-row');
  await expect(stepRows).toHaveCount(2);
  await expect(page.getByTestId('user-steps-section')).toBeVisible();
  await expect(page.locator('.step-row .step-actions')).toHaveCount(2);

  const actionsPerRow = await page.locator('.step-row').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.step-actions').length),
  );
  expect(actionsPerRow).toEqual([1, 1]);
});

test('节点任务视图不再渲染旧版任务级缩放画布', async ({ page, request }) => {
  const documentName = `process-taskflow-zoom-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await page.getByTestId('node-perspective-engineering').click();

  await expect(page.getByTestId('orchestration-section')).toBeVisible();
  await expect(page.getByTestId('orchestration-flow')).toBeVisible();
  await expect(page.locator('#proc-diagram .ptf-wrap')).toHaveCount(0);
  await expect(page.locator('.drawer-diag.taskflow-mode .zoom-btn')).toHaveCount(0);
});

test('用户操作步骤支持行内插入并可上下调整顺序', async ({ page, request }) => {
  const documentName = `process-steps-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);

  const firstStep = page.locator('.step-row').first();
  await firstStep.locator('.step-add-after').click();
  await expect(page.locator('.step-row')).toHaveCount(3);

  const insertedName = page.locator('.step-row').nth(1).locator('.step-name');
  await insertedName.fill('校验登录环境');

  let names = await page.locator('.step-name').evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(names).toEqual(['选择认证方式', '校验登录环境', '输入账号密码']);

  await page.locator('.step-row').nth(1).locator('.step-move-down').click();
  names = await page.locator('.step-name').evaluateAll((nodes) => nodes.map((node) => node.value));
  expect(names).toEqual(['选择认证方式', '输入账号密码', '校验登录环境']);
});

test('用户操作步骤类型新增点击且排在最前面', async ({ page, request }) => {
  const documentName = `process-step-types-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);

  const options = await page.locator('.step-row').first().locator('.step-type option').evaluateAll((nodes) => {
    return nodes.map((node) => ({
      value: node.value,
      label: (node.textContent || '').trim(),
    }));
  });

  expect(options[0]).toEqual({ value: 'Click', label: '点击' });
  expect(options.slice(0, 4)).toEqual([
    { value: 'Click', label: '点击' },
    { value: 'Query', label: '查询' },
    { value: 'Check', label: '校验' },
    { value: 'Fill', label: '填写' },
  ]);
});

test('节点角色支持多选且切换后保持编辑区位置', async ({ page, request }) => {
  const documentName = `process-multi-role-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[0].steps = Array.from({ length: 16 }, (_, index) => ({
    name: `步骤${index + 1}`,
    type: 'Query',
    note: `说明${index + 1}`,
  }));

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const drawerBody = page.locator('.proc-drawer .drawer-body');
  const picker = page.getByTestId('task-role-picker');
  const toggle = page.getByTestId('task-role-toggle');
  const summary = page.getByTestId('task-role-summary');
  const pickerBody = page.getByTestId('task-role-picker-body');
  const secondRoleOption = page.locator('.task-role-option').nth(1);

  if (await pickerBody.isVisible().catch(() => false)) {
    await toggle.click();
  }
  await expect(toggle).toContainText('展开角色');
  await expect(page.getByTestId('task-role-collapsed-preview')).toBeVisible();
  await expect(pickerBody).not.toBeVisible();

  const collapsedHeight = await picker.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  await summary.click();
  await expect(pickerBody).not.toBeVisible();
  await toggle.click();
  await expect(pickerBody).toBeVisible();
  await expect(toggle).toContainText('收起角色');
  const expandedHeight = await picker.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(expandedHeight).toBeGreaterThan(collapsedHeight + 80);

  await drawerBody.evaluate((node) => { node.scrollTop = 72; });
  const beforeScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  const beforeRoleOptionTop = await secondRoleOption.evaluate((node) => {
    const drawerBodyNode = node.closest('.drawer-body');
    if (!drawerBodyNode) return node.getBoundingClientRect().top;
    return node.getBoundingClientRect().top - drawerBodyNode.getBoundingClientRect().top + drawerBodyNode.scrollTop;
  });

  await page.evaluate(() => {
    const input = [...document.querySelectorAll('[data-testid="task-role-checkbox"]')].find((item) => !item.checked);
    input?.click();
  });
  await expect(page.locator('.task-role-selected-chip')).toHaveCount(1);
  const afterSecondRoleOptionTop = await secondRoleOption.evaluate((node) => {
    const drawerBodyNode = node.closest('.drawer-body');
    if (!drawerBodyNode) return node.getBoundingClientRect().top;
    return node.getBoundingClientRect().top - drawerBodyNode.getBoundingClientRect().top + drawerBodyNode.scrollTop;
  });

  await page.evaluate(() => {
    const input = [...document.querySelectorAll('[data-testid="task-role-checkbox"]')].find((item) => !item.checked);
    input?.click();
  });
  await expect(page.locator('.task-role-selected-chip')).toHaveCount(2);

  const afterScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  await expect(picker).toContainText('已选 2 个角色');
  expect(Math.abs(afterScrollTop - beforeScrollTop)).toBeLessThanOrEqual(96);
  expect(Math.abs(afterSecondRoleOptionTop - beforeRoleOptionTop)).toBeLessThanOrEqual(4);

  const diagramRoles = await page.locator('#proc-diagram .ps-task .ps-role-list, #proc-diagram .pf-task .pf-role-list').first().evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      chips: Array.from(node.querySelectorAll('.ps-role-chip, .pf-role-chip')).map((item) => item.textContent.trim()),
      flexWrap: style.flexWrap,
      justifyContent: style.justifyContent,
    };
  });
  expect(diagramRoles.chips).toHaveLength(2);
  expect(diagramRoles.chips).toEqual(expect.arrayContaining(['用户', '运营专员']));
  expect(diagramRoles.flexWrap).toBe('wrap');
  expect(diagramRoles.justifyContent).toBe('center');

  await toggle.click();
  await expect(pickerBody).not.toBeVisible();
  await expect(toggle).toContainText('展开角色');
  const recollapsedHeight = await picker.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(recollapsedHeight).toBeLessThan(expandedHeight - 80);
});

test('流程图区域填满编辑区且不再保留手动高度拖拽条', async ({ page, request }) => {
  const documentName = `process-diagram-resize-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[0].steps = Array.from({ length: 10 }, (_, index) => ({
    name: `步骤${index + 1}`,
    type: 'Query',
    note: `说明${index + 1}`,
  }));

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const diagram = page.locator('.process-flow-card .drawer-diag').first();
  await expect(page.getByTestId('process-diagram-resize-handle')).toHaveCount(0);
  const beforeHeight = await diagram.evaluate((node) => {
    const card = node.closest('.process-flow-card');
    return {
      diagramHeight: Math.round(node.getBoundingClientRect().height),
      cardHeight: Math.round(card.getBoundingClientRect().height),
      overflowX: getComputedStyle(node.querySelector('.live-diagram')).overflowX,
      overflowY: getComputedStyle(node.querySelector('.live-diagram')).overflowY,
    };
  });
  expect(beforeHeight.diagramHeight).toBeGreaterThan(beforeHeight.cardHeight * 0.45);
  expect(['auto', 'scroll']).toContain(beforeHeight.overflowX);
  expect(['auto', 'scroll']).toContain(beforeHeight.overflowY);

  await page.getByTestId('node-perspective-engineering').click();

  const afterRerenderHeight = await diagram.evaluate((node) => {
    const card = node.closest('.process-flow-card');
    return {
      diagramHeight: Math.round(node.getBoundingClientRect().height),
      cardHeight: Math.round(card.getBoundingClientRect().height),
    };
  });
  expect(afterRerenderHeight.diagramHeight).toBeGreaterThan(afterRerenderHeight.cardHeight * 0.45);
  await expect(page.getByTestId('process-diagram-resize-handle')).toHaveCount(0);
});

test('节点编辑重渲染后保持用户步骤备注框自动高度', async ({ page, request }) => {
  const documentName = `process-returnable-note-height-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[0].steps[0].note = '第一行说明\\n第二行说明\\n第三行说明\\n第四行说明';

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  await page.getByTestId('step-note-edit').first().click();
  const note = page.locator('.step-note').first();
  const beforeHeight = await note.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(beforeHeight).toBeGreaterThan(60);

  await page.getByTestId('node-perspective-engineering').click();
  await page.getByTestId('node-perspective-user').click();

  const afterHeight = await note.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(afterHeight).toBeGreaterThan(60);
  expect(Math.abs(afterHeight - beforeHeight)).toBeLessThanOrEqual(4);
});

test('用户步骤备注默认收起，按需添加并保存备注规则', async ({ page, request }) => {
  const documentName = `process-step-note-inline-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks[0].steps[0].note = '';

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const firstStep = page.locator('.step-row[data-step-index="0"]');
  await expect(firstStep.locator('.step-note')).toHaveCount(0);
  await expect(firstStep.getByTestId('step-note-add')).toBeVisible();

  await firstStep.getByTestId('step-note-add').click();
  await expect(firstStep.locator('.step-note')).toBeVisible();
  await firstStep.locator('.step-note').fill('校验：必须选择认证方式\\n说明：按纯文本保存，可粘贴链接');
  await firstStep.getByTestId('step-note-save').click();

  await expect(firstStep.locator('.step-note')).toHaveCount(0);
  await expect(firstStep.getByTestId('step-note-preview')).toContainText('必须选择认证方式');
  await firstStep.getByTestId('step-note-edit').click();
  await expect(firstStep.locator('.step-note')).toHaveValue(/纯文本/);
});

test('节点关联实体后保持抽屉滚动位置', async ({ page, request }) => {
  const documentName = `process-entity-op-scroll-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.entities = [
    { id: 'E1', name: '账号', group: '用户主题域', fields: [] },
    { id: 'E2', name: '会话', group: '用户主题域', fields: [] },
    { id: 'E3', name: '登录日志', group: '审计主题域', fields: [] },
  ];
  doc.processes[0].tasks[0].steps = Array.from({ length: 16 }, (_, index) => ({
    name: `步骤${index + 1}`,
    type: 'Query',
    note: `说明${index + 1}`,
  }));

  await createDocument(request, documentName, doc);
  await openTaskEditor(page, documentName);

  const drawerBody = page.locator('.proc-drawer .drawer-body');
  await drawerBody.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const beforeScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  const beforeSelectTop = await page.evaluate(() => {
    const body = document.querySelector('.proc-drawer .drawer-body');
    const select = body?.querySelector('.add-eop-row select');
    if (!body || !select) return null;
    return select.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  expect(beforeScrollTop).toBeGreaterThan(0);
  expect(beforeSelectTop).not.toBeNull();

  const entityValue = await page.locator('.add-eop-row select option').evaluateAll((options) => (
    options.map((option) => option.value).find(Boolean) || ''
  ));
  await page.locator('.add-eop-row select').selectOption(entityValue);
  await page.locator('.add-eop-row .btn').click();

  await expect(page.locator('.eop-tag')).toHaveCount(1);
  const afterScrollTop = await drawerBody.evaluate((node) => node.scrollTop);
  const afterSelectTop = await page.evaluate(() => {
    const body = document.querySelector('.proc-drawer .drawer-body');
    const select = body?.querySelector('.add-eop-row select');
    if (!body || !select) return null;
    return select.getBoundingClientRect().top - body.getBoundingClientRect().top;
  });
  expect(afterScrollTop).toBeGreaterThan(0);
  expect(afterSelectTop).not.toBeNull();
  expect(Math.abs(afterSelectTop - beforeSelectTop)).toBeLessThanOrEqual(4);
});

async function openProcessEditor(page, name) {
  await page.goto('/');
  await openDocument(page, name);
  await page.getByTestId('tab-process').click();
  const processId = await page.evaluate(() => S.doc.processes[0].id);
  await page.evaluate((procId) => navigate('process', { procId, taskId: null }), processId);
  await page.getByTestId('process-switch-card').click();
  await page.evaluate(() => {
    S.ui.taskId = null;
    renderProcessTab();
  });
  await page.getByTestId('process-editor-open').click();
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText('统一登录');
}

test('流程支持上传多个 HTML 原型并在保存后保留', async ({ page, request }) => {
  const documentName = `process-prototypes-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openProcessEditor(page, documentName);
  await page.getByTestId('proc-prototype-input').setInputFiles([
    {
      name: 'login-a.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><h1>原型A</h1><p>登录页</p></body></html>'),
    },
    {
      name: 'login-b.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><h1>原型B</h1><p>审核页</p></body></html>'),
    },
  ]);
  await page.getByTestId('proc-prototype-upload-button').click();

  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(2);
  await expect(page.locator('.prototype-file-name').nth(0)).toHaveText('login-a.html');
  await expect(page.locator('.prototype-file-name').nth(1)).toHaveText('login-b.html');

  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('proc-prototype-open').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('h1')).toHaveText('原型A');
  await popup.close();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('proc-prototype-download').first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('login-a.html');

  await page.getByTestId('proc-prototype-remove').nth(1).click();
  await acceptAppDialog(page);
  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(1);
  await expect(page.locator('.prototype-file-name').first()).toHaveText('login-a.html');

  await saveDocument(page);

  await openProcessEditor(page, documentName);
  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(1);
  await expect(page.locator('.prototype-file-name').first()).toHaveText('login-a.html');
});

test('process attachments allow previewable files and download-only documents', async ({ page, request }) => {
  const documentName = `process-attachments-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openProcessEditor(page, documentName);
  await expect(page.locator('.proc-drawer')).toContainText('流程原型/附件');
  await page.getByTestId('proc-prototype-input').setInputFiles([
    {
      name: 'flow.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
    },
    {
      name: 'handoff.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx-bytes'),
    },
  ]);
  await page.getByTestId('proc-prototype-upload-button').click();

  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(2);
  await expect(page.locator('.prototype-file-kind').nth(0)).toHaveText('图片');
  await expect(page.locator('.prototype-file-kind').nth(1)).toHaveText('文档');
  await expect(page.getByTestId('proc-prototype-open')).toHaveCount(1);
  await expect(page.getByTestId('proc-prototype-download')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => {
    const first = S.doc.processes[0].prototypeFiles[0];
    return {
      encoding: first.contentEncoding,
      type: first.contentType,
      hasContent: Boolean(first.content),
      hasUploadToken: Boolean(first.versions[0].uploadToken),
      hasLocalUrl: Boolean(first.versions[0].localUrl),
      title: S.doc.meta.title,
      processName: S.doc.processes[0].name,
    };
  })).toEqual({
    encoding: '',
    type: 'image/png',
    hasContent: false,
    hasUploadToken: true,
    hasLocalUrl: true,
    title: documentName,
    processName: '统一登录',
  });

  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('proc-prototype-open').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  expect(popup.url()).toContain('blob:');
  await popup.close();

  await saveDocument(page);
  await expect.poll(() => page.evaluate(() => Boolean(S.doc.processes[0].prototypeFiles[0].content))).toBe(false);
  await expect.poll(() => page.evaluate(() => Boolean(S.doc.processes[0].prototypeFiles[0].versions[0].uploadToken))).toBe(false);

  await openProcessEditor(page, documentName);
  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(2);
  await expect(page.getByTestId('proc-prototype-open')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => S.doc.processes[0].prototypeFiles[0].contentEncoding)).toBe('');
  await expect.poll(() => page.evaluate(() => Boolean(S.doc.processes[0].prototypeFiles[0].content))).toBe(false);

  const persistedPopupPromise = page.waitForEvent('popup');
  await page.getByTestId('proc-prototype-open').first().click();
  const persistedPopup = await persistedPopupPromise;
  await persistedPopup.waitForLoadState('domcontentloaded');
  expect(persistedPopup.url()).toContain('/api/attachment/');
  await persistedPopup.close();
});

test('process attachments reject executable file types', async ({ page, request }) => {
  const documentName = `process-attachment-reject-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openProcessEditor(page, documentName);
  await page.getByTestId('proc-prototype-input').setInputFiles([
    {
      name: 'danger.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('not really executable'),
    },
  ]);

  await page.getByTestId('proc-prototype-upload-button').click();
  await expect(page.getByTestId('app-dialog-message')).toContainText('不支持上传');
  await expect(page.getByTestId('app-dialog-message')).toContainText('danger.exe');
  await acceptAppDialog(page);

  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => S.doc.processes[0].prototypeFiles.length)).toBe(0);
});

test('流程编辑区不再维护流程级组件和分类标签，节点任务可选择所属构件', async ({ page, request }) => {
  const documentName = `process-labels-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openProcessEditor(page, documentName);
  let drawer = page.locator('.proc-drawer');
  await expect(drawer).not.toContainText('流程归属组件');
  await expect(drawer).not.toContainText('流程分类标签');
  await expect(drawer.locator('input[placeholder="如：仓储仓单管理"]')).toHaveCount(0);
  await expect(drawer.locator('input[placeholder="如：入库办理"]')).toHaveCount(0);

  await openTaskEditor(page, documentName);
  drawer = page.locator('.proc-drawer');
  await expect(drawer).toContainText('节点名称');
  await expect(drawer).not.toContainText('所属业务构件');
  await page.getByTestId('node-perspective-engineering').click();
  await expect(drawer).toContainText('节点任务');
  await expect(page.getByTestId('orchestration-task-construct-select').first()).toContainText('统一登录');
});

test('同名流程原型会新增版本并显示上传时间', async ({ page, request }) => {
  const documentName = `process-prototype-versions-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openProcessEditor(page, documentName);
  await page.getByTestId('proc-prototype-input').setInputFiles([
    {
      name: 'login-a.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><h1>原型A-v1</h1></body></html>'),
    },
  ]);
  await page.getByTestId('proc-prototype-upload-button').click();
  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(1);
  await expect(page.locator('.prototype-file-version').first()).toContainText('当前 v1');

  await page.getByTestId('proc-prototype-input').setInputFiles([
    {
      name: 'login-a.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><h1>原型A-v2</h1></body></html>'),
    },
  ]);
  await page.getByTestId('proc-prototype-upload-button').click();

  await expect(page.getByTestId('proc-prototype-item')).toHaveCount(1);
  await expect(page.locator('.prototype-file-version').first()).toContainText('当前 v2');
  await expect(page.locator('.prototype-file-version').first()).toContainText('共2版');

  if ((await page.getByTestId('proc-prototype-version-item').count()) === 0) {
    await page.getByTestId('proc-prototype-toggle').first().click();
  }
  await expect(page.getByTestId('proc-prototype-version-item')).toHaveCount(2);
  await expect(page.locator('.prototype-version-label').nth(0)).toContainText('v1');
  await expect(page.locator('.prototype-version-label').nth(1)).toContainText('v2');
  await expect(page.locator('.prototype-version-label').nth(1)).toContainText('当前引用');
  await expect(page.locator('.prototype-version-time').nth(0)).not.toHaveText('');

  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('proc-prototype-version-open').nth(1).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('h1')).toHaveText('原型A-v2');
  await popup.close();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('proc-prototype-version-download').first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('login-a.html');

  await saveDocument(page);

  await openProcessEditor(page, documentName);
  await page.getByTestId('proc-prototype-toggle').first().click();
  await expect(page.getByTestId('proc-prototype-version-item')).toHaveCount(2);
  await expect(page.locator('.prototype-version-label').nth(1)).toContainText('当前引用');
});

test('流程节点不再通过可退回属性表达回退关系', async ({ page, request }) => {
  const documentName = `process-no-returnable-toggle-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditor(page, documentName);
  await expect(page.getByTestId('task-returnable-toggle')).toHaveCount(0);
  await expect(page.locator('.proc-drawer')).not.toContainText('可退回');
  await page.getByTestId('process-editor-close').click();
  await expect(page.locator('#proc-diagram .pf-return-line')).toHaveCount(0);
});

async function openTaskEditorByTask(page, name, taskId, taskName) {
  await page.goto('/');
  await openDocument(page, name);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await page.locator(`#proc-context-diagram .pf-task[data-id="${taskId}"], #proc-diagram .pf-task[data-id="${taskId}"]`).first().click();
  await expect(page.locator('.proc-drawer .drawer-crumb').first()).toContainText(taskName);
}

test.skip('可退回节点显示上方回退折线并抬高流程图高度', async ({ page, request }) => {
  const documentName = `process-return-line-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditorByTask(page, documentName, 'T2', 'T2');

  const label = page.locator('.proc-drawer label').filter({ has: page.getByTestId('task-returnable-toggle') });
  await expect(label).toContainText(/\u53ef\u9000\u56de/);
  await expect(label).not.toContainText(/\u53ef\u91cd\u590d/);

  const wrapHeightBefore = await page.locator('#proc-diagram .pf-wrap').evaluate((node) => node.getBoundingClientRect().height);

  await page.getByTestId('task-returnable-toggle').check();
  await expect(page.locator('#proc-diagram .pf-return-line')).toHaveCount(1);
  await expect(page.locator('#proc-diagram .pf-repeat')).toHaveCount(0);

  const lineMeta = await page.locator('#proc-diagram .pf-return-line').evaluate((node) => {
    const wrap = node.closest('.pf-wrap');
    const task = wrap?.querySelector('.pf-task[data-id="T2"]');
    const prevTask = wrap?.querySelector('.pf-task[data-id="T1"]');
    const wrapRect = wrap?.getBoundingClientRect();
    const taskRect = task?.getBoundingClientRect();
    const prevTaskRect = prevTask?.getBoundingClientRect();
    const points = String(node.getAttribute('points') || '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
    return {
      from: node.getAttribute('data-from'),
      to: node.getAttribute('data-to'),
      pointCount: points.length,
      startX: points[0]?.[0] ?? null,
      startY: points[0]?.[1] ?? null,
      endX: points[3]?.[0] ?? null,
      laneStartY: points[1]?.[1] ?? null,
      laneEndY: points[2]?.[1] ?? null,
      endY: points[3]?.[1] ?? null,
      taskLeft: taskRect && wrapRect ? taskRect.left - wrapRect.left : null,
      taskWidth: taskRect?.width ?? 0,
      prevTaskLeft: prevTaskRect && wrapRect ? prevTaskRect.left - wrapRect.left : null,
      prevTaskWidth: prevTaskRect?.width ?? 0,
      taskTop: taskRect && wrapRect ? taskRect.top - wrapRect.top : null,
      wrapHeight: node.closest('.pf-wrap')?.getBoundingClientRect().height ?? 0,
      wrapPosition: wrap ? window.getComputedStyle(wrap).position : '',
    };
  });

  expect(lineMeta.from).toBe('T2');
  expect(lineMeta.to).toBe('T1');
  expect(lineMeta.pointCount).toBe(4);
  expect(lineMeta.laneStartY).toBe(lineMeta.laneEndY);
  expect(lineMeta.laneStartY).toBeLessThan(lineMeta.startY);
  expect(lineMeta.laneEndY).toBeLessThan(lineMeta.endY);
  expect(Math.abs(lineMeta.startX - (lineMeta.taskLeft + lineMeta.taskWidth * 0.25))).toBeLessThanOrEqual(2);
  expect(Math.abs(lineMeta.endX - (lineMeta.prevTaskLeft + lineMeta.prevTaskWidth * 0.75))).toBeLessThanOrEqual(2);
  expect(Math.abs(lineMeta.startY - lineMeta.taskTop)).toBeLessThanOrEqual(2);
  expect(lineMeta.wrapPosition).toBe('relative');
  expect(lineMeta.wrapHeight).toBeGreaterThan(wrapHeightBefore);
});

test.skip('连续可退回节点的回退线锚点错开避免重叠', async ({ page, request }) => {
  const documentName = `process-return-line-stagger-${Date.now()}`;
  const doc = buildProcessEditorDoc(documentName);
  doc.processes[0].tasks.push({
    id: 'T3',
    name: '生成审计上下文',
    role_id: 'R3',
    steps: [{ name: '查看审计结果', type: 'Query', note: '' }],
    orchestrationTasks: [{ name: '加载审计结果', type: 'Query', querySourceKind: 'QueryService', target: '审计服务', note: '' }],
  });
  doc.processes[0].tasks[1].repeatable = true;
  doc.processes[0].tasks[2].repeatable = true;
  await createDocument(request, documentName, doc);

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-process').click();
  await page.getByTestId('process-switch-card').click();
  await page.getByTestId('process-editor-open').click();
  await expect(page.locator('#proc-diagram .pf-return-line')).toHaveCount(2);

  const anchors = await page.evaluate(() => {
    const wrap = document.querySelector('#proc-diagram .pf-wrap');
    const wrapRect = wrap?.getBoundingClientRect();
    const taskRect = (id) => wrap?.querySelector(`.pf-task[data-id="${id}"]`)?.getBoundingClientRect();
    const current = taskRect('T2');
    const pointsByPair = new Map(
      [...document.querySelectorAll('#proc-diagram .pf-return-line')].map((node) => {
        const pair = `${node.getAttribute('data-from')}->${node.getAttribute('data-to')}`;
        const points = String(node.getAttribute('points') || '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
        return [pair, points];
      }),
    );
    return {
      taskLeft: current && wrapRect ? current.left - wrapRect.left : null,
      taskWidth: current?.width ?? 0,
      outgoingStartX: pointsByPair.get('T2->T1')?.[0]?.[0] ?? null,
      incomingEndX: pointsByPair.get('T3->T2')?.[3]?.[0] ?? null,
    };
  });

  expect(Math.abs(anchors.outgoingStartX - (anchors.taskLeft + anchors.taskWidth * 0.25))).toBeLessThanOrEqual(2);
  expect(Math.abs(anchors.incomingEndX - (anchors.taskLeft + anchors.taskWidth * 0.75))).toBeLessThanOrEqual(2);
  expect(anchors.incomingEndX - anchors.outgoingStartX).toBeGreaterThan(anchors.taskWidth * 0.35);
});

test.skip('可退回节点状态下按钮缩放和滚轮缩放作用于整个流程图', async ({ page, request }) => {
  const documentName = `process-return-line-zoom-${Date.now()}`;
  await createDocument(request, documentName, buildProcessEditorDoc(documentName));

  await openTaskEditorByTask(page, documentName, 'T2', 'T2');
  await page.getByTestId('task-returnable-toggle').check();
  await expect(page.locator('#proc-diagram .pf-return-line')).toHaveCount(1);

  const readMetrics = () => page.evaluate(() => {
    const wrap = document.querySelector('#proc-diagram .pf-wrap');
    const task = document.querySelector('#proc-diagram .pf-task[data-id="T2"]');
    const line = document.querySelector('#proc-diagram .pf-return-line');
    return {
      zoom: Number.parseFloat(wrap?.style.zoom || '1'),
      taskWidth: task?.getBoundingClientRect().width || 0,
      lineWidth: line?.getBoundingClientRect().width || 0,
    };
  });

  const before = await readMetrics();
  expect(before.zoom).toBeCloseTo(1, 2);

  await page.locator('.drawer-diag:not(.taskflow-mode) .zoom-btn').first().click();

  const afterButton = await readMetrics();
  expect(afterButton.zoom).toBeCloseTo(1.2, 2);
  expect(afterButton.taskWidth).toBeGreaterThan(before.taskWidth + 5);
  expect(afterButton.lineWidth).toBeGreaterThan(before.lineWidth + 5);

  await page.locator('#proc-diagram').evaluate((node) => {
    node.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -120,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
  });

  const afterWheel = await readMetrics();
  expect(afterWheel.zoom).toBeCloseTo(1.35, 2);
  expect(afterWheel.taskWidth).toBeGreaterThan(afterButton.taskWidth + 5);
  expect(afterWheel.lineWidth).toBeGreaterThan(afterButton.lineWidth + 5);
});
