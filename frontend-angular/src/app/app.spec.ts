import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';
import { WORKBENCH_MIGRATION_STATUS } from './core/migration/workbench-migration-status';
import { getAngularRuntimeState } from './core/runtime/angular-runtime';
import { ShellComponent } from './shell/shell.component';

describe('App', () => {
  beforeEach(async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = '';
    runtime.modified = false;
    runtime.readOnly = false;
    runtime.ui['mainTab'] = 'panoramaWorkbench';
    runtime.ui['navHistory'] = [];
    runtime.collab.seq = 0;
    runtime.collab.acceptedSeq = 0;
    runtime.collab.pendingSnapshot = false;
    runtime.collab.draftBaseSeqOverride = undefined;
    runtime.collab.recoveryMode = false;

    await TestBed.configureTestingModule({
      imports: [App, ShellComponent],
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

  it('should render the BLM toolbar through the Angular shell', () => {
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#toolbar')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="toolbar-new-button"]')?.textContent).toContain('新建');
  });

  it('should open a custom create-document dialog without browser prompt', () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    const fixture = TestBed.createComponent(ShellComponent);
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
    const fixture = TestBed.createComponent(ShellComponent);
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

    const fixture = TestBed.createComponent(ShellComponent);
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
    expect(compiled.querySelector('[data-testid="role-create-inline"]')).toBeFalsy();

    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-terms"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="knowledge-angular"]')?.textContent).toContain('术语管理');
    expect(compiled.querySelector('[data-testid="knowledge-term-add"]')).toBeFalsy();
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

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-roles"]')?.click();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="role-create-inline"]')).toBeFalsy();
    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-editor-open"]')?.click();
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
    expect(compiled.querySelector('[data-testid="role-create-inline"]')).toBeTruthy();

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

  it('should delete unused roles through the custom confirm dialog', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [{ uid: 'role-unused', id: 'R1', name: '临时角色', group: '系统角色' }],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };
    runtime.ui['roleWorkbenchMode'] = 'management';

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-roles"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-editor-open"]')?.click();
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('.role-light-remove')?.click();
    fixture.detectChanges();

    const dialog = compiled.querySelector('[data-testid="runtime-confirm-dialog"]');
    expect(dialog?.textContent).toContain('删除角色');
    expect(dialog?.textContent).toContain('临时角色');
    compiled.querySelector<HTMLButtonElement>('[data-testid="runtime-confirm-submit"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(runtime.doc.roles.some((role: any) => role.name === '临时角色')).toBe(false);
    expect(compiled.querySelector('[data-testid="runtime-confirm-dialog"]')).toBeFalsy();
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

    const fixture = TestBed.createComponent(ShellComponent);
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

  it('should pull the remote document instead of posting a stale clean role snapshot', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/load/agent.json')) {
        return new Response(JSON.stringify({
          meta: { domain: 'Remote' },
          roles: [{ uid: 'remote-role', name: '远端新增角色', group: '系统角色' }],
          stages: [],
          stageFlowRefs: [],
          processes: [],
          entities: [],
          businessComponents: [],
          taskDefinitions: [],
          terms: [],
          rules: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/collab/snapshot')) {
        return new Response(JSON.stringify({ error: 'stale snapshot should not be submitted' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Local' },
      roles: [{ uid: 'local-role', name: '本地旧角色', group: '系统角色' }],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };
    runtime.modified = false;
    runtime.collab.pendingSnapshot = false;
    runtime.collab.hasRemoteUpdate = true;
    runtime.collab.seq = 12;
    runtime.collab.acceptedSeq = 11;

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-roles"]')?.click();
    fixture.detectChanges();
    expect(compiled.textContent).toContain('本地旧角色');

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-sync-button"]')?.click();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fetchSpy).toHaveBeenCalledWith('/api/load/agent.json', expect.objectContaining({ cache: 'no-store' }));
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/collab/snapshot', expect.anything());
    expect(runtime.doc.roles[0].name).toBe('远端新增角色');
    expect(runtime.collab.hasRemoteUpdate).toBe(false);
    expect(compiled.textContent).toContain('远端新增角色');
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

    const fixture = TestBed.createComponent(ShellComponent);
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

  it('should render document preview and export json from the preview workbench', async () => {
    const createObjectUrl = vi.fn().mockReturnValue('blob:preview-json');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'preview';
    runtime.doc = {
      meta: { domain: 'Agent', title: '交割监管平台' },
      roles: [{ uid: 'role-1', name: '监管员' }],
      stages: [{ uid: 'stage-1', name: '入库' }],
      stageFlowRefs: [],
      processes: [{ uid: 'proc-1', name: '入库流程', nodes: [{ uid: 'node-1', name: '提交申请' }] }],
      entities: [{ uid: 'entity-1', name: '仓单', fields: [{ uid: 'field-1', name: '仓单编号', type: 'String' }] }],
      businessComponents: [{ uid: 'bc-1', name: '仓单组件' }],
      taskDefinitions: [{ uid: 'task-1', name: '保存仓单' }],
      terms: [],
      rules: [],
    };
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/preview');

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="preview-workbench"]')?.textContent).toContain('交割监管平台');
    expect(compiled.querySelector('[data-testid="preview-summary"]')?.textContent).toContain('流程');
    expect(compiled.querySelector('[data-testid="preview-summary"]')?.textContent).toContain('1');
    expect(compiled.querySelector('[data-testid="preview-process-list"]')?.textContent).toContain('入库流程');

    compiled.querySelector<HTMLButtonElement>('[data-testid="preview-export-json"]')?.click();

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should export a saved document as a zip bundle from the preview workbench', async () => {
    const createObjectUrl = vi.fn().mockReturnValue('blob:preview-bundle');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    let requestedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(new Blob(['zip-content'], { type: 'application/zip' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="agent-bundle.zip"',
        },
      });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'preview';
    runtime.doc = {
      meta: { domain: 'Agent', title: '交割监管平台' },
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
    await router.navigateByUrl('/preview');

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="preview-export-bundle"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(requestedUrl).toContain('/api/export-bundle/agent.json');
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should start a docx export job from the preview workbench and download it when done', async () => {
    const createObjectUrl = vi.fn().mockReturnValue('blob:preview-docx');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('/api/export-docx/start')) {
        return new Response(JSON.stringify({
          id: 'job-1',
          status: 'queued',
          progress: 5,
          message: '等待生成 DOCX',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/export-jobs/job-1/download')) {
        return new Response(new Blob(['docx-content'], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': 'attachment; filename="agent.docx"',
          },
        });
      }
      if (url.includes('/api/export-jobs/job-1')) {
        return new Response(JSON.stringify({
          id: 'job-1',
          status: 'done',
          progress: 100,
          filename: 'agent.docx',
          message: 'DOCX 已生成',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'preview';
    runtime.doc = {
      meta: { domain: 'Agent', title: '交割监管平台' },
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
    await router.navigateByUrl('/preview');

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="preview-export-docx"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="wait-dialog"]')?.textContent).toContain('DOCX');
    await fixture.whenStable();
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(requestedUrls.some((url) => url.includes('/api/export-jobs/job-1/download'))).toBe(true);
    });

    expect(requestedUrls.some((url) => url.includes('/api/export-docx/start'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('/api/export-jobs/job-1'))).toBe(true);
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should compare the current document with another workspace document', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([
          { name: 'agent.json', title: '当前版本' },
          { name: 'agent-old.json', title: '旧版本' },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/load/agent-old.json')) {
        return new Response(JSON.stringify({
          document: {
            meta: { domain: 'Agent Old' },
            roles: [{ uid: 'role-1', name: '监管员' }],
            stages: [],
            stageFlowRefs: [],
            processes: [{ uid: 'proc-1', name: '旧入库流程', nodes: [] }],
            entities: [],
            businessComponents: [],
            taskDefinitions: [],
            terms: [],
            rules: [],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Agent New' },
      roles: [{ uid: 'role-1', name: '监管员' }],
      stages: [],
      stageFlowRefs: [],
      processes: [
        { uid: 'proc-1', name: '新入库流程', nodes: [] },
        { uid: 'proc-2', name: '出库流程', nodes: [] },
      ],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-compare-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="compare-dialog"]')?.textContent).toContain('版本比对');
    const select = compiled.querySelector<HTMLSelectElement>('[data-testid="compare-right-select"]')!;
    select.value = 'agent-old.json';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="compare-run-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="compare-result"]')?.textContent).toContain('新增 1');
    expect(compiled.querySelector('[data-testid="compare-result"]')?.textContent).toContain('修改 1');
    expect(compiled.querySelector('[data-testid="compare-result"]')?.textContent).toContain('出库流程');
    expect(compiled.querySelector('[data-testid="compare-result"]')?.textContent).toContain('新入库流程');
  });

  it('should run a merge precheck for the current document and another workspace document', async () => {
    let mergePayload: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([
          { name: 'agent.json', title: '当前版本' },
          { name: 'agent-branch.json', title: '分支版本' },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/load/agent-branch.json')) {
        return new Response(JSON.stringify({
          document: {
            meta: { domain: 'Agent Branch' },
            roles: [],
            stages: [],
            stageFlowRefs: [],
            processes: [{ uid: 'proc-branch', name: '分支流程', nodes: [] }],
            entities: [],
            businessComponents: [],
            taskDefinitions: [],
            terms: [],
            rules: [],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/merge/analyze')) {
        mergePayload = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({
          summary: { autoMergedCount: 2, validationIssueCount: 1 },
          conflicts: [{ id: 'c1', path: 'processes.proc-branch.name', left: '分支流程', right: '当前流程' }],
          validation_issues: [{ path: 'stageFlowRefs[0]', message: '流程引用缺失' }],
          merged_document: { meta: { domain: 'Merged' }, processes: [] },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Agent Current' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'proc-current', name: '当前流程', nodes: [] }],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-merge-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = compiled.querySelector<HTMLSelectElement>('[data-testid="merge-right-select"]')!;
    select.value = 'agent-branch.json';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="merge-analyze-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mergePayload).toMatchObject({ left_name: 'agent.json', right_name: 'agent-branch.json' });
    expect(compiled.querySelector('[data-testid="merge-analysis"]')?.textContent).toContain('自动合并 2');
    expect(compiled.querySelector('[data-testid="merge-analysis"]')?.textContent).toContain('冲突 1');
    expect(compiled.querySelector('[data-testid="merge-analysis"]')?.textContent).toContain('流程引用缺失');
  });

  it('should save and open a merge result when the precheck has no blockers', async () => {
    let savedName = '';
    let savedDocument: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([
          { name: 'agent.json', title: '当前版本' },
          { name: 'agent-branch.json', title: '分支版本' },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/load/agent-branch.json')) {
        return new Response(JSON.stringify({
          document: {
            meta: { domain: 'Agent Branch' },
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
      if (url.includes('/api/merge/analyze')) {
        return new Response(JSON.stringify({
          suggested_name: 'Agent 合并版',
          summary: { autoMergedCount: 3, validationIssueCount: 0 },
          conflicts: [],
          validation_issues: [],
          merged_document: {
            meta: { domain: 'Merged Draft' },
            roles: [],
            stages: [],
            stageFlowRefs: [],
            processes: [{ uid: 'proc-merged', name: '合并流程', nodes: [] }],
            entities: [],
            businessComponents: [],
            taskDefinitions: [],
            terms: [],
            rules: [],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/save/')) {
        savedName = decodeURIComponent(url.split('/api/save/')[1] || '');
        savedDocument = JSON.parse(String(init?.body || '{}')).document;
        return new Response(JSON.stringify({ name: savedName, document: savedDocument }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Agent Current' },
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

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-merge-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="merge-analyze-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="merge-save-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(savedName).toBe('Agent 合并版');
    expect(savedDocument?.meta?.title).toBe('Agent 合并版');
    expect(runtime.currentFile).toBe('Agent 合并版');
    expect(runtime.doc.processes[0].uid).toBe('proc-merged');
  });

  it('should apply selected merge conflict resolutions before saving the merge result', async () => {
    let applyPayload: any = null;
    let savedDocument: any = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([
          { name: 'agent.json', title: '当前版本' },
          { name: 'agent-branch.json', title: '分支版本' },
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/load/agent-branch.json')) {
        return new Response(JSON.stringify({
          document: {
            meta: { domain: 'Agent Branch' },
            roles: [{ uid: 'role-1', name: '分支角色', desc: '右侧' }],
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
      if (url.includes('/api/merge/analyze')) {
        return new Response(JSON.stringify({
          suggested_name: 'Agent 冲突合并版',
          summary: { autoMergedCount: 1, validationIssueCount: 0 },
          conflicts: [{
            id: 'conflict-1',
            path: 'roles.role-1.desc',
            label: '角色描述冲突',
            resolution_options: ['left', 'right'],
            left_value: '左侧',
            right_value: '右侧',
          }],
          validation_issues: [],
          merged_document: { meta: { domain: 'Draft' }, roles: [] },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/merge/apply')) {
        applyPayload = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({
          suggested_name: 'Agent 冲突合并版',
          summary: { autoMergedCount: 1, validationIssueCount: 0 },
          conflicts: [],
          validation_issues: [],
          merged_document: {
            meta: { domain: 'Applied Draft' },
            roles: [{ uid: 'role-1', name: '分支角色', desc: '右侧' }],
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
      if (url.includes('/api/save/')) {
        savedDocument = JSON.parse(String(init?.body || '{}')).document;
        return new Response(JSON.stringify({ name: 'Agent 冲突合并版', document: savedDocument }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = {
      meta: { domain: 'Agent Current' },
      roles: [{ uid: 'role-1', name: '当前角色', desc: '左侧' }],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-merge-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="merge-analyze-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = compiled.querySelector<HTMLSelectElement>('[data-testid="merge-resolution-conflict-1"]')!;
    select.value = 'right';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="merge-save-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(applyPayload?.resolutions).toEqual({ 'conflict-1': { choice: 'right' } });
    expect(savedDocument?.roles?.[0]?.desc).toBe('右侧');
    expect(runtime.currentFile).toBe('Agent 冲突合并版');
  });

  it('should edit task technical handover in the component workbench', async () => {
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
      businessComponents: [{ uid: 'bc-1', name: '仓储组件', kind: 'core', entityUids: [], taskDefinitionUids: ['task-save'] }],
      businessConstructs: [{ uid: 'construct-1', name: '入库预约构件', businessComponentUid: 'bc-1' }],
      taskDefinitions: [
        {
          uid: 'task-save',
          name: '保存入库预约',
          type: 'Command',
          constructUid: 'construct-1',
          parameters: {
            inputs: [{ name: 'warehouseId', type: 'String', required: true, note: '仓库标识' }],
            outputs: [{ name: 'reservationId', type: 'String', required: false, note: '预约标识' }],
          },
          technicalHandover: {
            runtimeKind: 'DomainServiceJar',
            target: 'InboundReservationService.submit',
            note: '由 FSM 内嵌领域服务承接。',
          },
        },
      ],
      services: [],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const constructTab = compiled.querySelector<HTMLButtonElement>('[data-testid="tab-constructWorkbench"]');
    expect(constructTab).toBeTruthy();
    constructTab!.click();
    fixture.detectChanges();
    const taskTab = compiled.querySelector<HTMLButtonElement>('[data-testid="component-taskdef-tab"]');
    expect(taskTab).toBeTruthy();
    taskTab!.click();
    fixture.detectChanges();
    const taskHead = compiled.querySelector<HTMLElement>('[data-testid="taskdef-head-task-save"]');
    expect(taskHead).toBeTruthy();
    taskHead!.click();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="taskdef-technical-handover-task-save"]')?.textContent).toContain('技术承接');
    expect(compiled.querySelector('[data-testid="taskdef-technical-handover-task-save"]')?.textContent).toContain('DomainServiceJar');
    expect(compiled.querySelector('[data-testid="taskdef-technical-handover-task-save"]')?.textContent).toContain('InboundReservationService.submit');

    compiled.querySelector<HTMLButtonElement>('[data-testid="taskdef-edit-task-save"]')?.click();
    fixture.detectChanges();

    const runtimeKind = compiled.querySelector<HTMLInputElement>('[data-testid="taskdef-handover-runtime-kind"]')!;
    const target = compiled.querySelector<HTMLInputElement>('[data-testid="taskdef-handover-target"]')!;
    const note = compiled.querySelector<HTMLTextAreaElement>('[data-testid="taskdef-handover-note"]')!;
    runtimeKind.value = 'QueryHttp';
    runtimeKind.dispatchEvent(new Event('input', { bubbles: true }));
    target.value = 'GET /query/inbound-reservations';
    target.dispatchEvent(new Event('input', { bubbles: true }));
    note.value = '查询服务通过事件溯源落库后提供。';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="taskdef-save-task-save"]')?.click();
    fixture.detectChanges();

    expect(runtime.doc.taskDefinitions[0].technicalHandover).toEqual({
      runtimeKind: 'QueryHttp',
      target: 'GET /query/inbound-reservations',
      note: '查询服务通过事件溯源落库后提供。',
    });
    expect(runtime.modified).toBe(true);
  });

  it('should edit application service request and response params through the unified services model', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
      services: [
        {
          uid: 'service-submit',
          name: '提交入库预约',
          method: 'POST',
          path: '/inbound-reservations/submit',
          desc: '客户提交入库预约时调用。',
          requestParams: [{ name: 'warehouseId', type: 'String', required: true, note: '仓库标识' }],
          responseParams: [{ name: 'reservationNo', type: 'String', required: false, note: '预约编号' }],
          nodeRefs: [],
          orchestration: { variables: [], steps: [], returnMapping: [] },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const appTab = compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]');
    expect(appTab).toBeTruthy();
    appTab!.click();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="interface-card-service-submit"]')?.textContent).toContain('提交入库预约');
    compiled.querySelector<HTMLButtonElement>('[data-testid="interface-edit-service-submit"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const requestName = compiled.querySelector<HTMLInputElement>('[data-testid="service-request-param-name-0"]')!;
    const responseName = compiled.querySelector<HTMLInputElement>('[data-testid="service-response-param-name-0"]')!;
    expect(requestName.value).toBe('warehouseId');
    expect(responseName.value).toBe('reservationNo');

    requestName.value = 'warehouseUid';
    requestName.dispatchEvent(new Event('input', { bubbles: true }));
    responseName.value = 'reservationCode';
    responseName.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="service-save-service-submit"]')?.click();
    fixture.detectChanges();

    expect(runtime.doc.services[0].requestParams[0].name).toBe('warehouseUid');
    expect(runtime.doc.services[0].responseParams[0].name).toBe('reservationCode');
    expect(runtime.doc.services[0].inputs).toBeUndefined();
    expect(runtime.doc.services[0].outputs).toBeUndefined();
    expect(runtime.modified).toBe(true);
  });

  it('should group application interfaces under service groups', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
      serviceGroups: [{ uid: 'group-inbound', name: '入库预约服务', desc: '入库预约相关接口' }],
      services: [
        {
          uid: 'interface-submit',
          name: '提交入库预约',
          serviceGroupUid: 'group-inbound',
          method: 'POST',
          path: '/inbound-reservations/submit',
          requestParams: [],
          responseParams: [],
          nodeRefs: [],
          orchestration: { variables: [], steps: [], returnMapping: [] },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]')?.click();
    fixture.detectChanges();

    const group = compiled.querySelector('[data-testid="service-group-group-inbound"]');
    expect(group?.textContent).toContain('入库预约服务');
    expect(group?.textContent).toContain('提交入库预约');
    expect(group?.textContent).toContain('/inbound-reservations/submit');
    expect(compiled.querySelector('[data-testid="interface-card-interface-submit"]')).toBeTruthy();
  });

  it('should let users maintain service groups and interfaces inside the selected group', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
      serviceGroups: [
        { uid: 'group-inbound', name: '入库服务', desc: '入库接口' },
        { uid: 'group-outbound', name: '出库服务', desc: '' },
      ],
      services: [
        {
          uid: 'interface-submit',
          name: '提交入库预约',
          serviceGroupUid: 'group-inbound',
          method: 'POST',
          path: '/inbound-reservations/submit',
          requestParams: [],
          responseParams: [],
          nodeRefs: [],
          orchestration: { variables: [], steps: [], returnMapping: [] },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]')?.click();
    fixture.detectChanges();

    const groupName = compiled.querySelector<HTMLInputElement>('[data-testid="service-group-name-group-inbound"]')!;
    groupName.value = '入库预约服务';
    groupName.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="service-group-toggle-group-inbound"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="interface-card-interface-submit"]')).toBeFalsy();

    compiled.querySelector<HTMLButtonElement>('[data-testid="service-group-toggle-group-inbound"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="interface-card-interface-submit"]')).toBeTruthy();

    compiled.querySelector<HTMLButtonElement>('[data-testid="service-group-add-interface-group-inbound"]')?.click();
    fixture.detectChanges();
    const newName = compiled.querySelector<HTMLInputElement>('[data-testid="interface-name-draft"]')!;
    newName.value = '查询预约';
    newName.dispatchEvent(new Event('input', { bubbles: true }));
    const newPath = compiled.querySelector<HTMLInputElement>('[data-testid="interface-path-draft"]')!;
    newPath.value = '/inbound-reservations/query';
    newPath.dispatchEvent(new Event('input', { bubbles: true }));
    compiled.querySelector<HTMLButtonElement>('[data-testid="service-save-draft"]')?.click();
    fixture.detectChanges();

    expect(runtime.doc.services.some((service: any) => service.name === '查询预约' && service.serviceGroupUid === 'group-inbound')).toBe(true);

    compiled.querySelector<HTMLButtonElement>('[data-testid="interface-edit-interface-submit"]')?.click();
    fixture.detectChanges();
    const groupSelect = compiled.querySelector<HTMLSelectElement>('[data-testid="service-interface-group-select-interface-submit"]')!;
    groupSelect.value = 'group-outbound';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="service-save-interface-submit"]')?.click();
    fixture.detectChanges();

    expect(runtime.doc.serviceGroups[0].name).toBe('入库预约服务');
    expect(runtime.doc.services.find((service: any) => service.uid === 'interface-submit')?.serviceGroupUid).toBe('group-outbound');
    expect(compiled.querySelector('[data-testid="service-group-group-outbound"]')?.textContent).toContain('提交入库预约');

    compiled.querySelector<HTMLButtonElement>('[data-testid="service-group-delete-group-inbound"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="runtime-confirm-submit"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(runtime.doc.serviceGroups.some((group: any) => group.uid === 'group-inbound')).toBe(false);
  });

  it('should delete application interfaces and service groups through the custom confirm dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
      serviceGroups: [{ uid: 'group-inbound', name: '入库服务', desc: '' }],
      services: [
        {
          uid: 'interface-submit',
          name: '提交入库预约',
          serviceGroupUid: 'group-inbound',
          method: 'POST',
          path: '/inbound-reservations/submit',
          requestParams: [],
          responseParams: [],
          nodeRefs: [],
          orchestration: { variables: [], steps: [], returnMapping: [] },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]')?.click();
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="interface-delete-interface-submit"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="runtime-confirm-dialog"]')?.textContent).toContain('删除接口');
    expect(compiled.querySelector('[data-testid="runtime-confirm-dialog"]')?.textContent).toContain('提交入库预约');
    compiled.querySelector<HTMLButtonElement>('[data-testid="runtime-confirm-submit"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(runtime.doc.services).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();

    compiled.querySelector<HTMLButtonElement>('[data-testid="service-group-delete-group-inbound"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="runtime-confirm-dialog"]')?.textContent).toContain('删除服务');
    compiled.querySelector<HTMLButtonElement>('[data-testid="runtime-confirm-submit"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(runtime.doc.serviceGroups).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('should edit nested request parameters for an application interface', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
      serviceGroups: [{ uid: 'group-inbound', name: '入库预约服务' }],
      services: [
        {
          uid: 'interface-submit',
          name: '提交入库预约',
          serviceGroupUid: 'group-inbound',
          method: 'POST',
          path: '/inbound-reservations/submit',
          requestParams: [{ name: 'reservation', type: 'Object', required: true, note: '预约信息', children: [] }],
          responseParams: [],
          nodeRefs: [],
          orchestration: { variables: [], steps: [], returnMapping: [] },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="interface-edit-interface-submit"]')?.click();
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="service-request-param-add-child-0"]')?.click();
    fixture.detectChanges();
    const childName = compiled.querySelector<HTMLInputElement>('[data-testid="service-request-param-name-0-0"]')!;
    childName.value = 'warehouseUid';
    childName.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="service-save-interface-submit"]')?.click();
    fixture.detectChanges();

    expect(runtime.doc.services[0].requestParams[0].children).toEqual([
      { name: 'warehouseUid', type: 'String', required: false, note: '' },
    ]);
  });

  it('should manage application orchestration steps through orchestration.steps with stable aliases', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [
        { uid: 'task-check', name: '校验仓库状态', parameters: { inputs: [], outputs: [] } },
        { uid: 'task-save', name: '保存入库预约', parameters: { inputs: [], outputs: [] } },
      ],
      services: [
        {
          uid: 'service-submit',
          name: '提交入库预约',
          method: 'POST',
          path: '/inbound-reservations/submit',
          requestParams: [],
          responseParams: [],
          nodeRefs: [],
          orchestration: {
            variables: [],
            steps: [
              {
                uid: 'step-check',
                name: '校验仓库状态',
                stepAlias: 'checkWarehouse',
                taskDefinitionUid: 'task-check',
                inputMapping: [],
                outputMapping: [],
              },
            ],
            returnMapping: [],
          },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const appTab = compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]');
    expect(appTab).toBeTruthy();
    appTab!.click();
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="application-orchestration-tab"]')?.click();
    fixture.detectChanges();
    const serviceSelect = compiled.querySelector<HTMLSelectElement>('[data-testid="orchestration-service-select"]')!;
    serviceSelect.value = 'service-submit';
    serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="orchestration-step-select-step-check"]')?.textContent).toContain('checkWarehouse');

    const addStep = compiled.querySelector<HTMLSelectElement>('[data-testid="orchestration-add-step"]')!;
    addStep.value = 'task-save';
    addStep.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(runtime.doc.services[0].orchestration.steps.map((step: any) => ({
      taskDefinitionUid: step.taskDefinitionUid,
      stepAlias: step.stepAlias,
    }))).toEqual([
      { taskDefinitionUid: 'task-check', stepAlias: 'checkWarehouse' },
      { taskDefinitionUid: 'task-save', stepAlias: 'step2' },
    ]);
    expect(runtime.doc.services[0].steps).toBeUndefined();
    expect(runtime.modified).toBe(true);
  });

  it('should show selected orchestration step details in a right side editor panel', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [
        { uid: 'task-check', name: '校验仓库状态', parameters: { inputs: [{ name: 'warehouseUid', type: 'String', required: true }], outputs: [] } },
        { uid: 'task-save', name: '保存入库预约', parameters: { inputs: [{ name: 'warehouseUid', type: 'String', required: true }], outputs: [{ name: 'reservationUid', type: 'String' }] } },
      ],
      services: [
        {
          uid: 'interface-submit',
          name: '提交入库预约',
          method: 'POST',
          path: '/inbound-reservations/submit',
          requestParams: [],
          responseParams: [],
          nodeRefs: [],
          orchestration: {
            variables: [],
            steps: [
              { uid: 'step-check', name: '校验仓库状态', stepAlias: 'checkWarehouse', taskDefinitionUid: 'task-check', inputMapping: [], outputMapping: [] },
              { uid: 'step-save', name: '保存入库预约', stepAlias: 'saveReservation', taskDefinitionUid: 'task-save', inputMapping: [], outputMapping: [] },
            ],
            returnMapping: [],
          },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="application-orchestration-tab"]')?.click();
    fixture.detectChanges();
    const serviceSelect = compiled.querySelector<HTMLSelectElement>('[data-testid="orchestration-service-select"]')!;
    serviceSelect.value = 'interface-submit';
    serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="orchestration-step-select-step-save"]')?.click();
    fixture.detectChanges();

    const detail = compiled.querySelector('[data-testid="orchestration-step-detail"]');
    expect(compiled.querySelector('[data-testid="orchestration-step-list"]')).toBeTruthy();
    expect(detail?.textContent).toContain('保存入库预约');
    expect(detail?.textContent).toContain('saveReservation');
    expect(detail?.textContent).toContain('warehouseUid');
    expect(detail?.textContent).toContain('reservationUid');
    expect(getComputedStyle(compiled.querySelector<HTMLElement>('[data-testid="orchestration-step-list"]')!).overflowY).toBe('auto');
  });

  it('should map orchestration variables through step input output and return mappings', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [
        {
          uid: 'task-save',
          name: '保存入库预约',
          parameters: {
            inputs: [{ name: 'warehouseId', type: 'String', required: true, note: '仓库标识' }],
            outputs: [{ name: 'reservationId', type: 'String', required: false, note: '预约标识' }],
          },
        },
      ],
      services: [
        {
          uid: 'service-submit',
          name: '提交入库预约',
          method: 'POST',
          path: '/inbound-reservations/submit',
          requestParams: [{ name: 'warehouseId', type: 'String', required: true, note: '仓库标识' }],
          responseParams: [{ name: 'reservationId', type: 'String', required: false, note: '预约标识' }],
          nodeRefs: [],
          orchestration: {
            variables: [],
            steps: [
              {
                uid: 'step-save',
                name: '保存入库预约',
                stepAlias: 'saveReservation',
                taskDefinitionUid: 'task-save',
                inputMapping: [],
                outputMapping: [],
              },
            ],
            returnMapping: [],
          },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const appTab = compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]')!;
    appTab.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="application-orchestration-tab"]')?.click();
    fixture.detectChanges();
    const serviceSelect = compiled.querySelector<HTMLSelectElement>('[data-testid="orchestration-service-select"]')!;
    serviceSelect.value = 'service-submit';
    serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="mapping-add-input-step-save"]')?.click();
    fixture.detectChanges();
    const inputSource = compiled.querySelector<HTMLInputElement>('[data-testid="mapping-input-source-step-save-0"]')!;
    const inputTarget = compiled.querySelector<HTMLInputElement>('[data-testid="mapping-input-target-step-save-0"]')!;
    inputSource.value = 'request.warehouseId';
    inputSource.dispatchEvent(new Event('input', { bubbles: true }));
    inputTarget.value = 'warehouseId';
    inputTarget.dispatchEvent(new Event('input', { bubbles: true }));

    compiled.querySelector<HTMLButtonElement>('[data-testid="mapping-add-output-step-save"]')?.click();
    fixture.detectChanges();
    const outputSource = compiled.querySelector<HTMLInputElement>('[data-testid="mapping-output-source-step-save-0"]')!;
    const outputTarget = compiled.querySelector<HTMLInputElement>('[data-testid="mapping-output-target-step-save-0"]')!;
    outputSource.value = 'reservationId';
    outputSource.dispatchEvent(new Event('input', { bubbles: true }));
    outputTarget.value = 'step.saveReservation.reservationId';
    outputTarget.dispatchEvent(new Event('input', { bubbles: true }));

    compiled.querySelector<HTMLButtonElement>('[data-testid="mapping-add-return"]')?.click();
    fixture.detectChanges();
    const returnSource = compiled.querySelector<HTMLInputElement>('[data-testid="mapping-return-source-0"]')!;
    const returnTarget = compiled.querySelector<HTMLInputElement>('[data-testid="mapping-return-target-0"]')!;
    returnSource.value = 'step.saveReservation.reservationId';
    returnSource.dispatchEvent(new Event('input', { bubbles: true }));
    returnTarget.value = 'reservationId';
    returnTarget.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(runtime.doc.services[0].orchestration.steps[0].inputMapping).toEqual([
      { source: 'request.warehouseId', target: 'warehouseId' },
    ]);
    expect(runtime.doc.services[0].orchestration.steps[0].outputMapping).toEqual([
      { source: 'reservationId', target: 'step.saveReservation.reservationId' },
    ]);
    expect(runtime.doc.services[0].orchestration.returnMapping).toEqual([
      { source: 'step.saveReservation.reservationId', target: 'reservationId' },
    ]);
    expect(runtime.modified).toBe(true);
  });

  it('should choose orchestration mappings from accumulated nested variable options', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [
        {
          uid: 'task-check-warehouse',
          name: '校验仓库',
          parameters: {
            inputs: [{ name: 'warehouseUid', type: 'String', required: true }],
            outputs: [{ name: 'warehouseStatus', type: 'String', required: false }],
          },
        },
        {
          uid: 'task-check-items',
          name: '校验品种',
          parameters: {
            inputs: [{ name: 'items', type: 'Array', required: true, children: [{ name: 'productCode', type: 'String' }] }],
            outputs: [{ name: 'itemCheckResult', type: 'Map', required: false, children: [{ name: 'passed', type: 'Boolean' }] }],
          },
        },
        {
          uid: 'task-save',
          name: '保存预约',
          parameters: {
            inputs: [
              { name: 'warehouseUid', type: 'String', required: true },
              { name: 'itemCheckResult', type: 'Map', required: true, children: [{ name: 'passed', type: 'Boolean' }] },
            ],
            outputs: [{ name: 'reservationUid', type: 'String', required: false }],
          },
        },
      ],
      services: [
        {
          uid: 'service-submit',
          name: '提交入库预约',
          method: 'POST',
          path: '/inbound-reservations/submit',
          requestParams: [
            {
              name: 'reservation',
              type: 'Object',
              required: true,
              note: '',
              children: [
                { name: 'warehouseUid', type: 'String', required: true, note: '' },
                { name: 'items', type: 'Array', required: true, note: '', children: [{ name: 'productCode', type: 'String', required: true, note: '' }] },
              ],
            },
          ],
          responseParams: [{ name: 'reservationUid', type: 'String', required: false, note: '' }],
          nodeRefs: [],
          orchestration: {
            variables: [],
            steps: [
              { uid: 'step-warehouse', name: '校验仓库', stepAlias: 'checkWarehouse', taskDefinitionUid: 'task-check-warehouse', inputMapping: [], outputMapping: [] },
              { uid: 'step-items', name: '校验品种', stepAlias: 'checkItems', taskDefinitionUid: 'task-check-items', inputMapping: [], outputMapping: [] },
              { uid: 'step-save', name: '保存预约', stepAlias: 'saveReservation', taskDefinitionUid: 'task-save', inputMapping: [], outputMapping: [] },
            ],
            returnMapping: [],
          },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="tab-applicationWorkbench"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="application-orchestration-tab"]')?.click();
    fixture.detectChanges();
    const serviceSelect = compiled.querySelector<HTMLSelectElement>('[data-testid="orchestration-service-select"]')!;
    serviceSelect.value = 'service-submit';
    serviceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    compiled.querySelector<HTMLButtonElement>('[data-testid="orchestration-step-select-step-save"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="orchestration-variable-pool"]')?.textContent).toContain('request.reservation.items[].productCode');
    expect(compiled.querySelector('[data-testid="orchestration-variable-pool"]')?.textContent).toContain('step.checkItems.output.itemCheckResult.passed');

    compiled.querySelector<HTMLButtonElement>('[data-testid="mapping-add-input-step-save"]')?.click();
    fixture.detectChanges();
    const sourceSelect = compiled.querySelector<HTMLSelectElement>('[data-testid="mapping-input-source-step-save-0"]')!;
    const targetSelect = compiled.querySelector<HTMLSelectElement>('[data-testid="mapping-input-target-step-save-0"]')!;
    expect(Array.from(sourceSelect.options).map((option) => option.value)).toContain('step.checkItems.output.itemCheckResult.passed');
    expect(Array.from(targetSelect.options).map((option) => option.value)).toContain('itemCheckResult.passed');

    sourceSelect.value = 'step.checkItems.output.itemCheckResult.passed';
    sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    targetSelect.value = 'itemCheckResult.passed';
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(runtime.doc.services[0].orchestration.steps[2].inputMapping).toEqual([
      { source: 'step.checkItems.output.itemCheckResult.passed', target: 'itemCheckResult.passed' },
    ]);
  });

  it('should show application services associated with a process node without exposing orchestration internals', async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'processWorkbench';
    runtime.ui['processView'] = 'node';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [{ uid: 'role-customer', name: '客户' }],
      stages: [],
      stageFlowRefs: [],
      processes: [
        {
          uid: 'process-inbound',
          name: '入库预约流程',
          nodes: [
            { uid: 'node-submit', name: '客户提交入库预约', roleIds: ['role-customer'], userSteps: [], forms: [], entity_ops: [], orchestrationTasks: [], businessRules: [] },
          ],
        },
      ],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [
        {
          uid: 'task-save',
          name: '保存入库预约',
          parameters: {
            inputs: [{ name: 'warehouseId', type: 'String', required: true }],
            outputs: [{ name: 'reservationId', type: 'String' }],
          },
          technicalHandover: {
            runtimeKind: 'DomainServiceJar',
            target: 'InboundReservationService.submit',
          },
        },
      ],
      services: [
        {
          uid: 'service-submit',
          name: '提交入库预约',
          method: 'POST',
          path: '/inbound-reservations/submit',
          desc: '客户提交入库预约时调用。',
          nodeRefs: ['node-submit'],
          requestParams: [{ name: 'warehouseId', type: 'String', required: true }],
          responseParams: [{ name: 'reservationId', type: 'String' }],
          orchestration: {
            variables: [],
            steps: [
              {
                uid: 'step-save',
                taskDefinitionUid: 'task-save',
                stepAlias: 'saveReservation',
                inputMapping: [{ source: 'request.warehouseId', target: 'warehouseId' }],
                outputMapping: [{ source: 'reservationId', target: 'step.saveReservation.reservationId' }],
              },
            ],
            returnMapping: [{ source: 'step.saveReservation.reservationId', target: 'reservationId' }],
          },
        },
      ],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="tab-processWorkbench"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="process-switch-node"]')?.click();
    fixture.detectChanges();

    const section = compiled.querySelector('[data-testid="process-application-service-section"]');
    expect(section).toBeTruthy();
    expect(section?.textContent).toContain('提交入库预约');
    expect(section?.textContent).toContain('POST');
    expect(section?.textContent).toContain('/inbound-reservations/submit');
    expect(section?.textContent).toContain('客户提交入库预约时调用。');
    expect(section?.textContent).not.toContain('request.warehouseId');
    expect(section?.textContent).not.toContain('InboundReservationService.submit');
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

    const fixture = TestBed.createComponent(ShellComponent);
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

    const backButton = compiled.querySelector<HTMLButtonElement>('[data-testid="nav-back-button"]');
    expect(backButton?.disabled).toBe(false);
    expect(backButton?.getAttribute('title')).toContain('全景');
    backButton?.click();
    fixture.detectChanges();

    expect(runtime.ui['mainTab']).toBe('panoramaWorkbench');
    expect(locationSpy).toHaveBeenCalledWith('/panorama');
    expect(compiled.querySelector('[data-testid="panorama-subtabs"]')).toBeTruthy();
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

    const fixture = TestBed.createComponent(ShellComponent);
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

    const fixture = TestBed.createComponent(ShellComponent);
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
    const expandedFixture = TestBed.createComponent(ShellComponent);
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
    const fixture = TestBed.createComponent(ShellComponent);
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
    const fixture = TestBed.createComponent(ShellComponent);
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

    const fixture = TestBed.createComponent(ShellComponent);
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

    const fixture = TestBed.createComponent(ShellComponent);
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

    const fixture = TestBed.createComponent(ShellComponent);
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
    expect(compiled.querySelector('[data-testid="current-version-badge"]')?.textContent).toContain('验收版');
  });

  it('should show a wait dialog while loading history versions', async () => {
    let resolveHistory: (value: Response) => void = () => undefined;
    const historyPromise = new Promise<Response>((resolve) => {
      resolveHistory = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/history/agent.json')) return historyPromise;
      if (url.includes('/api/versions/agent.json')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/collab/submits/list')) {
        return new Response(JSON.stringify({ submits: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/files/meta')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.doc = { meta: { domain: 'Agent' }, roles: [], stages: [], stageFlowRefs: [], processes: [], entities: [], businessComponents: [], taskDefinitions: [], terms: [], rules: [] };
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/panorama');

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      openHistory: () => Promise<void>;
      waitDialog: () => { title: string; description: string } | null;
    };

    const openHistoryPromise = component.openHistory();
    fixture.detectChanges();

    expect(component.waitDialog()?.title).toContain('历史');

    resolveHistory(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await openHistoryPromise;
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.waitDialog()).toBeNull();
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

    const fixture = TestBed.createComponent(ShellComponent);
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

    const fixture = TestBed.createComponent(ShellComponent);
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

    const fixture = TestBed.createComponent(ShellComponent);
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

    const fixture = TestBed.createComponent(ShellComponent);
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

  it('删除角色后Ctrl+S同步不应复原已删除的角色', async () => {
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
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [
        { uid: 'role-1', id: 'R1', name: '管理员', group: '系统角色' },
        { uid: 'role-2', id: 'R2', name: '临时角色', group: '临时分组' },
      ],
      stages: [], stageFlowRefs: [], processes: [], entities: [],
      businessComponents: [], taskDefinitions: [], terms: [], rules: [],
    };
    runtime.collab.hasRemoteUpdate = false;
    runtime.collab.syncing = false;
    runtime.collab.seq = 0;
    runtime.collab.acceptedSeq = 0;
    runtime.ui['roleWorkbenchMode'] = 'management';

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-roles"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-editor-open"]')?.click();
    fixture.detectChanges();

    expect(runtime.doc.roles.length).toBe(2);

    const chips = compiled.querySelectorAll('[data-testid="role-summary-chip"]');
    let targetButton: HTMLButtonElement | null = null;
    chips.forEach((chip) => {
      if (chip.textContent?.includes('临时角色')) {
        targetButton = (chip.parentElement as HTMLElement)?.querySelector('.role-light-remove');
      }
    });
    expect(targetButton).toBeTruthy();
    targetButton!.click();
    fixture.detectChanges();

    const dialog = compiled.querySelector('[data-testid="runtime-confirm-dialog"]');
    expect(dialog?.textContent).toContain('删除角色');
    compiled.querySelector<HTMLButtonElement>('[data-testid="runtime-confirm-submit"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(runtime.doc.roles.length).toBe(1);
    expect(runtime.doc.roles.some((r: any) => r.name === '临时角色')).toBe(false);
    expect(runtime.modified).toBe(true);

    // 第一轮 Ctrl+S 同步
    const preventDefault = vi.fn();
    (fixture.componentInstance as any).handleShortcut({ key: 's', ctrlKey: true, metaKey: false, preventDefault });
    // 等待异步链完整展开：syncNow → runBusy → syncService.syncNow → serverCompatibleHash → collabSnapshot
    await new Promise((r) => setTimeout(r, 50));
    fixture.detectChanges();

    // 服务端返回 documentHash — 客户端需保存它用于下次同步的 baseDocumentHash
    resolveSnapshot(new Response(JSON.stringify({
      ok: true,
      document: snapshotPayload.document,
      documentHash: 'mock-hash-abc123',
      seq: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(runtime.doc.roles.length).toBe(1);
    expect(runtime.doc.roles.some((r: any) => r.name === '临时角色')).toBe(false);
    expect(runtime.collab.serverDocumentHash).toBe('mock-hash-abc123');
    expect(snapshotPayload?.document?.roles?.length).toBe(1);

    // 第二轮同步：删除最后一个角色
    snapshotPayload = null;
    const snapshotPromise2 = new Promise<Response>((resolve) => {
      resolveSnapshot = resolve;
    });
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/collab/snapshot')) {
        snapshotPayload = JSON.parse(String(init?.body));
        return snapshotPromise2;
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const removeButtons2 = compiled.querySelectorAll<HTMLButtonElement>('.role-light-remove');
    expect(removeButtons2.length).toBeGreaterThanOrEqual(1);
    removeButtons2[0].click();
    fixture.detectChanges();
    const dialog2 = compiled.querySelector('[data-testid="runtime-confirm-dialog"]');
    expect(dialog2?.textContent).toContain('删除角色');
    compiled.querySelector<HTMLButtonElement>('[data-testid="runtime-confirm-submit"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // 第二轮 Ctrl+S
    const preventDefault2 = vi.fn();
    (fixture.componentInstance as any).handleShortcut({ key: 's', ctrlKey: true, metaKey: false, preventDefault: preventDefault2 });
    await new Promise((r) => setTimeout(r, 50));
    fixture.detectChanges();

    expect(snapshotPayload?.baseDocumentHash).toBe('mock-hash-abc123');

    resolveSnapshot(new Response(JSON.stringify({
      ok: true,
      document: snapshotPayload.document,
      documentHash: 'mock-hash-def456',
      seq: 2,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(runtime.collab.serverDocumentHash).toBe('mock-hash-def456');
  });

  it('should copy a locator link for the current process node', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    runtime.ui['mainTab'] = 'processWorkbench';
    runtime.ui['procId'] = 'proc-inbound';
    runtime.ui['taskId'] = 'node-submit';
    runtime.doc = {
      meta: { domain: 'Agent' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [
        {
          uid: 'proc-inbound',
          name: '入库流程',
          nodes: [{ uid: 'node-submit', name: '客户提交', userSteps: [], forms: [], entity_ops: [], orchestrationTasks: [], businessRules: [] }],
        },
      ],
      entities: [],
      businessComponents: [],
      taskDefinitions: [],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-locator-menu-button"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-copy-node-link"]')?.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain('doc=agent.json');
    expect(copied).toContain('tab=process');
    expect(copied).toContain('proc=proc-inbound');
    expect(copied).toContain('task=node-submit');
  });

  it('should open a startup locator and restore process node state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/load/agent.json')) {
        return new Response(JSON.stringify({
          document: {
            meta: { domain: 'Agent' },
            roles: [],
            stages: [],
            stageFlowRefs: [],
            processes: [
              {
                uid: 'proc-inbound',
                name: '入库流程',
                nodes: [{ uid: 'node-submit', name: '客户提交', userSteps: [], forms: [], entity_ops: [], orchestrationTasks: [], businessRules: [] }],
              },
            ],
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
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/process?doc=agent.json&tab=process&proc=proc-inbound&task=node-submit');

    const runtime = getAngularRuntimeState();
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(runtime.currentFile).toBe('agent.json');
    expect(runtime.ui['mainTab']).toBe('processWorkbench');
    expect(runtime.ui['procId']).toBe('proc-inbound');
    expect(runtime.ui['taskId']).toBe('node-submit');
  });
});

