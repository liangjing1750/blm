'use strict';

window.ProcessWorkbench = {
  render(options = {}) {
    S.ui.procView = 'stage';
    S.ui.stageViewMode = 'detail';
    if (typeof renderProcessTab === 'function') return renderProcessTab(options);
  },
};
