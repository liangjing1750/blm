'use strict';

window.PanoramaWorkbench = {
  minZoom: 0.45,
  maxZoom: 1.6,

  switchTab(tabId) {
    S.ui.domainTab = tabId;
    this.render();
  },

  setCapabilitySelection(capabilityId) {
    S.ui.panoramaCapabilityId = S.ui.panoramaCapabilityId === capabilityId ? '' : capabilityId;
    this.render();
  },

  getZoom() {
    const zoom = Number(S.ui.panoramaZoom);
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  },

  setZoom(zoom, options = {}) {
    const nextZoom = Math.max(this.minZoom, Math.min(this.maxZoom, Number(zoom) || 1));
    S.ui.panoramaZoom = nextZoom;
    S.ui.panoramaZoomTouched = options.touched !== false;
    this.applyZoom();
  },

  applyZoom() {
    const viewport = document.querySelector('.panorama-zoom-viewport');
    const canvas = document.querySelector('.panorama-zoom-canvas');
    if (!viewport || !canvas) return;
    const zoom = this.getZoom();
    canvas.style.transform = `scale(${zoom})`;
    const scaledWidth = Math.ceil(canvas.offsetWidth * zoom);
    const scaledHeight = Math.ceil(canvas.offsetHeight * zoom);
    viewport.style.height = `${scaledHeight}px`;
    viewport.style.overflowX = scaledWidth > viewport.clientWidth + 2 ? 'auto' : 'hidden';
    viewport.style.overflowY = 'hidden';
  },

  fitZoom() {
    const viewport = document.querySelector('.panorama-zoom-viewport');
    const canvas = document.querySelector('.panorama-zoom-canvas');
    if (!viewport || !canvas) return;
    canvas.style.transform = 'scale(1)';
    const availableWidth = Math.max(1, viewport.clientWidth - 4);
    const availableHeight = Math.max(1, window.innerHeight - viewport.getBoundingClientRect().top - 28);
    const widthZoom = availableWidth / Math.max(1, canvas.offsetWidth);
    const heightZoom = availableHeight / Math.max(1, canvas.offsetHeight);
    const nextZoom = Math.max(this.minZoom, Math.min(1, widthZoom, heightZoom));
    S.ui.panoramaZoom = nextZoom;
    S.ui.panoramaZoomTouched = false;
    this.applyZoom();
  },

  onWheel(event) {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    this.setZoom(this.getZoom() + direction * 0.08, { touched: true });
  },

  renderMap(selectedDomainId = 'all') {
    const model = PanoramaModel.build(selectedDomainId);
    const getStageProcessCount = (stage) => {
      const stageId = String(stage.id || stage.uid || '');
      return typeof getStageProcesses === 'function' ? getStageProcesses(stageId, S.doc).length : 0;
    };
    const renderStageCell = (stage) => {
      const active = model.activeStageIds.has(stage.id) || model.activeStageIds.has(stage.uid);
      return `<button class="panorama-stage-cell ${active ? 'is-supported' : ''}" type="button" data-testid="panorama-stage-cell" onclick="AppActions.openStage('${esc(jsString(stage.id || stage.uid || ''))}')">
        <span class="panorama-stage-name">${esc(stage.name || stage.id || '')}</span>
        <span class="panorama-stage-count">流程 ${getStageProcessCount(stage)}</span>
      </button>`;
    };
    const renderMatrixCell = (domain, stream) => {
      const cellStages = model.stages.filter((stage) => {
        if (getStageValueStreamId(stage) !== stream.id) return false;
        if (!domain.id || domain.id === 'all') return true;
        return itemMatchesBusinessDomain(stage, domain.id, S.doc);
      });
      return `<div class="panorama-matrix-cell" data-testid="panorama-matrix-cell">
        ${cellStages.length ? `<div class="panorama-stage-lane">${cellStages.map(renderStageCell).join('')}</div>` : '<span class="panorama-empty-cell">-</span>'}
      </div>`;
    };
    const renderCapabilityNode = (capability) => {
      const capabilityId = String(capability.id || capability.name || '');
      const active = capabilityId && capabilityId === model.activeCapabilityId;
      const constructNames = (capability.constructs || []).slice(0, 4);
      return `<button class="panorama-capability-node ${capability.kind} ${active ? 'is-active' : ''}" type="button" data-testid="panorama-capability-node" onclick="PanoramaWorkbench.setCapabilitySelection('${esc(jsString(capabilityId))}')">
        <strong>${esc(capability.name || capabilityId)}</strong>
        <span class="panorama-capability-constructs">
          ${constructNames.length
            ? constructNames.map((construct) => `<em>${esc(construct.name)}</em>`).join('')
            : '<em>暂无构件</em>'}
        </span>
      </button>`;
    };
    const coreCapabilities = model.capabilities.filter((capability) => capability.kind === 'core');
    const genericCapabilities = model.capabilities.filter((capability) => capability.kind !== 'core');

    return `<div class="panorama-business-map" data-testid="panorama-business-map">
      <div class="panorama-zoom-viewport" onwheel="PanoramaWorkbench.onWheel(event)">
        <div class="panorama-zoom-canvas">
          <div class="panorama-map-row panorama-map-header panorama-layer-strategy" data-testid="panorama-strategy-card">
            <div class="panorama-strategy-flow">
              <div class="panorama-strategy-pill">企业愿景 / 价值观</div>
              <span class="panorama-strategy-arrow">↓</span>
              <div class="panorama-strategy-pill primary">企业战略</div>
            </div>
            <div class="panorama-map-actions">
              <button class="stage-quick-btn stage-quick-btn-text" type="button" onclick="PanoramaWorkbench.setZoom(PanoramaWorkbench.getZoom()-0.1)">缩小</button>
              <button class="stage-quick-btn stage-quick-btn-text" type="button" onclick="PanoramaWorkbench.fitZoom()">自适应</button>
              <button class="stage-quick-btn stage-quick-btn-text" type="button" onclick="PanoramaWorkbench.setZoom(PanoramaWorkbench.getZoom()+0.1)">放大</button>
            </div>
          </div>
          <div class="panorama-map-row panorama-layer-matrix" data-testid="panorama-value-matrix-card">
            ${model.valueStreams.length ? `<div class="panorama-matrix-frame">
              <div class="panorama-matrix" style="grid-template-columns: 128px repeat(${model.valueStreams.length}, minmax(290px, 1fr));">
                <div class="panorama-matrix-corner">
                  <span class="panorama-corner-axis">
                    <span class="panorama-corner-domain">业务域</span>
                    <span class="panorama-corner-slash"></span>
                    <span class="panorama-corner-stream">价值流</span>
                  </span>
                </div>
                ${model.valueStreams.map((stream) => `<div class="panorama-matrix-head">${esc(stream.name || stream.id)}</div>`).join('')}
                ${model.domains.map((domain) => `<div class="panorama-matrix-domain">${esc(domain.name || domain.id)}</div>
                  ${model.valueStreams.map((stream) => renderMatrixCell(domain, stream)).join('')}`).join('')}
              </div>
            </div>` : BLMShared.ui.empty('暂无价值与业务域矩阵数据。')}
          </div>
          <div class="panorama-map-row panorama-layer-capability" data-testid="panorama-capability-layer">
            ${model.capabilities.length ? `<div class="panorama-capability-groups">
              <div class="panorama-capability-group core">
                <span class="panorama-capability-group-label">核心</span>
                <div class="panorama-capability-strip">${coreCapabilities.length ? coreCapabilities.map(renderCapabilityNode).join('') : '<span class="panorama-capability-empty">暂无核心组件</span>'}</div>
              </div>
              <div class="panorama-capability-group generic">
                <span class="panorama-capability-group-label">通用</span>
                <div class="panorama-capability-strip">${genericCapabilities.length ? genericCapabilities.map(renderCapabilityNode).join('') : '<span class="panorama-capability-empty">暂无通用组件</span>'}</div>
              </div>
            </div>` : BLMShared.ui.empty('暂无业务能力组件数据。')}
          </div>
        </div>
      </div>
    </div>`;
  },

  render(options = {}) {
    ensureProcPos(S.doc);
    const context = getSelectedDomainInfoContext();
    const activeDomainTab = S.ui.domainTab || 'panorama';
    const tabs = [
      { id: 'panorama', label: '全景视图' },
      { id: 'roles', label: '角色管理' },
      { id: 'language', label: '统一语言' },
      { id: 'rules', label: '规则条目' },
    ];
    let html = `<div class="domain-scroll" data-testid="domain-scroll">
      ${BLMShared.ui.renderSubTabs(tabs, activeDomainTab, 'switchDomainTab', 'domain-subtab')}`;
    if (activeDomainTab === 'panorama') {
      html += `<div class="ctx-card domain-panel domain-info-card">
        <div class="domain-panel-body domain-info-card-body">${this.renderMap(context.id)}</div>
      </div>`;
    } else if (window.KnowledgeWorkbench) {
      html += window.KnowledgeWorkbench.render(activeDomainTab, context.id);
    }
    html += '</div>';
    html += renderBusinessModelDialog();
    BLMCore.dom.setHtml('tab-content', html);
    initAutoResize();
    BLMCore.dom.restoreScroll('.domain-scroll', options.scrollTop);
    requestAnimationFrame(() => {
      if (S.ui.panoramaZoomTouched) this.applyZoom();
      else this.fitZoom();
    });
  },
};

function renderPanoramaValueMatrix(selectedDomainId = 'all') {
  return window.PanoramaWorkbench.renderMap(selectedDomainId);
}

function setPanoramaCapabilitySelection(capabilityId) {
  return window.PanoramaWorkbench.setCapabilitySelection(capabilityId);
}
