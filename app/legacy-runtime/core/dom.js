'use strict';

window.BLMCore = window.BLMCore || {};

window.BLMCore.dom = {
  setHtml(id, html) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = html;
  },

  restoreScroll(selector, scrollTop) {
    if (!Number.isFinite(scrollTop)) return;
    requestAnimationFrame(() => {
      const scroller = document.querySelector(selector);
      if (!scroller) return;
      const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.min(scrollTop, maxScrollTop);
    });
  },
};
