'use strict';

/* ═══════════════════════════════════════════════════════════
   ZOOM
   原理：读取 SVG viewBox 得到自然尺寸，通过修改 width/height 属性缩放。
   Mermaid 会给 SVG 加 style="max-width:...;height:auto"，必须先清除。
═══════════════════════════════════════════════════════════ */
const ZOOM = {};


function _captureSvgSize(svg) {
  /* 去掉 Mermaid 的 max-width 约束，记录 SVG 自然尺寸 */
  svg.style.maxWidth = 'none';
  const vb = svg.getAttribute('viewBox');
  if(vb) {
    const p = vb.trim().split(/\s+/).map(Number);
    svg._zW = p[2] || 600;
    svg._zH = p[3] || 200;
  } else {
    svg._zW = parseFloat(svg.getAttribute('width'))  || 600;
    svg._zH = parseFloat(svg.getAttribute('height')) || 200;
  }
}

function applyZoom(id) {
  const el = document.getElementById(id);
  if(!el) return;
  const s = ZOOM[id]||1;
  /* Entity Flow HTML diagram（绝对定位画板 + SVG overlay） */
  const efBoard = el.querySelector('.ef-board');
  if(efBoard) {
    /* 用 transform:scale 同时缩放 board 和 SVG，保持节点与线对齐 */
    const tfm = s === 1 ? '' : `scale(${s})`;
    efBoard.style.transformOrigin = '0 0';
    efBoard.style.transform = tfm;
    const efSvg = el.querySelector('.ef-svg');
    if(efSvg) { efSvg.style.transformOrigin = '0 0'; efSvg.style.transform = tfm; }
    const relations = S.doc?.relations||[];
    requestAnimationFrame(() => drawEfLines(id, relations));
    return;
  }
  /* 自定义 HTML 流程图（pf-wrap / ptf-wrap / ps-wrap），优先整体缩放容器，避免命中内部回退线 SVG */
  const wrap = el.querySelector('.pf-wrap, .ptf-wrap, .ps-wrap');
  if(wrap) {
    wrap.style.zoom = String(s);
    return;
  }
  /* Mermaid SVG（实体关系图等）— only when no ef-canvas present */
  const svg = el.querySelector('svg');
  if(svg && !el.querySelector('.ef-canvas')) {
    if(!svg._zW) _captureSvgSize(svg);
    svg.setAttribute('width',  Math.round(svg._zW * s));
    svg.setAttribute('height', Math.round(svg._zH * s));
    return;
  }
}

function zoomBy(id, delta) {
  ZOOM[id] = Math.max(0.3, Math.min(4, (ZOOM[id]||1) + delta));
  applyZoom(id);
}
function resetZoom(id) { ZOOM[id] = 1; applyZoom(id); }

function initZoom(id) {
  const el  = document.getElementById(id);
  if(!el) return;
  const wrap = el.querySelector('.pf-wrap, .ptf-wrap, .ps-wrap');
  /* 每次渲染后刷新 SVG 自然尺寸（SVG DOM 已替换；跳过 ef-canvas overlay SVG） */
  const svg = el.querySelector('svg');
  if(svg && !wrap && !el.querySelector('.ef-canvas')) _captureSvgSize(svg);
  /* 只绑定一次 wheel 监听（el 不变时复用） */
  if(el._zoomBound) return;
  el._zoomBound = true;
  el.addEventListener('wheel', e => {
    if(!e.ctrlKey) return;
    e.preventDefault();
    zoomBy(id, e.deltaY < 0 ? 0.15 : -0.15);
  }, {passive: false});
}


async function renderDiagram(containerId, code, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = '';
  if(!code) {
    el.innerHTML = `<div class="diag-empty">暂无内容</div>`;
    return;
  }
  if(!window.mermaidLib) {
    el.innerHTML = `<div class="diag-empty">图表需联网加载 Mermaid CDN</div>`;
    return;
  }
  try {
    const {svg} = await window.mermaidLib.render('d'+Date.now(), code);
    el.innerHTML = svg;
    initZoom(containerId);   /* 先捕获 SVG 自然尺寸，绑定滚轮 */
    if(ZOOM[containerId] && ZOOM[containerId]!==1) applyZoom(containerId); /* 再恢复缩放 */
    if(onClickMap) {
      for(const [nodeId, handler] of Object.entries(onClickMap)) {
        // Mermaid v10 generates g elements with id like "flowchart-T1-N"
        const nodes = el.querySelectorAll(`[id*="flowchart-${nodeId}-"],[id="${nodeId}"]`);
        nodes.forEach(n => {
          n.style.cursor='pointer';
          n.addEventListener('click', handler);
        });
      }
    }
  } catch(e) {
    el.innerHTML = `<div class="diag-empty" style="color:var(--danger)">图表渲染错误</div>`;
  }
}

function navigate(tab, opts, navOptions = {}) {
  if (tab === 'preview') {
    void navigatePreviewTab(opts, navOptions);
    return;
  }
  queueUiNavigationHistoryFor((next) => {
    next.tab = tab;
    if (opts) {
      if ('procId' in opts) next.procId = opts.procId;
      if ('taskId' in opts) next.taskId = opts.taskId;
      if ('entityId' in opts) next.entityId = opts.entityId;
    }
    if (tab === 'process' && opts && ('procId' in opts || 'taskId' in opts)) {
      next.procView = opts.taskId ? 'list' : 'flow';
    }
    return next;
  }, navOptions);
  S.ui.tab = tab;
  if(opts) {
    if('procId'   in opts) S.ui.procId   = opts.procId;
    if('taskId'   in opts) S.ui.taskId   = opts.taskId;
    if('entityId' in opts) S.ui.entityId = opts.entityId;
  }
  if(tab === 'process' && opts && ('procId' in opts || 'taskId' in opts)) {
    S.ui.procView = opts.taskId ? 'list' : 'flow';
  }
  render();
}

async function navigatePreviewTab(opts = {}, navOptions = {}) {
  if (S.isPreviewRendering) return;
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'preview';
    return next;
  }, navOptions);
  S.ui.tab = 'preview';
  if (opts) {
    if('procId'   in opts) S.ui.procId   = opts.procId;
    if('taskId'   in opts) S.ui.taskId   = opts.taskId;
    if('entityId' in opts) S.ui.entityId = opts.entityId;
  }
  S.isPreviewRendering = true;
  renderToolbar();
  renderTabBar();
  if (S.doc) renderSidebar();
  document.getElementById('tab-content').innerHTML = '<div class="preview-loading-placeholder">正在生成预览...</div>';
  if (typeof setSaveProgress === 'function') {
    setSaveProgress(true, 18, '正在生成预览...', '正在整理大纲、流程视图和数据模型。');
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    if (S.ui.tab === 'preview' && S.doc) {
      if (typeof setSaveProgress === 'function') {
        setSaveProgress(true, 72, '正在渲染预览...', '正在绘制流程图和数据图。');
      }
      renderPreviewTab();
      setTimeout(initAutoResize, 0);
    } else {
      render();
    }
  } finally {
    S.isPreviewRendering = false;
    if (typeof setSaveProgress === 'function') setSaveProgress(false);
    if (typeof syncSavingControls === 'function') syncSavingControls();
    renderTabBar();
  }
}

function toggleCollapse(key) {
  const defaultCollapsed = String(key || '').startsWith('construct-');
  const current = Object.prototype.hasOwnProperty.call(S.ui.sbCollapse, key)
    ? !!S.ui.sbCollapse[key]
    : defaultCollapsed;
  S.ui.sbCollapse[key] = !current;
  renderSidebar();
}

function openStageFromSidebar(stageId, collapseKey) {
  S.ui.sbCollapse[collapseKey] = !S.ui.sbCollapse[collapseKey];
  navigateStageView(stageId, 'detail');
}

/* 业务域 Tab 内的卡片折叠（不影响侧边栏） */
function toggleDomainSection(key) {
  S.ui.sbCollapse[key] = !S.ui.sbCollapse[key];
  const domainScroll = document.querySelector('.domain-scroll');
  renderDomainTab({ scrollTop: domainScroll ? domainScroll.scrollTop : 0 });
}

function toggleSidebar() {
  S.ui.sidebarCollapsed = !S.ui.sidebarCollapsed;
  renderSidebar();
}

