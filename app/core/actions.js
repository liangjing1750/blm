'use strict';

window.BLMCore = window.BLMCore || {};

window.AppActions = {
  render() {
    if (typeof render === 'function') render();
  },

  renderCurrentWorkbench(options = {}) {
    const mainTab = typeof normalizeMainTabId === 'function'
      ? normalizeMainTabId(S.ui.mainTab || 'panoramaWorkbench')
      : (S.ui.mainTab || 'panoramaWorkbench');
    if (mainTab === 'panoramaWorkbench' && window.PanoramaWorkbench) return window.PanoramaWorkbench.render(options);
    if (mainTab === 'processWorkbench' && window.ProcessWorkbench) return window.ProcessWorkbench.render(options);
    if (mainTab === 'constructWorkbench' && window.ComponentWorkbench) return window.ComponentWorkbench.render(options);
    if (mainTab === 'orchestrationWorkbench' && window.OrchestrationWorkbench) return window.OrchestrationWorkbench.render(options);
    if (mainTab === 'preview' && typeof renderPreviewTab === 'function') return renderPreviewTab(options);
    if (typeof renderDomainTab === 'function') return renderDomainTab(options);
  },

  openStage(stageId) {
    if (typeof openStageDetail === 'function') return openStageDetail(stageId);
  },

  openCapability(capabilityId) {
    if (typeof openBusinessModelDialog === 'function') return openBusinessModelDialog('capability', capabilityId);
  },

  openEntity(entityId) {
    S.ui.mainTab = 'constructWorkbench';
    S.ui.tab = 'data';
    S.ui.entityId = entityId;
    if (typeof render === 'function') render();
  },
};
