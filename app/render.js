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
    S.ui.procId = S.doc.processes[0].id;
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
  getBusinessConstructItems(doc).forEach((construct) => { c[`construct-${construct.id || construct.name}`] = true; });
  [...new Set((doc.entities||[]).map(e => e.group || '').filter(Boolean))]
    .forEach((grp) => { c[`grp-${grp}`] = true; });
  processes.forEach(p => { c[`proc-${p.id}`] = true; });
  return c;
}


function render() {
  renderToolbar();
  const manualMode = S.ui.tab === 'manual';
  document.body.classList.toggle('manual-shell', manualMode);
  if (manualMode) {
    document.getElementById('tab-bar').innerHTML = '';
    if (typeof renderManualTab === 'function') renderManualTab();
    if (typeof bootManualTab === 'function') void bootManualTab();
    return;
  }
  renderTabBar();
  if(!S.doc){renderNoDoc();return;}
  renderSidebar();
  const t=S.ui.tab;
  if     (t==='domain') renderDomainTab();
  else if(t==='process') renderProcessTab();
  else if(t==='data')   renderDataTab();
  else if(t==='preview') renderPreviewTab();
  /* 渲染完成后初始化所有 auto-resize textarea 高度 */
  setTimeout(initAutoResize, 0);
}

function renderToolbar() {
  const name = getCurrentDocumentLabel();
  document.getElementById('file-name').textContent = name;
  document.getElementById('file-name').title = getCurrentDocumentTitle();
  document.getElementById('modified-badge')?.classList.toggle('hidden', !S.modified);
  document.getElementById('save-alert')?.classList.toggle('hidden', !S.modified);
  document.getElementById('toolbar-manual-button')?.classList.toggle('active', S.ui.tab === 'manual');
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
    proc.stageId,
    proc.primaryStageId,
    ...(Array.isArray(proc.stageIds) ? proc.stageIds : []),
  ].filter(Boolean));
  const refs = getStageFlowRefs(doc).filter((ref) => ref.processId === proc.id || ref.flowId === proc.id);
  refs.forEach((ref) => {
    if (ref.stageId) stageIds.add(ref.stageId);
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
    [construct.id, construct.name].filter(Boolean).forEach((key) => entries.push([String(key), construct]));
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
    addCapability(construct.businessComponentId || construct.businessComponent);
  };
  const addTaskDefinition = (idOrName) => {
    const task = taskById.get(String(idOrName || '').trim());
    if (!task) return;
    addCapability(task.businessComponentId || task.businessComponent);
    addConstruct(task.constructId || task.constructName);
  };

  (Array.isArray(proc.businessComponentIds) ? proc.businessComponentIds : []).forEach(addCapability);
  (Array.isArray(proc.businessConstructIds) ? proc.businessConstructIds : []).forEach(addConstruct);
  addConstruct(proc.businessConstructId);
  getProcNodes(proc).forEach((node) => {
    addCapability(node.businessComponentId || node.businessComponent);
    addConstruct(node.constructId || node.businessConstructId || node.constructName);
    addTaskDefinition(node.taskDefinitionId || node.taskDefinitionName);
    getNodeOrchestrationTasks(node).forEach((task) => {
      addCapability(task.businessComponentId || task.businessComponent);
      addConstruct(task.constructId || task.businessConstructId || task.constructName);
      addTaskDefinition(task.taskDefinitionId || task.taskDefinitionName);
    });
    (Array.isArray(node.entity_ops) ? node.entity_ops : []).forEach((op) => {
      const entity = (doc.entities || []).find((item) => item.id === op.entity_id || item.name === op.entity_id);
      addConstruct(entity?.businessConstructId);
      (Array.isArray(entity?.businessConstructIds) ? entity.businessConstructIds : []).forEach(addConstruct);
    });
    (Array.isArray(node.forms) ? node.forms : []).forEach((form) => {
      const entity = (doc.entities || []).find((item) => item.id === form.entity_id || item.name === form.entity_id);
      addConstruct(entity?.businessConstructId);
      (Array.isArray(entity?.businessConstructIds) ? entity.businessConstructIds : []).forEach(addConstruct);
    });
  });
  if (!names.size && proc.subDomain) addCapability(proc.subDomain);
  return [...names].filter(Boolean);
}