function startSidebarResize(e) {
  if(S.ui.sidebarCollapsed) return;
  e.preventDefault();
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  const startX = e.clientX;
  const startW = sidebar.offsetWidth;
  sidebar.classList.add('sb-resizing');

  function onMove(ev) {
    const nextWidth = Math.max(220, Math.min(460, startW + (ev.clientX - startX)));
    sidebar.style.width = `${nextWidth}px`;
    sidebar.style.minWidth = `${nextWidth}px`;
    setSidebarWidth(nextWidth);
  }

  function onUp() {
    sidebar.classList.remove('sb-resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
function openProcessHome(navOptions = {}) {
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'process';
    next.procView = 'stage';
    next.stageViewMode = 'panorama';
    next.taskId = null;
    if (!next.procId && S.doc?.processes?.length) {
      next.procId = S.doc.processes[0].id;
    }
    return next;
  }, navOptions);
  S.ui.tab = 'process';
  S.ui.procView = 'stage';
  S.ui.stageViewMode = 'panorama';
  S.ui.taskId = null;
  if(!S.ui.procId && S.doc?.processes?.length) {
    S.ui.procId = getProcessIdentity(S.doc.processes[0]);
  }
  render();
}

function setProcView(v, navOptions = {}) {
  if ((v === 'flow' || v === 'card') && typeof openProcessFlowView === 'function') {
    openProcessFlowView(navOptions);
    return;
  }
  queueUiNavigationHistoryFor({ procView: v }, navOptions);
  S.ui.procView = v;
  render();
}

function _defaultSbCollapse(doc) {
  const processes = doc.processes || [];
  const c = { lang: true };
  [...new Set(processes.map(p => p.subDomain || '').filter(Boolean))]
    .forEach((sd) => { c[`sd-${sd}`] = true; });
  [...new Set(processes.map((p) => `${p.subDomain || ''}::${p.flowGroup || ''}`))]
    .forEach((key) => { c[`fg-${key}`] = true; });
  getValueStreamItems(doc).forEach((stream) => { c[`vs-${stream.id}`] = true; });
  getStageItems(doc).forEach((stageItem) => { c[`stage-tree-${stageItem.id}`] = true; });
  getCapabilityItems(doc).forEach((capability) => { c[`cap-${capability.id || capability.name}`] = true; });
  getBusinessConstructItems(doc).forEach((construct) => { c[`construct-${construct.uid || construct.name}`] = true; });
  [...new Set((doc.entities||[]).map(e => e.group || '').filter(Boolean))]
    .forEach((grp) => { c[`grp-${grp}`] = true; });
  processes.forEach(p => { c[`proc-${p.id}`] = true; });
  return c;
}


function render() {
  renderToolbar();
  const manualMode = S.ui.tab === 'manual';
  const feedbackMode = S.ui.tab === 'feedback';
  document.body.classList.toggle('manual-shell', manualMode || feedbackMode);
  if (manualMode) {
    document.getElementById('tab-bar').innerHTML = '';
    if (typeof renderManualTab === 'function') renderManualTab();
    if (typeof bootManualTab === 'function') void bootManualTab();
    return;
  }
  if (feedbackMode) {
    document.getElementById('tab-bar').innerHTML = '';
    if (typeof renderFeedbackTab === 'function') renderFeedbackTab();
    return;
  }
  renderTabBar();
  if(!S.doc){renderNoDoc();}
  else {
  renderSidebar();
  const t=S.ui.tab;
  if     (t==='domain') renderDomainTab();
  else if(t==='process') renderProcessTab();
  else if(t==='data')   renderDataTab();
  else if(t==='preview') renderPreviewTab();
  } // end if(S.doc) else block
  /* 渲染完成后初始化所有 auto-resize textarea 高度 */
  setTimeout(initAutoResize, 0);
}

function renderToolbar() {
  const name = getCurrentDocumentLabel();
  document.getElementById('file-name').textContent = name;
  document.getElementById('file-name').title = getCurrentDocumentTitle();
  const versionBadge = document.getElementById('document-version-badge');
  if (versionBadge) {
    const meta = S.doc?.meta || {};
    const readonlyLabel = meta.version_label || (meta.version_id ? String(meta.version_id).replace(/^history:/, '历史快照 ') : '');
    const recoverySeq = Number(S.collab?.draftBaseSeqOverride || 0);
    const seq = Number(S.collab?.seq || S.collab?.acceptedSeq || 0);
    let label = '';
    let kind = '';
    if (S.readOnly && readonlyLabel) {
      label = readonlyLabel;
      kind = 'readonly';
    } else if (S.collab?.recoveryMode) {
      label = recoverySeq ? `本地恢复 · 基线 v${recoverySeq}` : '本地恢复';
      kind = 'recovery';
    } else if (S.currentFile && S.runtime.supportsCollab && seq > 0) {
      label = `当前 v${seq}`;
      kind = 'current';
    }
    versionBadge.textContent = label;
    versionBadge.title = label ? `文档版本：${label}` : '';
    versionBadge.classList.toggle('hidden', !label);
    versionBadge.classList.toggle('readonly', kind === 'readonly');
    versionBadge.classList.toggle('recovery', kind === 'recovery');
    versionBadge.classList.toggle('current', kind === 'current');
  }
  const isCollabDoc = Boolean(S.currentFile && S.runtime.supportsCollab && !S.readOnly);
  const isCollabConnected = Boolean(isCollabDoc && S.collab?.connected);
  const hasLocalUnsubmitted = isCollabDoc
    ? Boolean(S.modified || S.collab?.pendingSnapshot || S.collab?.snapshotTimer || S.collab?.syncing || S.collab?.localDraftPending)
    : Boolean(S.modified);
  const hasRemoteUnsynced = Boolean(isCollabDoc && (S.collab?.pendingRemoteSnapshot || S.collab?.hasConflict));
  const hasActionableChange = Boolean(hasLocalUnsubmitted || hasRemoteUnsynced);
  const badge = document.getElementById('modified-badge');
  if (badge) {
    badge.classList.toggle('hidden', !hasActionableChange);
    badge.classList.toggle('syncing', Boolean(S.collab?.syncing));
    badge.classList.toggle('has-local', hasLocalUnsubmitted);
    badge.classList.toggle('has-remote', hasRemoteUnsynced);
    badge.title = [
      hasLocalUnsubmitted ? '本地修改尚未提交到服务端' : '',
      hasRemoteUnsynced ? '远端已有其他人提交，点击立即同步拉取并合并' : '',
    ].filter(Boolean).join('\n');
    badge.innerHTML = hasActionableChange
      ? [
        hasLocalUnsubmitted
          ? `<span class="modified-badge-row local"><span class="modified-badge-dot"></span>${S.collab?.syncing ? '同步中' : '本地未提交'}</span>`
          : '',
        hasRemoteUnsynced
          ? '<span class="modified-badge-row remote"><span class="modified-badge-dot"></span>远端未同步</span>'
          : '',
      ].filter(Boolean).join('')
      : '';
  }
  const saveButton = document.getElementById('btn-save');
  if (saveButton) {
    saveButton.textContent = '立即同步';
    saveButton.title = '立即同步 (Ctrl+S)';
    saveButton.classList.toggle('btn-primary', hasActionableChange);
    saveButton.classList.toggle('btn-ghost', !hasActionableChange);
  }
  const openButton = document.querySelector('[data-testid="toolbar-open-button"]');
  if (openButton) {
    const opening = Boolean(S.recovery?.isOpeningModal || S.recovery?.openingFileName);
    openButton.disabled = opening;
    openButton.classList.toggle('is-loading', opening);
    openButton.textContent = opening ? '打开中...' : '打开';
  }
  document.getElementById('readonly-alert')?.classList.toggle('hidden', !S.readOnly);
  if (typeof renderCollabConflictBanner === 'function') renderCollabConflictBanner();
  document.getElementById('toolbar-manual-button')?.classList.toggle('active', S.ui.tab === 'manual');
  document.querySelector('[data-testid="toolbar-feedback-button"]')?.classList.toggle('active', S.ui.tab === 'feedback');
  if (typeof syncSavingControls === 'function') syncSavingControls();
  if (typeof refreshSaveDialogText === 'function') {
    refreshSaveDialogText();
  }
}

function renderNoDoc() {
  document.getElementById('sidebar-content').innerHTML =
    `<div class="sb-empty" style="padding:20px 12px;line-height:1.8">新建或打开文档<br>开始建模</div>`;
  document.getElementById('tab-bar').innerHTML='';
  document.getElementById('tab-content').innerHTML=`
    <div class="empty-state">
      <h2>BLM（Business Language Modeling）业务语言建模</h2>
      <p>结构化记录业务理解，生成可读文档</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary" onclick="App.cmdNew()">新建文档</button>
        <button class="btn btn-outline" onclick="App.cmdOpen()">打开文档</button>
      </div>
    </div>`;
}

/* ─── 辅助：渲染单个流程条目及其任务 ─── */
function _renderSbCount(count) {
  return `<span class="sb-count" data-count="${count}">${count}</span>`;
}

function _renderSbLabeledCount(label, count, options = {}) {
  const className = options.className ? ` ${options.className}` : '';
  const testId = options.testId ? ` data-testid="${esc(options.testId)}"` : '';
  return `<span class="sb-count sb-count-labeled${className}" data-count="${count}" title="${esc(label)} ${count}"${testId}>
    <span class="sb-count-label">${esc(label)}</span><span class="sb-count-value">${count}</span>
  </span>`;
}

function _renderSbConstructCounts(entityCount, taskCount) {
  return `<span class="sb-count-group">
    ${_renderSbLabeledCount('实体', entityCount, { className: 'entity-count', testId: 'construct-entity-count' })}
    ${_renderSbLabeledCount('任务', taskCount, { className: 'task-count', testId: 'construct-task-count' })}
  </span>`;
}

function _renderSbMetrics(metrics) {
  return `<div class="sb-metrics">${metrics.map((metric) => `
    <span class="sb-metric ${metric.group ? `sb-metric-${esc(metric.group)}` : ''}" title="${esc(metric.label)} ${metric.value}">
      <span class="sb-metric-label">${esc(metric.label)}</span>
      <span class="sb-metric-gap"> </span>
      <span class="sb-metric-value">${metric.value}</span>
    </span>`).join('')}</div>`;
}

function _getProcessStageNames(proc, doc = S.doc) {
  if (!proc || !doc) return [];
  const names = [];
  const stageIds = new Set([
    proc.stageUid,
    proc.primaryStageId,
    ...(Array.isArray(proc.stageUids) ? proc.stageUids : []),
  ].filter(Boolean));
  const refs = getStageFlowRefs(doc).filter((ref) => ref.processUid === proc.id || ref.flowId === proc.id);
  refs.forEach((ref) => {
    if (ref.stageUid) stageIds.add(ref.stageUid);
  });
  stageIds.forEach((stageId) => {
    const stage = getStageItems(doc).find((item) => item.id === stageId);
    if (stage?.name) names.push(stage.name);
  });
  return [...new Set(names)];
}

function getProcessCapabilityNames(proc, doc = S.doc) {
  if (!proc || !doc) return [];
  const capabilityItems = getCapabilityItems(doc);
  const constructItems = getBusinessConstructItems(doc);
  const taskItems = getTaskDefinitionItems(doc);
  const capabilityById = new Map(capabilityItems.flatMap((capability) => {
    const entries = [];
    [capability.id, capability.name].filter(Boolean).forEach((key) => entries.push([String(key), capability]));
    return entries;
  }));
  const constructById = new Map(constructItems.flatMap((construct) => {
    const entries = [];
    [construct.uid, construct.id, construct.name].filter(Boolean).forEach((key) => entries.push([String(key), construct]));
    return entries;
  }));
  const taskById = new Map(taskItems.flatMap((task) => {
    const entries = [];
    [task.id, task.name].filter(Boolean).forEach((key) => entries.push([String(key), task]));
    return entries;
  }));
  const names = new Set();
  const addCapability = (idOrName) => {
    const key = String(idOrName || '').trim();
    if (!key) return;
    const capability = capabilityById.get(key);
    names.add(capability?.name || key);
  };
  const addConstruct = (idOrName) => {
    const construct = constructById.get(String(idOrName || '').trim());
    if (!construct) return;
    addCapability(construct.businessComponentUid || construct.businessComponent);
  };
  const addTaskDefinition = (idOrName) => {
    const task = taskById.get(String(idOrName || '').trim());
    if (!task) return;
    addCapability(task.businessComponentUid || task.businessComponent);
    addConstruct(task.constructUid || task.constructName);
  };

  (Array.isArray(proc.businessComponentUids) ? proc.businessComponentUids : []).forEach(addCapability);
  (Array.isArray(proc.businessConstructUids) ? proc.businessConstructUids : []).forEach(addConstruct);
  addConstruct(proc.businessConstructUid);
  getProcNodes(proc).forEach((node) => {
    addCapability(node.businessComponentUid || node.businessComponent);
    addConstruct(node.constructUid || node.businessConstructUid || node.constructName);
    addTaskDefinition(node.taskDefinitionUid || node.taskDefinitionName);
    getNodeOrchestrationTasks(node).forEach((task) => {
      addCapability(task.businessComponentUid || task.businessComponent);
      addConstruct(task.constructUid || task.businessConstructUid || task.constructName);
      addTaskDefinition(task.taskDefinitionUid || task.taskDefinitionName);
    });
    (Array.isArray(node.entity_ops) ? node.entity_ops : []).forEach((op) => {
      const entity = (doc.entities || []).find((item) => item.id === op.entity_id || item.name === op.entity_id);
      addConstruct(entity?.businessConstructUid);
      (Array.isArray(entity?.businessConstructUids) ? entity.businessConstructUids : []).forEach(addConstruct);
    });
    (Array.isArray(node.forms) ? node.forms : []).forEach((form) => {
      const entity = (doc.entities || []).find((item) => item.id === form.entity_id || item.name === form.entity_id);
      addConstruct(entity?.businessConstructUid);
      (Array.isArray(entity?.businessConstructUids) ? entity.businessConstructUids : []).forEach(addConstruct);
    });
  });
  if (!names.size && proc.subDomain) addCapability(proc.subDomain);
  return [...names].filter(Boolean);
}

function _renderSbProc(p, options = {}) {
  const procId = getProcessIdentity(p);
  const procActive=S.ui.tab==='process'&&(S.ui.procId===procId||S.ui.procId===p.id||S.ui.procId===p.uid)&&!S.ui.taskId;
  const taskCount=getProcNodes(p).length;
  const tags = [];
  const stageId = String(options.stageId || '').trim();
  const moveUpArgs = stageId
    ? `'${esc(procId)}',-1,event,'${esc(stageId)}'`
    : `'${esc(procId)}',-1,event`;
  const moveDownArgs = stageId
    ? `'${esc(procId)}',1,event,'${esc(stageId)}'`
    : `'${esc(procId)}',1,event`;
  if (options.showCapability) {
    const capabilityNames = getProcessCapabilityNames(p);
    if (capabilityNames.length) {
      const visibleNames = capabilityNames.slice(0, 2).join('、');
      tags.push(capabilityNames.length > 2 ? `组件：${visibleNames} 等${capabilityNames.length}个` : `组件：${visibleNames}`);
    }
  }
  if (options.showStage) _getProcessStageNames(p).slice(0, 2).forEach((name) => tags.push(`阶段：${name}`));
  return `<div class="sb-proc-head ${procActive?'active':''}${options.inFlowGroup ? ' in-flow-group' : ''}" data-process-id="${esc(procId)}"
    oncontextmenu="showSidebarProcessContextMenu('${esc(procId)}',event)"
    onclick="navigate('process',{procId:'${esc(procId)}',taskId:null})">
    <span class="sb-proc-kind">流程</span>
    <span class="sb-proc-main">
      <span class="sb-name" title="${esc(p.name||'未命名')}">${esc(p.name||'未命名')}</span>
      ${tags.length ? `<span class="sb-proc-tags">${tags.map((tag) => `<span class="sb-proc-tag">${esc(tag)}</span>`).join('')}</span>` : ''}
    </span>
    ${_renderSbCount(taskCount)}
    <span class="sb-move-btns">
      <button class="sb-move-btn sb-move-up" onclick="moveProcInSd(${moveUpArgs})" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
      <button class="sb-move-btn sb-move-down" onclick="moveProcInSd(${moveDownArgs})" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
    </span>
  </div>`;
}

function closeSidebarProcessContextMenu() {
  document.querySelectorAll('.sidebar-process-context-menu').forEach((menu) => menu.remove());
  document.removeEventListener('click', closeSidebarProcessContextMenu);
  document.removeEventListener('keydown', closeSidebarProcessContextMenuOnEscape);
}

function closeSidebarProcessContextMenuOnEscape(event) {
  if (event.key === 'Escape') closeSidebarProcessContextMenu();
}

function bindSidebarProcessContextMenu() {
  const content = document.getElementById('sidebar-content');
  if (!content || content.dataset.processContextMenuBound === 'true') return;
  content.dataset.processContextMenuBound = 'true';
  content.addEventListener('contextmenu', (event) => {
    const item = event.target?.closest?.('.sb-proc-head[data-process-id]');
    if (!item || !content.contains(item)) return;
    showSidebarProcessContextMenu(item.dataset.processId, event);
  });
}

function showSidebarProcessContextMenu(procId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  closeSidebarProcessContextMenu();
  const process = findProcessByIdentity(procId, S.doc);
  if (!process) return;
  const menu = document.createElement('div');
  menu.className = 'sidebar-process-context-menu';
  menu.setAttribute('data-testid', 'sidebar-process-context-menu');
  menu.style.left = `${Math.max(8, event?.clientX || 8)}px`;
  menu.style.top = `${Math.max(8, event?.clientY || 8)}px`;
  menu.innerHTML = `<button type="button" data-testid="sidebar-process-copy-action">复制流程</button>
    <button type="button" data-testid="sidebar-process-migrate-action">迁移至其它阶段</button>`;
  const buttons = menu.querySelectorAll('button');
  buttons[0]?.addEventListener('click', (clickEvent) => {
    clickEvent.preventDefault(); clickEvent.stopPropagation();
    closeSidebarProcessContextMenu();
    duplicateProcess(getProcessIdentity(process));
  });
  buttons[1]?.addEventListener('click', (clickEvent) => {
    clickEvent.preventDefault(); clickEvent.stopPropagation();
    closeSidebarProcessContextMenu();
    openMigrateProcessDialog(getProcessIdentity(process));
  });
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const nextLeft = Math.min(rect.left, Math.max(8, window.innerWidth - rect.width - 8));
  const nextTop = Math.min(rect.top, Math.max(8, window.innerHeight - rect.height - 8));
  menu.style.left = `${nextLeft}px`;
  menu.style.top = `${nextTop}px`;
  setTimeout(() => {
    document.addEventListener('click', closeSidebarProcessContextMenu);
    document.addEventListener('keydown', closeSidebarProcessContextMenuOnEscape);
  }, 0);
}

window.showSidebarProcessContextMenu = showSidebarProcessContextMenu;
window.closeSidebarProcessContextMenu = closeSidebarProcessContextMenu;

function _renderSbStage(stageItem, processes, collapseKey) {
  const isActive = S.ui.tab === 'process' && S.ui.procView === 'stage' && S.ui.stageId === stageItem.id;
  const isCollapsed = !!S.ui.sbCollapse[collapseKey];
  return `<div class="sb-subgrp-head sb-stage-head ${isActive ? 'active' : ''}" data-stage-id="${esc(stageItem.id)}"
    onclick="openStageFromSidebar('${esc(stageItem.id)}','${esc(collapseKey)}')">
    <button type="button" class="sb-caret ${isCollapsed ? 'is-collapsed' : 'is-expanded'}"
      onclick="event.stopPropagation();toggleCollapse('${esc(collapseKey)}')"><span class="sb-caret-icon">▶</span></button>
    <span class="sb-subgrp-badge">阶段</span>
    <span class="sb-name" title="${esc(stageItem.name)}">${esc(stageItem.name)}</span>
    ${_renderSbCount(processes.length)}
  </div>`;
}

function getSidebarProcessGroups(processes) {
  const list = Array.isArray(processes) ? processes : [];
  const hasNamedGroup = list.some((proc) => String(proc?.flowGroup || '').trim());
  if (!hasNamedGroup) return [{ label: '', key: 'all', processes: list, implicit: true }];
  const groups = [];
  const groupIndex = new Map();
  list.forEach((proc) => {
    const label = String(proc?.flowGroup || '').trim() || '未分组';
    if (!groupIndex.has(label)) {
      groupIndex.set(label, groups.length);
      groups.push({ label, key: `group-${groups.length}`, processes: [] });
    }
    groups[groupIndex.get(label)].processes.push(proc);
  });
  return groups;
}

function _renderSbFlowGroup(group, collapseKey) {
  const isCollapsed = !!S.ui.sbCollapse[collapseKey];
  return `<div class="sb-subgrp-head sb-flow-group-head" data-flow-group="${esc(group.label)}"
    onclick="toggleCollapse('${esc(collapseKey)}')">
    <button type="button" class="sb-caret ${isCollapsed ? 'is-collapsed' : 'is-expanded'}"
      onclick="event.stopPropagation();toggleCollapse('${esc(collapseKey)}')"><span class="sb-caret-icon">\u25b6</span></button>
    <span class="sb-subgrp-badge">\u6d41\u7a0b\u7ec4</span>
    <span class="sb-name" title="${esc(group.label)}">${esc(group.label)}</span>
    ${_renderSbCount(group.processes.length)}
  </div>`;
}

function getBusinessDomainItems(doc = S.doc) {
  const explicit = Array.isArray(doc?.businessDomains) ? doc.businessDomains : [];
  const addAlias = (set, value) => {
    const text = String(value || '').trim();
    if (text) set.add(text);
  };
  const normalizeExplicitDomain = (domain) => {
    const id = String(domain?.id || domain?.name || '').trim();
    const name = String(domain?.name || id).trim();
    const laneId = String(domain?.laneUid || domain?.panoramaLaneUid || '').trim();
    const aliases = new Set();
    [id, name, laneId, domain?.businessDomainUid, domain?.businessDomain].forEach((value) => addAlias(aliases, value));
    return id || name ? {
      id: id || name,
      name: name || id,
      laneId,
      note: domain?.note || '',
      aliases: [...aliases],
    } : null;
  };
  const explicitDomains = explicit.map(normalizeExplicitDomain).filter(Boolean);

  const lanes = Array.isArray(doc?.panorama?.lanes) ? doc.panorama.lanes : [];
  if (lanes.length) {
    return lanes.map((lane, index) => {
      const id = String(lane?.uid || lane?.id || lane?.name || `lane-${index + 1}`).trim();
      const name = String(lane?.name || id).trim();
      const aliases = new Set();
      [id, name, lane?.laneUid, lane?.domainUid, lane?.businessDomainUid, lane?.businessDomain].forEach((value) => addAlias(aliases, value));

      const matchedExplicit = explicitDomains.filter((domain) => (
        domain.laneId === id
        || domain.id === id
        || domain.name === name
        || domain.aliases.includes(id)
        || domain.aliases.includes(name)
      ));
      matchedExplicit.forEach((domain) => {
        [domain.id, domain.name, domain.laneId, ...(domain.aliases || [])].forEach((value) => addAlias(aliases, value));
      });

      return {
        id,
        name: name || id,
        laneId: id,
        note: lane?.note || matchedExplicit[0]?.note || '',
        aliases: [...aliases],
      };
    });
  }

  const byId = new Map();
  explicitDomains.forEach((domain) => byId.set(domain.id, domain));

  const addDerived = (item) => {
    const id = String(item?.businessDomainUid || item?.businessDomain || item?.panoramaLaneUid || '').trim();
    if (!id || byId.has(id)) return;
    byId.set(id, {
      id,
      name: String(item.businessDomain || item.businessDomainUid || item.panoramaLaneUid || id),
      laneId: item.panoramaLaneUid || '',
      note: '',
      aliases: [id, item.businessDomain, item.businessDomainUid, item.panoramaLaneUid].filter(Boolean).map(String),
    });
  };

  (doc?.processes || []).forEach(addDerived);
  getStageItems(doc).forEach(addDerived);
  return [...byId.values()];
}

function getBusinessDomainFilter() {
  const domains = getBusinessDomainItems(S.doc);
  const selected = String(S.ui.businessDomainFilter || 'all');
  if (selected === 'all') return selected;
  const matched = domains.find((domain) => domain.id === selected || _domainAliases(domain).includes(selected));
  return matched ? matched.id : 'all';
}

function setBusinessDomainFilter(value) {
  S.ui.businessDomainFilter = value || 'all';
  renderSidebar();
  if (S.ui.tab === 'domain' && typeof rerenderDomainTabPreserveScroll === 'function') {
    rerenderDomainTabPreserveScroll();
  }
}

function _domainAliases(domain) {
  return [...new Set([domain?.id, domain?.name, domain?.laneId, ...(domain?.aliases || [])].filter(Boolean).map(String))];
}

function _itemBusinessDomainValues(item) {
  return [
    item?.businessDomainUid,
    item?.businessDomain,
    item?.panoramaLaneUid,
    item?.laneUid,
    item?.domainId,
  ].filter(Boolean).map(String);
}

function _hasExplicitBusinessDomain(item) {
  return _itemBusinessDomainValues(item).length > 0;
}

function itemMatchesBusinessDomain(item, selectedDomainId, doc = S.doc) {
  if (!selectedDomainId || selectedDomainId === 'all') return true;
  const domains = getBusinessDomainItems(doc);
  const selectedDomain = domains.find((domain) => domain.id === selectedDomainId);
  const aliases = new Set(_domainAliases(selectedDomain));
  if (!aliases.size) aliases.add(selectedDomainId);
  if (_itemBusinessDomainValues(item).some((value) => aliases.has(value))) return true;

  if (item?.stageId || item?.primaryStageId) {
    const stageId = item.stageId || item.primaryStageId;
    const stage = getStageItems(doc).find((stageItem) => stageItem.id === stageId);
    if (stage && itemMatchesBusinessDomain(stage, selectedDomainId, doc)) return true;
  }
  return false;
}

function getValueStreamItems(doc = S.doc) {
  const byId = new Map();
  const findExisting = (id, name) => {
    const targetId = String(id || '').trim();
    const targetName = String(name || '').trim();
    if (targetId && byId.has(targetId)) return byId.get(targetId);
    if (!targetName) return null;
    return [...byId.values()].find((item) => item.name === targetName) || null;
  };
  (doc?.panorama?.columns || []).forEach((column) => {
    const id = String(column.uid || column.id || column.name || '').trim();
    if (!id) return;
    const name = String(column.name || id).trim();
    const existing = findExisting(id, name);
    if (existing) {
      if (existing.id !== id) byId.delete(existing.id);
      existing.id = id;
      existing.name = name || existing.name;
      existing.scope = existing.scope || column.note || '';
      byId.set(id, existing);
      return;
    }
    byId.set(id, { id, name, scope: column.note || '' });
  });
  (Array.isArray(doc?.valueStreams) ? doc.valueStreams : []).forEach((stream) => {
    const id = String(stream.uid || stream.id || stream.name || '').trim();
    if (!id) return;
    const name = String(stream.name || id).trim();
    const existing = findExisting(id, name);
    if (existing) {
      existing.name = existing.name || name;
      existing.scope = existing.scope || stream.scope || '';
      return;
    }
    byId.set(id, { id, name, scope: stream.scope || '' });
  });
  getStageItems(doc).filter((stage) => !stage.virtual).forEach((stage) => {
    const id = String(stage.valueStreamUid || stage.panoramaColumnUid || stage.valueStream || '未归类价值流');
    const name = String(stage.valueStream || id).trim();
    if (!findExisting(id, name)) byId.set(id, { id, name, scope: '' });
  });
  return [...byId.values()];
}

function getStageValueStreamId(stageItem) {
  return String(stageItem?.valueStreamUid || stageItem?.panoramaColumnUid || stageItem?.valueStream || '未归类价值流');
}

function getCapabilityItems(doc = S.doc) {
  const explicit = Array.isArray(doc?.businessComponents) ? doc.businessComponents : [];
  return explicit.map((capability) => ({
    ...capability,
    id: capability.id || capability.name,
    name: capability.name || capability.id || '未命名能力',
    kind: capability.kind === 'core' ? 'core' : 'generic',
    entityIds: Array.isArray(capability.entityUids) ? capability.entityUids : [],
    taskDefinitionIds: Array.isArray(capability.taskDefinitionUids) ? capability.taskDefinitionUids : [],
    constructIds: Array.isArray(capability.constructUids) ? capability.constructUids : [],
  }));
}

function getBusinessConstructItems(doc = S.doc) {
  const explicit = Array.isArray(doc?.businessConstructs) ? doc.businessConstructs : [];
  return explicit.map((construct) => ({
    ...construct,
    id: construct.uid || construct.id,
    name: construct.name || construct.id || '未命名业务构件',
    entityIds: Array.isArray(construct.entityUids) ? construct.entityUids : [],
    taskDefinitionIds: Array.isArray(construct.taskDefinitionUids) ? construct.taskDefinitionUids : [],
    relatedProcessIds: Array.isArray(construct.relatedProcessIds) ? construct.relatedProcessIds : [],
  }));
}

function getTaskDefinitionItems(doc = S.doc) {
  const explicit = Array.isArray(doc?.taskDefinitions) ? doc.taskDefinitions : [];
  return explicit.map((task) => ({
    ...task,
    id: task.id || task.name,
    name: task.name || task.id || '未命名任务定义',
    entityIds: Array.isArray(task.entityUids) ? task.entityUids : [],
    processIds: Array.isArray(task.processIds) ? task.processIds : [],
    usedBy: Array.isArray(task.usedBy) ? task.usedBy : [],
  }));
}

function getCapabilityConstructs(capability, doc = S.doc) {
  const capId = capability?.id || '';
  if (!capId) return [];
  return getBusinessConstructItems(doc).filter((construct) => (
    construct.businessComponentUid === capId
    || construct.businessComponent === capability?.name
  ));
}

function getConstructProcesses(construct, doc = S.doc) {
  const relatedIds = new Set([
    ...(Array.isArray(construct?.relatedProcessIds) ? construct.relatedProcessIds : []),
    ...(Array.isArray(construct?.processIds) ? construct.processIds : []),
  ].filter(Boolean));
  const taskIds = new Set(getConstructTaskDefinitions(construct, doc).map((task) => task.id));
  const cid2 = construct.uid || '';
  return (doc?.processes || []).filter((proc) => (
    relatedIds.has(proc.id)
    || (Array.isArray(proc.businessConstructUids) && proc.businessConstructUids.some((u) => u === cid2))
    || proc.businessConstructUid === cid2
    || getProcNodes(proc).some((node) => getNodeOrchestrationTasks(node)
      .some((task) => taskIds.has(task.taskDefinitionUid)))
  ));
}

function getConstructEntities(construct, doc = S.doc) {
  const cid = construct?.uid || '';
  if (!cid) return [];
  return (doc?.entities || []).filter((entity) => (
    (entity.businessConstructUid && entity.businessConstructUid === cid)
    || (Array.isArray(entity.businessConstructUids) && entity.businessConstructUids.some((u) => u === cid))
  ));
}

function getConstructTaskDefinitions(construct, doc = S.doc) {
  const constructUid = construct?.uid || '';
  if (!constructUid) return [];
  return getTaskDefinitionItems(doc).filter((task) => (
    (task.constructUid && task.constructUid === constructUid)
    || (Array.isArray(task.constructUids) && task.constructUids.includes(constructUid))
  ));
}

function getTaskDefinitionSources(taskDefinition, doc = S.doc) {
  const processes = doc?.processes || [];
  const processMap = new Map(processes.map((proc) => [proc.id, proc]));
  const sources = [];
  const seen = new Set();
  const pushSource = (source) => {
    const key = `${source.procId || ''}::${source.nodeId || source.taskId || ''}::${source.index ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };
  processes.forEach((proc) => {
    getProcNodes(proc).forEach((node) => {
      getNodeOrchestrationTasks(node).forEach((item, index) => {
        if (item.taskDefinitionUid !== taskDefinition?.id) return;
        pushSource({
          procId: proc.id,
          procName: proc.name || '',
          taskId: node.id,
          nodeId: node.id,
          nodeName: node.name || '',
          taskName: item.name || taskDefinition?.name || '',
          index,
        });
      });
    });
  });
  (taskDefinition?.usedBy || []).forEach((usage) => {
    const proc = processMap.get(usage.processUid || usage.processId);
    if (!proc) return;
    const node = getProcNodes(proc).find((item) => item.id === usage.nodeId);
    const usageIndex = Number(usage.taskIndex);
    const nodeTask = Number.isInteger(usageIndex)
      ? getNodeOrchestrationTasks(node)[usageIndex]
      : null;
    pushSource({
      procId: proc.id,
      procName: proc.name || '',
      taskId: node?.id || '',
      nodeId: node?.id || '',
      nodeName: node?.name || '',
      taskName: nodeTask?.name || taskDefinition?.name || '',
      index: Number.isInteger(usageIndex) ? usageIndex : usage.taskIndex,
    });
  });
  if (!sources.length) {
    (taskDefinition?.processIds || []).forEach((processId) => {
      const proc = processMap.get(processId);
      if (!proc) return;
      pushSource({
        procId: proc.id,
        procName: proc.name || '',
        taskId: '',
        nodeName: '',
        taskName: '流程级任务定义',
      });
    });
  }
  return sources;
}

function taskDefinitionToAsset(taskDefinition, doc = S.doc) {
  return {
    kind: 'task',
    id: taskDefinition.id,
    name: taskDefinition.name,
    type: taskDefinition.type || '',
    target: taskDefinition.target || '',
    note: taskDefinition.note || '',
    status: taskDefinition.status || '',
    sources: getTaskDefinitionSources(taskDefinition, doc),
  };
}

function getCapabilityProcesses(capability, doc = S.doc) {
  const relatedIds = new Set([
    ...(Array.isArray(capability?.relatedProcessIds) ? capability.relatedProcessIds : []),
    ...(Array.isArray(capability?.processIds) ? capability.processIds : []),
  ].filter(Boolean));
  const taskProcessIds = new Set();
  const explicitTaskIds = new Set(Array.isArray(capability.taskDefinitionUids) ? capability.taskDefinitionUids : []);
  getTaskDefinitionItems(doc)
    .filter((task) => (
      explicitTaskIds.has(task.id)
      || task.businessComponentUid === capability?.id
      || task.businessComponent === capability?.name
    ))
    .forEach((task) => {
      getTaskDefinitionSources(task, doc).forEach((source) => {
        if (source.procId) taskProcessIds.add(source.procId);
      });
    });
  const matchedProcesses = (doc?.processes || []).filter((proc) => (
    relatedIds.has(proc.id)
    || (Array.isArray(proc.businessComponentUids) && proc.businessComponentUids.includes(capability.id))
    || taskProcessIds.has(proc.id)
  ));
  const domainValues = _itemBusinessDomainValues(capability);
  if (!domainValues.length) return matchedProcesses;
  return matchedProcesses.filter((proc) => domainValues.some((domainId) => itemMatchesBusinessDomain(proc, domainId, doc)));
}

function getCapabilityEntities(capability, doc = S.doc) {
  const entityIds = new Set(Array.isArray(capability.entityUids) ? capability.entityUids : []);
  const entityNames = new Set(Array.isArray(capability?.entities) ? capability.entities : []);
  getCapabilityConstructs(capability, doc).forEach((construct) => {
    getConstructEntities(construct, doc).forEach((entity) => entityIds.add(entity.id));
  });
  return (doc?.entities || []).filter((entity) => (
    entityIds.has(entity.id)
    || entityNames.has(entity.name)
  ));
}

function getCapabilityServices(capability, doc = S.doc) {
  const explicitNames = Array.isArray(capability?.taskNames) ? capability.taskNames : [];
  const serviceNames = Array.isArray(capability?.services) ? capability.services : [];
  const fromDoc = (doc?.domainServices || [])
    .filter((service) => service.businessComponentUid === capability.id || service.businessComponent === capability.name)
    .map((service) => service.name || service.id);
  return [...new Set([...explicitNames, ...serviceNames, ...fromDoc].filter(Boolean))];
}

function getCapabilityTaskAssets(capability, doc = S.doc, processScope = null) {
  const explicitTaskIds = new Set(Array.isArray(capability.taskDefinitionUids) ? capability.taskDefinitionUids : []);
  const taskDefinitions = getTaskDefinitionItems(doc).filter((task) => (
    explicitTaskIds.has(task.id)
    || task.businessComponentUid === capability?.id
    || task.businessComponent === capability?.name
  ));
  if (taskDefinitions.length) {
    const sourceIds = new Set(Array.isArray(processScope) ? processScope.map((proc) => proc.id) : []);
    return taskDefinitions
      .filter((task) => {
        if (!sourceIds.size) return true;
        const usedProcessIds = new Set(getTaskDefinitionSources(task, doc).map((source) => source.procId).filter(Boolean));
        return [...usedProcessIds].some((processId) => sourceIds.has(processId));
      })
      .map((task) => taskDefinitionToAsset(task, doc));
  }

  const byName = new Map();
  const explicitTaskNames = new Set(getCapabilityServices(capability, doc));
  const ensureAsset = (name) => {
    const label = String(name || '').trim();
    if (!label) return null;
    if (!byName.has(label)) {
      byName.set(label, {
        kind: 'task',
        name: label,
        type: '',
        target: '',
        note: '',
        sources: [],
      });
    }
    return byName.get(label);
  };

  explicitTaskNames.forEach((name) => ensureAsset(name));
  const sourceProcesses = Array.isArray(processScope) ? processScope : getCapabilityProcesses(capability, doc);
  sourceProcesses.forEach((proc) => {
    getProcNodes(proc).forEach((node) => {
      getNodeOrchestrationTasks(node).forEach((task, index) => {
        const asset = ensureAsset(task.name || task.target || `任务${index + 1}`);
        if (!asset) return;
        if (!asset.type && task.type) asset.type = task.type;
        if (!asset.target && task.target) asset.target = task.target;
        if (!asset.note && task.note) asset.note = task.note;
        asset.sources.push({
          procId: proc.id,
          procName: proc.name || '',
          taskId: node.id,
          nodeId: node.id,
          nodeName: node.name || '',
          taskName: task.name || task.target || `任务${index + 1}`,
          index,
        });
      });
    });
  });

  const processOnlyScope = sourceProcesses.length && sourceProcesses.every((proc) => !getProcNodes(proc).length);
  if (processOnlyScope) {
    byName.forEach((asset) => {
      if (!explicitTaskNames.has(asset.name) || asset.sources.length) return;
      asset.sources = sourceProcesses.map((proc) => ({
        procId: proc.id,
        procName: proc.name || '',
        taskId: '',
        nodeName: '',
        taskName: '流程级引用',
      }));
    });
  }

  return [...byName.values()];
}

function getConstructTaskAssets(construct, doc = S.doc, processScope = null) {
  const sourceIds = new Set(Array.isArray(processScope) ? processScope.map((proc) => proc.id) : []);
  return getConstructTaskDefinitions(construct, doc)
    .filter((task) => {
      if (!sourceIds.size) return true;
      const usedProcessIds = new Set(getTaskDefinitionSources(task, doc).map((source) => source.procId).filter(Boolean));
      return [...usedProcessIds].some((processId) => sourceIds.has(processId));
    })
    .map((task) => taskDefinitionToAsset(task, doc));
}

function capabilityMatchesBusinessDomain(capability, selectedDomainId, doc = S.doc) {
  if (!selectedDomainId || selectedDomainId === 'all') return true;
  if (_hasExplicitBusinessDomain(capability)) return itemMatchesBusinessDomain(capability, selectedDomainId, doc);
  if (itemMatchesBusinessDomain(capability, selectedDomainId, doc)) return true;
  return getCapabilityProcesses(capability, doc).some((proc) => itemMatchesBusinessDomain(proc, selectedDomainId, doc));
}

function _renderBusinessDomainFilter(domains, selectedDomainId) {
  const options = [
    `<option value="all"${selectedDomainId === 'all' ? ' selected' : ''}>全部业务域</option>`,
    ...domains.map((domain) => `<option value="${esc(domain.id)}"${selectedDomainId === domain.id ? ' selected' : ''}>${esc(domain.name)}</option>`),
  ].join('');
  return `<label class="sb-domain-filter-row">
    <span>业务域</span>
    <select class="sb-domain-filter" data-testid="sidebar-business-domain-filter" onchange="setBusinessDomainFilter(this.value)">
      ${options}
    </select>
  </label>`;
}

function getSidebarStageProcesses(filteredStageItems, selectedBusinessDomain, doc = S.doc) {
  const processMap = new Map();
  filteredStageItems.forEach((stageItem) => {
    getStageProcesses(stageItem.id, doc)
      .filter((proc) => itemMatchesBusinessDomain(proc, selectedBusinessDomain, doc))
      .forEach((proc, index) => {
        const key = proc.id ? `id:${proc.id}` : `stage:${stageItem.id}:${proc.name || index}`;
        if (!processMap.has(key)) processMap.set(key, proc);
      });
  });
  return Array.from(processMap.values());
}

function getSidebarBusinessModelStats(selectedBusinessDomain, filteredProcs, filteredStageItems, capabilityItems) {
  const valueStreamIds = new Set(filteredStageItems.map((stageItem) => getStageValueStreamId(stageItem)).filter(Boolean));
  const valueStreamCount = selectedBusinessDomain === 'all'
    ? getValueStreamItems(S.doc).length
    : getValueStreamItems(S.doc).filter((stream) => valueStreamIds.has(stream.id)).length;
  const nodeItems = filteredProcs.flatMap((proc) => getProcNodes(proc));
  const stepCount = nodeItems.reduce((sum, node) => sum + getNodeUserSteps(node).length, 0);
  const formCount = nodeItems.reduce((sum, node) => sum + (Array.isArray(node.forms) ? node.forms.length : 0), 0);

  const capabilityKeys = new Set(capabilityItems.flatMap((capability) => [
    capability.id,
    capability.name,
  ].filter(Boolean).map(String)));
  const constructItems = getBusinessConstructItems(S.doc).filter((construct) => {
    if (selectedBusinessDomain === 'all') return true;
    return itemMatchesBusinessDomain(construct, selectedBusinessDomain, S.doc)
      || capabilityKeys.has(String(construct.businessComponentUid || ''))
      || capabilityKeys.has(String(construct.businessComponent || ''));
  });
  const constructIds = new Set(constructItems.map((c) => c.uid || c.id).filter(Boolean));
  const filteredProcIds = new Set(filteredProcs.map((proc) => proc.id));
  const entityItems = (S.doc.entities || []).filter((entity) => {
    if (selectedBusinessDomain === 'all') return true;
    return itemMatchesBusinessDomain(entity, selectedBusinessDomain, S.doc)
      || constructIds.has(entity.businessConstructUid)
      || (Array.isArray(entity.businessConstructUids) && entity.businessConstructUids.some((id) => constructIds.has(id)));
  });
  const taskItems = getTaskDefinitionItems(S.doc).filter((task) => {
    if (selectedBusinessDomain === 'all') return true;
    if (itemMatchesBusinessDomain(task, selectedBusinessDomain, S.doc)) return true;
    if (capabilityKeys.has(String(task.businessComponentUid || '')) || capabilityKeys.has(String(task.businessComponent || ''))) return true;
    if (constructIds.has(task.constructUid)) return true;
    return getTaskDefinitionSources(task, S.doc).some((source) => filteredProcIds.has(source.procId));
  });

  return [
    { label: '价值流', value: valueStreamCount, group: 'flow' },
    { label: '阶段', value: filteredStageItems.length, group: 'flow' },
    { label: '流程', value: filteredProcs.length, group: 'flow' },
    { label: '节点', value: nodeItems.length, group: 'flow' },
    { label: '步骤', value: stepCount, group: 'interaction' },
    { label: '表单', value: formCount, group: 'interaction' },
    { label: '任务', value: taskItems.length, group: 'model' },
    { label: '实体', value: entityItems.length, group: 'model' },
    { label: '构件', value: constructItems.length, group: 'model' },
    { label: '组件', value: capabilityItems.length, group: 'model' },
  ];
}

function _renderSbValueStream(stream, stages, collapseKey) {
  const isCollapsed = !!S.ui.sbCollapse[collapseKey];
  return `<div class="sb-grp-head sb-value-head" data-value-stream="${esc(stream.id)}" onclick="toggleCollapse('${esc(collapseKey)}')">
    <button type="button" class="sb-caret ${isCollapsed ? 'is-collapsed' : 'is-expanded'}"
      onclick="event.stopPropagation();toggleCollapse('${esc(collapseKey)}')"><span class="sb-caret-icon">▶</span></button>
    <span class="sb-grp-badge">价值流</span>
    <span class="sb-name" title="${esc(stream.scope || stream.name)}">${esc(stream.name)}</span>
    ${_renderSbCount(stages.length)}
  </div>`;
}

function _renderCapabilitySection(title, items, options = {}) {
  const visible = items.slice(0, options.limit || 6);
  const moreCount = Math.max(0, items.length - visible.length);
  return `<div class="sb-asset-section">
    <div class="sb-asset-head">${esc(title)}${items.length ? ` <span>${items.length}</span>` : ''}</div>
    ${visible.length ? visible.map((item) => {
      const label = typeof item === 'string' ? item : (item.name || item.id || '');
      const id = typeof item === 'string' ? '' : item.id;
      const attrs = options.entity && id ? ` data-asset-entity-id="${esc(id)}" onclick="navigate('data',{entityId:'${esc(id)}'})"` : '';
      return `<div class="sb-asset-item"${attrs}>${esc(label)}</div>`;
    }).join('') : `<div class="sb-empty sb-asset-empty">暂无</div>`}
    ${moreCount ? `<div class="sb-asset-more">还有 ${moreCount} 项</div>` : ''}
  </div>`;
}

function _renderCapabilityAssetSection(title, assets, options = {}) {
  const limit = Object.prototype.hasOwnProperty.call(options, 'limit') ? options.limit : 8;
  const visible = Number.isFinite(limit) ? assets.slice(0, limit) : assets;
  const moreCount = Math.max(0, assets.length - visible.length);
  const testId = options.testId || 'capability-asset';
  return `<div class="sb-asset-section">
    <div class="sb-asset-head">${esc(title)}${assets.length ? ` <span>${assets.length}</span>` : ''}</div>
    ${visible.length ? visible.map((asset) => {
      const source = asset.sources?.[0];
      const sourceTitle = source
        ? `${source.procName || source.procId} / ${source.nodeName || source.taskId || '流程级引用'}${source.taskName ? ` / ${source.taskName}` : ''}${asset.sources.length > 1 ? `；共 ${asset.sources.length} 处使用` : ''}`
        : '尚未绑定到流程节点';
      const canOpenNode = !!(source?.procId && source?.taskId);
      const canOpenProcess = !!(source?.procId && !source?.taskId);
      const isTaskDef = asset.kind === 'task';
      const canOpenTaskDef = isTaskDef && Boolean(asset.id);
      const canOpen = canOpenNode || canOpenProcess || canOpenTaskDef;
      let onclick = '';
      if (canOpenTaskDef) {
        onclick = ` onclick="openTaskDefinitionEditor('${esc(asset.id)}')"`;
      } else if (canOpenNode) {
        onclick = ` onclick="openBusinessAsset('${esc(asset.kind)}','${esc(source.procId)}','${esc(source.taskId)}','${esc(source.index ?? '')}','${esc(source.formId || '')}','${esc(source.sectionId || '')}')"`;
      } else if (canOpenProcess) {
        onclick = ` onclick="navigate('process',{procId:'${esc(source.procId)}'})"`;
      }
      const titleText = isTaskDef ? `打开任务定义：${esc(asset.name)}` : sourceTitle;
      return `<button type="button" class="sb-asset-item sb-asset-link ${canOpen ? '' : 'disabled'}"
        data-testid="${esc(testId)}" title="${esc(titleText)}"${onclick} ${canOpen ? '' : 'disabled'}>
        <span>${esc(asset.name)}</span>
        ${asset.sources?.length > 1 ? `<small>${asset.sources.length}</small>` : ''}
      </button>`;
    }).join('') : `<div class="sb-empty sb-asset-empty">暂无</div>`}
    ${moreCount ? `<div class="sb-asset-more">还有 ${moreCount} 项</div>` : ''}
  </div>`;
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Sidebar (collapsible tree)
═══════════════════════════════════════════════════════════ */
function renderSidebar() {
  const collapsed = S.ui.sidebarCollapsed;
  const stageItems = getStageItems(S.doc);
  const businessDomains = getBusinessDomainItems(S.doc);
  const selectedBusinessDomain = getBusinessDomainFilter();
  const filteredStageItems = stageItems.filter((stageItem) => {
    const stageProcesses = getStageProcesses(stageItem.id, S.doc)
      .filter((proc) => itemMatchesBusinessDomain(proc, selectedBusinessDomain, S.doc));
    return itemMatchesBusinessDomain(stageItem, selectedBusinessDomain, S.doc) || stageProcesses.length;
  });
  const filteredRealStageItems = filteredStageItems.filter((stageItem) => !stageItem.virtual);
  const filteredProcs = getSidebarStageProcesses(filteredRealStageItems, selectedBusinessDomain, S.doc);
  const capabilityItems = getCapabilityItems(S.doc)
    .filter((capability) => capabilityMatchesBusinessDomain(capability, selectedBusinessDomain, S.doc));
  const sidebarStats = getSidebarBusinessModelStats(
    selectedBusinessDomain,
    filteredProcs,
    filteredRealStageItems,
    capabilityItems,
  );
  /* 控制侧边栏宽度 & 外部按钮文字 */
  const sb = document.getElementById('sidebar');
  if(sb) {
    sb.classList.toggle('sb-collapsed', collapsed);
    if(collapsed) {
      sb.style.width = '';
      sb.style.minWidth = '';
    } else {
      const sidebarW = getSidebarWidth();
      sb.style.width = `${sidebarW}px`;
      sb.style.minWidth = `${sidebarW}px`;
    }
  }
  const toggleBtn = document.getElementById('sb-toggle-btn');
  if(toggleBtn) toggleBtn.textContent = collapsed ? '展开' : '折叠';

  if(collapsed) {
    document.getElementById('sidebar-content').innerHTML='';
    return;
  }

  const renderStageDirectory = () => {
    const renderStageProcessList = (stageItem, stageProcesses) => {
      const groups = getSidebarProcessGroups(stageProcesses);
      if (groups.length === 1 && groups[0].implicit) {
        return stageProcesses.map((p) => _renderSbProc(p, { showCapability: true, stageId: stageItem.id })).join('');
      }
      return groups.map((group) => {
        const groupKey = `stage-flow-group-${stageItem.id}-${group.key}`;
        let html = _renderSbFlowGroup(group, groupKey);
        if (!S.ui.sbCollapse[groupKey]) {
          html += group.processes
            .map((p) => _renderSbProc(p, { showCapability: true, stageId: stageItem.id, inFlowGroup: true }))
            .join('');
        }
        return html;
      }).join('');
    };
    let out = `<div class="sb-directory-block sb-directory-stage">
      <button class="sb-directory-title active" type="button" data-testid="sidebar-browse-stage"
        onclick="document.querySelector('[data-testid=&quot;sidebar-stage-browse&quot;]')?.scrollIntoView({block:'nearest'})">流程目录</button>
      <div class="sb-process-browse" data-testid="sidebar-stage-browse">`;
    const valueStreams = getValueStreamItems(S.doc)
      .filter((stream) => selectedBusinessDomain === 'all'
        || filteredRealStageItems.some((stageItem) => getStageValueStreamId(stageItem) === stream.id));
    for (const stream of valueStreams) {
      const streamStages = filteredRealStageItems.filter((stageItem) => getStageValueStreamId(stageItem) === stream.id);
      const streamKey = `vs-${stream.id}`;
      out += _renderSbValueStream(stream, streamStages, streamKey);
      if (S.ui.sbCollapse[streamKey]) continue;
      if (!streamStages.length) {
        out += `<div class="sb-empty sb-stage-empty">暂无阶段</div>`;
        continue;
      }
      for (const stageItem of streamStages) {
        const stageProcesses = getStageProcesses(stageItem.id, S.doc)
          .filter((proc) => itemMatchesBusinessDomain(proc, selectedBusinessDomain, S.doc));
        const collapseKey = `stage-tree-${stageItem.id}`;
        out += _renderSbStage(stageItem, stageProcesses, collapseKey);
        if (S.ui.sbCollapse[collapseKey]) continue;
        if (!stageProcesses.length) {
          out += `<div class="sb-empty sb-stage-empty">暂无流程</div>`;
          continue;
        }
        out += renderStageProcessList(stageItem, stageProcesses);
      }
    }
    const virtualStageItems = filteredStageItems.filter((stageItem) => stageItem.virtual);
    for (const stageItem of virtualStageItems) {
      const stageProcesses = getStageProcesses(stageItem.id, S.doc)
        .filter((proc) => itemMatchesBusinessDomain(proc, selectedBusinessDomain, S.doc));
      if (!stageProcesses.length) continue;
      const collapseKey = `stage-tree-${stageItem.id}`;
      out += _renderSbStage(stageItem, stageProcesses, collapseKey);
      if (S.ui.sbCollapse[collapseKey]) continue;
      out += renderStageProcessList(stageItem, stageProcesses);
    }
    if (!valueStreams.length && !filteredRealStageItems.length && !virtualStageItems.length) {
      out += `<div class="sb-empty">当前业务域暂无阶段</div>`;
    }
    return `${out}</div></div>`;
  };

  const renderComponentDirectory = () => {
    let out = `<div class="sb-directory-block sb-directory-component">
      <button class="sb-directory-title active" type="button" data-testid="sidebar-browse-domain"
        onclick="document.querySelector('[data-testid=&quot;sidebar-domain-browse&quot;]')?.scrollIntoView({block:'nearest'})">组件目录</button>
      <div class="sb-process-browse" data-testid="sidebar-domain-browse">`;
    if(!capabilityItems.length){
      out += `<div class="sb-empty">暂无业务组件</div>`;
    } else {
    for(const capability of capabilityItems) {
      const capProcesses = getCapabilityProcesses(capability, S.doc)
        .filter((proc) => itemMatchesBusinessDomain(proc, selectedBusinessDomain, S.doc));
      const capConstructs = getCapabilityConstructs(capability, S.doc)
        .filter((construct) => {
          if (!selectedBusinessDomain || selectedBusinessDomain === 'all') return true;
          return itemMatchesBusinessDomain(construct, selectedBusinessDomain, S.doc);
        });
      const capEntities = getCapabilityEntities(capability, S.doc);
      const capTasks = getCapabilityTaskAssets(capability, S.doc, capProcesses);
      const relatedProcessIds = new Set(
        capConstructs.length
          ? capConstructs.flatMap((construct) => getConstructProcesses(construct, S.doc).map((proc) => proc.id))
          : capTasks.flatMap((asset) => asset.sources || []).map((source) => source.procId).filter(Boolean)
      );
      const relatedProcesses = capProcesses.filter((proc) => relatedProcessIds.has(proc.id));
      const capabilityCount = capConstructs.length;
      const capKey=`cap-${capability.id || capability.name}`;
      const capCollapsed=!!S.ui.sbCollapse[capKey];
      out+=`<div class="sb-grp-head sb-capability-head" data-capability="${esc(capability.name)}" data-subdomain="${esc(capability.name)}" onclick="toggleCollapse('${esc(capKey)}')">
        <button type="button" class="sb-caret ${capCollapsed ? 'is-collapsed' : 'is-expanded'}"
          onclick="event.stopPropagation();toggleCollapse('${esc(capKey)}')"><span class="sb-caret-icon">▶</span></button>
        <span class="sb-grp-badge">业务组件</span>
        <span class="sb-name" title="${esc(capability.note || capability.name)}">${esc(capability.name)}</span>
        ${_renderSbCount(capabilityCount)}
      </div>`;
      if(capCollapsed) continue;

      if (capConstructs.length) {
        for (const construct of capConstructs) {
          const constructProcesses = getConstructProcesses(construct, S.doc)
            .filter((proc) => itemMatchesBusinessDomain(proc, selectedBusinessDomain, S.doc));
          const constructEntities = getConstructEntities(construct, S.doc);
          const constructTasks = getConstructTaskAssets(construct, S.doc, constructProcesses);
          const constructKey = `construct-${construct.uid || construct.name}`;
          const constructCollapsed = Object.prototype.hasOwnProperty.call(S.ui.sbCollapse, constructKey)
            ? !!S.ui.sbCollapse[constructKey]
            : true;
          out += `<div class="sb-subgrp-head sb-construct-head" data-construct="${esc(construct.name)}" onclick="toggleCollapse('${esc(constructKey)}')">
            <button type="button" class="sb-caret ${constructCollapsed ? 'is-collapsed' : 'is-expanded'}"
              onclick="event.stopPropagation();toggleCollapse('${esc(constructKey)}')"><span class="sb-caret-icon">▶</span></button>
            <span class="sb-subgrp-badge">业务构件</span>
            <span class="sb-name" title="${esc(construct.note || construct.name)}">${esc(construct.name)}</span>
            ${_renderSbConstructCounts(constructEntities.length, constructTasks.length)}
          </div>`;
          if (constructCollapsed) continue;
          out += _renderCapabilitySection('实体', constructEntities, { entity: true, limit: Infinity });
          out += _renderCapabilityAssetSection('任务', constructTasks, { testId: 'construct-task-asset', limit: Infinity });
          out += `<div class="sb-asset-section sb-related-processes">
            <div class="sb-asset-head">关联流程 <span>${constructProcesses.length}</span></div>`;
          if (!constructProcesses.length) {
            out += `<div class="sb-empty sb-stage-empty">暂无流程</div>`;
          } else {
            for (const p of constructProcesses) {
              out += _renderSbProc(p, { showStage: true });
            }
          }
          out += `</div>`;
        }
        continue;
      }

      out += _renderCapabilitySection('实体', capEntities, { entity: true, limit: Infinity });
      out += _renderCapabilityAssetSection('任务', capTasks, { testId: 'capability-task-asset', limit: Infinity });

      out += `<div class="sb-asset-section sb-related-processes">
        <div class="sb-asset-head">关联流程 <span>${relatedProcesses.length}</span></div>`;
      if (!relatedProcesses.length) {
        out += `<div class="sb-empty sb-stage-empty">暂无流程</div>`;
        out += `</div>`;
        continue;
      }
      for(const p of relatedProcesses) {
        out+=_renderSbProc(p, { showStage: true });
      }
      out += `</div>`;
    }
    }
    return `${out}</div></div>`;
  };

  let h='';

  /* ── 建模目录：流程目录 + 组件目录 ── */
  h+=`<div class="sb-section">
    <div class="sb-domain-filter-panel">
      ${_renderBusinessDomainFilter(businessDomains, selectedBusinessDomain)}
    </div>
    <div class="sb-header" data-section="process">
      <div class="sb-header-main">
        <span class="sb-header-title">业务统计</span>
        ${_renderSbMetrics(sidebarStats)}
      </div>
    </div>
    <div class="sb-directory-stack">
      ${renderStageDirectory()}
      ${renderComponentDirectory()}
    </div>
  </div>`;

  document.getElementById('sidebar-content').innerHTML=h;
  bindSidebarProcessContextMenu();
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Tab Bar
═══════════════════════════════════════════════════════════ */
function renderTabBar() {
  const tabs=[
    {id:'domain', label:'业务域'},
    {id:'process',label:'流程'},
    {id:'data',   label:'数据'},
    {id:'preview',label:'预览'},
  ];
  const canGoBack = canGoBackNavigation();
  const backTitle = esc(getBackNavigationTitle());
  const tabHtml = tabs.map(t=>{
    const onclick = t.id === 'process' ? 'openProcessHome()' : `navigate('${t.id}',{})`;
    const disabled = S.isPreviewRendering ? 'disabled' : '';
    return `<button class="tab-btn ${S.ui.tab===t.id?'active':''}" data-testid="tab-${t.id}"
      onclick="${onclick}" ${disabled}>${t.label}</button>`;
  }).join('');
  document.getElementById('tab-bar').innerHTML = `
    <div class="tab-btn-group">${tabHtml}</div>
    <button class="tab-btn tab-back-btn" data-testid="nav-back-button"
      onclick="goBackNavigation()" title="${backTitle}" ${canGoBack ? '' : 'disabled'}>
      ← 返回
    </button>`;
}

/* ═══════════════════════════════════════════════════════════
   CARD MAP — 流程地图拖拽
═══════════════════════════════════════════════════════════ */

function startDrawerResize(e) {
  e.preventDefault(); e.stopPropagation();
  const drawer = e.currentTarget.closest('.proc-drawer, .entity-drawer, .state-editor-drawer, .stage-drawer');
  if(!drawer) return;
  const drawerKind = drawer.classList.contains('entity-drawer') || drawer.classList.contains('state-editor-drawer')
    ? 'entity'
    : 'process';
  const startX = e.clientX;
  const startW = drawer.offsetWidth;
  const minWidth = drawerKind === 'entity' ? 420 : 300;
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  function onMove(ev) {
    const newW = Math.max(minWidth, Math.min(window.innerWidth * 0.75, startW + startX - ev.clientX));
    drawer.style.width = newW + 'px';
    setDrawerWidth(drawerKind, newW);
    if (drawerKind === 'entity' && S.ui.tab === 'data' && (S.ui.dataView || 'relation') === 'relation') {
      const wrap = document.getElementById('diagram-wrap');
      if (wrap) wrap.style.marginRight = newW + 'px';
    } else if (drawer.classList.contains('state-editor-drawer')) {
      const mainShell = document.querySelector('.entity-state-main-shell');
      if (mainShell) mainShell.style.marginRight = newW + 'px';
    } else if (drawer.classList.contains('stage-drawer')) {
      const mainShell = document.querySelector('.stage-main-shell');
      if (mainShell) mainShell.style.marginRight = newW + 'px';
    } else if (drawer.classList.contains('proc-drawer')) {
      const flowView = document.querySelector('.process-flow-view');
      if (flowView) flowView.style.marginRight = newW + 'px';
      if (typeof renderProcDiagramNow === 'function') {
        window.clearTimeout(startDrawerResize._processResizeTimer);
        startDrawerResize._processResizeTimer = window.setTimeout(() => renderProcDiagramNow(), 60);
      }
    }
  }
  function onUp() {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (drawer.classList.contains('proc-drawer') && typeof renderProcDiagramNow === 'function') {
      window.clearTimeout(startDrawerResize._processResizeTimer);
      renderProcDiagramNow();
    }
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
