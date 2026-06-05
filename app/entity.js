'use strict';

function getEntityBusinessConstructId(entity) {
  const explicitId = String(entity?.businessConstructId || '').trim();
  if (explicitId) return explicitId;
  const firstId = Array.isArray(entity?.businessConstructIds)
    ? entity.businessConstructIds.map((id) => String(id || '').trim()).find(Boolean)
    : '';
  return firstId || '';
}

function getEntityModelMeta(entity, doc = S.doc) {
  const constructId = getEntityBusinessConstructId(entity);
  const construct = constructId
    ? getBusinessConstructItems(doc).find((item) => item.id === constructId || item.name === constructId)
    : null;
  const capabilityId = String(construct?.businessComponentId || construct?.businessComponent || '').trim();
  const capability = capabilityId
    ? getCapabilityItems(doc).find((item) => item.id === capabilityId || item.name === capabilityId)
    : null;
  return {
    construct,
    capability,
    constructKey: construct?.id || construct?.name || '__ungrouped_construct__',
    constructLabel: construct?.name || '未归属构件',
    capabilityKey: capability?.id || capability?.name || construct?.businessComponent || '__ungrouped_capability__',
    capabilityLabel: capability?.name || construct?.businessComponent || '未归属组件',
  };
}

function renderBusinessConstructOptions(selectedConstructId = '') {
  return `<option value="">未归属构件</option>${getBusinessConstructItems(S.doc).map((construct) => {
    const id = String(construct.id || construct.name || '');
    const capability = getCapabilityItems(S.doc).find((item) => item.id === construct.businessComponentId || item.name === construct.businessComponent);
    const prefix = capability ? `${capability.name} / ` : '';
    return `<option value="${esc(id)}" ${id === selectedConstructId ? 'selected' : ''}>${esc(prefix + (construct.name || id))}</option>`;
  }).join('')}`;
}

function _efSortLayout(entities, relations) {
  const deg = {};
  const grpScore = {};
  const grpLink = {};
  for(const e of entities) {
    deg[e.id] = 0;
    const grp = getEntityModelMeta(e).constructKey;
    grpScore[grp] = grpScore[grp] || 0;
    grpLink[grp] = grpLink[grp] || {};
  }
  for(const r of relations) {
    if(deg[r.from]!==undefined) deg[r.from]++;
    if(deg[r.to]  !==undefined) deg[r.to]++;
    const fromGrp = getEntityModelMeta(entities.find(e=>e.id===r.from)).constructKey;
    const toGrp   = getEntityModelMeta(entities.find(e=>e.id===r.to)).constructKey;
    grpScore[fromGrp] = (grpScore[fromGrp] || 0) + 1;
    grpScore[toGrp]   = (grpScore[toGrp] || 0) + 1;
    if(fromGrp !== toGrp) {
      grpLink[fromGrp] = grpLink[fromGrp] || {};
      grpLink[toGrp] = grpLink[toGrp] || {};
      grpLink[fromGrp][toGrp] = (grpLink[fromGrp][toGrp] || 0) + 1;
      grpLink[toGrp][fromGrp] = (grpLink[toGrp][fromGrp] || 0) + 1;
    }
  }

  const allGroups = [...new Set(entities.map(e=>getEntityModelMeta(e).constructKey))];
  if(!allGroups.length) return [];

  const sortedGroups = [];
  const used = new Set();
  let current = [...allGroups].sort((a,b)=>(grpScore[b]||0)-(grpScore[a]||0))[0];
  while(current) {
    sortedGroups.push(current);
    used.add(current);
    let nextGroup = null;
    let nextScore = -1;
    for(const grp of allGroups) {
      if(used.has(grp)) continue;
      const score = (grpLink[current]?.[grp] || 0) * 100 + (grpScore[grp] || 0);
      if(score > nextScore) {
        nextScore = score;
        nextGroup = grp;
      }
    }
    current = nextGroup;
  }

  return sortedGroups.map((grp) => ({
    grp,
    entities: entities
      .filter(e=>getEntityModelMeta(e).constructKey===grp)
      .sort((a,b)=>(deg[b.id]||0)-(deg[a.id]||0) || a.id.localeCompare(b.id)),
  }));
}

/* ── ER 图节点默认布局计算 ── */
const EF_NODE_W = 120;   // 预估节点宽
const EF_NODE_H = 38;    // 预估节点高
const EF_GAP_X  = 40;    // 同行间距
const EF_GAP_Y  = 70;    // 行间距
const EF_PAD    = 20;    // 边距
const EF_GROUP_HEADER_H = 28;
const EF_GROUP_PAD_X = 22;
const EF_GROUP_PAD_Y = 18;
const EF_GROUP_GAP_X = 56;
const EF_GROUP_GAP_Y = 56;
const EF_COMPONENT_PAD_X = 18;
const EF_COMPONENT_PAD_Y = 18;
const EF_COMPONENT_HEADER_H = 28;
const EF_MIN_ENTITY_X = EF_PAD + EF_GROUP_PAD_X + EF_COMPONENT_PAD_X;
const EF_MIN_ENTITY_Y = EF_PAD + EF_COMPONENT_HEADER_H + EF_COMPONENT_PAD_Y + EF_GROUP_HEADER_H + EF_GROUP_PAD_Y;

function _efEstimateTextWidth(text) {
  return Array.from(String(text || '')).reduce((sum, char) => {
    if (/[\u2e80-\u9fff\uff00-\uffef]/.test(char)) return sum + 14;
    if (/[A-Z]/.test(char)) return sum + 8;
    if (/\s/.test(char)) return sum + 4;
    return sum + 7;
  }, 0);
}

function _efGetEntityNodeSize(entity) {
  const name = String(entity?.name || '未命名实体');
  return {
    width: Math.max(EF_NODE_W, Math.ceil(_efEstimateTextWidth(name) + 32)),
    height: EF_NODE_H,
  };
}

function _efGetBoardPoint(containerId, board, event) {
  const scale = ZOOM[containerId] || 1;
  const rect = board.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / scale,
    y: (event.clientY - rect.top) / scale,
  };
}

function _efGetGroupColumnCount(entityCount) {
  if(entityCount >= 12) return 3;
  if(entityCount >= 7) return 2;
  return 1;
}

function _efMeasureGroupBlock(groupBlock) {
  const groupEntities = groupBlock.entities || [];
  const colCount = _efGetGroupColumnCount(groupEntities.length);
  const rowCount = Math.max(1, Math.ceil(groupEntities.length / colCount));
  const colWidths = Array.from({ length: colCount }, () => EF_NODE_W);
  groupEntities.forEach((entity, index) => {
    const col = index % colCount;
    colWidths[col] = Math.max(colWidths[col], _efGetEntityNodeSize(entity).width);
  });
  const contentWidth = colWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, colCount - 1) * EF_GAP_X;
  const contentHeight = rowCount * EF_NODE_H + Math.max(0, rowCount - 1) * EF_GAP_Y;
  return {
    colCount,
    colWidths,
    rowCount,
    width: contentWidth + EF_GROUP_PAD_X * 2,
    height: contentHeight + EF_GROUP_HEADER_H + EF_GROUP_PAD_Y * 2,
  };
}

function _efGetGroupGridColumns(groupCount) {
  if(groupCount <= 1) return 1;
  if(groupCount <= 4) return 2;
  if(groupCount <= 9) return 3;
  return 4;
}

function _efComputeDefaultPos(entities, relations) {
  if(!entities.length) return {};
  const posMap = {};
  const sortedGroups = _efSortLayout(entities, relations)
    .map(groupBlock => ({ ...groupBlock, layout: _efMeasureGroupBlock(groupBlock) }));
  const gridCols = _efGetGroupGridColumns(sortedGroups.length);
  const cellWidth = Math.max(...sortedGroups.map(groupBlock => groupBlock.layout.width), EF_NODE_W + EF_GROUP_PAD_X * 2);
  const cellHeight = Math.max(...sortedGroups.map(groupBlock => groupBlock.layout.height), EF_NODE_H + EF_GROUP_HEADER_H + EF_GROUP_PAD_Y * 2);

  sortedGroups.forEach((groupBlock, index) => {
    const groupEntities = groupBlock.entities || [];
    const colCount = groupBlock.layout.colCount;
    const colWidths = groupBlock.layout.colWidths || Array.from({ length: colCount }, () => EF_NODE_W);
    const colOffsets = colWidths.reduce((acc, width, index) => {
      acc.push(index === 0 ? 0 : acc[index - 1] + colWidths[index - 1] + EF_GAP_X);
      return acc;
    }, []);
    const rowGap = EF_NODE_H + EF_GAP_Y;
    const rawRow = Math.floor(index / gridCols);
    const rawCol = index % gridCols;
    const itemsInRow = Math.min(gridCols, sortedGroups.length - rawRow * gridCols);
    const layoutCol = rawRow % 2 === 0 ? rawCol : (itemsInRow - 1 - rawCol);
    const baseX = EF_PAD + layoutCol * (cellWidth + EF_GROUP_GAP_X);
    const baseY = EF_PAD + rawRow * (cellHeight + EF_GROUP_GAP_Y);

    groupEntities.forEach((entity, index) => {
      const col = index % colCount;
      const row = Math.floor(index / colCount);
      posMap[entity.id] = {
        x: baseX + EF_GROUP_PAD_X + (colOffsets[col] || 0),
        y: baseY + EF_GROUP_HEADER_H + EF_GROUP_PAD_Y + row * rowGap,
      };
    });
  });
  return posMap;
}

function _efGetFocusRelatedIds(relations, focusEntityId) {
  const ids = new Set();
  if(!focusEntityId) return ids;
  for(const rel of relations) {
    if(rel.from === focusEntityId) ids.add(rel.to);
    if(rel.to === focusEntityId) ids.add(rel.from);
  }
  return ids;
}

function _efComputeGroupFrames(entities) {
  const frames = {};
  for(const entity of entities) {
    const meta = getEntityModelMeta(entity);
    const group = meta.constructKey;
    const x = entity.pos?.x || EF_PAD;
    const y = entity.pos?.y || EF_PAD;
    const size = _efGetEntityNodeSize(entity);
    const left = x - EF_GROUP_PAD_X;
    const top = y - EF_GROUP_HEADER_H - EF_GROUP_PAD_Y;
    const right = x + size.width + EF_GROUP_PAD_X;
    const bottom = y + size.height + EF_GROUP_PAD_Y;
    if(!frames[group]) {
      frames[group] = {
        group,
        label: meta.constructLabel,
        componentKey: meta.capabilityKey,
        componentLabel: meta.capabilityLabel,
        left,
        top,
        right,
        bottom,
      };
      continue;
    }
    frames[group].left = Math.min(frames[group].left, left);
    frames[group].top = Math.min(frames[group].top, top);
    frames[group].right = Math.max(frames[group].right, right);
    frames[group].bottom = Math.max(frames[group].bottom, bottom);
  }
  return Object.values(frames);
}

function _efComputeComponentFrames(groupFrames) {
  const frames = {};
  for (const frame of groupFrames) {
    const key = frame.componentKey || '__ungrouped_capability__';
    const left = frame.left - EF_COMPONENT_PAD_X;
    const top = frame.top - EF_COMPONENT_HEADER_H - EF_COMPONENT_PAD_Y;
    const right = frame.right + EF_COMPONENT_PAD_X;
    const bottom = frame.bottom + EF_COMPONENT_PAD_Y;
    if (!frames[key]) {
      frames[key] = { key, label: frame.componentLabel || '未归属组件', left, top, right, bottom };
      continue;
    }
    frames[key].left = Math.min(frames[key].left, left);
    frames[key].top = Math.min(frames[key].top, top);
    frames[key].right = Math.max(frames[key].right, right);
    frames[key].bottom = Math.max(frames[key].bottom, bottom);
  }
  return Object.values(frames);
}

function _efEnsureFrameViewportPadding(entities) {
  let groupFrames = _efComputeGroupFrames(entities);
  let componentFrames = _efComputeComponentFrames(groupFrames);
  const frames = [...groupFrames, ...componentFrames];
  if (!frames.length) return { groupFrames, componentFrames };

  const minLeft = Math.min(...frames.map((frame) => frame.left));
  const minTop = Math.min(...frames.map((frame) => frame.top));
  const shiftX = Math.max(0, EF_PAD - minLeft);
  const shiftY = Math.max(0, EF_PAD - minTop);
  if (!shiftX && !shiftY) return { groupFrames, componentFrames };

  entities.forEach((entity) => {
    entity.pos = {
      x: (entity.pos?.x || 0) + shiftX,
      y: (entity.pos?.y || 0) + shiftY,
    };
  });
  groupFrames = _efComputeGroupFrames(entities);
  componentFrames = _efComputeComponentFrames(groupFrames);
  return { groupFrames, componentFrames };
}

/* ── 实体图交互状态 ──────────────────────────────────────── */
const efSelectedIds = new Set();   // 当前选中的实体 ID
let efDragState   = null;          // 节点拖拽状态
let efDragMoved   = false;
let efPanState    = null;          // 背景平移状态
let efRubberState = null;          // 框选状态
let efRubberEl    = null;          // 框选 DOM 元素
let efShortcutInstalled = false;
let stateNodeDragState = null;
let stateNodeDragMoved = false;
let stateTransitionLabelDragState = null;
let stateTransitionLabelDragMoved = false;
let stateTransitionRouteDragState = null;
let stateTransitionRouteDragMoved = false;
let stateTransitionEndpointDragState = null;
let stateTransitionEndpointDragMoved = false;
let selectedStateTransitionIndex = null;

function isEntityRelationShortcutEditableTarget(target) {
  if (!target) return false;
  const tagName = String(target.tagName || '').toUpperCase();
  return tagName === 'INPUT'
    || tagName === 'TEXTAREA'
    || tagName === 'SELECT'
    || Boolean(target.isContentEditable);
}

function selectAllEntitiesInRelationGraph(containerId = 'entity-diagram') {
  const ids = (S.doc?.entities || []).map((entity) => entity.id).filter(Boolean);
  if (!ids.length) return false;
  efSelectedIds.clear();
  ids.forEach((id) => efSelectedIds.add(id));
  updateEfSelection(containerId);
  return true;
}

function handleEntityRelationShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  if (!(event.ctrlKey || event.metaKey) || event.altKey || key !== 'a') return;
  if (S.ui?.tab !== 'data' || (S.ui.dataView || 'relation') !== 'relation') return;
  if (isEntityRelationShortcutEditableTarget(event.target)) return;
  if (!document.getElementById('ef-canvas-entity-diagram')) return;
  if (selectAllEntitiesInRelationGraph('entity-diagram')) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function ensureEntityRelationShortcuts() {
  if (efShortcutInstalled) return;
  document.addEventListener('keydown', handleEntityRelationShortcut);
  efShortcutInstalled = true;
}

/* 刷新选中节点的视觉样式 */
function updateEfSelection(containerId) {
  const canvas = document.getElementById(`ef-canvas-${containerId}`);
  if(!canvas) return;
  canvas.querySelectorAll('.ef-node').forEach(node => {
    node.classList.toggle('ef-selected', efSelectedIds.has(node.dataset.id));
  });
}

function updateEfGroupFrames(containerId) {
  const board = document.getElementById(`ef-board-${containerId}`);
  if(!board) return;
  const boxes = {};
  board.querySelectorAll('.ef-node').forEach((node) => {
    const group = node.dataset.group || '__ungrouped_construct__';
    const component = node.dataset.component || '__ungrouped_capability__';
    const left = node.offsetLeft - EF_GROUP_PAD_X;
    const top = node.offsetTop - EF_GROUP_HEADER_H - EF_GROUP_PAD_Y;
    const right = node.offsetLeft + node.offsetWidth + EF_GROUP_PAD_X;
    const bottom = node.offsetTop + node.offsetHeight + EF_GROUP_PAD_Y;
    if(!boxes[group]) {
      boxes[group] = { component, left, top, right, bottom };
      return;
    }
    boxes[group].left = Math.min(boxes[group].left, left);
    boxes[group].top = Math.min(boxes[group].top, top);
    boxes[group].right = Math.max(boxes[group].right, right);
    boxes[group].bottom = Math.max(boxes[group].bottom, bottom);
  });
  board.querySelectorAll('.ef-group-frame').forEach((frame) => {
    const box = boxes[frame.dataset.group || '__ungrouped_construct__'];
    if(!box) return;
    frame.style.left = `${box.left}px`;
    frame.style.top = `${box.top}px`;
    frame.style.width = `${box.right - box.left}px`;
    frame.style.height = `${box.bottom - box.top}px`;
  });
  const componentBoxes = {};
  Object.values(boxes).forEach((box) => {
    const key = box.component || '__ungrouped_capability__';
    const left = box.left - EF_COMPONENT_PAD_X;
    const top = box.top - EF_COMPONENT_HEADER_H - EF_COMPONENT_PAD_Y;
    const right = box.right + EF_COMPONENT_PAD_X;
    const bottom = box.bottom + EF_COMPONENT_PAD_Y;
    if (!componentBoxes[key]) {
      componentBoxes[key] = { left, top, right, bottom };
      return;
    }
    componentBoxes[key].left = Math.min(componentBoxes[key].left, left);
    componentBoxes[key].top = Math.min(componentBoxes[key].top, top);
    componentBoxes[key].right = Math.max(componentBoxes[key].right, right);
    componentBoxes[key].bottom = Math.max(componentBoxes[key].bottom, bottom);
  });
  board.querySelectorAll('.ef-component-frame').forEach((frame) => {
    const box = componentBoxes[frame.dataset.component || '__ungrouped_capability__'];
    if (!box) return;
    frame.style.left = `${box.left}px`;
    frame.style.top = `${box.top}px`;
    frame.style.width = `${box.right - box.left}px`;
    frame.style.height = `${box.bottom - box.top}px`;
  });
  board.querySelectorAll('.ef-component-title').forEach((title) => {
    const box = componentBoxes[title.dataset.componentLabel || '__ungrouped_capability__'];
    if (!box) return;
    title.style.left = `${box.left + 18}px`;
    title.style.top = `${box.top + 12}px`;
  });
}

/* ── 节点拖拽（支持多选同步移动） ── */
function startEfNodeDrag(containerId, entityId, e) {
  e.preventDefault();
  efDragMoved = false;
  const entity = S.doc?.entities?.find(en => en.id === entityId);
  if(!entity) return;

  /* 拖动未选中节点时：清除旧选区，仅选中当前节点 */
  if(!efSelectedIds.has(entityId)) {
    efSelectedIds.clear();
    efSelectedIds.add(entityId);
    updateEfSelection(containerId);
  }

  /* 构建多节点拖拽映射 */
  const multiDrag = new Map();
  for(const eid of efSelectedIds) {
    const ent = S.doc?.entities?.find(en => en.id === eid);
    if(ent) multiDrag.set(eid, { entity: ent, origX: ent.pos?.x||0, origY: ent.pos?.y||0 });
  }

  const scale = ZOOM[containerId] || 1;
  efDragState = { containerId, multiDrag,
    startX: e.clientX, startY: e.clientY, scale };
  document.addEventListener('mousemove', onEfNodeDrag);
  document.addEventListener('mouseup',   endEfNodeDrag);
}

