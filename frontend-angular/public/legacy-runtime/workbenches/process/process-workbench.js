'use strict';

window.ProcessWorkbench = {
  render(options = {}) {
    S.ui.procView = S.ui.procView || 'stage';
    if (S.ui.procView === 'stage' && (S.ui.stageViewMode || 'panorama') === 'panorama') {
      S.ui.stageViewMode = 'detail';
    }
    if (typeof renderProcessTab === 'function') return renderProcessTab(options);
  },
};
