import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import { ApplicationWorkbenchComponent } from './app-workbench';

describe('ApplicationWorkbenchComponent', () => {
  let fixture: ComponentFixture<ApplicationWorkbenchComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    const runtime = getAngularRuntimeState();
    runtime.modified = false;
    runtime.currentFile = 'application-workbench-test.json';
    runtime.ui['applicationWorkbenchTab'] = 'service';
    runtime.doc = {
      meta: { domain: 'Application Workbench Test' },
      serviceGroups: [
        { uid: 'service-group-1', name: '订单服务', desc: '' },
        { uid: 'service-group-2', name: '库存服务', desc: '' },
      ],
      services: [{
        uid: 'svc-1',
        name: '提交订单',
        serviceGroupUid: 'service-group-1',
        method: 'POST',
        path: '/orders',
        desc: '',
        requestParams: [],
        responseParams: [],
        parameterMappings: [],
        nodeRefs: [],
      }, {
        uid: 'svc-2',
        name: '查询库存',
        serviceGroupUid: 'service-group-2',
        method: 'GET',
        path: '/stock',
        desc: '',
        requestParams: [],
        responseParams: [],
        parameterMappings: [],
        nodeRefs: [],
      }],
      taskDefinitions: [
        {
          uid: 'task-1',
          name: '保存订单',
          parameters: {
            inputs: [{ name: 'orderId', type: 'String', required: true, note: '' }],
            outputs: [{ name: 'savedId', type: 'String', required: false, note: '' }],
          },
        },
        {
          uid: 'task-2',
          name: '创建待办',
          parameters: {
            inputs: [{ name: 'savedId', type: 'String', required: true, note: '' }],
            outputs: [{ name: 'todoId', type: 'String', required: false, note: '' }],
          },
        },
      ],
      processes: [],
      businessComponents: [],
      businessConstructs: [],
      entities: [],
      roles: [],
      stages: [],
      terms: [],
      rules: [],
    };

    await TestBed.configureTestingModule({
      imports: [ApplicationWorkbenchComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ApplicationWorkbenchComponent);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('uses the shared workbench tab shell and keeps the editor toggle visible', () => {
    expect(host.querySelector('.proc-view-toolbar .view-toggle-group .vtb.active')?.textContent).toContain('应用服务');
    const toggle = Array.from(host.querySelectorAll<HTMLButtonElement>('.proc-view-actions button')).find((button) => button.textContent?.includes('打开编辑'));
    expect(toggle?.textContent).toContain('打开编辑');

    toggle?.click();
    fixture.detectChanges();
    expect(host.querySelector('.proc-view-actions')?.textContent).toContain('关闭编辑');
    expect(host.querySelector('.app-workbench')?.classList.contains('editing-open')).toBe(true);
  });

  it('keeps application editing open while switching third-level tabs', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.textContent).toContain('关闭编辑');

    host.querySelector<HTMLButtonElement>('[data-testid="application-orchestration-tab"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.textContent).toContain('关闭编辑');
    expect(host.querySelector('.app-workbench')?.classList.contains('editing-open')).toBe(true);
  });

  it('renders application services as service group cards and interface summary cards', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.services[0].requestParams = [{ name: 'orderId', type: 'String', required: true, note: '' }];
    runtime.doc.services[0].responseParams = [{ name: 'result', type: 'Object', required: false, note: '' }];
    runtime.doc.services[0].nodeRefs = ['node-submit'];
    runtime.doc.services[0].orchestration = {
      variables: [],
      steps: [{ uid: 'step-1', name: '保存订单', stepAlias: 'step1', taskDefinitionUid: 'task-1', inputMapping: [], outputMapping: [] }],
      returnMapping: [],
    };
    runtime.doc.processes = [{ uid: 'process-1', name: '订单流程', nodes: [{ uid: 'node-submit', name: '提交订单' }] }];

    fixture.detectChanges();

    const group = host.querySelector('[data-testid="service-group-card-service-group-1"]');
    expect(group?.textContent).toContain('订单服务');
    expect(group?.textContent).toContain('1');

    const card = host.querySelector('[data-testid="interface-card-svc-1"]');
    expect(card?.textContent).toContain('POST');
    expect(card?.textContent).toContain('/orders');
    expect(card?.textContent).toContain('提交订单');
    expect(card?.textContent).toContain('请求 1');
    expect(card?.textContent).toContain('响应 1');
    expect(card?.textContent).toContain('编排 1');
    expect(card?.textContent).toContain('节点 1');
    expect(host.querySelector('.svc-params-table')).toBeFalsy();
  });

  it('paginates the interface list by eight items and sorts interfaces by name', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.services = Array.from({ length: 12 }, (_, index) => {
      const name = `Interface ${String(12 - index).padStart(2, '0')}`;
      return {
        uid: `svc-page-${index + 1}`,
        name,
        serviceGroupUid: 'service-group-1',
        method: 'POST',
        path: `/api/${name.toLowerCase().replaceAll(' ', '-')}`,
        desc: '',
        requestParams: [],
        responseParams: [],
        parameterMappings: [],
        nodeRefs: [],
      };
    });
    fixture.detectChanges();

    const firstPageNames = Array.from(host.querySelectorAll<HTMLElement>('[data-testid^="interface-card-"] strong'))
      .map((item) => item.textContent?.trim());
    expect(firstPageNames).toHaveLength(8);
    expect(firstPageNames).toEqual([
      'Interface 01',
      'Interface 02',
      'Interface 03',
      'Interface 04',
      'Interface 05',
      'Interface 06',
      'Interface 07',
      'Interface 08',
    ]);
    expect(host.querySelector('[data-testid="application-interface-pagination"]')?.textContent).toContain('1 / 2');

    host.querySelector<HTMLButtonElement>('[data-testid="application-interface-page-next"]')?.click();
    fixture.detectChanges();

    const secondPageNames = Array.from(host.querySelectorAll<HTMLElement>('[data-testid^="interface-card-"] strong'))
      .map((item) => item.textContent?.trim());
    expect(secondPageNames).toEqual(['Interface 09', 'Interface 10', 'Interface 11', 'Interface 12']);
  });

  it('keeps ungrouped interfaces pinned above named service groups', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.services.push({
      uid: 'svc-ungrouped',
      name: '未归属接口',
      method: 'POST',
      path: '/ungrouped',
      desc: '',
      requestParams: [],
      responseParams: [],
      parameterMappings: [],
      nodeRefs: [],
    });
    fixture.detectChanges();

    const navItems = Array.from(host.querySelectorAll<HTMLElement>('[data-testid="service-group-rail"] .app-service-nav-item'))
      .map((item) => item.textContent?.replace(/\s+/g, ''));
    expect(navItems.slice(0, 3).join('|')).toContain('全部服务3|未分组接口1|订单服务1');
  });

  it('shows interface details in read-only mode when editing is closed', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.services[0].requestParams = [
      { name: 'orderId', type: 'String', required: true, note: 'order id note' },
    ];
    runtime.doc.services[0].responseParams = [
      { name: 'result', type: 'Object', required: false, note: 'result note' },
    ];
    host.querySelector<HTMLElement>('[data-testid="interface-card-svc-1"]')?.click();
    fixture.detectChanges();

    const detail = host.querySelector('[data-testid="application-interface-detail"]');
    expect(detail?.textContent).toContain('提交订单');
    expect(detail?.textContent).toContain('/orders');
    expect(detail?.textContent).toContain('请求参数');
    expect(detail?.textContent).toContain('响应参数');
    expect(detail?.textContent).toContain('orderId');
    expect(detail?.textContent).toContain('String');
    expect(detail?.textContent).toContain('必填');
    expect(detail?.textContent).toContain('order id note');
    expect(detail?.querySelectorAll('.app-param-table th')).toHaveLength(8);
    expect(host.querySelector('[data-testid="service-interface-drawer"]')).toBeFalsy();
    expect(detail?.querySelector('input')).toBeFalsy();
  });

  it('shows linked node names in interface details and jumps to the node view', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.services[0].nodeRefs = ['node-submit'];
    runtime.doc.processes = [{ uid: 'process-1', name: '订单流程', nodes: [{ uid: 'node-submit', name: '提交订单节点' }] }];
    fixture.detectChanges();
    host.querySelector<HTMLElement>('[data-testid="interface-card-svc-1"]')?.click();
    fixture.detectChanges();

    const nodeLink = host.querySelector<HTMLButtonElement>('[data-testid="application-linked-node-node-submit"]');
    expect(nodeLink?.textContent).toContain('提交订单节点');

    nodeLink?.click();
    fixture.detectChanges();
    expect(runtime.ui['mainTab']).toBe('processWorkbench');
    expect(runtime.ui['processWorkbenchTab']).toBe('node');
    expect(runtime.ui['procId']).toBe('process-1');
    expect(runtime.ui['taskId']).toBe('node-submit');
  });

  it('keeps application service columns as independent scroll regions', () => {
    const nav = host.querySelector<HTMLElement>('[data-testid="service-group-rail"]');
    const list = host.querySelector<HTMLElement>('[data-testid="application-interface-list"]');
    const detail = host.querySelector<HTMLElement>('[data-testid="application-interface-detail"]');

    expect(getComputedStyle(nav!).overflowY).toBe('auto');
    expect(getComputedStyle(list!).overflowY).toBe('auto');
    expect(getComputedStyle(detail!).overflowY).toBe('auto');
  });

  it('keeps application service mutations read-only until the editor is opened', () => {
    expect(host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.textContent).toContain('打开编辑');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-group-new"]')).toBeFalsy();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-interface-new"]')).toBeFalsy();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-group-edit-service-group-1"]')).toBeFalsy();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-group-add-interface-service-group-1"]')).toBeFalsy();
    expect(host.querySelector('.svc-params-table')).toBeFalsy();

    const beforeServices = getAngularRuntimeState().doc.services.length;
    (fixture.componentInstance as any).createService();
    (fixture.componentInstance as any).openServiceGroupDrawer(getAngularRuntimeState().doc.serviceGroups[0]);
    fixture.detectChanges();

    expect(getAngularRuntimeState().doc.services).toHaveLength(beforeServices);
    expect(host.querySelector('[data-testid="service-group-drawer"]')).toBeFalsy();

    host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.textContent).toContain('关闭编辑');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-group-new"]')).toBeTruthy();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-interface-new"]')).toBeTruthy();
    host.querySelector<HTMLButtonElement>('[data-testid="service-group-card-service-group-1"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-group-edit-service-group-1"]')).toBeTruthy();
  });

  it('rejects reserved ungrouped service name when creating a service group', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="service-group-new"]')?.click();
    fixture.detectChanges();

    const name = host.querySelector<HTMLInputElement>('[data-testid="service-group-drawer-name"]')!;
    name.value = '未分组接口';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="service-group-drawer-save"]')?.click();
    fixture.detectChanges();

    expect(getAngularRuntimeState().doc.serviceGroups.map((group: any) => group.name)).not.toContain('未分组接口');
    expect(host.querySelector('[data-testid="service-group-name-error"]')?.textContent).toContain('未分组接口是系统保留名称');
  });

  it('centers the interface editor and keeps backdrop clicks from closing it', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="interface-edit-svc-1"]')?.click();
    fixture.detectChanges();

    const overlay = host.querySelector<HTMLElement>('[data-testid="service-interface-drawer"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.classList.contains('app-service-modal-overlay')).toBe(true);
    expect(getComputedStyle(overlay!).justifyContent).toBe('center');

    overlay?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="service-interface-drawer"]')).toBeTruthy();
  });

  it('uses a compact auto-save interface editor with header delete and no footer save actions', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="interface-edit-svc-1"]')?.click();
    fixture.detectChanges();

    const drawer = host.querySelector<HTMLElement>('[data-testid="service-interface-drawer"]')!;
    expect(drawer.querySelector('[data-testid="service-save-svc-1"]')).toBeFalsy();
    expect(drawer.querySelector('.drawer-actions')).toBeFalsy();
    expect(drawer.querySelector('[data-testid="interface-delete-svc-1"]')).toBeTruthy();
    expect(drawer.querySelector('.drawer-head [data-testid="interface-delete-svc-1"]')).toBeTruthy();
    expect(drawer.querySelector<HTMLSelectElement>('[data-testid="interface-method-svc-1"]')?.classList.contains('svc-method-select')).toBe(true);
    expect(drawer.querySelector<HTMLInputElement>('[data-testid="interface-name-svc-1"]')?.classList.contains('svc-edit-name')).toBe(true);
    expect(drawer.querySelector<HTMLInputElement>('[data-testid="interface-path-svc-1"]')?.classList.contains('svc-edit-path')).toBe(true);
    const note = drawer.querySelector<HTMLTextAreaElement>('[data-testid="interface-desc-svc-1"]')!;
    expect(note.rows).toBe(1);
    expect(note.classList.contains('svc-edit-note--compact')).toBe(true);
  });

  it('switches interface parameters between list and json views', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.services[0].requestParams = [{ name: 'orderId', type: 'String', required: true, note: 'order id' }];
    host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="interface-edit-svc-1"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="service-request-param-name-0"]')).toBeTruthy();
    host.querySelector<HTMLButtonElement>('[data-testid="service-param-json-view-requestParams"]')?.click();
    fixture.detectChanges();

    const json = host.querySelector<HTMLTextAreaElement>('[data-testid="service-param-json-requestParams"]');
    expect(json).toBeTruthy();
    expect(json?.value).toContain('orderId');
    expect(host.querySelector('[data-testid="service-request-param-name-0"]')).toBeFalsy();

    json!.value = '[{"name":"customerId","type":"String","required":false,"note":"customer"}]';
    json!.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(runtime.doc.services[0].requestParams[0].name).toBe('customerId');

    host.querySelector<HTMLButtonElement>('[data-testid="service-param-list-view-requestParams"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector<HTMLInputElement>('[data-testid="service-request-param-name-0"]')?.value).toBe('customerId');
  });

  it('offers add move up move down and delete actions for interface parameters', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.services[0].requestParams = [
      { name: 'first', type: 'String', required: false, note: '' },
      { name: 'second', type: 'String', required: false, note: '' },
    ];
    host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="interface-edit-svc-1"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="service-request-param-add-0"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="service-request-param-up-1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="service-request-param-down-0"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="service-request-param-delete-0"]')).toBeTruthy();

    host.querySelector<HTMLButtonElement>('[data-testid="service-request-param-up-1"]')?.click();
    fixture.detectChanges();
    expect(runtime.doc.services[0].requestParams.map((param: any) => param.name)).toEqual(['second', 'first']);

    host.querySelector<HTMLButtonElement>('[data-testid="service-request-param-add-0"]')?.click();
    fixture.detectChanges();
    expect(runtime.doc.services[0].requestParams).toHaveLength(3);
  });

  it('uses task definition parameters as orchestration mapping targets', () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['applicationWorkbenchTab'] = 'orchestration';
    runtime.doc.services[0].requestParams = [{ name: 'orderId', type: 'String', required: true, note: '' }];
    runtime.doc.services[0].orchestration = {
      variables: [],
      steps: [{ uid: 'step-1', name: '保存订单', stepAlias: 'step1', taskDefinitionUid: 'task-1', inputMapping: [{ source: '', target: '' }], outputMapping: [] }],
      returnMapping: [],
    };
    fixture = TestBed.createComponent(ApplicationWorkbenchComponent);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-testid="application-editor-toggle"]')?.click();
    fixture.detectChanges();
    (fixture.componentInstance as any).selectOrchestrationService('svc-1');
    fixture.detectChanges();

    const targetOptions = Array.from(host.querySelectorAll<HTMLOptionElement>('[data-testid="mapping-input-target-step-1-0"] option'))
      .map((option) => option.value);
    expect(targetOptions).toContain('orderId');
    expect(targetOptions).not.toContain('manualOnlyParam');
    expect(host.querySelector('[data-testid="required-param-warning-step-1-orderId"]')?.textContent).toContain('必填未映射');
  });

  it('cascades orchestration interface selection by application service and labels steps as tasks', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="application-orchestration-tab"]')?.click();
    fixture.detectChanges();

    const groupSelect = host.querySelector<HTMLSelectElement>('[data-testid="orchestration-service-group-select"]');
    const interfaceSelect = host.querySelector<HTMLSelectElement>('[data-testid="orchestration-service-select"]');
    expect(groupSelect).toBeTruthy();
    expect(host.querySelector('.orch-toolbar')?.textContent).toContain('应用服务');
    expect(host.querySelector('.orch-toolbar')?.textContent).toContain('应用接口');

    groupSelect!.value = 'service-group-2';
    groupSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const cascadedInterfaceSelect = host.querySelector<HTMLSelectElement>('[data-testid="orchestration-service-select"]');
    expect(cascadedInterfaceSelect?.value).toBe('svc-2');
    expect(Array.from(cascadedInterfaceSelect!.options).map((option) => option.value)).toEqual(['svc-2']);
    expect(host.querySelector('[data-testid="orchestration-step-list"]')?.textContent).toContain('编排任务');
    expect(host.querySelector('[data-testid="orchestration-step-list"]')?.textContent).not.toContain('编排步骤');
  });

  it('warns before reordering steps and clears mappings whose source is no longer in context', async () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['applicationWorkbenchTab'] = 'orchestration';
    runtime.doc.services[0].requestParams = [{ name: 'orderId', type: 'String', required: true, note: '' }];
    runtime.doc.services[0].orchestration = {
      variables: [],
      steps: [
        { uid: 'step-1', name: '保存订单', stepAlias: 'step1', taskDefinitionUid: 'task-1', inputMapping: [], outputMapping: [] },
        { uid: 'step-2', name: '创建待办', stepAlias: 'step2', taskDefinitionUid: 'task-2', inputMapping: [{ source: 'step.step1.output.savedId', target: 'savedId' }], outputMapping: [] },
      ],
      returnMapping: [],
    };
    const confirmations: string[] = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      confirmations.push(detail.message);
      detail.markHandled();
      detail.resolve(true);
    };
    window.addEventListener('blm-runtime-confirm', listener);
    try {
      fixture = TestBed.createComponent(ApplicationWorkbenchComponent);
      fixture.detectChanges();
      host = fixture.nativeElement as HTMLElement;
      (fixture.componentInstance as any).editorOpen.set(true);
      (fixture.componentInstance as any).selectOrchestrationService('svc-1');
      await (fixture.componentInstance as any).moveStep(runtime.doc.services[0], 1, -1);
      fixture.detectChanges();
    } finally {
      window.removeEventListener('blm-runtime-confirm', listener);
    }

    expect(confirmations[0]).toContain('输入映射可能需要重新设置');
    const steps = runtime.doc.services[0].orchestration.steps;
    expect(steps.map((step: any) => step.uid)).toEqual(['step-2', 'step-1']);
    expect(steps[0].inputMapping[0].source).toBe('');
    expect(host.querySelector('[data-testid="mapping-source-warning-step-2-0"]')?.textContent).toContain('来源已失效');
  });
});
