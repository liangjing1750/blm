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
  stages?: Array<{ uid?: string; id?: string; name?: string }>;
  stageFlowRefs?: Array<{ stageUid?: string; stageId?: string; processUid?: string; processId?: string }>;
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
  // 模块意图：规则 tab 按阶段分类→流程卡片→规则列表三层组织，支持全局搜索和富文本。
  protected readonly activeTab = signal<'termManagement' | 'dictionaryManagement' | 'rules'>('termManagement');
  protected readonly ruleKeyword = signal('');
  protected readonly termsCollapsed = signal(false);
  protected readonly rulesCollapsed = signal(false);
  protected readonly expandedGroupId = signal('');
  protected readonly selectedStageId = signal(''); // '' = 全部
  protected readonly stageDropdownOpen = signal(false);
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

  // 阶段 Tab 列表：按流程数降序排列，"全部"默认在首位
  protected stageTabs(): Array<{ id: string; name: string; processCount: number }> {
    const stageMap = new Map<string, { name: string; processes: Set<string> }>();
    const refs = this.document().stageFlowRefs || [];
    const stages = this.document().stages || [];
    const stageIndex = new Map(stages.map((s: any) => [String(s.uid || s.id || ''), String(s.name || '')]));

    for (const ref of refs) {
      const stageId = String(ref.stageUid || ref.stageId || '');
      const processId = String(ref.processUid || ref.processId || '');
      if (!stageId || !processId) continue;
      if (!stageMap.has(stageId)) stageMap.set(stageId, { name: stageIndex.get(stageId) || stageId, processes: new Set() });
      stageMap.get(stageId)!.processes.add(processId);
    }

    // 检测未归入阶段的流程
    const allProcessIds = new Set((this.document().processes || []).map((p: any) => String(p.uid || p.id || '')));
    const stagedIds = new Set<string>();
    for (const [, v] of stageMap) for (const pid of v.processes) stagedIds.add(pid);
    const unstaged = new Set([...allProcessIds].filter((id) => id && !stagedIds.has(id)));

    const tabs = Array.from(stageMap.entries())
      .map(([id, v]) => ({ id, name: v.name || id, processCount: v.processes.size }))
      .sort((a, b) => b.processCount - a.processCount);

    if (unstaged.size > 0) tabs.push({ id: '__unstaged__', name: '未归类', processCount: unstaged.size });

    return tabs;
  }

  // 按阶段筛选 + 关键词过滤后的规则分组（包含无规则流程）
  protected ruleGroups(): Array<{ processId: string; processName: string; nodeCount: number; rules: RuleView[] }> {
    const keyword = this.ruleKeyword().trim().toLowerCase();
    const stageId = this.selectedStageId();
    const allRules = this.rules();

    // 计算阶段→流程映射
    let inScopeIds: Set<string> | null = null;
    if (stageId) {
      const refs = this.document().stageFlowRefs || [];
      if (stageId === '__unstaged__') {
        const stagedIds = new Set(refs.map((r: any) => String(r.processUid || r.processId || '')));
        inScopeIds = new Set((this.document().processes || [])
          .map((p: any) => String(p.uid || p.id || ''))
          .filter((id: string) => id && !stagedIds.has(id)));
      } else {
        inScopeIds = new Set(refs
          .filter((r: any) => String(r.stageUid || r.stageId || '') === stageId)
          .map((r: any) => String(r.processUid || r.processId || '')));
      }
    }

    // 第一步：建立所有流程的节点计数（用于无规则流程也显示卡片）
    const allProcesses = (this.document().processes || []).map((p: any) => ({
      id: String(p.uid || p.id || ''), name: String(p.name || '未命名流程').trim(),
    }));
    const processNodeCounts = new Map<string, number>();
    for (const p of allProcesses) {
      const nodes = (this.document().processes || []).find(
        (proc: any) => String(proc.uid || proc.id || '') === p.id
      );
      processNodeCounts.set(p.id, (nodes?.nodes || nodes?.tasks || []).length);
    }

    // 第二步：按流程分组规则
    const groups = new Map<string, { processId: string; processName: string; nodeCount: number; rules: RuleView[] }>();
    for (const rule of allRules) {
      if (inScopeIds && !inScopeIds.has(rule.processId)) continue;
      if (keyword && ![rule.processName, rule.nodeName, rule.name, rule.content]
        .some((v) => v.toLowerCase().includes(keyword))) continue;

      if (!groups.has(rule.processId)) {
        groups.set(rule.processId, {
          processId: rule.processId, processName: rule.processName,
          nodeCount: processNodeCounts.get(rule.processId) || 0, rules: [],
        });
      }
      groups.get(rule.processId)!.rules.push(rule);
    }

    // 第三步：补全无规则但在范围内的流程
    for (const p of allProcesses) {
      if (!p.id) continue;
      if (inScopeIds && !inScopeIds.has(p.id)) continue;
      if (keyword) continue; // 有搜索关键词时不显示无规则流程
      if (groups.has(p.id)) continue;
      groups.set(p.id, {
        processId: p.id, processName: p.name,
        nodeCount: processNodeCounts.get(p.id) || 0, rules: [],
      });
    }

    // 第四步：按流程名排序
    return Array.from(groups.values()).sort((a, b) => a.processName.localeCompare(b.processName, 'zh-Hans-CN'));
  }

  protected selectStage(stageId: string): void {
    this.selectedStageId.set(stageId);
    this.stageDropdownOpen.set(false);
  }

  protected toggleStageDropdown(): void {
    this.stageDropdownOpen.update((v) => !v);
  }

  protected visibleStageTabs(): Array<{ id: string; name: string; processCount: number }> {
    return this.stageTabs().slice(0, 5);
  }

  protected overflowStageTabs(): Array<{ id: string; name: string; processCount: number }> {
    return this.stageTabs().slice(5);
  }

  protected isStageSelected(stageId: string): boolean {
    return this.selectedStageId() === stageId;
  }

  protected toggleExpand(processId: string): void {
    this.expandedGroupId.set(this.expandedGroupId() === processId ? '' : processId);
  }

  protected isExpanded(processId: string): boolean {
    return this.expandedGroupId() === processId;
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
