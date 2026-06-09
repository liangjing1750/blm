'use strict';

function renderBlmMd(md) {
  /* 先把 mermaid 块抽出来 */
  const diagrams = [];
  const src = md.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    diagrams.push(code.trim());
    return `\x00MERMAID:${diagrams.length - 1}\x00`;
  });

  const lines = src.split('\n');
  let html = '';
  let i = 0;

  function inlineEsc(s) {
    return s
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/`([^`]+)`/g,'<code>$1</code>');
  }

  while(i < lines.length) {
    const line = lines[i];

    /* mermaid 占位 */
    if(line.startsWith('\x00MERMAID:')) {
      const idx = parseInt(line.slice(9));
      html += `<div class="md-mermaid" data-idx="${idx}"></div>`;
      i++; continue;
    }

    /* 标题 */
    if(line.startsWith('#### ')) { html += `<h4>${inlineEsc(line.slice(5))}</h4>`; i++; continue; }
    if(line.startsWith('### '))  { html += `<h3>${inlineEsc(line.slice(4))}</h3>`; i++; continue; }
    if(line.startsWith('## '))   { html += `<h2>${inlineEsc(line.slice(3))}</h2>`; i++; continue; }
    if(line.startsWith('# '))    { html += `<h1>${inlineEsc(line.slice(2))}</h1>`; i++; continue; }

    /* 分隔线 */
    if(line.trim() === '---') { html += '<hr>'; i++; continue; }

    /* 表格：连续的 | 行 */
    if(line.trim().startsWith('|')) {
      const rows = [];
      while(i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i]); i++;
      }
      /* 过滤掉分隔行（|---|---| 类型） */
      const dataRows = rows.filter(r => !/^\s*\|[\s\-|:]+\|\s*$/.test(r));
      if(dataRows.length) {
        html += '<table>';
        dataRows.forEach((row, ri) => {
          const cells = row.trim().replace(/^\||\|$/g,'').split('|');
          const tag   = ri === 0 ? 'th' : 'td';
          html += '<tr>' + cells.map(c=>`<${tag}>${inlineEsc(c.trim())}</${tag}>`).join('') + '</tr>';
        });
        html += '</table>';
      }
      continue;
    }

    /* 空行 */
    if(line.trim() === '') { i++; continue; }

    /* 普通段落（含 **bold** 内联） */
    let para = '';
    while(i < lines.length && lines[i].trim() !== '' &&
          !lines[i].startsWith('#') && !lines[i].startsWith('|') &&
          lines[i].trim() !== '---' && !lines[i].startsWith('\x00MERMAID:')) {
      if(para) para += ' ';
      para += lines[i]; i++;
    }
    if(para) html += `<p>${inlineEsc(para)}</p>`;
  }

  return { html, diagrams };
}

function getRoleDesc(role) {
  return typeof role === 'object' && role ? String(role.desc || '').trim() : '';
}

function getRoleGroup(role) {
  return typeof role === 'object' && role ? String(role.group || '').trim() : '';
}

function getRoleSubDomains(role) {
  return typeof role === 'object' && role
    ? (role.subDomains || []).map((item) => String(item || '').trim()).filter(Boolean).join('、')
    : '';
}


/* ═══════════════════════════════════════════════════════════
   RENDER — Preview Tab
═══════════════════════════════════════════════════════════ */
function previewAnchorId(prefix, value) {
  return `preview-${prefix}-${String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'}`;
}

function previewItemUid(item) {
  return String(item?.uid || item?.id || '').trim();
}

function previewDisplayName(item, fallback) {
  return String(item?.name || '').trim() || fallback;
}

function previewRichTextHtml(value) {
  if (typeof renderRichTextValue === 'function') {
    return renderRichTextValue(value);
  }
  return esc(value || '').replace(/\r?\n/g, '<br>');
}

function previewRichTextCell(value) {
  return `<div class="rich-text-rendered pv-rich-text">${previewRichTextHtml(value)}</div>`;
}

function previewSafeId(value, fallback = 'section') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-') || fallback;
}

let previewLazyObserver = null;

function previewLazySectionHtml(anchorId, kind, title, index = '') {
  return `<section id="${esc(anchorId)}" class="pv-lazy-section" data-preview-lazy="${esc(kind)}" data-preview-index="${esc(index)}" data-preview-loaded="false">
    <h3>${esc(title)}</h3>
    <div class="pv-lazy-placeholder">
      <span>滚动到这里或点击大纲后生成内容</span>
      <button class="btn btn-outline btn-sm" type="button" onclick="ensurePreviewSection('${esc(anchorId)}')">生成</button>
    </div>
  </section>`;
}

function previewManualLazySectionHtml(anchorId, kind, title) {
  return `<section id="${esc(anchorId)}" class="pv-lazy-section" data-preview-lazy="${esc(kind)}" data-preview-manual="true" data-preview-loaded="false">
    <h3>${esc(title)}</h3>
    <div class="pv-lazy-placeholder">
      <span>内容较重，需要时再生成。</span>
      <button class="btn btn-outline btn-sm" type="button" onclick="ensurePreviewSection('${esc(anchorId)}')">生成</button>
    </div>
  </section>`;
}

function buildPreviewOutlineItems(doc) {
  const items = [{ id: 'preview-top', label: doc?.meta?.title || doc?.meta?.domain || '文档概览', depth: 0 }];
  if ((doc?.roles || []).length) items.push({ id: 'preview-roles', label: '角色', depth: 0 });
  if ((doc?.language || []).length) items.push({ id: 'preview-language', label: '统一语言/术语表', depth: 0 });
  if (getStageItems(doc).length) {
    items.push({ id: 'preview-stages', label: '全景与阶段视图', depth: 0 });
    items.push({ id: 'preview-stage-panorama', label: '全景视图', depth: 1 });
    getStageItems(doc).forEach((stage) => {
      items.push({
        id: previewAnchorId('stage', previewItemUid(stage) || stage.name || 'stage'),
        label: `阶段视图 · ${previewDisplayName(stage, '未命名业务阶段')}`,
        depth: 1,
      });
    });
  }
  if ((doc?.processes || []).length) {
    items.push({ id: 'preview-processes', label: '流程视图', depth: 0 });
    (doc.processes || []).forEach((proc) => {
      items.push({
        id: previewAnchorId('proc', previewItemUid(proc) || proc.name || 'process'),
        label: previewDisplayName(proc, '未命名流程'),
        depth: 1,
      });
    });
  }
  if ((doc?.entities || []).length) {
    items.push({ id: 'preview-entities', label: '数据建模', depth: 0 });
    (doc.entities || []).forEach((entity) => {
      items.push({
        id: previewAnchorId('entity', previewItemUid(entity) || entity.name || 'entity'),
        label: previewDisplayName(entity, '未命名实体'),
        depth: 1,
      });
    });
  }
  return items;
}

