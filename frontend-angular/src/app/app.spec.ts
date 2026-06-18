import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
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

