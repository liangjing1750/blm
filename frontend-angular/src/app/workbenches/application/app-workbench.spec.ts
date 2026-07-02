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
      taskDefinitions: [{ uid: 'task-1', name: '保存订单', parameters: { inputs: [], outputs: [] } }],
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
    expect(group?.textContent).toContain('1 个接口');

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

  it('opens an interface drawer in read-only mode when editing is closed', () => {
    host.querySelector<HTMLElement>('[data-testid="interface-card-svc-1"]')?.click();
    fixture.detectChanges();

    const drawer = host.querySelector('[data-testid="service-interface-drawer"]');
    expect(drawer?.textContent).toContain('提交订单');
    expect(drawer?.textContent).toContain('/orders');
    expect(drawer?.textContent).toContain('请求参数');
    expect(drawer?.textContent).toContain('响应参数');
    expect(drawer?.querySelector('input')).toBeFalsy();
    expect(drawer?.querySelector('[data-testid^="service-save-"]')).toBeFalsy();
  });

  it('keeps service toolbar actions visible without inline parameter editing', () => {
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-group-new"]')).toBeTruthy();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="service-interface-new"]')).toBeTruthy();
    expect(host.querySelector('.svc-params-table')).toBeFalsy();
  });
});
