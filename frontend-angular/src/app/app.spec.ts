import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';
import { WORKBENCH_MIGRATION_STATUS } from './core/migration/workbench-migration-status';
import { getAngularRuntimeState } from './core/runtime/angular-runtime';
import { LegacyShellComponent } from './legacy-shell/legacy-shell.component';

describe('App', () => {
  beforeEach(async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = '';
    runtime.modified = false;
    runtime.readOnly = false;
    runtime.ui['mainTab'] = 'panoramaWorkbench';
    runtime.collab.seq = 0;
    runtime.collab.acceptedSeq = 0;
    runtime.collab.pendingSnapshot = false;
    runtime.collab.draftBaseSeqOverride = undefined;
    runtime.collab.recoveryMode = false;

    await TestBed.configureTestingModule({
      imports: [App, LegacyShellComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the legacy BLM toolbar through the Angular shell', () => {
    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#toolbar')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="toolbar-new-button"]')?.textContent).toContain('新建');
  });

  it('should open a custom create-document dialog without browser prompt', () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="no-document-new-button"]')?.click();
    fixture.detectChanges();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(compiled.querySelector('[data-testid="create-document-dialog"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="create-document-name-input"]')?.getAttribute('placeholder')).toContain('入库流程');
    expect(compiled.querySelector('[data-testid="create-document-submit-button"]')?.textContent).toContain('创建');
  });

  it('should refresh the shell after creating a document from an opened document', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/new')) {
        return new Response(JSON.stringify({
          document: {
            meta: { domain: 'Fresh Document', title: 'Fresh Document' },
            roles: [],
            stages: [],
            stageFlowRefs: [],
            processes: [],
            entities: [],
            businessComponents: [],
            taskDefinitions: [],
            terms: [],
            rules: [],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'old.json';
    runtime.doc = {
      meta: { domain: 'Old Document', title: 'Old Document' },
      roles: [],
      stages: [{ uid: 'old-stage', name: '旧阶段', panoramaColumnUid: 'old-column', panoramaLaneUid: 'old-lane' }],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
      panorama: {
        columns: [{ uid: 'old-column', name: '旧价值流' }],
        lanes: [{ uid: 'old-lane', name: '旧业务域' }],
        cells: [],
      },
    };
    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      createDocument: () => Promise<void>;
      submitCreateDocument: () => Promise<void>;
      createDocumentName: string;
    };
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="current-file-name"]')?.textContent).toContain('Old Document');

    await component.createDocument();
    component.createDocumentName = 'fresh.json';
    await component.submitCreateDocument();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(runtime.currentFile).toBe('fresh.json');
    expect(compiled.querySelector('[data-testid="current-file-name"]')?.textContent).toContain('Fresh Document');
    expect(compiled.textContent).not.toContain('旧阶段');
    expect(compiled.textContent).not.toContain('旧价值流');
  });

  it('should restore panorama secondary tabs inside the Angular workbench', () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [{ uid: 'stage-1', name: '准备', subDomain: '交易' }],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [{ uid: 'bc-1', name: '仓单组件', kind: 'core', entityUids: [], taskDefinitionUids: [], stageUids: ['stage-1'] }],
      businessConstructs: [
        { uid: 'construct-1', name: '仓单构件', businessComponentUid: 'bc-1' },
        { uid: 'construct-2', name: '库存构件', businessComponentUid: 'bc-1' },
      ],
      taskDefinitions: [],
      terms: [],
      rules: [],
      panorama: {
        columns: [{ uid: 'column-1', name: '入库价值流' }],
        lanes: [{ uid: 'lane-1', name: '交易业务域' }],
        cells: [{ laneUid: 'lane-1', columnUid: 'column-1', status: '建模中' }],
      },
    };
    runtime.doc.stages[0].panoramaLaneUid = 'lane-1';
    runtime.doc.stages[0].panoramaColumnUid = 'column-1';

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="panorama-subtab-overview"]')?.textContent).toContain('全景视图');
    expect(compiled.querySelector('[data-testid="panorama-subtab-roles"]')?.textContent).toContain('角色管理');
    expect(compiled.querySelector('[data-testid="panorama-subtab-terms"]')?.textContent).toContain('术语管理');
    expect(compiled.querySelector('[data-testid="panorama-subtab-dictionary"]')?.textContent).toContain('字典管理');
    expect(compiled.querySelector('[data-testid="panorama-subtab-rules"]')?.textContent).toContain('规则管理');
    expect(compiled.querySelector('[data-testid="panorama-overview-rich"]')?.textContent).toContain('入库价值流');
    expect(compiled.querySelector('[data-testid="panorama-matrix"]')?.textContent).toContain('准备');
    expect(compiled.querySelector('[data-testid="panorama-capability-groups"]')?.textContent).toContain('2个构件');
    expect(compiled.querySelector('[data-testid="panorama-capability-groups"]')?.textContent).not.toContain('核心组件 · 准备');
    expect(compiled.querySelector('[data-testid="panorama-zoom-control"]')).toBeTruthy();
    expect(getComputedStyle(compiled.querySelector<HTMLElement>('[data-testid="panorama-zoom-in"]')!).height)
      .toBe(getComputedStyle(compiled.querySelector<HTMLElement>('[data-testid="panorama-editor-open"]')!).height);
    const stageCard = compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-stage-cell"]');
    const componentCard = compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-component-node"]');
    stageCard?.click();
    fixture.detectChanges();
    expect(stageCard?.classList.contains('is-highlighted')).toBe(true);
    expect(componentCard?.classList.contains('is-highlighted')).toBe(true);
    componentCard?.click();
    fixture.detectChanges();
    expect(componentCard?.classList.contains('is-highlighted')).toBe(true);
    expect(stageCard?.classList.contains('is-highlighted')).toBe(true);
    const zoomCanvas = compiled.querySelector<HTMLElement>('[data-testid="panorama-zoom-canvas"]');
    const initialZoom = Number(zoomCanvas?.style.zoom || 0);
    expect(initialZoom).toBeLessThanOrEqual(1);

    compiled.querySelector<HTMLElement>('[data-testid="panorama-zoom-viewport"]')?.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    fixture.detectChanges();
    expect(Number(zoomCanvas?.style.zoom || 0)).toBe(initialZoom);

    compiled.querySelector<HTMLElement>('[data-testid="panorama-zoom-viewport"]')?.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100 }));
    fixture.detectChanges();
    expect(Number(zoomCanvas?.style.zoom || 0)).toBeGreaterThan(initialZoom);

    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-roles"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="role-summary-card"]')).toBeTruthy();

    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-terms"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="knowledge-angular"]')?.textContent).toContain('术语管理');
  });

  it('should keep role creation compact and sync role edits with Ctrl+S', async () => {
    let resolveSnapshot!: (value: Response) => void;
    let snapshotPayload: any = null;
    const snapshotPromise = new Promise<Response>((resolve) => {
      resolveSnapshot = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/collab/snapshot')) {
        snapshotPayload = JSON.parse(String(init?.body));
        return snapshotPromise;
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = { meta: { domain: 'Agent' }, roles: [{ uid: 'role-1', id: 'R1', name: '系统', group: '系统角色' }], stages: [], stageFlowRefs: [], processes: [], entities: [], businessComponents: [], taskDefinitions: [], terms: [], rules: [] };
    runtime.collab.hasRemoteUpdate = false;
    runtime.collab.syncing = false;
    runtime.ui['roleWorkbenchMode'] = 'management';

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-roles"]')?.click();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="role-create-inline"]')).toBeFalsy();
    compiled.querySelector<HTMLButtonElement>('[data-testid="role-create-toggle"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="role-create-inline"]')).toBeTruthy();
    const input = compiled.querySelector<HTMLInputElement>('#role-create-input')!;
    input.value = '清算员';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="role-add-button"]')?.click();
    fixture.detectChanges();

    expect(runtime.doc.roles.some((role: any) => role.name === '清算员')).toBe(true);
    expect(runtime.modified).toBe(true);
    expect(runtime.collab.pendingSnapshot).toBe(true);
    expect(compiled.querySelector('[data-testid="role-create-inline"]')).toBeFalsy();

    const preventDefault = vi.fn();
    (fixture.componentInstance as any).handleShortcut({ key: 's', ctrlKey: true, metaKey: false, preventDefault });
    await Promise.resolve();
    fixture.detectChanges();
    expect(preventDefault).toHaveBeenCalled();
    expect((fixture.componentInstance as any).waitDialog()?.title).toBe('正在同步文档...');
    resolveSnapshot(new Response(JSON.stringify({ document: runtime.doc, seq: 8 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(fetchSpy).toHaveBeenCalledWith('/api/collab/snapshot', expect.objectContaining({ method: 'POST' }));
    expect(snapshotPayload?.document?.roles.some((role: any) => role.name === '清算员')).toBe(true);
    expect(runtime.modified).toBe(false);
    expect(runtime.collab.seq).toBe(8);
    expect(compiled.querySelector('[data-testid="wait-dialog"]')).toBeFalsy();
  });

  it('should let the server merge a stale clean snapshot when syncing after another window saved', async () => {
    let snapshotPayload: any = null;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/collab/snapshot')) {
        snapshotPayload = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ document: { meta: { domain: 'Remote' }, roles: [{ uid: 'remote-role', name: '远端角色' }] }, seq: 9 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = { meta: { domain: 'Local' }, roles: [], stages: [], stageFlowRefs: [], processes: [], entities: [], businessComponents: [], taskDefinitions: [], terms: [], rules: [] };
    runtime.modified = false;
    runtime.collab.pendingSnapshot = false;
    runtime.collab.syncing = false;
    runtime.collab.hasRemoteUpdate = false;
    runtime.collab.seq = 9;

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-sync-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchSpy).toHaveBeenCalledWith('/api/collab/snapshot', expect.objectContaining({ method: 'POST' }));
    expect(snapshotPayload?.baseSeq).toBe(0);
    expect(snapshotPayload?.document?.meta?.domain).toBe('Local');
    expect(runtime.doc.meta.domain).toBe('Remote');
    expect(runtime.doc.roles[0].name).toBe('远端角色');
    expect(runtime.collab.hasRemoteUpdate).toBe(false);
  });

  it('should synchronize the main workbench from the browser route on refresh', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'constructWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/panorama');

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(runtime.ui['mainTab']).toBe('panoramaWorkbench');
    expect(compiled.querySelector('[data-testid="tab-panoramaWorkbench"]')?.classList.contains('active')).toBe(true);
    expect(compiled.querySelector('[data-testid="panorama-subtabs"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="tab-orchestrationWorkbench"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="tab-entity"]')).toBeFalsy();
  });

  it('should switch main workbench without router navigation so collaboration stays mounted', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'panoramaWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    const locationSpy = vi.spyOn(location, 'go');
    await router.navigateByUrl('/panorama');
    navigateSpy.mockClear();

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="tab-processWorkbench"]')?.click();
    fixture.detectChanges();

    expect(runtime.ui['mainTab']).toBe('processWorkbench');
    expect(locationSpy).toHaveBeenCalledWith('/process');
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(compiled.querySelector('[data-testid="process-workbench-angular"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="panorama-subtabs"]')).toBeFalsy();
  });

  it('should persist document properties through the existing save endpoint', async () => {
    let savePayload: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/save/agent.json')) {
        savePayload = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({
          seq: 4,
          document: savePayload.document,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Agent', author: 'Old', date: '2026-06-01', space: 'Default', tags: '旧标签' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-properties-button"]')?.click();
    fixture.detectChanges();
    (compiled.querySelector<HTMLInputElement>('[data-testid="document-properties-name"]') as HTMLInputElement).value = 'New Agent';
    (compiled.querySelector<HTMLInputElement>('[data-testid="document-properties-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (compiled.querySelector<HTMLInputElement>('[data-testid="document-properties-author"]') as HTMLInputElement).value = 'Codex';
    (compiled.querySelector<HTMLInputElement>('[data-testid="document-properties-author"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    compiled.querySelector<HTMLButtonElement>('[data-testid="document-properties-save-button"]')?.click();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="wait-dialog"]')?.textContent).toContain('正在保存属性');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(savePayload?.document?.meta).toMatchObject({
      domain: 'New Agent',
      title: 'New Agent',
      author: 'Codex',
      date: '2026-06-01',
      space: 'Default',
      tags: '旧标签',
    });
    expect(runtime.modified).toBe(false);
    expect(runtime.collab.seq).toBe(4);
    expect(compiled.querySelector('[data-testid="document-properties-dialog"]')).toBeFalsy();
  });

  it('should keep the sidebar as an exclusive left column with collapsed directory nodes by default', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'panoramaWorkbench';
    runtime.ui['sbCollapse'] = {};
    runtime.ui['sidebarCollapsed'] = false;
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [{ uid: 'stage-1', name: '准备', panoramaColumnUid: 'column-1', panoramaLaneUid: 'lane-1' }],
      stageFlowRefs: [{ uid: 'ref-1', stageUid: 'stage-1', processUid: 'process-1', order: 1 }],
      processes: [{ uid: 'process-1', name: '入库预约', flowGroup: '入库组', businessConstructUid: 'construct-1', nodes: [] }],
      entities: [{ uid: 'entity-1', name: '仓单', businessConstructUid: 'construct-1', fields: [] }],
      businessComponents: [{ uid: 'bc-1', name: '循环', kind: 'core', entityUids: [], taskDefinitionUids: [], stageUids: ['stage-1'] }],
      businessConstructs: [{ uid: 'construct-1', name: '会话运行构件', businessComponentUid: 'bc-1' }],
      taskDefinitions: [{ uid: 'task-1', name: '代理运行', businessConstructUid: 'construct-1' }],
      terms: [],
      rules: [],
      panorama: {
        columns: [{ uid: 'column-1', name: '入库价值流' }],
        lanes: [{ uid: 'lane-1', name: '交易业务域' }],
        cells: [],
      },
    };
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/panorama');

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const main = compiled.querySelector('#main');
    const sidebar = compiled.querySelector('#sidebar');
    const workbench = compiled.querySelector('[data-testid="angular-workbench"]');
    expect(sidebar?.parentElement).toBe(main);
    expect(workbench?.querySelector('[data-testid="angular-shell-tab-bar"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="angular-sidebar-directory"]')).toBeTruthy();
    expect(compiled.querySelector('.sb-value-stream-head')?.textContent).toContain('入库价值流');
    expect(compiled.querySelector('[data-testid="sidebar-process-row"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="sidebar-construct-item"]')).toBeFalsy();

    fixture.destroy();
    runtime.ui['sbCollapse'] = {
      ...runtime.ui['sbCollapse'],
      'vs-column-1': false,
      'stage-tree-stage-1': false,
      'flow-group-stage-1-group-1': false,
      'cap-bc-1': false,
      'construct-bc-1-construct-1': false,
    };
    runtime.ui['sidebarCollapsed'] = false;
    const expandedFixture = TestBed.createComponent(LegacyShellComponent);
    expandedFixture.detectChanges();
    await expandedFixture.whenStable();
    expandedFixture.detectChanges();
    const expanded = expandedFixture.nativeElement as HTMLElement;

    expect(expanded.querySelector('.sb-flow-group-head')?.textContent).toContain('流程组');
    expect(expanded.querySelector('[data-testid="sidebar-process-row"]')?.textContent).toContain('入库预约');

    expect(expanded.querySelector('[data-testid="sidebar-construct-item"]')?.textContent).toContain('业务构件');
    const sections = [...expanded.querySelectorAll('.sb-asset-section')].map((item) => item.textContent || '');
    expect(sections.some((text) => text.includes('实体') && text.includes('仓单'))).toBe(true);
    expect(sections.some((text) => text.includes('任务') && text.includes('代理运行'))).toBe(true);
    expect(expanded.querySelector('.sb-related-processes')?.textContent).toContain('支撑流程');
  });

  it('should keep migration status aligned with restored Angular workbench entries', () => {
    const statusById = new Map(WORKBENCH_MIGRATION_STATUS.map((item) => [item.id, item.status]));

    expect(statusById.get('panorama')).toBe('angular');
    expect(statusById.get('component')).toBe('angular');
    expect(statusById.get('orchestration')).toBe('angular');
    expect(statusById.get('entity')).toBe('angular');
    expect(statusById.get('process')).toBe('angular');
    expect(statusById.get('knowledge')).toBe('angular');
    expect(statusById.get('role')).toBe('angular');
  });

  it('should disable document properties before a document is opened', () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = '';
    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const propertiesButton = compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-properties-button"]');

    expect(propertiesButton?.disabled).toBe(true);
    propertiesButton?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="document-properties-dialog"]')).toBeFalsy();
  });

  it('should edit the five document properties from the file menu', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/save/agent.json')) {
        const payload = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({
          seq: 2,
          document: payload.document,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const fixture = TestBed.createComponent(LegacyShellComponent);
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: {
        domain: 'Agent',
        author: 'Codex',
        date: '2026-06-18',
        space: '默认空间',
        tags: '最小建模',
      },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-properties-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="document-properties-dialog"]')).toBeTruthy();
    expect((compiled.querySelector('[data-testid="document-properties-name"]') as HTMLInputElement).value).toBe('Agent');
    expect((compiled.querySelector('[data-testid="document-properties-author"]') as HTMLInputElement).value).toBe('Codex');
    expect((compiled.querySelector('[data-testid="document-properties-date"]') as HTMLInputElement).value).toBe('2026-06-18');
    expect((compiled.querySelector('[data-testid="document-properties-space"]') as HTMLInputElement).value).toBe('默认空间');
    expect((compiled.querySelector('[data-testid="document-properties-tags"]') as HTMLInputElement).value).toBe('最小建模');

    const nameInput = compiled.querySelector('[data-testid="document-properties-name"]') as HTMLInputElement;
    nameInput.value = 'Agent v2';
    nameInput.dispatchEvent(new Event('input'));
    const tagsInput = compiled.querySelector('[data-testid="document-properties-tags"]') as HTMLInputElement;
    tagsInput.value = '最小建模，流程';
    tagsInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="document-properties-save-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(runtime.doc.meta.domain).toBe('Agent v2');
    expect(runtime.doc.meta.title).toBe('Agent v2');
    expect(runtime.doc.meta.tags).toBe('最小建模，流程');
    expect(runtime.doc.meta.space).toBe('默认空间');
    expect((runtime.doc.meta as Record<string, unknown>)['teamSpace']).toBeUndefined();
    expect(runtime.modified).toBe(false);
    expect(runtime.collab.seq).toBe(2);
    expect(compiled.querySelector('[data-testid="current-file-name"]')?.textContent?.trim()).toBe('Agent v2');
    expect(compiled.querySelector('[data-testid="document-properties-dialog"]')).toBeFalsy();
  });

  it('should restore copy, archive and delete document actions without placeholders', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/copy')) {
        expect(JSON.parse(String(init?.body))).toEqual({ source_name: 'agent.json', target_name: 'agent-copy.json' });
        return new Response(JSON.stringify({ ok: true, name: 'agent-copy.json' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/load/agent-copy.json')) {
        return new Response(JSON.stringify({ document: { meta: { domain: 'Agent Copy' } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/version/create')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ name: 'agent-copy.json', message: '手动归档' });
        return new Response(JSON.stringify({ ok: true, version_id: 'v1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/delete/agent-copy.json')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const promptSpy = vi.spyOn(window, 'prompt');

    const fixture = TestBed.createComponent(LegacyShellComponent);
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-save-as-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="copy-document-dialog"]')).toBeTruthy();
    const copyInput = compiled.querySelector('[data-testid="copy-document-name-input"]') as HTMLInputElement;
    copyInput.value = 'agent-copy.json';
    copyInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="copy-document-submit-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-archive-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(compiled.querySelector('[data-testid="archive-version-dialog"]')).toBeTruthy();
    const archiveInput = compiled.querySelector('[data-testid="archive-version-message-input"]') as HTMLInputElement;
    archiveInput.value = '手动归档';
    archiveInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="archive-version-submit-button"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="wait-dialog"]')?.textContent).toContain('正在归档版本');
    await fixture.whenStable();
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-delete-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchSpy).toHaveBeenCalledWith('/api/copy', expect.objectContaining({ method: 'POST' }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/version/create', expect.objectContaining({ method: 'POST' }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/delete/agent-copy.json', expect.objectContaining({ method: 'POST' }));
    expect(runtime.currentFile).toBe('');
  });

  it('should navigate manual and feedback entries to utility workbenches', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/docs')) {
        return new Response(JSON.stringify([{ id: 'manual', title: '用户手册' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/docs/manual')) {
        return new Response(JSON.stringify({ id: 'manual', title: '用户手册', content: '# 用户手册' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/feedback')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const fixture = TestBed.createComponent(LegacyShellComponent);
    const location = TestBed.inject(Location);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-manual-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(location.path()).toBe('/manual');
    expect(compiled.querySelector('[data-testid="manual-workbench"]')).toBeTruthy();

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-feedback-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(location.path()).toBe('/feedback');
    expect(compiled.querySelector('[data-testid="feedback-workbench"]')).toBeTruthy();
  });

  it('should show read-only version labels and local recovery actions in history', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/history/agent.json')) {
        return new Response(JSON.stringify([{ id: 'h1', message: '同步快照', seq: 3, timestamp_label: '今天' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/versions/agent.json')) {
        return new Response(JSON.stringify([{ id: 'v1', label: '验收版（2026年06月24日 11时38分19秒）', createdAt: '2026年06月24日 11时38分19秒' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/collab/submits/list')) {
        return new Response(JSON.stringify({ submits: [{ submitId: 's1', user: 'agent', baseSeq: 2, seq: 3 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/version/load')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ name: 'agent.json', version_id: 'v1' });
        return new Response(JSON.stringify({ meta: { readonly: true, version_id: 'v1', version_label: '验收版' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = { meta: { domain: 'Agent' }, roles: [], stages: [], stageFlowRefs: [], processes: [], entities: [], businessComponents: [], taskDefinitions: [], terms: [], rules: [] };

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-history-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="history-dialog"]')?.textContent).toContain('本地恢复');
    expect(compiled.querySelector('[data-testid="history-dialog"]')?.textContent).toContain('复制链接');
    expect(compiled.querySelector('[data-testid="history-dialog"] strong')?.textContent).toBe('验收版');
    expect(compiled.querySelector('[data-testid="history-dialog"]')?.textContent).toContain('2026年06月24日 11时38分19秒');
    expect(compiled.querySelector('[data-testid="history-dialog"]')?.textContent).not.toContain('稳定只读快照');

    Array.from(compiled.querySelectorAll<HTMLButtonElement>('[data-testid="history-dialog"] button'))
      .find((button) => button.textContent?.includes('复制链接'))
      ?.click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/[?&]doc=agent\.json(&|$)/));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('at=version%3Av1'));

    compiled.querySelectorAll<HTMLButtonElement>('[data-testid="history-dialog"] .btn-outline')[0]?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fetchSpy).toHaveBeenCalledWith('/api/version/load', expect.objectContaining({ method: 'POST' }));
    expect(compiled.querySelector('[data-testid="document-version-badge"]')?.textContent).toContain('验收版');
  });

  it('should render workspace and trash document cards with ten-item pagination in the open dialog', async () => {
    const documents = Array.from({ length: 11 }, (_, index) => ({
      name: `agent-${index + 1}.json`,
      title: `Agent ${index + 1}`,
      space: 'Agent',
      tags: ['最小建模'],
      author: 'Codex',
      date: '2026-06-18',
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify(documents), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/trash')) {
        return new Response(JSON.stringify([
          { id: 'trash-1', doc_name: '回收站文档', timestamp: '2026-06-17 10:00' },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="no-document-open-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchSpy).toHaveBeenCalledWith('/api/files/meta', expect.anything());
    expect(compiled.querySelector('[data-testid="open-document-dialog"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="open-workspace-tab"]')?.textContent).toContain('工作区文档');
    expect(compiled.querySelector('[data-testid="open-trash-tab"]')?.textContent).toContain('回收站');
    expect(compiled.querySelector('[data-testid="open-space-tab"]')?.textContent).toContain('Agent');
    expect(compiled.querySelectorAll('[data-testid="workspace-doc-card"]')).toHaveLength(10);
    expect(compiled.querySelector('[data-testid="workspace-pagination"]')?.textContent).toContain('第 1 / 2 页');

    compiled.querySelector<HTMLButtonElement>('[data-testid="open-trash-tab"]')?.click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('[data-testid="trash-doc-card"]')).toHaveLength(1);
  });

  it('should not show a blocking success toast after opening a document', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([
          { name: 'agent.json', title: 'Agent', space: 'Agent', tags: [] },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/trash')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/load/agent.json')) {
        return new Response(JSON.stringify({ document: { meta: {}, elements: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="no-document-open-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    compiled.querySelector<HTMLElement>('[data-testid="workspace-doc-card"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="app-toast"]')?.textContent ?? '').not.toContain('文档已打开');
  });

  it('should show a reusable wait dialog while opening a document', async () => {
    let resolveLoad: (response: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([
          { name: 'agent.json', title: 'Agent', space: 'Agent', tags: [] },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/trash')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/load/agent.json')) {
        return new Promise<Response>((resolve) => {
          resolveLoad = resolve;
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="no-document-open-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    compiled.querySelector<HTMLElement>('[data-testid="workspace-doc-card"]')?.click();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="wait-dialog"]')?.textContent).toContain('正在打开');
    expect(compiled.querySelector('[data-testid="wait-dialog"]')?.textContent).toContain('Agent');

    resolveLoad(new Response(JSON.stringify({ document: { meta: {}, elements: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await fixture.whenStable();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="wait-dialog"]')).toBeFalsy();
  });

  it('should delete selected trash entries and clear all trash entries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/trash')) {
        return new Response(JSON.stringify([
          { id: 'trash-1', doc_name: '回收站文档 1', timestamp: '2026-06-17 10:00' },
          { id: 'trash-2', doc_name: '回收站文档 2', timestamp: '2026-06-17 11:00' },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/trash/delete')) {
        expect(JSON.parse(String(init?.body))).toEqual({ entry_ids: ['trash-1'] });
        return new Response(JSON.stringify({ ok: true, deleted: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/trash/clear')) {
        return new Response(JSON.stringify({ ok: true, deleted: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="no-document-open-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="open-trash-tab"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLInputElement>('[data-testid="trash-select-checkbox"]')?.click();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="trash-clear-selected-button"]')?.textContent).toContain('1');
    compiled.querySelector<HTMLButtonElement>('[data-testid="trash-clear-selected-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="trash-clear-all-button"]')?.click();
    await fixture.whenStable();

    expect(fetchSpy).toHaveBeenCalledWith('/api/trash/delete', expect.objectContaining({ method: 'POST' }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/trash/clear', expect.objectContaining({ method: 'POST' }));
  });
});

