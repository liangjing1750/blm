import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { WORKBENCH_MIGRATION_STATUS } from './core/migration/workbench-migration-status';
import { getAngularRuntimeState } from './core/runtime/angular-runtime';
import { LegacyShellComponent } from './legacy-shell/legacy-shell.component';

describe('App', () => {
  beforeEach(async () => {
    const runtime = getAngularRuntimeState();
    runtime.currentFile = '';
    runtime.modified = false;
    runtime.ui['mainTab'] = 'panoramaWorkbench';

    await TestBed.configureTestingModule({
      imports: [App, LegacyShellComponent],
      providers: [provideRouter([])],
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
      taskDefinitions: [],
      terms: [],
      rules: [],
    };

    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="panorama-subtab-overview"]')?.textContent).toContain('全景视图');
    expect(compiled.querySelector('[data-testid="panorama-subtab-valueDomain"]')?.textContent).toContain('价值与业务域');
    expect(compiled.querySelector('[data-testid="panorama-subtab-components"]')?.textContent).toContain('业务组件');

    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-valueDomain"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="panorama-value-domain-panel"]')?.textContent).toContain('准备');

    compiled.querySelector<HTMLButtonElement>('[data-testid="panorama-subtab-components"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="panorama-components-panel"]')?.textContent).toContain('仓单组件');
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

  it('should edit the five document properties from the file menu', async () => {
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
    expect(runtime.modified).toBe(true);
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

    compiled.querySelector<HTMLButtonElement>('[data-testid="toolbar-delete-button"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchSpy).toHaveBeenCalledWith('/api/copy', expect.objectContaining({ method: 'POST' }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/version/create', expect.objectContaining({ method: 'POST' }));
    expect(fetchSpy).toHaveBeenCalledWith('/api/delete/agent-copy.json', expect.objectContaining({ method: 'POST' }));
    expect(runtime.currentFile).toBe('');
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

