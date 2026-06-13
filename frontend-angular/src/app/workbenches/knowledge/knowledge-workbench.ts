import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
export class KnowledgeWorkbenchComponent {
  // 模块意图：术语和规则 tab 先完成 Angular 独立渲染；字典数据模型暂不新增写入能力。
  protected readonly activeTab = signal<'termManagement' | 'dictionaryManagement' | 'rules'>('termManagement');
  protected readonly selectedFunctionId = signal('');
  protected readonly ruleKeyword = signal('');
  protected readonly termsCollapsed = signal(false);
  protected readonly rulesCollapsed = signal(false);
  protected readonly version = signal(0);

  setTabFromShell(tabId: string): void {
    if (tabId === 'rules') this.activeTab.set('rules');
    else if (tabId === 'dictionaryManagement') this.activeTab.set('dictionaryManagement');
    else this.activeTab.set('termManagement');
    if (tabId === 'rules' && !this.selectedFunctionId()) {
      this.selectedFunctionId.set(this.functions()[0]?.id || '');
    }
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

  protected selectedFunction(): FunctionView | null {
    const functions = this.functions();
    return functions.find((item) => item.id === this.selectedFunctionId()) || functions[0] || null;
  }

  protected filteredRules(): RuleView[] {
    const selectedId = this.selectedFunction()?.id || '';
    const keyword = this.ruleKeyword().trim().toLowerCase();
    return this.rules().filter((rule) => {
      const inFunction = !selectedId || rule.processId === selectedId;
      const inKeyword = !keyword || [rule.processName, rule.nodeName, rule.name, rule.content]
        .some((value) => value.toLowerCase().includes(keyword));
      return inFunction && inKeyword;
    });
  }

  protected selectFunction(functionId: string): void {
    this.selectedFunctionId.set(functionId);
  }

  protected setRuleKeyword(value: string): void {
    this.ruleKeyword.set(value);
  }

  protected addTerm(): void {
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
    const target = this.ensureTermSource();
    if (index < 0 || index >= target.length) return;
    target.splice(index, 1);
    this.markChanged();
  }

  protected moveTerm(index: number, direction: -1 | 1): void {
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
    return (window as LegacyWindow).S?.doc || {};
  }

  private markChanged(): void {
    this.version.update((value) => value + 1);
    (window as LegacyWindow).markModified?.();
  }
}
