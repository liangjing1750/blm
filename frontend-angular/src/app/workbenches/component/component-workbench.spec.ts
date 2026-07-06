import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import { ComponentWorkbenchComponent } from './component-workbench';
import { EntityDesignWorkbenchComponent } from './entity-design/entity-design-workbench.component';

describe('ComponentWorkbenchComponent', () => {
  let fixture: ComponentFixture<ComponentWorkbenchComponent>;
  let host: HTMLElement;

  function mouseEvent(type: string, props: Partial<MouseEvent> = {}): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries(props)) {
      Object.defineProperty(event, key, { configurable: true, value });
    }
    return event;
  }

  beforeEach(async () => {
    const runtime = getAngularRuntimeState();
    runtime.modified = false;
    runtime.currentFile = 'workbench-test.json';
    runtime.ui['componentWorkbenchTab'] = 'businessComponent';
    runtime.ui['componentWorkbenchConstructId'] = '';
    runtime.ui['entityView'] = 'relation';
    runtime.ui['entityId'] = '';
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
    expect(host.textContent).not.toContain('业务构件New');
    expect(host.querySelector('[data-testid="business-construct-tree-view"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="business-mindmap-toolbar"]')?.textContent).toContain('业务组件地图');
    expect(host.querySelector('[data-testid="mind-node-component-comp-1"]')?.textContent).toContain('订单组件');
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')?.textContent).toContain('订单构件');
  });

  it('keeps task definition card names readable up to 15 characters before truncation', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.taskDefinitions[0].name = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳';
    host.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]')?.click();
    fixture.detectChanges();

    const head = host.querySelector<HTMLElement>('[data-testid="taskdef-head-task-1"] strong');
    expect(head?.textContent?.trim()).toBe('甲乙丙丁戊己庚辛壬癸子丑寅卯辰…');
    expect(head?.getAttribute('title')).toBe('甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳');
  });

  it('opens construct detail from component overview and keeps context without a return button', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="mind-node-construct-construct-1"]')?.click();
    fixture.detectChanges();

    expect(getAngularRuntimeState().ui['componentWorkbenchTab']).toBe('businessConstruct');
    expect(getAngularRuntimeState().ui['componentWorkbenchConstructId']).toBe('construct-1');
    expect(host.querySelector('[data-testid="business-construct-view"]')?.textContent).toContain('订单构件');
    expect(host.querySelector('[data-testid="business-construct-name-input"]')).toBeFalsy();
    expect(host.querySelector('.business-construct-title-field')).toBeFalsy();
    expect(host.querySelector('[data-testid="business-construct-entities"]')?.textContent).toContain('订单');
    expect(host.querySelector('[data-testid="business-construct-tasks"]')?.textContent).toContain('查询订单');
    expect(host.querySelector('[data-testid="business-construct-return"]')).toBeFalsy();
    expect(getAngularRuntimeState().ui['componentWorkbenchConstructId']).toBe('construct-1');
  });

  it('renders a rightward business construct tree with element nodes and drills into definitions', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    const tree = host.querySelector<HTMLElement>('[data-testid="business-construct-tree-view"]')!;
    expect(tree).toBeTruthy();
    expect(tree.querySelector('[data-testid="mind-node-component-comp-1"]')?.textContent).toContain('订单组件');
    expect(tree.querySelector('[data-testid="mind-node-component-comp-1"]')?.textContent).toContain('1 个构件');
    expect(tree.querySelectorAll(':scope > .business-tree-canvas').length).toBe(0);

    tree.querySelector<HTMLButtonElement>('[data-testid="mind-node-component-comp-1"]')?.click();
    fixture.detectChanges();
    expect(tree.querySelector('[data-testid="mind-node-construct-construct-1"]')?.textContent).toContain('订单构件');
    expect(tree.querySelector('[data-testid="mind-node-entity-entity-1"]')?.textContent).toContain('订单');

    tree.querySelector<HTMLButtonElement>('[data-testid="mind-node-construct-construct-1"]')?.click();
    fixture.detectChanges();
    expect(getAngularRuntimeState().ui['componentWorkbenchTab']).toBe('businessConstruct');
    expect(getAngularRuntimeState().ui['componentWorkbenchConstructId']).toBe('construct-1');
  });

  it('edits the business construct tree in place and moves aggregate children', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.businessComponents.push({ uid: 'comp-2', name: '支付组件', kind: 'generic' });
    runtime.doc.businessConstructs.push({ uid: 'construct-3', name: '支付构件', businessComponentUid: 'comp-2' });

    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    const canvas = host.querySelector<HTMLElement>('[data-testid="business-mindmap-canvas"]')!;
    host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-1"]')?.click();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    fixture.detectChanges();

    expect(runtime.ui['componentWorkbenchTab']).toBe('businessComponent');
    expect(runtime.doc.businessConstructs.some((construct: any) => construct.name === '新构件' && construct.businessComponentUid === 'comp-1')).toBe(true);
    expect(host.querySelector('[data-testid="business-tree-add-construct-comp-1"]')).toBeFalsy();
    expect(host.querySelector('.mind-edit-strip')).toBeFalsy();

    host.querySelector<HTMLElement>('[data-testid="mind-node-construct-construct-1"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    const constructName = host.querySelector<HTMLInputElement>('[data-testid="mind-node-name-editor"]')!;
    constructName.value = '订单履约构件';
    constructName.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(runtime.doc.businessConstructs.find((construct: any) => construct.uid === 'construct-1')?.name).toBe('订单履约构件');

    host.querySelector<HTMLElement>('[data-testid="mind-node-construct-construct-1"]')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-2"]')!.dispatchEvent(new Event('drop', { bubbles: true }));
    fixture.detectChanges();
    expect(runtime.doc.businessConstructs.find((construct: any) => construct.uid === 'construct-1')?.businessComponentUid).toBe('comp-2');

    host.querySelector<HTMLElement>('[data-testid="mind-node-entity-entity-1"]')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    host.querySelector<HTMLElement>('[data-testid="mind-node-construct-construct-3"]')!.dispatchEvent(new Event('drop', { bubbles: true }));
    host.querySelector<HTMLElement>('[data-testid="mind-node-task-task-1"]')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    host.querySelector<HTMLElement>('[data-testid="mind-node-construct-construct-3"]')!.dispatchEvent(new Event('drop', { bubbles: true }));
    fixture.detectChanges();

    expect(runtime.doc.entities.find((entity: any) => entity.uid === 'entity-1')?.businessConstructUid).toBe('construct-3');
    expect(runtime.doc.taskDefinitions.find((task: any) => task.uid === 'task-1')?.constructUid).toBe('construct-3');
    expect(runtime.modified).toBe(true);
  });

  it('models business constructs as a compact keyboard-driven mind map', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.businessComponents.push({ uid: 'comp-2', name: '支付组件', kind: 'generic' });

    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    const canvas = host.querySelector<HTMLElement>('[data-testid="business-mindmap-canvas"]')!;
    expect(canvas).toBeTruthy();
    expect(host.querySelector('[data-testid="business-mindmap-zoom"]')?.textContent).toContain('80%');
    expect(host.querySelector('[data-testid="mind-node-component-comp-1"]')?.textContent).toContain('订单组件');
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')?.textContent).toContain('订单构件');

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="business-mindmap-zoom"]')?.textContent).toContain('90%');

    host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-1"]')?.click();
    fixture.detectChanges();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    fixture.detectChanges();
    expect(runtime.doc.businessConstructs.some((construct: any) => construct.name === '新构件' && construct.businessComponentUid === 'comp-1')).toBe(true);

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-child-menu"]')?.textContent?.trim()).toBe('实体任务');
    expect(host.querySelector('[data-testid="mind-child-option-entity"]')?.classList.contains('is-active')).toBe(true);

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-child-option-task"]')?.classList.contains('is-active')).toBe(true);

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(runtime.doc.taskDefinitions.some((task: any) => task.name === '新任务' && task.constructUid === 'construct-1')).toBe(true);
    expect(host.querySelector('[data-testid="mind-child-menu"]')).toBeFalsy();
    expect(host.querySelector('[data-testid="mind-node-name-editor"]')).toBeTruthy();

    host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-1"]')?.click();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(runtime.doc.entities.some((entity: any) => entity.name === '新实体' && entity.businessConstructUid === 'construct-1')).toBe(true);
    expect(host.querySelector('[data-testid="mind-node-name-editor"]')).toBeTruthy();

    host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-1"]')?.click();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')?.classList.contains('is-selected')).toBe(true);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-node-entity-entity-1"]')?.classList.contains('is-selected')).toBe(true);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')?.classList.contains('is-selected')).toBe(true);

    const constructNode = host.querySelector<HTMLElement>('[data-testid="mind-node-construct-construct-1"]')!;
    const targetComponent = host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-2"]')!;
    constructNode.dispatchEvent(new Event('dragstart', { bubbles: true }));
    targetComponent.dispatchEvent(new Event('drop', { bubbles: true }));
    fixture.detectChanges();
    expect(runtime.doc.businessConstructs.find((construct: any) => construct.uid === 'construct-1')?.businessComponentUid).toBe('comp-2');
  });

  it('collapses individual and all mind map branches without losing the global skeleton', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    const canvas = host.querySelector<HTMLElement>('[data-testid="business-mindmap-canvas"]')!;
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mind-node-entity-entity-1"]')).toBeTruthy();

    host.querySelector<HTMLButtonElement>('[data-testid="mind-collapse-construct-construct-1"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mind-node-entity-entity-1"]')).toBeFalsy();
    expect(host.querySelector('[data-testid="mind-node-task-task-1"]')).toBeFalsy();

    host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-1"]')?.click();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-node-component-comp-1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')).toBeFalsy();

    host.querySelector<HTMLButtonElement>('[data-testid="mind-expand-all"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mind-node-entity-entity-1"]')).toBeTruthy();

    host.querySelector<HTMLButtonElement>('[data-testid="mind-collapse-all"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-node-component-comp-1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')).toBeFalsy();
  });

  it('keeps the business component map compact without a fixed root node and separates node types visually', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    const tree = host.querySelector<HTMLElement>('[data-testid="business-construct-tree-view"]')!;
    const toolbar = tree.querySelector<HTMLElement>('[data-testid="business-mindmap-toolbar"]')!;
    const tools = tree.querySelector<HTMLElement>('[data-testid="business-mindmap-tools"]')!;

    expect(toolbar.textContent).toContain('业务组件地图');
    expect(tree.querySelector('[data-testid="mind-root"]')).toBeFalsy();
    expect(tree.querySelector('.business-mindmap-stage')?.classList.contains('has-rootless-map')).toBe(true);
    expect(tools.querySelectorAll('button').length).toBeLessThanOrEqual(3);
    expect(tree.querySelector('[data-testid="mind-node-construct-construct-1"]')?.classList.contains('mind-node--construct')).toBe(true);
    expect(tree.querySelector('[data-testid="mind-node-entity-entity-1"]')?.classList.contains('mind-node--entity')).toBe(true);
    expect(tree.querySelector('[data-testid="mind-node-task-task-1"]')?.classList.contains('mind-node--task')).toBe(true);
  });

  it('shows a map legend, highlights aggregate descendants, and keeps branch connectors continuous', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    const tree = host.querySelector<HTMLElement>('[data-testid="business-construct-tree-view"]')!;
    const legend = tree.querySelector<HTMLElement>('[data-testid="business-mindmap-legend"]')!;
    expect(legend).toBeTruthy();
    expect(legend.textContent).toContain('组件');
    expect(legend.textContent).toContain('构件');
    expect(legend.textContent).toContain('实体');
    expect(legend.textContent).toContain('任务');

    const component = tree.querySelector<HTMLButtonElement>('[data-testid="mind-node-component-comp-1"]')!;
    component.click();
    fixture.detectChanges();
    const componentRow = component.closest('.mind-row') as HTMLElement;
    expect(componentRow.classList.contains('is-related')).toBe(true);
    expect(componentRow.querySelector('[data-testid="mind-node-construct-construct-1"]')?.classList.contains('is-related')).toBe(true);
    expect(componentRow.querySelector('[data-testid="mind-node-entity-entity-1"]')?.classList.contains('is-related')).toBe(true);
    expect(componentRow.querySelector('[data-testid="mind-node-task-task-1"]')?.classList.contains('is-related')).toBe(true);

    const styleRules = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from((sheet as CSSStyleSheet).cssRules || []))
      .map((rule) => rule.cssText)
      .join('\n');
    expect(styleRules).toContain('.mind-branch');
    expect(styleRules).toContain('::after');
    expect(styleRules).toContain('left: -24px');

    const construct = tree.querySelector<HTMLButtonElement>('[data-testid="mind-node-construct-construct-1"]')!;
    construct.click();
    fixture.detectChanges();
    expect((construct.closest('.mind-construct') as HTMLElement).classList.contains('is-related')).toBe(true);
  });

  it('shows unclassified component and construct for unowned entities and tasks', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="mind-node-component-__unassigned_component__"]')?.textContent).toContain('未归属组件');
    expect(host.querySelector('[data-testid="mind-node-construct-__unassigned_construct__"]')?.textContent).toContain('未归属构件');
    expect(host.querySelector('[data-testid="mind-node-entity-entity-2"]')?.textContent).toContain('未分组实体');
    expect(host.querySelector('[data-testid="mind-node-task-task-2"]')?.textContent).toContain('未分组任务');
  });

  it('selects instead of drilling in edit mode and supports component enter plus delete confirmation', async () => {
    const runtime = getAngularRuntimeState();
    const confirmState: { resolve?: (value: boolean) => void } = {};
    const confirmSpy = vi.fn((event: Event) => {
      const detail = (event as CustomEvent).detail;
      detail.markHandled();
      confirmState.resolve = detail.resolve;
    });
    window.addEventListener('blm-runtime-confirm', confirmSpy);
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="mind-node-construct-construct-1"]')?.click();
    fixture.detectChanges();
    expect(runtime.ui['componentWorkbenchTab']).toBe('businessComponent');
    expect(host.querySelector('[data-testid="mind-node-construct-construct-1"]')?.classList.contains('is-selected')).toBe(true);

    const canvas = host.querySelector<HTMLElement>('[data-testid="business-mindmap-canvas"]')!;
    host.querySelector<HTMLButtonElement>('[data-testid="mind-node-component-comp-1"]')?.click();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(runtime.doc.businessComponents.some((component: any) => component.name === '新业务组件')).toBe(true);

    const taskNode = host.querySelector<HTMLButtonElement>('[data-testid="mind-node-task-task-1"]')!;
    expect(taskNode).toBeTruthy();
    taskNode.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-node-task-task-1"]')?.classList.contains('is-selected')).toBe(true);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    fixture.detectChanges();
    expect(confirmSpy).toHaveBeenCalled();

    expect(confirmState.resolve).toBeTruthy();
    confirmState.resolve!(true);
    await fixture.whenStable();
    fixture.detectChanges();
    window.removeEventListener('blm-runtime-confirm', confirmSpy);
    expect(runtime.doc.taskDefinitions.some((task: any) => task.uid === 'task-1')).toBe(false);
  });

  it('cycles the child create menu with horizontal and vertical arrows', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="component-businesscomponent-tab"]')?.click();
    fixture.detectChanges();

    const canvas = host.querySelector<HTMLElement>('[data-testid="business-mindmap-canvas"]')!;
    host.querySelector<HTMLButtonElement>('[data-testid="mind-node-construct-construct-1"]')?.click();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-child-option-entity"]')?.classList.contains('is-active')).toBe(true);

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-child-option-task"]')?.classList.contains('is-active')).toBe(true);

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-child-option-entity"]')?.classList.contains('is-active')).toBe(true);

    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="mind-child-option-task"]')?.classList.contains('is-active')).toBe(true);
  });

  it('keeps construct header fixed while entity and task lists scroll independently', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-businessconstruct-tab"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="business-construct-summary"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="business-construct-entity-scroll"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="business-construct-task-scroll"]')).toBeTruthy();
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

    const entityDetach = host.querySelector<HTMLButtonElement>('[data-testid="business-construct-entity-row-entity-2"] [data-testid="business-construct-entity-detach"]');
    const taskDetach = host.querySelector<HTMLButtonElement>('[data-testid="business-construct-task-row-task-2"] [data-testid="business-construct-task-detach"]');
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
    expect(host.querySelector('[data-testid="taskdef-service-map"]')?.textContent).toContain('查询订单');
    expect(host.querySelector('[data-testid="taskdef-construct-group-construct-1"]')?.textContent).toContain('订单构件');
  });

  it('edits asset names inline and opens the exact entity or task from construct detail', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-businessconstruct-tab"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();

    const entityName = host.querySelector<HTMLInputElement>('[data-testid="business-construct-entity-name-entity-1"]')!;
    entityName.value = '订单实体改名';
    entityName.dispatchEvent(new Event('input'));
    const taskName = host.querySelector<HTMLInputElement>('[data-testid="business-construct-task-name-task-1"]')!;
    taskName.value = '查询订单改名';
    taskName.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const runtime = getAngularRuntimeState();
    expect(runtime.doc.entities.find((entity: any) => entity.uid === 'entity-1').name).toBe('订单实体改名');
    expect(runtime.doc.taskDefinitions.find((task: any) => task.uid === 'task-1').name).toBe('查询订单改名');

    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLElement>('[data-testid="business-construct-entity-row-entity-1"]')?.click();
    fixture.detectChanges();
    expect(runtime.ui['componentWorkbenchTab']).toBe('entity');
    expect(runtime.ui['entityId']).toBe('entity-1');

    host.querySelector<HTMLButtonElement>('[data-testid="component-businessconstruct-tab"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLElement>('[data-testid="business-construct-task-row-task-1"]')?.click();
    fixture.detectChanges();
    expect(runtime.ui['componentWorkbenchTab']).toBe('taskDef');
    expect(runtime.ui['taskDefinitionId']).toBe('task-1');
    expect(host.querySelector('[data-testid="taskdef-card-task-1"] .taskdef-detail')).toBeTruthy();
  });

  it('creates the first business component from an empty map and edits it inline', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.businessComponents = [];
    runtime.doc.businessConstructs = [];
    fixture.destroy();
    fixture = TestBed.createComponent(ComponentWorkbenchComponent);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.proc-view-toolbar .view-toggle-group .vtb.active')?.textContent).toContain('业务组件');
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="mind-create-first-component"]')?.click();
    fixture.detectChanges();
    expect(runtime.doc.businessComponents).toHaveLength(1);
    expect(host.querySelector('[data-testid="mind-node-component-' + runtime.doc.businessComponents[0].uid + '"]')).toBeTruthy();

    const nameInput = host.querySelector<HTMLInputElement>('[data-testid="mind-node-name-editor"]')!;
    nameInput.value = '订单履约组件';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(runtime.doc.businessComponents[0].name).toBe('订单履约组件');
  });

  it('confirms before deleting a business component', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();
    const confirmSpy = vi.fn((event: Event) => {
      event.preventDefault();
      (event as CustomEvent<{ resolve: (confirmed: boolean) => void }>).detail.resolve(false);
    });
    window.addEventListener('blm-runtime-confirm', confirmSpy);

    (fixture.componentInstance as any).deleteComp(getAngularRuntimeState().doc.businessComponents[0]);
    fixture.detectChanges();

    expect(confirmSpy).toHaveBeenCalled();
    expect(getAngularRuntimeState().doc.businessComponents).toHaveLength(1);
    window.removeEventListener('blm-runtime-confirm', confirmSpy);
  });

  it('moves ungrouped constructs into a component from the map', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.businessComponents.push({ uid: 'comp-2', name: '支付组件', kind: 'generic' });
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLElement>('[data-testid="mind-node-construct-construct-1"]')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-2"]')!.dispatchEvent(new Event('drop', { bubbles: true }));
    fixture.detectChanges();

    const moved = runtime.doc.businessConstructs.find((item: any) => item.uid === 'construct-1');
    expect(moved.businessComponentUid).toBe('comp-2');
    expect(runtime.doc.businessComponents[1].constructUids).toContain('construct-1');
  });

  it('opens a labeled task definition editor dialog and all add buttons mutate the model', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]')?.click();
    fixture.detectChanges();

    Array.from(host.querySelectorAll<HTMLButtonElement>('.comp-toolbar button')).find((button) => button.textContent?.includes('新建任务'))?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="taskdef-editor-dialog"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="taskdef-editor-dialog"]')?.textContent).toContain('任务名称');
    expect(host.querySelector('[data-testid="taskdef-editor-dialog"]')?.textContent).toContain('任务类型');
    expect(host.querySelector('[data-testid="taskdef-editor-dialog"]')?.textContent).toContain('所属业务组件');
    expect(host.querySelector('[data-testid="taskdef-editor-dialog"]')?.textContent).toContain('所属业务构件');
    expect(host.querySelector('.taskdef-edit-basics')).toBeTruthy();
    expect(host.querySelector('[data-testid="taskdef-edit-component"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="taskdef-edit-construct"]')).toBeTruthy();
    expect(host.querySelectorAll('.taskdef-edit-params').length).toBe(0);
    expect(host.querySelector('[data-testid="taskdef-handover-runtime-kind"]')).toBeFalsy();
    expect(host.querySelector('[data-testid="taskdef-handover-target"]')).toBeFalsy();

    host.querySelectorAll<HTMLButtonElement>('.taskdef-editor-tabs button')[1]?.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.taskdef-edit-params').length).toBe(2);

    host.querySelectorAll<HTMLButtonElement>('.taskdef-edit-section-head button').forEach((button) => button.click());
    fixture.detectChanges();

    const draft = getAngularRuntimeState().doc.taskDefinitions.find((task: any) => !task.uid);
    expect(draft.parameters.inputs).toHaveLength(1);
    expect(draft.parameters.outputs).toHaveLength(1);
    expect(draft.technicalHandover).toBeUndefined();

    host.querySelectorAll<HTMLButtonElement>('.taskdef-editor-tabs button')[2]?.click();
    fixture.detectChanges();
    expect(host.querySelector<HTMLSelectElement>('.taskdef-edit-target')?.textContent).toContain('未实现');
    expect(host.querySelector('[data-testid="taskdef-note-editor"]')).toBeTruthy();
  });

  it('edits task parameter contracts with legacy row actions and list children', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.taskDefinitions[0].parameters.inputs = [
      { name: '平面图名称', type: 'String', required: true, code: 'imageName', note: '说明/示例' },
    ];
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="taskdef-edit-task-1"]')?.click();
    fixture.detectChanges();
    host.querySelectorAll<HTMLButtonElement>('.taskdef-editor-tabs button')[1]?.click();
    fixture.detectChanges();

    const dialog = host.querySelector<HTMLElement>('[data-testid="taskdef-editor-dialog"]')!;
    expect(dialog.textContent).toContain('任务参数：查询订单');
    expect(dialog.textContent).toContain('中文名称');
    expect(dialog.textContent).toContain('英文名称');
    expect(dialog.querySelectorAll('[data-testid="taskdef-param-insert"]').length).toBeGreaterThan(0);
    expect(dialog.querySelectorAll('[data-testid="taskdef-param-move-up"]').length).toBeGreaterThan(0);
    expect(dialog.querySelectorAll('[data-testid="taskdef-param-move-down"]').length).toBeGreaterThan(0);
    expect(dialog.querySelectorAll('[data-testid="taskdef-param-remove"]').length).toBeGreaterThan(0);
    expect(dialog.textContent).not.toContain('保存');
    expect(dialog.textContent).not.toContain('取消');

    const typeSelect = dialog.querySelector<HTMLSelectElement>('[data-testid="taskdef-param-type-inputs-0"]')!;
    expect(Array.from(typeSelect.options).map((option) => option.textContent?.trim())).toContain('列表');
    typeSelect.value = 'list';
    typeSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(dialog.textContent).toContain('子字段');
    dialog.querySelector<HTMLButtonElement>('[data-testid="taskdef-param-add-child-inputs-0"]')?.click();
    fixture.detectChanges();

    const draft = runtime.doc.taskDefinitions[0].parameters.inputs[0];
    expect(draft.type).toBe('list');
    expect(draft.children).toHaveLength(1);
  });

  it('renders task definitions as a construct grouped service capability map', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.taskDefinitions.push({
      uid: 'task-3',
      name: '提交订单',
      type: 'Service',
      target: 'orderService.submit',
      constructUid: 'construct-1',
      parameters: { inputs: [{ name: '订单ID', type: 'String', required: true, note: '' }], outputs: [] },
    });

    host.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]')?.click();
    fixture.detectChanges();

    const map = host.querySelector<HTMLElement>('[data-testid="taskdef-service-map"]')!;
    expect(map).toBeTruthy();
    expect(host.querySelector('.taskdef-cards')).toBeFalsy();
    expect(map.querySelector('[data-testid="taskdef-construct-group-construct-1"]')?.textContent).toContain('订单构件');
    expect(map.querySelector('[data-testid="taskdef-construct-group-construct-1"]')?.textContent).toContain('2 个能力');
    expect(map.querySelector('[data-testid="taskdef-card-task-1"]')?.textContent).toContain('查询订单');
    expect(map.querySelector('[data-testid="taskdef-card-task-3"]')?.textContent).toContain('Service');
    expect(map.querySelector('[data-testid="taskdef-card-task-3"]')?.textContent).toContain('入参 1');

    host.querySelector<HTMLSelectElement>('[data-testid="taskdef-construct-filter"]')!.value = 'construct-2';
    host.querySelector<HTMLSelectElement>('[data-testid="taskdef-construct-filter"]')!.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="taskdef-card-task-1"]')).toBeFalsy();
    expect(host.querySelector('[data-testid="taskdef-empty-map"]')?.textContent).toContain('暂无任务能力');
  });

  it('renders and edits task definition details with the shared rich text editor', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.taskDefinitions[0].note = '<p><strong>查询订单说明</strong></p>';
    host.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLElement>('.taskdef-card')?.click();
    fixture.detectChanges();
    const preview = host.querySelector<HTMLElement>('[data-testid="taskdef-note-preview-editor"]')!;
    expect(preview).toBeTruthy();
    expect(preview.textContent).toContain('查询订单说明');
    expect(preview.innerHTML).not.toContain('&lt;p&gt;');

    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="taskdef-edit-task-1"]')?.click();
    fixture.detectChanges();
    host.querySelectorAll<HTMLButtonElement>('.taskdef-editor-tabs button')[2]?.click();
    fixture.detectChanges();
    const editor = host.querySelector<HTMLElement>('[data-testid="taskdef-note-editor"]')!;
    editor.innerHTML = '<ul><li><strong>新的任务详情</strong></li></ul>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(runtime.doc.taskDefinitions[0].note).toContain('新的任务详情');
  });

  it('opens an empty task definition detail by clicking the whole task card', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('.taskdef-detail')).toBeFalsy();
    host.querySelector<HTMLElement>('.taskdef-card')?.click();
    fixture.detectChanges();

    expect(host.querySelector('.taskdef-detail')).toBeTruthy();
    expect(host.querySelector('.taskdef-empty-detail')?.textContent).toContain('暂无更多详情');
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
    expect(host.querySelector<HTMLInputElement>('[data-testid="mind-node-name-editor"]')).toBeFalsy();

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
    host.querySelector<HTMLElement>('[data-testid="mind-node-component-comp-1"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector<HTMLInputElement>('[data-testid="mind-node-name-editor"]')).toBeTruthy();
  });

  it('keeps component editing open while switching third-level tabs', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.textContent).toContain('关闭编辑');

    host.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.textContent).toContain('关闭编辑');

    host.querySelector<HTMLButtonElement>('[data-testid="component-entity-tab"]')?.click();
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.textContent).toContain('关闭编辑');
    expect(host.querySelector('.entity-board')?.classList.contains('is-editing')).toBe(true);
  });

  it('resets relation layout by writing legacy default positions back to entities', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.entities = [
      { uid: 'entity-1', name: '璁㈠崟', fields: [], businessConstructUid: 'construct-1', pos: { x: 900, y: 700 } },
      { uid: 'entity-2', name: '璁㈠崟鏄庣粏', fields: [], businessConstructUid: 'construct-1', pos: { x: 1200, y: 900 } },
    ];

    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-testid="component-entity-tab"]')?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="entity-design-reset-layout"]')?.click();
    fixture.detectChanges();

    expect(runtime.doc.entities.map((entity: any) => entity.pos)).toEqual([
      { x: 60, y: 112 },
      { x: 60, y: 220 },
    ]);
    expect(runtime.modified).toBe(true);
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

  it('renders relation nodes with the legacy compact node content', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'relation';
    runtime.doc.businessComponents = [{ uid: 'comp-1', name: 'Core component' }];
    runtime.doc.businessConstructs = [{ uid: 'construct-1', name: 'Order construct', businessComponentUid: 'comp-1' }];
    runtime.doc.entities = [
      { uid: 'entity-1', name: 'Order aggregate root entity', fields: [{ name: 'id' }, { name: 'status' }], businessConstructUid: 'construct-1' },
    ];
    runtime.doc.relations = [];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const node = entityHost.querySelector<HTMLElement>('[data-testid="entity-design-node"]')!;

    expect(Number.parseInt(node.style.width, 10)).toBeGreaterThan(180);
    expect(node.querySelector('.entity-node-component')).toBeFalsy();
    expect(node.querySelector('em')).toBeFalsy();
    expect(node.textContent?.trim()).toBe('Order aggregate root entity');
  });

  it('positions the relation editor drawer like the legacy right-side drawer', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'relation';
    runtime.doc.entities = [
      { uid: 'entity-1', name: 'Order', fields: [], businessConstructUid: 'construct-1', pos: { x: 80, y: 80 } },
    ];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('editing', true);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="entity-design-node"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    entityFixture.detectChanges();

    const shell = entityHost.querySelector<HTMLElement>('[data-testid="entity-design-canvas-shell"]')!;
    const drawer = entityHost.querySelector<HTMLElement>('[data-testid="entity-design-drawer"]')!;

    expect(shell.style.marginRight).toBe('620px');
    expect(getComputedStyle(drawer).top).toBe('0px');
    expect(getComputedStyle(drawer).bottom).toBe('0px');
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

  it('places state start and end markers vertically like the legacy renderer', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: 'Order',
      fields: [{ uid: 'field-1', name: 'Status', is_status: true, state_values: 'Draft/Review/Done' }],
      state_nodes: [
        { name: 'Draft', kind: 'initial' },
        { name: 'Review', kind: 'intermediate' },
        { name: 'Done', kind: 'terminal' },
      ],
      state_transitions: [
        { from: 'Draft', to: 'Review', action: 'submit' },
        { from: 'Review', to: 'Done', action: 'finish' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const initialNode = entityHost.querySelector<HTMLElement>('.entity-state-node.kind-initial')!;
    const terminalNode = entityHost.querySelector<HTMLElement>('.entity-state-node.kind-terminal')!;
    const startDot = entityHost.querySelector<HTMLElement>('[data-testid="entity-state-start-dot"]')!;
    const endDot = entityHost.querySelector<HTMLElement>('[data-testid="entity-state-end-dot"]')!;

    expect(parseInt(startDot.style.top, 10)).toBeLessThan(parseInt(initialNode.style.top, 10));
    expect(parseInt(endDot.style.top, 10)).toBeGreaterThan(parseInt(terminalNode.style.top, 10) + parseInt(terminalNode.style.height, 10));
  });

  it('renders legacy editable state route hitboxes and endpoint handles', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: 'Order',
      fields: [{ uid: 'field-1', name: 'Status', is_status: true, state_values: 'Draft/Review/Done' }],
      state_nodes: [
        { name: 'Draft', kind: 'initial' },
        { name: 'Review', kind: 'intermediate' },
        { name: 'Done', kind: 'terminal' },
      ],
      state_transitions: [
        { from: 'Draft', to: 'Review', action: 'submit' },
        { from: 'Review', to: 'Done', action: 'finish' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;

    entityHost.querySelector<HTMLButtonElement>('[data-testid="state-editor-open"]')?.click();
    entityFixture.detectChanges();

    expect(entityHost.querySelectorAll('[data-testid="entity-state-link-route-hitbox"]').length).toBeGreaterThan(0);
    expect(entityHost.querySelectorAll('[data-testid="entity-state-link-endpoint-handle"]').length).toBe(4);
  });

  it('uses legacy side-channel routing for backward and long forward state transitions', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: 'Order',
      fields: [{ uid: 'field-1', name: 'Status', is_status: true, state_values: 'Start/Middle/Review/Done' }],
      state_nodes: [
        { name: 'Start', kind: 'initial' },
        { name: 'Middle', kind: 'intermediate' },
        { name: 'Review', kind: 'intermediate' },
        { name: 'Done', kind: 'terminal' },
      ],
      state_transitions: [
        { from: 'Start', to: 'Review', action: 'skip' },
        { from: 'Review', to: 'Middle', action: 'return' },
        { from: 'Done', to: 'Start', action: 'restart' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const paths = Array.from(entityHost.querySelectorAll<SVGPathElement>('[data-testid="entity-state-graph-link"]'))
      .map((path) => path.getAttribute('d') || '');

    const longForwardX = (paths[0].match(/L\s+(\d+)\s+\d+\s+L\s+\1\s+\d+/) || [])[1];
    const backwardX = (paths[1].match(/L\s+(\d+)\s+\d+\s+L\s+\1\s+\d+/) || [])[1];
    const restartX = (paths[2].match(/L\s+(\d+)\s+\d+\s+L\s+\1\s+\d+/) || [])[1];
    const sideChannels = [longForwardX, backwardX, restartX].map(Number);
    expect(sideChannels.every((x) => x < 80 || x > 320)).toBe(true);
    expect(new Set(sideChannels).size).toBeGreaterThan(1);
  });

  it('honors legacy manual state route anchors', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: 'Order',
      fields: [{ uid: 'field-1', name: 'Status', is_status: true, state_values: 'Draft/Review' }],
      state_nodes: [
        { name: 'Draft', kind: 'initial' },
        { name: 'Review', kind: 'terminal' },
      ],
      state_transitions: [
        { from: 'Draft', to: 'Review', action: 'submit', route: { mode: 'manual', fromAnchor: 'right', toAnchor: 'left', waypoints: [{ x: 360, y: 90 }] } },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const path = entityHost.querySelector<SVGPathElement>('[data-testid="entity-state-graph-link"]')?.getAttribute('d') || '';
    const initialNode = entityHost.querySelector<HTMLElement>('.entity-state-node.kind-initial')!;
    const terminalNode = entityHost.querySelector<HTMLElement>('.entity-state-node.kind-terminal')!;
    const startX = parseInt(initialNode.style.left, 10) + parseInt(initialNode.style.width, 10);
    const startY = parseInt(initialNode.style.top, 10) + parseInt(initialNode.style.height, 10) / 2;
    const endX = parseInt(terminalNode.style.left, 10);
    const endY = parseInt(terminalNode.style.top, 10) + parseInt(terminalNode.style.height, 10) / 2;

    expect(path).toContain(`M ${startX} ${startY}`);
    expect(path).toContain(`L ${endX} ${endY}`);
  });

  it('persists legacy state transition route drags', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: 'Order',
      fields: [{ uid: 'field-1', name: 'Status', is_status: true, state_values: 'Draft/Review' }],
      state_nodes: [
        { name: 'Draft', kind: 'initial' },
        { name: 'Review', kind: 'terminal' },
      ],
      state_transitions: [
        { from: 'Draft', to: 'Review', action: 'submit' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="state-editor-open"]')?.click();
    entityFixture.detectChanges();

    entityHost.querySelector<HTMLElement>('[data-testid="entity-state-link-route-hitbox"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 160, clientY: 160 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 190, clientY: 180 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    entityFixture.detectChanges();

    expect(runtime.doc.entities[0].state_transitions[0].route?.waypoints?.length).toBeGreaterThan(0);
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

  it('uses the legacy state editor drawer structure and status labels', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: '订单',
      fields: [{ uid: 'field-1', name: '状态', is_status: true, status_role: 'primary', state_values: '草稿/审核中/已完成' }],
      state_transitions: [
        { from: '草稿', to: '审核中', action: '提交', field_name: '状态' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="state-editor-open"]')?.click();
    entityFixture.detectChanges();

    const drawer = entityHost.querySelector<HTMLElement>('[data-testid="state-editor-drawer"]')!;
    expect(drawer.textContent).toContain('状态图编辑');
    expect(drawer.textContent).toContain('主：状态');
    expect(drawer.textContent).toContain('状态值来源');
    expect(drawer.textContent).toContain('状态节点属性');
    expect(entityHost.querySelector('[data-testid="entity-transition-route-reset-all"]')).toBeFalsy();
    expect(entityHost.querySelector('[data-testid="entity-transition-add-button"]')).toBeFalsy();
    expect(entityHost.querySelector('[data-testid="entity-transition-section-title"]')?.textContent).toContain('状态流转');
    expect(Array.from(drawer.querySelectorAll('option')).map((option) => option.textContent?.trim())).toEqual(
      expect.arrayContaining(['初始状态', '中间状态', '结束状态']),
    );
  });

  it('uses state-specific edit toolbar actions and shortcut hints', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: 'Order',
      fields: [{ uid: 'field-1', name: 'Status', is_status: true, status_role: 'primary', state_values: 'Draft/Review/Done' }],
      state_transitions: [{ from: 'Draft', to: 'Review', action: 'submit', field_name: 'Status' }],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;

    entityHost.querySelector<HTMLButtonElement>('[data-testid="state-editor-open"]')?.click();
    entityFixture.detectChanges();

    expect(entityHost.querySelector('[data-testid="entity-design-add-entity"]')).toBeNull();
    expect(entityHost.querySelector('[data-testid="state-toolbar-add-transition"]')).toBeTruthy();
    expect(entityHost.querySelector('[data-testid="state-toolbar-reset-routes"]')).toBeTruthy();
    expect(entityHost.querySelector('[data-testid="entity-state-shortcut-hint"]')?.textContent).toContain('Ctrl+');
  });

  it('shows current state field values in transition dropdowns', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: 'Order',
      fields: [
        { uid: 'field-1', name: 'MainStatus', is_status: true, status_role: 'primary', state_values: 'Draft/Review/Done' },
        { uid: 'field-2', name: 'SubStatus', status_role: 'secondary', state_values: 'Queued/Running/Closed' },
      ],
      state_transitions: [
        { from: 'Queued', to: 'Running', action: 'start', field_name: 'SubStatus' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="state-editor-open"]')?.click();
    entityFixture.detectChanges();
    entityHost.querySelector<HTMLSelectElement>('[data-testid="entity-state-field-select"]')!.value = 'SubStatus';
    entityHost.querySelector<HTMLSelectElement>('[data-testid="entity-state-field-select"]')!.dispatchEvent(new Event('change', { bubbles: true }));
    entityFixture.detectChanges();

    const options = Array.from(entityHost.querySelectorAll<HTMLOptionElement>('[data-testid="entity-transition-from-0"] option'))
      .map((option) => option.textContent?.trim());
    expect(options).toEqual(['Queued', 'Running', 'Closed']);
  });

  it('keeps legacy transition endpoint values selected even when they are absent from the state field list', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: 'Order',
      fields: [{ uid: 'field-1', name: 'Status', is_status: true, status_role: 'primary', state_values: '初始状态/结束状态' }],
      state_transitions: [
        { from: '待复核', to: '复核驳回', action: '驳回', field_name: 'Status' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="state-editor-open"]')?.click();
    entityFixture.detectChanges();

    const from = entityHost.querySelector<HTMLSelectElement>('[data-testid="entity-transition-from-0"]')!;
    const to = entityHost.querySelector<HTMLSelectElement>('[data-testid="entity-transition-to-0"]')!;
    expect(from.value).toBe('待复核');
    expect(to.value).toBe('复核驳回');
    expect(Array.from(from.options).map((option) => option.value)).toContain('待复核');
    expect(Array.from(to.options).map((option) => option.value)).toContain('复核驳回');
  });

  it('shows every state field diagram and keeps state editing integrated with local draft changes', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'state-edit-draft.json';
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: '订单',
      fields: [
        { uid: 'field-1', name: '主状态', is_status: true, status_role: 'primary', state_values: '草稿/审核中/完成' },
        { uid: 'field-2', name: '质押状态', status_role: 'secondary', state_values: '待签收/签收中/签收成功' },
      ],
      state_transitions: [
        { from: '草稿', to: '审核中', action: '提交', field_name: '主状态' },
        { from: '待签收', to: '签收中', action: '签收', field_name: '质押状态' },
      ],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityHost.querySelector<HTMLButtonElement>('[data-testid="state-editor-open"]')?.click();
    entityFixture.detectChanges();

    expect(entityHost.querySelectorAll('[data-testid="entity-state-graph-canvas"]')).toHaveLength(2);
    expect(entityHost.querySelector<HTMLElement>('.entity-state-main-shell')?.style.marginRight).toBe('0px');
    const drawer = entityHost.querySelector<HTMLElement>('[data-testid="state-editor-drawer"]')!;
    expect(drawer.querySelector('[data-testid="entity-transition-add-button"]')).toBeNull();
    expect(drawer.querySelector('[data-testid="entity-transition-route-reset-all"]')).toBeNull();
    expect(drawer.querySelector('[data-testid="entity-transition-section-title"]')?.textContent).toContain('状态流转');

    const localChange = vi.fn();
    window.addEventListener('blm-runtime-local-change', localChange);
    entityHost.querySelector<HTMLSelectElement>('[data-testid="entity-transition-to-0"]')!.value = '完成';
    entityHost.querySelector<HTMLSelectElement>('[data-testid="entity-transition-to-0"]')!.dispatchEvent(new Event('change', { bubbles: true }));
    entityFixture.detectChanges();
    window.removeEventListener('blm-runtime-local-change', localChange);

    expect(runtime.modified).toBe(true);
    expect(runtime.collab.pendingSnapshot).toBe(true);
    expect(localChange).toHaveBeenCalled();
  });

  it('opens the embedded state editor drawer from the component editor toggle', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: '订单',
      fields: [{ uid: 'field-1', name: '状态', is_status: true, status_role: 'primary', state_values: '草稿/审核中/已完成' }],
      state_transitions: [{ from: '草稿', to: '审核中', action: '提交', field_name: '状态' }],
    }];
    host.querySelectorAll<HTMLButtonElement>('.vtb')[3]?.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="entity-design-switch-state"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="state-editor-drawer"]')).toBeFalsy();
    host.querySelector<HTMLButtonElement>('[data-testid="component-editor-toggle"]')?.click();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="state-editor-drawer"]')).toBeTruthy();
    expect(host.querySelector<HTMLElement>('.entity-state-main-shell')?.style.marginRight).toBe('0px');
  });

  it('zooms the state diagram with Ctrl plus mouse wheel only', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: '订单',
      fields: [{ uid: 'field-1', name: '状态', is_status: true, state_values: '草稿/审核中' }],
      state_transitions: [{ from: '草稿', to: '审核中', action: '提交' }],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    entityFixture.detectChanges();
    const shell = entityHost.querySelector<HTMLElement>('.entity-state-main-shell')!;
    const target = entityHost.querySelector<HTMLElement>('[data-testid="entity-state-zoom-target"]')!;
    expect(target.style.transform).toBe('scale(1)');

    shell.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }));
    entityFixture.detectChanges();
    expect(target.style.transform).toBe('scale(1)');

    shell.dispatchEvent(new WheelEvent('wheel', { bubbles: true, ctrlKey: true, deltaY: -100 }));
    entityFixture.detectChanges();
    expect(target.style.transform).toBe('scale(1.1)');
  });

  it('updates state node position immediately while dragging', () => {
    fixture.destroy();
    const runtime = getAngularRuntimeState();
    runtime.ui['entityView'] = 'state';
    runtime.ui['entityId'] = 'entity-1';
    runtime.doc.entities = [{
      uid: 'entity-1',
      name: '订单',
      fields: [{ uid: 'field-1', name: '状态', is_status: true, state_values: '草稿/审核中' }],
      stateLayout: { '草稿': { x: 120, y: 90 } },
      state_transitions: [{ from: '草稿', to: '审核中', action: '提交' }],
    }];

    const entityFixture = TestBed.createComponent(EntityDesignWorkbenchComponent);
    entityFixture.componentRef.setInput('initialView', 'state');
    entityFixture.componentRef.setInput('initialEntityId', 'entity-1');
    entityFixture.detectChanges();
    (entityFixture.componentInstance as any).stateEditorOpen.set(true);
    entityFixture.detectChanges();
    const entityHost = entityFixture.nativeElement as HTMLElement;
    const node = Array.from(entityHost.querySelectorAll<HTMLElement>('.entity-state-node'))
      .find((item) => item.textContent?.includes('草稿'))!;
    const initialLeft = Number.parseInt(node.style.left, 10);
    const initialTop = Number.parseInt(node.style.top, 10);

    const nodeLayout = (entityFixture.componentInstance as any).stateBoard().nodes.find((item: any) => item.name === '草稿');
    expect((entityFixture.componentInstance as any).canEditState()).toBe(true);
    expect(nodeLayout).toBeTruthy();
    (entityFixture.componentInstance as any).startStateNodeDrag(nodeLayout, mouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20 }));
    expect((entityFixture.componentInstance as any).stateNodeDragState).toBeTruthy();
    (entityFixture.componentInstance as any).onDocumentMouseMove(mouseEvent('mousemove', { clientX: 60, clientY: 50 }));
    const savedNode = runtime.doc.entities[0].fields[0].state_nodes?.find((item: any) => item.name === '草稿');
    expect(savedNode?.pos).toEqual({ x: initialLeft + 40, y: initialTop + 30 });

    const movedNode = Array.from(entityHost.querySelectorAll<HTMLElement>('.entity-state-node'))
      .find((item) => item.textContent?.includes('草稿'))!;
    expect(movedNode.style.left).toBe(`${initialLeft + 40}px`);
    expect(movedNode.style.top).toBe(`${initialTop + 30}px`);
  });
});
