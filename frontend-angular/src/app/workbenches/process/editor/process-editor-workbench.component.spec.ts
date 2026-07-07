import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAngularRuntimeState } from '../../../core/runtime/angular-runtime';
import { ProcessEditorWorkbenchComponent } from './process-editor-workbench.component';

describe('ProcessEditorWorkbenchComponent', () => {
  let fixture: ComponentFixture<ProcessEditorWorkbenchComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    const runtime = getAngularRuntimeState();
    runtime.modified = false;
    runtime.currentFile = 'process-editor-node-test.json';
    runtime.ui = { procId: 'proc-1', taskId: 'task-1', procView: 'node' };
    runtime.doc = {
      meta: { domain: 'Process Editor Test' },
      processes: [{
        uid: 'proc-1',
        id: 'proc-1',
        name: '测试流程',
        nodes: [{
          uid: 'task-1',
          id: 'task-1',
          name: '测试节点',
          roleIds: [],
          userSteps: [],
          entity_ops: [],
          businessRules: [{ uid: 'rule-1', name: '规则', content: '规则内容' }],
          forms: [{
            uid: 'form-1',
            name: '测试表单',
            sections: [{
              uid: 'section-1',
              name: '基本信息',
              serviceUids: ['svc-selected'],
              serviceIds: ['svc-selected'],
              fields: [],
            }],
          }],
        }],
      }],
      serviceGroups: [
        { uid: 'service-group-selected', name: '已选服务' },
        { uid: 'service-group-other', name: '未选服务' },
      ],
      services: [
        { uid: 'svc-selected', name: '已选接口', serviceGroupUid: 'service-group-selected', method: 'POST', path: '/selected', nodeRefs: ['task-1'] },
        { uid: 'svc-other', name: '未选接口', serviceGroupUid: 'service-group-other', method: 'POST', path: '/other', nodeRefs: ['task-1'] },
      ],
      roles: [],
      entities: [],
      taskDefinitions: [],
      stages: [],
    };

    await TestBed.configureTestingModule({
      imports: [ProcessEditorWorkbenchComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProcessEditorWorkbenchComponent);
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('filters service groups when viewing only selected form-section interfaces', () => {
    host.querySelector<HTMLButtonElement>('.task-form-service-select')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="task-form-section-service-selected-only"]')?.click();
    fixture.detectChanges();

    const groupText = Array.from(host.querySelectorAll<HTMLElement>('.task-form-service-groups button'))
      .map((button) => button.textContent || '')
      .join('\n');

    expect(groupText).toContain('已选服务');
    expect(groupText).not.toContain('未选服务');
  });

  it('locks the section interface picker to selected services when the node view is read-only', () => {
    fixture.componentRef.setInput('editing', false);
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('.task-form-service-select')?.click();
    fixture.detectChanges();

    const selectedOnly = host.querySelector<HTMLButtonElement>('[data-testid="task-form-section-service-selected-only"]');
    expect(selectedOnly?.classList.contains('active')).toBe(true);
    expect(selectedOnly?.disabled).toBe(true);

    selectedOnly?.click();
    fixture.detectChanges();

    const groupText = Array.from(host.querySelectorAll<HTMLElement>('.task-form-service-groups button'))
      .map((button) => button.textContent || '')
      .join('\n');
    expect(groupText).toContain('已选服务');
    expect(groupText).not.toContain('未选服务');
  });

  it('clears all legacy role fields when unselecting a node role', () => {
    const runtime = getAngularRuntimeState();
    const task = (runtime.doc as any).processes[0].nodes[0];
    const role = { uid: 'role-a', id: 'role-a', name: '经办人' };
    (runtime.doc as any).roles = [role];
    task.roleIds = ['role-a'];
    task.role_ids = ['role-a'];
    task.role_uids = ['role-a'];
    task.role_uid = 'role-a';
    task.roles = ['经办人'];
    task.role_id = 'role-a';
    task.role = '经办人';

    (fixture.componentInstance as any).toggleTaskRole(task, role, false);

    expect(task.roleIds).toEqual([]);
    expect(task.role_ids).toEqual([]);
    expect(task.role_uids).toEqual([]);
    expect(task.role_uid).toBe('');
    expect(task.roles).toEqual([]);
    expect(task.role_id).toBe('');
    expect(task.role).toBe('');
    expect(runtime.modified).toBe(true);
  });

  it('raises the material card above the rule card while the section service picker is open', () => {
    host.querySelector<HTMLButtonElement>('.task-form-service-select')?.click();
    fixture.detectChanges();

    const materialCard = host.querySelector<HTMLElement>('.node-editor-card--material');
    const ruleCard = host.querySelector<HTMLElement>('.node-editor-card--rule');
    const menu = host.querySelector<HTMLElement>('[data-testid="task-form-section-service-menu"]');

    expect(menu).toBeTruthy();
    expect(ruleCard).toBeTruthy();
    expect(getComputedStyle(materialCard!).overflow).toBe('visible');
    expect(Number(getComputedStyle(materialCard!).zIndex)).toBeGreaterThan(Number(getComputedStyle(ruleCard!).zIndex || 0));
  });

  it('summarizes form-section application interfaces in the more panel with reuse counts and jump action', () => {
    const runtime = getAngularRuntimeState();
    const task = (runtime.doc as any).processes[0].nodes[0];
    task.forms[0].sections.push({
      uid: 'section-2',
      name: '复用分组',
      serviceUids: ['svc-selected'],
      serviceIds: ['svc-selected'],
      fields: [],
    });

    host.querySelector<HTMLButtonElement>('.node-progress-more')?.click();
    fixture.detectChanges();

    const rows = host.querySelectorAll<HTMLElement>('[data-testid="process-node-service-usage-row"]');
    const serviceCount = host.querySelector<HTMLElement>('[data-testid="process-node-service-group-count"]');
    const interfaceCount = host.querySelector<HTMLElement>('[data-testid="process-node-service-interface-count"]');
    const tableText = host.querySelector<HTMLElement>('[data-testid="process-node-service-usage-table"]')?.textContent || '';

    expect(rows.length).toBe(1);
    expect(tableText).toContain('测试节点');
    expect(tableText).toContain('已选服务');
    expect(tableText).toContain('已选接口');
    expect(serviceCount?.textContent?.trim()).toBe('2');
    expect(interfaceCount?.textContent?.trim()).toBe('2');

    host.querySelector<HTMLButtonElement>('[data-testid="process-node-service-interface-jump"]')?.click();

    expect(runtime.ui['mainTab']).toBe('applicationWorkbench');
    expect(runtime.ui['applicationWorkbenchTab']).toBe('service');
    expect(runtime.ui['applicationServiceUid']).toBe('svc-selected');
  });
});
