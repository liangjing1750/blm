'use strict';

(function bootstrapLegacyRuntimeAfterAngularMount() {
  if (window.__BLM_LEGACY_APP_BOOTSTRAPPED__) return;
  window.__BLM_LEGACY_APP_BOOTSTRAPPED__ = true;

  try {
    window.S = typeof S !== 'undefined' ? S : window.S;
  } catch (_error) {
    // S is a legacy global lexical binding; keep bootstrapping even if it is unavailable.
  }

  window.App = typeof App !== 'undefined' ? App : window.App;
  window.AI = typeof AI !== 'undefined' ? AI : window.AI;

  window.App.init = async function initLegacyAppAfterAngularMount() {
    if (window.__BLM_LEGACY_APP_INIT_DONE__) {
      if (typeof render === 'function') render();
      return;
    }
    window.__BLM_LEGACY_APP_INIT_DONE__ = true;

    if (typeof renderUserAccountButton === 'function') renderUserAccountButton();
    if (typeof refreshSaveDialogText === 'function') refreshSaveDialogText();
    try {
      if (typeof api !== 'undefined' && api?.runtime && typeof S !== 'undefined') {
        const runtime = await api.runtime();
        S.runtime.checked = true;
        S.runtime.apiVersion = Number(runtime?.api_version || 0);
        S.runtime.supportsDocs = !!runtime?.supports_docs;
        S.runtime.supportsCopy = !!runtime?.supports_copy;
        S.runtime.supportsCollab = !!runtime?.supports_collab;
      }
    } catch (_error) {
      if (typeof S !== 'undefined') {
        S.runtime.checked = true;
        S.runtime.supportsCollab = false;
      }
    }
    if (typeof renderCollabStatus === 'function') renderCollabStatus();
    if (typeof hasConfiguredCollabUser === 'function' && !hasConfiguredCollabUser()) {
      if (typeof render === 'function') render();
      setTimeout(() => {
        if (typeof openUserAccountModal === 'function') openUserAccountModal();
      }, 80);
      return;
    }
    if (typeof openStartupLocatorIfPresent === 'function' && await openStartupLocatorIfPresent()) return;
    if (typeof render === 'function') render();
  };

  void window.App.init();
})();
