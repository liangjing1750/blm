'use strict';

window.OrchestrationWorkbench = {
  switchTab(tabId) {
    S.ui.appArchTab = tabId;
    this.render();
  },

  render() {
    const subTabs = [
      { id: 'prototype', label: '页面原型' },
      { id: 'frontendApi', label: '前端接口需求' },
      { id: 'backendTasks', label: '后端任务链路' },
    ];
    const activeTab = S.ui.appArchTab || 'prototype';
    const html = `<div class="domain-scroll orchestration-demo-scroll" data-testid="domain-scroll">
      ${BLMShared.ui.renderSubTabs(subTabs, activeTab, 'switchAppArchTab', 'orchestration-subtab')}
      ${this.renderTab(activeTab)}
    </div>`;
    BLMCore.dom.setHtml('tab-content', html);
  },

  renderTab(tabId) {
    if (tabId === 'frontendApi') return this.renderFrontendApi();
    if (tabId === 'backendTasks') return this.renderBackendTasks();
    return this.renderPrototype();
  },

  renderPrototype() {
    const processes = S.doc.processes || [];
    return `<div class="ctx-card domain-panel demo-panel orchestration-panel">
      <div class="demo-panel-head">
        <div><h3>页面原型</h3><p class="field-hint">先用页面、用户步骤和原型附件表达界面层。界面不等于表单，表单只描述采集数据。</p></div>
        <span class="demo-count">${processes.length} 个流程可引用</span>
      </div>
      <div class="demo-flow">
        <div class="demo-flow-node strong">页面/原型</div>
        <div class="demo-flow-arrow">→</div>
        <div class="demo-flow-node">用户步骤</div>
        <div class="demo-flow-arrow">→</div>
        <div class="demo-flow-node">按钮/操作</div>
        <div class="demo-flow-arrow">→</div>
        <div class="demo-flow-node">前端接口需求</div>
      </div>
      <div class="demo-card-grid">
        ${processes.slice(0, 6).map((proc) => `<div class="demo-mini-card">
          <strong>${esc(proc.name || proc.id || '未命名流程')}</strong>
          <span>${(proc.nodes || []).length} 个用户步骤</span>
          <em>可挂接页面原型与按钮动作</em>
        </div>`).join('') || BLMShared.ui.empty('暂无流程可引用。')}
      </div>
    </div>`;
  },

  renderFrontendApi() {
    const rows = this.collectApiMocks();
    return `<div class="ctx-card domain-panel demo-panel orchestration-panel">
      <div class="demo-panel-head">
        <div><h3>前端接口需求</h3><p class="field-hint">前端研发从页面动作提出接口需求，描述输入、输出和触发位置。</p></div>
        <span class="demo-count">${rows.length} 条接口需求</span>
      </div>
      ${this.renderSimpleTable(['页面/动作', '接口需求', '输入', '返回'], rows, '暂无接口需求。')}
    </div>`;
  },

  renderBackendTasks() {
    const orchestrationItems = [];
    (S.doc.processes || []).forEach((proc) => {
      (proc.nodes || []).forEach((node) => {
        (node.orchestrationTasks || []).forEach((task, index) => {
          orchestrationItems.push([
            proc.name || '',
            node.name || '',
            task.name || task.taskDefinitionName || '',
            task.type || task.target || '',
            String(index + 1),
          ]);
        });
      });
    });
    return `<div class="ctx-card domain-panel demo-panel orchestration-panel">
      <div class="demo-panel-head">
        <div><h3>后端任务链路</h3><p class="field-hint">技术经理把一个前端接口需求编排到一组后端构件任务，流程仍然保持业务视角。</p></div>
        <span class="demo-count">${orchestrationItems.length} 个任务引用</span>
      </div>
      <div class="demo-flow">
        <div class="demo-flow-node strong">前端接口</div>
        <div class="demo-flow-arrow">→</div>
        <div class="demo-flow-node">构件任务 A</div>
        <div class="demo-flow-arrow">→</div>
        <div class="demo-flow-node">构件任务 B</div>
        <div class="demo-flow-arrow">→</div>
        <div class="demo-flow-node">统一返回</div>
      </div>
      ${this.renderSimpleTable(['流程', '用户步骤', '后端任务', '类型/目标', '顺序'], orchestrationItems, '暂无后端任务链路。')}
    </div>`;
  },

  collectApiMocks() {
    const rows = [];
    (S.doc.processes || []).slice(0, 5).forEach((proc) => {
      (proc.nodes || []).slice(0, 2).forEach((node) => {
        rows.push([
          `${proc.name || '流程'} / ${node.name || '用户步骤'}`,
          `提交${node.name || '业务操作'}`,
          '表单数据、当前用户、业务对象ID',
          '处理结果、下一步状态、提示信息',
        ]);
      });
    });
    return rows.length ? rows : [
      ['页面按钮', '提交业务办理', '表单数据、业务对象ID', '处理结果、下一步状态'],
      ['列表查询', '查询待办事项', '筛选条件、分页参数', '待办列表、统计数量'],
      ['详情页', '读取业务详情', '业务对象ID', '基础信息、状态、操作权限'],
    ];
  },

  renderSimpleTable(headers, rows, emptyText) {
    if (!rows.length) return BLMShared.ui.empty(emptyText);
    return `<table class="term-table demo-table"><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
  },
};

function switchAppArchTab(tabId) {
  return window.OrchestrationWorkbench.switchTab(tabId);
}
