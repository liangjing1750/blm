'use strict';

window.ProcessWorkbench = {
  render(options = {}) {
    S.ui.procView = S.ui.procView || 'stage';
    if (typeof renderProcessTab === 'function') return renderProcessTab(options);
  },
};
