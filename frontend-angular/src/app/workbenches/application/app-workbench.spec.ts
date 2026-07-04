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
      serviceGroups: [{ uid: 'service-group-1', name: '订单服务', desc: '' }],
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

  it('shows interface details in read-only mode when editing is closed', () => {
    host.querySelector<HTMLElement>('[data-testid="interface-card-svc-1"]')?.click();
    fixture.detectChanges();

    const detail = host.querySelector('[data-testid="application-interface-detail"]');
    expect(detail?.textContent).toContain('提交订单');
    expect(detail?.textContent).toContain('/orders');
    expect(detail?.textContent).toContain('请求参数');
    expect(detail?.textContent).toContain('响应参数');
    expect(host.querySelector('[data-testid="service-interface-drawer"]')).toBeFalsy();
    expect(detail?.querySelector('input')).toBeFalsy();
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