function _renderSbProc(p, options = {}) {
  const procActive=S.ui.tab==='process'&&S.ui.procId===p.id&&!S.ui.taskId;
  const taskCount=getProcNodes(p).length;
  const tags = [];
  if (options.showCapability) {
    const capabilityNames = getProcessCapabilityNames(p);
    if (capabilityNames.length) {
      const visibleNames = capabilityNames.slice(0, 2).join('、');
      tags.push(capabilityNames.length > 2 ? `组件：${visibleNames} 等${capabilityNames.length}个` : `组件：${visibleNames}`);
    }
  }
  if (options.showStage) _getProcessStageNames(p).slice(0, 2).forEach((name) => tags.push(`阶段：${name}`));
  return `<div class="sb-proc-head ${procActive?'active':''}" data-process-id="${esc(p.id)}"
    onclick="navigate('process',{procId:'${p.id}',taskId:null})">
    <span class="sb-proc-kind">流程</span>
    <span class="sb-proc-main">
      <span class="sb-name" title="${esc(p.name||'未命名')}">${esc(p.name||'未命名')}</span>
      ${tags.length ? `<span class="sb-proc-tags">${tags.map((tag) => `<span class="sb-proc-tag">${esc(tag)}</span>`).join('')}</span>` : ''}
    </span>
    ${_renderSbCount(taskCount)}
    <span class="sb-move-btns">
      <button class="sb-move-btn sb-move-up" onclick="moveProcInSd('${esc(p.id)}',-1,event)" title="\u4e0a\u79fb" aria-label="\u4e0a\u79fb"></button>
      <button class="sb-move-btn sb-move-down" onclick="moveProcInSd('${esc(p.id)}',1,event)" title="\u4e0b\u79fb" aria-label="\u4e0b\u79fb"></button>
    </span>
  </div>`;
}

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
  (Array.isArray(doc?.valueStreams) ? doc.valueStreams : []).forEach((stream) => {
    const id = String(stream.id || stream.name || '').trim();
    if (!id) return;
    byId.set(id, { id, name: stream.name || id, scope: stream.scope || '' });
  });
  (doc?.panorama?.columns || []).forEach((column) => {
    const id = String(column.uid || column.id || column.name || '').trim();
    if (!id || byId.has(id)) return;
    byId.set(id, { id, name: column.name || id, scope: column.note || '' });
  });
  getStageItems(doc).filter((stage) => !stage.virtual).forEach((stage) => {
    const id = String(stage.valueStreamUid || stage.panoramaColumnUid || stage.valueStream || '未归类价值流');
    if (!byId.has(id)) byId.set(id, { id, name: stage.valueStream || id, scope: '' });
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
    entityIds: Array.isArray(capability.entityIds) ? capability.entityIds : [],
    taskDefinitionIds: Array.isArray(capability.taskDefinitionIds) ? capability.taskDefinitionIds : [],
    constructIds: Array.isArray(capability.constructIds) ? capability.constructIds : [],
  }));
}

function getBusinessConstructItems(doc = S.doc) {
  const explicit = Array.isArray(doc?.businessConstructs) ? doc.businessConstructs : [];
  return explicit.map((construct) => ({
    ...construct,
    id: construct.id || construct.name,
    name: construct.name || construct.id || '未命名业务构件',
    entityIds: Array.isArray(construct.entityIds) ? construct.entityIds : [],
    taskDefinitionIds: Array.isArray(construct.taskDefinitionIds) ? construct.taskDefinitionIds : [],
    relatedProcessIds: Array.isArray(construct.relatedProcessIds) ? construct.relatedProcessIds : [],
  }));
}

function getTaskDefinitionItems(doc = S.doc) {
  const explicit = Array.isArray(doc?.taskDefinitions) ? doc.taskDefinitions : [];
  return explicit.map((task) => ({
    ...task,
    id: task.id || task.name,
    name: task.name || task.id || '未命名任务定义',
    entityIds: Array.isArray(task.entityIds) ? task.entityIds : [],
    processIds: Array.isArray(task.processIds) ? task.processIds : [],
    usedBy: Array.isArray(task.usedBy) ? task.usedBy : [],
  }));
}

function getCapabilityConstructs(capability, doc = S.doc) {
  const constructIds = new Set(Array.isArray(capability?.constructIds) ? capability.constructIds : []);
  return getBusinessConstructItems(doc).filter((construct) => (
    constructIds.has(construct.id)
    || construct.businessComponentId === capability?.id
    || construct.businessComponent === capability?.name
  ));
}

function getConstructProcesses(construct, doc = S.doc) {
  const relatedIds = new Set([
    ...(Array.isArray(construct?.relatedProcessIds) ? construct.relatedProcessIds : []),
    ...(Array.isArray(construct?.processIds) ? construct.processIds : []),
  ].filter(Boolean));
  const taskIds = new Set(getConstructTaskDefinitions(construct, doc).map((task) => task.id));
  return (doc?.processes || []).filter((proc) => (
    relatedIds.has(proc.id)
    || (Array.isArray(proc.businessConstructIds) && proc.businessConstructIds.includes(construct.id))
    || proc.businessConstructId === construct.id
    || getProcNodes(proc).some((node) => getNodeOrchestrationTasks(node)
      .some((task) => taskIds.has(task.taskDefinitionId)))
  ));
}

function getConstructEntities(construct, doc = S.doc) {
  const entityIds = new Set(Array.isArray(construct?.entityIds) ? construct.entityIds : []);
  return (doc?.entities || []).filter((entity) => (
    entityIds.has(entity.id)
    || entity.businessConstructId === construct?.id
    || (Array.isArray(entity.businessConstructIds) && entity.businessConstructIds.includes(construct?.id))
  ));
}

