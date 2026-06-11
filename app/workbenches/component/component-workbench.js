'use strict';

window.ComponentWorkbench = {
  render(options = {}) {
    S.ui.tab = 'data';
    if (typeof renderDataTab === 'function') return renderDataTab(options);
  },
};
