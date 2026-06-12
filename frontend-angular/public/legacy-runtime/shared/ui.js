'use strict';

window.BLMShared = window.BLMShared || {};

window.BLMShared.ui = {
  renderSubTabs(tabs, activeId, onclickName, testPrefix, options = {}) {
    const actionsHtml = options.actionsHtml || '';
    const extraClass = options.className ? ` ${esc(options.className)}` : '';
    return `<div class="workbench-subtab-shell${extraClass}" data-testid="${esc(testPrefix || 'workbench-subtab')}-shell">
      <div class="view-toggle-group" data-testid="${esc(testPrefix || 'workbench-subtab-bar')}">
        ${tabs.map((tab) => `<button class="vtb ${activeId === tab.id ? 'active' : ''}"
          data-testid="${esc(testPrefix || 'workbench-subtab')}-${esc(tab.id)}" onclick="${onclickName}('${esc(jsString(tab.id))}')">${esc(tab.label)}</button>`).join('')}
      </div>
      ${actionsHtml ? `<div class="workbench-subtab-actions" data-testid="${esc(testPrefix || 'workbench-subtab')}-actions">${actionsHtml}</div>` : ''}
    </div>`;
  },

  empty(text) {
    return `<p class="no-refs domain-panel-empty">${esc(text || '暂无数据。')}</p>`;
  },
};