function renderPreviewOutline(doc) {
  const container = document.getElementById('preview-outline');
  if (!container) return;
  const items = buildPreviewOutlineItems(doc);
  container.innerHTML = `
    <div class="preview-outline-title">大纲视图</div>
    <div class="preview-outline-list">
      ${items.map((item) => `
        <button class="preview-outline-link depth-${item.depth}" onclick="previewJumpTo('${esc(item.id)}')">
          ${esc(item.label)}
        </button>`).join('')}
    </div>`;
}

function previewJumpTo(anchorId) {
  ensurePreviewSection(anchorId);
  const target = document.getElementById(anchorId);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPreviewTab() {
  document.getElementById('tab-content').innerHTML = `
    <div class="preview-wrap">
      <div class="preview-topbar">
        <button class="btn btn-outline btn-sm" data-testid="preview-export-bundle" onclick="App.cmdExport()">↓ 导出</button>
        <button id="preview-raw-toggle" class="btn btn-ghost-sm" style="margin-left:auto" onclick="togglePreviewRaw()">显示原文 MD</button>
      </div>
      <div id="preview-body" class="preview-body">
        <aside id="preview-outline" class="preview-outline"></aside>
        <div id="preview-rendered" class="preview-rendered pv-content"></div>
      </div>
      <pre id="preview-raw" class="preview-md hidden"></pre>
    </div>`;

  if(!S.doc) return;
  renderPreviewOutline(S.doc);
  buildHtmlPreview();
}

function buildPreviewMetaLine(meta) {
  const parts = [];
  if (meta?.domain) parts.push(`<strong>业务域</strong>: ${esc(meta.domain)}`);
  if (meta?.author) parts.push(`<strong>作者</strong>: ${esc(meta.author)}`);
  if (meta?.date) parts.push(`<strong>日期</strong>: ${esc(meta.date)}`);
  return parts.length ? `<p class="pv-meta">${parts.join(' | ')}</p>` : '';
}

function renderPreviewRoleUsecaseHtml(roles) {
  if (!roles.length || typeof buildRoleUsecaseMap !== 'function') return '';
  return `<div class="pv-role-usecase-section" data-testid="preview-role-usecase-section">
    <h3>角色用例图</h3>
    <div class="pv-role-usecase-item">
      <h4>全部角色</h4>
      ${buildRoleUsecaseMap(null, { readonly: true })}
    </div>
    ${roles.map((role) => `<div class="pv-role-usecase-item" data-testid="preview-role-usecase-item">
      <h4>${esc(getRoleName(role))} 用例图</h4>
      ${buildRoleUsecaseMap(role, { participatingOnly: true, readonly: true })}
    </div>`).join('')}
  </div>`;
}

function renderPreviewRolesHtml(roles) {
  if (!roles.length) return '';
  return `<h2 id="preview-roles">角色</h2>
    <table><thead><tr><th>角色</th><th>分组</th><th>说明</th><th>所属业务组件</th></tr></thead><tbody>
      ${roles.map((role) => `<tr>
        <td>${esc(getRoleName(role))}</td>
        <td>${esc(getRoleGroup(role))}</td>
        <td>${esc(getRoleDesc(role))}</td>
        <td>${esc(getRoleSubDomains(role))}</td>
      </tr>`).join('')}
    </tbody></table>
    ${previewManualLazySectionHtml('preview-role-usecases', 'role-usecases', '角色用例图')}`;
}

function renderPreviewLanguageHtml(languageItems) {
  if (!languageItems.length) return '';
  return `<h2 id="preview-language">统一语言/术语表</h2>
    <table><thead><tr><th>术语</th><th>定义</th></tr></thead><tbody>
      ${languageItems.map((item) => `<tr><td>${esc(item.term||'')}</td><td>${esc(item.definition||'')}</td></tr>`).join('')}
    </tbody></table>`;
}

function buildPreviewStagePanoramaData(doc) {
  const stageItems = getStageItems(doc);
  const stageIdSet = new Set(stageItems.map((stage) => stage.id));
  return {
    nodes: stageItems.map((stage) => ({
      id: stage.id,
      label: stage.name || stage.id,
      meta: `${getStageProcesses(stage.id, doc).length} 个流程`,
      _processCount: getStageProcesses(stage.id, doc).length,
      stage,
    })),
    links: getStageLinks(doc)
      .filter((link) => stageIdSet.has(link.fromStageId) && stageIdSet.has(link.toStageId))
      .map((link) => ({ from: link.fromStageId, to: link.toStageId })),
  };
}

function buildPreviewPanoramaCellGroups(doc, nodes) {
  const model = getPanoramaModel(doc);
  const linkedStageIds = new Set();
  getStageLinks(doc).forEach((link) => {
    linkedStageIds.add(link.fromStageId);
    linkedStageIds.add(link.toStageId);
  });
  const indexedNodes = nodes.map((node, index) => ({
    ...node,
    _valueStreamIndex: index,
    _linked: linkedStageIds.has(node.id),
    searchText: '',
  }));
  return { model, groups: groupStagesByPanoramaCell(indexedNodes, model, false) };
}

function renderPreviewMatrixStageList(stageNodes) {
  if (!stageNodes.length) return '';
  return `<div class="preview-matrix-stage-list">
    ${stageNodes.map((node) => {
      const flowCount = Math.max(0, Number(node._processCount || 0) || 0);
      return `<span class="preview-matrix-stage" data-flow-count="${flowCount}">
        <strong>${esc(node.label || '')}</strong>
        ${flowCount ? `<em>${flowCount} 个流程</em>` : ''}
      </span>`;
    }).join('')}
  </div>`;
}

function renderPreviewPanoramaMatrix(doc, panorama) {
  if (!panorama.nodes.length) return `<div class="diag-empty" data-testid="preview-stage-panorama-empty">暂无内容</div>`;
  const { model, groups } = buildPreviewPanoramaCellGroups(doc, panorama.nodes);
  const gridStyle = getValueStreamGridStyle(model, false);
  const minWidth = Math.max(960, 180 + model.columns.length * 220);
  return `<div class="stage-graph value-stream-graph preview-value-stream-graph" data-testid="preview-stage-panorama">
    <div class="value-stream-scroll">
      <div class="value-stream-matrix" style="min-width:${minWidth}px">
        <div class="value-stream-header-row" style="${gridStyle}">
          <div class="value-stream-axis">业务域 / 价值流</div>
          ${model.columns.map((column) => `<div class="value-stream-header" data-column-id="${esc(column.id)}">
            ${column.badge ? `<span class="value-stream-lane-badge">${esc(column.badge)}</span>` : ''}
            <strong>${esc(column.name || '')}</strong>
            ${column.scope ? `<span>${esc(column.scope)}</span>` : ''}
          </div>`).join('')}
        </div>
        <div class="value-stream-body">
          ${model.lanes.map((lane) => `<div class="value-stream-row" style="${gridStyle}">
            <div class="value-stream-lane">
              ${lane.badge ? `<span class="value-stream-lane-badge">${esc(lane.badge)}</span>` : ''}
              <strong>${esc(lane.name || '')}</strong>
              ${lane.note ? `<span>${esc(lane.note)}</span>` : ''}
            </div>
            ${model.columns.map((column) => {
              const cell = getPanoramaCell(model, lane.id, column.id);
              const stageNodes = groups.get(`${lane.id}::${column.id}`) || [];
              return `<div class="value-stream-cell${stageNodes.length ? ' has-stages' : ''}">
                ${cell.status ? `<div class="value-stream-cell-status">${esc(cell.status)}</div>` : ''}
                ${cell.text ? `<div class="value-stream-cell-text">${esc(cell.text)}</div>` : ''}
                ${renderPreviewMatrixStageList(stageNodes)}
              </div>`;
            }).join('')}
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

function buildPreviewStageDetailData(doc, stageItem) {
  const processRefs = getStageProcessRefs(stageItem.id, doc);
  const processes = processRefs.map((ref) => getStageRefProcess(ref, doc)).filter(Boolean);
  return {
    processes,
    processRefs,
    nodes: processRefs.map((ref) => {
      const proc = getStageRefProcess(ref, doc);
      return {
        id: ref.id,
        label: proc?.name || proc?.id || ref.processUid,
        meta: '',
        group: proc?.flowGroup || '',
        processUid: getProcessIdentity(proc) || ref.processUid,
      };
    }),
    links: getStageFlowLinks(doc)
      .filter((link) => link.stageUid === stageItem.id)
      .map((link) => ({ id: link.id, from: link.fromRefUid, to: link.toRefUid })),
  };
}

function renderPreviewStageGraphMarkup(nodes, links, kind = 'stage', testId = 'preview-stage-graph', options = {}) {
  if (kind === 'stage-ref' && typeof renderStageGraphMarkup === 'function') {
    return renderStageGraphMarkup({
      nodes,
      links,
      kind,
      testId,
      stageItem: options.stageItem || null,
      editing: false,
      processRefs: options.processRefs || [],
    });
  }
  if (!nodes.length) {
    return `<div class="diag-empty" data-testid="${testId}-empty">暂无内容</div>`;
  }
  const graph = buildStageGraphLayout(nodes, links, kind);
  return `<div class="stage-graph preview-stage-graph" data-testid="${testId}">
    <div class="stage-graph-zoom-shell" style="width:${graph.boardW}px;height:${graph.boardH}px">
      <div class="stage-graph-zoom-target" style="width:${graph.boardW}px;height:${graph.boardH}px">
        <div class="stage-graph-board" style="width:${graph.boardW}px;height:${graph.boardH}px">
          <svg class="stage-graph-svg" width="${graph.boardW}" height="${graph.boardH}" viewBox="0 0 ${graph.boardW} ${graph.boardH}" aria-hidden="true">
            <defs>
              <marker id="${testId}-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 z" fill="#64748b"></path>
              </marker>
            </defs>
            ${graph.links.map((link) => `<path class="stage-graph-link" d="${link.path}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${testId}-arrow)"></path>`).join('')}
          </svg>
          ${nodes.map((node) => {
            const pos = graph.positions[node.id];
            return `<div class="stage-graph-node ${kind==='stage'?'stage-kind':'process-kind'} preview-stage-node"
              style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px">
              <span class="stage-graph-node-title">${esc(node.label)}</span>
              ${node.meta ? `<span class="stage-graph-node-meta">${esc(node.meta)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

function renderPreviewStagePanoramaHtml(doc) {
  const stageItems = getStageItems(doc);
  if (!stageItems.length) return '';
  const panorama = buildPreviewStagePanoramaData(doc);
  return `<div class="pv-stage-section">
    <h3 id="preview-stage-panorama">全景视图</h3>
    ${renderPreviewPanoramaMatrix(doc, panorama)}
  </div>`;
}

function renderPreviewStageDetailHtml(doc, stageItem) {
  const detail = buildPreviewStageDetailData(doc, stageItem);
  const stageAnchor = previewAnchorId('stage', previewItemUid(stageItem) || stageItem.name || 'stage');
  const graphTestId = `preview-stage-detail-${previewSafeId(previewItemUid(stageItem) || stageItem.name || 'stage', 'stage')}`;
  return `<div class="pv-stage-section" id="${stageAnchor}">
    <h3>阶段视图: ${esc(previewDisplayName(stageItem, '未命名业务阶段'))}</h3>
    <p class="pv-note">
      <strong>所属业务域</strong>: ${esc(getStageBusinessDomainLabel(stageItem) || '—')}
      | <strong>流程数</strong>: ${detail.processes.length}
      ${stageItem.virtual ? ' | <strong>说明</strong>: 未设置业务阶段' : ''}
    </p>
    ${renderPreviewStageGraphMarkup(detail.nodes, detail.links, 'stage-ref', graphTestId, {
      stageItem,
      processRefs: detail.processRefs,
    })}
  </div>`;
}

function renderPreviewStagesHtml(doc) {
  const stageItems = getStageItems(doc);
  if (!stageItems.length) return '';
  return `<h2 id="preview-stages">全景与阶段视图</h2>
    ${previewLazySectionHtml('preview-stage-panorama', 'stage-panorama', '全景视图')}
    ${stageItems.map((stageItem, index) => {
      const stageAnchor = previewAnchorId('stage', previewItemUid(stageItem) || stageItem.name || 'stage');
      return previewLazySectionHtml(stageAnchor, 'stage', `阶段视图: ${previewDisplayName(stageItem, '未命名业务阶段')}`, index);
    }).join('')}`;
}

function formatPrototypeSummary(prototypeFiles) {
  return prototypeFiles
    .map((file) => {
      const versions = Array.isArray(file?.versions) ? file.versions : [];
      const currentVersion = versions.find((version) => version.uid === file?.versionUid) || versions[versions.length - 1] || null;
      const versionLabel = versions.length ? `（当前 v${currentVersion?.number || 1}，共${versions.length}版）` : '';
      const name = String(file?.name || '').trim();
      return name ? `${name}${versionLabel}` : '';
    })
    .filter(Boolean)
    .join('、');
}

function formatProcessStageSummary(proc, doc = S.doc) {
  const refs = getProcessStageRefs(proc?.id, doc);
  const names = refs
    .map((ref) => getStageDisplayName(ref.stageUid, doc))
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index);
  return names.join('、');
}

function renderPreviewTaskFormsHtml(forms, entityMap) {
  if (!forms.length) return '';
  return `<div class="pv-form-model">
    <h5>表单模型</h5>
    ${forms.map((form) => {
      const entityName = typeof getTaskFormEntitySummary === 'function'
        ? getTaskFormEntitySummary(form)
        : (form.entity_id ? (entityMap[form.entity_id]?.name || form.entity_id) : '不绑定实体');
      return `<div class="pv-form-card">
        <p class="pv-note"><strong>${esc(form.name || '未命名表单')}</strong> | <strong>关联实体</strong>: ${esc(entityName)}${form.purpose ? ` | <strong>用途</strong>: ${esc(form.purpose)}` : ''}</p>
        ${(form.sections || []).map((section) => {
          const sectionEntityId = String(section.entity_id || form.entity_id || '').trim();
          const sectionEntityName = sectionEntityId ? (entityMap[sectionEntityId]?.name || sectionEntityId) : '不绑定实体';
          return `<div class="pv-form-section">
          <p class="pv-note"><strong>分组</strong>: ${esc(section.name || '未命名分组')} | <strong>绑定实体</strong>: ${esc(sectionEntityName)}${section.note ? ` | ${esc(section.note)}` : ''}</p>
          ${(section.fields || []).length ? `<table><thead><tr><th>字段</th><th>类型</th><th>必填</th><th>实体字段</th><th>说明</th></tr></thead><tbody>
            ${(section.fields || []).map((field) => `<tr>
              <td>${esc(field.name || '')}</td>
              <td>${esc(FORM_FIELD_TYPE_LABELS[field.type] || field.type || '')}</td>
              <td style="text-align:center">${field.required ? '是' : ''}</td>
              <td>${esc(field.entity_field || '')}</td>
              <td>${esc(field.note || '')}</td>
            </tr>`).join('')}
          </tbody></table>` : ''}
        </div>`;
        }).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function renderPreviewTaskBusinessRulesHtml(node) {
  const rules = getNodeBusinessRules(node)
    .filter((rule) => String(rule.name || '').trim() || String(rule.content || '').trim());
  if (!rules.length) return '';
  return `<div class="pv-rule-model">
    <h5>业务规则</h5>
    <table class="pv-rule-table">
      <thead><tr><th>规则名称</th><th>规则内容</th></tr></thead>
      <tbody>
        ${rules.map((rule) => `<tr>
          <td>${esc(rule.name || '未命名规则')}</td>
          <td>${previewRichTextCell(rule.content || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function getPreviewNodeTaskConstructName(item) {
  const definition = item?.taskDefinitionUid && typeof findTaskDefinitionRef === 'function'
    ? findTaskDefinitionRef(item.taskDefinitionUid)
    : null;
  const constructId = String(item?.constructUid || item?.businessConstructUid || definition?.constructUid || '').trim();
  if (!constructId) return '未归属构件';
  const construct = typeof getBusinessConstructItems === 'function'
    ? getBusinessConstructItems(S.doc).find((candidate) => candidate.id === constructId || candidate.name === constructId)
    : null;
  return construct?.name || item?.constructName || definition?.constructName || constructId;
}

function renderPreviewProcessHtml(proc, entityMap, stepLabels, orchestrationLabels, querySourceLabels) {
      const nodes = getProcNodes(proc);
      const prototypeFiles = getProcPrototypeFiles(proc);
      const processStageSummary = formatProcessStageSummary(proc, S.doc);
  return `<section class="pv-process-section" id="${previewAnchorId('proc', previewItemUid(proc) || proc.name || 'process')}">
        <h3>${esc(previewDisplayName(proc, '未命名流程'))}</h3>
        ${processStageSummary || proc.flowGroup ? `<p class="pv-note">
          ${processStageSummary ? `<strong>业务阶段</strong>: ${esc(processStageSummary)}` : ''}
          ${proc.flowGroup ? `${processStageSummary ? ' | ' : ''}<strong>流程分组</strong>: ${esc(proc.flowGroup)}` : ''}
        </p>` : ''}
        ${proc.trigger || proc.outcome ? `<p class="pv-note"><strong>触发</strong>: ${esc(proc.trigger||'—')} → <strong>预期结果</strong>: ${esc(proc.outcome||'—')}</p>` : ''}
        ${prototypeFiles.length ? `<p class="pv-note"><strong>流程原型/附件</strong>: ${esc(formatPrototypeSummary(prototypeFiles))}</p>` : ''}
        <div id="pv-proc-${previewAnchorId('proc-diag', previewItemUid(proc) || proc.name || 'process')}" class="pv-diag"></div>
        ${nodes.length ? `<div class="pv-tasks">
          ${nodes.map((node, index) => {
            const roleName = getTaskRoleName(node);
            const entityOps = node.entity_ops || [];
            const userSteps = getNodeUserSteps(node);
            const orchestrationTasks = getNodeOrchestrationTasks(node);
            const forms = getTaskForms(node);
            const nodeName = previewDisplayName(node, `未命名节点 ${index + 1}`);
            return `<div class="pv-task-detail">
              <h4>流程节点: ${esc(nodeName)}${roleName ? ` <span class="pv-role">(${esc(roleName)})</span>` : ''}</h4>
              ${node.repeatable ? '<p class="pv-note">可退回节点</p>' : ''}
              ${userSteps.length ? `<table><thead><tr><th>#</th><th>用户操作步骤</th><th>类型</th><th>条件/备注</th></tr></thead><tbody>
                ${userSteps.map((step, index) => `<tr><td>${index + 1}</td><td>${esc(step.name||'')}</td><td>${esc(stepLabels[step.type]||step.type||'')}</td><td>${previewRichTextCell(step.note||'')}</td></tr>`).join('')}
              </tbody></table>` : ''}
              ${orchestrationTasks.length ? `<table><thead><tr><th>#</th><th>节点任务</th><th>业务构件</th><th>类型</th><th>查询来源</th><th>目标</th><th>备注</th></tr></thead><tbody>
                ${orchestrationTasks.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name||'')}</td><td>${esc(getPreviewNodeTaskConstructName(item))}</td><td>${esc(orchestrationLabels[item.type]||item.type||'')}</td><td>${esc(querySourceLabels[item.querySourceKind]||item.querySourceKind||'—')}</td><td>${esc(item.target||'')}</td><td>${previewRichTextCell(item.note||'')}</td></tr>`).join('')}
              </tbody></table>` : ''}
              ${entityOps.length ? `<p class="pv-note"><strong>涉及实体</strong>: ${entityOps.map((entityOp) => {
                const entityName = (entityMap[entityOp.entity_id]?.name) || entityOp.entity_id;
                return `${esc(entityName)}（${esc((entityOp.ops||[]).join(','))}）`;
              }).join(', ')}</p>` : ''}
              ${renderPreviewTaskFormsHtml(forms, entityMap)}
              ${renderPreviewTaskBusinessRulesHtml(node)}
            </div>`;
          }).join('')}
        </div>` : ''}
      </section>`;
}

function renderPreviewProcessesHtml(processes) {
  if (!processes.length) return '';
  return `<h2 id="preview-processes">流程视图</h2>
    ${processes.map((proc, index) => previewLazySectionHtml(
      previewAnchorId('proc', previewItemUid(proc) || proc.name || 'process'),
      'process',
      previewDisplayName(proc, '未命名流程'),
      index
    )).join('')}`;
}

function renderPreviewEntityHtml(entity, fieldLabels) {
  return `<div class="pv-entity-section" id="${previewAnchorId('entity', previewItemUid(entity) || entity.name || 'entity')}">
      <h3>实体: ${esc(previewDisplayName(entity, '未命名实体'))}</h3>
      ${entity.note ? `<p class="pv-note">${esc(entity.note)}</p>` : ''}
      ${entity.fields?.length ? `<table><thead><tr><th>字段</th><th>类型</th><th>主键</th><th>状态字段</th><th>字段规则</th></tr></thead><tbody>
        ${entity.fields.map((field) => `<tr>
          <td>${esc(field.name||'')}</td>
          <td>${esc(fieldLabels[field.type]||field.type||'')}</td>
          <td style="text-align:center">${field.is_key?'✓':''}</td>
          <td style="text-align:center">${esc(getFieldStatusRoleLabel(field, 'long') || '')}</td>
          <td>${esc(getFieldRuleText(field) || '')}</td>
        </tr>`).join('')}
      </tbody></table>` : ''}
      ${renderPreviewEntityStateGraphs(entity)}
      ${entity.state_transitions?.length ? `<h4>状态流转</h4>
        ${(() => {
          const statusField = getEntityStatusField(entity);
          const statusLine = statusField
            ? `<p class="pv-note"><strong>主状态字段</strong>: ${esc(statusField.name || '')}（状态列表：${esc(getFieldStateValueText(statusField) || '—')}）</p>`
            : '';
          return `${statusLine}
            <table><thead><tr><th>来源状态</th><th>目标状态</th><th>备注说明</th></tr></thead><tbody>
              ${entity.state_transitions.map((transition) => `<tr><td>${esc(transition.from || '')}</td><td>${esc(transition.to || '')}</td><td>${esc(transition.note || transition.action || '')}</td></tr>`).join('')}
            </tbody></table>`;
        })()}` : ''}
    </div>`;
}

function renderPreviewEntitiesHtml(entities) {
  if (!entities.length) return '';
  return `<h2 id="preview-entities">数据建模</h2>
    ${previewLazySectionHtml('preview-entity-overview', 'entity-overview', '实体关系图')}
    ${entities.map((entity, index) => previewLazySectionHtml(
      previewAnchorId('entity', previewItemUid(entity) || entity.name || 'entity'),
      'entity',
      `实体: ${previewDisplayName(entity, '未命名实体')}`,
      index
    )).join('')}`;
}

function renderPreviewEntityStateGraphs(entity) {
  if (typeof getEntityStatusFields !== 'function' || typeof renderEntityStateGraphMarkup !== 'function') return '';
  const statusFields = getEntityStatusFields(entity);
  if (!statusFields.length) return '';
  const graphs = statusFields
    .map((field) => {
      const stateNodes = getFieldStateNodes(field);
      if (!stateNodes.length) return '';
      return `<div class="pv-entity-state-graph" data-testid="preview-entity-state-graph">
        <h4>状态图：${esc(getStateFieldOptionLabel(field))}</h4>
        ${renderEntityStateGraphMarkup(entity, field.name, { readonly: true, zoom: 1 })}
      </div>`;
    })
    .filter(Boolean)
    .join('');
  return graphs ? `<div class="pv-entity-state-graphs">${graphs}</div>` : '';
}

function getPreviewRenderContext(doc = S.doc) {
  const entities = doc?.entities || [];
  return {
    stepLabels: {Query:'查询',Check:'校验',Fill:'填写',Select:'选择',Compute:'计算',Mutate:'变更'},
    orchestrationLabels: {Query:'查询',Check:'校验',Compute:'计算',Service:'服务',Mutate:'变更',Custom:'自定义'},
    querySourceLabels: {Dictionary:'字典',Enum:'枚举',QueryService:'查询服务',Custom:'自定义'},
    fieldLabels: {string:'字符',number:'数值',decimal:'金额',date:'日期',datetime:'日期时间',boolean:'布尔',enum:'枚举',text:'长文本',id:'标识ID'},
    entityMap: Object.fromEntries(entities.map(e=>[e.id,e])),
  };
}

function replacePreviewLazySection(anchorId, html, afterRender) {
  const el = document.getElementById(anchorId);
  if (!el || el.dataset.previewLoaded === 'true') return;
  if (previewLazyObserver) previewLazyObserver.unobserve(el);
  el.outerHTML = html;
  if (typeof afterRender === 'function') afterRender();
}

function ensurePreviewSection(anchorId) {
  if (!S.doc || !anchorId) return;
  const el = document.getElementById(anchorId);
  if (!el || el.dataset.previewLoaded === 'true') return;
  const kind = el.dataset.previewLazy || '';
  const index = Number(el.dataset.previewIndex || 0) || 0;
  const ctx = getPreviewRenderContext(S.doc);
  if (kind === 'role-usecases') {
    replacePreviewLazySection(anchorId, renderPreviewRoleUsecaseHtml(S.doc.roles || []));
    return;
  }
  if (kind === 'stage-panorama') {
    replacePreviewLazySection(anchorId, renderPreviewStagePanoramaHtml(S.doc));
    return;
  }
  if (kind === 'stage') {
    const stageItem = getStageItems(S.doc)[index];
    if (stageItem) replacePreviewLazySection(anchorId, renderPreviewStageDetailHtml(S.doc, stageItem));
    return;
  }
  if (kind === 'process') {
    const proc = (S.doc.processes || [])[index];
    if (!proc) return;
    replacePreviewLazySection(anchorId, renderPreviewProcessHtml(proc, ctx.entityMap, ctx.stepLabels, ctx.orchestrationLabels, ctx.querySourceLabels), () => {
      if (getProcNodes(proc).length) {
        renderProcFlow(`pv-proc-${previewAnchorId('proc-diag', previewItemUid(proc) || proc.name || 'process')}`, proc, null);
      }
    });
    return;
  }
  if (kind === 'entity-overview') {
    replacePreviewLazySection(anchorId, `<section id="preview-entity-overview" class="pv-entity-section"><h3>实体关系图</h3><div id="pv-entity-diag" class="pv-diag pv-entity-diag"></div></section>`, () => {
      if ((S.doc.entities || []).length) renderEntityFlow('pv-entity-diag', S.doc, null);
    });
    return;
  }
  if (kind === 'entity') {
    const entity = (S.doc.entities || [])[index];
    if (entity) replacePreviewLazySection(anchorId, renderPreviewEntityHtml(entity, ctx.fieldLabels));
  }
}

function initPreviewLazyRendering() {
  if (previewLazyObserver) previewLazyObserver.disconnect();
  const root = document.getElementById('preview-rendered');
  const sections = Array.from(document.querySelectorAll('[data-preview-lazy]'));
  if (!root || !sections.length) return;
  previewLazyObserver = new IntersectionObserver((entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry) => ensurePreviewSection(entry.target.id));
  }, { root, rootMargin: '600px 0px', threshold: 0.01 });
  sections
    .filter((section) => section.dataset.previewManual !== 'true')
    .forEach((section) => previewLazyObserver.observe(section));
}

function buildHtmlPreview() {
  const container = document.getElementById('preview-rendered');
  if(!container || !S.doc) return;
  const doc = S.doc;
  const m   = doc.meta||{};
  const roles = doc.roles||[];
  const lang = doc.language||[];
  const procs = doc.processes||[];
  const entities  = doc.entities||[];
  container.innerHTML = [
    `<h1 id="preview-top">${esc(m.title||m.domain||'未命名')}</h1>`,
    buildPreviewMetaLine(m),
    '<hr>',
    renderPreviewRolesHtml(roles),
    renderPreviewLanguageHtml(lang),
    renderPreviewStagesHtml(doc),
    renderPreviewProcessesHtml(procs),
    renderPreviewEntitiesHtml(entities),
  ].filter(Boolean).join('');
  initPreviewLazyRendering();
  ensurePreviewSection('preview-stage-panorama');
}

function appendPreviewRolesMd(add, roles) {
  add('| 角色 | 分组 | 说明 | 所属业务组件 |');
  add('|------|------|------|--------------|');
  roles.forEach((role) => add(`| ${getRoleName(role)} | ${getRoleGroup(role)} | ${getRoleDesc(role)} | ${getRoleSubDomains(role)} |`));
  add('');
}

function appendPreviewLanguageMd(add, languageItems) {
  add('| 术语 | 定义 |');
  add('|------|------|');
  languageItems.forEach((item) => add(`| ${item.term||''} | ${item.definition||''} |`));
  add('');
}

function appendPreviewPanoramaMatrixMd(add, doc, panorama) {
  const { model, groups } = buildPreviewPanoramaCellGroups(doc, panorama.nodes);
  add(`| 业务域 / 价值流 | ${(model.columns || []).map((column) => column.name || column.id).join(' | ')} |`);
  add(`|---|${(model.columns || []).map(() => '---').join('|')}|`);
  (model.lanes || []).forEach((lane) => {
    const cells = (model.columns || []).map((column) => {
      const cell = getPanoramaCell(model, lane.id, column.id);
      const stageNodes = groups.get(`${lane.id}::${column.id}`) || [];
      const stageText = stageNodes.map((node) => {
        const flowCount = Math.max(0, Number(node._processCount || 0) || 0);
        return flowCount ? `${node.label}（${flowCount}个流程）` : node.label;
      }).filter(Boolean).join('、');
      return [cell.status, cell.text, stageText].filter(Boolean).join('；');
    });
    add(`| ${lane.name || lane.id} | ${cells.join(' | ')} |`);
  });
  add('');
}

function appendPreviewStagesMd(add, doc) {
  const stageItems = getStageItems(doc);
  if (!stageItems.length) return;
  const panorama = buildPreviewStagePanoramaData(doc);
  add('### 全景视图');
  add('');
  if (panorama.nodes.length) {
    appendPreviewPanoramaMatrixMd(add, doc, panorama);
  }
  for (const stageItem of stageItems) {
    const detail = buildPreviewStageDetailData(doc, stageItem);
    add(`### 阶段视图: ${stageItem.name || stageItem.id}`);
    add('');
    add(`**所属业务域**: ${getStageBusinessDomainLabel(stageItem) || '—'}  |  **流程数**: ${detail.processes.length}`);
    add('');
    if (detail.nodes.length) {
      add('```mermaid');
      add('flowchart TD');
      detail.nodes.forEach((node) => add(`  ${node.id}["${node.label}"]`));
      detail.links.forEach((link) => add(`  ${link.from} --> ${link.to}`));
      add('```');
      add('');
    }
  }
}

function appendPreviewTaskFormsMd(add, forms, entityMap) {
  if (!forms.length) return;
  add('**表单模型**');
  add('');
  forms.forEach((form) => {
    const entityName = typeof getTaskFormEntitySummary === 'function'
      ? getTaskFormEntitySummary(form)
      : (form.entity_id ? (entityMap[form.entity_id]?.name || form.entity_id) : '不绑定实体');
    add(`- ${form.name || '未命名表单'}；关联实体：${entityName}${form.purpose ? `；用途：${form.purpose}` : ''}`);
    (form.sections || []).forEach((section) => {
      const sectionEntityId = String(section.entity_id || form.entity_id || '').trim();
      const sectionEntityName = sectionEntityId ? (entityMap[sectionEntityId]?.name || sectionEntityId) : '不绑定实体';
      add(`  - 分组：${section.name || '未命名分组'}；绑定实体：${sectionEntityName}${section.note ? `；${section.note}` : ''}`);
      (section.fields || []).forEach((field) => {
        add(`    - ${field.name || '未命名字段'} / ${FORM_FIELD_TYPE_LABELS[field.type] || field.type || ''}${field.required ? ' / 必填' : ''}${field.entity_field ? ` / 映射：${field.entity_field}` : ''}${field.note ? ` / ${field.note}` : ''}`);
      });
    });
  });
  add('');
}

function appendPreviewBusinessRulesMd(add, node) {
  const rules = getNodeBusinessRules(node)
    .filter((rule) => String(rule.name || '').trim() || String(rule.content || '').trim());
  if (!rules.length) return;
  add('**业务规则**');
  add('');
  rules.forEach((rule) => {
    add(`- **${rule.name || '未命名规则'}**`);
    const contentLines = String(rule.content || '').split(/\r?\n/).filter((line) => line.trim());
    contentLines.forEach((line) => add(`  ${line}`));
    if (!contentLines.length) add('  ');
  });
  add('');
}

function appendPreviewProcessesMd(add, doc, processes, entityMap, stepLabels, orchestrationLabels, querySourceLabels) {
  for (const proc of processes) {
    const nodes = getProcNodes(proc);
    const prototypeFiles = getProcPrototypeFiles(proc);
    add(`### ${proc.id}: ${proc.name||''}`);
    add('');
    const processStageSummary = formatProcessStageSummary(proc, doc);
    if(processStageSummary) add(`**业务阶段**: ${processStageSummary}`);
    if(proc.flowGroup) add(`**流程分组**: ${proc.flowGroup}`);
    if(prototypeFiles.length) add(`**流程原型/附件**: ${formatPrototypeSummary(prototypeFiles)}`);
    add('');
    if(proc.trigger||proc.outcome){
      add(`**触发**: ${proc.trigger||'—'}  →  **预期结果**: ${proc.outcome||'—'}`);
      add('');
    }
    if(!nodes.length) continue;
    const procCode = buildProcMermaid(proc);
    if(procCode){
      add('```mermaid');
      procCode.split('\n').forEach((line) => add(line));
      add('```');
      add('');
    }
    for (const node of nodes) {
      const roleName = getTaskRoleName(node);
      add(`#### 流程节点 ${node.id}. ${node.name||''}${roleName ? `（角色：${roleName}）` : ''}`);
      add('');
      if(node.repeatable) {
        add('> 可退回节点');
        add('');
      }
      const userSteps = getNodeUserSteps(node);
      if(userSteps.length){
        add('| # | 用户操作步骤 | 类型 | 条件/备注 |');
        add('|---|------|------|----------|');
        userSteps.forEach((step, index) => add(`| ${index+1} | ${step.name||''} | ${stepLabels[step.type]||step.type||''} | ${step.note||''} |`));
        add('');
      }
      const orchestrationTasks = getNodeOrchestrationTasks(node);
      if(orchestrationTasks.length){
        add('| # | 节点任务 | 业务构件 | 类型 | 查询来源 | 目标 | 备注 |');
        add('|---|----------|----------|------|----------|------|------|');
        orchestrationTasks.forEach((item, index) => add(`| ${index+1} | ${item.name||''} | ${getPreviewNodeTaskConstructName(item)} | ${orchestrationLabels[item.type]||item.type||''} | ${querySourceLabels[item.querySourceKind]||item.querySourceKind||'—'} | ${item.target||''} | ${item.note||''} |`));
        add('');
      }
      const entityOps = node.entity_ops || [];
      if(entityOps.length){
        add(`**涉及实体**: ${entityOps.map((entityOp) => {
          const entityName = (entityMap[entityOp.entity_id]?.name) || entityOp.entity_id;
          return `${entityName}（${(entityOp.ops||[]).join(',')}）`;
        }).join(', ')}`);
        add('');
      }
      appendPreviewTaskFormsMd(add, getTaskForms(node), entityMap);
      appendPreviewBusinessRulesMd(add, node);
      add('');
    }
  }
}

function appendPreviewEntitiesMd(add, doc, entities, fieldLabels) {
  const entityCode = buildEntityMermaid(doc);
  if(entityCode){
    add('```mermaid');
    entityCode.split('\n').forEach((line) => add(line));
    add('```');
    add('');
  }
  for(const entity of entities){
    add(`### 实体：${entity.name||''}`);
    add('');
    if(entity.note) {
      add(entity.note);
      add('');
    }
    if(entity.fields?.length){
      add('| 字段 | 类型 | 主键 | 状态字段 | 字段规则 |');
      add('|------|------|------|---------|---------|');
      entity.fields.forEach((field) => add(`| ${field.name||''} | ${fieldLabels[field.type]||field.type||''} | ${field.is_key?'✓':''} | ${getFieldStatusRoleLabel(field, 'long') || ''} | ${getFieldRuleText(field)||''} |`));
      add('');
    }
    if(entity.state_transitions?.length){
      const statusField = getEntityStatusField(entity);
      add('#### 状态流转');
      add('');
      if(statusField) {
        add(`**主状态字段**: ${statusField.name||''}（状态列表：${getFieldStateValueText(statusField)||'—'}）`);
        add('');
      }
      add('| 来源状态 | 目标状态 | 备注说明 |');
      add('|----------|----------|----------|');
      entity.state_transitions.forEach((transition) => add(`| ${transition.from||''} | ${transition.to||''} | ${transition.note || transition.action || ''} |`));
      add('');
    }
  }
}

/* 从当前 doc 对象直接生成 MD（等价于服务端 build_md，离线可用） */
function buildMdFromDoc(doc) {
  if(!doc) return '';
  const STEP_LBL  = {Query:'查询',Check:'校验',Fill:'填写',Select:'选择',Compute:'计算',Mutate:'变更'};
  const ORCH_LBL = {Query:'查询',Check:'校验',Compute:'计算',Service:'服务',Mutate:'变更',Custom:'自定义'};
  const QUERY_SOURCE_LBL = {Dictionary:'字典',Enum:'枚举',QueryService:'查询服务',Custom:'自定义'};
  const FIELD_LBL = {string:'字符',number:'数值',decimal:'金额',date:'日期',datetime:'日期时间',boolean:'布尔',enum:'枚举',text:'长文本',id:'标识ID'};
  const L = [];
  const m = doc.meta||{};
  const add  = s => L.push(s??'');
  const sep  = () => { add('---'); add(''); };
  const nums = ['一','二','三','四','五','六','七','八'];
  let sn = 0;

  add(`# ${m.title||m.domain||'未命名'}`); add('');
  const parts = [['业务域',m.domain],['作者',m.author],['日期',m.date]].filter(([,v])=>v);
  if(parts.length){ add(parts.map(([k,v])=>`**${k}**: ${v}`).join(' | ')); add(''); }
  sep();

  const roles = doc.roles||[];
  if(roles.length){
    add(`## ${nums[sn++]}、角色`); add('');
    appendPreviewRolesMd(add, roles);
    sep();
  }

  const lang = doc.language||[];
  if(lang.length){
    add(`## ${nums[sn++]}、统一语言`); add('');
    appendPreviewLanguageMd(add, lang);
    sep();
  }

  const stages = getStageItems(doc);
  if(stages.length){
    add(`## ${nums[sn++]}、全景与阶段视图`); add('');
    appendPreviewStagesMd(add, doc);
    sep();
  }

  const procs = doc.processes||[];
  const emap  = Object.fromEntries((doc.entities||[]).map(e=>[e.id,e]));
  add(`## ${nums[sn++]}、流程视图`); add('');
  appendPreviewProcessesMd(add, doc, procs, emap, STEP_LBL, ORCH_LBL, QUERY_SOURCE_LBL);
  sep();

  const entities  = doc.entities||[];
  if(entities.length){
    add(`## ${nums[sn++]}、数据建模`); add('');
    appendPreviewEntitiesMd(add, doc, entities, FIELD_LBL);
    sep();
  }

  return L.join('\n');
}

async function doRenderPreview(md) {
  const container = document.getElementById('preview-rendered');
  if(!container) return;
  const {html, diagrams} = renderBlmMd(md);
  container.innerHTML = html;
  setPreviewHint(diagrams.length ? '离线渲染' : '离线渲染');

  /* 渲染 mermaid 图表（联网时自动生效，离线时降级显示代码） */
  const blocks = container.querySelectorAll('.md-mermaid');
  for(const block of blocks) {
    const idx  = parseInt(block.dataset.idx);
    const code = diagrams[idx];
    if(!code) continue;
    if(window.mermaidLib) {
      try {
        const {svg} = await window.mermaidLib.render(`bpv-${idx}-${Date.now()}`, code);
        block.innerHTML = svg;
      } catch(e) {
        block.innerHTML = `<pre class="md-code">${esc(code)}</pre>`;
      }
    } else {
      block.innerHTML = `<pre class="md-code">${esc(code)}</pre>`;
    }
  }
}

function setPreviewHint(msg) {
  const el = document.getElementById('preview-mode-hint'); if(el) el.textContent = msg;
}
function togglePreviewRaw() {
  const body     = document.getElementById('preview-body');
  const raw      = document.getElementById('preview-raw');
  const toggle   = document.getElementById('preview-raw-toggle');
  if(!body || !raw) return;
  const goRaw = !body.classList.contains('hidden');
  if (goRaw && raw.dataset.loaded !== 'true') {
    raw.textContent = buildMdFromDoc(S.doc);
    raw.dataset.loaded = 'true';
  }
  body.classList.toggle('hidden', goRaw);
  raw.classList.toggle('hidden', !goRaw);
  if (toggle) toggle.textContent = goRaw ? '返回预览' : '显示原文 MD';
}
