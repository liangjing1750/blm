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

  it('polishes service editing and all add buttons mutate the model', () => {
    Array.from(host.querySelectorAll<HTMLButtonElement>('.comp-toolbar button')).find((button) => button.textContent?.includes('新建服务'))?.click();
    fixture.detectChanges();
    expect(getAngularRuntimeState().doc.serviceGroups.length).toBe(2);

    Array.from(host.querySelectorAll<HTMLButtonElement>('.comp-toolbar button')).find((button) => button.textContent?.includes('新建接口'))?.click();
    fixture.detectChanges();
    const draft = getAngularRuntimeState().doc.services.find((service: any) => service.uid === 'draft');
    expect(draft).toBeTruthy();
    expect(host.querySelector('.svc-edit-body')).toBeTruthy();

    host.querySelectorAll<HTMLButtonElement>('.svc-params-head-actions button:last-child').forEach((button) => button.click());
    fixture.detectChanges();

    expect(draft.requestParams).toHaveLength(1);
    expect(draft.responseParams).toHaveLength(1);
  });
});
