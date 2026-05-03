const { test, expect } = require('@playwright/test');

const { createDocument, createNewDocument, openDocument } = require('./support/app-helpers');

test('数据页支持编辑实体状态字段并实时渲染状态图', async ({ page }) => {
  const documentName = `entity-state-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();

  await page.getByTestId('entity-name-input').fill('预约单');
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('预约状态');
  await page.getByTestId('entity-field-type-0').selectOption('enum');
  await page.getByTestId('entity-status-role-0').selectOption('primary');
  await page.locator('.field-td-note textarea').first().fill('草稿/待审核/审核通过/已作废');

  await page.getByTestId('data-switch-state').click();
  await expect(page.getByTestId('state-editor-drawer')).toBeVisible();
  await expect(page.locator('.data-toolbar.state-mode .data-state-select-inline')).toBeHidden();
  await expect(page.locator('.data-toolbar.state-mode [data-testid="data-add-entity"]')).toBeHidden();
  await expect(page.getByTestId('state-zoom-reset')).toBeVisible();
  const toolbarLabelWhiteSpace = await page.locator('.data-state-select-label').evaluate((node) => getComputedStyle(node).whiteSpace);
  expect(toolbarLabelWhiteSpace).toBe('nowrap');
  await expect(page.getByTestId('entity-state-field-select')).toHaveValue('预约状态');
  await expect(page.getByTestId('entity-state-values-text')).toContainText('草稿/待审核/审核通过/已作废');

  const drawerWidth = await page.getByTestId('state-editor-drawer').evaluate((node) => node.offsetWidth);
  const overviewMarginRight = await page.locator('.entity-state-main-shell').evaluate((node) => parseFloat(getComputedStyle(node).marginRight || '0'));
  expect(drawerWidth).toBeGreaterThanOrEqual(620);
  expect(Math.abs(overviewMarginRight - drawerWidth)).toBeLessThanOrEqual(4);
  const zoomShell = page.getByTestId('entity-state-zoom-shell').first();
  await expect(zoomShell).toHaveAttribute('data-state-zoom', '1');
  await page.getByTestId('state-zoom-in').click();
  await expect(zoomShell).toHaveAttribute('data-state-zoom', /1\.1/);
  await page.getByTestId('state-editor-hide').click();
  await expect(page.getByTestId('state-editor-drawer')).toHaveCount(0);
  await expect(page.getByTestId('state-editor-open')).toBeVisible();
  await page.getByTestId('state-editor-open').click();
  await expect(page.getByTestId('state-editor-drawer')).toBeVisible();

  await page.getByTestId('entity-transition-add-button').click();
  await page.getByTestId('entity-transition-from-0').selectOption('草稿');
  await page.getByTestId('entity-transition-to-0').selectOption('待审核');
  await page.getByTestId('entity-transition-action-0').fill('提交审核');
  await expect(page.getByTestId('entity-transition-action-0')).toBeFocused();
  await expect(page.locator('.entity-state-link-label')).toContainText('提交审核');

  await expect(page.getByTestId('entity-state-diagram')).toBeVisible();
  await expect(page.getByTestId('entity-state-diagram')).toContainText('草稿');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('待审核');
  await expect(page.locator('[data-testid="entity-state-graph-canvas"]')).toBeVisible();
  await expect(page.locator('[data-testid="entity-state-graph-link"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="entity-state-link-label-group"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="entity-state-start-dot"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="entity-state-end-dot"]')).toHaveCount(1);
  await expect(page.getByTestId('entity-state-overview-field')).toHaveCount(1);

  const labelPlacement = await page.locator('[data-testid="entity-state-link-label-group"]').first().evaluate((node) => {
    const rect = node.querySelector('rect');
    const text = node.querySelector('text');
    return {
      axis: node.dataset.labelAxis || '',
      angle: Number(node.dataset.labelAngle || 0),
      lineX: Number(node.dataset.labelLineX || 0),
      lineY: Number(node.dataset.labelLineY || 0),
      rectX: Number(rect?.getAttribute('x') || 0),
      rectY: Number(rect?.getAttribute('y') || 0),
      rectW: Number(rect?.getAttribute('width') || 0),
      rectH: Number(rect?.getAttribute('height') || 0),
      text: String(text?.textContent || '').trim(),
    };
  });
  expect(labelPlacement.text).toBe('提交审核');
  expect(labelPlacement.angle).toBe(0);
  expect(Math.abs((labelPlacement.rectY + labelPlacement.rectH / 2) - labelPlacement.lineY)).toBeLessThanOrEqual(0.5);
  expect(Math.abs((labelPlacement.rectX + labelPlacement.rectW / 2) - labelPlacement.lineX)).toBeLessThanOrEqual(40);

  const nodeWidths = await page.locator('[data-testid^="entity-state-node-"]').evaluateAll((nodes) =>
    nodes.map((node) => parseFloat(node.style.width || '0')),
  );
  expect(Math.max(...nodeWidths)).toBeGreaterThan(Math.min(...nodeWidths));

  await expect(page.getByTestId('entity-state-kind-list')).toBeVisible();
  await expect(page.getByTestId('entity-state-kind-0')).toHaveValue('initial');
  await expect(page.locator('.entity-transition-row select')).toHaveCount(2);
  await expect(page.locator('[data-testid^="entity-transition-note-"]')).toHaveCount(0);
  await expect(page.getByTestId('entity-state-empty')).toHaveCount(0);

  await page.getByTestId('tab-preview').click();
  await expect(page.locator('.preview-rendered')).toContainText('状态流转');
  await expect(page.locator('.preview-rendered')).toContainText('提交审核');
});

test('状态流转支持行内快捷增删和上下移动', async ({ page }) => {
  const documentName = `entity-transition-actions-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();

  await page.getByTestId('entity-name-input').fill('预约单');
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('预约状态');
  await page.getByTestId('entity-field-type-0').selectOption('enum');
  await page.getByTestId('entity-status-role-0').selectOption('primary');
  await page.locator('.field-td-note textarea').first().fill('草稿/待审核/已完成');

  await page.getByTestId('data-switch-state').click();
  await page.getByTestId('entity-transition-add-button').click();
  await page.getByTestId('entity-transition-action-0').fill('提交审核');

  const actionCounts = await page.locator('.entity-transition-row').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.entity-transition-actions button').length),
  );
  expect(actionCounts).toEqual([4]);

  await page.getByTestId('entity-transition-add-after-0').click();
  await expect(page.locator('.entity-transition-row')).toHaveCount(2);
  await page.getByTestId('entity-transition-action-1').fill('补充审核');

  await page.getByTestId('entity-transition-move-up-1').click();
  let actionValues = await page.locator('[data-testid^="entity-transition-action-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(actionValues).toEqual(['补充审核', '提交审核']);

  await page.getByTestId('entity-transition-delete-0').click();
  await expect(page.locator('.entity-transition-row')).toHaveCount(1);
  actionValues = await page.locator('[data-testid^="entity-transition-action-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(actionValues).toEqual(['提交审核']);
});

test('数据页允许一个主状态加多个子状态且不增加列', async ({ page }) => {
  const documentName = `entity-status-roles-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();

  await page.getByTestId('entity-name-input').fill('出库单');
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('主状态');
  await page.getByTestId('entity-field-type-0').selectOption('enum');
  await page.getByTestId('entity-status-role-0').selectOption('primary');
  await page.locator('.field-td-note textarea').nth(0).fill('草稿/待审核/已完成');

  await page.getByTestId('entity-field-add-after-0').click();
  await page.getByTestId('entity-field-name-1').fill('同步状态');
  await page.getByTestId('entity-field-type-1').selectOption('enum');
  await page.getByTestId('entity-status-role-1').selectOption('secondary');
  await page.locator('.field-td-note textarea').nth(1).fill('未同步/同步中/已同步');

  await page.getByTestId('entity-field-add-after-1').click();
  await page.getByTestId('entity-field-name-2').fill('通知状态');
  await page.getByTestId('entity-field-type-2').selectOption('enum');
  await page.getByTestId('entity-status-role-2').selectOption('primary');
  await page.locator('.field-td-note textarea').nth(2).fill('待通知/通知中/已通知');

  await page.getByTestId('entity-status-role-0').selectOption('');
  await page.getByTestId('entity-status-role-0').selectOption('secondary');

  const statusRoles = await page.locator('[data-testid^="entity-status-role-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value || 'none'),
  );
  expect(statusRoles).toEqual(['secondary', 'secondary', 'primary']);

  const headerCount = await page.locator('.field-table thead th').count();
  expect(headerCount).toBe(6);

  await page.getByTestId('data-switch-state').click();
  await page.getByTestId('entity-state-kind-0').selectOption('initial');
  await page.getByTestId('entity-state-kind-1').selectOption('intermediate');
  await page.getByTestId('entity-state-kind-2').selectOption('terminal');
  await expect(page.getByTestId('entity-state-kind-0')).toHaveValue('initial');
  await expect(page.getByTestId('entity-state-kind-1')).toHaveValue('intermediate');
  await expect(page.getByTestId('entity-state-kind-2')).toHaveValue('terminal');
  await expect(page.getByTestId('entity-state-overview-field')).toHaveCount(3);
  await expect(page.getByTestId('entity-state-diagram')).toContainText('通知状态');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('主状态');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('同步状态');

  await page.getByTestId('entity-state-overview-field-1').click();
  await expect(page.getByTestId('entity-state-field-select')).toHaveValue('主状态');

  const options = await page.getByTestId('entity-state-field-select').locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({ value: node.value, text: node.textContent.trim() })),
  );
  expect(options).toEqual([
    { value: '通知状态', text: '主：通知状态' },
    { value: '主状态', text: '子：主状态' },
    { value: '同步状态', text: '子：同步状态' },
  ]);

  await expect(page.getByTestId('entity-state-diagram')).toContainText('主状态字段');
  const positions = await page.locator('[data-testid^="entity-state-node-"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      kind: node.dataset.stateKind,
      top: parseFloat(node.style.top || '0'),
    })),
  );
  const initialTop = positions.find((item) => item.kind === 'initial').top;
  const intermediateTop = positions.find((item) => item.kind === 'intermediate').top;
  const terminalTop = positions.find((item) => item.kind === 'terminal').top;
  expect(initialTop).toBeLessThan(intermediateTop);
  expect(intermediateTop).toBeLessThan(terminalTop);
});

test('多状态字段切换到下方卡片时会自动滚入可视区', async ({ page, request }) => {
  const documentName = `entity-state-reveal-${Date.now()}`;

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04-23' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: 'Account',
        group: 'Test',
        fields: [
          { name: 'PrimaryStatus', type: 'enum', is_key: false, is_status: true, status_role: 'primary', note: 'Draft/Review/Done', state_nodes: [
            { name: 'Draft', kind: 'initial' },
            { name: 'Review', kind: 'intermediate' },
            { name: 'Done', kind: 'terminal' },
          ] },
          { name: 'SyncStatus', type: 'enum', is_key: false, is_status: true, status_role: 'secondary', note: 'Pending/Running/Done', state_nodes: [
            { name: 'Pending', kind: 'initial' },
            { name: 'Running', kind: 'intermediate' },
            { name: 'Done', kind: 'terminal' },
          ] },
          { name: 'NoticeStatus', type: 'enum', is_key: false, is_status: true, status_role: 'secondary', note: 'Queued/Sending/Sent', state_nodes: [
            { name: 'Queued', kind: 'initial' },
            { name: 'Sending', kind: 'intermediate' },
            { name: 'Sent', kind: 'terminal' },
          ] },
          { name: 'PublishStatus', type: 'enum', is_key: false, is_status: true, status_role: 'secondary', note: 'Ready/Publishing/Published', state_nodes: [
            { name: 'Ready', kind: 'initial' },
            { name: 'Publishing', kind: 'intermediate' },
            { name: 'Published', kind: 'terminal' },
          ] },
          { name: 'ArchiveStatus', type: 'enum', is_key: false, is_status: true, status_role: 'secondary', note: 'Open/Archiving/Archived', state_nodes: [
            { name: 'Open', kind: 'initial' },
            { name: 'Archiving', kind: 'intermediate' },
            { name: 'Archived', kind: 'terminal' },
          ] },
        ],
        state_transitions: [],
      },
    ],
    relations: [],
    rules: [],
  });

  await page.setViewportSize({ width: 1200, height: 760 });
  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-state').click();

  await page.locator('.entity-state-main-shell').evaluate((node) => {
    node.scrollTop = 0;
  });

  await page.getByTestId('entity-state-overview-field-4').click();

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.entity-state-main-shell');
    const target = Array.from(document.querySelectorAll('.entity-state-field-panel'))
      .find((node) => node.dataset.fieldName === 'ArchiveStatus');
    if (!shell || !target) return null;
    const shellRect = shell.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return {
      scrollTop: shell.scrollTop,
      top: targetRect.top - shellRect.top,
      bottom: targetRect.bottom - shellRect.top,
      clientHeight: shell.clientHeight,
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics.scrollTop).toBeGreaterThan(0);
  expect(metrics.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.clientHeight + 1);
  await expect(page.getByTestId('entity-state-field-select')).toHaveValue('ArchiveStatus');
});

test('当前状态字段卡片已可见时重复切换不会额外滚动', async ({ page, request }) => {
  const documentName = `entity-state-reveal-stable-${Date.now()}`;

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04-23' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: 'Account',
        group: 'Test',
        fields: [
          { name: 'PrimaryStatus', type: 'enum', is_key: false, is_status: true, status_role: 'primary', note: 'Draft/Review/Done', state_nodes: [
            { name: 'Draft', kind: 'initial' },
            { name: 'Review', kind: 'intermediate' },
            { name: 'Done', kind: 'terminal' },
          ] },
          { name: 'SyncStatus', type: 'enum', is_key: false, is_status: true, status_role: 'secondary', note: 'Pending/Running/Done', state_nodes: [
            { name: 'Pending', kind: 'initial' },
            { name: 'Running', kind: 'intermediate' },
            { name: 'Done', kind: 'terminal' },
          ] },
          { name: 'NoticeStatus', type: 'enum', is_key: false, is_status: true, status_role: 'secondary', note: 'Queued/Sending/Sent', state_nodes: [
            { name: 'Queued', kind: 'initial' },
            { name: 'Sending', kind: 'intermediate' },
            { name: 'Sent', kind: 'terminal' },
          ] },
          { name: 'PublishStatus', type: 'enum', is_key: false, is_status: true, status_role: 'secondary', note: 'Ready/Publishing/Published', state_nodes: [
            { name: 'Ready', kind: 'initial' },
            { name: 'Publishing', kind: 'intermediate' },
            { name: 'Published', kind: 'terminal' },
          ] },
          { name: 'ArchiveStatus', type: 'enum', is_key: false, is_status: true, status_role: 'secondary', note: 'Open/Archiving/Archived', state_nodes: [
            { name: 'Open', kind: 'initial' },
            { name: 'Archiving', kind: 'intermediate' },
            { name: 'Archived', kind: 'terminal' },
          ] },
        ],
        state_transitions: [],
      },
    ],
    relations: [],
    rules: [],
  });

  await page.setViewportSize({ width: 1200, height: 760 });
  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-state').click();

  await page.getByTestId('entity-state-overview-field-4').click();
  const beforeScrollTop = await page.locator('.entity-state-main-shell').evaluate((node) => node.scrollTop);

  await page.getByTestId('entity-state-overview-field-4').click();
  const afterScrollTop = await page.locator('.entity-state-main-shell').evaluate((node) => node.scrollTop);

  expect(beforeScrollTop).toBeGreaterThan(0);
  expect(Math.abs(afterScrollTop - beforeScrollTop)).toBeLessThanOrEqual(2);
});

test('数据页字段支持行内新增删除和上下移动', async ({ page }) => {
  const documentName = `entity-field-actions-${Date.now()}`;

  await createNewDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-add-entity').click();

  await page.getByTestId('entity-name-input').fill('预约单');
  await page.getByTestId('entity-field-add-button').click();
  await page.getByTestId('entity-field-name-0').fill('预约编号');

  const actionCounts = await page.locator('.field-table tbody tr').evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll('.field-actions button').length),
  );
  expect(actionCounts).toEqual([4]);

  await page.getByTestId('entity-field-add-after-0').click();
  await expect(page.locator('.field-table tbody tr')).toHaveCount(2);
  await page.getByTestId('entity-field-name-1').fill('预约状态');

  let names = await page.locator('[data-testid^="entity-field-name-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(names).toEqual(['预约编号', '预约状态']);

  await page.getByTestId('entity-field-move-down-0').click();
  names = await page.locator('[data-testid^="entity-field-name-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(names).toEqual(['预约状态', '预约编号']);

  await page.getByTestId('entity-field-move-up-1').click();
  names = await page.locator('[data-testid^="entity-field-name-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(names).toEqual(['预约编号', '预约状态']);

  await page.getByTestId('entity-field-add-after-1').click();
  await expect(page.locator('.field-table tbody tr')).toHaveCount(3);
  await page.getByTestId('entity-field-name-2').fill('申请日期');

  await page.getByTestId('entity-field-delete-1').click();
  await expect(page.locator('.field-table tbody tr')).toHaveCount(2);
  names = await page.locator('[data-testid^="entity-field-name-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.value),
  );
  expect(names).toEqual(['预约编号', '申请日期']);
});

test('旧文档中写在字段规则里的状态串会自动进入状态编辑', async ({ page, request }) => {
  const documentName = `entity-state-note-${Date.now()}`;

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: '入库预约',
        group: '仓储仓单管理',
        fields: [
          { name: '状态', type: 'enum', is_key: false, is_status: true, note: '草稿/待审核/已通过/已撤销' },
        ],
        state_transitions: [],
      },
    ],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-state').click();

  await expect(page.getByTestId('entity-state-values-text')).toContainText('草稿/待审核/已通过/已撤销');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('草稿');
  await expect(page.getByTestId('entity-state-diagram')).toContainText('已撤销');
});

test('状态图对自旋和反向流转使用直线折线路径', async ({ page, request }) => {
  const documentName = `entity-state-orthogonal-${Date.now()}`;

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04-23' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: '账号状态',
        group: '账户管理',
        fields: [
          {
            name: '状态',
            type: 'enum',
            is_key: false,
            is_status: true,
            status_role: 'primary',
            note: '启用/禁用',
            state_nodes: [
              { name: '启用', kind: 'initial' },
              { name: '禁用', kind: 'terminal' },
            ],
          },
        ],
        state_transitions: [
          { from: '启用', to: '禁用', action: '流转至禁用', field_name: '状态' },
          { from: '禁用', to: '启用', action: '恢复启用', field_name: '状态' },
          { from: '禁用', to: '禁用', action: '流转', field_name: '状态' },
        ],
      },
    ],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-state').click();

  await expect(page.locator('[data-link-kind="self"]')).toHaveCount(1);
  await expect(page.locator('[data-link-kind="backward"]')).toHaveCount(1);

  const paths = await page.locator('[data-testid="entity-state-graph-link"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      kind: node.dataset.linkKind || '',
      d: node.getAttribute('d') || '',
    })),
  );

  const selfPath = paths.find((item) => item.kind === 'self');
  const backwardPath = paths.find((item) => item.kind === 'backward');

  expect(selfPath).toBeTruthy();
  expect(backwardPath).toBeTruthy();
  expect(selfPath.d.includes('C')).toBeFalsy();
  expect(backwardPath.d.includes('C')).toBeFalsy();
  expect((selfPath.d.match(/L/g) || []).length).toBeGreaterThanOrEqual(3);
  expect((backwardPath.d.match(/L/g) || []).length).toBeGreaterThanOrEqual(3);
  const backwardXs = (backwardPath.d.match(/-?\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter((_, index) => index % 2 === 0);
  expect(new Set(backwardXs).size).toBeGreaterThanOrEqual(2);
});

test('复杂状态场景保持主路径顺序并为跨层流转让出折线通道', async ({ page, request }) => {
  const documentName = `entity-state-complex-${Date.now()}`;

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04-23' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: '预约状态',
        group: '预约管理',
        fields: [
          {
            name: '状态',
            type: 'enum',
            is_key: false,
            is_status: true,
            status_role: 'primary',
            note: '草稿/待审核/已通过/已撤销',
            state_nodes: [
              { name: '草稿', kind: 'initial' },
              { name: '待审核', kind: 'intermediate' },
              { name: '已通过', kind: 'intermediate' },
              { name: '已撤销', kind: 'terminal' },
            ],
          },
        ],
        state_transitions: [
          { from: '草稿', to: '待审核', action: '提交预约', field_name: '状态' },
          { from: '草稿', to: '草稿', action: '流转', field_name: '状态' },
          { from: '待审核', to: '草稿', action: '退回草稿', field_name: '状态' },
          { from: '待审核', to: '已通过', action: '审核通过', field_name: '状态' },
          { from: '待审核', to: '已撤销', action: '驳回预约', field_name: '状态' },
        ],
      },
    ],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-state').click();

  const nodePositions = await page.locator('[data-testid^="entity-state-node-"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      name: node.dataset.stateName || '',
      top: parseFloat(node.style.top || '0'),
    })),
  );
  const topByName = Object.fromEntries(nodePositions.map((item) => [item.name, item.top]));
  expect(topByName['草稿']).toBeLessThan(topByName['待审核']);
  expect(topByName['待审核']).toBeLessThan(topByName['已通过']);
  expect(topByName['已通过']).toBeLessThan(topByName['已撤销']);

  const paths = await page.locator('[data-testid="entity-state-graph-link"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      kind: node.dataset.linkKind || '',
      side: node.dataset.linkSide || '',
      action: node.dataset.linkAction || '',
      d: node.getAttribute('d') || '',
    })),
  );

  const selfPath = paths.find((item) => item.action === '流转');
  const backwardPath = paths.find((item) => item.action === '退回草稿');
  const detourPath = paths.find((item) => item.action === '驳回预约');

  expect(selfPath?.kind).toBe('self');
  expect(backwardPath?.kind).toBe('backward');
  expect(detourPath?.kind).toBe('forward-detour');
  expect(paths.every((item) => !item.d.includes('C'))).toBeTruthy();
  expect(selfPath?.side).toBe('right');
  expect(backwardPath?.side).toBe('left');
  expect(detourPath?.side).toBe('right');
  const detourSegments = (detourPath.d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  expect(detourSegments.length).toBeGreaterThanOrEqual(8);
  for (let index = 0; index <= detourSegments.length - 6; index += 2) {
    const x1 = detourSegments[index];
    const y1 = detourSegments[index + 1];
    const x2 = detourSegments[index + 2];
    const y2 = detourSegments[index + 3];
    expect(x1 === x2 || y1 === y2).toBeTruthy();
  }

  const detourXs = (detourPath.d.match(/-?\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter((_, index) => index % 2 === 0);
  expect(new Set(detourXs).size).toBeGreaterThanOrEqual(2);
});

test('多条回退边会分散到两侧通道，避免同侧堆叠', async ({ page, request }) => {
  const documentName = `entity-state-backward-channel-${Date.now()}`;

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04-23' },
    roles: [],
    language: [],
    processes: [],
    entities: [
      {
        id: 'E1',
        name: '回退通道测试',
        group: '预约管理',
        fields: [
          {
            name: '状态',
            type: 'enum',
            is_key: false,
            is_status: true,
            status_role: 'primary',
            note: '草稿/待审核/已通过/已撤销',
            state_nodes: [
              { name: '草稿', kind: 'initial' },
              { name: '待审核', kind: 'intermediate' },
              { name: '已通过', kind: 'intermediate' },
              { name: '已撤销', kind: 'terminal' },
            ],
          },
        ],
        state_transitions: [
          { from: '草稿', to: '待审核', action: '提交预约', field_name: '状态' },
          { from: '待审核', to: '已通过', action: '审核通过', field_name: '状态' },
          { from: '已通过', to: '已撤销', action: '完成撤销', field_name: '状态' },
          { from: '待审核', to: '草稿', action: '短回退', field_name: '状态' },
          { from: '已撤销', to: '草稿', action: '长回退', field_name: '状态' },
        ],
      },
    ],
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-state').click();

  const paths = await page.locator('[data-testid="entity-state-graph-link"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      kind: node.dataset.linkKind || '',
      side: node.dataset.linkSide || '',
      action: node.dataset.linkAction || '',
      d: node.getAttribute('d') || '',
    })),
  );

  const shortBackward = paths.find((item) => item.action === '短回退');
  const longBackward = paths.find((item) => item.action === '长回退');
  expect(shortBackward?.kind).toBe('backward');
  expect(longBackward?.kind).toBe('backward');
  expect(shortBackward?.side).toBeTruthy();
  expect(longBackward?.side).toBeTruthy();
  expect(shortBackward?.side).not.toBe(longBackward?.side);
});

test('左侧实体列表切换时保留列表滚动位置', async ({ page, request }) => {
  const documentName = `entity-state-browser-scroll-${Date.now()}`;
  const entities = Array.from({ length: 60 }, (_, index) => ({
    id: `E${index + 1}`,
    name: `实体${index + 1}`,
    group: index < 20 ? 'A组' : (index < 40 ? 'B组' : 'C组'),
    fields: [
      {
        name: '状态',
        type: 'enum',
        is_key: false,
        is_status: true,
        status_role: 'primary',
        note: '草稿/已完成',
        state_nodes: [
          { name: '草稿', kind: 'initial' },
          { name: '已完成', kind: 'terminal' },
        ],
      },
    ],
    state_transitions: [
      { from: '草稿', to: '已完成', action: '完成', field_name: '状态' },
    ],
  }));

  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: '', date: '2026-04-23' },
    roles: [],
    language: [],
    processes: [],
    entities,
    relations: [],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-switch-state').click();

  await page.locator('.entity-state-browser').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const beforeScrollTop = await page.locator('.entity-state-browser').evaluate((node) => node.scrollTop);
  await page.locator('.entity-state-chip').nth(59).click();
  const afterScrollTop = await page.locator('.entity-state-browser').evaluate((node) => node.scrollTop);

  expect(beforeScrollTop).toBeGreaterThan(0);
  expect(Math.abs(afterScrollTop - beforeScrollTop)).toBeLessThanOrEqual(4);
});
