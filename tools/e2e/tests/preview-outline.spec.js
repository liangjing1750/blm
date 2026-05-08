const { test, expect } = require('@playwright/test');

const { createDocument, openDocument } = require('./support/app-helpers');

test('预览页提供大纲视图并支持跳转', async ({ page, request }) => {
  const documentName = `preview-outline-${Date.now()}`;
  await createDocument(request, documentName, {
    meta: { title: documentName, domain: documentName, author: 'tester', date: '2026-04' },
    roles: [{ id: 'R1', name: '仓库管理员', group: '业务参与方' }],
    language: [{ term: '预约', definition: '入库前的预约仓单' }],
    stages: [
      { id: 'S1', name: '预约阶段', subDomain: '示例平台', panoramaColumnId: 'businessHandling', panoramaLaneId: 'smart-platform-phase2', processLinks: [] },
    ],
    stageLinks: [],
    stageFlowRefs: [
      { id: 'SFR1', stageId: 'S1', processId: 'P1', order: 1, pos: { x: 0, y: 0 } },
      { id: 'SFR2', stageId: 'S1', processId: 'P2', order: 2, pos: { x: 0, y: 0 } },
    ],
    stageFlowLinks: [{ id: 'SFL1', stageId: 'S1', fromRefId: 'SFR1', toRefId: 'SFR2' }],
    processes: [
      {
        id: 'P1',
        name: '入库预约管理',
        trigger: '客户发起预约',
        outcome: '预约进入审核',
        tasks: [
          {
            id: 'T1',
            name: '提交预约',
            role_id: 'R1',
            steps: [
              { name: '填写预约单', type: 'Fill', note: '填写时间、数量、货物信息' },
              { name: '提交审核', type: 'Mutate', note: '提交后生成待审核任务' },
            ],
            forms: [
              {
                id: 'F1',
                name: '预约提交表单',
                entity_id: 'E1',
                purpose: '新增预约',
                sections: [
                  {
                    id: 'SEC1',
                    name: '基本信息',
                    note: '提交时填写',
                    fields: [
                      { id: 'FLD1', name: '预约编号', type: 'Text', required: true, entity_field: '预约编号', note: '系统生成' },
                    ],
                  },
                ],
              },
            ],
            orchestrationTasks: [
              { name: '保存预约信息', type: 'Service', target: '预约服务', note: '写入预约草稿' },
            ],
            entity_ops: [{ entity_id: 'E1', ops: ['C', 'U'] }],
            rules_note: '预约数量不能超过可用仓容',
          },
        ],
      },
      {
        id: 'P2',
        name: '入库办理',
        trigger: '预约审核通过',
        outcome: '形成现货仓单',
        tasks: [
          {
            id: 'T2',
            name: '确认到货',
            role_id: 'R1',
            steps: [
              { name: '登记到货', type: 'Fill', note: '登记车船号、批次号' },
              { name: '生成仓单', type: 'Mutate', note: '回写现货仓单状态' },
            ],
            entity_ops: [{ entity_id: 'E2', ops: ['C', 'U'] }],
            rules_note: '入库完成后自动生成仓单',
          },
        ],
      },
    ],
    entities: [
      {
        id: 'E1',
        name: '入库预约',
        group: '仓储仓单管理',
        fields: [
          { name: '预约编号', type: 'id', is_key: true, is_status: false, note: '' },
          { name: '状态', type: 'enum', is_key: false, is_status: true, state_values: '草稿/待审核/已通过/已撤销', note: '' },
        ],
        state_transitions: [
          { from: '草稿', to: '待审核', action: '提交预约', note: '客户提交后进入仓库审核', field_name: '状态' },
        ],
      },
      {
        id: 'E2',
        name: '现货仓单',
        group: '仓储仓单管理',
        fields: [
          { name: '仓单编号', type: 'id', is_key: true, is_status: false, note: '' },
          { name: '状态', type: 'enum', is_key: false, is_status: true, state_values: '在库/待出库/已出库', note: '' },
        ],
        state_transitions: [
          { from: '在库', to: '待出库', action: '发起出库', note: '出库申请通过后进入待出库', field_name: '状态' },
        ],
      },
    ],
    relations: [{ from: 'E1', to: 'E2', type: '1:N', label: '生成' }],
    rules: [],
  });

  await page.goto('/');
  await openDocument(page, documentName);
  await page.getByTestId('tab-preview').click();

  const previewRendered = page.locator('#preview-rendered');
  await expect(page.locator('#preview-outline')).toContainText('大纲视图');
  await expect(page.locator('#preview-outline')).toContainText('全景与阶段视图');
  await expect(page.locator('#preview-outline')).toContainText('全景视图');
  await expect(page.locator('#preview-outline')).toContainText('流程视图');
  await expect(page.locator('#preview-outline')).toContainText('E2 现货仓单');
  await expect(page.getByTestId('preview-stage-panorama')).toBeVisible();
  await expect(page.getByTestId('preview-role-usecase-section')).toBeVisible();
  await expect(page.getByTestId('role-usecase-map')).toHaveCount(2);
  await expect(page.getByTestId('preview-entity-state-graph')).toHaveCount(2);
  await expect(previewRendered).toContainText('阶段视图');
  await expect(previewRendered).toContainText('流程节点 T1');
  await expect(previewRendered).toContainText('节点任务');
  await expect(previewRendered).toContainText('保存预约信息');
  await expect(previewRendered).toContainText('表单模型');
  await expect(previewRendered).toContainText('预约提交表单');

  const initialScrollTop = await previewRendered.evaluate((el) => el.scrollTop);
  expect(initialScrollTop).toBe(0);
  await page.locator('.preview-outline-link', { hasText: 'E2 现货仓单' }).click();
  await page.waitForFunction(() => document.getElementById('preview-rendered')?.scrollTop > 50);
});