function getConstructTaskDefinitions(construct, doc = S.doc) {
  const taskIds = new Set(Array.isArray(construct?.taskDefinitionIds) ? construct.taskDefinitionIds : []);
  return getTaskDefinitionItems(doc).filter((task) => (
    taskIds.has(task.id)
    || task.constructId === construct?.id
    || (Array.isArray(task.constructIds) && task.constructIds.includes(construct?.id))
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
        if (item.taskDefinitionId !== taskDefinition?.id) return;
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
    const proc = processMap.get(usage.processId);
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
  const explicitTaskIds = new Set(Array.isArray(capability?.taskDefinitionIds) ? capability.taskDefinitionIds : []);
  getTaskDefinitionItems(doc)
    .filter((task) => (
      explicitTaskIds.has(task.id)
      || task.businessComponentId === capability?.id
      || task.businessComponent === capability?.name
    ))
    .forEach((task) => {
      getTaskDefinitionSources(task, doc).forEach((source) => {
        if (source.procId) taskProcessIds.add(source.procId);
      });
    });
  const matchedProcesses = (doc?.processes || []).filter((proc) => (
    relatedIds.has(proc.id)
    || (Array.isArray(proc.businessComponentIds) && proc.businessComponentIds.includes(capability.id))
    || taskProcessIds.has(proc.id)
  ));
  const domainValues = _itemBusinessDomainValues(capability);
  if (!domainValues.length) return matchedProcesses;
  return matchedProcesses.filter((proc) => domainValues.some((domainId) => itemMatchesBusinessDomain(proc, domainId, doc)));
}

function getCapabilityEntities(capability, doc = S.doc) {
  const entityIds = new Set(Array.isArray(capability?.entityIds) ? capability.entityIds : []);
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
    .filter((service) => service.businessComponentId === capability.id || service.businessComponent === capability.name)
    .map((service) => service.name || service.id);
  return [...new Set([...explicitNames, ...serviceNames, ...fromDoc].filter(Boolean))];
}

function getCapabilityTaskAssets(capability, doc = S.doc, processScope = null) {
  const explicitTaskIds = new Set(Array.isArray(capability?.taskDefinitionIds) ? capability.taskDefinitionIds : []);
  const taskDefinitions = getTaskDefinitionItems(doc).filter((task) => (
    explicitTaskIds.has(task.id)
    || task.businessComponentId === capability?.id
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
      || capabilityKeys.has(String(construct.businessComponentId || ''))
      || capabilityKeys.has(String(construct.businessComponent || ''));
  });
  const constructIds = new Set(constructItems.map((construct) => construct.id).filter(Boolean));
  const filteredProcIds = new Set(filteredProcs.map((proc) => proc.id));
  const entityItems = (S.doc.entities || []).filter((entity) => {
    if (selectedBusinessDomain === 'all') return true;
    return itemMatchesBusinessDomain(entity, selectedBusinessDomain, S.doc)
      || constructIds.has(entity.businessConstructId)
      || (Array.isArray(entity.businessConstructIds) && entity.businessConstructIds.some((id) => constructIds.has(id)));
  });
  const taskItems = getTaskDefinitionItems(S.doc).filter((task) => {
    if (selectedBusinessDomain === 'all') return true;
    if (itemMatchesBusinessDomain(task, selectedBusinessDomain, S.doc)) return true;
    if (capabilityKeys.has(String(task.businessComponentId || '')) || capabilityKeys.has(String(task.businessComponent || ''))) return true;
    if (constructIds.has(task.constructId)) return true;
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
      const canOpen = canOpenNode || canOpenProcess;
      const onclick = canOpenNode
        ? ` onclick="openBusinessAsset('${esc(asset.kind)}','${esc(source.procId)}','${esc(source.taskId)}','${esc(source.index ?? '')}','${esc(source.formId || '')}','${esc(source.sectionId || '')}')"`
        : canOpenProcess
          ? ` onclick="navigate('process',{procId:'${esc(source.procId)}'})"`
        : '';
      return `<button type="button" class="sb-asset-item sb-asset-link ${canOpen ? '' : 'disabled'}"
        data-testid="${esc(testId)}" title="${esc(sourceTitle)}"${onclick} ${canOpen ? '' : 'disabled'}>
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
        for (const p of stageProcesses) {
          out += _renderSbProc(p, { showCapability: true });
        }
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
      for (const p of stageProcesses) {
        out += _renderSbProc(p, { showCapability: true });
      }
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
          const constructKey = `construct-${construct.id || construct.name}`;
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
          out += _renderCapabilitySection('实体', constructEntities, { entity: true });
          out += _renderCapabilityAssetSection('任务定义', constructTasks, { testId: 'construct-task-asset', limit: Infinity });
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

      out += _renderCapabilitySection('实体', capEntities, { entity: true });
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
