'use strict';

window.ComponentWorkbench = {
  switchTab(tabId) {
    S.ui.componentTab = tabId || 'entities';
    this.render();
  },

  render() {
    const tabs = [
      { id: 'entities', label: '实体设计' },
      { id: 'tasks', label: '任务定义' },
      { id: 'constructs', label: '构件管理' },
      { id: 'handoff', label: '待承接' },
    ];
    const activeTab = S.ui.componentTab || 'entities';
    const html = `<div class="domain-scroll component-demo-scroll" data-testid="domain-scroll">
      ${BLMShared.ui.renderSubTabs(tabs, activeTab, 'switchComponentTab', 'component-subtab')}
      ${this.renderTab(activeTab)}
    </div>`;
    BLMCore.dom.setHtml('tab-content', html);
  },

  renderTab(tabId) {
    if (tabId === 'tasks') return this.renderTasks();
    if (tabId === 'constructs') return this.renderConstructs();
    if (tabId === 'handoff') return this.renderHandoff();
    return this.renderEntities();
  },

  renderEntities() {
    const entities = S.doc.entities || [];
    return `<div class="ctx-card domain-panel demo-panel">
      <div class="demo-panel-head">
        <div><h3>实体设计</h3><p class="field-hint">后端研发在概念实体基础上补充逻辑实体字段、状态和关系。</p></div>
        <span class="demo-count">${entities.length} 个逻辑实体</span>
      </div>
      ${this.renderSimpleTable(['实体', '字段数', '状态字段', '归属构件'], entities.slice(0, 8).map((entity) => [
        entity.name || entity.id || '未命名实体',
        String((entity.fields || []).length),
        (entity.fields || []).find((field) => Array.isArray(field.states) && field.states.length)?.name || '-',
        entity.constructName || entity.businessConstructName || entity.businessConstructUid || '-',
      ]), '暂无实体。')}
    </div>`;
  },

  renderTasks() {
    const tasks = S.doc.taskDefinitions || [];
    return `<div class="ctx-card domain-panel demo-panel">
      <div class="demo-panel-head">
        <div><h3>任务定义</h3><p class="field-hint">任务定义表达构件可提供的业务动作，接口编排只引用任务，不在这里写页面逻辑。</p></div>
        <span class="demo-count">${tasks.length} 个任务</span>
      </div>
      ${this.renderSimpleTable(['任务', '类型', '地址/目标', '归属构件'], tasks.slice(0, 8).map((task) => [
        task.name || task.id || '未命名任务',
        task.type || '-',
        task.target || task.address || '-',
        task.constructName || task.constructUid || '-',
      ]), '暂无任务定义。')}
    </div>`;
  },

  renderConstructs() {
    const constructs = typeof getBusinessConstructItems === 'function' ? getBusinessConstructItems(S.doc) : (S.doc.businessConstructs || []);
    return `<div class="ctx-card domain-panel demo-panel">
      <div class="demo-panel-head">
        <div><h3>构件管理</h3><p class="field-hint">业务构件是多个逻辑实体和多个任务的聚合，用于承接业务组件。</p></div>
        <span class="demo-count">${constructs.length} 个构件</span>
      </div>
      <div class="demo-card-grid">
        ${constructs.length ? constructs.slice(0, 9).map((construct) => `
          <div class="demo-mini-card">
            <strong>${esc(construct.name || construct.id || '未命名构件')}</strong>
            <span>${esc(construct.businessComponent || construct.businessComponentName || '未归属业务组件')}</span>
            <em>${(construct.entityUids || []).length} 实体 · ${(construct.taskDefinitionUids || []).length} 任务</em>
          </div>`).join('') : BLMShared.ui.empty('暂无业务构件。')}
      </div>
    </div>`;
  },

  renderHandoff() {
    const stages = typeof getStageItems === 'function' ? getStageItems(S.doc) : [];
    const constructs = typeof getBusinessConstructItems === 'function' ? getBusinessConstructItems(S.doc) : (S.doc.businessConstructs || []);
    return `<div class="ctx-card domain-panel demo-panel">
      <div class="demo-panel-head">
        <div><h3>待承接</h3><p class="field-hint">这里先做弱关联提示：让开发者看到流程侧有哪些阶段和流程需要构件承接，不强制建立模型关系。</p></div>
        <span class="demo-count">${stages.length} 个阶段 · ${constructs.length} 个构件</span>
      </div>
      <div class="demo-handoff">
        <div><h4>流程侧来源</h4>${stages.slice(0, 8).map((stage) => `<span>${esc(stage.name || stage.id || '未命名阶段')}</span>`).join('') || '<p class="field-hint">暂无阶段。</p>'}</div>
        <div><h4>构件侧承接</h4>${constructs.slice(0, 8).map((construct) => `<span>${esc(construct.name || construct.id || '未命名构件')}</span>`).join('') || '<p class="field-hint">暂无构件。</p>'}</div>
      </div>
    </div>`;
  },

  renderSimpleTable(headers, rows, emptyText) {
    if (!rows.length) return BLMShared.ui.empty(emptyText);
    return `<table class="term-table demo-table"><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
  },
};

function switchComponentTab(tabId) {
  return window.ComponentWorkbench.switchTab(tabId);
}
