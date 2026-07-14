import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAngularRuntimeState } from '../../core/runtime/angular-runtime';
import { KnowledgeWorkbenchComponent } from './knowledge-workbench';

describe('KnowledgeWorkbenchComponent', () => {
  let fixture: ComponentFixture<KnowledgeWorkbenchComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    const runtime = getAngularRuntimeState();
    runtime.modified = false;
    runtime.currentFile = 'knowledge-rules-test.json';
    runtime.doc = {
      meta: { domain: 'Knowledge Rules Test' },
      processes: [{
        uid: 'process-1',
        name: '入库流程',
        nodes: [{
          uid: 'node-1',
          name: '提交申请',
          businessRules: [{
            uid: 'rule-1',
            name: '校验规则',
            content: '<div><strong>必须校验</strong></div><ul><li>仓库编码</li></ul>',
          }],
        }],
      }],
      stages: [],
      stageFlowRefs: [],
      terms: [],
      dataDictionaries: [{
        uid: 'dict-status',
        code: 'status',
        name: '状态',
        desc: '状态码表',
        entries: [{ uid: 'dict-status-enabled', code: 'enabled', name: '启用', desc: '' }],
      }],
      rules: [],
    };

    await TestBed.configureTestingModule({
      imports: [KnowledgeWorkbenchComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(KnowledgeWorkbenchComponent);
    fixture.componentRef.setInput('initialTab', 'rules');
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('renders business rule content through the shared readonly rich text component', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="knowledge-rule-card-summary"]')?.click();
    fixture.detectChanges();

    const richText = host.querySelector<HTMLElement>('app-rich-text-editor.knowledge-rule-content');
    expect(richText).toBeTruthy();
    expect(richText?.querySelector('[data-testid="knowledge-rule-content-editor"]')?.getAttribute('contenteditable')).toBe('false');
    expect(richText?.querySelector('strong')?.textContent).toContain('必须校验');
    expect(richText?.querySelector('li')?.textContent).toContain('仓库编码');
    expect(host.querySelector<HTMLElement>('.knowledge-rule-content[innerHTML]')).toBeFalsy();
  });

  it('manages reusable data dictionaries as collapsible cards', () => {
    fixture.componentRef.setInput('initialTab', 'dictionaryManagement');
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="knowledge-dictionary-count"]')?.textContent).toContain('1');
    expect(host.querySelector('[data-testid="knowledge-dictionary-card"]')?.textContent).toContain('状态');
    expect(host.querySelector('[data-testid="knowledge-dictionary-card"]')?.textContent).toContain('status');

    host.querySelector<HTMLButtonElement>('[data-testid="knowledge-dictionary-summary"]')?.click();
    fixture.detectChanges();

    const name = host.querySelector<HTMLInputElement>('[data-testid="knowledge-dictionary-name"]')!;
    name.value = '状态字典';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="knowledge-dictionary-entry-add"]')?.click();
    fixture.detectChanges();

    const runtime = getAngularRuntimeState();
    expect(runtime.doc.dataDictionaries[0].name).toBe('状态字典');
    expect(runtime.doc.dataDictionaries[0].entries).toHaveLength(2);
    expect(runtime.modified).toBe(true);
  });

  it('offers a readable delete action for dictionary entries', () => {
    fixture.componentRef.setInput('initialTab', 'dictionaryManagement');
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="knowledge-dictionary-summary"]')?.click();
    fixture.detectChanges();

    const removeButton = host.querySelector<HTMLButtonElement>('[data-testid="knowledge-dictionary-entry-remove"]');
    expect(removeButton?.textContent?.trim()).toBe('×');
    expect(removeButton?.getAttribute('title')).toBe('删除');

    removeButton?.click();
    fixture.detectChanges();

    const runtime = getAngularRuntimeState();
    expect(runtime.doc.dataDictionaries[0].entries).toHaveLength(0);
    expect(runtime.modified).toBe(true);
  });
});
