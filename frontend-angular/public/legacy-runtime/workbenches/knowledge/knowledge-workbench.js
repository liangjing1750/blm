'use strict';

window.KnowledgeWorkbench = {
  render(tabId, selectedDomainId) {
    if (tabId === 'roles') return window.RoleWorkbench ? window.RoleWorkbench.renderManagement(selectedDomainId) : '';
    if (tabId === 'language') return this.renderLanguage(selectedDomainId);
    if (tabId === 'rules') return this.renderRules();
    return '';
  },

  renderLanguage(selectedDomainId) {
    const languageEntries = getLanguageEntriesForDomainInfo(selectedDomainId);
    const langCollapsed = S.ui.sbCollapse.lang === true;
    let languageBody = '';
    if (!langCollapsed) {
      languageBody += `<div class="domain-language-toolbar"><span class="domain-language-hint">建议只保留高频且容易混用的术语，不用追求把所有名词都填满。</span><button class="btn btn-outline btn-sm" onclick="addTerm()">添加术语</button></div>`;
      if (languageEntries.length) {
        languageBody += `<table class="term-table"><thead><tr><th>术语</th><th>定义</th><th></th></tr></thead><tbody>`;
        languageEntries.forEach(({ term, index }) => {
          languageBody += `<tr data-testid="term-row"><td><input type="text" data-testid="term-input" value="${esc(term.term || '')}" oninput="setTerm(${index},'term',this.value)" placeholder="术语"></td><td><input type="text" data-testid="term-definition-input" value="${esc(term.definition || '')}" oninput="setTerm(${index},'definition',this.value)" placeholder="定义"></td><td><div class="term-quick-actions"><button class="stage-quick-btn" type="button" title="在下方新增术语" onclick="addTermAfter(${index})">+</button><button class="stage-quick-btn" type="button" title="上移" onclick="moveTerm(${index},-1)" ${index === 0 ? 'disabled' : ''}>↑</button><button class="stage-quick-btn" type="button" title="下移" onclick="moveTerm(${index},1)" ${index === (S.doc.language || []).length - 1 ? 'disabled' : ''}>↓</button><button class="stage-quick-btn danger" type="button" title="删除术语" onclick="removeTerm(${index})">✕</button></div></td></tr>`;
        });
        languageBody += '</tbody></table>';
      } else {
        languageBody += BLMShared.ui.empty('暂无术语定义。');
      }
    }
    return `<div class="ctx-card domain-panel domain-language-card" data-testid="language-card">
      ${renderDomainPanelHeader('术语表', languageEntries.length ? `${languageEntries.length} 条术语` : '统一命名和口径', `<span class="domain-panel-toggle">${langCollapsed ? '展开' : '折叠'}</span>`, {button:true, onclick:"toggleDomainSection('lang')", dataTestId:'language-toggle', dataPanel:'language', ariaExpanded:!langCollapsed})}
      ${languageBody ? `<div class="domain-panel-body domain-language-body">${languageBody}</div>` : ''}
    </div>
    <div class="ctx-card domain-panel">
      ${renderDomainPanelHeader('字典管理', '字典管理功能正在开发中...')}
      <div class="domain-panel-body">${BLMShared.ui.empty('字典管理功能即将上线。')}</div>
    </div>`;
  },

  renderRules() {
    const allRules = [];
    (S.doc.processes || []).forEach((proc) => {
      (proc.nodes || []).forEach((node) => {
        (node.businessRules || []).forEach((rule) => {
          allRules.push({ procName: proc.name || '?', nodeName: node.name || '?', rule });
        });
      });
    });
    return `<div class="ctx-card domain-panel">
      ${renderDomainPanelHeader('规则条目', allRules.length ? `全量汇总 ${allRules.length} 条业务规则` : '暂无业务规则')}
      <div class="domain-panel-body">
        ${allRules.length ? `<table class="term-table"><thead><tr><th>流程</th><th>节点</th><th>规则名称</th><th>规则内容</th></tr></thead><tbody>
          ${allRules.map(({procName, nodeName, rule}) => `<tr><td>${esc(procName)}</td><td>${esc(nodeName)}</td><td>${esc(rule.name || '')}</td><td>${esc(String(rule.content || '').substring(0, 100))}</td></tr>`).join('')}
        </tbody></table>` : BLMShared.ui.empty('暂无业务规则。')}
      </div>
    </div>`;
  },
};
