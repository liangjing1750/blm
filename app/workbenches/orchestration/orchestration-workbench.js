'use strict';

window.OrchestrationWorkbench = {
  switchTab(tabId) {
    S.ui.appArchTab = tabId;
    this.render();
  },

  render() {
    const subTabs = [
      { id: 'pageReference', label: '页面与原型引用' },
      { id: 'frontendApi', label: '前端接口需求' },
      { id: 'backendTasks', label: '接口后的后端任务链路' },
    ];
    const activeTab = S.ui.appArchTab || 'pageReference';
    let html = `<div class="domain-scroll" data-testid="domain-scroll">
      ${BLMShared.ui.renderSubTabs(subTabs, activeTab, 'switchAppArchTab', 'orchestration-subtab')}
      <div class="ctx-card domain-panel"><h3>应用编排台</h3>
        <p class="field-hint">应用编排台从页面、原型和用户步骤出发，整理前端接口需求，再说明接口后的后端任务链路。实体设计和任务定义仍由构件工作台维护。</p>
      </div>`;

    const orchestrationItems = [];
    (S.doc.processes || []).forEach((proc) => {
      (proc.nodes || []).forEach((node) => {
        (node.orchestrationTasks || []).forEach((task, index) => {
          orchestrationItems.push({ procName: proc.name || '', nodeName: node.name || '', taskName: task.name || '', taskType: task.type || '', index: index + 1 });
        });
      });
    });

    html += '<div class="ctx-card domain-panel"><h3>页面与原型引用</h3><div class="domain-panel-body"><p class="field-hint">页面层先通过流程原型/附件、页面说明和用户步骤表达，不在第一版新增完整页面模型。</p></div></div>';
    html += '<div class="ctx-card domain-panel"><h3>前端接口需求</h3><div class="domain-panel-body"><p class="field-hint">接口需求应说明页面、用户步骤、按钮或操作、输入数据和期望返回。第一版先作为应用编排台的整理入口。</p></div></div>';
    html += `<div class="ctx-card domain-panel"><h3>接口后的后端任务链路</h3><p class="field-hint">当前先全量汇总所有流程节点中的编排任务，共 ${orchestrationItems.length} 条。后续再把接口需求与构件任务建立更清晰的引用。</p>`;
    if (orchestrationItems.length) {
      html += '<div class="domain-panel-body"><table class="term-table"><thead><tr><th>流程</th><th>节点</th><th>后端任务</th><th>类型</th><th>序号</th></tr></thead><tbody>';
      orchestrationItems.forEach((item) => {
        html += `<tr><td>${esc(item.procName)}</td><td>${esc(item.nodeName)}</td><td>${esc(item.taskName)}</td><td>${esc(item.taskType)}</td><td>${item.index}</td></tr>`;
      });
      html += '</tbody></table></div>';
    } else {
      html += BLMShared.ui.empty('暂无后端任务链路。');
    }
    html += '</div></div>';
    BLMCore.dom.setHtml('tab-content', html);
  },
};

function switchAppArchTab(tabId) {
  return window.OrchestrationWorkbench.switchTab(tabId);
}
