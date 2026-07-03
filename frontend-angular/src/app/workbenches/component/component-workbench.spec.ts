import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    runtime.ui['componentWorkbenchTab'] = 'businessComponent';
    runtime.ui['componentWorkbenchConstructId'] = '';
    runtime.doc = {
      meta: { domain: 'Workbench Test' },
      businessComponents: [{ uid: 'comp-1', name: '订单组件', kind: 'core' }],
      businessConstructs: [
        { uid: 'construct-1', name: '订单构件', businessComponentUid: 'comp-1' },
        { uid: 'construct-2', name: '未分组构件' },
      ],
      entities: [
        { uid: 'entity-1', name: '订单', fields: [], businessConstructUid: 'construct-1' },
        { uid: 'entity-2', name: '未分组实体', fields: [] },
      ],
      taskDefinitions: [
        { uid: 'task-1', name: '查询订单', type: 'Query', constructUid: 'construct-1', parameters: { inputs: [], outputs: [] } },
        { uid: 'task-2', name: '未分组任务', type: 'Command', parameters: { inputs: [], outputs: [] } },
      ],
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

  it('splits the component workspace into business component and construct views', () => {
    const tabs = Array.from(host.querySelectorAll('.proc-view-toolbar .view-toggle-group .vtb')).map((tab) => tab.textContent?.trim());
    expect(tabs).toEqual(['业务组件', '业务构件', '任务定义', '实体定义']);
    expect(host.textContent).not.toContain('组件构件');
    expect(host.querySelector('[data-testid="business-component-view"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="business-component-card"]')?.textContent).toContain('订单组件');
    expect(host.querySelector('[data-testid="business-construct-entry"]')?.textContent).toContain('订单构件');
    expect(host.querySelector('[data-testid="business-construct-entry"]')?.textContent).toContain('1 个实体');
    expect(host.querySelector('[data-testid="business-construct-entry"]')?.textContent).toContain('1 个任务');
    expect(host.querySelector('[data-testid="business-component-view"]')?.textContent).not.toContain('查询订单');
  });

  it('opens construct detail from component overview and keeps context without a return button', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="business-construct-entry"]')?.click();
    fixture.detectChanges();

    expect(getAngularRuntimeState().ui['componentWorkbenchTab']).toBe('businessConstruct');
    expect(getAngularRuntimeState().ui['componentWorkbenchConstructId']).toBe('construct-1');
    expect(host.querySelector('[data-testid="business-construct-view"]')?.textContent).toContain('订单构件');
    expect(host.querySelector('[data-testid="business-construct-entities"]')?.textContent).toContain('订单');
    expect(host.querySelector('[data-testid="business-construct-tasks"]')?.textContent).toContain('查询订单');
    expect(host.querySelector('[data-testid="business-construct-return"]')).toBeFalsy();
    expect(getAngularRuntimeState().ui['componentWorkbenchConstructId']).toBe('construct-1');
  });

  it('edits a construct inline and cascades component and construct selectors', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="component-businessconstruct-tab"]')?.click();
    fixture.detectChanges();

    const nameInput = host.querySelector<HTMLInputElement>('[data-testid="business-construct-name-input"]')!;
    nameInput.value = '订单履约构件';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(getAngularRuntimeState().doc.businessConstructs[0].name).toBe('订单履约构件');

    const noteInput = host.querySelector<HTMLInputElement>('[data-testid="business-construct-note-input"]')!;
    noteInput.value = '负责订单履约';
    noteInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(getAngularRuntimeState().doc.businessConstructs[0].note).toBe('负责订单履约');

    const componentSelect = host.querySelector<HTMLSelectElement>('[data-testid="business-construct-component-select"]')!;
    expect(componentSelect.getAttribute('data-selected-component')).toBe('comp-1');
    const constructSelect = host.querySelector<HTMLSelectElement>('[data-testid="business-construct-select"]')!;
    expect(Array.from(constructSelect.options).map((option) => option.value)).toContain('construct-1');
  });

  it('creates, imports, and removes construct entities and tasks from the construct view', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="component-businessconstruct-tab"]')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="business-construct-new-entity"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="business-construct-new-task"]')?.click();
    fixture.detectChanges();

    const runtime = getAngularRuntimeState();
    expect(runtime.doc.entities.some((entity: any) => entity.name === '新实体' && entity.businessConstructUid === 'construct-1')).toBe(true);
    expect(runtime.doc.taskDefinitions.some((task: any) => task.name === '新任务' && task.constructUid === 'construct-1')).toBe(true);

    expect(host.querySelector('[data-testid="business-construct-entity-imports"]')?.textContent).toContain('未分组实体');
    expect(host.querySelector('[data-testid="business-construct-task-imports"]')?.textContent).toContain('未分组任务');
    host.querySelector<HTMLButtonElement>('[data-testid="business-construct-entity-attach"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="business-construct-task-attach"]')?.click();
    fixture.detectChanges();

    const movedEntity = runtime.doc.entities.find((entity: any) => entity.uid === 'entity-2');
    const movedTask = runtime.doc.taskDefinitions.find((task: any) => task.uid === 'task-2');
    expect(movedEntity.businessConstructUid).toBe('construct-1');
    expect(movedTask.constructUid).toBe('construct-1');

    const entityDetach = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-testid="business-construct-entity-detach"]'))
      .find((button) => button.closest('.construct-asset-row')?.textContent?.includes('未分组实体'));
    const taskDetach = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-testid="business-construct-task-detach"]'))
      .find((button) => button.closest('.construct-asset-row')?.textContent?.includes('未分组任务'));
    entityDetach?.click();
    taskDetach?.click();
    fixture.detectChanges();

    expect(movedEntity.businessConstructUid).toBe('');
    expect(movedTask.constructUid).toBe('');
  });

  it('opens task definitions from construct detail with the construct filter applied', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-businessconstruct-tab"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="business-construct-view"]')?.textContent).toContain('订单构件');
    host.querySelector<HTMLButtonElement>('[data-testid="business-construct-open-tasks"]')?.click();
    fixture.detectChanges();

    expect(getAngularRuntimeState().ui['componentWorkbenchTab']).toBe('taskDef');
    const constructSelect = host.querySelector<HTMLSelectElement>('[data-testid="taskdef-construct-filter"]')!;
    expect(constructSelect.getAttribute('data-selected-construct')).toBe('construct-1');
    expect(host.querySelector('.taskdef-cards')?.textContent).toContain('查询订单');
  });

  it('edits component properties in the card and creates constructs by opening the construct view', () => {
    expect(host.querySelector('.proc-view-toolbar .view-toggle-group .vtb.active')?.textContent).toContain('业务组件');
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="business-component-add"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="component-drawer"]')).toBeFalsy();
    expect(getAngularRuntimeState().doc.businessComponents).toHaveLength(2);

    const nameInput = host.querySelector<HTMLInputElement>('[data-testid="business-component-name-input"]')!;
    nameInput.value = '订单履约组件';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(getAngularRuntimeState().doc.businessComponents[0].name).toBe('订单履约组件');

    const kindButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-testid="business-component-kind-toggle"] button'));
    kindButtons.find((button) => button.textContent?.includes('通用组件'))?.click();
    fixture.detectChanges();
    expect(getAngularRuntimeState().doc.businessComponents[0].kind).toBe('generic');

    host.querySelector<HTMLButtonElement>('[data-testid="business-construct-add"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="construct-drawer"]')).toBeFalsy();
    expect(getAngularRuntimeState().ui['componentWorkbenchTab']).toBe('businessConstruct');
    expect(getAngularRuntimeState().doc.businessConstructs.some((construct: any) => construct.name === '新构件')).toBe(true);
  });

  it('confirms before deleting a business component', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    host.querySelector<HTMLButtonElement>('.comp-grid-edit.danger')?.click();
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(getAngularRuntimeState().doc.businessComponents).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it('moves ungrouped constructs into and out of a component from the component card', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="business-component-imports"]')?.textContent).toContain('未分组构件');
    host.querySelector<HTMLButtonElement>('[data-testid="construct-attach-button"]')?.click();
    fixture.detectChanges();

    const runtime = getAngularRuntimeState();
    const moved = runtime.doc.businessConstructs.find((item: any) => item.uid === 'construct-2');
    expect(moved.businessComponentUid).toBe('comp-1');
    expect(runtime.doc.businessComponents[0].constructUids).toContain('construct-2');
    expect(host.querySelector('[data-testid="business-component-imports"]')).toBeFalsy();

    const detachButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-testid="construct-detach-button"]'));
    detachButtons.find((button) => button.closest('.comp-grid-construct-wrap')?.textContent?.includes('未分组构件'))?.click();
    fixture.detectChanges();

    expect(moved.businessComponentUid).toBe('');
    expect(runtime.doc.businessComponents[0].constructUids || []).not.toContain('construct-2');
    expect(host.querySelector('[data-testid="business-component-imports"]')?.textContent).toContain('未分组构件');
  });

  it('keeps task definition editing readable and all add buttons mutate the model', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();
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
    const runtime = getAngularRuntimeState();
    runtime.doc.entities[0].fields = [
      { name: '技术主键', type: 'string', note: '最多可输入二百个字符，用于验证字段规则内容较长时编辑框自动撑高。' },
    ];
    runtime.doc.processes = [
      { uid: 'process-1', name: '线下查库', nodes: [{ uid: 'node-1', name: '新增线上查库', entity_ops: [{ entity_id: 'entity-1' }] }] },
    ];
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

    host.querySelector<HTMLButtonElement>('[data-testid="entity-design-node"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.textContent).toContain('关闭编辑');
    expect(host.querySelector('.entity-board')?.classList.contains('is-editing')).toBe(true);
    expect(host.querySelector('[data-testid="entity-design-drawer"]')).toBeTruthy();
    expect(host.querySelector('.entity-design-drawer-resize')).toBeTruthy();
    expect(host.querySelector('.entity-reference-section')?.textContent).toContain('新增线上查库');
    expect(Array.from(host.querySelector<HTMLSelectElement>('[data-testid="entity-status-role-0"]')!.options).map((option) => option.textContent?.trim())).toEqual(['否', '主', '子']);
    expect(Number.parseInt(host.querySelector<HTMLTextAreaElement>('.field-td-note textarea')!.style.height, 10)).toBeGreaterThan(28);

    host.querySelector<HTMLButtonElement>('[data-testid="entity-design-drawer-close"]')?.click();
    fixture.detectChanges();
    const editPropertyButton = host.querySelector<HTMLButtonElement>('[data-testid="entity-design-open-drawer"]')!;
    expect(editPropertyButton.disabled).toBe(false);
    editPropertyButton.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="entity-design-drawer"]')).toBeTruthy();
  });

  it('keeps component workspace read-only until the editor is opened', () => {
    expect(host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.textContent).toContain('打开编辑');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="business-component-add"]')).toBeFalsy();
    expect(host.querySelector<HTMLButtonElement>('.comp-grid-edit')).toBeFalsy();

    const beforeComponents = getAngularRuntimeState().doc.businessComponents.length;
    (fixture.componentInstance as any).openCompDrawer();
    (fixture.componentInstance as any).startEditInline();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="component-drawer"]')).toBeFalsy();
    expect(getAngularRuntimeState().doc.businessComponents.length).toBe(beforeComponents);
    expect(getAngularRuntimeState().doc.taskDefinitions).toHaveLength(2);

    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.textContent).toContain('关闭编辑');
    expect(host.querySelector<HTMLButtonElement>('[data-testid="business-component-add"]')).toBeTruthy();
    expect(host.querySelector<HTMLButtonElement>('.comp-grid-edit')).toBeTruthy();
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

  it('keeps relation property editing disabled until a concrete entity is selected', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'relation';
    runtime.ui['entityId'] = '';
    runtime.doc.entities = [
      { uid: 'entity-1', name: '实体一', fields: [], businessConstructUid: 'construct-1', pos: { x: 80, y: 80 } },
    ];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('editing', true);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const editPropertyButton = entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-open-drawer"]')!;
    expect(editPropertyButton.disabled).toBe(true);

    entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-node"]')?.click();
    entityFixture.detectChanges();
    expect(editPropertyButton.disabled).toBe(false);
  });

  it('zooms the relation graph with Ctrl plus mouse wheel only', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'relation';
    runtime.ui['entityId'] = '';
    runtime.doc.entities = [
      { uid: 'entity-1', name: '实体一', fields: [], businessConstructUid: 'construct-1', pos: { x: 80, y: 80 } },
      { uid: 'entity-2', name: '实体二', fields: [], businessConstructUid: 'construct-1', pos: { x: 340, y: 120 } },
    ];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const shell = entityHost.querySelector<HTMLElement>('[data-testid="entity-design-canvas-shell"]')!;
    const board = entityHost.querySelector<HTMLElement>('.entity-board')!;
    expect(board.style.transform).toBe('scale(1)');

    shell.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }));
    entityFixture.detectChanges();
    expect(board.style.transform).toBe('scale(1)');

    shell.dispatchEvent(new WheelEvent('wheel', { bubbles: true, ctrlKey: true, deltaY: -100 }));
    entityFixture.detectChanges();
    expect(board.style.transform).toBe('scale(1.1)');
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

  it('selects both relation endpoints when a relation line is clicked', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'relation';
    runtime.doc.entities = [
      { uid: 'entity-1', name: '订单', fields: [], businessConstructUid: 'construct-1', pos: { x: 80, y: 80 } },
      { uid: 'entity-2', name: '订单明细', fields: [], businessConstructUid: 'construct-1', pos: { x: 280, y: 80 } },
    ];
    runtime.doc.relations = [{ from: 'entity-1', to: 'entity-2', label: '包含' }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<SVGPathElement>('.entity-rel-line')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    entityFixture.detectChanges();

    const selected = Array.from(entityHost.querySelectorAll('.entity-node.is-selected')).map((node) => node.textContent || '');
    expect(selected.join(' ')).toContain('订单');
    expect(selected.join(' ')).toContain('订单明细');
    expect(entityHost.querySelector('[data-testid="entity-design-drawer"]')).toBeTruthy();
  });

  it('keeps legacy relation shortcuts and drag gestures distinct', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.modified = false;
    runtime.doc.entities = [
      { uid: 'entity-1', name: '订单', fields: [], businessConstructUid: 'construct-1', pos: { x: 80, y: 80 } },
      { uid: 'entity-2', name: '订单明细', fields: [], businessConstructUid: 'construct-1', pos: { x: 280, y: 80 } },
    ];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('editing', true);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const findNode = (id: string) => entityHost.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    const firstNode = findNode('entity-1');

    firstNode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: true, clientX: 80, clientY: 80 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 180, clientY: 180 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    firstNode.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    entityFixture.detectChanges();

    expect(runtime.doc.entities[0].pos).toEqual({ x: 80, y: 80 });
    expect(runtime.modified).toBe(false);

    findNode('entity-1').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true, clientX: 70, clientY: 70 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 360, clientY: 140 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    entityFixture.detectChanges();

    expect(findNode('entity-1').classList.contains('is-selected')).toBe(true);
    expect(findNode('entity-2').classList.contains('is-selected')).toBe(true);
  });

  it('scopes Ctrl+A to the relation graph and keeps the graph as a two-axis scroll host', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'relation';
    runtime.doc.entities = [
      { uid: 'entity-1', name: '订单', fields: [], businessConstructUid: 'construct-1', pos: { x: 80, y: 80 } },
      { uid: 'entity-2', name: '订单明细', fields: [], businessConstructUid: 'construct-1', pos: { x: 1280, y: 760 } },
    ];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const shell = entityHost.querySelector<HTMLElement>('[data-testid="entity-design-canvas-shell"]')!;

    expect(getComputedStyle(shell).overflowX).toBe('auto');
    expect(getComputedStyle(shell).overflowY).toBe('auto');

    entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-switch-state"]')?.click();
    entityFixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'a' }));
    entityFixture.detectChanges();
    expect(entityHost.querySelectorAll('.entity-node.is-selected').length).toBe(0);

    entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-switch-relation"]')?.click();
    entityFixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'a' }));
    entityFixture.detectChanges();
    expect(entityHost.querySelectorAll('.entity-node.is-selected').length).toBe(2);
  });

  it('reuses legacy state marker and label positions', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: '订单',
      fields: [{ uid: 'field-1', name: '状态', state_values: '草稿,审核中' }],
      state_nodes: [
        { name: '草稿', kind: 'initial', markerPos: { x: 180, y: 32 } },
        { name: '审核中', kind: 'terminal' },
      ],
      state_transitions: [
        { from: '草稿', to: '审核中', action: '提交', labelPos: { x: 260, y: 120 } },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-switch-state"]')?.click();
    entityFixture.detectChanges();
    const marker = entityHost.querySelector<HTMLElement>('[data-testid="entity-state-start-dot"]')!;
    const label = entityHost.querySelector<SVGTextElement>('.entity-state-link-label')!;

    expect(marker.style.left).toBe('172px');
    expect(marker.style.top).toBe('24px');
    expect(label.getAttribute('x')).toBe('260');
    expect(label.getAttribute('y')).toBe('120');
  });

  it('persists legacy state marker and label drags', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: '订单',
      fields: [{ uid: 'field-1', name: '状态', state_values: '草稿,审核中' }],
      state_nodes: [
        { name: '草稿', kind: 'initial' },
        { name: '审核中', kind: 'terminal' },
      ],
      state_transitions: [
        { from: '草稿', to: '审核中', action: '提交' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-switch-state"]')?.click();
    entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-editor-open"]')?.click();
    entityFixture.detectChanges();

    entityHost.querySelector<HTMLElement>('[data-testid="entity-state-start-dot"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 130, clientY: 125 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    entityFixture.detectChanges();

    const initialNode = runtime.doc.entities[0].state_nodes.find((node: any) => node.name === '草稿');
    expect(initialNode.markerPos.x).toBeGreaterThan(0);
    expect(initialNode.markerPos.y).toBeGreaterThan(0);

    entityHost.querySelector<SVGTextElement>('.entity-state-link-label')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200, clientY: 120 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 240, clientY: 150 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    entityFixture.detectChanges();

    expect(runtime.doc.entities[0].state_transitions[0].labelPos.x).toBeGreaterThan(0);
    expect(runtime.doc.entities[0].state_transitions[0].labelPos.y).toBeGreaterThan(0);
  });
});
