'use strict';

window.BLMShared = window.BLMShared || {};

window.BLMShared.ui = {
  renderSubTabs(tabs, activeId, onclickName, testPrefix) {
    return `<div class="view-toggle-group" style="margin-bottom:16px" data-testid="${esc(testPrefix || 'workbench-subtab-bar')}">
      ${tabs.map((tab) => `<button class="vtb ${activeId === tab.id ? 'active' : ''}"
        data-testid="${esc(testPrefix || 'workbench-subtab')}-${esc(tab.id)}" onclick="${onclickName}('${esc(jsString(tab.id))}')">${esc(tab.label)}</button>`).join('')}
    </div>`;
  },

  empty(text) {
    return `<p class="no-refs domain-panel-empty">${esc(text || '暂无数据。')}</p>`;
  },
};
