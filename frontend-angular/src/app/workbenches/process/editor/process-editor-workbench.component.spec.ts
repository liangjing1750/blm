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
          businessRules: [],
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
});
