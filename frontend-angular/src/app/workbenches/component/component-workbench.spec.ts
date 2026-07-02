import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import { ComponentWorkbenchComponent } from './component-workbench';
import { EntityDesignWorkbenchComponent } from './entity-design/entity-design-workbench.component';

describe('ComponentWorkbenchComponent', () => {
  let fixture: ComponentFixture<ComponentWorkbenchComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    const runtime = getAngularRuntimeState();
    runtime.modified = false;
    runtime.currentFile = 'workbench-test.json';
    runtime.ui['componentWorkbenchTab'] = 'component';
    runtime.doc = {
      meta: { domain: 'Workbench Test' },
      businessComponents: [{ uid: 'comp-1', name: '订单组件', kind: 'core' }],
      businessConstructs: [{ uid: 'construct-1', name: '订单构件', businessComponentUid: 'comp-1' }],
      entities: [{ uid: 'entity-1', name: '订单', fields: [], businessConstructUid: 'construct-1' }],
      taskDefinitions: [{ uid: 'task-1', name: '查询订单', type: 'Query', constructUid: 'construct-1', parameters: { inputs: [], outputs: [] } }],
      services: [],
      processes: [],
      roles: [],
      stages: [],
      terms: [],
      rules: [],
    };

    await TestBed.configureTestingModule({
      imports: [ComponentWorkbenchComponent, EntityDesignWorkbenchComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ComponentWorkbenchComponent);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('opens a resizable drawer when adding a component or construct', () => {
    expect(host.querySelector('.proc-view-toolbar .view-toggle-group .vtb.active')?.textContent).toContain('组件构件');

    host.querySelector<HTMLButtonElement>('.comp-grid-add')?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="component-drawer"]')?.textContent).toContain('组件');
    expect(host.querySelector('.drawer-resize-handle')).toBeTruthy();

    host.querySelector<HTMLButtonElement>('.drawer-close')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.comp-grid-construct-add')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="construct-drawer"]')?.textContent).toContain('构件');
    expect(host.querySelector('.drawer-resize-handle')).toBeTruthy();
  });

  it('keeps task definition editing readable and all add buttons mutate the model', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]')?.click();
    fixture.detectChanges();

    Array.from(host.querySelectorAll<HTMLButtonElement>('.comp-toolbar button')).find((button) => button.textContent?.includes('新建任务'))?.click();
    fixture.detectChanges();

    expect(host.querySelector('.taskdef-edit-layout')).toBeTruthy();
    expect(host.querySelector('.taskdef-edit-basics')).toBeTruthy();
    expect(host.querySelectorAll('.taskdef-edit-params').length).toBeGreaterThanOrEqual(3);

    host.querySelectorAll<HTMLButtonElement>('.taskdef-edit-section-head button').forEach((button) => button.click());
    fixture.detectChanges();

    const draft = getAngularRuntimeState().doc.taskDefinitions.find((task: any) => !task.uid);
    expect(draft.parameters.inputs).toHaveLength(1);
    expect(draft.parameters.outputs).toHaveLength(1);
  });

  it('keeps entity relation view read-only until editing is opened', () => {
    Array.from(host.querySelectorAll<HTMLButtonElement>('.view-toggle-group .vtb')).find((button) => button.textContent?.includes('实体定义'))?.click();
    fixture.detectChanges();

    const node = host.querySelector<HTMLButtonElement>('[data-testid="entity-design-node"]')!;
    const board = host.querySelector<HTMLElement>('.entity-board')!;
    expect(board.classList.contains('is-editing')).toBe(false);

    node.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="entity-design-drawer"]')).toBeFalsy();

    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 80, clientY: 90 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    fixture.detectChanges();
    expect(getAngularRuntimeState().doc.entities[0].pos).toBeUndefined();

    host.querySelector<HTMLButtonElement>('[data-testid="entity-design-editor-open"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector('.entity-board')?.classList.contains('is-editing')).toBe(true);
    expect(host.querySelector('[data-testid="entity-design-drawer"]')).toBeTruthy();
    expect(host.querySelector('.entity-design-drawer-resize')).toBeTruthy();
  });

  it('keeps the entity relation diagram shell scrollable in both directions', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'relation';
    runtime.doc.entities = [
      { uid: 'entity-1', name: '实体一', fields: [], businessConstructUid: 'construct-1', pos: { x: 24, y: 24 } },
      { uid: 'entity-2', name: '实体二', fields: [], businessConstructUid: 'construct-1', pos: { x: 1460, y: 860 } },
    ];
    runtime.doc.relations = [{ from: 'entity-1', to: 'entity-2', label: '关联' }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const shell = entityHost.querySelector<HTMLElement>('[data-testid="entity-design-canvas-shell"]')!;
    const board = entityHost.querySelector<HTMLElement>('.entity-board')!;

    expect(getComputedStyle(shell).overflowX).toBe('auto');
    expect(getComputedStyle(shell).overflowY).toBe('auto');
    expect(Number.parseInt(board.style.width, 10)).toBeGreaterThan(1500);
    expect(Number.parseInt(board.style.height, 10)).toBeGreaterThan(900);
  });

  it('renders entity state fallback transitions through a legacy side channel', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: '订单',
      fields: [{ uid: 'field-1', name: '状态', state_values: '草稿、审核中、已完成' }],
      state_transitions: [
        { from: '草稿', to: '审核中', action: '提交' },
        { from: '审核中', to: '已完成', action: '通过' },
        { from: '已完成', to: '审核中', action: '退回' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-switch-state"]')?.click();
    entityFixture.detectChanges();
    const fallbackPath = Array.from(entityHost.querySelectorAll<SVGPathElement>('.entity-state-link'))
      .find((path) => path.getAttribute('data-state-action') === '退回');

    expect(fallbackPath?.getAttribute('d') || '').toMatch(/ L -?\d+ \d+ L -?\d+ \d+ L /);
  });
});
