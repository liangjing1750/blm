import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { getAngularRuntimeState, markAngularRuntimeModified } from '../../core/runtime/angular-runtime';

interface LegacyTerm {
  uid?: string;
  id?: string;
  name?: string;
  term?: string;
  desc?: string;
  definition?: string;
}

interface LegacyRule {
  uid?: string;
  id?: string;
  name?: string;
  desc?: string;
  content?: string;
}

interface LegacyNode {
  uid?: string;
  id?: string;
  name?: string;
  businessRules?: LegacyRule[];
  business_rules?: LegacyRule[];
}

interface LegacyProcess {
  uid?: string;
  id?: string;
  name?: string;
  nodes?: LegacyNode[];
  tasks?: LegacyNode[];
}

interface LegacyDocument {
  terms?: LegacyTerm[];
  language?: LegacyTerm[];
  rules?: LegacyRule[];
  processes?: LegacyProcess[];
}

interface LegacyWindow extends Window {
  S?: {
    doc?: LegacyDocument;
  };
  markModified?: () => void;
}

interface TermView {
  id: string;
  name: string;
  description: string;
}

interface RuleView {
  id: string;
  processId: string;
  processName: string;
  nodeName: string;
  name: string;
  content: string;
}

interface FunctionView {
  id: string;
  name: string;
  description: string;
  ruleCount: number;
  nodeCount: number;
}

@Component({
  selector: 'app-knowledge-workbench',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './knowledge-workbench.html',
  styleUrl: './knowledge-workbench.scss',
})
export class KnowledgeWorkbenchComponent implements OnChanges, OnInit, OnDestroy {

  private readonly sanitizer = inject(DomSanitizer);

  // 远端同步后通过 blm-workbench-refresh 事件刷新视图
  private readonly onRefresh = () => {
    this.version.update((v) => v + 1);
  };

  ngOnInit(): void {
    window.addEventListener('blm-workbench-refresh', this.onRefresh);
  }