function onEfNodeDrag(e) {
  if(!efDragState) return;
  const scale = efDragState.scale || 1;
  const dx = (e.clientX - efDragState.startX) / scale;
  const dy = (e.clientY - efDragState.startY) / scale;
  if(Math.abs(dx) > 3 || Math.abs(dy) > 3) efDragMoved = true;
  if(!efDragMoved) return;
  const dragItems = [...efDragState.multiDrag.values()];
  const minOrigX = Math.min(...dragItems.map((info) => info.origX));
  const minOrigY = Math.min(...dragItems.map((info) => info.origY));
  const safeDx = Math.max(dx, EF_MIN_ENTITY_X - minOrigX);
  const safeDy = Math.max(dy, EF_MIN_ENTITY_Y - minOrigY);
  let neededW = 0, neededH = 0;
  for(const [eid, info] of efDragState.multiDrag) {
    const size = _efGetEntityNodeSize(info.entity);
    const newX = Math.max(EF_MIN_ENTITY_X, info.origX + safeDx);
    const newY = Math.max(EF_MIN_ENTITY_Y, info.origY + safeDy);
    info.entity.pos = {x: newX, y: newY};
    const node = document.querySelector(
      `#ef-canvas-${efDragState.containerId} .ef-node[data-id="${eid}"]`);
    if(node) { node.style.left = newX+'px'; node.style.top = newY+'px'; }
    neededW = Math.max(neededW, newX + size.width + 80);
    neededH = Math.max(neededH, newY + size.height + 100);
  }
  const board = document.getElementById(`ef-board-${efDragState.containerId}`);
  const svgEl = document.getElementById(`ef-svg-${efDragState.containerId}`);
  if(board) {
    if(neededW > parseInt(board.style.width ||'0')) { board.style.width  = neededW+'px'; if(svgEl) svgEl.setAttribute('width',  neededW); }
    if(neededH > parseInt(board.style.height||'0')) { board.style.height = neededH+'px'; if(svgEl) svgEl.setAttribute('height', neededH); }
  }
  updateEfGroupFrames(efDragState.containerId);
  drawEfLines(efDragState.containerId, S.doc?.relations||[]);
}

function endEfNodeDrag(e) {
  if(!efDragState) return;
  document.removeEventListener('mousemove', onEfNodeDrag);
  document.removeEventListener('mouseup',   endEfNodeDrag);
  if(efDragMoved) markModified();
  efDragState = null;
  setTimeout(() => { efDragMoved = false; }, 80);
}

/* ── 背景平移（Pan）── */
function startEfPan(canvas, e) {
  /* 垂直溢出可能在父容器上（如 .live-diagram），水平溢出在 canvas 自身；
     同时记录两者的初始滚动位置，onEfPan 里一起更新。 */
  const parent = canvas.parentElement;
  efPanState = { canvas, parent,
    startX: e.clientX, startY: e.clientY,
    startSL: canvas.scrollLeft,  startST: canvas.scrollTop,
    startPSL: parent?.scrollLeft ?? 0, startPST: parent?.scrollTop ?? 0 };
  canvas.style.cursor = 'grabbing';
  document.addEventListener('mousemove', onEfPan);
  document.addEventListener('mouseup',   endEfPan);
}
function onEfPan(e) {
  if(!efPanState) return;
  const dx = e.clientX - efPanState.startX;
  const dy = e.clientY - efPanState.startY;
  /* 水平：滚动 canvas 自身 */
  efPanState.canvas.scrollLeft = efPanState.startSL  - dx;
  /* 垂直：先尝试 canvas 自身，若不能滚（无溢出）则滚父容器 */
  efPanState.canvas.scrollTop  = efPanState.startST  - dy;
  if(efPanState.parent) {
    efPanState.parent.scrollTop = efPanState.startPST - dy;
  }
}
function endEfPan() {
  if(!efPanState) return;
  efPanState.canvas.style.cursor = '';
  efPanState = null;
  document.removeEventListener('mousemove', onEfPan);
  document.removeEventListener('mouseup',   endEfPan);
}

/* ── 框选（Shift + 拖动背景）── */
function startEfRubber(containerId, canvas, e) {
  const board = document.getElementById(`ef-board-${containerId}`);
  if(!board) return;
  const { x: bx, y: by } = _efGetBoardPoint(containerId, board, e);
  efRubberEl = document.createElement('div');
  efRubberEl.className = 'ef-rubber';
  Object.assign(efRubberEl.style, { left: bx+'px', top: by+'px', width:'0', height:'0' });
  board.appendChild(efRubberEl);
  efRubberState = { containerId, canvas, board, bx0: bx, by0: by };
  document.addEventListener('mousemove', onEfRubber);
  document.addEventListener('mouseup',   endEfRubber);
}
function onEfRubber(e) {
  if(!efRubberState || !efRubberEl) return;
  const { containerId, board, bx0, by0 } = efRubberState;
  const { x: bx1, y: by1 } = _efGetBoardPoint(containerId, board, e);
  efRubberState.bx1 = bx1; efRubberState.by1 = by1;
  const l = Math.min(bx0,bx1), t = Math.min(by0,by1);
  Object.assign(efRubberEl.style, { left:l+'px', top:t+'px',
    width: Math.abs(bx1-bx0)+'px', height: Math.abs(by1-by0)+'px' });
}
function endEfRubber() {
  if(!efRubberState) return;
  const { containerId, board, bx0, by0, bx1=bx0, by1=by0 } = efRubberState;
  const l=Math.min(bx0,bx1), t=Math.min(by0,by1),
        r=Math.max(bx0,bx1), b=Math.max(by0,by1);
  if(r-l > 4 || b-t > 4) {
    efSelectedIds.clear();
    board.querySelectorAll('.ef-node').forEach(node => {
      const nx=node.offsetLeft, ny=node.offsetTop,
            nw=node.offsetWidth, nh=node.offsetHeight;
      if(nx+nw > l && nx < r && ny+nh > t && ny < b) efSelectedIds.add(node.dataset.id);
    });
    updateEfSelection(containerId);
  }
  efRubberEl?.remove(); efRubberEl = null;
  efRubberState = null;
  document.removeEventListener('mousemove', onEfRubber);
  document.removeEventListener('mouseup',   endEfRubber);
}

function resetEfLayout() {
  if(!S.doc?.entities?.length) return;
  for(const e of S.doc.entities) delete e.pos;
  markModified();
  renderEntityDiagramNow();
}

function isEntityRelationEditorCollapsed() {
  return S.ui.entityRelationEditorCollapsed !== false;
}

function setEntityRelationEditorCollapsed(collapsed) {
  S.ui.entityRelationEditorCollapsed = Boolean(collapsed);
  renderDataTab();
}

function toggleEntityRelationEditor(forceOpen = null) {
  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : isEntityRelationEditorCollapsed();
  if (shouldOpen && !currentEntity()) {
    S.ui.entityId = S.doc?.entities?.[0]?.id || null;
  }
  setEntityRelationEditorCollapsed(!shouldOpen);
}

function selectEntityInRelationGraph(entityId, options = {}) {
  const id = String(entityId || '').trim();
  if (!id) return;
  S.ui.entityId = id;
  if (options.openEditor === true) {
    S.ui.entityRelationEditorCollapsed = false;
  }
  renderDataTab();
}

function renderEntityFlow(containerId, doc, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  const entities  = doc?.entities||[];
  const relations = doc?.relations||[];
  if(!entities.length) {
    el.innerHTML = `<div class="diag-empty">暂无实体，点击上方"新建实体"</div>`;
    initZoom(containerId);
    return;
  }

  /* 确保每个实体都有 pos（首次打开时自动计算布局） */
  const defaultPosMap = _efComputeDefaultPos(entities, relations);
  for(const e of entities) {
    if(!e.pos) e.pos = defaultPosMap[e.id] || {x: EF_PAD, y: EF_PAD};
  }

  const focusEntityId = containerId === 'entity-diagram' ? S.ui.entityId : null;
  const focusRelatedIds = _efGetFocusRelatedIds(relations, focusEntityId);
  const { groupFrames, componentFrames } = _efEnsureFrameViewportPadding(entities);

  /* 颜色索引（按业务构件分配，无构件的用第0色） */
  const grpMap = {};
  let ci = 0;
  for(const e of entities) {
    const g = getEntityModelMeta(e).constructKey;
    if(!(g in grpMap)) { grpMap[g] = ci % ROLE_COLORS.length; ci++; }
  }

  /* 计算画板尺寸（容纳所有节点 + 留出 U 形弯道空间） */
  let boardW = 400, boardH = 200;
  for(const e of entities) {
    const size = _efGetEntityNodeSize(e);
    boardW = Math.max(boardW, (e.pos.x||0) + size.width + 80);
    boardH = Math.max(boardH, (e.pos.y||0) + size.height + 100);
  }
  for(const frame of groupFrames) {
    boardW = Math.max(boardW, frame.right + EF_PAD);
    boardH = Math.max(boardH, frame.bottom + EF_PAD);
  }
  for(const frame of componentFrames) {
    boardW = Math.max(boardW, frame.right + EF_PAD);
    boardH = Math.max(boardH, frame.bottom + EF_PAD);
  }

  const isDraggable = (containerId === 'entity-diagram');

  let h = `<div class="ef-canvas" id="ef-canvas-${containerId}">`;
  h += `<div class="ef-board" id="ef-board-${containerId}" style="width:${boardW}px;height:${boardH}px">`;

  for(const frame of componentFrames) {
    h += `<div class="ef-component-frame" data-component="${esc(frame.key)}"
      style="left:${frame.left}px;top:${frame.top}px;width:${frame.right-frame.left}px;height:${frame.bottom-frame.top}px;">
    </div>`;
  }

  for(const frame of groupFrames) {
    const idx = grpMap[frame.group] ?? 0;
    const c = ROLE_COLORS[idx];
    h += `<div class="ef-group-frame" data-group="${esc(frame.group)}" data-component="${esc(frame.componentKey)}"
      style="left:${frame.left}px;top:${frame.top}px;width:${frame.right-frame.left}px;height:${frame.bottom-frame.top}px;
      --ef-group-fill:${c.fill}22;--ef-group-stroke:${c.stroke};">
      <div class="ef-group-title">${esc(frame.label)}</div>
    </div>`;
  }

  for(const frame of componentFrames) {
    h += `<div class="ef-component-title" data-component-label="${esc(frame.key)}"
      style="left:${frame.left + 18}px;top:${frame.top + 12}px;">${esc(frame.label)}</div>`;
  }

  h += `<svg class="ef-svg" id="ef-svg-${containerId}" width="${boardW}" height="${boardH}"></svg>`;

  for(const e of entities) {
    const meta = getEntityModelMeta(e);
    const idx = grpMap[meta.constructKey];
    const c   = ROLE_COLORS[idx];
    const size = _efGetEntityNodeSize(e);
    const clickable = onClickMap?.[e.id] ? ' ef-clickable' : '';
    const draggable = isDraggable ? ' ef-draggable' : '';
    const focusCls = focusEntityId
      ? (e.id === focusEntityId ? ' ef-focus' : (focusRelatedIds.has(e.id) ? ' ef-neighbor' : ' ef-muted'))
      : '';
    h += `<div class="ef-node${clickable}${draggable}${focusCls}" data-id="${e.id}" data-group="${esc(meta.constructKey)}" data-component="${esc(meta.capabilityKey)}"
      style="left:${e.pos.x}px;top:${e.pos.y}px;width:${size.width}px;height:${size.height}px;background:${c.fill};border-color:${c.stroke};color:${c.color}">`;
    h += `<span class="ef-nname">${esc(e.name||'未命名实体')}</span>`;
    h += `</div>`;
  }

  h += `</div></div>`; /* ef-board, ef-canvas */

  el.innerHTML = h;

  const canvas = document.getElementById(`ef-canvas-${containerId}`);
  ensureEntityRelationShortcuts();

  /* ── 节点交互 ── */
  for(const e of entities) {
    const node = el.querySelector(`.ef-node[data-id="${e.id}"]`);
    if(!node) continue;
    if(onClickMap?.[e.id]) {
      node.addEventListener('click', ev => {
        if(efDragMoved) return;
        if(ev.ctrlKey || ev.metaKey) {
          /* Ctrl+点击：切换选中 */
          if(efSelectedIds.has(e.id)) efSelectedIds.delete(e.id);
          else efSelectedIds.add(e.id);
          updateEfSelection(containerId);
        } else {
          onClickMap[e.id]();
        }
      });
    }
    if(isDraggable) {
      node.addEventListener('mousedown', ev => {
        if(ev.ctrlKey || ev.metaKey) return; /* Ctrl+drag 不移动 */
        if(ev.shiftKey) {
          ev.preventDefault();
          ev.stopPropagation();
          startEfRubber(containerId, canvas, ev);
          return;
        }
        ev.stopPropagation();                /* 阻止冒泡到背景 */
        startEfNodeDrag(containerId, e.id, ev);
      });
    }
  }

  /* ── 背景交互：平移 or 框选 ── */
  if(canvas) {
    canvas.addEventListener('mousedown', ev => {
      if(ev.target !== canvas && !ev.target.classList.contains('ef-board')) return;
      ev.preventDefault();
      if(ev.shiftKey) {
        /* Shift+拖：框选 */
        startEfRubber(containerId, canvas, ev);
      } else {
        /* 普通拖：平移视口 */
        efSelectedIds.clear();
        updateEfSelection(containerId);
        startEfPan(canvas, ev);
      }
    });
  }

  /* 恢复选中状态的视觉显示（切换 tab 后重建 DOM 时保留） */
  updateEfSelection(containerId);

  initZoom(containerId);
  if(ZOOM[containerId] && ZOOM[containerId] !== 1) applyZoom(containerId);

  /* 等 DOM 渲染完后画连接线 */
  requestAnimationFrame(() => drawEfLines(containerId, relations));
}

function drawEfLines(containerId, relations) {
  const board = document.getElementById(`ef-board-${containerId}`);
  const svg   = document.getElementById(`ef-svg-${containerId}`);
  if(!board || !svg) return;
  const entityMap = new Map((S.doc?.entities||[]).map(entity => [entity.id, entity]));
  const focusEntityId = containerId === 'entity-diagram' ? S.ui.entityId : null;

  /* 节点矩形（board 坐标系，offsetLeft/offsetTop 直接可用） */
  function nr(id) {
    const el = board.querySelector(`.ef-node[data-id="${id}"]`);
    if(!el) return null;
    const l = el.offsetLeft, t = el.offsetTop;
    const w = el.offsetWidth, h = el.offsetHeight;
    return {l, t, r:l+w, b:t+h, cx:l+w/2, cy:t+h/2, w, h};
  }

  const rl = {'1:1':'1:1','1:N':'1:N','N:N':'N:N'};
  const markerId = `arr-${containerId.replace(/\W/g,'_')}`;

  /* 通道计数器，防止多条线重叠 */
  const chanCount = {};
  function chanIdx(key) { const i = chanCount[key]||0; chanCount[key]=i+1; return i; }

  const STROKE_COLORS = ['#3b82f6','#22c55e','#eab308','#ec4899','#8b5cf6','#f97316'];
  let pathsHtml = '';

  relations.forEach((rel, ri) => {
    const A = nr(rel.from), B = nr(rel.to);
    if(!A||!B) return;

    const color = STROKE_COLORS[ri % STROKE_COLORS.length];
    const lbl   = (rl[rel.type]||rel.type||'') + (rel.label ? ` ${rel.label}` : '');
    const fromGroup = getEntityModelMeta(entityMap.get(rel.from)).constructKey;
    const toGroup = getEntityModelMeta(entityMap.get(rel.to)).constructKey;
    const isCrossGroup = fromGroup !== toGroup;
    const isFocusRelation = !!focusEntityId && (rel.from === focusEntityId || rel.to === focusEntityId);
    const relationOpacity = focusEntityId ? (isFocusRelation ? 0.96 : 0.16) : (isCrossGroup ? 0.3 : 0.82);
    const relationWidth = focusEntityId ? (isFocusRelation ? 2.4 : 1.1) : (isCrossGroup ? 1.1 : 1.7);
    const dash  = (rel.type==='N:N' || isCrossGroup) ? 'stroke-dasharray="5,3"' : '';
    const labelOpacity = focusEntityId ? (isFocusRelation ? 0.98 : 0.14) : (isCrossGroup ? 0.4 : 0.78);

    let pathD, lx, ly;

    /* ── 自关联：从右侧出发画矩形小环，绕开节点本体 ── */
    if(rel.from === rel.to) {
      const idx     = chanIdx(`self-${rel.from}`);
      const loopW   = 28 + idx * 22;          /* 多条自关联向右依次展开 */
      const loopH   = Math.max(12, A.h / 3);  /* 环的半高，至少 12px */
      const exitY   = A.cy - loopH;           /* 从右侧偏上出发 */
      const enterY  = A.cy + loopH;           /* 从右侧偏下回入 */
      pathD = `M ${A.r} ${exitY} L ${A.r+loopW} ${exitY} L ${A.r+loopW} ${enterY} L ${A.r} ${enterY}`;
      lx = A.r + loopW + 4;
      ly = A.cy + 4;
      pathsHtml += `<path class="ef-rel${isCrossGroup?' ef-rel-cross':''}${isFocusRelation?' ef-rel-focus':''}${focusEntityId&&!isFocusRelation?' ef-rel-muted':''}"
        data-rel-index="${ri}" data-rel-from="${esc(rel.from)}" data-rel-to="${esc(rel.to)}"
        data-cross-group="${isCrossGroup}" data-related="${!focusEntityId || isFocusRelation}"
        d="${pathD}" stroke="${color}" stroke-width="${relationWidth}" stroke-opacity="${relationOpacity}" fill="none" ${dash} marker-end="url(#${markerId}-${ri})"/>`;
      if(lbl) pathsHtml += `<text x="${lx}" y="${ly}" text-anchor="start" font-size="10" fill="${color}" fill-opacity="${labelOpacity}">${esc(lbl)}</text>`;
      return;   /* 跳过后续通用路由 */
    }

    const dx    = B.cx - A.cx;
    const dy    = B.cy - A.cy;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    /* ── 场景1：同行（垂直差 < 节点高）→ 水平直线侧边连接 ── */
    if(absDy < EF_NODE_H + 4) {
      const key   = `h-${Math.round((A.cy + B.cy) / 2 / 8) * 8}`;
      const depth = chanIdx(key);
      /* 多条平行线上下错开 8px */
      const yOff  = (depth % 2 === 0 ? 1 : -1) * Math.ceil(depth / 2) * 8;
      const yCen  = (A.cy + B.cy) / 2 + yOff;

      if(dx >= 0) {
        /* A 在左，B 在右 */
        pathD = `M ${A.r} ${A.cy} L ${A.r+4} ${A.cy} L ${A.r+4} ${yCen} L ${B.l-4} ${yCen} L ${B.l-4} ${B.cy} L ${B.l} ${B.cy}`;
      } else {
        /* A 在右，B 在左 */
        pathD = `M ${A.l} ${A.cy} L ${A.l-4} ${A.cy} L ${A.l-4} ${yCen} L ${B.r+4} ${yCen} L ${B.r+4} ${B.cy} L ${B.r} ${B.cy}`;
      }
      lx = (A.cx + B.cx) / 2; ly = yCen - 8;

    /* ── 场景2：主方向垂直（|dy|>|dx|）→ 上下出边 L 形 ── */
    } else if(absDy >= absDx) {
      const goDown = dy > 0;
      const sy = goDown ? A.b : A.t;
      const ey = goDown ? B.t : B.b;
      const chanMid = (sy + ey) / 2;
      const key  = `v-${Math.round(Math.min(sy,ey))}-${Math.round(Math.max(sy,ey))}`;
      const idx  = chanIdx(key);
      const sign = idx % 2 === 0 ? 1 : -1;
      const yM   = chanMid + sign * Math.ceil(idx / 2) * 10;
      pathD = `M ${A.cx} ${sy} L ${A.cx} ${yM} L ${B.cx} ${yM} L ${B.cx} ${ey}`;
      lx = (A.cx + B.cx) / 2; ly = yM - 6;

    /* ── 场景3：主方向水平（|dx|>|dy|）→ 左右出边 L 形 ── */
    } else {
      const goRight = dx > 0;
      const sx = goRight ? A.r : A.l;
      const ex = goRight ? B.l : B.r;
      const chanMid = (sx + ex) / 2;
      const key  = `r-${Math.round(Math.min(sx,ex))}-${Math.round(Math.max(sx,ex))}`;
      const idx  = chanIdx(key);
      const sign = idx % 2 === 0 ? 1 : -1;
      const xM   = chanMid + sign * Math.ceil(idx / 2) * 10;
      pathD = `M ${sx} ${A.cy} L ${xM} ${A.cy} L ${xM} ${B.cy} L ${ex} ${B.cy}`;
      lx = xM + 8; ly = (A.cy + B.cy) / 2 - 4;
    }

    pathsHtml += `<path class="ef-rel${isCrossGroup?' ef-rel-cross':''}${isFocusRelation?' ef-rel-focus':''}${focusEntityId&&!isFocusRelation?' ef-rel-muted':''}"
      data-rel-index="${ri}" data-rel-from="${esc(rel.from)}" data-rel-to="${esc(rel.to)}"
      data-cross-group="${isCrossGroup}" data-related="${!focusEntityId || isFocusRelation}"
      d="${pathD}" stroke="${color}" stroke-width="${relationWidth}" stroke-opacity="${relationOpacity}" fill="none" ${dash} marker-end="url(#${markerId}-${ri})"/>`;
    if(lbl) pathsHtml += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="10" fill="${color}" fill-opacity="${labelOpacity}">${esc(lbl)}</text>`;
  });

  const markerDefs = relations.map((rel,ri)=>{
    const color = STROKE_COLORS[ri%STROKE_COLORS.length];
    return `<marker id="${markerId}-${ri}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="${color}"/>
    </marker>`;
  }).join('');

  svg.innerHTML = `<defs>${markerDefs}</defs>${pathsHtml}`;
  svg.querySelectorAll('.ef-rel[data-rel-from][data-rel-to]').forEach((path) => {
    path.addEventListener('click', (event) => {
      event.stopPropagation();
      const fromId = path.dataset.relFrom || '';
      const toId = path.dataset.relTo || '';
      efSelectedIds.clear();
      if (fromId) efSelectedIds.add(fromId);
      if (toId) efSelectedIds.add(toId);
      const shouldKeepEditorOpen = !isEntityRelationEditorCollapsed();
      selectEntityInRelationGraph(fromId || toId, { openEditor: shouldKeepEditorOpen });
    });
  });
}

/* 实体图颜色：按业务构件分配，无构件的用第0色 */
function buildEntityMermaid(doc) {
  const entities = doc?.entities||[];
  if(!entities.length) return null;
  const relations = doc?.relations||[];

  /* 业务构件 → 颜色索引 */
  const grpMap = {};
  let ci = 0;
  for(const e of entities) {
    const g = getEntityModelMeta(e, doc).constructKey;
    if(!(g in grpMap)) { grpMap[g] = ci % ROLE_COLORS.length; ci++; }
  }

  const lines = ['flowchart LR'];
  /* classDef */
  Object.values(grpMap).forEach(idx => {
    const c = ROLE_COLORS[idx];
    lines.push(`  classDef ec${idx} fill:${c.fill},stroke:${c.stroke},color:${c.color},stroke-width:2px`);
  });

  for(const e of entities) {
    const n   = (e.name||e.id).replace(/"/g,"'");
    const idx = grpMap[getEntityModelMeta(e, doc).constructKey];
    lines.push(`  ${e.id}["${n}"]:::ec${idx}`);
  }
  const rl = {'1:1':'1对1','1:N':'1对多','N:N':'多对多'};
  for(const r of relations) {
    const lbl = (rl[r.type]||r.type) + (r.label?`\\n${r.label}`:'');
    lines.push(`  ${r.from} -- "${lbl}" --> ${r.to}`);
  }
  return lines.join('\n');
}


function setDataView(view, navOptions = {}) {
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'data';
    next.dataView = view;
    if (view === 'state') {
      const entities = S.doc?.entities || [];
      if (!entities.length) {
        next.entityId = null;
        next.stateFieldName = '';
      } else {
        const currentEntityId = next.entityId;
        const activeEntity = entities.find((item) => item.id === currentEntityId) || null;
        const fallbackEntity = activeEntity || entities.find((item) => getEntityStatusField(item)) || entities[0];
        next.entityId = fallbackEntity?.id || null;
        next.stateFieldName = getEntityStatusField(fallbackEntity, next.stateFieldName)?.name || '';
      }
    }
    return next;
  }, navOptions);
  S.ui.dataView = view;
  if (view === 'state') {
    S.ui.stateEditorCollapsed = true;
    const entities = S.doc?.entities || [];
    if (!entities.length) {
      S.ui.entityId = null;
      S.ui.stateFieldName = '';
    } else if (!currentEntity()) {
      const nextEntity = entities.find((item) => getEntityStatusField(item)) || entities[0];
      S.ui.entityId = nextEntity.id;
      S.ui.stateFieldName = getEntityStatusField(nextEntity)?.name || '';
    } else {
      S.ui.stateFieldName = getEntityStatusField(currentEntity(), S.ui.stateFieldName)?.name || '';
    }
  }
  renderDataTab();
}

function setStateEntity(entityId, navOptions = {}) {
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'data';
    next.dataView = 'state';
    next.entityId = entityId;
    const entity = (S.doc?.entities || []).find((item) => item.id === entityId) || null;
    next.stateFieldName = getEntityStatusField(entity, '')?.name || '';
    return next;
  }, navOptions);
  S.ui.entityId = entityId;
  S.ui.stateFieldName = getEntityStatusField(currentEntity(), '')?.name || '';
  rerenderStateWorkbenchView({ revealActiveField: true });
}

function setStateFieldView(entityId, fieldName) {
  const entity = S.doc.entities.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  S.ui.stateFieldName = getEntityStatusField(entity, fieldName)?.name || '';
  rerenderStateWorkbenchView({
    focusSelector: '[data-testid="entity-state-field-select"]',
    revealActiveField: true,
  });
}

function applyEntityFieldStatusRole(entity, fieldIndex, nextRole) {
  if (!entity || !entity.fields?.[fieldIndex]) return;
  ensureEntityStateShape(entity);
  entity.fields.forEach((field) => syncFieldStatusRole(field));
  if (normalizeStatusRole(nextRole) === 'primary') {
    entity.fields.forEach((field, index) => {
      if (index !== fieldIndex && getFieldStatusRole(field) === 'primary') {
        syncFieldStatusRole(field, 'secondary');
      }
    });
  }
  const targetField = entity.fields[fieldIndex];
  syncFieldStatusRole(targetField, nextRole);
  if (getFieldStatusRole(targetField)) {
    const inferredStateValueText = inferStateValuesFromNote(targetField.note || '').join('/');
    if (inferredStateValueText) {
      targetField.state_values = inferredStateValueText;
    }
  }
  const preferredFieldName = normalizeStatusRole(nextRole) === 'primary'
    ? targetField.name
    : (S.ui.stateFieldName || targetField.name);
  S.ui.stateFieldName = getEntityStatusField(entity, preferredFieldName)?.name || '';
}

function updateFieldStatusRole(entityId, idx, role) {
  setField(entityId, idx, 'status_role', role);
  rerenderEntityEditor({
    focusSelector: `[data-testid="entity-status-role-${idx}"]`,
    selectText: false,
  });
}

const STATE_FIELD_REVEAL_PADDING = 18;

function getActiveStateOverviewFieldPanel(fieldName = S.ui.stateFieldName) {
  const targetFieldName = String(fieldName || '').trim();
  const panels = Array.from(document.querySelectorAll('.entity-state-field-panel'));
  if (!panels.length) return null;
  return panels.find((panel) => String(panel.dataset.fieldName || '') === targetFieldName)
    || panels.find((panel) => panel.classList.contains('active'))
    || panels[0];
}

function revealActiveStateOverviewFieldPanel(fieldName = S.ui.stateFieldName) {
  const overview = document.querySelector('.entity-state-main-shell');
  const targetPanel = getActiveStateOverviewFieldPanel(fieldName);
  if (!overview || !targetPanel) return;
  const maxScrollTop = Math.max(0, overview.scrollHeight - overview.clientHeight);
  if (maxScrollTop <= 0) return;

  const overviewRect = overview.getBoundingClientRect();
  const panelRect = targetPanel.getBoundingClientRect();
  const panelTop = panelRect.top - overviewRect.top + overview.scrollTop;
  const panelBottom = panelTop + panelRect.height;
  const visibleTop = overview.scrollTop;
  const visibleBottom = visibleTop + overview.clientHeight;
  const paddedTop = visibleTop + STATE_FIELD_REVEAL_PADDING;
  const paddedBottom = visibleBottom - STATE_FIELD_REVEAL_PADDING;

  let nextScrollTop = visibleTop;
  if (panelRect.height + STATE_FIELD_REVEAL_PADDING * 2 >= overview.clientHeight) {
    if (panelTop < paddedTop || panelBottom > paddedBottom) {
      nextScrollTop = panelTop - STATE_FIELD_REVEAL_PADDING;
    }
  } else if (panelTop < paddedTop) {
    nextScrollTop = panelTop - STATE_FIELD_REVEAL_PADDING;
  } else if (panelBottom > paddedBottom) {
    nextScrollTop = panelBottom - overview.clientHeight + STATE_FIELD_REVEAL_PADDING;
  }

  nextScrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
  if (Math.abs(nextScrollTop - visibleTop) > 1) {
    overview.scrollTop = nextScrollTop;
  }
}

function rerenderStateWorkbenchView(focusConfig = '') {
  const options = typeof focusConfig === 'string'
    ? { focusSelector: focusConfig }
    : (focusConfig || {});
  const focusSelector = String(options.focusSelector || '');
  const revealActiveField = Boolean(options.revealActiveField);
  const revealFieldName = String(options.revealFieldName || S.ui.stateFieldName || '').trim();
  const activeElement = document.activeElement;
  const selection = options.selection
    || (
      focusSelector
      && activeElement
      && typeof activeElement.matches === 'function'
      && activeElement.matches(focusSelector)
      && typeof activeElement.selectionStart === 'number'
        ? {
          start: activeElement.selectionStart,
          end: activeElement.selectionEnd,
          direction: activeElement.selectionDirection || 'none',
        }
        : null
    );
  const browser = document.querySelector('.entity-state-browser');
  const overview = document.querySelector('.entity-state-main-shell');
  const editorBody = document.querySelector('.state-editor-drawer .drawer-body');
  const pageRoot = document.scrollingElement || document.documentElement;
  const browserScrollTop = browser?.scrollTop || 0;
  const overviewScrollTop = overview?.scrollTop || 0;
  const editorScrollTop = editorBody?.scrollTop || 0;
  const pageScrollTop = pageRoot?.scrollTop || 0;
  const pageScrollLeft = pageRoot?.scrollLeft || 0;
  renderDataTab();
  requestAnimationFrame(() => {
    const nextBrowser = document.querySelector('.entity-state-browser');
    const nextOverview = document.querySelector('.entity-state-main-shell');
    const nextEditorBody = document.querySelector('.state-editor-drawer .drawer-body');
    const nextPageRoot = document.scrollingElement || document.documentElement;
    if (nextBrowser) nextBrowser.scrollTop = browserScrollTop;
    if (nextOverview) nextOverview.scrollTop = overviewScrollTop;
    if (nextEditorBody) nextEditorBody.scrollTop = editorScrollTop;
    if (nextPageRoot) {
      nextPageRoot.scrollTop = pageScrollTop;
      nextPageRoot.scrollLeft = pageScrollLeft;
    }
    if (focusSelector) {
      const focusTarget = document.querySelector(focusSelector);
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true });
        if (selection && typeof focusTarget.setSelectionRange === 'function') {
          const valueLength = String(focusTarget.value || '').length;
          const start = Math.min(selection.start ?? valueLength, valueLength);
          const end = Math.min(selection.end ?? start, valueLength);
          focusTarget.setSelectionRange(start, end, selection.direction || 'none');
        }
      }
    }
    if (revealActiveField) {
      revealActiveStateOverviewFieldPanel(revealFieldName);
    }
  });
}

function setStateNodeKind(entityId, fieldName, stateName, kind, nodeIndex) {
  const entity = S.doc.entities.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  const field = (entity.fields || []).find((item) => String(item?.name || '') === String(fieldName || ''));
  if (!field) return;
  const nodes = syncFieldStateNodes(field);
  const targetNode = Number.isInteger(nodeIndex) && nodeIndex >= 0 && nodeIndex < nodes.length
    ? nodes[nodeIndex]
    : nodes.find((item) => String(item?.name || '') === String(stateName || ''));
  if (!targetNode) return;
  targetNode.kind = normalizeStateNodeKind(kind);
  markModified();
  rerenderStateWorkbenchView(Number.isInteger(nodeIndex) ? `[data-testid="entity-state-kind-${nodeIndex}"]` : '');
}

function getStateLayoutField(entityId, fieldName) {
  const entity = S.doc?.entities?.find((item) => item.id === entityId);
  if (!entity) return null;
  ensureEntityStateShape(entity);
  return getEntityStatusField(entity, fieldName);
}

function setStateLayoutPosition(entityId, fieldName, stateName, dragKind, point) {
  const field = getStateLayoutField(entityId, fieldName);
  if (!field) return false;
  const nodes = syncFieldStateNodes(field);
  const targetNode = nodes.find((item) => String(item?.name || '') === String(stateName || ''));
  if (!targetNode) return false;
  const nextPoint = normalizeOptionalGraphOffset(point);
  if (!nextPoint) return false;
  if (dragKind === 'marker') {
    targetNode.markerPos = nextPoint;
  } else {
    targetNode.pos = nextPoint;
  }
  return true;
}

function startStateNodeDrag(entityId, fieldName, stateName, dragKind, event) {
  if (event.button !== 0) return;
  const target = event.currentTarget;
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  stateNodeDragMoved = false;
  stateNodeDragState = {
    entityId,
    fieldName,
    stateName,
    dragKind: dragKind === 'marker' ? 'marker' : 'node',
    target,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: Number.parseFloat(target.style.left) || target.offsetLeft || 0,
    startTop: Number.parseFloat(target.style.top) || target.offsetTop || 0,
    width: target.offsetWidth || 0,
    height: target.offsetHeight || 0,
  };
  target.classList.add('dragging');
  document.addEventListener('mousemove', onStateNodeDrag);
  document.addEventListener('mouseup', endStateNodeDrag);
}

function onStateNodeDrag(event) {
  if (!stateNodeDragState) return;
  const zoom = getStateDiagramZoom() || 1;
  const dx = (event.clientX - stateNodeDragState.startX) / zoom;
  const dy = (event.clientY - stateNodeDragState.startY) / zoom;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) stateNodeDragMoved = true;
  if (!stateNodeDragMoved) return;
  const nextLeft = Math.max(4, Math.round(stateNodeDragState.startLeft + dx));
  const nextTop = Math.max(4, Math.round(stateNodeDragState.startTop + dy));
  stateNodeDragState.target.style.left = `${nextLeft}px`;
  stateNodeDragState.target.style.top = `${nextTop}px`;
}

function endStateNodeDrag(event) {
  if (!stateNodeDragState) return;
  const dragState = stateNodeDragState;
  const zoom = getStateDiagramZoom() || 1;
  const dx = (event.clientX - dragState.startX) / zoom;
  const dy = (event.clientY - dragState.startY) / zoom;
  document.removeEventListener('mousemove', onStateNodeDrag);
  document.removeEventListener('mouseup', endStateNodeDrag);
  stateNodeDragState = null;
  dragState.target.classList.remove('dragging');
  if (!stateNodeDragMoved && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
  const left = Math.max(4, Math.round(dragState.startLeft + dx));
  const top = Math.max(4, Math.round(dragState.startTop + dy));
  const point = dragState.dragKind === 'marker'
    ? {
      x: left + Math.round((dragState.width || 0) / 2),
      y: top + Math.round((dragState.height || 0) / 2),
    }
    : { x: left, y: top };
  if (!setStateLayoutPosition(dragState.entityId, dragState.fieldName, dragState.stateName, dragState.dragKind, point)) return;
  markModified();
  rerenderStateWorkbenchView();
}

function setStateTransitionLabelPosition(entityId, transitionIndex, point) {
  const entity = S.doc?.entities?.find((item) => item.id === entityId);
  if (!entity) return false;
  ensureEntityStateShape(entity);
  const target = entity.state_transitions[transitionIndex];
  if (!target) return false;
  const nextPoint = normalizeOptionalGraphOffset(point);
  if (!nextPoint) return false;
  target.labelPos = nextPoint;
  return true;
}

function normalizeStateTransitionWaypoints(waypoints) {
  return Array.isArray(waypoints)
    ? waypoints
      .map((point) => normalizeOptionalGraphOffset(point))
      .filter(Boolean)
    : [];
}

function normalizeStateTransitionAnchor(anchor) {
  return ['auto', 'top', 'right', 'bottom', 'left'].includes(anchor) ? anchor : 'auto';
}

function getStateTransitionRoute(transition) {
  const route = transition && typeof transition.route === 'object' ? transition.route : {};
  return {
    mode: route.mode === 'manual' || normalizeStateTransitionWaypoints(route.waypoints).length || normalizeStateTransitionWaypoints(transition?.waypoints).length
      ? 'manual'
      : 'auto',
    fromAnchor: normalizeStateTransitionAnchor(route.fromAnchor),
    toAnchor: normalizeStateTransitionAnchor(route.toAnchor),
    waypoints: normalizeStateTransitionWaypoints(route.waypoints || transition?.waypoints),
  };
}

function hasManualStateTransitionRoute(transition) {
  const route = getStateTransitionRoute(transition);
  return route.mode === 'manual'
    && Boolean(route.waypoints.length || route.fromAnchor !== 'auto' || route.toAnchor !== 'auto');
}

function applyStateTransitionRoute(target, route = {}) {
  const nextWaypoints = normalizeStateTransitionWaypoints(route.waypoints);
  const fromAnchor = normalizeStateTransitionAnchor(route.fromAnchor);
  const toAnchor = normalizeStateTransitionAnchor(route.toAnchor);
  const manual = nextWaypoints.length || fromAnchor !== 'auto' || toAnchor !== 'auto';
  delete target.waypoints;
  if (!manual) {
    delete target.route;
    return;
  }
  target.route = {
    mode: 'manual',
    fromAnchor,
    toAnchor,
    waypoints: nextWaypoints,
  };
}

function setStateTransitionWaypoints(entityId, transitionIndex, waypoints) {
  const entity = S.doc?.entities?.find((item) => item.id === entityId);
  if (!entity) return false;
  ensureEntityStateShape(entity);
  const target = entity.state_transitions[transitionIndex];
  if (!target) return false;
  const current = getStateTransitionRoute(target);
  applyStateTransitionRoute(target, {
    ...current,
    mode: 'manual',
    waypoints,
  });
  return true;
}

function resetStateTransitionRoute(entityId, transitionIndex) {
  const entity = S.doc?.entities?.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  const target = entity.state_transitions[transitionIndex];
  if (!target) return;
  applyStateTransitionRoute(target, {});
  markModified();
  rerenderStateWorkbenchView();
}

function resetAllStateTransitionRoutes(entityId, fieldName = '') {
  const entity = S.doc?.entities?.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  let changed = false;
  getEntityStateTransitions(entity, fieldName).forEach(({ transition }) => {
    if (!transition?.route && !transition?.waypoints) return;
    applyStateTransitionRoute(transition, {});
    changed = true;
  });
  if (!changed) return;
  markModified();
  rerenderStateWorkbenchView();
}

function selectStateTransition(transitionIndex, event = null) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  selectedStateTransitionIndex = Number.isInteger(Number(transitionIndex)) ? Number(transitionIndex) : null;
  rerenderStateWorkbenchView();
}

function startStateTransitionRouteDrag(entityId, fieldName, transitionIndex, segmentIndex, event) {
  if (stateTransitionRouteDragState) return;
  if (event.button !== 0) return;
  const hitTarget = event.currentTarget;
  if (!hitTarget) return;
  const rawPoints = String(hitTarget.dataset.points || '')
    .split(' ')
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })
    .filter(Boolean);
  const safeSegmentIndex = Number(segmentIndex);
  if (rawPoints.length < 2 || !Number.isInteger(safeSegmentIndex)) return;
  event.preventDefault();
  event.stopPropagation();
  selectedStateTransitionIndex = Number(transitionIndex);
  stateTransitionRouteDragMoved = false;
  stateTransitionRouteDragState = {
    entityId,
    fieldName,
    transitionIndex: Number(transitionIndex),
    segmentIndex: safeSegmentIndex,
    points: rawPoints,
    hitTarget,
    startX: event.clientX,
    startY: event.clientY,
  };
  hitTarget.classList.add('dragging');
  document.addEventListener('mousemove', onStateTransitionRouteDrag);
  document.addEventListener('mouseup', endStateTransitionRouteDrag);
  document.addEventListener('pointermove', onStateTransitionRouteDrag);
  document.addEventListener('pointerup', endStateTransitionRouteDrag);
}

function onStateTransitionRouteDrag(event) {
  if (!stateTransitionRouteDragState) return;
  const zoom = getStateDiagramZoom() || 1;
  const dx = (event.clientX - stateTransitionRouteDragState.startX) / zoom;
  const dy = (event.clientY - stateTransitionRouteDragState.startY) / zoom;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) stateTransitionRouteDragMoved = true;
  if (!stateTransitionRouteDragMoved) return;
  stateTransitionRouteDragState.hitTarget.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
}

function endStateTransitionRouteDrag(event) {
  if (!stateTransitionRouteDragState) return;
  const dragState = stateTransitionRouteDragState;
  const zoom = getStateDiagramZoom() || 1;
  const dx = Math.round((event.clientX - dragState.startX) / zoom);
  const dy = Math.round((event.clientY - dragState.startY) / zoom);
  document.removeEventListener('mousemove', onStateTransitionRouteDrag);
  document.removeEventListener('mouseup', endStateTransitionRouteDrag);
  document.removeEventListener('pointermove', onStateTransitionRouteDrag);
  document.removeEventListener('pointerup', endStateTransitionRouteDrag);
  stateTransitionRouteDragState = null;
  dragState.hitTarget.classList.remove('dragging');
  dragState.hitTarget.style.transform = '';
  if (!stateTransitionRouteDragMoved && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) {
    rerenderStateWorkbenchView();
    return;
  }
  const nextPoints = dragState.points.map((point) => ({ ...point }));
  const start = nextPoints[dragState.segmentIndex];
  const end = nextPoints[dragState.segmentIndex + 1];
  if (!start || !end) return;
  const isHorizontal = Math.abs(start.y - end.y) <= Math.abs(start.x - end.x);
  if (isHorizontal) {
    start.y = Math.max(4, start.y + dy);
    end.y = Math.max(4, end.y + dy);
  } else {
    start.x = Math.max(4, start.x + dx);
    end.x = Math.max(4, end.x + dx);
  }
  let waypoints = nextPoints.slice(1, -1);
  if (!waypoints.length && dragState.points.length === 2) {
    const [sourcePoint, targetPoint] = dragState.points;
    if (isHorizontal) {
      const y = Math.max(4, sourcePoint.y + dy);
      const lead = Math.min(42, Math.max(18, Math.abs(targetPoint.x - sourcePoint.x) / 3));
      waypoints = [
        { x: Math.round(sourcePoint.x + lead), y },
        { x: Math.round(targetPoint.x - lead), y },
      ];
    } else {
      const x = Math.max(4, sourcePoint.x + dx);
      const lead = Math.min(42, Math.max(18, Math.abs(targetPoint.y - sourcePoint.y) / 3));
      waypoints = [
        { x, y: Math.round(sourcePoint.y + lead) },
        { x, y: Math.round(targetPoint.y - lead) },
      ];
    }
  }
  if (!setStateTransitionWaypoints(dragState.entityId, dragState.transitionIndex, waypoints)) return;
  markModified();
  rerenderStateWorkbenchView();
}

function parseStateNodeRect(text) {
  const [x, y, w, h, cx, cy] = String(text || '').split(',').map(Number);
  if (![x, y, w, h, cx, cy].every(Number.isFinite)) return null;
  return { x, y, w, h, cx, cy };
}

function startStateTransitionEndpointDrag(entityId, fieldName, transitionIndex, endpointKind, event) {
  if (stateTransitionEndpointDragState) return;
  if (event.button !== 0) return;
  const target = event.currentTarget;
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  selectedStateTransitionIndex = Number(transitionIndex);
  const rect = parseStateNodeRect(target.dataset.nodeRect || '');
  if (!rect) return;
  stateTransitionEndpointDragMoved = false;
  stateTransitionEndpointDragState = {
    entityId,
    fieldName,
    transitionIndex: Number(transitionIndex),
    endpointKind: endpointKind === 'to' ? 'to' : 'from',
    target,
    rect,
    startX: event.clientX,
    startY: event.clientY,
  };
  target.classList.add('dragging');
  document.addEventListener('mousemove', onStateTransitionEndpointDrag);
  document.addEventListener('mouseup', endStateTransitionEndpointDrag);
  document.addEventListener('pointermove', onStateTransitionEndpointDrag);
  document.addEventListener('pointerup', endStateTransitionEndpointDrag);
}

function onStateTransitionEndpointDrag(event) {
  if (!stateTransitionEndpointDragState) return;
  const zoom = getStateDiagramZoom() || 1;
  const dx = (event.clientX - stateTransitionEndpointDragState.startX) / zoom;
  const dy = (event.clientY - stateTransitionEndpointDragState.startY) / zoom;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) stateTransitionEndpointDragMoved = true;
  if (!stateTransitionEndpointDragMoved) return;
  stateTransitionEndpointDragState.target.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
}

function endStateTransitionEndpointDrag(event) {
  if (!stateTransitionEndpointDragState) return;
  const dragState = stateTransitionEndpointDragState;
  const zoom = getStateDiagramZoom() || 1;
  const dx = Math.round((event.clientX - dragState.startX) / zoom);
  const dy = Math.round((event.clientY - dragState.startY) / zoom);
  document.removeEventListener('mousemove', onStateTransitionEndpointDrag);
  document.removeEventListener('mouseup', endStateTransitionEndpointDrag);
  document.removeEventListener('pointermove', onStateTransitionEndpointDrag);
  document.removeEventListener('pointerup', endStateTransitionEndpointDrag);
  stateTransitionEndpointDragState = null;
  dragState.target.classList.remove('dragging');
  dragState.target.style.transform = '';
  if (!stateTransitionEndpointDragMoved && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
  const entity = S.doc?.entities?.find((item) => item.id === dragState.entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  const transition = entity.state_transitions[dragState.transitionIndex];
  if (!transition) return;
  const handleLeft = Number.parseFloat(dragState.target.style.left || '0') + 6;
  const handleTop = Number.parseFloat(dragState.target.style.top || '0') + 6;
  const pointer = { x: handleLeft + dx, y: handleTop + dy };
  const anchor = getNearestStateAnchor(dragState.rect, pointer);
  const route = getStateTransitionRoute(transition);
  applyStateTransitionRoute(transition, {
    ...route,
    mode: 'manual',
    [dragState.endpointKind === 'to' ? 'toAnchor' : 'fromAnchor']: anchor,
  });
  markModified();
  rerenderStateWorkbenchView();
}

function startStateTransitionLabelDrag(entityId, fieldName, transitionIndex, event) {
  if (event.button !== 0) return;
  const hitTarget = event.currentTarget;
  if (!hitTarget) return;
  event.preventDefault();
  event.stopPropagation();
  const labelX = Number.parseFloat(hitTarget.dataset.labelX || '');
  const labelY = Number.parseFloat(hitTarget.dataset.labelY || '');
  if (!Number.isFinite(labelX) || !Number.isFinite(labelY)) return;
  const visualTarget = hitTarget.classList.contains('entity-state-link-label-hitbox')
    ? hitTarget.closest('.entity-state-canvas')?.querySelector(`.entity-state-link-label-group[data-transition-index="${transitionIndex}"]`)
    : hitTarget;
  stateTransitionLabelDragMoved = false;
  stateTransitionLabelDragState = {
    entityId,
    fieldName,
    transitionIndex: Number(transitionIndex),
    target: visualTarget || hitTarget,
    hitTarget,
    startX: event.clientX,
    startY: event.clientY,
    labelX,
    labelY,
    angle: Number.parseFloat(hitTarget.dataset.labelAngle || '0') || 0,
  };
  hitTarget.classList.add('dragging');
  if (visualTarget && visualTarget !== hitTarget) visualTarget.classList.add('dragging');
  document.addEventListener('mousemove', onStateTransitionLabelDrag);
  document.addEventListener('mouseup', endStateTransitionLabelDrag);
}

function onStateTransitionLabelDrag(event) {
  if (!stateTransitionLabelDragState) return;
  const zoom = getStateDiagramZoom() || 1;
  const dx = (event.clientX - stateTransitionLabelDragState.startX) / zoom;
  const dy = (event.clientY - stateTransitionLabelDragState.startY) / zoom;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) stateTransitionLabelDragMoved = true;
  if (!stateTransitionLabelDragMoved) return;
  const { target, hitTarget, labelX, labelY, angle } = stateTransitionLabelDragState;
  const translate = `translate(${Math.round(dx * 10) / 10} ${Math.round(dy * 10) / 10})`;
  target.setAttribute('transform', `${translate} rotate(${angle} ${labelX} ${labelY})`);
  if (hitTarget && hitTarget !== target) {
    hitTarget.style.transform = translate;
  }
}

function endStateTransitionLabelDrag(event) {
  if (!stateTransitionLabelDragState) return;
  const dragState = stateTransitionLabelDragState;
  const zoom = getStateDiagramZoom() || 1;
  const dx = (event.clientX - dragState.startX) / zoom;
  const dy = (event.clientY - dragState.startY) / zoom;
  document.removeEventListener('mousemove', onStateTransitionLabelDrag);
  document.removeEventListener('mouseup', endStateTransitionLabelDrag);
  stateTransitionLabelDragState = null;
  dragState.target.classList.remove('dragging');
  if (dragState.hitTarget && dragState.hitTarget !== dragState.target) {
    dragState.hitTarget.classList.remove('dragging');
    dragState.hitTarget.style.transform = '';
  }
  if (!stateTransitionLabelDragMoved && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return;
  const point = {
    x: Math.max(4, Math.round(dragState.labelX + dx)),
    y: Math.max(4, Math.round(dragState.labelY + dy)),
  };
  if (!setStateTransitionLabelPosition(dragState.entityId, dragState.transitionIndex, point)) return;
  markModified();
  rerenderStateWorkbenchView();
}

function getStateNodeDisplayWidth(label) {
  const text = String(label || '').trim() || '状态';
  let units = 0;
  for (const ch of text) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(ch)) units += 1.15;
    else if (/[A-Z0-9]/.test(ch)) units += 0.72;
    else if (/[a-z]/.test(ch)) units += 0.62;
    else units += 0.9;
  }
  return Math.max(72, Math.min(172, Math.round(22 + units * 15)));
}

function getStateLinkLabelMetrics(label) {
  const text = String(label || '').trim() || '流转';
  let units = 0;
  for (const ch of text) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(ch)) units += 1.1;
    else if (/[A-Z0-9]/.test(ch)) units += 0.72;
    else if (/[a-z]/.test(ch)) units += 0.62;
    else units += 0.9;
  }
  return {
    text,
    width: Math.max(34, Math.min(160, Math.round(18 + units * 12))),
    height: 20,
  };
}

function getStateLinkLabelPlacement(points, preferredX = null, preferredY = null, metrics = null) {
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const horizontal = Math.abs(dy) < 0.5;
    const vertical = Math.abs(dx) < 0.5;
    const axis = horizontal ? 'horizontal' : (vertical ? 'vertical' : 'diagonal');
    const length = Math.hypot(dx, dy);
    segments.push({
      start,
      end,
      axis,
      length,
      midX: (start.x + end.x) / 2,
      midY: (start.y + end.y) / 2,
    });
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const centerX = Number.isFinite(preferredX) ? preferredX : ((Math.min(...xs) + Math.max(...xs)) / 2);
  const centerY = Number.isFinite(preferredY) ? preferredY : ((Math.min(...ys) + Math.max(...ys)) / 2);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const rankedSegments = segments
    .filter((segment) => segment.length > 0)
    .sort((left, right) => {
      const axisPenalty = (segment) => {
        if (segment.axis === 'horizontal') return 0;
        if (segment.axis === 'vertical') return 6;
        return 999;
      };
      const edgePenalty = (segment) => {
        if (segment.axis === 'diagonal') return 999;
        const edgeGap = Math.min(Math.abs(segment.midX - minX), Math.abs(segment.midX - maxX));
        return edgeGap < 16 ? 70 : 0;
      };
      const score = (segment) => (
        Math.abs(segment.midX - centerX) * 1.6
        + Math.abs(segment.midY - centerY) * 0.28
        + axisPenalty(segment)
        + edgePenalty(segment)
        - Math.min(segment.length, 160) * 0.18
      );
      return score(left) - score(right);
    });
  const target = rankedSegments[0] || null;
  if (!target) {
    const fallback = points[0] || { x: 0, y: 0 };
    return {
      x: fallback.x,
      y: fallback.y,
      axis: 'horizontal',
      lineX: fallback.x,
      lineY: fallback.y,
      angle: 0,
    };
  }
  return {
    x: target.axis === 'vertical'
      ? target.midX + ((target.midX <= centerX ? 1 : -1) * Math.max(24, Math.min(34, Math.round(((metrics?.width || 60) / 2) - 2))))
      : target.midX,
    y: target.midY,
    axis: target.axis,
    lineX: target.midX,
    lineY: target.midY,
    angle: 0,
  };
}

function statePathPointsToD(points) {
  if (!Array.isArray(points) || !points.length) return '';
  return points.map((point, index) => `${index ? 'L' : 'M'} ${Math.round(point.x)} ${Math.round(point.y)}`).join(' ');
}

function getStateAnchorPoint(pos, anchor, fallback = null) {
  if (!pos) return fallback || { x: 0, y: 0 };
  const normalized = normalizeStateTransitionAnchor(anchor);
  if (normalized === 'top') return { x: pos.cx, y: pos.y };
  if (normalized === 'right') return { x: pos.x + pos.w, y: pos.cy };
  if (normalized === 'bottom') return { x: pos.cx, y: pos.y + pos.h };
  if (normalized === 'left') return { x: pos.x, y: pos.cy };
  return fallback || { x: pos.cx, y: pos.cy };
}

function getNearestStateAnchor(pos, point) {
  if (!pos || !point) return 'auto';
  const candidates = ['top', 'right', 'bottom', 'left'].map((anchor) => ({
    anchor,
    point: getStateAnchorPoint(pos, anchor),
  }));
  return candidates
    .map((item) => ({
      ...item,
      distance: Math.hypot((point.x || 0) - item.point.x, (point.y || 0) - item.point.y),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.anchor || 'auto';
}

function renderStateEndpointHandles(entityId, fieldName, transitionIndex, points, readonly, fromPos = null, toPos = null) {
  if (readonly || !Array.isArray(points) || points.length < 2 || selectedStateTransitionIndex !== transitionIndex) return '';
  const serializeRect = (pos) => [pos?.x, pos?.y, pos?.w, pos?.h, pos?.cx, pos?.cy]
    .map((value) => Math.round(Number(value) || 0))
    .join(',');
  const endpoints = [
    { kind: 'from', point: points[0], title: '调整起点锚点', rect: serializeRect(fromPos) },
    { kind: 'to', point: points[points.length - 1], title: '调整终点锚点', rect: serializeRect(toPos) },
  ];
  return endpoints.map(({ kind, point, title, rect }) => `
    <button class="entity-state-link-endpoint-handle entity-state-link-endpoint-${kind}" type="button"
      data-testid="entity-state-link-endpoint-handle" data-transition-index="${transitionIndex}" data-endpoint-kind="${kind}" data-node-rect="${esc(rect)}"
      title="${title}" onpointerdown="startStateTransitionEndpointDrag('${esc(entityId)}','${esc(fieldName)}',${transitionIndex},'${kind}',event)"
      onmousedown="startStateTransitionEndpointDrag('${esc(entityId)}','${esc(fieldName)}',${transitionIndex},'${kind}',event)"
      style="left:${Math.round(point.x - 6)}px;top:${Math.round(point.y - 6)}px"></button>
  `).join('');
}

function renderStateRouteHitboxes(entityId, fieldName, transitionIndex, points, readonly) {
  if (readonly || !Array.isArray(points) || points.length < 2) return '';
  return points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const horizontal = Math.abs(point.y - next.y) <= Math.abs(point.x - next.x);
    const left = Math.min(point.x, next.x) - (horizontal ? 0 : 6);
    const top = Math.min(point.y, next.y) - (horizontal ? 6 : 0);
    const width = Math.max(horizontal ? Math.abs(next.x - point.x) : 12, 12);
    const height = Math.max(horizontal ? 12 : Math.abs(next.y - point.y), 12);
    const serializedPoints = points.map((item) => `${Math.round(item.x)},${Math.round(item.y)}`).join(' ');
    return `<div class="entity-state-link-route-hitbox" data-testid="entity-state-link-route-hitbox"
      data-transition-index="${transitionIndex}" data-segment-index="${index}" data-points="${esc(serializedPoints)}"
      onpointerdown="startStateTransitionRouteDrag('${esc(entityId)}','${esc(fieldName)}',${transitionIndex},${index},event)"
      onmousedown="startStateTransitionRouteDrag('${esc(entityId)}','${esc(fieldName)}',${transitionIndex},${index},event)"
      style="left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(width)}px;height:${Math.round(height)}px"></div>`;
  }).join('');
}

function renderEntityStateGraphMarkup(entity, fieldName = '', options = {}) {
  const readonly = Boolean(options.readonly);
  const stateNodes = getEntityStateNodes(entity, fieldName);
  if (!stateNodes.length) return '<div class="diag-empty">暂无状态值</div>';
  const states = stateNodes.map((item) => item.name);
  const transitionItems = getEntityStateTransitions(entity, fieldName);
  const transitions = transitionItems.map(({ transition }) => transition);
  const transitionOriginalIndices = transitionItems.map(({ index }) => index);
  const nodeH = 36;
  const gapX = 68;
  const gapY = 68;
  const padX = 48;
  const padY = 28;
  const startDotR = 8;
  const endOuterR = 10;
  const endInnerR = 5;
  const markerGap = 28;
  const nodeWidthMap = new Map(stateNodes.map((item) => [item.name, getStateNodeDisplayWidth(item.name)]));
  const startNodes = stateNodes.filter((item) => item.kind === 'initial').map((item) => item.name);
  const terminalNodes = stateNodes.filter((item) => item.kind === 'terminal').map((item) => item.name);
  const rowGroups = [];
  let nextRow = 0;
  const initialItems = stateNodes.filter((item) => item.kind === 'initial');
  const intermediateItems = stateNodes.filter((item) => item.kind === 'intermediate');
  const terminalItems = stateNodes.filter((item) => item.kind === 'terminal');
  if (initialItems.length) {
    rowGroups.push({ row: nextRow, items: initialItems });
    nextRow += 1;
  }
  intermediateItems.forEach((item) => {
    rowGroups.push({ row: nextRow, items: [item] });
    nextRow += 1;
  });
  if (terminalItems.length) {
    rowGroups.push({ row: nextRow, items: terminalItems });
    nextRow += 1;
  }
  if (!rowGroups.length) {
    rowGroups.push({ row: 0, items: stateNodes.slice() });
    nextRow = 1;
  }
  const rowByState = new Map();
  rowGroups.forEach((group) => {
    group.items.forEach((item) => {
      rowByState.set(item.name, group.row);
    });
  });
  const rowWidths = rowGroups.map((group) => group.items.reduce(
    (total, item, index) => total + (nodeWidthMap.get(item.name) || 72) + (index > 0 ? gapX : 0),
    0,
  ));
  const transitionMetas = transitions.map((transition, index) => {
    const fromRow = rowByState.get(transition.from);
    const toRow = rowByState.get(transition.to);
    const isSelfLoop = transition.from === transition.to;
    const isBackward = !isSelfLoop && (
      (Number.isFinite(fromRow) && Number.isFinite(toRow) && toRow < fromRow)
      || (
        Number.isFinite(fromRow)
        && Number.isFinite(toRow)
        && toRow === fromRow
        && states.indexOf(transition.to) < states.indexOf(transition.from)
      )
    );
    const rowDelta = Number.isFinite(fromRow) && Number.isFinite(toRow) ? (toRow - fromRow) : 0;
    const isForwardDetour = !isSelfLoop && !isBackward && rowDelta > 1;
    return {
      index,
      transition,
      fromRow,
      toRow,
      rowDelta,
      isSelfLoop,
      isBackward,
      isForwardDetour,
    };
  });
  const specialTransitionMetas = transitionMetas.filter(
    (meta) => meta.isSelfLoop || meta.isBackward || meta.isForwardDetour,
  );
  const sideChannelEstimate = specialTransitionMetas.length
    ? Math.max(1, Math.ceil(specialTransitionMetas.length / 2))
    : 0;
  const sharedRouteReserve = sideChannelEstimate ? 92 + Math.max(0, sideChannelEstimate - 1) * 18 : 0;
  const leftRouteReserve = sharedRouteReserve;
  const rightRouteReserve = sharedRouteReserve;
  const topMarkerSpace = startNodes.length ? markerGap + startDotR * 2 : 0;
  const bottomMarkerSpace = terminalNodes.length ? markerGap + endOuterR * 2 : 0;
  const layoutBoardW = Math.max(360, padX * 2 + Math.max(...rowWidths, 0));
  let boardW = leftRouteReserve + layoutBoardW + rightRouteReserve;
  let boardH = Math.max(220, padY * 2 + topMarkerSpace + bottomMarkerSpace + rowGroups.length * nodeH + Math.max(0, rowGroups.length - 1) * gapY);
  const posMap = {};

  rowGroups.forEach((group, rowIndex) => {
    const rowWidth = rowWidths[rowIndex] || 0;
    const startX = leftRouteReserve + Math.max(padX, (layoutBoardW - rowWidth) / 2);
    const y = padY + topMarkerSpace + rowIndex * (nodeH + gapY);
    let cursorX = startX;
    group.items.forEach((item, columnIndex) => {
      const width = nodeWidthMap.get(item.name) || 72;
      const x = cursorX;
      posMap[item.name] = {
        x,
        y,
        row: group.row,
        w: width,
        h: nodeH,
        cx: x + width / 2,
        cy: y + nodeH / 2,
      };
      cursorX += width + gapX;
    });
  });

  stateNodes.forEach((item) => {
    const pos = posMap[item.name];
    const manualPos = normalizeOptionalGraphOffset(item.pos);
    if (!pos || !manualPos) return;
    pos.x = Math.max(4, manualPos.x);
    pos.y = Math.max(4, manualPos.y);
    pos.cx = pos.x + pos.w / 2;
    pos.cy = pos.y + pos.h / 2;
  });

  const markerPosMap = {};
  stateNodes.forEach((item) => {
    const pos = posMap[item.name];
    if (!pos || (item.kind !== 'initial' && item.kind !== 'terminal')) return;
    const radius = item.kind === 'initial' ? startDotR : endOuterR;
    const fallbackY = item.kind === 'initial' ? pos.y - markerGap : pos.y + pos.h + markerGap;
    const manualMarkerPos = normalizeOptionalGraphOffset(item.markerPos);
    markerPosMap[item.name] = manualMarkerPos
      ? { x: Math.max(radius, manualMarkerPos.x), y: Math.max(radius, manualMarkerPos.y) }
      : { x: pos.cx, y: fallbackY };
  });

  const layoutBounds = Object.values(posMap).map((pos) => ({
    right: pos.x + pos.w,
    bottom: pos.y + pos.h,
  }));
  Object.entries(markerPosMap).forEach(([name, point]) => {
    const item = stateNodes.find((node) => node.name === name);
    const radius = item?.kind === 'initial' ? startDotR : endOuterR;
    layoutBounds.push({ right: point.x + radius, bottom: point.y + radius });
  });
  boardW = Math.max(boardW, Math.max(...layoutBounds.map((bound) => bound.right), 0) + padX);
  boardH = Math.max(boardH, Math.max(...layoutBounds.map((bound) => bound.bottom), 0) + padY);

  const minNodeLeft = Math.min(...Object.values(posMap).map((pos) => pos.x), leftRouteReserve + padX);
  const maxNodeRight = Math.max(...Object.values(posMap).map((pos) => pos.x + pos.w), leftRouteReserve + padX + 160);
  const channelCount = {};
  const detourRouteByIndex = new Map();
  const sideUsage = {
    left: Array.from({ length: rowGroups.length }, () => 0),
    right: Array.from({ length: rowGroups.length }, () => 0),
  };
  const sideEndpointUsage = {
    left: Array.from({ length: rowGroups.length }, () => 0),
    right: Array.from({ length: rowGroups.length }, () => 0),
  };
  const sideAnchorUsage = {
    left: Object.create(null),
    right: Object.create(null),
  };
  const getRowSpan = (fromRow, toRow) => {
    const safeFrom = Number.isFinite(fromRow) ? fromRow : 0;
    const safeTo = Number.isFinite(toRow) ? toRow : safeFrom;
    const start = Math.max(0, Math.min(safeFrom, safeTo));
    const end = Math.max(start, Math.max(safeFrom, safeTo));
    return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  };
  const getSideRouteX = (side, channelIndex) => (
    side === 'right'
      ? maxNodeRight + 28 + channelIndex * 18
      : minNodeLeft - 28 - channelIndex * 18
  );
  const getTransitionPriority = (meta) => {
    if (meta.isBackward) return 0;
    if (meta.isForwardDetour) return 1;
    return 2;
  };
  specialTransitionMetas
    .slice()
    .sort((left, right) => {
      const spanDiff = getRowSpan(right.fromRow, right.toRow).length - getRowSpan(left.fromRow, left.toRow).length;
      if (spanDiff) return spanDiff;
      const priorityDiff = getTransitionPriority(left) - getTransitionPriority(right);
      if (priorityDiff) return priorityDiff;
      return left.index - right.index;
    })
    .forEach((meta) => {
      const fromPos = posMap[meta.transition.from];
      const toPos = posMap[meta.transition.to];
      if (!fromPos || !toPos) return;
      const spanRows = getRowSpan(meta.fromRow, meta.toRow);
      const preferredSides = meta.isBackward ? ['left', 'right'] : ['right', 'left'];
      const bestRoute = ['left', 'right']
        .map((side) => {
          const channelIndex = spanRows.reduce((max, row) => Math.max(max, sideUsage[side][row] || 0), 0);
          const routeX = getSideRouteX(side, channelIndex);
          const sourceHookX = side === 'right' ? fromPos.x + fromPos.w : fromPos.x;
          const targetHookX = side === 'right' ? toPos.x + toPos.w : toPos.x;
          const distanceScore = Math.abs(sourceHookX - routeX) + Math.abs(targetHookX - routeX) + Math.abs(fromPos.cy - toPos.cy);
          const crowdScore = spanRows.reduce((sum, row) => sum + (sideUsage[side][row] || 0), 0) * (meta.isBackward ? 104 : 64);
          const endpointRows = Array.from(new Set([meta.fromRow, meta.toRow].filter((row) => Number.isFinite(row))));
          const endpointScore = endpointRows.reduce((sum, row) => sum + (sideEndpointUsage[side][row] || 0), 0) * 108;
          const sourceAnchorKey = `${meta.transition.from || ''}:${meta.fromRow}`;
          const targetAnchorKey = `${meta.transition.to || ''}:${meta.toRow}`;
          const anchorScore = ((sideAnchorUsage[side][sourceAnchorKey] || 0) + (sideAnchorUsage[side][targetAnchorKey] || 0)) * 88;
          const preferencePenalty = preferredSides.indexOf(side) * (meta.isBackward ? 36 : 14);
          return {
            side,
            channelIndex,
            routeX,
            spanRows,
            score: distanceScore + crowdScore + endpointScore + anchorScore + preferencePenalty,
          };
        })
        .sort((left, right) => left.score - right.score)[0];
      bestRoute.spanRows.forEach((row) => {
        sideUsage[bestRoute.side][row] = Math.max(sideUsage[bestRoute.side][row] || 0, bestRoute.channelIndex + 1);
      });
      Array.from(new Set([meta.fromRow, meta.toRow].filter((row) => Number.isFinite(row)))).forEach((row) => {
        sideEndpointUsage[bestRoute.side][row] = (sideEndpointUsage[bestRoute.side][row] || 0) + 1;
      });
      const sourceAnchorKey = `${meta.transition.from || ''}:${meta.fromRow}`;
      const targetAnchorKey = `${meta.transition.to || ''}:${meta.toRow}`;
      sideAnchorUsage[bestRoute.side][sourceAnchorKey] = (sideAnchorUsage[bestRoute.side][sourceAnchorKey] || 0) + 1;
      sideAnchorUsage[bestRoute.side][targetAnchorKey] = (sideAnchorUsage[bestRoute.side][targetAnchorKey] || 0) + 1;
      detourRouteByIndex.set(meta.index, bestRoute);
    });
  const markerMarkup = `<marker id="entity-state-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
      <path d="M0,0 L0,8 L8,4 z" fill="#64748b"></path>
    </marker>`;
  const labelHitBoxes = [];
  const routeHitBoxes = [];
  const endpointHandles = [];
  const linesMarkup = transitions.map((transition, index) => {
    const originalIndex = transitionOriginalIndices[index] ?? index;
    const fromPos = posMap[transition.from];
    const toPos = posMap[transition.to];
    if (!fromPos || !toPos) return '';
    const meta = transitionMetas[index] || {};
    const isSelfLoop = Boolean(meta.isSelfLoop);
    const isBackward = Boolean(meta.isBackward);
    const isForwardDetour = Boolean(meta.isForwardDetour);
    const channelKey = isSelfLoop || isBackward || isForwardDetour
      ? `detour:${index}`
      : `${transition.from}=>${transition.to}`;
    const channelIndex = channelCount[channelKey] || 0;
    channelCount[channelKey] = channelIndex + 1;
    let pathD = '';
    const stroke = '#64748b';
    let linkKind = 'forward';
    const detourRoute = detourRouteByIndex.get(index) || null;
    let pathPoints = [];

    if (isSelfLoop) {
      const routeSide = detourRoute?.side || 'right';
      const routeX = detourRoute?.routeX || getSideRouteX(routeSide, 0);
      const routeChannelIndex = detourRoute?.channelIndex || 0;
      const startX = routeSide === 'right' ? fromPos.x + fromPos.w : fromPos.x;
      const exitY = fromPos.cy - 7 - routeChannelIndex * 3;
      const enterY = fromPos.cy + 7 + routeChannelIndex * 3;
      pathPoints = [
        { x: startX, y: exitY },
        { x: routeX, y: exitY },
        { x: routeX, y: enterY },
        { x: startX, y: enterY },
      ];
      pathD = `M ${startX} ${exitY} L ${routeX} ${exitY} L ${routeX} ${enterY} L ${startX} ${enterY}`;
      linkKind = 'self';
    } else if (toPos.row === fromPos.row && toPos.cx >= fromPos.cx) {
      const startX = fromPos.x + fromPos.w;
      const endX = toPos.x;
      const y = fromPos.cy + channelIndex * 10;
      pathPoints = [
        { x: startX, y },
        { x: endX, y },
      ];
      pathD = `M ${startX} ${y} L ${endX} ${y}`;
    } else if (!isBackward && !isForwardDetour) {
      const startX = fromPos.cx;
      const startY = fromPos.y + fromPos.h;
      const endX = toPos.cx;
      const endY = toPos.y;
      const midY = startY + Math.max(18, (endY - startY) / 2) + channelIndex * 10;
      pathPoints = [
        { x: startX, y: startY },
        { x: startX, y: midY },
        { x: endX, y: midY },
        { x: endX, y: endY },
      ];
      pathD = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
    } else if (isForwardDetour) {
      const routeSide = detourRoute?.side || 'right';
      const routeX = detourRoute?.routeX || getSideRouteX(routeSide, 0);
      const sourceX = routeSide === 'right' ? fromPos.x + fromPos.w : fromPos.x;
      const targetX = routeSide === 'right' ? toPos.x + toPos.w : toPos.x;
      pathPoints = [
        { x: sourceX, y: fromPos.cy },
        { x: routeX, y: fromPos.cy },
        { x: routeX, y: toPos.cy },
        { x: targetX, y: toPos.cy },
      ];
      pathD = `M ${sourceX} ${fromPos.cy} L ${routeX} ${fromPos.cy} L ${routeX} ${toPos.cy} L ${targetX} ${toPos.cy}`;
      linkKind = 'forward-detour';
    } else {
      const routeSide = detourRoute?.side || 'left';
      const routeX = detourRoute?.routeX || getSideRouteX(routeSide, 0);
      const sourceX = routeSide === 'right' ? fromPos.x + fromPos.w : fromPos.x;
      const targetX = routeSide === 'right' ? toPos.x + toPos.w : toPos.x;
      pathPoints = [
        { x: sourceX, y: fromPos.cy },
        { x: routeX, y: fromPos.cy },
        { x: routeX, y: toPos.cy },
        { x: targetX, y: toPos.cy },
      ];
      pathD = `M ${sourceX} ${fromPos.cy} L ${routeX} ${fromPos.cy} L ${routeX} ${toPos.cy} L ${targetX} ${toPos.cy}`;
      linkKind = 'backward';
    }
    const route = getStateTransitionRoute(transition);
    if (route.fromAnchor !== 'auto') pathPoints[0] = getStateAnchorPoint(fromPos, route.fromAnchor, pathPoints[0]);
    if (route.toAnchor !== 'auto') pathPoints[pathPoints.length - 1] = getStateAnchorPoint(toPos, route.toAnchor, pathPoints[pathPoints.length - 1]);
    if (route.waypoints.length) {
      pathPoints = [pathPoints[0], ...route.waypoints, pathPoints[pathPoints.length - 1]].filter(Boolean);
    }
    if (hasManualStateTransitionRoute(transition)) {
      pathD = statePathPointsToD(pathPoints);
      linkKind = `${linkKind} manual`;
    }
    pathPoints.forEach((point) => {
      boardW = Math.max(boardW, point.x + padX);
      boardH = Math.max(boardH, point.y + padY);
    });
    routeHitBoxes.push(renderStateRouteHitboxes(entity.id, fieldName, originalIndex, pathPoints, readonly));
    endpointHandles.push(renderStateEndpointHandles(entity.id, fieldName, originalIndex, pathPoints, readonly, fromPos, toPos));
    const transitionLabel = String(transition.note || transition.action || '流转').trim() || '流转';
    const labelMetrics = getStateLinkLabelMetrics(transitionLabel);
    const manualLabelPos = normalizeOptionalGraphOffset(transition.labelPos);
    let labelPlacement = getStateLinkLabelPlacement(
      pathPoints,
      (fromPos.cx + toPos.cx) / 2,
      (fromPos.cy + toPos.cy) / 2,
      labelMetrics,
    );
    if (manualLabelPos) {
      const manualX = Math.max(labelMetrics.width / 2 + 4, manualLabelPos.x);
      const manualY = Math.max(labelMetrics.height / 2 + 4, manualLabelPos.y);
      labelPlacement = {
        x: manualX,
        y: manualY,
        axis: 'manual',
        lineX: manualX,
        lineY: manualY,
        angle: 0,
      };
    }
    const labelBoxX = Math.round((labelPlacement.x - labelMetrics.width / 2) * 10) / 10;
    const labelBoxY = Math.round((labelPlacement.y - labelMetrics.height / 2) * 10) / 10;
    const labelTextX = Math.round(labelPlacement.x * 10) / 10;
    const labelTextY = Math.round(labelPlacement.y * 10) / 10;
    const labelDragAttr = readonly
      ? ''
      : ` onmousedown="startStateTransitionLabelDrag('${esc(entity.id)}','${esc(fieldName)}',${originalIndex},event)"`;
    labelHitBoxes.push(`<div class="entity-state-link-label-hitbox" data-testid="entity-state-link-label-hitbox"
      data-transition-index="${originalIndex}" data-label-x="${labelTextX}" data-label-y="${labelTextY}" data-label-angle="${labelPlacement.angle || 0}"${labelDragAttr}
      style="left:${labelBoxX}px;top:${labelBoxY}px;width:${labelMetrics.width}px;height:${labelMetrics.height}px"></div>`);
    boardW = Math.max(boardW, labelBoxX + labelMetrics.width + padX);
    boardH = Math.max(boardH, labelBoxY + labelMetrics.height + padY);

    const selectedClass = selectedStateTransitionIndex === originalIndex ? ' selected' : '';
    return `
      <path class="entity-state-link entity-state-link-${linkKind}${selectedClass}" data-testid="entity-state-graph-link" data-transition-index="${originalIndex}" data-link-kind="${linkKind}" data-link-side="${esc(detourRoute?.side || '')}" data-link-action="${esc(transition.action || '')}" data-link-note="${esc(transition.note || '')}"
        d="${pathD}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
        marker-end="url(#entity-state-arrow)" onclick="selectStateTransition(${originalIndex},event)"></path>
      <g class="entity-state-link-label-group" data-testid="entity-state-link-label-group" data-transition-index="${originalIndex}" data-link-action="${esc(transition.action || '')}" data-link-note="${esc(transition.note || '')}" data-label-axis="${labelPlacement.axis}" data-label-x="${labelTextX}" data-label-y="${labelTextY}" data-label-line-x="${labelPlacement.lineX}" data-label-line-y="${labelPlacement.lineY}" data-label-angle="${labelPlacement.angle || 0}" transform="rotate(${labelPlacement.angle || 0} ${labelTextX} ${labelTextY})"${labelDragAttr}>
        <rect class="entity-state-link-label-box" x="${labelBoxX}" y="${labelBoxY}" width="${labelMetrics.width}" height="${labelMetrics.height}" rx="10" ry="10"></rect>
        <text x="${labelTextX}" y="${labelTextY}" text-anchor="middle" dominant-baseline="middle" class="entity-state-link-label">${esc(labelMetrics.text)}</text>
      </g>
      <text x="-9999" y="-9999" text-anchor="middle" class="entity-state-link-label-legacy" data-transition-index="${originalIndex}">${esc(transitionLabel)}</text>
    `;
  }).join('');
  const startEndMarkup = stateNodes.map((item) => {
    const pos = posMap[item.name];
    if (!pos) return '';
    if (item.kind === 'initial') {
      const markerPos = markerPosMap[item.name] || { x: pos.cx, y: pos.y - markerGap };
      return `
        <path class="entity-state-link entity-state-link-anchor"
          d="M ${markerPos.x} ${markerPos.y} L ${pos.cx} ${pos.y}"
          fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"
          marker-end="url(#entity-state-arrow)"></path>
      `;
    }
    if (item.kind === 'terminal') {
      const markerPos = markerPosMap[item.name] || { x: pos.cx, y: pos.y + pos.h + markerGap };
      return `
        <path class="entity-state-link entity-state-link-anchor"
          d="M ${pos.cx} ${pos.y + pos.h} L ${markerPos.x} ${markerPos.y}"
          fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"></path>
      `;
    }
    return '';
  }).join('');
  const markerBoardMarkup = stateNodes.map((item) => {
    const markerPos = markerPosMap[item.name];
    if (!markerPos) return '';
    if (item.kind === 'initial') {
      const dragAttr = readonly ? '' : ` onmousedown="startStateNodeDrag('${esc(entity.id)}','${esc(fieldName)}','${esc(item.name)}','marker',event)"`;
      return `<div class="entity-state-marker entity-state-start-dot"
        data-testid="entity-state-start-dot" data-state-name="${esc(item.name)}" data-state-kind="${esc(item.kind)}"
        ${dragAttr}
        style="left:${markerPos.x - startDotR}px;top:${markerPos.y - startDotR}px;width:${startDotR * 2}px;height:${startDotR * 2}px"></div>`;
    }
    if (item.kind === 'terminal') {
      const dragAttr = readonly ? '' : ` onmousedown="startStateNodeDrag('${esc(entity.id)}','${esc(fieldName)}','${esc(item.name)}','marker',event)"`;
      return `<div class="entity-state-marker entity-state-end-dot-outer"
        data-testid="entity-state-end-dot" data-state-name="${esc(item.name)}" data-state-kind="${esc(item.kind)}"
        ${dragAttr}
        style="left:${markerPos.x - endOuterR}px;top:${markerPos.y - endOuterR}px;width:${endOuterR * 2}px;height:${endOuterR * 2}px"></div>`;
    }
    return '';
  }).join('');

  const requestedZoom = Number(options.zoom);
  const zoom = Number.isFinite(requestedZoom) ? clampStateDiagramZoom(requestedZoom) : getStateDiagramZoom();
  const zoomedW = Math.max(180, Math.round(boardW * zoom * 10) / 10);
  const zoomedH = Math.max(160, Math.round(boardH * zoom * 10) / 10);

  return `<div class="entity-state-graph${readonly ? ' readonly' : ''}" data-testid="entity-state-graph-canvas">
    <div class="entity-state-zoom-shell" data-testid="entity-state-zoom-shell" data-state-zoom="${zoom}" style="width:${zoomedW}px;height:${zoomedH}px">
      <div class="entity-state-zoom-target" data-testid="entity-state-zoom-target" style="width:${boardW}px;height:${boardH}px;transform:scale(${zoom});transform-origin:0 0;">
        <div class="entity-state-canvas" style="width:${boardW}px;height:${boardH}px">
          <svg class="entity-state-svg" width="${boardW}" height="${boardH}" viewBox="0 0 ${boardW} ${boardH}" aria-hidden="true">
            <defs>${markerMarkup}</defs>
            ${startEndMarkup}
            ${linesMarkup}
          </svg>
          <div class="entity-state-board" style="width:${boardW}px;height:${boardH}px">
            ${routeHitBoxes.join('')}
            ${endpointHandles.join('')}
            ${labelHitBoxes.join('')}
            ${markerBoardMarkup}
            ${stateNodes.map((item, index) => {
              const pos = posMap[item.name];
              const dragAttr = readonly ? '' : ` onmousedown="startStateNodeDrag('${esc(entity.id)}','${esc(fieldName)}','${esc(item.name)}','node',event)"`;
              return `<div class="entity-state-node kind-${item.kind}"
                data-testid="entity-state-node-${index}" data-state-name="${esc(item.name)}" data-state-kind="${esc(item.kind)}"
                ${dragAttr}
                style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px">
                <span class="entity-state-node-label">${esc(item.name)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
    ${transitions.length ? '' : '<p class="no-refs">暂无状态流转，先添加一条边。</p>'}
  </div>`;
}

function createEntity(constructId = '', values = {}) {
  S.doc.entities = S.doc.entities || [];
  const id = nextStableId('E', S.doc.entities);
  const entity = {
    id,
    name: String(values.name || '').trim() || '新实体',
    note: String(values.note || ''),
    businessConstructId: constructId || '',
    businessConstructIds: constructId ? [constructId] : [],
    fields: [],
    state_transitions: [],
  };
  S.doc.entities.push(entity);
  if (constructId && typeof addEntityToConstruct === 'function') {
    const construct = findBusinessConstructRef(constructId);
    if (construct) construct.entityIds = [...new Set([...(construct.entityIds || []), id])];
  }
  S.ui.entityRelationEditorCollapsed = false;
  markModified();
  navigate('data', { entityId: id });
}

function addEntity(constructId = '') {
  S.ui.entityDraft = {
    name: '',
    note: '',
    businessConstructId: String(constructId || ''),
  };
  S.ui.dataView = 'relation';
  S.ui.entityId = null;
  S.ui.entityRelationEditorCollapsed = false;
  navigate('data', {});
}

function setEntityDraft(key, value) {
  if (!S.ui.entityDraft || typeof S.ui.entityDraft !== 'object') return;
  S.ui.entityDraft[key] = value;
}

function cancelEntityDraft() {
  S.ui.entityDraft = null;
  if (!S.doc.entities?.length) S.ui.entityRelationEditorCollapsed = true;
  render();
}

function saveEntityDraft() {
  const draft = S.ui.entityDraft || {};
  const name = String(draft.name || '').trim();
  if (!name) return alert('请填写实体名称。');
  if ((S.doc.entities || []).some((entity) => String(entity.name || '').trim() === name)) {
    return alert(`实体“${name}”已存在，请换一个名称。`);
  }
  S.ui.entityDraft = null;
  createEntity(String(draft.businessConstructId || ''), { name, note: draft.note || '' });
}

async function removeEntity(id) {
  if(!await showAppConfirm('确认删除此实体？', {
    title: '删除实体',
    confirmLabel: '删除',
  })) return;
  S.doc.entities=S.doc.entities.filter(e=>e.id!==id);
  ensureDocumentArray('businessConstructs').forEach((construct) => {
    if (Array.isArray(construct.entityIds)) {
      construct.entityIds = construct.entityIds.filter((entityId) => entityId !== id);
    }
  });
  S.doc.relations=(S.doc.relations||[]).filter(r=>r.from!==id&&r.to!==id);
  for(const proc of S.doc.processes)
    for(const task of getProcNodes(proc))
      task.entity_ops=(task.entity_ops||[]).filter(eo=>eo.entity_id!==id);
  for(const proc of S.doc.processes)
    for(const task of getProcNodes(proc))
      for(const form of getNodeForms(task)) {
        if(form.entity_id===id) form.entity_id='';
        (form.sections||[]).forEach((section) => {
          if(section.entity_id===id) {
            section.entity_id = '';
            (section.fields||[]).forEach((field) => { field.entity_field = ''; });
          }
        });
      }
  if(S.ui.entityId===id) S.ui.entityId=null;
  markModified(); render();
}

function setEntity(id,key,val) {
  const e=S.doc.entities.find(e=>e.id===id);
  if(e){
    ensureEntityStateShape(e);
    e[key]=val;
    markModified();
  }
}

function setEntityBusinessConstruct(entityId, constructId) {
  const entity = S.doc.entities.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  ensureDocumentArray('businessConstructs').forEach((construct) => {
    if (Array.isArray(construct.entityIds)) {
      construct.entityIds = construct.entityIds.filter((id) => id !== entity.id);
    }
  });
  if (constructId) {
    const construct = findBusinessConstructRef(constructId);
    if (construct) {
      entity.businessConstructId = construct.id;
      entity.businessConstructIds = [construct.id];
      construct.entityIds = [...new Set([...(construct.entityIds || []), entity.id])];
    }
  } else {
    entity.businessConstructId = '';
    entity.businessConstructIds = [];
  }
  markModified();
  renderSidebar();
  renderEntityDiagramNow();
  rerenderEntityEditor({ focusSelector: '[data-testid="entity-construct-select"]', selectText: false });
}

/* ── ID 重命名 ──────────────────────────────────────────── */
function renameProcessId(oldId, newId) {
  newId = newId.trim();
  if(!newId || newId === oldId) { render(); return; }
  if(S.doc.processes.some(p=>p.id===newId)) { alert(`流程ID "${newId}" 已存在`); render(); return; }
  const proc = S.doc.processes.find(p=>p.id===oldId); if(!proc) return;
  proc.id = newId;
  for(const stage of getStages(S.doc)) {
    for(const link of getStageProcessLinks(stage)) {
      if(link.fromProcessId === oldId) link.fromProcessId = newId;
      if(link.toProcessId === oldId) link.toProcessId = newId;
    }
  }
  for(const ref of getStageFlowRefs(S.doc)) {
    if(ref.processId === oldId) ref.processId = newId;
  }
  for(const rule of (S.doc.rules || [])) {
    if(rule.applies_to === oldId) rule.applies_to = newId;
  }
  if(S.ui.procId === oldId) S.ui.procId = newId;
  markModified(); render();
}
function renameTaskId(procId, oldId, newId) {
  newId = newId.trim();
  if(!newId || newId === oldId) { render(); return; }
  const allTasks = S.doc.processes.flatMap(p=>getProcNodes(p));
  if(allTasks.some(t=>t.id===newId)) { alert(`任务ID "${newId}" 已存在`); render(); return; }
  const proc = S.doc.processes.find(p=>p.id===procId);
  const task = getProcNodes(proc).find(t=>t.id===oldId); if(!task) return;
  task.id = newId;
  const flow = normalizeProcessFlow(proc);
  for(const edge of flow.edges || []) {
    if(edge.from === oldId) edge.from = newId;
    if(edge.to === oldId) edge.to = newId;
  }
  const swimlane = flow.layout?.swimlane;
  if(swimlane?.items && swimlane.items[oldId]) {
    swimlane.items[newId] = swimlane.items[oldId];
    delete swimlane.items[oldId];
  }
  if(S.ui.taskId === oldId) S.ui.taskId = newId;
  markModified(); render();
}
function renameGatewayId(procId, oldId, newId) {
  newId = newId.trim();
  if(!newId || newId === oldId) { render(); return; }
  const proc = S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  const flow = normalizeProcessFlow(proc);
  const taskIds = new Set(getProcNodes(proc).map((task) => task.id));
  if(taskIds.has(newId) || flow.nodes.some((node)=>node.id===newId)) { alert(`分支ID "${newId}" 已存在`); render(); return; }
  const gateway = flow.nodes.find((node)=>node.id===oldId);
  if(!gateway) return;
  gateway.id = newId;
  for(const edge of flow.edges || []) {
    if(edge.from === oldId) edge.from = newId;
    if(edge.to === oldId) edge.to = newId;
  }
  const swimlane = flow.layout?.swimlane;
  if(swimlane?.items && swimlane.items[oldId]) {
    swimlane.items[newId] = swimlane.items[oldId];
    delete swimlane.items[oldId];
  }
  markModified(); render();
}
function renameFlowEdgeId(procId, oldId, newId) {
  newId = newId.trim();
  if(!newId || newId === oldId) { render(); return; }
  const proc = S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  const flow = normalizeProcessFlow(proc);
  if(flow.edges.some((edge)=>edge.id===newId)) { alert(`连线ID "${newId}" 已存在`); render(); return; }
  const edge = flow.edges.find((item)=>item.id===oldId);
  if(!edge) return;
  edge.id = newId;
  const swimlane = flow.layout?.swimlane;
  const oldLabelKey = `edge:${oldId}`;
  const newLabelKey = `edge:${newId}`;
  if(swimlane?.labels && swimlane.labels[oldLabelKey]) {
    swimlane.labels[newLabelKey] = swimlane.labels[oldLabelKey];
    delete swimlane.labels[oldLabelKey];
  }
  markModified(); render();
}
function renameEntityId(oldId, newId) {
  newId = newId.trim();
  if(!newId || newId === oldId) { render(); return; }
  if(S.doc.entities.some(e=>e.id===newId)) { alert(`实体ID "${newId}" 已存在`); render(); return; }
  const entity = S.doc.entities.find(e=>e.id===oldId); if(!entity) return;
  entity.id = newId;
  for(const r of (S.doc.relations||[])) {
    if(r.from===oldId) r.from=newId;
    if(r.to  ===oldId) r.to  =newId;
  }
  for(const proc of S.doc.processes)
    for(const task of getProcNodes(proc))
      for(const eo of (task.entity_ops||[]))
        if(eo.entity_id===oldId) eo.entity_id=newId;
  for(const proc of S.doc.processes)
    for(const task of getProcNodes(proc))
      for(const form of getNodeForms(task)) {
        if(form.entity_id===oldId) form.entity_id=newId;
        for(const section of (form.sections||[]))
          if(section.entity_id===oldId) section.entity_id=newId;
      }
  if(S.ui.entityId === oldId) S.ui.entityId = newId;
  markModified(); render();
}
/* 点击 ID 标签进入内联编辑 */
function startEditId(spanEl, type, ...args) {
  const curId = args[args.length-1];
  const input = document.createElement('input');
  input.type='text'; input.value=curId; input.className='id-edit-input';
  spanEl.replaceWith(input);
  input.focus(); input.select();
  let committed = false;
  function commit() {
    if(committed) return; committed=true;
    const v = input.value.trim();
    if(type==='proc')   renameProcessId(curId, v);
    else if(type==='task')   renameTaskId(args[0], curId, v);
    else if(type==='gateway') renameGatewayId(args[0], curId, v);
    else if(type==='flowEdge') renameFlowEdgeId(args[0], curId, v);
    else if(type==='entity') renameEntityId(curId, v);
    else render();
  }
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e=>{
    if(e.key==='Enter')  { input.blur(); }
    if(e.key==='Escape') { committed=true; render(); }
  });
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Fields
═══════════════════════════════════════════════════════════ */
function rerenderEntityEditor(options = {}) {
  const drawerScrollTop = document.querySelector('.entity-drawer .drawer-body')?.scrollTop || 0;
  renderDataTab();
  requestAnimationFrame(() => {
    const drawerBody = document.querySelector('.entity-drawer .drawer-body');
    const nextScrollTop = options.drawerScrollTop ?? drawerScrollTop;
    if (drawerBody) drawerBody.scrollTop = nextScrollTop;
    if (options.focusSelector) {
      const field = document.querySelector(options.focusSelector);
      if (field) {
        if (typeof field.focus === 'function') {
          try {
            field.focus({ preventScroll: true });
          } catch (error) {
            field.focus();
          }
        }
        if (options.selectText !== false && typeof field.select === 'function') field.select();
        if (options.revealFocus) {
          field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        if (drawerBody) drawerBody.scrollTop = nextScrollTop;
        requestAnimationFrame(() => {
          const latestDrawerBody = document.querySelector('.entity-drawer .drawer-body');
          if (latestDrawerBody) latestDrawerBody.scrollTop = nextScrollTop;
        });
      }
    }
  });
}
function addField(entityId,afterIdx) {
  const e=S.doc.entities.find(e=>e.id===entityId); if(!e) return;
  ensureEntityStateShape(e);
  const insertIndex = Number.isInteger(afterIdx) ? afterIdx + 1 : e.fields.length;
  e.fields.splice(insertIndex, 0, {name:'',type:'string',is_key:false,is_status:false,status_role:'',state_values:'',state_nodes:[],note:''});
  markModified();
  rerenderEntityEditor({
    focusSelector: `[data-testid="entity-field-name-${insertIndex}"]`,
  });
}
function removeField(entityId,idx) {
  const e=S.doc.entities.find(e=>e.id===entityId); if(!e) return;
  if(e.fields[idx]===undefined) return;
  e.fields.splice(idx,1);
  markModified();
  const focusIndex = Math.min(idx, e.fields.length - 1);
  rerenderEntityEditor({
    focusSelector: focusIndex >= 0
      ? `[data-testid="entity-field-name-${focusIndex}"]`
      : '[data-testid="entity-field-add-button"]',
  });
}
function moveField(entityId,idx,dir) {
  const e=S.doc.entities.find(e=>e.id===entityId); if(!e) return;
  const targetIdx = idx + dir;
  if(idx < 0 || targetIdx < 0 || targetIdx >= e.fields.length) return;
  [e.fields[idx], e.fields[targetIdx]] = [e.fields[targetIdx], e.fields[idx]];
  markModified();
  rerenderEntityEditor({
    focusSelector: `[data-testid="entity-field-name-${targetIdx}"]`,
  });
}
function setField(entityId,idx,key,val) {
  const e=S.doc.entities.find(e=>e.id===entityId);
  if(e?.fields[idx]===undefined) return;
  ensureEntityStateShape(e);
  if(key === 'is_status' || key === 'status_role') {
    const nextRole = key === 'is_status' ? (val ? 'primary' : '') : val;
    applyEntityFieldStatusRole(e, idx, nextRole);
  } else {
    e.fields[idx][key]=val;
    if(key === 'note' && getFieldStatusRole(e.fields[idx])) {
      const inferredStateValueText = inferStateValuesFromNote(val).join('/');
      if (inferredStateValueText || !String(val || '').trim()) {
        e.fields[idx].state_values = inferredStateValueText;
      }
    }
  }
  syncFieldStateNodes(e.fields[idx]);
  markModified();
}

function addStateTransition(entityId, afterIndex = null) {
  const entity = S.doc.entities.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  const fieldName = getEntityStatusField(entity, S.ui.stateFieldName)?.name || '';
  if (!fieldName) {
    alert('请先为状态字段命名，才能添加状态流转。');
    return;
  }
  if (!getEntityStatusValues(entity, fieldName).length) {
    alert('请先在字段规则中填写主状态字段"${fieldName}"的状态值（如：待处理、处理中、已完成），再配置状态流转。');
    return;
  }
  const insertIndex = Number.isInteger(afterIndex) ? Math.max(0, afterIndex + 1) : entity.state_transitions.length;
  entity.state_transitions.splice(insertIndex, 0, createStateTransitionDraft(entity, fieldName));
  markModified();
  rerenderStateWorkbenchView(`[data-testid="entity-transition-from-${insertIndex}"]`);
}

function removeStateTransition(entityId, idx) {
  const entity = S.doc.entities.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  entity.state_transitions.splice(idx, 1);
  markModified();
  rerenderStateWorkbenchView();
}

function moveStateTransition(entityId, idx, dir, fieldName) {
  const entity = S.doc.entities.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  const scopedIndices = getEntityStateTransitions(entity, fieldName).map((item) => item.index);
  const localIndex = scopedIndices.indexOf(idx);
  const targetLocalIndex = localIndex + dir;
  if (localIndex < 0 || targetLocalIndex < 0 || targetLocalIndex >= scopedIndices.length) return;
  const targetIdx = scopedIndices[targetLocalIndex];
  [entity.state_transitions[idx], entity.state_transitions[targetIdx]] = [entity.state_transitions[targetIdx], entity.state_transitions[idx]];
  markModified();
  rerenderStateWorkbenchView(`[data-testid="entity-transition-from-${targetIdx}"]`);
}

function updateStateTransitionLabelInDom(idx, transition) {
  const labelMetrics = getStateLinkLabelMetrics(String(transition?.note || transition?.action || '流转').trim() || '流转');
  document.querySelectorAll(`[data-testid="entity-state-link-label-group"][data-transition-index="${idx}"]`).forEach((group) => {
    group.dataset.linkAction = transition?.action || '';
    group.dataset.linkNote = transition?.note || '';
    const labelX = Number.parseFloat(group.dataset.labelX || '');
    const labelY = Number.parseFloat(group.dataset.labelY || '');
    const rect = group.querySelector('.entity-state-link-label-box');
    const text = group.querySelector('.entity-state-link-label');
    if (text) text.textContent = labelMetrics.text;
    if (rect && Number.isFinite(labelX) && Number.isFinite(labelY)) {
      rect.setAttribute('x', String(Math.round((labelX - labelMetrics.width / 2) * 10) / 10));
      rect.setAttribute('y', String(Math.round((labelY - labelMetrics.height / 2) * 10) / 10));
      rect.setAttribute('width', String(labelMetrics.width));
      rect.setAttribute('height', String(labelMetrics.height));
    }
  });
  document.querySelectorAll(`[data-testid="entity-state-graph-link"][data-transition-index="${idx}"]`).forEach((path) => {
    path.dataset.linkAction = transition?.action || '';
    path.dataset.linkNote = transition?.note || '';
  });
  document.querySelectorAll(`.entity-state-link-label-legacy[data-transition-index="${idx}"]`).forEach((node) => {
    node.textContent = labelMetrics.text;
  });
}

function setStateTransition(entityId, idx, key, val) {
  const entity = S.doc.entities.find((item) => item.id === entityId);
  if (!entity) return;
  ensureEntityStateShape(entity);
  if (!entity.state_transitions[idx]) return;
  entity.state_transitions[idx][key] = val;
  markModified();
  if (key === 'action' || key === 'note') {
    updateStateTransitionLabelInDom(idx, entity.state_transitions[idx]);
    return;
  }
  const activeElement = document.activeElement;
  const selection = (key === 'action' || key === 'note') && activeElement && typeof activeElement.selectionStart === 'number'
    ? {
      start: activeElement.selectionStart,
      end: activeElement.selectionEnd,
      direction: activeElement.selectionDirection || 'none',
    }
    : null;
  rerenderStateWorkbenchView({
    focusSelector: `[data-testid="entity-transition-${key}-${idx}"]`,
    selection,
  });
}

function clampStateDiagramZoom(zoom) {
  return Math.max(0.6, Math.min(1.8, Math.round(Number(zoom || 1) * 100) / 100));
}

function getStateDiagramZoom() {
  return clampStateDiagramZoom(S.ui.stateDiagramZoom || 1);
}

function setStateDiagramZoom(nextZoom) {
  const normalized = clampStateDiagramZoom(nextZoom);
  if (normalized === getStateDiagramZoom()) return;
  S.ui.stateDiagramZoom = normalized;
  rerenderStateWorkbenchView();
}

function nudgeStateDiagramZoom(delta) {
  setStateDiagramZoom(getStateDiagramZoom() + delta);
}

function resetStateDiagramZoom() {
  setStateDiagramZoom(1);
}

function setStateEditorCollapsed(collapsed) {
  const nextValue = Boolean(collapsed);
  if (Boolean(S.ui.stateEditorCollapsed) === nextValue) return;
  S.ui.stateEditorCollapsed = nextValue;
  rerenderStateWorkbenchView();
}

function toggleStateEditorDrawer(forceOpen = null) {
  if (typeof forceOpen === 'boolean') {
    setStateEditorCollapsed(!forceOpen);
    return;
  }
  setStateEditorCollapsed(!S.ui.stateEditorCollapsed);
}

function handleStateDiagramWheel(event) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  nudgeStateDiagramZoom(event.deltaY < 0 ? 0.1 : -0.1);
}

function renderStateEntityBrowser(groupedEntities, activeEntity) {
  if (!groupedEntities.length) {
    return '<div class="diag-empty" data-testid="entity-state-empty">暂无实体，先新建实体。</div>';
  }
  return groupedEntities.map(([groupName, items]) => `
    <div class="entity-state-group">
      <div class="entity-state-group-title">${esc(groupName)}</div>
      <div class="entity-state-group-list">
        ${items.map((item) => `<button class="entity-state-chip ${activeEntity?.id===item.id?'active':''}" onclick="setStateEntity('${esc(item.id)}')">${esc(item.name||'未命名')}</button>`).join('')}
      </div>
    </div>
  `).join('');
}

function renderStateFieldScope(entity, activeField) {
  if (!entity) return '';
  const primaryField = getEntityPrimaryStatusField(entity);
  const secondaryFields = getEntitySecondaryStatusFields(entity);
  const lines = [];
  if (primaryField) {
    const prefix = activeField?.name === primaryField.name ? '当前主状态字段' : '主状态字段';
    lines.push(`${prefix}：${esc(primaryField.name || '')}`);
  }
  if (secondaryFields.length) {
    lines.push(`子状态字段：${secondaryFields.map((field) => esc(field.name || '')).join(' / ')}`);
  }
  if (!primaryField && secondaryFields.length) {
    lines.unshift('当前还未指定主状态字段，先按子状态分别维护。');
  }
  if (!lines.length) return '';
  return `<div class="entity-state-card-meta">${lines.map((line) => `<div>${line}</div>`).join('')}</div>`;
}

function renderStateFieldDiagramSection(entity, stateField, activeField, fieldIndex) {
  if (!entity || !stateField) return '';
  const role = getFieldStatusRole(stateField);
  const roleLabel = getFieldStatusRoleLabel(stateField) || '状态';
  const stateValues = getFieldStateValues(stateField);
  const stateNodes = getFieldStateNodes(stateField);
  const isActive = activeField?.name === stateField.name;
  const summaryText = stateValues.length
    ? `状态值：${esc(stateValues.join(' / '))}`
    : '当前字段还没有填写状态值';
  return `<section class="entity-state-field-panel ${isActive ? 'active' : ''}" data-testid="entity-state-overview-field" data-field-name="${esc(stateField.name)}"
      onclick="setStateFieldView('${esc(entity.id)}','${esc(stateField.name)}')">
      <div class="entity-state-field-panel-head">
        <div>
          <div class="entity-state-field-panel-title">${esc(stateField.name || '未命名字段')}</div>
          <div class="entity-state-field-panel-meta">${esc(summaryText)}</div>
        </div>
        <div class="entity-state-field-panel-badges">
          <span class="entity-state-field-badge role-${esc(role || 'none')}">${esc(roleLabel)}</span>
          ${isActive ? '<span class="entity-state-field-badge active">编辑中</span>' : ''}
        </div>
      </div>
      <div class="entity-state-card-values">
        ${stateNodes.map((item) => `<span class="entity-state-value-chip kind-${item.kind}">${esc(item.name)} · ${esc(getStateNodeKindLabel(item.kind))}</span>`).join('')}
      </div>
      ${stateValues.length
        ? renderEntityStateGraphMarkup(entity, stateField.name)
        : '<div class="diag-empty entity-state-field-empty">当前字段还没有状态值，先去字段规则里补充。</div>'}
    </section>`;
}

function getStateFieldOptionLabel(field) {
  const roleLabel = getFieldStatusRoleLabel(field, 'short');
  const fieldName = field?.name || '未命名字段';
  return roleLabel ? `${roleLabel}：${fieldName}` : fieldName;
}

function renderFieldStatusRoleControl(entity, field, index) {
  const value = getFieldStatusRole(field);
  const currentRole = value || 'none';
  return `<div class="field-status-role-wrap field-status-role-wrap-${currentRole}" data-value="${esc(currentRole)}">
    <select class="field-status-role-select field-status-role-select-${currentRole}" data-testid="entity-status-role-${index}" aria-label="字段状态角色"
      onchange="updateFieldStatusRole('${esc(entity.id)}',${index},this.value)">
      <option value="" ${!value ? 'selected' : ''}>否</option>
      <option value="primary" ${value==='primary' ? 'selected' : ''}>主</option>
      <option value="secondary" ${value==='secondary' ? 'selected' : ''}>子</option>
    </select>
  </div>`;
}

function renderStateDiagramCard(entity, statusFields, stateField) {
  if (!entity) {
    return '<div class="diag-empty" data-testid="entity-state-empty">请选择一个实体查看状态图。</div>';
  }
  if (!statusFields.length || !stateField) {
    return '<div class="diag-empty" data-testid="entity-state-empty">当前实体还未定义状态字段，请先在下方字段表中标记主状态或子状态，再在字段规则中填写状态值。</div>';
  }
  return `<div class="entity-state-card" data-testid="entity-state-diagram">
    <div class="entity-state-card-head">
      <div>
        <div class="entity-state-card-title">${esc(entity.name || entity.id)}</div>
        <div class="entity-state-card-subtitle">状态总览 · 当前编辑字段：${esc(getStateFieldOptionLabel(stateField))}</div>
        ${renderStateFieldScope(entity, stateField)}
      </div>
      <div class="entity-state-card-summary">
        ${statusFields.map((field, index) => `<button class="entity-state-field-chip ${stateField?.name === field.name ? 'active' : ''}" type="button"
            data-testid="entity-state-overview-field-${index}"
            onclick="setStateFieldView('${esc(entity.id)}','${esc(field.name)}')">${esc(getStateFieldOptionLabel(field))}</button>`).join('')}
      </div>
    </div>
    <div class="entity-state-overview-grid">
      ${statusFields.map((field, index) => renderStateFieldDiagramSection(entity, field, stateField, index)).join('')}
    </div>
  </div>`;
}

function renderStateFieldSelector(entity, statusFields, stateField) {
  if (!entity) return '';
  if (!statusFields.length) {
    return `<label class="field-group">
      <span>状态字段</span>
      <div class="entity-state-values-readonly" data-testid="entity-state-field-empty">请先在下方字段表中把字段标记为主状态或子状态。</div>
    </label>`;
  }
  return `<label class="field-group">
    <span>状态字段</span>
    <select data-testid="entity-state-field-select" onchange="setStateFieldView('${esc(entity.id)}', this.value)">
      ${statusFields.map((field) => `<option value="${esc(field.name)}" ${stateField?.name===field.name?'selected':''}>${esc(getStateFieldOptionLabel(field))}</option>`).join('')}
    </select>
  </label>`;
}

function renderStateNodeKindEditor(entity, stateField) {
  if (!entity || !stateField) return '';
  const stateNodes = getFieldStateNodes(stateField);
  if (!stateNodes.length) return '';
  return `<div class="entity-state-kind-editor">
    <div class="entity-state-kind-head">
      <div>
        <h5>状态节点属性</h5>
        <p class="entity-state-editor-hint">每个状态都需要标记为初始状态、中间状态或结束状态。图上会按这个属性做纵向展开。</p>
      </div>
    </div>
    <div class="entity-state-kind-list" data-testid="entity-state-kind-list">
      ${stateNodes.map((item, index) => `<div class="entity-state-kind-row">
        <span class="entity-state-kind-name">${esc(item.name)}</span>
        <select data-testid="entity-state-kind-${index}" onchange="setStateNodeKind('${esc(entity.id)}','${esc(stateField.name)}','${esc(item.name)}',this.value,${index})">
          <option value="initial" ${item.kind==='initial' ? 'selected' : ''}>初始状态</option>
          <option value="intermediate" ${item.kind==='intermediate' ? 'selected' : ''}>中间状态</option>
          <option value="terminal" ${item.kind==='terminal' ? 'selected' : ''}>结束状态</option>
        </select>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderStateTransitionList(entity, stateField, stateValues, stateTransitionRows) {
  if (!stateField) {
    return '<p class="no-refs">先在下方字段表中设置主状态或子状态字段，再在字段规则中填写状态值，然后维护流转边。</p>';
  }
  if (!stateTransitionRows.length) {
    return '<p class="no-refs">暂无状态流转，先添加一条边，例如：草稿 → 待审核。</p>';
  }
  return `<div class="entity-transition-list">
    ${stateTransitionRows.map(({ transition, index }, localIndex) => `<div class="entity-transition-row">
      <select data-testid="entity-transition-from-${index}" onchange="setStateTransition('${esc(entity.id)}',${index},'from',this.value)">
        ${stateValues.map((value) => `<option value="${esc(value)}" ${transition.from===value?'selected':''}>${esc(value)}</option>`).join('')}
      </select>
      <span class="entity-transition-arrow">→</span>
      <select data-testid="entity-transition-to-${index}" onchange="setStateTransition('${esc(entity.id)}',${index},'to',this.value)">
        ${stateValues.map((value) => `<option value="${esc(value)}" ${transition.to===value?'selected':''}>${esc(value)}</option>`).join('')}
      </select>
      <input type="text" data-testid="entity-transition-note-${index}" value="${esc(transition.note || transition.action || '')}" placeholder="备注说明"
        oninput="setStateTransition('${esc(entity.id)}',${index},'note',this.value)">
      <div class="entity-transition-actions">
        <button class="transition-action" type="button" data-testid="entity-transition-add-after-${index}" title="在下方插入流转" onclick="addStateTransition('${esc(entity.id)}',${index})">+</button>
        <button class="transition-action" type="button" data-testid="entity-transition-move-up-${index}" title="上移" ${localIndex === 0 ? 'disabled' : ''} onclick="moveStateTransition('${esc(entity.id)}',${index},-1,'${esc(stateField.name)}')">↑</button>
        <button class="transition-action" type="button" data-testid="entity-transition-move-down-${index}" title="下移" ${localIndex === stateTransitionRows.length - 1 ? 'disabled' : ''} onclick="moveStateTransition('${esc(entity.id)}',${index},1,'${esc(stateField.name)}')">↓</button>
        ${hasManualStateTransitionRoute(transition) ? `<button class="transition-action" type="button" data-testid="entity-transition-route-reset-${index}" title="重置连线" onclick="resetStateTransitionRoute('${esc(entity.id)}',${index})">↺</button>` : ''}
        <button class="transition-action transition-action-delete" type="button" data-testid="entity-transition-delete-${index}" title="删除" onclick="removeStateTransition('${esc(entity.id)}',${index})">✕</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function renderStateEditorPanel(entity, statusFields, stateField, stateValueText, stateValues, stateTransitionRows) {
  if (!entity) return '';
  return `<div class="entity-state-editor">
    <div class="entity-state-editor-head">
      <div>
        <h4>状态图编辑</h4>
        <p class="entity-state-editor-hint">左侧总览会同时展示主状态字段和所有子状态字段；右侧只编辑当前选中的状态字段，点击总览块可快速切换。</p>
      </div>
      <div class="entity-state-editor-actions">
        <button class="btn btn-outline btn-sm" type="button" data-testid="entity-transition-route-reset-all"
          onclick="resetAllStateTransitionRoutes('${esc(entity.id)}','${esc(stateField?.name || '')}')" ${stateField ? '' : 'disabled'}>重置所有连线</button>
        <button class="btn btn-outline btn-sm" data-testid="entity-transition-add-button" onclick="addStateTransition('${esc(entity.id)}')">＋ 添加流转</button>
      </div>
    </div>
    <div class="entity-state-config-row">
      ${renderStateFieldSelector(entity, statusFields, stateField)}
      <label class="field-group entity-state-values-field">
        <span>状态值来源<span class="inline-help" tabindex="0" data-tip="请在下方字段表的“字段规则”中填写状态值，并用 / 分隔，例如：草稿/待审核/审核通过/已作废。">?</span></span>
        <div class="entity-state-values-readonly" data-testid="entity-state-values-text">${esc(stateValueText || '请在下方“字段规则”中填写，例如：草稿/待审核/审核通过/已作废')}</div>
      </label>
    </div>
    ${renderStateNodeKindEditor(entity, stateField)}
    ${statusFields.length > 1 ? '<p class="entity-state-editor-hint">同一实体的多个状态字段已同步展示在左侧总览里；当前编辑区只落在右侧选中的那一个字段上。</p>' : ''}
    ${renderStateTransitionList(entity, stateField, stateValues, stateTransitionRows)}
  </div>`;
}

function renderStateEditorDrawer(entity, statusFields, stateField, stateValueText, stateValues, stateTransitionRows, drawerW) {
  const fieldLabel = stateField ? getStateFieldOptionLabel(stateField) : '未选择状态字段';
  return `<div class="state-editor-drawer" data-testid="state-editor-drawer" style="width:${drawerW}px">
    <div class="drawer-resize-handle" data-testid="state-editor-drawer-resize-handle" onmousedown="startDrawerResize(event)"></div>
    <div class="drawer-head">
      <div class="drawer-crumb">
        <span>状态图编辑</span>
        <span class="dc-sep">/</span>
        <span>${esc(fieldLabel)}</span>
      </div>
      <div class="drawer-actions">
        <button class="drawer-close" type="button" data-testid="state-editor-close" onclick="toggleStateEditorDrawer(false)" title="关闭编辑">✕</button>
      </div>
    </div>
    <div class="drawer-body">
      ${renderStateEditorPanel(entity, statusFields, stateField, stateValueText, stateValues, stateTransitionRows)}
    </div>
  </div>`;
}

function renderStateWorkbench(groupedEntities, entity, statusFields, stateField, stateValueText, stateValues, stateTransitionRows, drawerW) {
  const showEditor = !S.ui.stateEditorCollapsed;
  return `<div class="entity-state-workbench">
    <div class="entity-state-browser">
      ${renderStateEntityBrowser(groupedEntities, entity)}
    </div>
    <div class="entity-state-stage">
      <div class="entity-state-main-shell" style="margin-right:${showEditor ? drawerW : 0}px" onwheel="handleStateDiagramWheel(event)">
        <div class="entity-state-main">
          ${renderStateDiagramCard(entity, statusFields, stateField)}
        </div>
      </div>
      ${showEditor ? renderStateEditorDrawer(entity, statusFields, stateField, stateValueText, stateValues, stateTransitionRows, drawerW) : ''}
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Relations
═══════════════════════════════════════════════════════════ */
function getRelationsForEntity(entityId) {
  return (S.doc.relations||[])
    .map((relation, index) => ({ relation, index }))
    .filter(({ relation }) => relation.from === entityId || relation.to === entityId);
}

function renderEntityReferenceSection(refs) {
  if (!refs.length) return '';
  return `<div class="form-section"><h4>被以下流程节点引用</h4>
    <div class="task-ref-list">
      ${refs.map(({ proc, task }) => `<span class="task-ref"
        onclick="navigate('process',{procId:'${proc.id}',taskId:'${task.id}'})"
        title="跳转到流程节点">${esc(task.name || '未命名节点')}</span>`).join('')}
    </div>
  </div>`;
}

function renderEntityFieldsSection(entity) {
  return `<div class="form-section">
    <h4>字段 <button class="btn btn-outline btn-sm" data-testid="entity-field-add-button" onclick="addField('${esc(entity.id)}')">＋</button></h4>
    ${entity.fields?.length ? `<table class="field-table">
      <thead><tr><th>字段名</th><th>类型</th><th title="主键">主键</th><th title="主状态字段">状态</th><th>字段规则</th><th>操作</th></tr></thead>
      <tbody>
        ${entity.fields.map((field, index) => `<tr>
          <td class="field-td-name"><input type="text" data-testid="entity-field-name-${index}" value="${esc(field.name||'')}" placeholder="字段名"
            oninput="setField('${esc(entity.id)}',${index},'name',this.value)"></td>
          <td class="field-td-type"><select data-testid="entity-field-type-${index}" onchange="setField('${esc(entity.id)}',${index},'type',this.value)">
            ${FIELD_TYPES.map((type) => `<option value="${type.value}" ${field.type===type.value?'selected':''}>${type.label}</option>`).join('')}
          </select></td>
          <td style="text-align:center"><input type="checkbox" ${field.is_key?'checked':''}
            onchange="setField('${esc(entity.id)}',${index},'is_key',this.checked)"></td>
          <td class="field-status-cell">${renderFieldStatusRoleControl(entity, field, index)}</td>
          <td class="field-td-note"><textarea class="auto-resize" rows="1" placeholder="字段规则"
            oninput="setField('${esc(entity.id)}',${index},'note',this.value);autoResize(this)"
            >${esc(field.note||'')}</textarea></td>
          <td class="field-actions-cell"><div class="field-actions">
            <button class="field-action field-add-after" type="button" data-testid="entity-field-add-after-${index}" title="在下方插入字段" onclick="addField('${esc(entity.id)}',${index})">+</button>
            <button class="field-action field-move-up" type="button" data-testid="entity-field-move-up-${index}" title="上移" ${index === 0 ? 'disabled' : ''} onclick="moveField('${esc(entity.id)}',${index},-1)">↑</button>
            <button class="field-action field-move-down" type="button" data-testid="entity-field-move-down-${index}" title="下移" ${index === entity.fields.length - 1 ? 'disabled' : ''} onclick="moveField('${esc(entity.id)}',${index},1)">↓</button>
            <button class="field-del" type="button" data-testid="entity-field-delete-${index}" onclick="removeField('${esc(entity.id)}',${index})">✕</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p class="no-refs">暂无字段</p>'}
  </div>`;
}

function renderEntityRelationsSection(entity, entities, scopedRelations) {
  return `<div class="form-section">
    <h4>实体关系 <button class="btn btn-outline btn-sm" data-testid="entity-relation-add-button" onclick="addRelation('${esc(entity.id)}')">＋</button></h4>
    <p class="rel-scope-tip">仅显示与当前实体直接相关的关系，减少全局噪音。</p>
    ${scopedRelations.length ? `<div class="rel-list" data-testid="entity-relation-list">
      ${scopedRelations.map(({ relation, index }, localIndex) => `<div class="rel-row" data-relation-row="${localIndex}">
        <select onchange="setRelation('${esc(entity.id)}',${index},'from',this.value)">
          ${entities.map((item) => `<option value="${item.id}" ${relation.from===item.id?'selected':''}>${esc(item.name || '未命名实体')}</option>`).join('')}
        </select>
        <select style="width:76px" onchange="setRelation('${esc(entity.id)}',${index},'type',this.value)">
          ${['1:1','1:N','N:N'].map((type) => `<option ${relation.type===type?'selected':''}>${type}</option>`).join('')}
        </select>
        <select onchange="setRelation('${esc(entity.id)}',${index},'to',this.value)">
          ${entities.map((item) => `<option value="${item.id}" ${relation.to===item.id?'selected':''}>${esc(item.name || '未命名实体')}</option>`).join('')}
        </select>
        <input type="text" data-testid="entity-relation-label-${localIndex}" class="rel-label-input" value="${esc(relation.label||'')}" placeholder="关系说明"
          oninput="setRelation('${esc(entity.id)}',${index},'label',this.value)">
        <div class="rel-actions">
          <button class="rel-action rel-add-after" type="button" data-testid="entity-relation-add-after-${localIndex}" title="在下方插入关系" onclick="addRelation('${esc(entity.id)}',${index})">+</button>
          <button class="rel-action rel-move-up" type="button" data-testid="entity-relation-move-up-${localIndex}" title="上移" ${localIndex === 0 ? 'disabled' : ''} onclick="moveRelation('${esc(entity.id)}',${index},-1)">↑</button>
          <button class="rel-action rel-move-down" type="button" data-testid="entity-relation-move-down-${localIndex}" title="下移" ${localIndex === scopedRelations.length - 1 ? 'disabled' : ''} onclick="moveRelation('${esc(entity.id)}',${index},1)">↓</button>
          <button class="field-del" type="button" data-testid="entity-relation-delete-${localIndex}" onclick="removeRelation('${esc(entity.id)}',${index})">✕</button>
        </div>
      </div>`).join('')}
    </div>` : '<p class="no-refs">当前实体暂无关系</p>'}
  </div>`;
}

function renderEntityDrawer(showEntityDrawer, entity, entities, drawerW) {
  const scopedRelations = entity ? getRelationsForEntity(entity.id) : [];
  const entityDraft = S.ui.entityDraft || null;
  let markup = `<div class="entity-drawer${showEntityDrawer&&(entity || entityDraft)?' open':''}" style="width:${showEntityDrawer ? `${drawerW}px` : '0px'}">
    <div class="drawer-resize-handle" data-testid="entity-drawer-resize-handle" onmousedown="startDrawerResize(event)"></div>`;

  if (showEntityDrawer && entityDraft) {
    const selectedConstructId = String(entityDraft.businessConstructId || '');
    markup += `<div class="drawer-head">
      <div class="drawer-crumb">
        <span style="font-weight:600">新建实体</span>
      </div>
      <div class="drawer-actions">
        <button class="btn btn-outline btn-sm" type="button" data-testid="entity-draft-cancel" onclick="cancelEntityDraft()">取消</button>
        <button class="btn btn-primary btn-sm" type="button" data-testid="entity-draft-save" onclick="saveEntityDraft()">保存</button>
        <button class="drawer-close" type="button" data-testid="entity-editor-close" onclick="cancelEntityDraft()" title="取消新建">×</button>
      </div>
    </div>
    <div class="drawer-body">
      <div class="form-grid" style="margin-bottom:16px">
        <div class="field-group">
          <label>实体名称</label>
          <input type="text" data-testid="entity-name-input" value="${esc(entityDraft.name || '')}" placeholder="请输入实体名称"
            oninput="setEntityDraft('name',this.value)">
        </div>
        <div class="field-group">
          <label>所属业务构件</label>
          <select data-testid="entity-construct-select" onchange="setEntityDraft('businessConstructId',this.value)">
            ${renderBusinessConstructOptions(selectedConstructId)}
          </select>
        </div>
        <div class="field-group" style="grid-column:1/-1">
          <label>说明</label>
          <input type="text" value="${esc(entityDraft.note || '')}" placeholder="简要说明"
            oninput="setEntityDraft('note',this.value)">
        </div>
      </div>
      <p class="no-refs">保存后可继续维护字段、关系和状态流转。</p>
    </div>`;
  } else if (showEntityDrawer && entity) {
    const refs = getTasksReferencingEntity(entity.id);
    const selectedConstructId = getEntityBusinessConstructId(entity);
    markup += `<div class="drawer-head">
      <div class="drawer-crumb">
        <span style="font-weight:600">${esc(entity.name||'未命名')}</span>
      </div>
      <div class="drawer-actions">
        <button class="btn btn-danger btn-sm" onclick="removeEntity('${esc(entity.id)}')">删除</button>
        <button class="drawer-close" type="button" data-testid="entity-editor-close" onclick="toggleEntityRelationEditor(false)" title="关闭编辑">✕</button>
      </div>
    </div>
    <div class="drawer-body">
      <div class="form-grid" style="margin-bottom:16px">
        <div class="field-group">
          <label>实体名称</label>
          <input type="text" data-testid="entity-name-input" value="${esc(entity.name||'')}"
            oninput="setEntity('${esc(entity.id)}','name',this.value);renderSidebar();if((S.ui.dataView||'relation')==='relation'){renderEntityDiagramNow();}">
        </div>
        <div class="field-group">
          <label>所属业务构件</label>
          <select data-testid="entity-construct-select" onchange="setEntityBusinessConstruct('${esc(entity.id)}',this.value)">
            ${renderBusinessConstructOptions(selectedConstructId)}
          </select>
        </div>
        <div class="field-group" style="grid-column:1/-1">
          <label>说明</label>
          <input type="text" value="${esc(entity.note||'')}"
            placeholder="简要说明"
            oninput="setEntity('${esc(entity.id)}','note',this.value)">
        </div>
      </div>
      ${renderEntityReferenceSection(refs)}
      ${renderEntityFieldsSection(entity)}
      ${renderEntityRelationsSection(entity, entities, scopedRelations)}
    </div>`;
  } else if (showEntityDrawer) {
    markup += '<div class="drawer-empty"><p>点击实体节点打开编辑</p></div>';
  }

  markup += '</div>';
  return markup;
}

function addRelation(entityId, afterIdx) {
  const ents=S.doc.entities||[];
  if(ents.length<2){alert('至少需要2个实体才能建立关系');return;}
  const baseEntityId = entityId || S.ui.entityId || ents[0].id;
  const targetEntity = ents.find(e => e.id !== baseEntityId);
  if(!targetEntity) { alert('至少需要2个实体才能建立关系'); return; }
  S.doc.relations=S.doc.relations||[];
  const scopedIndices = getRelationsForEntity(baseEntityId).map(({ index }) => index);
  const insertIndex = Number.isInteger(afterIdx)
    ? afterIdx + 1
    : (scopedIndices.length ? scopedIndices[scopedIndices.length - 1] + 1 : S.doc.relations.length);
  S.doc.relations.splice(insertIndex, 0, {from:baseEntityId,to:targetEntity.id,type:'1:N',label:''});
  markModified();
  rerenderEntityEditor();
}
function removeRelation(entityId, idx){
  const localIndex = getRelationsForEntity(entityId).findIndex((item) => item.index === idx);
  S.doc.relations.splice(idx,1);
  markModified();
  const nextLocalIndex = Math.min(localIndex, getRelationsForEntity(entityId).length - 1);
  rerenderEntityEditor({
    focusSelector: nextLocalIndex >= 0
      ? `[data-testid="entity-relation-label-${nextLocalIndex}"]`
      : '[data-testid="entity-relation-add-button"]',
  });
}
function moveRelation(entityId, idx, dir) {
  const scopedIndices = getRelationsForEntity(entityId).map(({ index }) => index);
  const localIndex = scopedIndices.indexOf(idx);
  const targetLocalIndex = localIndex + dir;
  if(localIndex < 0 || targetLocalIndex < 0 || targetLocalIndex >= scopedIndices.length) return;
  const targetIdx = scopedIndices[targetLocalIndex];
  [S.doc.relations[idx], S.doc.relations[targetIdx]] = [S.doc.relations[targetIdx], S.doc.relations[idx]];
  markModified();
  rerenderEntityEditor({
    focusSelector: `[data-testid="entity-relation-label-${targetLocalIndex}"]`,
  });
}
function setRelation(entityId, idx, key, val){
  if(S.doc.relations[idx]){
    S.doc.relations[idx][key]=val;
    markModified();
    if ((key === 'from' || key === 'to') && entityId && S.doc.relations[idx].from !== entityId && S.doc.relations[idx].to !== entityId) {
      rerenderEntityEditor();
    }
  }
}

function renderEntityRelationHint(relationEditorCollapsed) {
  const focusText = relationEditorCollapsed
    ? '点击实体高亮关联线'
    : '点击实体切换编辑对象';
  return `<span class="live-diagram-hint entity-shortcut-hint">
    <strong>拖拽</strong>移动节点 · ${focusText} · <strong>Ctrl+A</strong>全选实体 · <strong>Ctrl+点击</strong>多选 · <strong>Shift+左键拖拽</strong>框选
  </span>`;
}

function renderDataTab() {
  const entities=S.doc.entities||[];
  const dataView = S.ui.dataView || 'relation';
  let entity=entities.find(e=>e.id===S.ui.entityId)||null;
  if (!entity && entities.length && dataView === 'state') {
    entity = entities.find(getEntityStatusField) || entities[0];
    S.ui.entityId = entity?.id || null;
  }
  const drawerW = dataView === 'relation' ? Math.max(getDrawerWidth('entity'), 620) : getDrawerWidth('entity');
  const groupedEntities = Array.from(
    entities.reduce((map, item) => {
      const groupName = getEntityModelMeta(item).constructLabel;
      if (!map.has(groupName)) map.set(groupName, []);
      map.get(groupName).push(item);
      return map;
    }, new Map())
  );
  const statusFields = entity ? getEntityStatusFields(entity) : [];
  const stateField = entity ? getEntityStatusField(entity, S.ui.stateFieldName) : null;
  const stateValueText = stateField ? getFieldStateValueText(stateField) : '';
  const stateValues = stateField ? getFieldStateValues(stateField) : [];
  const stateTransitionRows = entity ? getEntityStateTransitions(entity, stateField?.name || '') : [];
  const relationEditorCollapsed = isEntityRelationEditorCollapsed();
  const showEntityDrawer = dataView === 'relation' && !relationEditorCollapsed;
  const relationEditorOffset = showEntityDrawer && (entity || S.ui.entityDraft) ? drawerW : 0;
  const stateEditorDrawerW = Math.max(getDrawerWidth('entity'), 620);
  const stateZoomLabel = `${Math.round(getStateDiagramZoom() * 100)}%`;
  const stateEditorCollapsed = Boolean(S.ui.stateEditorCollapsed);
  const relationToolbarActions = dataView === 'relation'
    ? `<div class="data-relation-toolbar-actions">
        ${relationEditorCollapsed
          ? `<button class="btn btn-outline btn-sm" type="button" data-testid="entity-editor-open" onclick="toggleEntityRelationEditor(true)" ${entities.length ? '' : 'disabled'}>打开编辑</button>`
          : '<button class="btn btn-ghost-sm" type="button" data-testid="entity-editor-hide" onclick="toggleEntityRelationEditor(false)">关闭编辑</button>'}
      </div>`
    : '';
  const stateToolbarActions = dataView === 'state'
    ? `<div class="data-state-toolbar-actions">
        <div class="data-state-zoom-controls" aria-label="状态图缩放">
          <button class="btn btn-ghost-sm" type="button" data-testid="state-zoom-out" onclick="nudgeStateDiagramZoom(-0.1)" title="缩小">－</button>
          <button class="btn btn-ghost-sm data-state-zoom-reset" type="button" data-testid="state-zoom-reset" onclick="resetStateDiagramZoom()" title="重置缩放">${stateZoomLabel}</button>
          <button class="btn btn-ghost-sm" type="button" data-testid="state-zoom-in" onclick="nudgeStateDiagramZoom(0.1)" title="放大">＋</button>
        </div>
        ${stateEditorCollapsed
          ? '<button class="btn btn-outline btn-sm" type="button" data-testid="state-editor-open" onclick="toggleStateEditorDrawer(true)">打开编辑</button>'
          : '<button class="btn btn-ghost-sm" type="button" data-testid="state-editor-hide" onclick="toggleStateEditorDrawer(false)">关闭编辑</button>'}
      </div>`
    : '';

  let h='';
  h+=`<div class="live-diagram-wrap entity-diag-full ${relationEditorOffset ? 'entity-drawer-shift' : ''}" id="diagram-wrap" style="${relationEditorOffset ? `margin-right:${relationEditorOffset}px` : ''}">
    <div class="live-diagram-toolbar data-toolbar ${dataView==='state' ? 'state-mode' : ''}">
      <div class="data-view-switch" role="tablist" aria-label="数据视图切换">
        <button class="seg-btn ${dataView==='relation'?'active':''}" data-testid="data-switch-relation" onclick="setDataView('relation')">关系图</button>
        <button class="seg-btn ${dataView==='state'?'active':''}" data-testid="data-switch-state" onclick="setDataView('state')">状态图</button>
      </div>
      ${dataView==='state'
        ? '<span class="live-diagram-hint">实体状态图采用“状态节点 + 流转边”模型，主状态字段与流转边都在主工作台内编辑。</span>'
        : renderEntityRelationHint(relationEditorCollapsed)}
      <button class="btn btn-outline btn-sm" data-testid="data-add-entity" onclick="addEntity()">＋ 新建实体</button>
      ${dataView==='relation'
        ? `<button class="btn btn-ghost-sm" onclick="resetEfLayout()" title="清除手动布局，恢复分组布局">重置布局</button>`
        : `<label class="data-state-select-inline"><span class="data-state-select-label">查看实体</span>
            <select data-testid="data-state-entity-select" onchange="setStateEntity(this.value)">
              ${entities.map((item) => `<option value="${item.id}" ${entity?.id===item.id?'selected':''}>${esc(item.name||'未命名')}</option>`).join('')}
            </select>
          </label>`
      }
      ${relationToolbarActions}
      ${stateToolbarActions}
    </div>
    ${dataView === 'relation'
      ? `<div id="entity-diagram" class="live-diagram" style="flex:1;overflow:auto"></div>`
      : renderStateWorkbench(groupedEntities, entity, statusFields, stateField, stateValueText, stateValues, stateTransitionRows, stateEditorDrawerW)
    }
  </div>`;

  h += renderEntityDrawer(showEntityDrawer, entity, entities, drawerW);

  document.getElementById('tab-content').innerHTML=h;

  if (dataView === 'relation') {
    const clickMap={};
    const openEditorOnClick = !isEntityRelationEditorCollapsed();
    for(const e of entities)
      clickMap[e.id]=()=>selectEntityInRelationGraph(e.id, { openEditor: openEditorOnClick });
    renderEntityFlow('entity-diagram', S.doc, clickMap);
  }
}

function renderEntityDiagramNow() {
  const clickMap={};
  const openEditorOnClick = !isEntityRelationEditorCollapsed();
  for(const e of (S.doc.entities||[]))
    clickMap[e.id]=()=>selectEntityInRelationGraph(e.id, { openEditor: openEditorOnClick });
  renderEntityFlow('entity-diagram', S.doc, clickMap);
}

/* ── 步骤类型：自定义支持 ── */