  ngOnDestroy(): void {
    window.removeEventListener('blm-workbench-refresh', this.onRefresh);
  }
  // 模块意图：规则 tab 按功能（流程）分组展示，支持全局搜索和折叠，富文本内容保留 HTML 排版。
  protected readonly activeTab = signal<'termManagement' | 'dictionaryManagement' | 'rules'>('termManagement');
  protected readonly ruleKeyword = signal('');
  protected readonly termsCollapsed = signal(false);
  protected readonly rulesCollapsed = signal(false);
  protected readonly collapsedGroups = signal<Set<string>>(new Set());
  protected readonly version = signal(0);
  @Input() initialTab: 'termManagement' | 'dictionaryManagement' | 'rules' = 'termManagement';
  @Input() editing = true;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialTab']) this.setTabFromShell(this.initialTab);
  }

  setTabFromShell(tabId: string): void {
    if (tabId === 'rules') this.activeTab.set('rules');
    else if (tabId === 'dictionaryManagement') this.activeTab.set('dictionaryManagement');
    else this.activeTab.set('termManagement');
  }

  protected terms(): TermView[] {
    this.version();
    return this.termSources().map((term, index) => ({
      id: String(term.uid || term.id || term.name || term.term || `term-${index + 1}`),
      name: String(term.name || term.term || `术语${index + 1}`).trim(),
      description: String(term.desc || term.definition || '').trim(),
    }));
  }

  protected rules(): RuleView[] {
    this.version();
    const rows: RuleView[] = [];
    for (const process of this.document().processes || []) {
      for (const node of this.processNodes(process)) {
        const rules = node.businessRules || node.business_rules || [];
        rules.forEach((rule, index) => {
          rows.push({
            id: String(rule.uid || rule.id || `${process.uid || process.id || process.name}-${node.uid || node.id || node.name}-${index}`),
            processId: this.processIdentity(process),
            processName: String(process.name || '未命名流程').trim(),
            nodeName: String(node.name || '未命名节点').trim(),
            name: String(rule.name || `规则${index + 1}`).trim(),
            content: String(rule.content || rule.desc || '').trim(),
          });
        });
      }
    }
    return rows;
  }

  protected functions(): FunctionView[] {
    this.version();
    return (this.document().processes || []).map((process, index) => {
      const nodes = this.processNodes(process);
      const ruleCount = nodes.reduce((sum, node) => sum + (node.businessRules || node.business_rules || []).length, 0);
      return {
        id: this.processIdentity(process) || `process-${index + 1}`,
        name: String(process.name || `未命名功能${index + 1}`).trim(),
        description: String((process as LegacyProcess & { trigger?: string; outcome?: string }).outcome || (process as LegacyProcess & { trigger?: string }).trigger || '').trim(),
        ruleCount,
        nodeCount: nodes.length,
      };
    });
  }

  // 按功能分组的规则视图，未匹配搜索的功能组返回空 rules 数组
  protected ruleGroups(): Array<{ processId: string; processName: string; nodeCount: number; rules: RuleView[] }> {
    const keyword = this.ruleKeyword().trim().toLowerCase();
    const allRules = this.rules();
    const groups = new Map<string, { processId: string; processName: string; nodeCount: number; rules: RuleView[] }>();

    for (const rule of allRules) {
      if (keyword && ![rule.processName, rule.nodeName, rule.name, rule.content]
        .some((v) => v.toLowerCase().includes(keyword))) continue;

      if (!groups.has(rule.processId)) {
        const nodes = new Set<string>();
        for (const r of allRules.filter((r) => r.processId === rule.processId)) {
          nodes.add(r.nodeName);
        }
        groups.set(rule.processId, {
          processId: rule.processId,
          processName: rule.processName,
          nodeCount: nodes.size,
          rules: [],
        });
      }
      groups.get(rule.processId)!.rules.push(rule);
    }
    return Array.from(groups.values());
  }

  protected toggleGroup(processId: string): void {
    this.collapsedGroups.update((set) => {
      const next = new Set(set);
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });
  }

  protected isGroupCollapsed(processId: string): boolean {
    return this.collapsedGroups().has(processId);
  }

  // 富文本渲染：保留加粗/列表/换行等基本 HTML，过滤危险标签
  protected trustedHtml(content: string): SafeHtml {
    if (!content?.trim()) return '';
    // 反转义 → 过滤危险标签 → 净化
    const decoded = content
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ');
    // 移除 script/style/iframe/on* 事件
    const safe = decoded
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
    return this.sanitizer.bypassSecurityTrustHtml(safe);
  }

  protected setRuleKeyword(value: string): void {
    this.ruleKeyword.set(value);
  }

  protected addTerm(): void {
    if (!this.editing) return;
    const target = this.ensureTermSource();
    const nextIndex = target.length + 1;
    if (Array.isArray(this.document().terms)) {
      target.push({ uid: `term-${Date.now()}`, name: `新术语${nextIndex}`, desc: '' });
    } else {
      target.push({ uid: `term-${Date.now()}`, term: `新术语${nextIndex}`, definition: '' });
    }
    this.markChanged();
  }

  protected addTermAfter(index: number): void {
    if (!this.editing) return;
    const target = this.ensureTermSource();
    const insertIndex = Math.min(Math.max(index + 1, 0), target.length);
    const nextIndex = target.length + 1;
    if (Array.isArray(this.document().terms) && target === this.document().terms) {
      target.splice(insertIndex, 0, { uid: `term-${Date.now()}`, name: `新术语${nextIndex}`, desc: '' });
    } else {
      target.splice(insertIndex, 0, { uid: `term-${Date.now()}`, term: `新术语${nextIndex}`, definition: '' });
    }
    this.markChanged();
  }

  protected updateTerm(index: number, key: 'name' | 'description', value: string): void {
    if (!this.editing) return;
    const target = this.ensureTermSource();
    const term = target[index];
    if (!term) return;
    if (key === 'name') {
      if ('term' in term && !('name' in term)) term.term = value;
      else term.name = value;
    } else if ('definition' in term && !('desc' in term)) {
      term.definition = value;
    } else {
      term.desc = value;
    }
    this.markChanged();
  }

  protected removeTerm(index: number): void {
    if (!this.editing) return;
    const target = this.ensureTermSource();
    if (index < 0 || index >= target.length) return;
    target.splice(index, 1);
    this.markChanged();
  }

  protected moveTerm(index: number, direction: -1 | 1): void {
    if (!this.editing) return;
    const target = this.ensureTermSource();
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || index >= target.length || nextIndex >= target.length) return;
    [target[index], target[nextIndex]] = [target[nextIndex], target[index]];
    this.markChanged();
  }

  protected toggleTermsCollapsed(): void {
    this.termsCollapsed.update((value) => !value);
  }

  protected toggleRulesCollapsed(): void {
    this.rulesCollapsed.update((value) => !value);
  }

  protected topLevelRules(): LegacyRule[] {
    return this.document().rules || [];
  }

  private termSources(): LegacyTerm[] {
    const doc = this.document();
    const terms = Array.isArray(doc.terms) ? doc.terms : [];
    const language = Array.isArray(doc.language) ? doc.language : [];
    const hasUsefulTerms = terms.some((term) => String(term.name || term.term || term.desc || term.definition || '').trim());
    return hasUsefulTerms || !language.length ? terms : language;
  }

  private ensureTermSource(): LegacyTerm[] {
    const doc = this.document();
    const language = Array.isArray(doc.language) ? doc.language : [];
    const terms = Array.isArray(doc.terms) ? doc.terms : [];
    const hasUsefulTerms = terms.some((term) => String(term.name || term.term || term.desc || term.definition || '').trim());
    if (hasUsefulTerms || !language.length) {
      if (!Array.isArray(doc.terms)) doc.terms = [];
      return doc.terms;
    }
    if (!Array.isArray(doc.language)) doc.language = [];
    return doc.language;
  }

  private processNodes(process: LegacyProcess): LegacyNode[] {
    return process.nodes || process.tasks || [];
  }

  private processIdentity(process: LegacyProcess): string {
    return String(process.uid || process.id || process.name || '').trim();
  }

  private document(): LegacyDocument {
    return getAngularRuntimeState().doc || {};
  }

  private markChanged(): void {
    this.version.update((value) => value + 1);
    markAngularRuntimeModified();
  }
}
