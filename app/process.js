'use strict';

const DEFAULT_PROC_ROLE_COLOR = {
  fill: '#ffffff',
  stroke: '#cbd5e1',
  color: '#334155',
};

function buildTaskRoleColorMap(tasks) {
  const roleMap = {};
  let colorIdx = 0;
  for(const task of tasks) {
    for(const roleName of getTaskRoleNames(task)) {
      if(roleName && !(roleName in roleMap)) {
        roleMap[roleName] = colorIdx % ROLE_COLORS.length;
        colorIdx += 1;
      }
    }
  }
  return roleMap;
}

function getTaskPrimaryRoleStyle(task, roleMap) {
  const primaryRoleName = getTaskRoleNames(task)[0] || '';
  if(primaryRoleName && roleMap[primaryRoleName] !== undefined) {
    return ROLE_COLORS[roleMap[primaryRoleName]];
  }
  return DEFAULT_PROC_ROLE_COLOR;
}

function renderTaskRoleChips(roleNames, roleMap, className = 'pf-role-chip') {
  return roleNames.map((roleName) => {
    const color = roleMap[roleName] !== undefined ? ROLE_COLORS[roleMap[roleName]] : DEFAULT_PROC_ROLE_COLOR;
    return `<span class="${className}"
      style="background:${color.fill};border-color:${color.stroke};color:${color.color}">${esc(roleName)}</span>`;
  }).join('');
}

function buildProcMermaid(proc) {
  const tasks = getProcNodes(proc);
  if(!tasks.length) return null;

  const roleMap = buildTaskRoleColorMap(tasks);

  const lines = ['flowchart LR'];
  Object.values(roleMap).forEach(idx => {
    const c = ROLE_COLORS[idx];
    lines.push(`  classDef rc${idx} fill:${c.fill},stroke:${c.stroke},color:${c.color},stroke-width:2px`);
  });
  lines.push(`  classDef rcDefault fill:${DEFAULT_PROC_ROLE_COLOR.fill},stroke:${DEFAULT_PROC_ROLE_COLOR.stroke},color:${DEFAULT_PROC_ROLE_COLOR.color},stroke-width:2px`);
  lines.push('  classDef startEnd fill:#f1f5f9,stroke:#94a3b8,color:#475569');
  lines.push('  classDef entTag fill:#f8fafc,stroke:#cbd5e1,color:#64748b,font-size:11px');
  lines.push('  Start([开始]):::startEnd');

  for(const [index, t] of tasks.entries()) {
    const name = (t.name||'').replace(/"/g,"'");
    const roleNames = getTaskRoleNames(t);
    let label = `${name}`;
    if(roleNames.length) label += `\\n(${roleNames.join(' / ')})`;
    const primaryRoleName = roleNames[0] || '';
    const ci = primaryRoleName ? roleMap[primaryRoleName] : undefined;
    lines.push(`  ${t.id}["${label}"]:::${ci === undefined ? 'rcDefault' : `rc${ci}`}`);
    if(t.repeatable && index > 0) {
      lines.push(`  ${t.id} -.-> ${tasks[index - 1].id}`);
    }
    /* 实体标签：横向附注（MD 导出用，不影响 app 内实时图） */
    const eops = (t.entity_ops||[]).filter(eo=>eo.ops?.length);
    if(eops.length) {
      const tag = eops.map(eo=>`${getEntityName(eo.entity_id).replace(/"/g,"'")}·${(eo.ops||[]).join('')}`).join('  ');
      lines.push(`  et_${t.id}(["${tag}"]):::entTag`);
      lines.push(`  ${t.id} -.-> et_${t.id}`);
    }
  }

  lines.push('  End([结束]):::startEnd');
  lines.push('  '+['Start',...tasks.map(t=>t.id),'End'].join(' --> '));
  return lines.join('\n');
}

const PROC_RETURN_LINE_OFFSET = 20;
const PROC_RETURN_START_RATIO = 0.25;
const PROC_RETURN_END_RATIO = 0.75;
let processFlowDragState = null;
let processFlowDragMoved = false;

function renderRichTextToolbar(testIdPrefix = 'rich-text') {
  const items = [
    ['bold', 'B', '加粗'],
    ['unordered', '•', '无序列表'],
    ['ordered', '1.', '有序列表'],
    ['outdent', '←', '减少缩进'],
    ['indent', '→', '增加缩进'],
  ];
  return `<div class="rich-text-toolbar" data-testid="${esc(testIdPrefix)}-toolbar">
    ${items.map(([cmd, label, title]) => `<button class="rich-text-btn" type="button" title="${esc(title)}" aria-label="${esc(title)}" data-testid="${esc(testIdPrefix)}-${esc(cmd)}" onmousedown="event.preventDefault()" onclick="applyRichTextCommand(this,'${esc(cmd)}')">${esc(label)}</button>`).join('')}
  </div>`;
}

function sanitizeRichTextHtml(html) {
  const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'OL', 'UL', 'LI', 'P', 'DIV', 'BR']);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(html || '')}</div>`, 'text/html');
  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return doc.createTextNode('');
    const tag = node.tagName;
    if (!allowedTags.has(tag)) {
      const fragment = doc.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => fragment.appendChild(cleanNode(child)));
      return fragment;
    }
    const el = doc.createElement(tag.toLowerCase());
    if (tag === 'LI') {
      const value = Number.parseInt(node.getAttribute('value') || '', 10);
      if (Number.isFinite(value) && value > 0) el.setAttribute('value', String(value));
    }
    Array.from(node.childNodes).forEach((child) => el.appendChild(cleanNode(child)));
    return el;
  };
  const output = doc.createElement('div');
  Array.from(doc.body.firstElementChild?.childNodes || []).forEach((child) => output.appendChild(cleanNode(child)));
  return output.innerHTML
    .replace(/<div><br><\/div>/g, '<br>')
    .replace(/<p><br><\/p>/g, '<br>')
    .trim();
}

function isRichTextHtml(value) {
  return /<\/?(?:b|strong|i|em|u|s|ol|ul|li|p|div|br)\b/i.test(String(value || ''));
}

function richTextListMarker(line) {
  const ordered = String(line || '').match(/^\s*(\d+)[.、]\s*(.*)$/);
  if (ordered) return { type: 'ordered', value: Number.parseInt(ordered[1], 10), text: ordered[2] || '' };
  const alpha = String(line || '').match(/^\s*([a-zA-Z])[.、]\s*(.*)$/);
  if (alpha) return { type: 'alpha', value: alpha[1].toLowerCase().charCodeAt(0) - 96, text: alpha[2] || '' };
  const bullet = String(line || '').match(/^\s*[-*•]\s*(.*)$/);
  if (bullet) return { type: 'bullet', value: null, text: bullet[1] || '' };
  return null;
}

function joinRichTextContinuation(current, next) {
  const left = String(current || '').trimEnd();
  const right = String(next || '').trim();
  if (!left) return right;
  if (!right) return left;
  return /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right) ? `${left} ${right}` : `${left}${right}`;
}

function looksLikeStructuredRichTextList(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim());
  const markers = lines.map(richTextListMarker).filter(Boolean);
  return markers.some((marker) => marker.type === 'ordered') || markers.some((marker) => marker.type === 'alpha');
}

function plainTextToStructuredRichHtml(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  if (!looksLikeStructuredRichTextList(text)) return '';
  const topItems = [];
  let currentTop = null;
  let currentChild = null;

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      currentChild = null;
      continue;
    }
    const marker = richTextListMarker(rawLine);
    if (marker?.type === 'ordered') {
      currentTop = { value: marker.value || topItems.length + 1, text: marker.text, children: [] };
      topItems.push(currentTop);
      currentChild = null;
      continue;
    }
    if (marker?.type === 'alpha' && currentTop) {
      currentChild = { value: marker.value || currentTop.children.length + 1, text: marker.text };
      currentTop.children.push(currentChild);
      continue;
    }
    if (marker?.type === 'bullet' && currentTop) {
      currentChild = { value: null, text: marker.text, bullet: true };
      currentTop.children.push(currentChild);
      continue;
    }
    if (currentChild) {
      currentChild.text = joinRichTextContinuation(currentChild.text, rawLine);
    } else if (currentTop) {
      currentTop.text = joinRichTextContinuation(currentTop.text, rawLine);
    } else {
      currentTop = { value: topItems.length + 1, text: rawLine.trim(), children: [] };
      topItems.push(currentTop);
    }
  }

  const renderChildList = (children) => {
    if (!children.length) return '';
    const hasBullet = children.every((child) => child.bullet);
    const tag = hasBullet ? 'ul' : 'ol';
    return `<${tag}>${children.map((child) => {
      const value = !hasBullet && child.value ? ` value="${child.value}"` : '';
      return `<li${value}>${inlineRichText(child.text || '')}</li>`;
    }).join('')}</${tag}>`;
  };

  return sanitizeRichTextHtml(`<ol>${topItems.map((item) => {
    const value = item.value ? ` value="${item.value}"` : '';
    return `<li${value}>${inlineRichText(item.text || '')}${renderChildList(item.children || [])}</li>`;
  }).join('')}</ol>`);
}

function plainOrMarkdownToRichHtml(value) {
  const text = String(value || '');
  if (isRichTextHtml(text)) return sanitizeRichTextHtml(text);
  const structuredHtml = plainTextToStructuredRichHtml(text);
  if (structuredHtml) return structuredHtml;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let listType = '';
  let listItems = [];
  const flushList = () => {
    if (!listType) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${inlineRichText(item)}</li>`).join('')}</${listType}>`);
    listType = '';
    listItems = [];
  };
  lines.forEach((line) => {
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (ordered || unordered) {
      const nextType = ordered ? 'ol' : 'ul';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((ordered || unordered)[1]);
      return;
    }
    flushList();
    blocks.push(line.trim() ? `<div>${inlineRichText(line)}</div>` : '<div><br></div>');
  });
  flushList();
  return sanitizeRichTextHtml(blocks.join(''));
}

function inlineRichText(value) {
  return esc(value).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderRichTextValue(value) {
  return plainOrMarkdownToRichHtml(value);
}

function renderRichTextEditor({ value = '', testIdPrefix = 'rich-text', className = '', placeholder = '', oninput = '' }) {
  const safeHtml = renderRichTextValue(value);
  const sync = `syncRichTextEditor(this);${oninput}`;
  return `<div class="rich-text-field">
    ${renderRichTextToolbar(testIdPrefix)}
    <div class="${esc(className)} rich-text-editor" data-testid="${esc(testIdPrefix)}-editor" contenteditable="true" role="textbox" aria-multiline="true"
      data-placeholder="${esc(placeholder)}" onfocus="moveCursorToEndOfContent(this)" oninput="${sync}" onpaste="handleRichTextPaste(event,this)" onkeydown="handleRichTextKeydown(event,this)">${safeHtml}</div>
    <textarea class="rich-text-storage" data-testid="${esc(testIdPrefix)}-storage" aria-hidden="true" tabindex="-1">${esc(sanitizeRichTextHtml(safeHtml))}</textarea>
  </div>`;
}

function moveCursorToEndOfContent(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function syncRichTextEditor(editor) {
  const field = editor?.closest?.('.rich-text-field');
  const storage = field?.querySelector?.('.rich-text-storage');
  if (!storage) return;
  storage.value = sanitizeRichTextHtml(editor.innerHTML || '');
}

function richTextEditorValue(editor) {
  if (!editor) return '';
  return sanitizeRichTextHtml(editor.innerHTML || '');
}

function handleRichTextPaste(event, editor) {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') || '';
  const html = plainTextToStructuredRichHtml(text);
  if (html) {
    document.execCommand('insertHTML', false, html);
  } else {
    document.execCommand('insertText', false, text);
  }
  syncRichTextEditor(editor);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function richTextExec(editor, command) {
  if (!editor) return;
  editor.focus();
  if (command === 'indent' && indentRichTextListItem(editor)) {
    syncRichTextEditor(editor);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const execCommand = command === 'bold'
    ? 'bold'
    : command === 'ordered'
    ? 'insertOrderedList'
    : command === 'unordered'
    ? 'insertUnorderedList'
    : command === 'indent'
    ? 'indent'
    : 'outdent';
  document.execCommand(execCommand, false, null);
  syncRichTextEditor(editor);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function getRichTextActiveListItem(editor) {
  const selection = window.getSelection?.();
  const anchor = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
    ? selection.anchorNode
    : selection?.anchorNode?.parentElement;
  const item = anchor?.closest?.('li');
  return item && editor?.contains?.(item) ? item : null;
}

function placeCursorAtEnd(node) {
  if (!node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = window.getSelection?.();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function indentRichTextListItem(editor) {
  const item = getRichTextActiveListItem(editor);
  if (!item) return false;
  const previous = item.previousElementSibling;
  if (!previous || previous.tagName !== 'LI') return false;
  let nested = Array.from(previous.children || []).find((child) => child.tagName === 'OL');
  if (!nested) {
    nested = document.createElement('ol');
    previous.appendChild(nested);
  }
  nested.appendChild(item);
  placeCursorAtEnd(item);
  return true;
}

function applyRichTextSecondLevelOrderedList(editor) {
  if (!editor) return;
  editor.focus();
  const currentItem = getRichTextActiveListItem(editor);
  if (currentItem && indentRichTextListItem(editor)) {
    syncRichTextEditor(editor);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  document.execCommand('insertOrderedList', false, null);
  syncRichTextEditor(editor);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleRichTextKeydown(event, editor) {
  const key = String(event.key || '').toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === '0') {
      event.preventDefault();
      richTextExec(editor, 'unordered');
      return;
    }
    if (key === '1') {
      event.preventDefault();
      richTextExec(editor, 'ordered');
      return;
    }
    if (key === '2') {
      event.preventDefault();
      applyRichTextSecondLevelOrderedList(editor);
      return;
    }
  }
  if (key === 'tab') {
    event.preventDefault();
    if (event.shiftKey) {
      richTextExec(editor, 'outdent');
      return;
    }
    const selection = window.getSelection?.();
    const anchor = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;
    if (anchor?.closest?.('li')) {
      richTextExec(editor, 'indent');
    } else {
      richTextExec(editor, 'unordered');
    }
  }
}

function applyRichTextCommand(button, command) {
  const field = button?.closest?.('.rich-text-field');
  const editor = field?.querySelector?.('.rich-text-editor');
  if (command === 'secondOrdered') {
    applyRichTextSecondLevelOrderedList(editor);
    return;
  }
  richTextExec(editor, command);
}

function renderProcReturnLines(wrap, tasks, overlayKey) {
  if(!wrap) return;
  const hasReturn = tasks.some((task, index) => index > 0 && task?.repeatable);
  if(!hasReturn) {
    wrap.classList.remove('pf-wrap-has-return');
    return;
  }
  wrap.classList.add('pf-wrap-has-return');
  const wrapRect = wrap.getBoundingClientRect();
  if(!wrapRect.width || !wrapRect.height) return;

  const cols = Array.from(wrap.querySelectorAll('.pf-col[data-id]'));
  const returnSpecs = [];

  for(let index = 1; index < tasks.length; index++) {
    const task = tasks[index];
    if(!task?.repeatable) continue;
    const currentCol = cols[index];
    const prevCol = cols[index - 1];
    const currentTask = currentCol?.querySelector('.pf-task');
    const prevTask = prevCol?.querySelector('.pf-task');
    if(!currentTask || !prevTask) continue;

    const currentRect = currentTask.getBoundingClientRect();
    const prevRect = prevTask.getBoundingClientRect();
    const startX = currentRect.left - wrapRect.left + currentRect.width * PROC_RETURN_START_RATIO;
    const startY = currentRect.top - wrapRect.top;
    const endX = prevRect.left - wrapRect.left + prevRect.width * PROC_RETURN_END_RATIO;
    const endY = prevRect.top - wrapRect.top;
    const laneY = Math.max(10, Math.min(startY, endY) - PROC_RETURN_LINE_OFFSET);
    returnSpecs.push({
      from: task.id,
      to: tasks[index - 1].id,
      points: [
        `${startX},${startY}`,
        `${startX},${laneY}`,
        `${endX},${laneY}`,
        `${endX},${endY}`,
      ].join(' '),
    });
  }

  if(!returnSpecs.length) {
    wrap.classList.remove('pf-wrap-has-return');
    return;
  }

  const markerId = `pf-return-arrow-${String(overlayKey || 'default').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const svgNs = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(svgNs, 'svg');
  overlay.setAttribute('class', 'pf-return-overlay');
  overlay.setAttribute('width', String(wrap.scrollWidth));
  overlay.setAttribute('height', String(wrap.scrollHeight));
  overlay.setAttribute('viewBox', `0 0 ${wrap.scrollWidth} ${wrap.scrollHeight}`);
  overlay.setAttribute('aria-hidden', 'true');

  const defs = document.createElementNS(svgNs, 'defs');
  const marker = document.createElementNS(svgNs, 'marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '4');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');
  const arrowPath = document.createElementNS(svgNs, 'path');
  arrowPath.setAttribute('d', 'M0,0 L8,4 L0,8');
  arrowPath.setAttribute('fill', 'none');
  arrowPath.setAttribute('stroke', '#94a3b8');
  arrowPath.setAttribute('stroke-width', '1.7');
  arrowPath.setAttribute('stroke-linecap', 'round');
  arrowPath.setAttribute('stroke-linejoin', 'round');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  overlay.appendChild(defs);

  for(const spec of returnSpecs) {
    const line = document.createElementNS(svgNs, 'polyline');
    line.setAttribute('class', 'pf-return-line');
    line.setAttribute('data-from', spec.from);
    line.setAttribute('data-to', spec.to);
    line.setAttribute('points', spec.points);
    line.setAttribute('fill', 'none');
    line.setAttribute('marker-end', `url(#${markerId})`);
    overlay.appendChild(line);
  }

  wrap.appendChild(overlay);
}

function syncTaskReturnableToggle(root = document) {
  const toggle = root.querySelector('[data-testid="task-returnable-toggle"]');
  if(!toggle) return;
  const label = toggle.closest('label');
  if(!label) return;

  for(const node of Array.from(label.childNodes)) {
    if(node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      node.textContent = ' ';
    }
  }

  let title = label.querySelector('.task-returnable-label');
  if(!title) {
    title = document.createElement('span');
    title.className = 'task-returnable-label';
    label.insertBefore(title, toggle);
  }
  title.textContent = '\u53ef\u9000\u56de';

  const helper = Array.from(label.querySelectorAll('span'))
    .find((item) => !item.classList.contains('task-returnable-label'));
  if(helper) {
    helper.classList.add('task-returnable-hint');
    helper.textContent = '\u5f53\u524d\u8282\u70b9\u5141\u8bb8\u9000\u56de\u4e0a\u4e00\u8282\u70b9\u91cd\u65b0\u5904\u7406';
  }
}

/* ═══════════════════════════════════════════════════════════
   PROCESS FLOW — 自定义 HTML 渲染器（不依赖 Mermaid）
   布局：任务横向直线 + 实体在任务正下方垂直虚线连接
═══════════════════════════════════════════════════════════ */
function getProcessFlowMode() {
  return S.ui.procDiagramMode === 'swimlane' ? 'swimlane' : 'linear';
}

function setProcessFlowMode(mode) {
  S.ui.procDiagramMode = mode === 'swimlane' ? 'swimlane' : 'linear';
  renderProcessTab();
}

function getProcessFlowShowEntities() {
  return S.ui.procDiagramShowEntities !== false;
}

function toggleProcessFlowEntities(checked) {
  S.ui.procDiagramShowEntities = Boolean(checked);
  renderProcessTab();
}

function getProcessFlowShowTasks() {
  return S.ui.procDiagramShowTasks === true;
}

function toggleProcessFlowTasks(checked) {
  S.ui.procDiagramShowTasks = Boolean(checked);
  if (checked && !S.ui.taskId) {
    S.ui.taskId = getDefaultTaskIdForProc(currentProc());
  }
  renderProcessTab();
}

function openProcessEditor(procId, taskId = null) {
  S.ui.tab = 'process';
  S.ui.procView = 'list';
  S.ui.procId = procId || S.ui.procId;
  S.ui.taskId = taskId || null;
  render();
}

function getProcessFlowGraph(proc) {
  const tasks = getProcNodes(proc);
  const flow = normalizeProcessFlow(proc);
  const taskNodes = tasks.map((task, index) => ({
    id: String(task.id || ('T' + (index + 1))),
    kind: 'task',
    title: String(task.name || task.id || ('节点' + (index + 1))),
    task,
  }));
  const taskIds = new Set(taskNodes.map((node) => node.id));
  const gatewayNodes = flow.nodes
    .filter((node) => node.kind === 'gateway' && !taskIds.has(node.id))
    .map((node) => ({
      id: node.id,
      kind: 'gateway',
      title: String(node.title || node.name || '').trim(),
      gatewayType: node.gatewayType || 'exclusive',
      role_id: node.role_id || node.roleId || '',
      source: node,
    }));
  const gatewayIds = new Set(gatewayNodes.map((node) => node.id));
  const hasStart = flow.edges.some((edge) => edge.from === 'START');
  const hasEnd = flow.edges.some((edge) => edge.to === 'END');
  const nodes = [
    ...(hasStart ? [{ id: 'START', kind: 'start', title: '开始' }] : []),
    ...taskNodes,
    ...gatewayNodes,
    ...(hasEnd ? [{ id: 'END', kind: 'end', title: '结束' }] : []),
  ];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = flow.edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge, index) => ({
      id: edge.id || ('E' + (index + 1)),
      from: edge.from,
      to: edge.to,
      label: String(edge.label || edge.condition || '').trim(),
      condition: String(edge.condition || '').trim(),
    }));
  return { nodes, edges, taskIds, gatewayIds };
}

function orderProcessFlowNodes(nodes, edges) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
    outgoing.get(edge.from).push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  });
  const queue = nodes.filter((node) => (inDegree.get(node.id) || 0) === 0).map((node) => node.id);
  const ordered = [];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(nodeById.get(id));
    for (const to of outgoing.get(id) || []) {
      inDegree.set(to, Math.max(0, (inDegree.get(to) || 0) - 1));
      if ((inDegree.get(to) || 0) === 0) queue.push(to);
    }
  }
  nodes.forEach((node) => {
    if (!seen.has(node.id)) ordered.push(node);
  });
  return ordered.filter(Boolean);
}

function getFlowNodeRoleId(node, incomingEdges, graphNodesById) {
  if (node.kind === 'task') return getTaskRoleIds(node.task)[0] || '';
  const explicitRoleId = String(node.role_id || node.roleId || '').trim();
  if (explicitRoleId) return explicitRoleId;
  const edge = node.kind === 'start'
    ? incomingEdges.find((item) => item.from === node.id)
    : incomingEdges.find((item) => item.to === node.id);
  const connected = edge ? graphNodesById.get(node.kind === 'start' ? edge.to : edge.from) : null;
  return connected ? getFlowNodeRoleId(connected, incomingEdges, graphNodesById) : '';
}

function getFlowNodeRoleName(node, incomingEdges, graphNodesById) {
  if (node.kind === 'task') return getTaskRoleNames(node.task)[0] || '未分配';
  const roleId = getFlowNodeRoleId(node, incomingEdges, graphNodesById);
  return roleId ? getRoleName(roleId) : '系统/判断';
}

function renderProcessFlowNodeMarkup(node, roleMap, onClickMap, classPrefix) {
  if (node.kind === 'gateway') {
    return '<div class="' + classPrefix + '-gateway" data-id="' + esc(node.id) + '"></div>';
  }
  if (node.kind === 'start' || node.kind === 'end') {
    const title = node.title || (node.kind === 'start' ? '开始' : '结束');
    return '<div class="' + classPrefix + '-boundary ' + classPrefix + '-' + node.kind + '" data-id="' + esc(node.id) + '">' + esc(title) + '</div>';
  }
  const roleNames = getTaskRoleNames(node.task);
  const c = getTaskPrimaryRoleStyle(node.task, roleMap);
  const clickable = onClickMap?.[node.id] ? ' ' + classPrefix + '-clickable' : '';
  const multiRoleClass = roleNames.length > 1 ? ' ' + classPrefix + '-task-multi-role' : '';
  return '<div class="' + classPrefix + '-task' + clickable + multiRoleClass + '" data-id="' + esc(node.id) + '"' +
    ' style="background:' + c.fill + ';border-color:' + c.stroke + ';color:' + c.color + '">' +
    '<div class="' + classPrefix + '-tn">' + esc(node.title || '') + '</div>' +
    (roleNames.length ? '<div class="' + classPrefix + '-role-list">' + renderTaskRoleChips(roleNames, roleMap, classPrefix + '-role-chip') + '</div>' : '') +
  '</div>';
}

function bindProcessFlowNodeClicks(el, onClickMap, selector) {
  if (!onClickMap) return;
  for (const [taskId, handler] of Object.entries(onClickMap)) {
    const safeId = window.CSS?.escape ? CSS.escape(taskId) : String(taskId).replace(/"/g, '\\"');
    const nodes = el.querySelectorAll(`${selector}[data-id="${safeId}"]`);
    nodes.forEach((node) => {
      node.style.cursor = 'pointer';
      node.addEventListener('click', (event) => {
        if (processFlowDragMoved) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        handler(event);
      });
    });
  }
}

function getProcessFlowEditorNodes(proc, side = 'any') {
  const graph = getProcessFlowGraph(proc);
  const regularNodes = graph.nodes.filter((node) => node.kind !== 'start' && node.kind !== 'end');
  if (side === 'from') return [{ id: 'START', kind: 'start', title: '开始' }, ...regularNodes];
  if (side === 'to') return [...regularNodes, { id: 'END', kind: 'end', title: '结束' }];
  return [{ id: 'START', kind: 'start', title: '开始' }, ...regularNodes, { id: 'END', kind: 'end', title: '结束' }];
}

function renderProcessFlowNodeOptions(proc, selectedId = '', side = 'any') {
  const emptyLabel = side === 'from' ? '选择上游' : side === 'to' ? '选择下游' : '选择节点';
  const emptyOption = `<option value="" ${selectedId ? '' : 'selected'}>${emptyLabel}</option>`;
  return emptyOption + getProcessFlowEditorNodes(proc, side).map((node) => {
    const label = node.kind === 'gateway'
      ? (node.title || '分支')
      : node.kind === 'start' || node.kind === 'end'
        ? node.title
        : (node.title || node.id);
    return `<option value="${esc(node.id)}" ${node.id === selectedId ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function getFlowNodeRoleMenuKey(procId, taskId) {
  return `${procId}::${taskId}`;
}

function renderFlowNodeRolePicker(proc, node) {
  const roles = getRoles();
  const selectedRoleIds = getTaskRoleIds(node);
  const selected = new Set(selectedRoleIds);
  const selectedNames = selectedRoleIds.map((roleId) => getRoleName(roleId)).filter(Boolean);
  const summary = selectedNames.length === 0
    ? '选择角色'
    : selectedNames.length === 1
      ? selectedNames[0]
      : `${selectedNames[0]} +${selectedNames.length - 1}`;
  const menuKey = getFlowNodeRoleMenuKey(proc.id, node.id);
  const open = S.ui.processFlowRoleMenu === menuKey;
  return `<div class="flow-node-role-picker${open ? ' is-open' : ''}${selectedNames.length ? ' has-value' : ''}" data-testid="process-flow-node-role-picker">
    <button type="button" class="flow-node-role-trigger" title="${esc(selectedNames.join('、') || '选择节点执行角色')}"
      onclick="toggleProcessFlowNodeRoleMenu('${esc(proc.id)}','${esc(node.id)}')">
      <span>${esc(summary)}</span>
      <b>⌄</b>
    </button>
    ${open ? `<div class="flow-node-role-menu" onclick="event.stopPropagation()">
      <div class="flow-node-role-menu-head">执行角色</div>
      ${roles.length ? roles.map((role) => `<label class="flow-node-role-option">
        <input type="checkbox" value="${esc(role.id)}" ${selected.has(role.id) ? 'checked' : ''}
          onchange="setProcessFlowNodeRole('${esc(proc.id)}','${esc(node.id)}','${esc(role.id)}',this.checked)">
        <span>${esc(role.name || role.id)}</span>
      </label>`).join('') : '<div class="flow-node-role-empty">暂无角色</div>'}
      <div class="flow-node-role-menu-footer">
        <button type="button" onclick="closeProcessFlowNodeRoleMenu()">完成</button>
      </div>
    </div>` : ''}
  </div>`;
}

function toggleProcessFlowNodeRoleMenu(procId, taskId) {
  const key = getFlowNodeRoleMenuKey(procId, taskId);
  S.ui.processFlowRoleMenu = S.ui.processFlowRoleMenu === key ? '' : key;
  refreshProcessStructureEditor('[data-testid="process-flow-node-row"]');
}

function closeProcessFlowNodeRoleMenu() {
  S.ui.processFlowRoleMenu = '';
  refreshProcessStructureEditor('[data-testid="process-flow-node-row"]');
}

function setProcessFlowNodeRole(procId, taskId, roleId, checked) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  const node = getProcNodes(proc).find((item) => item.id === taskId);
  if (!node) return;
  const next = new Set(getTaskRoleIds(node));
  if (checked) next.add(roleId);
  else next.delete(roleId);
  const roleIds = getRoles().map((role) => role.id).filter((id) => next.has(id));
  setTaskRoles(procId, taskId, roleIds);
  refreshProcessStructureEditor('[data-testid="process-flow-node-row"]');
}

function setProcessFlowNodeFlag() {
  // 起点和终点已经改为连线端点，不再作为节点属性维护。
}

function refreshProcessStructureEditor(anchorSelector = '[data-testid="process-flow-routing-editor"]') {
  if ((S.ui.procView || '') === 'list') {
    rerenderProcessEditor({ anchorSelector });
  } else {
    renderProcessTab();
  }
}

function moveProcessTask(procId, taskId, dir) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  const nodes = getProcNodes(proc);
  const index = nodes.findIndex((node) => node.id === taskId);
  const nextIndex = index + dir;
  if (index < 0 || nextIndex < 0 || nextIndex >= nodes.length) return;
  [nodes[index], nodes[nextIndex]] = [nodes[nextIndex], nodes[index]];
  markModified();
  renderSidebar();
  refreshProcessStructureEditor('[data-testid="process-flow-node-row"]');
}

function addProcessTaskDefinition(procId) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  addProcessTaskAfter(procId, '');
}

function addProcessTaskAfter(procId, afterTaskId = '') {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const allTasks = (S.doc?.processes || []).flatMap((item) => getProcNodes(item));
  const id = nextStableId('T', allTasks);
  const node = {
    id,
    name: '新节点',
    role_ids: [],
    roles: [],
    role_id: '',
    role: '',
    userSteps: [],
    orchestrationTasks: [],
    forms: [],
    entity_ops: [],
    repeatable: false,
    rules_note: '',
    businessRules: [],
  };
  const nodes = getProcNodes(proc);
  const index = nodes.findIndex((item) => item.id === afterTaskId);
  if (index >= 0) nodes.splice(index + 1, 0, node);
  else nodes.push(node);
  normalizeProcessFlow(proc);
  hydrateDocumentForUi(S.doc);
  markModified();
  renderSidebar();
  renderProcessTab();
}


function addProcessGateway(procId, afterGatewayId = '') {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const flow = normalizeProcessFlow(proc);
  const gateway = {
    id: nextStableId('B', flow.nodes || []),
    kind: 'gateway',
    gatewayType: 'exclusive',
    title: '',
    role_id: '',
  };
  const index = flow.nodes.findIndex((node) => node.id === afterGatewayId);
  if (index >= 0) flow.nodes.splice(index + 1, 0, gateway);
  else flow.nodes.push(gateway);
  markModified();
  refreshProcessStructureEditor('[data-testid="process-flow-gateway-row"]');
}

function moveProcessGateway(procId, gatewayId, dir) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const flow = normalizeProcessFlow(proc);
  const index = flow.nodes.findIndex((node) => node.id === gatewayId && node.kind === 'gateway');
  const gateways = flow.nodes.filter((node) => node.kind === 'gateway');
  const gatewayIndex = gateways.findIndex((node) => node.id === gatewayId);
  const swapGateway = gateways[gatewayIndex + dir];
  const swapIndex = swapGateway ? flow.nodes.findIndex((node) => node.id === swapGateway.id) : -1;
  if (index < 0 || swapIndex < 0) return;
  [flow.nodes[index], flow.nodes[swapIndex]] = [flow.nodes[swapIndex], flow.nodes[index]];
  markModified();
  refreshProcessStructureEditor('[data-testid="process-flow-gateway-row"]');
}

function removeProcessGateway(procId, gatewayId) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const flow = normalizeProcessFlow(proc);
  flow.nodes = flow.nodes.filter((node) => node.id !== gatewayId);
  flow.edges = flow.edges.filter((edge) => edge.from !== gatewayId && edge.to !== gatewayId);
  markModified();
  refreshProcessStructureEditor('[data-testid="process-flow-gateway-row"]');
}

function setProcessGateway(procId, gatewayId, key, value) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const flow = normalizeProcessFlow(proc);
  const gateway = flow.nodes.find((node) => node.id === gatewayId && node.kind === 'gateway');
  if (!gateway) return;
  if (key === 'role_id') gateway.role_id = String(value || '').trim();
  else if (key === 'title') gateway.title = String(value || '').trim();
  markModified();
  renderProcDiagramNow();
}

function addProcessBoundary() {
  // 起点和终点已经改为连线端点，不再提供新增入口。
}

function setProcessBoundary() {
  // 起点和终点已经改为连线端点，不再提供独立编辑入口。
}

function removeProcessBoundary() {
  // 起点和终点已经改为连线端点，不再提供删除入口。
}

function addProcessFlowEdge(procId, afterEdgeId = '') {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const flow = normalizeProcessFlow(proc);
  const edge = {
    id: nextStableId('L', flow.edges || []),
    from: '',
    to: '',
    label: '',
    condition: '',
  };
  const index = flow.edges.findIndex((item) => item.id === afterEdgeId);
  if (index >= 0) flow.edges.splice(index + 1, 0, edge);
  else flow.edges.push(edge);
  markModified();
  refreshProcessStructureEditor('[data-testid="process-flow-edge-row"]');
}

function moveProcessFlowEdge(procId, edgeId, dir) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const flow = normalizeProcessFlow(proc);
  const index = flow.edges.findIndex((edge) => edge.id === edgeId);
  const nextIndex = index + dir;
  if (index < 0 || nextIndex < 0 || nextIndex >= flow.edges.length) return;
  [flow.edges[index], flow.edges[nextIndex]] = [flow.edges[nextIndex], flow.edges[index]];
  markModified();
  refreshProcessStructureEditor('[data-testid="process-flow-edge-row"]');
}

function removeProcessFlowEdge(procId, edgeId) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const flow = normalizeProcessFlow(proc);
  flow.edges = flow.edges.filter((edge) => edge.id !== edgeId);
  markModified();
  refreshProcessStructureEditor('[data-testid="process-flow-edge-row"]');
}

function setProcessFlowEdge(procId, edgeId, key, value) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc) return;
  const flow = normalizeProcessFlow(proc);
  const edge = flow.edges.find((item) => item.id === edgeId);
  if (!edge) return;
  if (key === 'from') {
    const nextValue = String(value || '').trim();
    if (nextValue === 'END') return;
    edge.from = nextValue;
    if (edge.to === 'START') edge.to = '';
  } else if (key === 'to') {
    const nextValue = String(value || '').trim();
    if (nextValue === 'START') return;
    edge.to = nextValue;
    if (edge.from === 'END') edge.from = '';
  } else if (key === 'label' || key === 'condition') {
    edge[key] = String(value || '').trim();
  }
  normalizeProcessFlow(proc);
  markModified();
  renderProcDiagramNow();
}

function getProcessFlowValidationMessages(proc) {
  const graph = getProcessFlowGraph(proc);
  const kindById = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const messages = [];
  const outgoing = new Map();
  const incoming = new Map();
  graph.edges.forEach((edge) => {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  });
  if (graph.nodes.some((node) => node.kind !== 'start' && node.kind !== 'end')) {
    if (!graph.edges.some((edge) => edge.from === 'START')) messages.push('建议至少添加一条“开始 -> 节点/分支”的连线。');
    if (!graph.edges.some((edge) => edge.to === 'END')) messages.push('建议至少添加一条“节点/分支 -> 结束”的连线。');
  }
  graph.edges.forEach((edge) => {
    if (edge.to === 'START') messages.push('“开始”不能作为下游，请调整连线。');
    if (edge.from === 'END') messages.push('“结束”不能作为上游，请调整连线。');
  });
  graph.nodes.filter((node) => node.kind === 'task').forEach((node) => {
    const nextEdges = (outgoing.get(node.id) || []).filter((edge) => edge.to !== 'END' && edge.to !== node.id);
    const nextKinds = new Set(nextEdges.map((edge) => kindById.get(edge.to)).filter(Boolean));
    const taskCount = nextEdges.filter((edge) => kindById.get(edge.to) === 'task').length;
    const branchCount = nextEdges.filter((edge) => kindById.get(edge.to) === 'gateway').length;
    if (taskCount > 1 || branchCount > 1 || (taskCount && branchCount)) {
      messages.push('节点“' + (node.title || node.id) + '”的下游只能选择 1 个节点或 1 个分支，不能同时连接节点和分支。');
    }
    if ([...nextKinds].some((kind) => kind !== 'task' && kind !== 'gateway')) {
      messages.push('节点“' + (node.title || node.id) + '”存在不支持的下游类型。');
    }
    const gatewayBranchCount = nextEdges
      .filter((edge) => kindById.get(edge.to) === 'gateway')
      .some((edge) => ((outgoing.get(edge.to) || []).filter((item) => item.to !== 'END').length > 1));
    if (getTaskRoleIds(node.task).length > 1 && (nextEdges.length > 1 || gatewayBranchCount)) {
      messages.push('共享节点“' + (node.title || node.id) + '”存在多个下游。如果不同角色对应不同路径、任务、输入输出，建议拆成多个单角色节点；如果只是“谁都可以处理”，可保留共享节点。');
    }
  });
  graph.nodes.filter((node) => node.kind === 'gateway').forEach((node) => {
    const nextEdges = (outgoing.get(node.id) || []).filter((edge) => edge.to !== 'END');
    const invalidTargets = nextEdges.filter((edge) => kindById.get(edge.to) !== 'task');
    if (invalidTargets.length) messages.push('分支“' + (node.title || node.id) + '”的下游只能连接节点或结束。');
    if (nextEdges.length > 3) messages.push('分支“' + (node.title || node.id) + '”最多连接 3 个下游节点。');
    const prevEdges = (incoming.get(node.id) || []).filter((edge) => edge.from !== 'START');
    if (prevEdges.length > 1) messages.push('分支“' + (node.title || node.id) + '”建议只保留 1 个上游节点，避免分支来源混乱。');
  });
  return [...new Set(messages)];
}
function renderProcessFlowRoutingEditor(proc) {
  const flow = normalizeProcessFlow(proc);
  const nodes = getProcNodes(proc);
  const gateways = flow.nodes.filter((node) => node.kind === 'gateway');
  const validationMessages = getProcessFlowValidationMessages(proc);
  const renderGatewayRoleOptions = (selectedRoleId = '') => getRoles()
    .map((role) => `<option value="${esc(role.id)}" ${role.id === selectedRoleId ? 'selected' : ''}>${esc(role.name || role.id)}</option>`)
    .join('');
  return `<div class="form-section process-flow-routing-editor" data-testid="process-flow-routing-editor">
    <div class="section-toolbar">
      <h4>流程结构</h4>
      <div class="section-actions">
        <button class="btn btn-outline btn-sm" type="button" data-testid="process-flow-add-task" onclick="addProcessTaskDefinition('${esc(proc.id)}')">+ 节点</button>
        <button class="btn btn-outline btn-sm" type="button" data-testid="process-flow-add-gateway" onclick="addProcessGateway('${esc(proc.id)}')">+ 分支</button>
        <button class="btn btn-outline btn-sm" type="button" data-testid="process-flow-add-edge" onclick="addProcessFlowEdge('${esc(proc.id)}')">+ 连线</button>
      </div>
    </div>
    <p class="flow-routing-hint">在这里定义节点、分支和连线。开始和结束只在连线中选择，不作为独立元素新增；新增节点默认保持孤立，由用户手动添加连线。</p>
    ${validationMessages.length ? `<div class="flow-validation" data-testid="process-flow-validation">${validationMessages.map((message) => `<div>${esc(message)}</div>`).join('')}</div>` : ''}
    <div class="flow-routing-grid">
      <div class="flow-routing-column">
        <h5>节点</h5>
        ${nodes.length ? nodes.map((node, index) => `<div class="flow-routing-row flow-node-row" data-testid="process-flow-node-row">
          <input type="text" value="${esc(node.name || '')}" placeholder="节点名称"
            oninput="setTask('${esc(proc.id)}','${esc(node.id)}','name',this.value);renderProcDiagramNow()">
          ${renderFlowNodeRolePicker(proc, node)}
          <div class="flow-row-actions">
            <button type="button" class="flow-enter-action" title="进入节点编辑" onclick="openProcessEditor('${esc(proc.id)}','${esc(node.id)}')">→</button>
            <button type="button" title="在下方添加节点" onclick="addProcessTaskAfter('${esc(proc.id)}','${esc(node.id)}')">+</button>
            <button type="button" title="上移" onclick="moveProcessTask('${esc(proc.id)}','${esc(node.id)}',-1)" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" title="下移" onclick="moveProcessTask('${esc(proc.id)}','${esc(node.id)}',1)" ${index === nodes.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" title="删除节点" onclick="removeTask('${esc(proc.id)}','${esc(node.id)}')">×</button>
          </div>
        </div>`).join('') : '<p class="no-refs">暂无节点，可先添加节点。</p>'}
      </div>
      <div class="flow-routing-column">
        <h5>分支</h5>
        ${gateways.length ? gateways.map((gateway) => `<div class="flow-routing-row" data-testid="process-flow-gateway-row">
          <input type="text" data-testid="process-flow-gateway-title-input" value="${esc(gateway.title || '')}" placeholder="如：是否通过校验"
            oninput="setProcessGateway('${esc(proc.id)}','${esc(gateway.id)}','title',this.value)">
          <select onchange="setProcessGateway('${esc(proc.id)}','${esc(gateway.id)}','role_id',this.value)">
            <option value="">跟随上游 / 系统判断</option>
            ${renderGatewayRoleOptions(gateway.role_id || '')}
          </select>
          <div class="flow-row-actions">
            <button type="button" title="在下方添加分支" onclick="addProcessGateway('${esc(proc.id)}','${esc(gateway.id)}')">+</button>
            <button type="button" title="上移" onclick="moveProcessGateway('${esc(proc.id)}','${esc(gateway.id)}',-1)">↑</button>
            <button type="button" title="下移" onclick="moveProcessGateway('${esc(proc.id)}','${esc(gateway.id)}',1)">↓</button>
            <button type="button" title="删除分支" onclick="removeProcessGateway('${esc(proc.id)}','${esc(gateway.id)}')">×</button>
          </div>
        </div>`).join('') : '<p class="no-refs">暂无分支；当一个节点需要多个下游时，可先添加分支。</p>'}
      </div>
      <div class="flow-routing-column">
        <h5>连线</h5>
        ${flow.edges.length ? flow.edges.map((edge) => `<div class="flow-edge-row" data-testid="process-flow-edge-row">
          <select onchange="setProcessFlowEdge('${esc(proc.id)}','${esc(edge.id)}','from',this.value)">
            ${renderProcessFlowNodeOptions(proc, edge.from, 'from')}
          </select>
          <span class="flow-edge-arrow">→</span>
          <select onchange="setProcessFlowEdge('${esc(proc.id)}','${esc(edge.id)}','to',this.value)">
            ${renderProcessFlowNodeOptions(proc, edge.to, 'to')}
          </select>
          <input type="text" value="${esc(edge.label || '')}" placeholder="连线说明，如：通过"
            oninput="setProcessFlowEdge('${esc(proc.id)}','${esc(edge.id)}','label',this.value)">
          <div class="flow-row-actions">
            <button type="button" title="在下方添加连线" onclick="addProcessFlowEdge('${esc(proc.id)}','${esc(edge.id)}')">+</button>
            <button type="button" title="上移" onclick="moveProcessFlowEdge('${esc(proc.id)}','${esc(edge.id)}',-1)">↑</button>
            <button type="button" title="下移" onclick="moveProcessFlowEdge('${esc(proc.id)}','${esc(edge.id)}',1)">↓</button>
            <button type="button" title="删除连线" onclick="removeProcessFlowEdge('${esc(proc.id)}','${esc(edge.id)}')">×</button>
          </div>
        </div>`).join('') : '<p class="no-refs">暂无连线；添加连线后可选择“开始”或“结束”作为首尾端点。</p>'}
      </div>
    </div>
  </div>`;
}

function getProcessSwimlaneLayout(proc) {
  const flow = normalizeProcessFlow(proc);
  if (!flow.layout || typeof flow.layout !== 'object') flow.layout = {};
  if (!flow.layout.swimlane || typeof flow.layout.swimlane !== 'object') {
    flow.layout.swimlane = { laneOrder: [], items: {}, labels: {} };
  }
  if (!Array.isArray(flow.layout.swimlane.laneOrder)) flow.layout.swimlane.laneOrder = [];
  if (!flow.layout.swimlane.items || typeof flow.layout.swimlane.items !== 'object') flow.layout.swimlane.items = {};
  if (!flow.layout.swimlane.labels || typeof flow.layout.swimlane.labels !== 'object') flow.layout.swimlane.labels = {};
  return flow.layout.swimlane;
}

function getProcessFlowOffset(offsetMap, key) {
  const offset = offsetMap?.[key];
  return offset && typeof offset === 'object'
    ? { dx: Number(offset.dx || 0) || 0, dy: Number(offset.dy || 0) || 0 }
    : { dx: 0, dy: 0 };
}

function setProcessFlowOffset(offsetMap, key, dx, dy) {
  if (!key) return;
  const nextDx = Math.round(Number(dx || 0));
  const nextDy = Math.round(Number(dy || 0));
  if (!nextDx && !nextDy) delete offsetMap[key];
  else offsetMap[key] = { dx: nextDx, dy: nextDy };
}

function getProcessFlowEdgeLabel(edge) {
  return String(edge?.label || edge?.condition || '').trim();
}

function buildProcessSummaryGraph(proc) {
  const graph = getProcessFlowGraph(proc);
  const selfLoops = graph.edges.filter((edge) => edge.from && edge.from === edge.to);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const gatewayOut = new Map();
  const gatewayIn = new Map();
  graph.edges.filter((edge) => edge.from !== edge.to).forEach((edge) => {
    if (nodeById.get(edge.from)?.kind === 'gateway') {
      if (!gatewayOut.has(edge.from)) gatewayOut.set(edge.from, []);
      gatewayOut.get(edge.from).push(edge);
    }
    if (nodeById.get(edge.to)?.kind === 'gateway') {
      if (!gatewayIn.has(edge.to)) gatewayIn.set(edge.to, []);
      gatewayIn.get(edge.to).push(edge);
    }
  });
  const edges = [];
  const branchGroups = [];
  graph.edges.filter((edge) => edge.from !== edge.to).forEach((edge) => {
    const fromKind = nodeById.get(edge.from)?.kind;
    const toKind = nodeById.get(edge.to)?.kind;
    if (fromKind === 'gateway') return;
    if (toKind === 'gateway') {
      const outs = gatewayOut.get(edge.to) || [];
      const groupId = `${edge.from}->${edge.to}`;
      const targets = outs.map((outEdge) => outEdge.to).filter(Boolean);
      if (targets.length > 1) {
        branchGroups.push({
          id: groupId,
          source: edge.from,
          gateway: edge.to,
          targets,
        });
      }
      outs.forEach((outEdge, index) => {
        edges.push({
          id: outEdge.id || edge.id,
          from: edge.from,
          to: outEdge.to,
          label: getProcessFlowEdgeLabel(outEdge) || getProcessFlowEdgeLabel(edge),
          condition: outEdge.condition || edge.condition || '',
          branchGroupId: groupId,
          branchIndex: index,
        });
      });
      return;
    }
    edges.push({ ...edge, label: getProcessFlowEdgeLabel(edge) });
  });
  const nodeIds = new Set();
  edges.forEach((edge) => {
    nodeIds.add(edge.from);
    nodeIds.add(edge.to);
  });
  getProcNodes(proc).forEach((task) => nodeIds.add(String(task.id || '')));
  const nodes = graph.nodes.filter((node) => node.kind !== 'gateway' && nodeIds.has(node.id));
  const visibleEdges = edges.map((edge) => ({ ...edge }));
  const outgoing = new Map();
  const incoming = new Map();
  visibleEdges.forEach((edge) => {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  });
  const skipEdgeKeys = new Set();
  const extraEdges = [];
  branchGroups.forEach((group) => {
    const targetSet = new Set(group.targets);
    visibleEdges
      .filter((edge) => targetSet.has(edge.from) && targetSet.has(edge.to))
      .forEach((innerEdge) => {
        skipEdgeKeys.add(innerEdge.id || `${innerEdge.from}->${innerEdge.to}`);
        (outgoing.get(innerEdge.to) || [])
          .filter((downstreamEdge) => !targetSet.has(downstreamEdge.to))
          .forEach((downstreamEdge) => {
          extraEdges.push({
            ...downstreamEdge,
            id: `${innerEdge.id || innerEdge.from}-${downstreamEdge.id || downstreamEdge.to}`,
            from: innerEdge.from,
            to: downstreamEdge.to,
            label: getProcessFlowEdgeLabel(innerEdge) || getProcessFlowEdgeLabel(downstreamEdge),
            syntheticBranchJoin: true,
          });
        });
      });
  });
  const normalizedEdges = visibleEdges
    .filter((edge) => !skipEdgeKeys.has(edge.id || `${edge.from}->${edge.to}`))
    .concat(extraEdges);
  return { nodes, edges: normalizedEdges, selfLoops, branchGroups };
}

function buildProcessSummaryLayout(proc) {
  const { nodes, edges, selfLoops, branchGroups = [] } = buildProcessSummaryGraph(proc);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  const incoming = new Map();
  edges.forEach((edge) => {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  });
  const starts = nodeById.has('START')
    ? ['START']
    : nodes.filter((node) => !(incoming.get(node.id) || []).length).map((node) => node.id);
  const rank = new Map();
  const queue = [];
  starts.forEach((id, index) => {
    rank.set(id, 0);
    queue.push(id);
    if (index > 0) rank.set(id, 0);
  });
  let guard = 0;
  while (queue.length && guard < nodes.length * Math.max(2, edges.length + 1)) {
    guard += 1;
    const id = queue.shift();
    const currentRank = rank.get(id) || 0;
    (outgoing.get(id) || []).forEach((edge) => {
      const nextRank = currentRank + 1;
      if (!rank.has(edge.to) || nextRank > rank.get(edge.to)) {
        rank.set(edge.to, nextRank);
        queue.push(edge.to);
      }
    });
  }
  nodes.forEach((node) => {
    if (!rank.has(node.id)) rank.set(node.id, Math.max(0, rank.size));
  });

  const row = new Map();
  starts.forEach((id, index) => row.set(id, index));
  const branchNodeRows = new Set();
  let nextFreeRow = Math.max(1, starts.length);
  const orderedByRank = [...nodes].sort((a, b) => (rank.get(a.id) || 0) - (rank.get(b.id) || 0));
  orderedByRank.forEach((node) => {
    if (!row.has(node.id)) {
      const parentRows = (incoming.get(node.id) || []).map((edge) => row.get(edge.from)).filter((value) => value !== undefined);
      row.set(node.id, parentRows.length ? Math.min(...parentRows) : nextFreeRow++);
    }
    const outs = outgoing.get(node.id) || [];
    if (outs.length > 1) {
      const sourceRow = row.get(node.id) || 0;
      const directMergeEdge = outs.find((edge) => (
        (incoming.get(edge.to) || []).length > 1
        && edge.to !== 'END'
      ));
      let branchIndex = 1;
      outs.forEach((edge, index) => {
        const laneRow = directMergeEdge && edge === directMergeEdge
          ? sourceRow
          : sourceRow + (directMergeEdge ? branchIndex++ : index);
        row.set(edge.to, laneRow);
        if (laneRow !== sourceRow && edge.to !== 'END') branchNodeRows.add(edge.to);
      });
      nextFreeRow = Math.max(nextFreeRow, sourceRow + outs.length);
    } else if (outs.length === 1 && !row.has(outs[0].to)) {
      row.set(outs[0].to, row.get(node.id) || 0);
    }
  });
  const incomingByTarget = new Map();
  edges.forEach((edge) => {
    if (!incomingByTarget.has(edge.to)) incomingByTarget.set(edge.to, []);
    incomingByTarget.get(edge.to).push(edge);
  });
  incomingByTarget.forEach((list, targetId) => {
    if (list.length <= 1) return;
    const rows = list.map((edge) => row.get(edge.from)).filter((value) => value !== undefined);
    if (rows.length) row.set(targetId, Math.min(...rows));
  });
  orderedByRank.forEach((node) => {
    const outs = outgoing.get(node.id) || [];
    if (outs.length !== 1) return;
    const [edge] = outs;
    if (branchNodeRows.has(node.id)) return;
    if ((incoming.get(edge.to) || []).length === 1) row.set(edge.to, row.get(node.id) || 0);
  });
  const alignSingleUpstream = (nodeId, targetRow, visited = new Set()) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    (incoming.get(nodeId) || []).forEach((edge) => {
      const prevOuts = outgoing.get(edge.from) || [];
      const nextIns = incoming.get(edge.to) || [];
      if (prevOuts.length === 1 && nextIns.length === 1) {
        row.set(edge.from, targetRow);
        alignSingleUpstream(edge.from, targetRow, visited);
      }
    });
  };
  branchGroups.forEach((group) => {
    const targets = group.targets.filter((targetId) => nodeById.has(targetId));
    if (targets.length <= 1 || !nodeById.has(group.source)) return;
    const baseRow = Math.floor(row.get(group.source) || 0);
    const centerRow = baseRow + (targets.length - 1) / 2;
    const targetSet = new Set(targets);
    row.set(group.source, centerRow);
    alignSingleUpstream(group.source, centerRow);
    targets.forEach((targetId, index) => {
      row.set(targetId, baseRow + index);
      branchNodeRows.add(targetId);
    });
    const downstreamCounts = new Map();
    targets.forEach((targetId) => {
      (outgoing.get(targetId) || [])
        .filter((edge) => !targetSet.has(edge.to))
        .forEach((edge) => downstreamCounts.set(edge.to, (downstreamCounts.get(edge.to) || 0) + 1));
    });
    downstreamCounts.forEach((count, targetId) => {
      if (count === targets.length) row.set(targetId, centerRow);
    });
  });
  const branchEdgeRows = [];
  outgoing.forEach((outs, sourceId) => {
    if (outs.length <= 1) return;
    const sourceRow = row.get(sourceId) || 0;
    outs.forEach((edge, index) => {
      const targetRow = row.get(edge.to) || 0;
      if (targetRow !== sourceRow) return;
      if ((incoming.get(edge.to) || []).length <= 1 && index === 0) return;
      const laneRow = sourceRow + index;
      edge.branchRow = laneRow;
      branchEdgeRows.push(laneRow);
    });
  });
  const returnEdges = [];
  const mainEdges = [];
  edges.forEach((edge) => {
    const fromRank = rank.get(edge.from) || 0;
    const toRank = rank.get(edge.to) || 0;
    if (edge.to !== 'END' && toRank <= fromRank) returnEdges.push(edge);
    else mainEdges.push(edge);
  });
  return { nodes, edges: mainEdges, returnEdges, selfLoops, rank, row, branchEdgeRows, branchGroups };
}

function renderProcGraphFlow(containerId, proc, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  const tasks = getProcNodes(proc);
  if(!tasks.length) { el.innerHTML = '<div class="diag-empty">暂无节点</div>'; initZoom(containerId); return; }
  const showEntities = getProcessFlowShowEntities();
  const roleMap = buildTaskRoleColorMap(tasks);
  const summary = buildProcessSummaryLayout(proc);
  const nodeW = 150;
  const nodeH = 62;
  const boundaryW = 64;
  const boundaryH = 34;
  const colGap = 68;
  const rowH = showEntities ? 118 : 86;
  const padX = 24;
  const hasAuxiliaryEdges = (summary.selfLoops || []).length || (summary.returnEdges || []).length;
  const padY = hasAuxiliaryEdges ? 58 : 18;
  const layout = new Map();
  const rankWidths = new Map();
  summary.nodes.forEach((node) => {
    const r = summary.rank.get(node.id) || 0;
    const isBoundary = node.kind === 'start' || node.kind === 'end';
    rankWidths.set(r, Math.max(rankWidths.get(r) || 0, isBoundary ? boundaryW : nodeW));
  });
  const rankXs = new Map();
  let nextX = padX;
  const rankList = [...rankWidths.keys()].sort((a, b) => a - b);
  rankList.forEach((rankValue) => {
    rankXs.set(rankValue, nextX);
    nextX += (rankWidths.get(rankValue) || nodeW) + colGap;
  });
  let maxRank = 0;
  let maxRow = 0;
  summary.nodes.forEach((node) => {
    const r = summary.rank.get(node.id) || 0;
    const yRow = summary.row.get(node.id) || 0;
    maxRank = Math.max(maxRank, r);
    maxRow = Math.max(maxRow, yRow);
    const isBoundary = node.kind === 'start' || node.kind === 'end';
    const w = isBoundary ? boundaryW : nodeW;
    const h = isBoundary ? boundaryH : nodeH;
    const rowTop = padY + yRow * rowH;
    layout.set(node.id, {
      x: rankXs.get(r) || padX,
      y: isBoundary ? rowTop + (nodeH - boundaryH) / 2 : rowTop,
      w,
      h,
    });
  });
  (summary.branchEdgeRows || []).forEach((yRow) => {
    maxRow = Math.max(maxRow, yRow);
  });
  const lastRankX = rankXs.get(maxRank) || padX;
  const lastRankW = rankWidths.get(maxRank) || nodeW;
  const hasBypassEdges = summary.edges.some((edge) => (
    (summary.row.get(edge.from) || 0) === (summary.row.get(edge.to) || 0)
    && Math.abs((summary.rank.get(edge.to) || 0) - (summary.rank.get(edge.from) || 0)) > 1
  ));
  const boardW = Math.max(720, padX + lastRankX + lastRankW + 40);
  const boardH = Math.max(120, padY * 2 + (maxRow + 1) * rowH + (hasBypassEdges ? 54 : 0));
  const markerId = `pf-arrow-${String(containerId || 'default').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const summaryOutgoing = new Map();
  summary.edges.forEach((edge) => {
    if (!summaryOutgoing.has(edge.from)) summaryOutgoing.set(edge.from, []);
    summaryOutgoing.get(edge.from).push(edge);
  });
  const edgeLabels = [];
  const edgeKey = (edge) => `${edge.from}->${edge.to}`;
  const branchEdgeSkip = new Set();
  const branchLines = (summary.branchGroups || []).map((group, groupIndex) => {
    const source = layout.get(group.source);
    const targets = (group.targets || [])
      .map((targetId) => ({ id: targetId, pos: layout.get(targetId) }))
      .filter((item) => item.pos)
      .sort((left, right) => left.pos.y - right.pos.y);
    if (!source || targets.length <= 1) return '';
    const targetSet = new Set(targets.map((item) => item.id));
    const branchEdges = (summary.edges || []).filter((edge) => edge.from === group.source && targetSet.has(edge.to));
    branchEdges.forEach((edge) => branchEdgeSkip.add(edgeKey(edge)));
    const targetDownstream = targets.map((target) => (summary.edges || [])
      .filter((edge) => edge.from === target.id && !targetSet.has(edge.to)));
    const joinId = targetDownstream.length
      ? (targetDownstream[0].find((edge) => targetDownstream.every((list) => list.some((item) => item.to === edge.to)))?.to || '')
      : '';
    const join = joinId ? layout.get(joinId) : null;
    if (joinId) {
      targets.forEach((target) => branchEdgeSkip.add(`${target.id}->${joinId}`));
    }
    const sx = Math.round(source.x + source.w);
    const sourceY = Math.round(source.y + source.h / 2);
    const splitX = Math.round(Math.min(...targets.map((target) => target.pos.x)) - 26);
    const targetRight = Math.max(...targets.map((target) => target.pos.x + target.pos.w));
    const joinX = join ? Math.round(Math.min(join.x - 26, targetRight + 26)) : Math.round(targetRight + 26);
    const joinY = join ? Math.round(join.y + join.h / 2) : Math.round((targets[0].pos.y + targets[targets.length - 1].pos.y + targets[targets.length - 1].pos.h) / 2);
    const minTargetY = Math.min(...targets.map((target) => Math.round(target.pos.y + target.pos.h / 2)));
    const maxTargetY = Math.max(...targets.map((target) => Math.round(target.pos.y + target.pos.h / 2)));
    const pieces = [];
    pieces.push(`<polyline class="pf-link pf-branch-link" points="${sx},${sourceY} ${splitX},${sourceY}"></polyline>`);
    pieces.push(`<polyline class="pf-link pf-branch-link" points="${splitX},${minTargetY} ${splitX},${maxTargetY}"></polyline>`);
    targets.forEach((target, index) => {
      const targetY = Math.round(target.pos.y + target.pos.h / 2);
      pieces.push(`<polyline class="pf-link pf-branch-link" data-edge-id="${esc(`${group.id || groupIndex}-${target.id}`)}" points="${splitX},${targetY} ${Math.round(target.pos.x)},${targetY}" marker-end="url(#${markerId})"></polyline>`);
      const edge = branchEdges.find((item) => item.to === target.id);
      const label = getProcessFlowEdgeLabel(edge);
      if (label) {
        edgeLabels.push({
          id: edge?.id || `${group.id || groupIndex}-${target.id}`,
          label,
          x: Math.round((splitX + target.pos.x) / 2) - 14,
          y: targetY - 28,
        });
      }
      if (join) {
        pieces.push(`<polyline class="pf-link pf-branch-link" points="${Math.round(target.pos.x + target.pos.w)},${targetY} ${joinX},${targetY}"></polyline>`);
      }
    });
    if (join) {
      pieces.push(`<polyline class="pf-link pf-branch-link" points="${joinX},${minTargetY} ${joinX},${maxTargetY}"></polyline>`);
      pieces.push(`<polyline class="pf-link pf-branch-link" points="${joinX},${joinY} ${Math.round(join.x)},${joinY}" marker-end="url(#${markerId})"></polyline>`);
    }
    return pieces.join('');
  }).join('');
  const edgeLines = summary.edges.map((edge, index) => {
    if (branchEdgeSkip.has(edgeKey(edge))) return '';
    const from = layout.get(edge.from);
    const to = layout.get(edge.to);
    if (!from || !to) return '';
    const sx = from.x + from.w;
    const sy = from.y + from.h / 2;
    const tx = to.x;
    const ty = to.y + to.h / 2;
    const sameRow = Math.abs(sy - ty) < 2;
    const fromRank = summary.rank.get(edge.from) || 0;
    const toRank = summary.rank.get(edge.to) || 0;
    const branchRow = Number.isFinite(edge.branchRow) ? edge.branchRow : null;
    const isBranchLaneEdge = branchRow !== null && branchRow !== (summary.row.get(edge.from) || 0);
    const isBypassEdge = sameRow && Math.abs(toRank - fromRank) > 1;
    const midX = sx <= tx ? Math.round((sx + tx) / 2) : sx + 36 + (index % 3) * 12;
    const laneY = isBranchLaneEdge
      ? Math.round(padY + branchRow * rowH + nodeH / 2)
      : Math.round(Math.max(sy, ty) + 42 + (index % 3) * 12);
    const isSplitEdge = (summaryOutgoing.get(edge.from) || []).length > 1 && !sameRow;
    const splitLaneX = Math.round(sx + 26 + (index % 2) * 10);
    const points = isBranchLaneEdge
      ? `${Math.round(sx)},${Math.round(sy)} ${Math.round(sx + 24)},${Math.round(sy)} ${Math.round(sx + 24)},${laneY} ${Math.round(tx - 24)},${laneY} ${Math.round(tx - 24)},${Math.round(ty)} ${Math.round(tx)},${Math.round(ty)}`
      : isBypassEdge
      ? `${Math.round(sx)},${Math.round(sy)} ${Math.round(sx + 24)},${Math.round(sy)} ${Math.round(sx + 24)},${laneY} ${Math.round(tx - 24)},${laneY} ${Math.round(tx - 24)},${Math.round(ty)} ${Math.round(tx)},${Math.round(ty)}`
      : isSplitEdge
      ? `${Math.round(sx)},${Math.round(sy)} ${splitLaneX},${Math.round(sy)} ${splitLaneX},${Math.round(ty)} ${Math.round(tx)},${Math.round(ty)}`
      : sameRow
      ? `${Math.round(sx)},${Math.round(sy)} ${Math.round(tx)},${Math.round(ty)}`
      : `${Math.round(sx)},${Math.round(sy)} ${midX},${Math.round(sy)} ${midX},${Math.round(ty)} ${Math.round(tx)},${Math.round(ty)}`;
    const label = getProcessFlowEdgeLabel(edge);
    if (label) {
      edgeLabels.push({
        id: edge.id || `E${index + 1}`,
        label,
        x: isBypassEdge ? Math.round((sx + tx) / 2) - 8 : midX + 4,
        y: (isBypassEdge || isBranchLaneEdge) ? laneY - 22 : Math.round((sy + ty) / 2) - 12,
      });
    }
    return `<polyline class="pf-link" data-edge-id="${esc(edge.id || `E${index + 1}`)}" points="${points}" marker-end="url(#${markerId})"></polyline>`;
  }).join('');
  const returnLines = (summary.returnEdges || []).map((edge, index) => {
    const from = layout.get(edge.from);
    const to = layout.get(edge.to);
    if (!from || !to) return '';
    const startX = from.x + from.w * 0.68;
    const endX = to.x + to.w * 0.32;
    const startY = from.y;
    const endY = to.y;
    const laneY = Math.max(12, Math.min(startY, endY) - 26 - index * 12);
    const label = getProcessFlowEdgeLabel(edge);
    if (label) {
      edgeLabels.push({
        id: edge.id || `R${index + 1}`,
        label,
        x: Math.min(startX, endX) + Math.abs(startX - endX) / 2 - 18,
        y: laneY - 24,
      });
    }
    return `<polyline class="pf-link pf-return-link" points="${Math.round(startX)},${Math.round(startY)} ${Math.round(startX)},${Math.round(laneY)} ${Math.round(endX)},${Math.round(laneY)} ${Math.round(endX)},${Math.round(endY)}" marker-end="url(#${markerId})"></polyline>`;
  }).join('');
  const selfLoopLines = (summary.selfLoops || []).map((edge, index) => {
    const node = layout.get(edge.from);
    if (!node) return '';
    const x1 = node.x + node.w * 0.42;
    const x2 = node.x + node.w * 0.58;
    const topY = Math.max(10, node.y - 24 - (index % 3) * 10);
    const label = getProcessFlowEdgeLabel(edge);
    if (label) {
      edgeLabels.push({
        id: edge.id || `SL${index + 1}`,
        label,
        x: node.x + node.w / 2 - 20,
        y: topY - 22,
      });
    }
    return `<path class="pf-link pf-loop-link" d="M ${Math.round(x1)} ${Math.round(node.y)} C ${Math.round(x1 - 18)} ${Math.round(topY)} ${Math.round(x2 + 18)} ${Math.round(topY)} ${Math.round(x2)} ${Math.round(node.y)}" marker-end="url(#${markerId})"></path>`;
  }).join('');

  let h = `<div class="pf-wrap pf-graph-wrap" data-testid="process-summary-view" style="width:${boardW}px;height:${boardH}px">`;
  h += `<svg class="pf-link-layer" width="${boardW}" height="${boardH}" viewBox="0 0 ${boardW} ${boardH}" aria-hidden="true">
    <defs>
      <marker id="${markerId}" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L8,4 L0,8 Z" fill="#64748b"></path>
      </marker>
    </defs>
    ${branchLines}${edgeLines}${returnLines}${selfLoopLines}
  </svg>`;
  summary.nodes.forEach((node) => {
    const pos = layout.get(node.id);
    if (!pos) return;
    const eops = showEntities && node.kind === 'task' ? (node.task.entity_ops || []).filter((eo) => eo.ops?.length) : [];
    h += `<div class="pf-col" data-id="${esc(node.id)}" style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px">`;
    h += renderProcessFlowNodeMarkup(node, roleMap, onClickMap, 'pf');
    if(eops.length) {
      h += '<div class="pf-vline"></div><div class="pf-tags">';
      for(const eo of eops) {
        const en = getEntityName(eo.entity_id);
        const ops = (eo.ops || []).join('');
        h += `<span class="pf-tag">${esc(en)}·${esc(ops)}</span>`;
      }
      h += '</div>';
    }
    h += '</div>';
  });
  h += edgeLabels.map((item) => `<span class="pf-edge-label" data-edge-id="${esc(item.id)}" style="left:${item.x}px;top:${item.y}px">${esc(item.label)}</span>`).join('');
  h += '</div>';
  el.innerHTML = h;
  el.style.overflow = 'auto';
  bindProcessFlowNodeClicks(el, onClickMap, '.pf-task');
  el.addEventListener('mousedown', ev => {
    if(ev.target.closest('.pf-task,.pf-tag,.pf-boundary,.pf-edge-label')) return;
    ev.preventDefault();
    startEfPan(el, ev);
  });
  initZoom(containerId);
  if(ZOOM[containerId] && ZOOM[containerId] !== 1) applyZoom(containerId);
}

function renderProcSwimlaneFlow(containerId, proc, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  const tasks = getProcNodes(proc);
  if(!tasks.length) { el.innerHTML = '<div class="diag-empty">暂无节点</div>'; initZoom(containerId); return; }
  const showEntities = getProcessFlowShowEntities();
  const roleMap = buildTaskRoleColorMap(tasks);
  const graph = getProcessFlowGraph(proc);
  const swimlaneLayout = getProcessSwimlaneLayout(proc);
  const isEditableDiagram = containerId === 'proc-diagram' && S.ui.tab === 'process';
  const selfLoopEdges = graph.edges.filter((edge) => edge.from && edge.from === edge.to);
  const rawMainEdges = graph.edges.filter((edge) => edge.from !== edge.to);
  const rankProbeNodes = orderProcessFlowNodes(graph.nodes, rawMainEdges);
  const rankProbe = new Map(rankProbeNodes.map((node, index) => [node.id, index]));
  const returnEdges = rawMainEdges.filter((edge) => edge.to !== 'END' && (rankProbe.get(edge.to) || 0) <= (rankProbe.get(edge.from) || 0));
  const mainEdges = rawMainEdges.filter((edge) => !returnEdges.includes(edge));
  const orderedNodes = orderProcessFlowNodes(graph.nodes, mainEdges);
  const orderedLayoutNodes = orderedNodes.filter((node) => node.kind !== 'start' && node.kind !== 'end');
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingEdges = mainEdges;
  const orderIndexByNodeId = new Map(orderedLayoutNodes.map((node, index) => [node.id, index]));
  const lanes = [];
  const laneByName = new Map();
  const ensureLane = (name, key = '') => {
    const laneName = String(name || '未分配').trim() || '未分配';
    const laneKey = String(key || laneName).trim() || laneName;
    if (!laneByName.has(laneKey)) {
      const lane = { key: laneKey, name: laneName, nodes: [], index: lanes.length };
      laneByName.set(laneKey, lane);
      lanes.push(lane);
    }
    return laneByName.get(laneKey);
  };
  const visualNodes = [];
  const visualNodesByModelId = new Map();
  for (const node of orderedLayoutNodes) {
    const roleIds = node.kind === 'task' ? getTaskRoleIds(node.task) : [];
    const roleNames = node.kind === 'task' ? getTaskRoleNames(node.task) : [];
    const roleEntries = node.kind === 'task' && roleIds.length > 1
      ? roleIds.map((roleId, index) => ({ roleId, roleName: roleNames[index] || getRoleName(roleId) || '未分配' }))
      : [{ roleId: getFlowNodeRoleId(node, incomingEdges, nodeById), roleName: getFlowNodeRoleName(node, incomingEdges, nodeById) }];
    roleEntries.forEach((entry, roleIndex) => {
      const laneKey = entry.roleId || entry.roleName || '未分配';
      const lane = ensureLane(entry.roleName, laneKey);
      const visualNode = {
        ...node,
        modelId: node.id,
        visualId: roleEntries.length > 1 ? `${node.id}__role_${entry.roleId || roleIndex}` : node.id,
        roleId: entry.roleId || '',
        roleName: entry.roleName,
        laneKey,
        roleIndex,
        isRoleReplica: roleEntries.length > 1,
        orderIndex: orderIndexByNodeId.get(node.id) || 0,
      };
      lane.nodes.push(visualNode);
      visualNodes.push(visualNode);
      if (!visualNodesByModelId.has(node.id)) visualNodesByModelId.set(node.id, []);
      visualNodesByModelId.get(node.id).push(visualNode);
    });
  }
  if (swimlaneLayout.laneOrder.length) {
    const order = new Map(swimlaneLayout.laneOrder.map((key, index) => [key, index]));
    lanes.sort((a, b) => {
      const ai = order.has(a.key) ? order.get(a.key) : Number.MAX_SAFE_INTEGER;
      const bi = order.has(b.key) ? order.get(b.key) : Number.MAX_SAFE_INTEGER;
      return ai === bi ? a.index - b.index : ai - bi;
    });
    lanes.forEach((lane, index) => { lane.index = index; });
  }

  const colW = 180;
  const taskW = 132;
  const taskH = 54;
  const hasVisibleEntities = showEntities && tasks.some((task) => (task.entity_ops || []).some((eo) => eo.ops?.length));
  const laneHeaderW = 86;
  const gatewaySize = 22;
  const startX = laneHeaderW + 44;
  const firstNodeX = laneHeaderW + 94;
  const contentW = firstNodeX + Math.max(orderedLayoutNodes.length - 1, 0) * colW + 210;
  let boardW = Math.max(720, el.clientWidth ? el.clientWidth - 2 : 0, contentW);
  const getNodeEntityRows = (node) => {
    if (!showEntities || node.kind !== 'task') return 0;
    return (node.task.entity_ops || []).filter((eo) => eo.ops?.length).length;
  };
  const laneMetrics = lanes.map((lane) => {
    const maxEntityRows = Math.max(0, ...lane.nodes.map(getNodeEntityRows));
    const contentH = taskH + (maxEntityRows ? 8 + maxEntityRows * 20 + (maxEntityRows - 1) * 3 : 0);
    const height = Math.max(hasVisibleEntities ? 116 : 96, contentH + 28);
    return { ...lane, maxEntityRows, contentH, height, top: 0 };
  });
  let laneTop = 0;
  laneMetrics.forEach((lane) => {
    lane.top = laneTop;
    laneTop += lane.height;
  });
  const laneMetricByName = new Map(laneMetrics.map((lane) => [lane.key, lane]));
  let boardH = Math.max(96, laneTop);
  const nodeLayout = new Map();
  visualNodes.forEach((node) => {
    const lane = laneByName.get(node.laneKey || node.roleName) || lanes[0] || { index: 0, key: '', name: node.roleName };
    const laneMetric = laneMetricByName.get(lane.key) || laneMetrics[0] || { top: 0, height: 96 };
    const isGateway = node.kind === 'gateway';
    const w = isGateway ? gatewaySize : taskW;
    const h = isGateway ? gatewaySize : taskH;
    const entityRows = getNodeEntityRows(node);
    const entityBlockH = entityRows ? 8 + entityRows * 20 + (entityRows - 1) * 3 : 0;
    const contentH = h + entityBlockH;
    const offset = getProcessFlowOffset(swimlaneLayout.items, node.visualId || node.id);
    nodeLayout.set(node.id, {
      x: firstNodeX + node.orderIndex * colW + offset.dx,
      y: laneMetric.top + Math.round((laneMetric.height - contentH) / 2) + offset.dy,
      w,
      h,
      laneIndex: lane.index,
      laneTop: laneMetric.top,
      laneHeight: laneMetric.height,
    });
    nodeLayout.set(node.visualId, nodeLayout.get(node.id));
  });
  const boundaryNodes = graph.nodes.filter((node) => node.kind === 'start' || node.kind === 'end');
  boundaryNodes.forEach((boundary) => {
    const relatedEdges = mainEdges.filter((edge) => boundary.kind === 'start' ? edge.from === boundary.id : edge.to === boundary.id);
    const connectedLayouts = [];
    relatedEdges.forEach((edge) => {
      const connectedId = boundary.kind === 'start' ? edge.to : edge.from;
      const connectedVisuals = visualNodesByModelId.get(connectedId) || [];
      connectedVisuals.forEach((connectedVisual) => {
        const connectedLayout = nodeLayout.get(connectedVisual.visualId);
        if (connectedLayout) connectedLayouts.push({ visual: connectedVisual, layout: connectedLayout });
      });
    });
    if (!connectedLayouts.length) return;
    const firstConnected = connectedLayouts[0];
    const averageY = Math.round(connectedLayouts.reduce((sum, item) => sum + item.layout.y + item.layout.h / 2, 0) / connectedLayouts.length - 9);
    const maxRight = Math.max(...connectedLayouts.map((item) => item.layout.x + item.layout.w));
    const x = boundary.kind === 'start' ? startX : Math.max(firstNodeX + 180, maxRight + 72);
    const laneTopForEnd = Math.min(...connectedLayouts.map((item) => item.layout.laneTop));
    const laneBottomForEnd = Math.max(...connectedLayouts.map((item) => item.layout.laneTop + item.layout.laneHeight));
    const offset = getProcessFlowOffset(swimlaneLayout.items, boundary.id);
    const layout = {
      x: x + offset.dx,
      y: averageY + offset.dy,
      w: 18,
      h: 18,
      laneIndex: firstConnected.layout.laneIndex,
      laneTop: boundary.kind === 'end' ? laneTopForEnd : firstConnected.layout.laneTop,
      laneHeight: boundary.kind === 'end' ? laneBottomForEnd - laneTopForEnd : firstConnected.layout.laneHeight,
    };
    const boundaryVisual = {
      ...boundary,
      modelId: boundary.id,
      visualId: boundary.id,
      roleName: firstConnected.visual.roleName,
    };
    boardW = Math.max(boardW, x + 60);
    visualNodes.push(boundaryVisual);
    visualNodesByModelId.set(boundary.id, [boundaryVisual]);
    nodeLayout.set(boundary.id, layout);
  });
  nodeLayout.forEach((layout) => {
    boardW = Math.max(boardW, layout.x + layout.w + 90);
    boardH = Math.max(boardH, layout.y + layout.h + 70);
  });
  const topAuxGap = (selfLoopEdges.length || returnEdges.length) ? 54 : 0;
  if (topAuxGap) {
    nodeLayout.forEach((layout) => { layout.y += topAuxGap; });
    boardH += topAuxGap;
  }

  const edgeLabels = [];
  const visualEdges = mainEdges.flatMap((edge) => {
    const sources = visualNodesByModelId.get(edge.from) || [];
    const targets = visualNodesByModelId.get(edge.to) || [];
    return sources.flatMap((source, sourceIndex) => targets.map((target, targetIndex) => ({
      ...edge,
      visualId: `${edge.id || `${edge.from}-${edge.to}`}__${source.visualId}__${target.visualId}`,
      sourceVisualId: source.visualId,
      targetVisualId: target.visualId,
      showLabel: sourceIndex === 0 && targetIndex === 0,
    })));
  });
  const edgeLines = visualEdges.map((edge, index) => {
    const source = nodeLayout.get(edge.sourceVisualId);
    const target = nodeLayout.get(edge.targetVisualId);
    if (!source || !target) return '';
    const sx = source.x + source.w;
    const sy = source.y + source.h / 2;
    const tx = target.x;
    const ty = target.y + target.h / 2;
    const midX = sx <= tx ? Math.round((sx + tx) / 2) : sx + 34;
    const points = `${Math.round(sx)},${Math.round(sy)} ${midX},${Math.round(sy)} ${midX},${Math.round(ty)} ${Math.round(tx)},${Math.round(ty)}`;
    const label = edge.label || edge.condition || '';
    if (label && edge.showLabel) {
      const labelKey = edge.id || edge.visualId || `E${index + 1}`;
      const labelOffset = getProcessFlowOffset(swimlaneLayout.labels, labelKey);
      edgeLabels.push({
        id: labelKey,
        label,
        x: midX + 4 + labelOffset.dx,
        y: Math.round((sy + ty) / 2) - 12 + labelOffset.dy,
      });
    }
    return `<polyline class="ps-link" points="${points}" marker-end="url(#ps-arrow-${esc(containerId)})"></polyline>`;
  }).join('');
  const visualReturnEdges = returnEdges.flatMap((edge) => {
    const sources = visualNodesByModelId.get(edge.from) || [];
    const targets = visualNodesByModelId.get(edge.to) || [];
    return sources.flatMap((source, sourceIndex) => targets.map((target, targetIndex) => ({
      ...edge,
      visualId: `${edge.id || `${edge.from}-${edge.to}`}__return__${source.visualId}__${target.visualId}`,
      sourceVisualId: source.visualId,
      targetVisualId: target.visualId,
      showLabel: sourceIndex === 0 && targetIndex === 0,
    })));
  });
  const returnLines = visualReturnEdges.map((edge, index) => {
    const source = nodeLayout.get(edge.sourceVisualId);
    const target = nodeLayout.get(edge.targetVisualId);
    if (!source || !target) return '';
    const startX = source.x + source.w * 0.68;
    const endX = target.x + target.w * 0.32;
    const startY = source.y;
    const endY = target.y;
    const laneY = Math.max(10, Math.min(startY, endY) - 30 - (index % 4) * 13);
    const label = edge.label || edge.condition || '';
    if (label && edge.showLabel) {
      const labelKey = edge.id || `R${index + 1}`;
      const labelOffset = getProcessFlowOffset(swimlaneLayout.labels, labelKey);
      edgeLabels.push({
        id: labelKey,
        label,
        x: Math.min(startX, endX) + Math.abs(startX - endX) / 2 - 20 + labelOffset.dx,
        y: laneY - 24 + labelOffset.dy,
      });
    }
    return `<polyline class="ps-link ps-return-link" points="${Math.round(startX)},${Math.round(startY)} ${Math.round(startX)},${Math.round(laneY)} ${Math.round(endX)},${Math.round(laneY)} ${Math.round(endX)},${Math.round(endY)}" marker-end="url(#ps-arrow-${esc(containerId)})"></polyline>`;
  }).join('');
  const selfLoopLines = selfLoopEdges.map((edge, index) => {
    const visuals = visualNodesByModelId.get(edge.from) || [];
    return visuals.map((visual, visualIndex) => {
      const source = nodeLayout.get(visual.visualId);
      if (!source) return '';
      const x1 = source.x + source.w * 0.42;
      const x2 = source.x + source.w * 0.58;
      const topY = Math.max(8, source.y - 24 - ((index + visualIndex) % 3) * 10);
      const label = edge.label || edge.condition || '';
      if (label && visualIndex === 0) {
        const labelKey = edge.id || `SL${index + 1}`;
        const labelOffset = getProcessFlowOffset(swimlaneLayout.labels, labelKey);
        edgeLabels.push({
          id: labelKey,
          label,
          x: source.x + source.w / 2 - 22 + labelOffset.dx,
          y: topY - 22 + labelOffset.dy,
        });
      }
      return `<path class="ps-link ps-loop-link" d="M ${Math.round(x1)} ${Math.round(source.y)} C ${Math.round(x1 - 18)} ${Math.round(topY)} ${Math.round(x2 + 18)} ${Math.round(topY)} ${Math.round(x2)} ${Math.round(source.y)}" marker-end="url(#ps-arrow-${esc(containerId)})"></path>`;
    }).join('');
  }).join('');

  const renderNode = (node) => {
    const layout = nodeLayout.get(node.visualId || node.id);
    if (!layout) return '';
    const commonStyle = `left:${layout.x}px;top:${layout.y}px;width:${layout.w}px;height:${layout.h}px`;
    const dragAttrs = isEditableDiagram
      ? ` data-layout-key="${esc(node.visualId || node.modelId || node.id)}" onmousedown="startProcessFlowItemDrag('${esc(proc.id)}','${esc(containerId)}','item','${esc(node.visualId || node.modelId || node.id)}',event)"`
      : '';
    if (node.kind === 'start' || node.kind === 'end') {
      return `<div class="ps-${node.kind}${isEditableDiagram ? ' ps-draggable' : ''}" data-id="${esc(node.modelId || node.id)}" data-visual-id="${esc(node.visualId || node.id)}"${dragAttrs} style="left:${layout.x + layout.w / 2}px;top:${layout.y + layout.h / 2}px"><span>${esc(node.title || (node.kind === 'start' ? '开始' : '结束'))}</span></div>`;
    }
    if (node.kind === 'gateway') {
      return `<div class="ps-gateway${isEditableDiagram ? ' ps-draggable' : ''}" data-id="${esc(node.modelId || node.id)}"${dragAttrs} style="${commonStyle}">
        <i class="ps-gateway-x" aria-hidden="true"></i>
      </div>`;
    }
    const roleNames = getTaskRoleNames(node.task);
    const color = getTaskPrimaryRoleStyle(node.task, roleMap);
    const clickable = onClickMap?.[node.id] ? ' ps-clickable' : '';
    const shared = roleNames.length > 1;
    const eops = showEntities ? (node.task.entity_ops || []).filter((eo) => eo.ops?.length) : [];
    const entityTop = layout.y + layout.h + 8;
    return `<div class="ps-task${clickable}${shared ? ' ps-task-shared' : ''}${isEditableDiagram ? ' ps-draggable' : ''}" data-id="${esc(node.modelId || node.id)}" data-visual-id="${esc(node.visualId || node.id)}"${dragAttrs} style="${commonStyle};background:${color.fill};border-color:${color.stroke};color:${color.color}">
      <div class="ps-tn">${esc(node.title || '')}</div>
      ${roleNames.length ? `<div class="ps-role-list">${renderTaskRoleChips(roleNames, roleMap, 'ps-role-chip')}</div>` : ''}
    </div>${eops.length ? `<div class="ps-entity-tags" data-layout-key="${esc(node.visualId || node.modelId || node.id)}" style="left:${layout.x}px;top:${entityTop}px;width:${layout.w}px">
      ${eops.map((eo) => `<span class="ps-entity-tag">${esc(getEntityName(eo.entity_id))}·${esc((eo.ops || []).join(''))}</span>`).join('')}
    </div>` : ''}`;
  };

  let h = `<div class="ps-wrap horizontal" data-testid="process-swimlane-view" style="width:${boardW}px;height:${boardH}px">`;
  h += `<svg class="ps-link-layer" width="${boardW}" height="${boardH}" viewBox="0 0 ${boardW} ${boardH}" aria-hidden="true">
    <defs>
      <marker id="ps-arrow-${esc(containerId)}" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L8,4 L0,8 Z" fill="#111827"></path>
      </marker>
    </defs>
    <rect class="ps-board-bg" x="0.5" y="0.5" width="${boardW - 1}" height="${boardH - 1}"></rect>
    ${laneMetrics.map((lane) => `<rect class="ps-lane-title-bg" x="0.5" y="${lane.top + 0.5}" width="${laneHeaderW - 0.5}" height="${lane.height}"></rect>`).join('')}
    <line class="ps-lane-title-sep" x1="${laneHeaderW}" y1="0.5" x2="${laneHeaderW}" y2="${boardH - 0.5}"></line>
    ${laneMetrics.slice(1).map((lane) => `<line class="ps-lane-sep" x1="0.5" y1="${lane.top + 0.5}" x2="${boardW - 0.5}" y2="${lane.top + 0.5}"></line>`).join('')}
    ${edgeLines}${returnLines}${selfLoopLines}
    <rect class="ps-board-border" x="0.5" y="0.5" width="${boardW - 1}" height="${boardH - 1}"></rect>
  </svg>`;
  h += laneMetrics.map((lane) => `<div class="ps-lane-title${isEditableDiagram ? ' ps-lane-draggable' : ''}" data-lane-key="${esc(lane.key)}" ${isEditableDiagram ? `onmousedown="startProcessFlowLaneDrag('${esc(proc.id)}','${esc(containerId)}','${esc(lane.key)}',event)"` : ''} style="left:0;top:${lane.top}px;width:${laneHeaderW}px;height:${lane.height}px">${esc(lane.name)}</div>`).join('');
  h += visualNodes.map(renderNode).join('');
  h += edgeLabels.map((item) => `<span class="ps-edge-label${isEditableDiagram ? ' ps-draggable' : ''}" data-edge-id="${esc(item.id)}" ${isEditableDiagram ? `onmousedown="startProcessFlowItemDrag('${esc(proc.id)}','${esc(containerId)}','label','${esc(item.id)}',event)"` : ''} style="left:${item.x}px;top:${item.y}px">${esc(item.label)}</span>`).join('');
  h += '</div>';
  el.innerHTML = h;
  el.style.overflow = 'auto';
  el.style.minHeight = '0';
  bindProcessFlowNodeClicks(el, onClickMap, '.ps-task');
  el.addEventListener('mousedown', ev => {
    if(ev.target.closest('.ps-task,.ps-gateway,.ps-edge-label,.ps-start,.ps-end')) return;
    ev.preventDefault();
    startEfPan(el, ev);
  });
  initZoom(containerId);
  if(ZOOM[containerId] && ZOOM[containerId] !== 1) applyZoom(containerId);
}

function startProcessFlowItemDrag(procId, containerId, kind, key, event) {
  if (containerId !== 'proc-diagram') return;
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc || !key) return;
  event.stopPropagation();
  const swimlaneLayout = getProcessSwimlaneLayout(proc);
  const map = kind === 'label' ? swimlaneLayout.labels : swimlaneLayout.items;
  const startOffset = getProcessFlowOffset(map, key);
  processFlowDragMoved = false;
  processFlowDragState = {
    pending: true,
    type: kind === 'label' ? 'label' : 'item',
    procId,
    containerId,
    key,
    startX: event.clientX,
    startY: event.clientY,
    startOffset,
    scale: ZOOM[containerId] || 1,
    raf: 0,
  };
  processFlowDragState.timer = window.setTimeout(() => {
    if (!processFlowDragState || processFlowDragState.key !== key) return;
    processFlowDragState.pending = false;
    const target = document.querySelector(`#${CSS.escape(containerId)} [data-layout-key="${CSS.escape(key)}"], #${CSS.escape(containerId)} [data-edge-id="${CSS.escape(key)}"]`);
    target?.classList?.add('is-dragging-ready');
  }, 220);
  document.addEventListener('mousemove', onProcessFlowItemDrag);
  document.addEventListener('mouseup', endProcessFlowDrag);
}

function onProcessFlowItemDrag(event) {
  const drag = processFlowDragState;
  if (!drag || (drag.type !== 'item' && drag.type !== 'label')) return;
  if (drag.pending) return;
  const dx = (event.clientX - drag.startX) / (drag.scale || 1);
  const dy = (event.clientY - drag.startY) / (drag.scale || 1);
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) processFlowDragMoved = true;
  if (!processFlowDragMoved) return;
  const proc = S.doc?.processes?.find((item) => item.id === drag.procId);
  if (!proc) return;
  const swimlaneLayout = getProcessSwimlaneLayout(proc);
  const map = drag.type === 'label' ? swimlaneLayout.labels : swimlaneLayout.items;
  setProcessFlowOffset(map, drag.key, drag.startOffset.dx + dx, drag.startOffset.dy + dy);
  if (!drag.raf) {
    drag.raf = requestAnimationFrame(() => {
      drag.raf = 0;
      renderProcDiagramNow();
    });
  }
}

function startProcessFlowLaneDrag(procId, containerId, laneKey, event) {
  if (containerId !== 'proc-diagram') return;
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  if (!proc || !laneKey) return;
  event.preventDefault();
  event.stopPropagation();
  const laneEls = Array.from(document.querySelectorAll(`#${CSS.escape(containerId)} .ps-lane-title[data-lane-key]`));
  const laneTops = laneEls.map((el) => ({
    key: el.dataset.laneKey || '',
    top: Number.parseFloat(el.style.top || '0') || 0,
    height: Number.parseFloat(el.style.height || '') || el.offsetHeight || 0,
  })).filter((item) => item.key);
  processFlowDragMoved = false;
  processFlowDragState = {
    type: 'lane',
    procId,
    containerId,
    key: laneKey,
    startX: event.clientX,
    startY: event.clientY,
    laneTops,
  };
  document.addEventListener('mousemove', onProcessFlowLaneDrag);
  document.addEventListener('mouseup', endProcessFlowDrag);
}

function onProcessFlowLaneDrag(event) {
  const drag = processFlowDragState;
  if (!drag || drag.type !== 'lane') return;
  const dy = event.clientY - drag.startY;
  if (Math.abs(dy) > 3) processFlowDragMoved = true;
  const laneEl = document.querySelector(`#${CSS.escape(drag.containerId)} .ps-lane-title[data-lane-key="${CSS.escape(drag.key)}"]`);
  if (laneEl) laneEl.style.transform = `translateY(${dy}px)`;
}

function endProcessFlowDrag(event) {
  const drag = processFlowDragState;
  if (!drag) return;
  if (drag.timer) clearTimeout(drag.timer);
  document.removeEventListener('mousemove', onProcessFlowItemDrag);
  document.removeEventListener('mousemove', onProcessFlowLaneDrag);
  document.removeEventListener('mouseup', endProcessFlowDrag);
  if (drag.raf) cancelAnimationFrame(drag.raf);
  const proc = S.doc?.processes?.find((item) => item.id === drag.procId);
  if (proc && drag.type === 'lane' && processFlowDragMoved) {
    const dy = event.clientY - drag.startY;
    const active = drag.laneTops.find((lane) => lane.key === drag.key);
    const center = (active?.top || 0) + (active?.height || 0) / 2 + dy;
    const otherKeys = drag.laneTops.filter((lane) => lane.key !== drag.key);
    let insertIndex = otherKeys.findIndex((lane) => center < lane.top + lane.height / 2);
    if (insertIndex < 0) insertIndex = otherKeys.length;
    const nextOrder = otherKeys.map((lane) => lane.key);
    nextOrder.splice(insertIndex, 0, drag.key);
    getProcessSwimlaneLayout(proc).laneOrder = nextOrder;
  }
  if (proc && processFlowDragMoved) markModified();
  document.querySelectorAll(`#${CSS.escape(drag.containerId)} .is-dragging-ready`).forEach((item) => item.classList.remove('is-dragging-ready'));
  processFlowDragState = null;
  if (processFlowDragMoved || drag.type === 'lane') renderProcDiagramNow();
  setTimeout(() => { processFlowDragMoved = false; }, 80);
}

function renderProcFlow(containerId, proc, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  const tasks = getProcNodes(proc);
  if(getProcessFlowMode() === 'swimlane') {
    renderProcSwimlaneFlow(containerId, proc, onClickMap);
    return;
  }
  renderProcGraphFlow(containerId, proc, onClickMap);
}

function getTaskRolePickerCollapsedMap(procId) {
  if (!S.ui.procRolePickerCollapsed || typeof S.ui.procRolePickerCollapsed !== 'object') {
    S.ui.procRolePickerCollapsed = {};
  }
  const scopeKey = `${S.currentFile || 'draft'}:${procId}`;
  if (!S.ui.procRolePickerCollapsed[scopeKey] || typeof S.ui.procRolePickerCollapsed[scopeKey] !== 'object') {
    S.ui.procRolePickerCollapsed[scopeKey] = {};
  }
  return S.ui.procRolePickerCollapsed[scopeKey];
}

function isTaskRolePickerCollapsed(procId, task) {
  const collapsedMap = getTaskRolePickerCollapsedMap(procId);
  const explicit = collapsedMap[task?.id];
  if (typeof explicit === 'boolean') return explicit;
  return getTaskRoleIds(task).length > 0;
}

function toggleTaskRolePicker(procId, taskId) {
  const collapsedMap = getTaskRolePickerCollapsedMap(procId);
  const task = getProcNodes(S.doc?.processes?.find((item) => item.id === procId)).find((item) => item.id === taskId);
  const currentCollapsed = typeof collapsedMap[taskId] === 'boolean'
    ? collapsedMap[taskId]
    : getTaskRoleIds(task).length > 0;
  collapsedMap[taskId] = !currentCollapsed;
  rerenderProcessEditor({
    focusSelector: `[data-testid="task-role-toggle"][data-task-role-toggle="${String(taskId || '').replace(/"/g, '&quot;')}"]`,
  });
}

function renderTaskRoleCollapsedSummary(selectedRoleNames) {
  if(!selectedRoleNames.length) {
    return `<span class="task-role-collapsed-empty">当前未选择角色</span>`;
  }

  const previewNames = selectedRoleNames.slice(0, 3);
  const remainingCount = Math.max(0, selectedRoleNames.length - previewNames.length);
  return `<div class="task-role-collapsed-list">
    ${previewNames.map((roleName) => `<span class="task-role-collapsed-chip">${esc(roleName)}</span>`).join('')}
    ${remainingCount ? `<span class="task-role-collapsed-more">+${remainingCount}</span>` : ''}
  </div>`;
}

function renderTaskRolePicker(proc, task) {
  const roles = getRoles();
  if(!roles.length) {
    return `<div class="task-role-picker-empty">
      <span class="no-refs">暂无角色词典，请先到业务域页添加角色</span>
      <button class="btn btn-outline btn-sm" type="button" onclick="navigate('domain')">前往角色管理</button>
    </div>`;
  }

  const selectedRoleIds = getTaskRoleIds(task);
  const selectedRoleNames = getTaskRoleNames(task);
  const groupedRoles = getGroupedRoles();
  const collapsed = isTaskRolePickerCollapsed(proc.id, task);
  return `<div class="task-role-picker" data-testid="task-role-picker" data-task-role-picker="${esc(task.id)}">
    <div class="task-role-head">
      <div class="task-role-toggle-main" data-testid="task-role-summary">
        <span class="task-role-toggle-label">执行角色</span>
        <span class="task-role-toggle-count">${selectedRoleNames.length ? `已选 ${selectedRoleNames.length} 个` : '未选择'}</span>
      </div>
      <button class="task-role-toggle" type="button" data-testid="task-role-toggle" data-task-role-toggle="${esc(task.id)}"
        aria-expanded="${collapsed ? 'false' : 'true'}"
        onclick="toggleTaskRolePicker('${esc(proc.id)}','${esc(task.id)}')">
        <span class="task-role-toggle-text">${collapsed ? '展开角色' : '收起角色'}</span>
        <span class="task-role-toggle-caret ${collapsed ? 'is-collapsed' : 'is-expanded'}">▾</span>
      </button>
    </div>
    <div class="task-role-collapsed-preview${collapsed ? '' : ' hidden'}" data-testid="task-role-collapsed-preview">
      ${renderTaskRoleCollapsedSummary(selectedRoleNames)}
    </div>
    <div class="task-role-picker-body${collapsed ? ' hidden' : ''}" data-testid="task-role-picker-body">
      <div class="task-role-group-list" data-testid="task-role-groups">
        ${groupedRoles.map((group) => `<div class="task-role-group">
          <div class="task-role-group-head">
            <span class="task-role-group-name">${esc(group.name)}</span>
            <span class="task-role-group-count">${group.roles.length}</span>
          </div>
          <div class="task-role-option-list">
            ${group.roles.map((role) => {
              const active = selectedRoleIds.includes(role.id);
              return `<label class="task-role-option${active ? ' active' : ''}" data-task-role-id="${esc(role.id)}">
                <input type="checkbox" data-testid="task-role-checkbox" data-role-id="${esc(role.id)}"
                  ${active ? 'checked' : ''}
                  onchange="toggleTaskRoleSelection('${esc(proc.id)}','${esc(task.id)}','${esc(role.id)}',this.checked)">
                <span class="task-role-option-name">${esc(role.name)}</span>
              </label>`;
            }).join('')}
          </div>
        </div>`).join('')}
      </div>
      <div class="task-role-selected${selectedRoleNames.length ? '' : ' is-empty'}" data-testid="task-role-selected">
        ${selectedRoleNames.length
          ? `<span class="task-role-selected-count">已选 ${selectedRoleNames.length} 个角色</span>
             <div class="task-role-selected-list">${selectedRoleNames.map((roleName) => `<span class="task-role-selected-chip">${esc(roleName)}</span>`).join('')}</div>`
          : '<span class="task-role-selected-empty">可同时选择多个角色，流程图会按角色标签并排展示</span>'}
      </div>
      <div class="task-role-picker-actions">
        <button class="btn btn-ghost-sm" type="button" onclick="navigate('domain')">管理角色</button>
      </div>
    </div>
  </div>`;
}

function toggleTaskRoleSelection(procId, taskId, roleId, checked) {
  const proc = S.doc?.processes?.find((item) => item.id === procId);
  const task = getProcNodes(proc).find((item) => item.id === taskId);
  if(!task) return;

  const nextRoleIds = getTaskRoleIds(task).filter((item) => item !== roleId);
  if(checked) nextRoleIds.push(roleId);
  setTaskRoles(procId, taskId, nextRoleIds);
  renderSidebar();
  rerenderProcessEditor({
    anchorSelector: `[data-task-role-id="${String(roleId || '').replace(/"/g, '&quot;')}"]`,
  });
}

/* ═══════════════════════════════════════════════════════════
   ENTITY FLOW — 自定义 HTML swimlane 渲染（不依赖 Mermaid）
   布局：每个 group 一行（swimlane），SVG overlay 画关系线
═══════════════════════════════════════════════════════════ */
/* ── ER 图工具函数 ──────────────────────────────────────── */
/* 按连通度排序实体（组内连接多的靠前），并按跨组连接数排序组顺序 */

let stageDragState = null;


/* ── 侧边栏移动：流程（同业务组件内上下移） ── */
function moveProcInSd(procId, dir, e, stageId = '') {
  if(e) e.stopPropagation();
  const targetStageId = String(stageId || '').trim();
  if (targetStageId && !isVirtualStageId(targetStageId)) {
    moveStageProcessRef(targetStageId, procId, dir);
    renderSidebar();
    renderProcessTab();
    return;
  }
  const procs = S.doc.processes;
  const proc = procs.find(p=>p.id===procId); if(!proc) return;
  const sd = proc.subDomain||'';
  const sdList = procs.filter(p=>(p.subDomain||'')===sd);
  const idx = sdList.findIndex(p=>p.id===procId);
  const nidx = idx + dir;
  if(nidx < 0 || nidx >= sdList.length) return;
  const fi = procs.indexOf(sdList[idx]);
  const ti = procs.indexOf(sdList[nidx]);
  [procs[fi], procs[ti]] = [procs[ti], procs[fi]];
  markModified(); renderSidebar(); renderProcessTab();
}

/* ── 侧边栏移动：业务组件（整组移） ── */
function moveSdGroup(sd, dir, e) {
  if(e) e.stopPropagation();
  const procs = S.doc.processes;
  const sds = [...new Set(procs.map(p=>p.subDomain||''))];
  const idx = sds.indexOf(sd);
  const nidx = idx + dir;
  if(nidx < 0 || nidx >= sds.length) return;
  const blocks = sds.map(s => procs.filter(p=>(p.subDomain||'')===s));
  [blocks[idx], blocks[nidx]] = [blocks[nidx], blocks[idx]];
  S.doc.processes = blocks.flat();
  markModified(); renderSidebar(); renderProcessTab();
}

function addProcess(subDomain, stageId = '') {
  const id  = nextStableId('P', S.doc.processes);
  const pos = _nextFreePos(S.doc.processes, null); /* 自动填补空缺格子 */
  const stage = findStage(stageId, S.doc);
  const nextSubDomain = String(subDomain || stage?.subDomain || '').trim();
  S.doc.processes.push({id, name:'', subDomain:nextSubDomain, flowGroup:'', stageId:'', stagePos:{ x: 0, y: 0 }, trigger:'', outcome:'', prototypeFiles:[], nodes:[], pos});
  hydrateDocumentForUi(S.doc);
  if (stage?.id) addStageProcessRef(stage.id, id, { silent: true });
  markModified();
    openProcessEditor(id, null);
}

function addStageFlowNode(stageId) {
  const stage = findStage(stageId, S.doc);
  if (!stage) return;
  const id = nextStableId('P', S.doc.processes || []);
  const pos = _nextFreePos(S.doc.processes || [], null);
  S.doc.processes.push({
    id,
    name: '',
    subDomain: String(stage.subDomain || '').trim(),
    flowGroup: '',
    stageId: '',
    stagePos: { x: 0, y: 0 },
    trigger: '',
    outcome: '',
    prototypeFiles: [],
    nodes: [],
    pos,
  });
  hydrateDocumentForUi(S.doc);
  addStageProcessRef(stage.id, id, { silent: true });
  S.ui.procView = 'stage';
  S.ui.stageViewMode = 'detail';
  S.ui.stageId = stage.id;
  S.ui.stageEditorCollapsed = false;
  markModified();
  renderSidebar();
  rerenderStageWorkbench({ focusSelector: `[data-testid="stage-flow-name-input"][data-process-id="${id}"]`, caretToEnd: true });
}
async function removeProcess(id) {
  if(!await showAppConfirm('确认删除此流程及所有任务？', {
    title: '删除流程',
    confirmLabel: '删除',
  })) return;
  const removedRefIds = new Set(getProcessStageRefs(id, S.doc).map((ref) => ref.id));
  S.doc.processes = S.doc.processes.filter(p=>p.id!==id);
  getStages(S.doc).forEach((stage) => {
    stage.processLinks = getStageProcessLinks(stage).filter((link) => link.fromProcessId !== id && link.toProcessId !== id);
  });
  S.doc.stageFlowRefs = getStageFlowRefs(S.doc).filter((ref) => ref.processId !== id);
  S.doc.stageFlowLinks = getStageFlowLinks(S.doc).filter((link) => !removedRefIds.has(link.fromRefId) && !removedRefIds.has(link.toRefId));
  if(S.ui.procId===id){S.ui.procId=S.doc.processes[0]?.id||null; S.ui.taskId=null;}
  markModified(); render();
}
function setProc(procId,key,val) {
  const p=S.doc.processes.find(p=>p.id===procId);
  if(p){p[key]=val; markModified();}
}

function formatPrototypeInputId(procId) {
  return `proc-prototype-input-${String(procId || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function getProcessPrototypeExpandedMap(procId) {
  if (!S.ui.procPrototypeExpanded || typeof S.ui.procPrototypeExpanded !== 'object') {
    S.ui.procPrototypeExpanded = {};
  }
  const scopeKey = `${S.currentFile || 'draft'}:${procId}`;
  if (!S.ui.procPrototypeExpanded[scopeKey] || typeof S.ui.procPrototypeExpanded[scopeKey] !== 'object') {
    S.ui.procPrototypeExpanded[scopeKey] = {};
  }
  return S.ui.procPrototypeExpanded[scopeKey];
}

function isProcessPrototypeExpanded(procId, prototypeUid) {
  return !!getProcessPrototypeExpandedMap(procId)[prototypeUid];
}

function toggleProcessPrototypeVersions(procId, prototypeUid) {
  const expandedMap = getProcessPrototypeExpandedMap(procId);
  expandedMap[prototypeUid] = !expandedMap[prototypeUid];
  S.ui.procEditorFocusSelector = `[data-prototype-toggle="${String(prototypeUid || '').replace(/"/g, '&quot;')}"]`;
  rerenderProcessEditor({ focusSelector: S.ui.procEditorFocusSelector });
}

function findProcessPrototypeFile(proc, prototypeUid) {
  return getProcPrototypeFiles(proc).find((file) => file.uid === prototypeUid) || null;
}

function findProcessPrototypeVersion(prototypeFile, versionUid = '') {
  if (!prototypeFile) return null;
  const versions = Array.isArray(prototypeFile.versions) ? prototypeFile.versions : [];
  if (!versions.length) return null;
  const targetVersionUid = String(versionUid || prototypeFile.versionUid || '').trim();
  return versions.find((version) => version.uid === targetVersionUid) || versions[versions.length - 1] || null;
}

const PROCESS_ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
  'html', 'htm',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
  'pdf',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'md', 'txt', 'json', 'csv',
]);

const PROCESS_ATTACHMENT_PREVIEW_EXTENSIONS = new Set([
  'html', 'htm',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
  'pdf',
  'md', 'txt', 'json', 'csv',
]);

const PROCESS_ATTACHMENT_BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'ps1', 'sh', 'msi', 'dll', 'com', 'scr', 'jar', 'js', 'vbs', 'reg',
  'zip', 'rar', '7z',
]);

function getProcessAttachmentExtension(name = '') {
  const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function isProcessAttachmentAllowedFile(file) {
  const ext = getProcessAttachmentExtension(file?.name);
  if (!ext || PROCESS_ATTACHMENT_BLOCKED_EXTENSIONS.has(ext)) return false;
  return PROCESS_ATTACHMENT_ALLOWED_EXTENSIONS.has(ext);
}

function getProcessAttachmentKind(versionOrFile = {}) {
  const name = String(versionOrFile.name || '').trim();
  const contentType = String(versionOrFile.contentType || '').toLowerCase();
  const ext = getProcessAttachmentExtension(name);
  if (ext === 'html' || ext === 'htm' || contentType === 'text/html') return 'HTML 原型';
  if (contentType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '图片';
  if (contentType === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (['doc', 'docx', 'ppt', 'pptx'].includes(ext)) return '文档';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '表格';
  if (['md', 'txt', 'json'].includes(ext) || contentType.startsWith('text/')) return '文本';
  return '附件';
}

function canPreviewProcessAttachment(version = {}) {
  return PROCESS_ATTACHMENT_PREVIEW_EXTENSIONS.has(getProcessAttachmentExtension(version.name || ''));
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function decodeProcessAttachmentContent(version = {}) {
  if (String(version.contentEncoding || '') === 'base64') {
    const binary = atob(String(version.content || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return version.content || '';
}

function createProcessPrototypeObjectUrl(prototypeVersion) {
  if (prototypeVersion?.localUrl) return prototypeVersion.localUrl;
  const contentType = String(prototypeVersion?.contentType || 'text/html').trim() || 'text/html';
  const blob = new Blob([decodeProcessAttachmentContent(prototypeVersion || {})], {
    type: /charset=/i.test(contentType) ? contentType : `${contentType};charset=utf-8`,
  });
  return URL.createObjectURL(blob);
}

function hasInlineProcessAttachmentContent(prototypeVersion = {}) {
  return Boolean(prototypeVersion.localUrl) || (Object.prototype.hasOwnProperty.call(prototypeVersion, 'content') && String(prototypeVersion.content || '') !== '');
}

function setProcessAttachmentUploadProgress(active, percent = 0, message = '') {
  if (!S.ui.procAttachmentUpload) S.ui.procAttachmentUpload = { active: false, percent: 0, message: '' };
  S.ui.procAttachmentUpload = {
    active: Boolean(active),
    percent: Math.max(0, Math.min(100, Number(percent) || 0)),
    message: String(message || '').trim(),
  };
  const progress = document.querySelector('[data-testid="proc-prototype-upload-progress"]');
  const bar = document.querySelector('[data-testid="proc-prototype-upload-progress-bar"]');
  const label = document.querySelector('[data-testid="proc-prototype-upload-progress-message"]');
  if (progress) progress.classList.toggle('hidden', !active);
  if (bar) bar.style.width = `${S.ui.procAttachmentUpload.percent}%`;
  if (label) label.textContent = S.ui.procAttachmentUpload.message || '正在上传...';
}

function getPersistedProcessAttachmentUrl(prototypeFile, prototypeVersion, options = {}) {
  const documentName = String(S.currentFile || S.doc?.meta?.domain || '').trim();
  const attachmentUid = String(prototypeFile?.uid || '').trim();
  const versionUid = String(prototypeVersion?.uid || prototypeFile?.versionUid || '').trim();
  if (!documentName || !attachmentUid || !versionUid || !api?.attachmentUrl) return '';
  return api.attachmentUrl(documentName, attachmentUid, versionUid, options);
}

function syncProcessPrototypeCurrentVersion(prototypeFile, versionUid = '') {
  const normalized = normalizePrototypeFileEntry({
    ...prototypeFile,
    versionUid: String(versionUid || prototypeFile?.versionUid || '').trim(),
  });
  Object.assign(prototypeFile, normalized);
  return prototypeFile;
}

async function addProcessPrototypeFiles(procId, inputId) {
  const proc = S.doc.processes.find((item) => item.id === procId);
  const input = document.getElementById(inputId);
  if (!proc || !input?.files?.length) return;

  const selectedFiles = Array.from(input.files);
  const invalidFiles = selectedFiles.filter((file) => !isProcessAttachmentAllowedFile(file));
  if (invalidFiles.length) {
    alert(`不支持上传这些文件类型：${invalidFiles.map((file) => file.name).join('、')}`);
    input.value = '';
    return;
  }

  const uploadedVersions = [];
  try {
    setProcessAttachmentUploadProgress(true, 0, '正在上传附件...');
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const staged = await api.uploadAttachment(file, (filePercent) => {
        const totalPercent = Math.round(((index + (filePercent / 100)) / selectedFiles.length) * 100);
        setProcessAttachmentUploadProgress(true, totalPercent, `正在上传 ${file.name || '附件'} ${totalPercent}%`);
      });
      const localContentType = String(staged.contentType || file.type || 'application/octet-stream').trim() || 'application/octet-stream';
      const localPreviewBlob = /^text\//i.test(localContentType) || /html/i.test(localContentType)
        ? new Blob([file], { type: /charset=/i.test(localContentType) ? localContentType : `${localContentType};charset=utf-8` })
        : file;
      if (staged?.error || !staged?.ok) {
        throw new Error(staged?.status === 404 || staged?.error === 'not found'
          ? '附件上传接口不可用，请重启本地服务后再上传。'
          : (staged?.error || '附件上传失败'));
      }
      uploadedVersions.push({
        uid: createUiUid('protover'),
        name: String(file.name || '').trim() || '未命名附件',
        uploadToken: String(staged.token || '').trim(),
        localUrl: URL.createObjectURL(localPreviewBlob),
        contentEncoding: '',
        contentType: localContentType,
        size: Number(staged.size || file.size || 0) || 0,
        uploadedAt: formatPrototypeUploadedAt(),
      });
    }
  } catch (error) {
    alert(error?.message || '附件上传失败，请重试。');
    setProcessAttachmentUploadProgress(false);
    input.value = '';
    return;
  }
  const prototypeFiles = getProcPrototypeFiles(proc);
  const expandedMap = getProcessPrototypeExpandedMap(procId);
  for (const uploadedVersion of uploadedVersions) {
    const existingFile = prototypeFiles.find((file) => String(file.name || '').trim() === uploadedVersion.name);
    if (existingFile) {
      existingFile.versions = [
        ...(Array.isArray(existingFile.versions) ? existingFile.versions : []),
        {
          ...uploadedVersion,
          number: (Array.isArray(existingFile.versions) ? existingFile.versions.length : 0) + 1,
        },
      ];
      syncProcessPrototypeCurrentVersion(existingFile, uploadedVersion.uid);
      expandedMap[existingFile.uid] = true;
      continue;
    }
    prototypeFiles.push(normalizePrototypeFileEntry({
      uid: createUiUid('proto'),
      name: uploadedVersion.name,
      versionUid: uploadedVersion.uid,
      versions: [
        {
          ...uploadedVersion,
          number: 1,
        },
      ],
    }, prototypeFiles.length + 1));
  }
  proc.prototypeFiles = prototypeFiles.map((file, index) => normalizePrototypeFileEntry(file, index + 1));
  input.value = '';
  S.ui.procEditorFocusSelector = '[data-testid="proc-prototype-upload-button"]';
  markModified();
  rerenderProcessEditor({ focusSelector: '[data-testid="proc-prototype-upload-button"]' });
  setProcessAttachmentUploadProgress(true, 100, '附件已上传，保存后生效');
}

async function removeProcessPrototypeFile(procId, prototypeUid) {
  const proc = S.doc.processes.find((item) => item.id === procId);
  if (!proc) return;
  const prototypeFiles = getProcPrototypeFiles(proc);
  const target = prototypeFiles.find((file) => file.uid === prototypeUid);
  if (!target) return;
  if (!await showAppConfirm(`确认删除附件“${target.name || '未命名附件'}”？`, {
    title: '删除附件',
    confirmLabel: '删除',
  })) return;
  const nextFiles = prototypeFiles.filter((file) => file.uid !== prototypeUid);
  if (nextFiles.length === prototypeFiles.length) return;
  proc.prototypeFiles = nextFiles;
  delete getProcessPrototypeExpandedMap(procId)[prototypeUid];
  S.ui.procEditorFocusSelector = '[data-testid="proc-prototype-upload-button"]';
  markModified();
  rerenderProcessEditor({ focusSelector: '[data-testid="proc-prototype-upload-button"]' });
}

function openProcessPrototypeFile(procId, prototypeUid, versionUid = '') {
  const proc = S.doc.processes.find((item) => item.id === procId);
  const prototypeFile = findProcessPrototypeFile(proc, prototypeUid);
  if (!prototypeFile) return;
  const prototypeVersion = findProcessPrototypeVersion(prototypeFile, versionUid);
  if (!prototypeVersion) return;
  if (!canPreviewProcessAttachment(prototypeVersion)) {
    downloadProcessPrototypeFile(procId, prototypeUid, versionUid);
    return;
  }
  if (!hasInlineProcessAttachmentContent(prototypeVersion)) {
    const persistedUrl = getPersistedProcessAttachmentUrl(prototypeFile, prototypeVersion);
    if (persistedUrl) {
      const popup = window.open(persistedUrl, '_blank');
      if (!popup) alert('浏览器拦截了附件预览窗口，请允许弹窗后重试。');
      return;
    }
  }
  const objectUrl = createProcessPrototypeObjectUrl(prototypeVersion);
  const popup = window.open(objectUrl, '_blank');
  if (!popup) {
    URL.revokeObjectURL(objectUrl);
    alert('浏览器拦截了原型预览窗口，请允许弹窗后重试。');
    return;
  }
  try {
    popup.opener = null;
  } catch (error) {
    // Some browsers block access to the new window; the blob URL is still opened.
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

function downloadProcessPrototypeFile(procId, prototypeUid, versionUid = '') {
  const proc = S.doc.processes.find((item) => item.id === procId);
  const prototypeFile = findProcessPrototypeFile(proc, prototypeUid);
  if (!prototypeFile) return;
  const prototypeVersion = findProcessPrototypeVersion(prototypeFile, versionUid);
  if (!prototypeVersion) return;
  if (!hasInlineProcessAttachmentContent(prototypeVersion)) {
    const persistedUrl = getPersistedProcessAttachmentUrl(prototypeFile, prototypeVersion, { download: true });
    if (persistedUrl) {
      const link = document.createElement('a');
      link.href = persistedUrl;
      link.download = String(prototypeVersion.name || prototypeFile.name || '').trim() || 'attachment';
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
  }
  const objectUrl = createProcessPrototypeObjectUrl(prototypeVersion);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = String(prototypeVersion.name || prototypeFile.name || '').trim() || 'prototype.html';
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Tasks
═══════════════════════════════════════════════════════════ */
function applyTaskDefinitionToNodeTask(item, definition) {
  if (!item || !definition) return;
  item.taskDefinitionId = definition.id || item.taskDefinitionId || '';
  item.name = definition.name || item.name || '';
  item.type = definition.type || item.type || 'Service';
  item.querySourceKind = item.type === 'Query' ? (definition.querySourceKind || item.querySourceKind || 'Dictionary') : '';
  item.target = definition.target || '';
  item.address = definition.address || '';
  item.parameters = typeof cloneTaskDefinitionParameters === 'function'
    ? cloneTaskDefinitionParameters(definition.parameters)
    : { inputs: [], outputs: [] };
  item.note = definition.note || '';
  item.constructId = definition.constructId || '';
  item.businessConstructId = definition.constructId || '';
  item.constructName = definition.constructName || '';
  item.businessComponentId = definition.businessComponentId || '';
  item.businessComponent = definition.businessComponent || '';
}

function applyConstructToNodeTask(item, constructId) {
  if (!item) return;
  const construct = constructId ? findBusinessConstructRef(constructId) : null;
  item.constructId = construct?.id || '';
  item.businessConstructId = construct?.id || '';
  item.constructName = construct?.name || '';
  item.businessComponentId = construct?.businessComponentId || '';
  item.businessComponent = construct?.businessComponent || '';
}

function applyCapabilityToNodeTask(item, capabilityId) {
  if (!item) return;
  const capability = capabilityId ? ensureBusinessComponentRef(capabilityId) : null;
  item.businessComponentId = capability?.id || '';
  item.businessComponent = capability?.name || '';
  const construct = item.constructId || item.businessConstructId
    ? findBusinessConstructRef(item.constructId || item.businessConstructId)
    : null;
  if (construct && capability && String(construct.businessComponentId || '') !== String(capability.id || '')) {
    item.constructId = '';
    item.businessConstructId = '';
    item.constructName = '';
  }
}

function ensureTaskDefinitionForNodeTask(item) {
  if (!item) return null;
  if (item.taskDefinitionId) {
    const existing = findTaskDefinitionRef(item.taskDefinitionId);
    if (existing) {
      applyTaskDefinitionToNodeTask(item, existing);
      return existing;
    }
  }
  const defs = ensureDocumentArray('taskDefinitions');
  const knownTypes = new Set((typeof ORCHESTRATION_TYPES !== 'undefined' ? ORCHESTRATION_TYPES : []).map((option) => option.value));
  const rawType = knownTypes.has(item.type) ? item.type : 'Service';
  const definition = {
    id: nextStableId('TD', defs),
    name: getUniqueTaskDefinitionName(item.name || '新任务定义'),
    type: rawType,
    querySourceKind: rawType === 'Query' ? (item.querySourceKind || 'Dictionary') : '',
    target: item.target || '',
    address: item.address || '',
    parameters: typeof cloneTaskDefinitionParameters === 'function'
      ? cloneTaskDefinitionParameters(item.parameters)
      : { inputs: [], outputs: [] },
    note: item.note || '',
    entityIds: [],
    processIds: [],
    usedBy: [],
  };
  const constructId = item.constructId || item.businessConstructId || '';
  if (constructId) syncTaskDefinitionConstruct(definition, findBusinessConstructRef(constructId));
  defs.push(definition);
  applyTaskDefinitionToNodeTask(item, definition);
  return definition;
}

function setProcessNodeName(procId, taskId, value) {
  const node = getProcNodes(S.doc.processes.find((p) => p.id === procId)).find((item) => item.id === taskId);
  if (!node) return;
  node.name = value;
  markModified();
  renderSidebar();
  renderProcDiagramNow();
}

function setProcessTaskName(procId, taskId, value) {
  setProcessNodeName(procId, taskId, value);
}

function setProcessTaskConstruct(procId, taskId, constructId) {
  const task = getProcNodes(S.doc.processes.find((p) => p.id === procId)).find((item) => item.id === taskId);
  if (!task) return;
  task.businessConstructId = constructId || '';
  markModified();
  renderSidebar();
  rerenderProcessEditor();
}

function renderTaskConstructOptions(selectedConstructId = '') {
  const constructs = getBusinessConstructItems(S.doc);
  return `<option value="">未归属构件</option>${constructs.map((construct) => {
    const id = String(construct.id || construct.name || '');
    return `<option value="${esc(id)}" ${id === selectedConstructId ? 'selected' : ''}>${esc(construct.name || id)}</option>`;
  }).join('')}`;
}

function renderTaskCapabilityOptions(selectedCapabilityId = '') {
  const capabilities = typeof getCapabilityItems === 'function' ? getCapabilityItems(S.doc) : [];
  return `<option value="">未归属组件</option>${capabilities.map((capability) => {
    const id = String(capability.id || capability.name || '');
    return `<option value="${esc(id)}" ${id === selectedCapabilityId ? 'selected' : ''}>${esc(capability.name || id)}</option>`;
  }).join('')}`;
}

function renderTaskConstructOptionsForCapability(selectedConstructId = '', capabilityId = '') {
  const selectedCapabilityId = String(capabilityId || '').trim();
  const constructs = getBusinessConstructItems(S.doc)
    .filter((construct) => !selectedCapabilityId || String(construct.businessComponentId || '') === selectedCapabilityId);
  return `<option value="">未归属构件</option>${constructs.map((construct) => {
    const id = String(construct.id || construct.name || '');
    const capabilityName = String(construct.businessComponent || '').trim();
    const label = selectedCapabilityId || !capabilityName
      ? (construct.name || id)
      : `${construct.name || id} / ${capabilityName}`;
    return `<option value="${esc(id)}" ${id === selectedConstructId ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('')}`;
}

function addTask(procId) {
  const proc=S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  const allTasks=S.doc.processes.flatMap(p=>getProcNodes(p));
  const id=nextStableId('T',allTasks);
  const node = {id, name:'\u65b0\u8282\u70b9', role_ids:[], roles:[], role_id:'', role:'', userSteps:[], orchestrationTasks:[], forms:[], entity_ops:[], repeatable:false, rules_note:'', businessRules:[]};
  getProcNodes(proc).push(node);
  hydrateDocumentForUi(S.doc);
  markModified();
  navigate('process',{procId, taskId:id});
}
function removeTask(procId,taskId) {
  const proc=S.doc.processes.find(p=>p.id===procId); if(!proc) return;
  proc.nodes=getProcNodes(proc).filter(t=>t.id!==taskId);
  if(S.ui.taskId===taskId) S.ui.taskId=null;
  markModified(); render();
}
function setTask(procId,taskId,key,val) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  if (key === 'name') {
    setProcessTaskName(procId, taskId, val);
    return;
  }
  t[key]=val; markModified();
}

const TASK_RULE_TEMPLATE_NAMES = ['前置条件', '后置条件', '输入', '输出', '交互规则', '非功能需求'];

function getTaskBusinessRule(procId, taskId, ruleId) {
  const { task } = getTaskByIds(procId, taskId);
  if (!task) return { task: null, rule: null, rules: [] };
  const rules = getNodeBusinessRules(task);
  return { task, rules, rule: rules.find((item) => item.id === ruleId) || null };
}

function getTaskBusinessRuleEditKey(procId, taskId, ruleId) {
  return `${procId}::${taskId}::${ruleId}`;
}

function syncTaskBusinessRulesNote(task) {
  if (!task) return;
  task.rules_note = formatBusinessRulesText(getNodeBusinessRules(task));
}

function addTaskBusinessRule(procId, taskId, presetName = '') {
  const { task } = getTaskByIds(procId, taskId);
  if (!task) return;
  const rules = getNodeBusinessRules(task);
  const uid = createUiUid('rule');
  const rule = {
    uid,
    id: uid,
    name: String(presetName || `规则${rules.length + 1}`).trim(),
    content: '',
  };
  rules.push(rule);
  S.ui.businessRuleEditKey = getTaskBusinessRuleEditKey(procId, taskId, rule.id);
  syncTaskBusinessRulesNote(task);
  markModified();
  rerenderProcessEditor({
    focusSelector: `.task-rule-card[data-rule-id="${rule.id}"] [data-testid="task-rule-rich-text-editor"]`,
    revealFocus: true,
  });
}

function ensureTaskBusinessRuleTemplates(procId, taskId) {
  const { task } = getTaskByIds(procId, taskId);
  if (!task) return;
  const rules = getNodeBusinessRules(task);
  const existingNames = new Set(rules.map((rule) => String(rule.name || '').trim()).filter(Boolean));
  let firstAddedId = '';
  TASK_RULE_TEMPLATE_NAMES.forEach((name) => {
    if (existingNames.has(name)) return;
    const uid = createUiUid('rule');
    const rule = { uid, id: uid, name, content: '' };
    rules.push(rule);
    existingNames.add(name);
    if (!firstAddedId) firstAddedId = rule.id;
  });
  if (!firstAddedId) return;
  S.ui.businessRuleEditKey = getTaskBusinessRuleEditKey(procId, taskId, firstAddedId);
  syncTaskBusinessRulesNote(task);
  markModified();
  rerenderProcessEditor({
    focusSelector: `.task-rule-card[data-rule-id="${firstAddedId}"] [data-testid="task-rule-rich-text-editor"]`,
    revealFocus: true,
  });
}

function removeTaskBusinessRule(procId, taskId, ruleId) {
  const { task, rules } = getTaskBusinessRule(procId, taskId, ruleId);
  if (!task) return;
  task.businessRules = rules.filter((rule) => rule.id !== ruleId);
  if (S.ui.businessRuleEditKey === getTaskBusinessRuleEditKey(procId, taskId, ruleId)) S.ui.businessRuleEditKey = '';
  syncTaskBusinessRulesNote(task);
  markModified();
  rerenderProcessEditor({ anchorSelector: '[data-testid="task-business-rules-section"]' });
}

function moveTaskBusinessRule(procId, taskId, ruleId, dir) {
  const { task, rules } = getTaskBusinessRule(procId, taskId, ruleId);
  if (!task) return;
  const index = rules.findIndex((rule) => rule.id === ruleId);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= rules.length) return;
  [rules[index], rules[targetIndex]] = [rules[targetIndex], rules[index]];
  syncTaskBusinessRulesNote(task);
  markModified();
  rerenderProcessEditor({
    focusSelector: `[data-testid="task-rule-name"][data-rule-id="${ruleId}"]`,
  });
}

function setTaskBusinessRule(procId, taskId, ruleId, key, value) {
  const { task, rule } = getTaskBusinessRule(procId, taskId, ruleId);
  if (!task || !rule || !['name', 'content'].includes(key)) return;
  rule[key] = value;
  syncTaskBusinessRulesNote(task);
  markModified();
}

function startTaskBusinessRuleContentEdit(procId, taskId, ruleId) {
  S.ui.businessRuleEditKey = getTaskBusinessRuleEditKey(procId, taskId, ruleId);
  rerenderProcessEditor({
    focusSelector: `.task-rule-card[data-rule-id="${ruleId}"] [data-testid="task-rule-rich-text-editor"]`,
    revealFocus: true,
  });
}

function saveTaskBusinessRuleContent(procId, taskId, ruleId, value) {
  const { task, rule } = getTaskBusinessRule(procId, taskId, ruleId);
  if (!task || !rule) return;
  rule.content = value;
  if (S.ui.businessRuleEditKey === getTaskBusinessRuleEditKey(procId, taskId, ruleId)) S.ui.businessRuleEditKey = '';
  syncTaskBusinessRulesNote(task);
  markModified();
  rerenderProcessEditor({
    anchorSelector: `.task-rule-card[data-rule-id="${ruleId}"]`,
  });
}

function cancelTaskBusinessRuleContentEdit(procId, taskId, ruleId) {
  if (S.ui.businessRuleEditKey === getTaskBusinessRuleEditKey(procId, taskId, ruleId)) S.ui.businessRuleEditKey = '';
  rerenderProcessEditor({
    anchorSelector: `.task-rule-card[data-rule-id="${ruleId}"]`,
  });
}

function rerenderProcessEditor(options = {}) {
  const currentDrawerBody = document.querySelector('.proc-drawer .drawer-body');
  const drawerScrollTop = currentDrawerBody?.scrollTop || 0;
  const anchorSelector = options.anchorSelector || null;
  const anchorViewportTop = currentDrawerBody && anchorSelector
    ? (() => {
        const anchor = currentDrawerBody.querySelector(anchorSelector);
        if (!anchor) return null;
        return anchor.getBoundingClientRect().top - currentDrawerBody.getBoundingClientRect().top;
      })()
    : null;
  renderProcessTab();
  requestAnimationFrame(() => {
    const drawerBody = document.querySelector('.proc-drawer .drawer-body');
    if (typeof initAutoResize === 'function') initAutoResize();
    let finalScrollTop = options.drawerScrollTop ?? drawerScrollTop;
    if (drawerBody) drawerBody.scrollTop = finalScrollTop;
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
      }
    }
    if (drawerBody && anchorSelector && anchorViewportTop !== null) {
      const anchor = drawerBody.querySelector(anchorSelector);
      if (anchor) {
        const nextAnchorViewportTop = anchor.getBoundingClientRect().top - drawerBody.getBoundingClientRect().top;
        finalScrollTop = Math.max(0, finalScrollTop + (nextAnchorViewportTop - anchorViewportTop));
        drawerBody.scrollTop = finalScrollTop;
      }
    }
    requestAnimationFrame(() => {
      const latestDrawerBody = document.querySelector('.proc-drawer .drawer-body');
      if (latestDrawerBody) latestDrawerBody.scrollTop = finalScrollTop;
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Steps
═══════════════════════════════════════════════════════════ */
function addStep(procId,taskId,afterIdx) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  const steps = getNodeUserSteps(t);
  const insertIndex = Number.isInteger(afterIdx) ? afterIdx + 1 : steps.length;
  steps.splice(insertIndex, 0, {name:'',type:'Query',note:''});
  markModified();
  rerenderProcessEditor({
    focusSelector: `.step-row[data-step-index="${insertIndex}"] .step-name`,
  });
}
function removeStep(procId,taskId,idx) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  getNodeUserSteps(t).splice(idx,1);
  markModified();
  rerenderProcessEditor();
}
function setStep(procId,taskId,idx,key,val) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(getNodeUserSteps(t)[idx]!==undefined){getNodeUserSteps(t)[idx][key]=val; markModified();}
}
function getStepNoteEditKey(procId, taskId, idx) {
  return `${procId}::${taskId}::${idx}`;
}
function startStepNoteEdit(procId, taskId, idx) {
  S.ui.stepNoteEditKey = getStepNoteEditKey(procId, taskId, idx);
  rerenderProcessEditor({
    focusSelector: `.step-row[data-step-index="${idx}"] .step-note`,
    revealFocus: true,
  });
}
function cancelStepNoteEdit(procId, taskId, idx) {
  if (S.ui.stepNoteEditKey === getStepNoteEditKey(procId, taskId, idx)) S.ui.stepNoteEditKey = '';
  rerenderProcessEditor({
    anchorSelector: `.step-row[data-step-index="${idx}"]`,
  });
}
function saveStepNote(procId, taskId, idx, value) {
  setStep(procId, taskId, idx, 'note', value);
  S.ui.stepNoteEditKey = '';
  rerenderProcessEditor({
    anchorSelector: `.step-row[data-step-index="${idx}"]`,
  });
}
function getOrchestrationNoteEditKey(procId, taskId, idx) {
  return `${procId}::${taskId}::orch::${idx}`;
}
function startOrchestrationNoteEdit(procId, taskId, idx) {
  S.ui.orchestrationNoteEditKey = getOrchestrationNoteEditKey(procId, taskId, idx);
  rerenderProcessEditor({
    focusSelector: `.orch-card[data-orch-index="${idx}"] .step-note`,
    revealFocus: true,
  });
}
function cancelOrchestrationNoteEdit(procId, taskId, idx) {
  if (S.ui.orchestrationNoteEditKey === getOrchestrationNoteEditKey(procId, taskId, idx)) {
    S.ui.orchestrationNoteEditKey = '';
  }
  rerenderProcessEditor({
    anchorSelector: `.orch-card[data-orch-index="${idx}"]`,
  });
}
function saveOrchestrationNote(procId, taskId, idx, value) {
  setOrchestrationTask(procId, taskId, idx, 'note', value);
  S.ui.orchestrationNoteEditKey = '';
  rerenderProcessEditor({
    anchorSelector: `.orch-card[data-orch-index="${idx}"]`,
  });
}
function moveStep(procId,taskId,idx,dir) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  const steps = getNodeUserSteps(t);
  const targetIdx = idx + dir;
  if(targetIdx < 0 || targetIdx >= steps.length) return;
  [steps[idx], steps[targetIdx]] = [steps[targetIdx], steps[idx]];
  markModified();
  rerenderProcessEditor({
    focusSelector: `.step-row[data-step-index="${targetIdx}"] .step-name`,
  });
}

/* ═══════════════════════════════════════════════════════════
   MUTATIONS — Entity Ops
═══════════════════════════════════════════════════════════ */
function addEntityOp(procId,taskId,entityId) {
  if(!entityId) return;
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return;
  if(!t.entity_ops) t.entity_ops=[];
  if(t.entity_ops.some(eo=>eo.entity_id===entityId)) return;
  t.entity_ops.push({entity_id:entityId, ops:['R']});
  markModified();
  rerenderProcessEditor({
    anchorSelector: `#eop-sel-${taskId}`,
    focusSelector: `#eop-sel-${taskId}`,
  });
}
function removeEntityOp(procId,taskId,entityId) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  if(!t) return; t.entity_ops=(t.entity_ops||[]).filter(eo=>eo.entity_id!==entityId);
  markModified();
  rerenderProcessEditor({
    anchorSelector: `#eop-sel-${taskId}`,
    focusSelector: `#eop-sel-${taskId}`,
  });
}
function toggleEntityOp(procId,taskId,entityId,op,checked) {
  const t=getProcNodes(S.doc.processes.find(p=>p.id===procId)).find(t=>t.id===taskId);
  const eo=t?.entity_ops?.find(eo=>eo.entity_id===entityId);
  if(!eo) return;
  if(checked){if(!eo.ops.includes(op))eo.ops.push(op);}
  else{eo.ops=eo.ops.filter(o=>o!==op);}
  markModified();
}

const FORM_FIELD_TYPES = [
  { value: 'Text', label: '输入框' },
  { value: 'Select', label: '下拉选择' },
  { value: 'Date', label: '日期' },
  { value: 'Number', label: '数字' },
  { value: 'File', label: '附件' },
  { value: 'Readonly', label: '只读展示' },
  { value: 'Note', label: '说明文本' },
];
const FORM_FIELD_TYPE_LABELS = Object.fromEntries(FORM_FIELD_TYPES.map((item) => [item.value, item.label]));

function getTaskByIds(procId, taskId) {
  const proc = (S.doc?.processes || []).find((item) => item.id === procId);
  const task = getProcNodes(proc).find((item) => item.id === taskId);
  return { proc, task };
}

function getTaskForms(task) {
  const forms = getNodeForms(task);
  forms.forEach((form, formIndex) => {
    if (!form.id) form.id = createUiUid('form');
    form.name = String(form.name || '');
    form.purpose = String(form.purpose || '');
    form.entity_id = String(form.entity_id || form.entityId || '').trim();
    if (!Array.isArray(form.sections)) form.sections = [];
    if (!form.sections.length) {
      form.sections.push({ id: `SEC${formIndex + 1}`, name: '基本信息', note: '', fields: [] });
    }
    form.sections.forEach((section, sectionIndex) => {
      if (!section.id) section.id = createUiUid('formsec');
      section.name = String(section.name || `分组${sectionIndex + 1}`);
      section.note = String(section.note || '');
      section.entity_id = String(section.entity_id || section.entityId || form.entity_id || '').trim();
      if (!Array.isArray(section.fields)) section.fields = [];
      section.fields.forEach((field) => {
        if (!field.id) field.id = createUiUid('formfield');
        field.name = String(field.name || '');
        field.type = FORM_FIELD_TYPE_LABELS[field.type] ? field.type : 'Text';
        field.required = !!field.required;
        field.entity_field = String(field.entity_field || field.entityField || '').trim();
        field.note = String(field.note || '');
      });
    });
  });
  return forms;
}

function findTaskForm(task, formId) {
  return getTaskForms(task).find((form) => form.id === formId) || null;
}

function findTaskFormSection(form, sectionId) {
  return (form?.sections || []).find((section) => section.id === sectionId) || null;
}

function getEntityFieldsForFormSection(section, form = null) {
  const entityId = String(section?.entity_id || form?.entity_id || '').trim();
  const entity = (S.doc?.entities || []).find((item) => item.id === entityId);
  return Array.isArray(entity?.fields) ? entity.fields : [];
}

function getEntityFieldsForForm(form) {
  const firstSection = Array.isArray(form?.sections) ? form.sections[0] : null;
  return getEntityFieldsForFormSection(firstSection, form);
}

function getTaskFormEntityIds(form) {
  const ids = [];
  (form?.sections || []).forEach((section) => {
    const entityId = String(section?.entity_id || '').trim();
    if (entityId && !ids.includes(entityId)) ids.push(entityId);
  });
  const legacyEntityId = String(form?.entity_id || '').trim();
  if (!ids.length && legacyEntityId) ids.push(legacyEntityId);
  return ids;
}

function getTaskFormEntitySummary(form) {
  const ids = getTaskFormEntityIds(form);
  if (!ids.length) return '未关联实体';
  const names = ids.map((entityId) => {
    const entity = (S.doc?.entities || []).find((item) => item.id === entityId);
    return String(entity?.name || '').trim();
  }).filter(Boolean);
  return names.length ? names.join('、') : '未关联实体';
}

function nextTaskFormId(task) {
  return nextId('F', getTaskForms(task));
}

function nextTaskFormSectionId(form) {
  return nextId('SEC', form?.sections || []);
}

function nextTaskFormFieldId(section) {
  return nextId('FLD', section?.fields || []);
}

function addTaskForm(procId, taskId) {
  const { task } = getTaskByIds(procId, taskId);
  if (!task) return;
  const forms = getTaskForms(task);
  const form = {
    id: nextTaskFormId(task),
    name: '',
    entity_id: '',
    purpose: '',
    sections: [{ id: 'SEC1', name: '基本信息', note: '', entity_id: '', fields: [] }],
  };
  forms.push(form);
  markModified();
  rerenderProcessEditor({
    focusSelector: `[data-testid="task-form-name"][data-form-id="${form.id}"]`,
  });
}

async function removeTaskForm(procId, taskId, formId) {
  const { task } = getTaskByIds(procId, taskId);
  if (!task) return;
  const form = findTaskForm(task, formId);
  if (!form) return;
  if (!await showAppConfirm(`确认删除表单“${form.name || form.id}”？`, {
    title: '删除表单',
    confirmLabel: '删除',
  })) return;
  task.forms = getTaskForms(task).filter((form) => form.id !== formId);
  markModified();
  rerenderProcessEditor({ anchorSelector: '[data-testid="task-forms-section"]' });
}

function setTaskForm(procId, taskId, formId, key, value) {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  if (!form || !['name', 'entity_id', 'purpose'].includes(key)) return;
  form[key] = value;
  if (key === 'entity_id') {
    const availableFields = new Set(getEntityFieldsForForm(form).map((field) => String(field.name || '').trim()).filter(Boolean));
    form.sections.forEach((section) => {
      (section.fields || []).forEach((field) => {
        if (field.entity_field && !availableFields.has(field.entity_field)) field.entity_field = '';
      });
    });
  }
  markModified();
}

function addTaskFormSection(procId, taskId, formId, afterSectionId = '') {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  if (!form) return;
  const section = { id: nextTaskFormSectionId(form), name: '', note: '', entity_id: '', fields: [] };
  const sections = form.sections || (form.sections = []);
  const sourceIndex = afterSectionId ? sections.findIndex((item) => item.id === afterSectionId) : -1;
  const insertIndex = sourceIndex >= 0 ? sourceIndex + 1 : sections.length;
  sections.splice(insertIndex, 0, section);
  markModified();
  rerenderProcessEditor({
    focusSelector: `[data-testid="task-form-section-name"][data-section-id="${section.id}"]`,
  });
}

function moveTaskFormSection(procId, taskId, formId, sectionId, dir) {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  const sections = form?.sections || [];
  const index = sections.findIndex((section) => section.id === sectionId);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= sections.length) return;
  [sections[index], sections[targetIndex]] = [sections[targetIndex], sections[index]];
  markModified();
  rerenderProcessEditor({
    focusSelector: `[data-testid="task-form-section-name"][data-section-id="${sectionId}"]`,
  });
}

function removeTaskFormSection(procId, taskId, formId, sectionId) {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  if (!form) return;
  form.sections = (form.sections || []).filter((section) => section.id !== sectionId);
  if (!form.sections.length) form.sections.push({ id: 'SEC1', name: '基本信息', note: '', entity_id: '', fields: [] });
  markModified();
  rerenderProcessEditor({ anchorSelector: `[data-form-id="${formId}"]` });
}

function setTaskFormSection(procId, taskId, formId, sectionId, key, value) {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  const section = findTaskFormSection(form, sectionId);
  if (!section || !['name', 'note', 'entity_id'].includes(key)) return;
  section[key] = value;
  if (key === 'entity_id') {
    const availableFields = new Set(getEntityFieldsForFormSection(section, form).map((field) => String(field.name || '').trim()).filter(Boolean));
    (section.fields || []).forEach((field) => {
      if (field.entity_field && !availableFields.has(field.entity_field)) field.entity_field = '';
    });
  }
  markModified();
}

function addTaskFormField(procId, taskId, formId, sectionId, afterFieldId = '') {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  const section = findTaskFormSection(form, sectionId);
  if (!section) return;
  const field = { id: nextTaskFormFieldId(section), name: '', type: 'Text', required: false, entity_field: '', note: '' };
  const fields = section.fields || (section.fields = []);
  const sourceIndex = afterFieldId ? fields.findIndex((item) => item.id === afterFieldId) : -1;
  const insertIndex = sourceIndex >= 0 ? sourceIndex + 1 : fields.length;
  fields.splice(insertIndex, 0, field);
  markModified();
  rerenderProcessEditor({
    focusSelector: `[data-testid="task-form-field-name"][data-field-id="${field.id}"]`,
  });
}

function removeTaskFormField(procId, taskId, formId, sectionId, fieldId) {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  const section = findTaskFormSection(form, sectionId);
  if (!section) return;
  section.fields = (section.fields || []).filter((field) => field.id !== fieldId);
  markModified();
  rerenderProcessEditor({ anchorSelector: `[data-section-id="${sectionId}"]` });
}

function moveTaskFormField(procId, taskId, formId, sectionId, fieldId, dir) {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  const section = findTaskFormSection(form, sectionId);
  const fields = section?.fields || [];
  const index = fields.findIndex((field) => field.id === fieldId);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= fields.length) return;
  [fields[index], fields[targetIndex]] = [fields[targetIndex], fields[index]];
  markModified();
  rerenderProcessEditor({
    focusSelector: `[data-testid="task-form-field-name"][data-field-id="${fieldId}"]`,
  });
}

function setTaskFormField(procId, taskId, formId, sectionId, fieldId, key, value) {
  const { task } = getTaskByIds(procId, taskId);
  const form = findTaskForm(task, formId);
  const section = findTaskFormSection(form, sectionId);
  const field = (section?.fields || []).find((item) => item.id === fieldId);
  if (!field || !['name', 'type', 'required', 'entity_field', 'note'].includes(key)) return;
  field[key] = key === 'required' ? !!value : value;
  markModified();
}

function setNodePerspective(view) {
  if(view !== 'user' && view !== 'engineering') return;
  S.ui.nodePerspective = view;
  rerenderProcessEditor({
    focusSelector: view === 'engineering'
      ? '[data-testid="orchestration-section"] .orch-name, [data-testid="orchestration-section"]'
      : '[data-testid="user-steps-section"] .step-name, [data-testid="user-steps-section"]',
  });
}

function openBusinessAsset(kind, procId, taskId, indexOrEmpty, formId, sectionId) {
  const proc = (S.doc?.processes || []).find((item) => item.id === procId);
  const task = getProcNodes(proc).find((item) => item.id === taskId);
  if (!proc || !task) return;
  S.ui.tab = 'process';
  S.ui.procView = 'list';
  S.ui.procId = procId;
  S.ui.taskId = taskId;
  S.ui.nodePerspective = kind === 'task' ? 'engineering' : 'user';

  let targetSelector = '';
  if (kind === 'task') {
    const index = Number(indexOrEmpty);
    targetSelector = Number.isInteger(index)
      ? `.orch-card[data-orch-index="${index}"] .orch-name`
      : '[data-testid="orchestration-section"]';
  } else if (kind === 'formFragment') {
    targetSelector = sectionId
      ? `[data-section-id="${sectionId}"] [data-testid="task-form-section-name"]`
      : '[data-testid="task-forms-section"]';
  }

  render();
  requestAnimationFrame(() => {
    const target = targetSelector ? document.querySelector(targetSelector) : null;
    if (!target) return;
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch (error) {
        target.focus();
      }
    }
    const card = target.closest('.orch-card, .task-form-section-card');
    if (card) {
      card.classList.add('asset-focus-flash');
      setTimeout(() => card.classList.remove('asset-focus-flash'), 1600);
    }
  });
}

function encodeReuseTaskKey(procId, taskId, index) {
  return [procId, taskId, String(index)].map((item) => encodeURIComponent(String(item || ''))).join('|');
}

function encodeReuseTaskDefinitionKey(taskDefinitionId) {
  return `td|${encodeURIComponent(String(taskDefinitionId || ''))}`;
}

function decodeReuseTaskKey(key) {
  const parts = String(key || '').split('|').map((item) => decodeURIComponent(item));
  if (parts.length !== 3) return null;
  return { procId: parts[0], taskId: parts[1], index: Number(parts[2]) };
}

function getOrchestrationReuseStateKey(procId, taskId) {
  return `${String(procId || '')}::${String(taskId || '')}`;
}

function getOrchestrationReuseFilter(procId, taskId) {
  if (!S.ui.orchestrationReuseFilters || typeof S.ui.orchestrationReuseFilters !== 'object') {
    S.ui.orchestrationReuseFilters = {};
  }
  const key = getOrchestrationReuseStateKey(procId, taskId);
  const current = S.ui.orchestrationReuseFilters[key] || {};
  return {
    capabilityId: String(current.capabilityId || ''),
    constructId: String(current.constructId || ''),
    query: String(current.query || ''),
  };
}

function setOrchestrationReuseFilter(procId, taskId, key, value) {
  if (!['capabilityId', 'constructId', 'query'].includes(key)) return;
  const stateKey = getOrchestrationReuseStateKey(procId, taskId);
  const next = { ...getOrchestrationReuseFilter(procId, taskId), [key]: String(value || '') };
  if (key === 'capabilityId') next.constructId = '';
  S.ui.orchestrationReuseFilters[stateKey] = next;
  const focusSelector = key === 'query'
    ? '[data-testid="orchestration-reuse-search"]'
    : `[data-testid="${key === 'capabilityId' ? 'orchestration-reuse-capability-select' : 'orchestration-reuse-construct-select'}"]`;
  rerenderProcessEditor({ focusSelector });
}

function normalizeReuseSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function getReferencedTaskDefinitionIds(doc = S.doc) {
  const refs = new Set();
  (doc?.processes || []).forEach((proc) => {
    getProcNodes(proc).forEach((node) => {
      getNodeOrchestrationTasks(node).forEach((item) => {
        const id = String(item?.taskDefinitionId || '').trim();
        if (id) refs.add(id);
      });
    });
  });
  return refs;
}

function isEmptyGeneratedTaskDefinition(taskDefinition) {
  const name = String(taskDefinition?.name || '').trim();
  return /^新任务定义\d*$/.test(name)
    && !String(taskDefinition?.target || '').trim()
    && !String(taskDefinition?.note || '').trim()
    && !String(taskDefinition?.constructId || taskDefinition?.businessConstructId || '').trim();
}

function cleanupUnusedGeneratedTaskDefinitions() {
  if (!Array.isArray(S.doc?.taskDefinitions)) return;
  const activeTaskDefinitionId = String(S.ui?.businessModelDialog?.taskDefinitionId || '').trim();
  const refs = getReferencedTaskDefinitionIds(S.doc);
  const removedIds = new Set();
  S.doc.taskDefinitions = S.doc.taskDefinitions.filter((taskDefinition) => {
    const id = String(taskDefinition?.id || '').trim();
    if (id && id === activeTaskDefinitionId) return true;
    if (!id || refs.has(id) || !isEmptyGeneratedTaskDefinition(taskDefinition)) return true;
    removedIds.add(id);
    return false;
  });
  if (!removedIds.size) return;
  ensureDocumentArray('businessComponents').forEach((capability) => {
    if (Array.isArray(capability.taskDefinitionIds)) {
      capability.taskDefinitionIds = capability.taskDefinitionIds.filter((id) => !removedIds.has(id));
    }
  });
  ensureDocumentArray('businessConstructs').forEach((construct) => {
    if (Array.isArray(construct.taskDefinitionIds)) {
      construct.taskDefinitionIds = construct.taskDefinitionIds.filter((id) => !removedIds.has(id));
    }
  });
}

function getReusableOrchestrationTaskItems(currentProcId, currentTaskId, filters = {}) {
  cleanupUnusedGeneratedTaskDefinitions();
  const result = [];
  const capabilities = typeof getCapabilityItems === 'function' ? getCapabilityItems(S.doc) : [];
  const capabilityById = new Map(capabilities.map((capability) => [String(capability.id || capability.name || ''), capability]));
  const capabilityByName = new Map(capabilities.map((capability) => [String(capability.name || capability.id || ''), capability]));
  const constructs = typeof getBusinessConstructItems === 'function' ? getBusinessConstructItems(S.doc) : [];
  const constructById = new Map(constructs.map((construct) => [String(construct.id || construct.name || ''), construct]));
  const hasTaskDefinitions = Array.isArray(S.doc?.taskDefinitions) && S.doc.taskDefinitions.length;
  const addItem = (item) => {
    const queryText = normalizeReuseSearchText(filters.query);
    if (filters.capabilityId && item.capabilityId !== filters.capabilityId) return;
    if (filters.constructId && item.constructId !== filters.constructId) return;
    if (queryText && !normalizeReuseSearchText(item.searchText).includes(queryText)) return;
    result.push(item);
  };

  if (hasTaskDefinitions) {
    (S.doc.taskDefinitions || []).forEach((taskDefinition) => {
      const name = String(taskDefinition?.name || taskDefinition?.target || '').trim();
      if (!name) return;
      const usedBy = Array.isArray(taskDefinition.usedBy) ? taskDefinition.usedBy : [];
      if (usedBy.length && usedBy.every((usage) => usage.processId === currentProcId && usage.nodeId === currentTaskId)) {
        return;
      }
      const capability = capabilityById.get(String(taskDefinition.businessComponentId || ''))
        || capabilityByName.get(String(taskDefinition.businessComponent || ''));
      const construct = constructById.get(String(taskDefinition.constructId || ''));
      const capabilityId = String(capability?.id || taskDefinition.businessComponentId || taskDefinition.businessComponent || '__ungrouped_capability__');
      const capabilityName = String(capability?.name || taskDefinition.businessComponent || taskDefinition.businessComponentId || '未归属组件');
      const constructId = String(construct?.id || taskDefinition.constructId || '__ungrouped_construct__');
      const constructName = String(construct?.name || taskDefinition.constructName || taskDefinition.constructId || '未归属构件');
      addItem({
        key: encodeReuseTaskDefinitionKey(taskDefinition.id),
        label: `${name} · ${constructName} / ${capabilityName}`,
        capabilityId,
        capabilityName,
        constructId,
        constructName,
        task: taskDefinition,
        sourceKind: 'definition',
        searchText: [name, taskDefinition.target, taskDefinition.note, capabilityName, constructName].join(' '),
      });
    });
    return result.sort((left, right) => (
      left.capabilityName.localeCompare(right.capabilityName, 'zh-CN')
      || left.constructName.localeCompare(right.constructName, 'zh-CN')
      || left.label.localeCompare(right.label, 'zh-CN')
    ));
  }

  return result.sort((left, right) => (
    left.capabilityName.localeCompare(right.capabilityName, 'zh-CN')
    || left.constructName.localeCompare(right.constructName, 'zh-CN')
    || left.label.localeCompare(right.label, 'zh-CN')
  ));
}

function findReusableOrchestrationTask(key) {
  const text = String(key || '');
  if (text.startsWith('td|')) {
    const taskDefinitionId = decodeURIComponent(text.slice(3));
    const taskDefinition = (S.doc?.taskDefinitions || []).find((item) => item.id === taskDefinitionId);
    if (!taskDefinition) return null;
    return {
      taskDefinitionId: taskDefinition.id,
      name: taskDefinition.name || '',
      type: taskDefinition.type === 'Process' ? 'Service' : (taskDefinition.type || 'Query'),
      querySourceKind: taskDefinition.type === 'Query' ? (taskDefinition.querySourceKind || 'Dictionary') : '',
      target: taskDefinition.target || '',
      address: taskDefinition.address || '',
      parameters: typeof cloneTaskDefinitionParameters === 'function'
        ? cloneTaskDefinitionParameters(taskDefinition.parameters)
        : { inputs: [], outputs: [] },
      note: taskDefinition.note || '',
      constructId: taskDefinition.constructId || '',
      businessConstructId: taskDefinition.constructId || '',
      constructName: taskDefinition.constructName || '',
      businessComponentId: taskDefinition.businessComponentId || '',
      businessComponent: taskDefinition.businessComponent || '',
    };
  }
  const decoded = decodeReuseTaskKey(key);
  if (!decoded || !Number.isInteger(decoded.index)) return null;
  const proc = (S.doc?.processes || []).find((item) => item.id === decoded.procId);
  const node = getProcNodes(proc).find((item) => item.id === decoded.taskId);
  return getNodeOrchestrationTasks(node)[decoded.index] || null;
}

function cloneReusableOrchestrationTask(item) {
  const clone = JSON.parse(JSON.stringify(item || {}));
  delete clone.id;
  return {
    taskDefinitionId: clone.taskDefinitionId || '',
    name: clone.name || '',
    type: clone.type || 'Query',
    querySourceKind: clone.type === 'Query' ? (clone.querySourceKind || 'Dictionary') : (clone.querySourceKind || ''),
    target: clone.target || '',
    address: clone.address || '',
    parameters: typeof cloneTaskDefinitionParameters === 'function'
      ? cloneTaskDefinitionParameters(clone.parameters)
      : { inputs: [], outputs: [] },
    note: clone.note || '',
    constructId: clone.constructId || clone.businessConstructId || '',
    businessConstructId: clone.constructId || clone.businessConstructId || '',
    constructName: clone.constructName || '',
    businessComponentId: clone.businessComponentId || '',
    businessComponent: clone.businessComponent || '',
  };
}

function addOrchestrationTask(procId, taskId, afterIdx) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  if (!node) return;
  const orchestrationTasks = getNodeOrchestrationTasks(node);
  const insertIndex = Number.isInteger(afterIdx) ? afterIdx + 1 : orchestrationTasks.length;
  const item = {
    name: getUniqueTaskDefinitionName('新任务定义'),
    type: 'Service',
    querySourceKind: '',
    target: '',
    address: '',
    parameters: { inputs: [], outputs: [] },
    note: '',
  };
  ensureTaskDefinitionForNodeTask(item);
  orchestrationTasks.splice(insertIndex, 0, item);
  markModified();
  renderSidebar();
  rerenderProcessEditor({
    focusSelector: `.orch-card[data-orch-index="${insertIndex}"] .orch-name`,
  });
}

function defineTaskDefinitionForNode(procId, taskId, afterIdx = null) {
  const reuseFilter = getOrchestrationReuseFilter(procId, taskId);
  const allReusableTasks = getReusableOrchestrationTaskItems(procId, taskId);
  const capabilityId = String(reuseFilter.capabilityId || '').trim();
  const capabilityFilteredTasks = capabilityId
    ? allReusableTasks.filter((item) => item.capabilityId === capabilityId)
    : allReusableTasks;
  const constructOptions = Array.from(new Map(capabilityFilteredTasks.map((item) => [item.constructId, item.constructName])).entries());
  const constructId = constructOptions.some(([id]) => id === reuseFilter.constructId) ? reuseFilter.constructId : '';
  openTaskDefinitionDraft(
    capabilityId,
    constructId,
    'processNode',
    procId,
    taskId,
    Number.isInteger(afterIdx) ? afterIdx : null,
  );
}

function validateTaskDefinitionForNode(taskDefinition) {
  if (!String(taskDefinition?.name || '').trim()) {
    alert('请先填写任务名称。');
    return false;
  }
  if (!String(taskDefinition?.businessComponentId || taskDefinition?.businessComponent || '').trim()) {
    alert('请先选择所属业务组件。');
    return false;
  }
  if (!String(taskDefinition?.constructId || taskDefinition?.businessConstructId || '').trim()) {
    alert('请先选择所属业务构件。');
    return false;
  }
  return true;
}

function saveTaskDefinitionFromNode(taskDefinitionId, joinNode = false) {
  const taskDefinition = findTaskDefinitionRef(taskDefinitionId);
  if (!taskDefinition || !validateTaskDefinitionForNode(taskDefinition)) return;
  const dialog = S.ui.businessModelDialog || {};
  if (joinNode) {
    reuseOrchestrationTask(
      dialog.procId,
      dialog.taskId,
      encodeReuseTaskDefinitionKey(taskDefinition.id),
      Number.isInteger(dialog.afterIdx) ? dialog.afterIdx : undefined,
    );
  }
  S.ui.businessModelDialog = { mode: '', capabilityId: '', constructId: '', taskDefinitionId: '', returnMode: '', procId: '', taskId: '', afterIdx: null };
  rerenderProcessEditor();
}

function reuseOrchestrationTask(procId, taskId, key, afterIdx) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  const source = findReusableOrchestrationTask(key);
  if (!node || !source) return;
  const orchestrationTasks = getNodeOrchestrationTasks(node);
  const insertIndex = Number.isInteger(afterIdx) ? afterIdx + 1 : orchestrationTasks.length;
  const item = cloneReusableOrchestrationTask(source);
  if (!item.taskDefinitionId) ensureTaskDefinitionForNodeTask(item);
  orchestrationTasks.splice(insertIndex, 0, item);
  markModified();
  renderSidebar();
  rerenderProcessEditor({
    focusSelector: `.orch-card[data-orch-index="${insertIndex}"] .orch-name`,
  });
}
function removeOrchestrationTask(procId, taskId, idx) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  if (!node) return;
  getNodeOrchestrationTasks(node).splice(idx, 1);
  markModified();
  renderSidebar();
  rerenderProcessEditor();
}
function setOrchestrationTask(procId, taskId, idx, key, val) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  const item = getNodeOrchestrationTasks(node)[idx];
  if (!item) return;
  const normalizedKey = key === 'businessConstructId' ? 'constructId' : key;
  const definition = item.taskDefinitionId ? findTaskDefinitionRef(item.taskDefinitionId) : null;
  if (definition && ['name', 'type', 'querySourceKind', 'target', 'address', 'note', 'constructId', 'businessComponentId'].includes(normalizedKey)) {
    const updated = setTaskDefinition(definition.id, normalizedKey, val);
    if (!updated) return;
    applyTaskDefinitionToNodeTask(item, findTaskDefinitionRef(definition.id));
    if (normalizedKey === 'businessComponentId') {
      const construct = item.constructId || item.businessConstructId
        ? findBusinessConstructRef(item.constructId || item.businessConstructId)
        : null;
      if (construct && String(construct.businessComponentId || '') !== String(val || '')) {
        setTaskDefinition(definition.id, 'constructId', '');
        applyTaskDefinitionToNodeTask(item, findTaskDefinitionRef(definition.id));
      }
    }
  } else if (normalizedKey === 'constructId') {
    applyConstructToNodeTask(item, val);
  } else if (normalizedKey === 'businessComponentId') {
    applyCapabilityToNodeTask(item, val);
  } else {
    item[key] = val;
  }
  if (normalizedKey === 'type' && val !== 'Query') item.querySourceKind = '';
  if (normalizedKey === 'type' && val === 'Query' && !item.querySourceKind) item.querySourceKind = 'Dictionary';
  markModified();
  if ((S.ui.nodePerspective || 'user') === 'engineering') {
    renderProcDiagramNow();
  }
}
function moveOrchestrationTask(procId, taskId, idx, dir) {
  const node = getProcNodes(S.doc.processes.find(p => p.id === procId)).find(t => t.id === taskId);
  if (!node) return;
  const orchestrationTasks = getNodeOrchestrationTasks(node);
  const targetIdx = idx + dir;
  if(targetIdx < 0 || targetIdx >= orchestrationTasks.length) return;
  [orchestrationTasks[idx], orchestrationTasks[targetIdx]] = [orchestrationTasks[targetIdx], orchestrationTasks[idx]];
  markModified();
  rerenderProcessEditor({
    focusSelector: `.orch-card[data-orch-index="${targetIdx}"] .orch-name`,
  });
}

/* 找第一个空位（不与任何现有流程重叠） */
function _nextFreePos(procs, excludeId) {
  const occ = new Set(procs.filter(p=>p.id!==excludeId && p.pos)
                           .map(p=>`${p.pos.r},${p.pos.c}`));
  for(let r=1;r<=20;r++)
    for(let c=1;c<=8;c++)
      if(!occ.has(`${r},${c}`)) return {r, c};
  return {r:1, c:procs.length+1};
}

function ensureProcPos(doc) {
  (doc.processes||[]).forEach(p => {
    if(!p.pos) p.pos = _nextFreePos(doc.processes, p.id);
  });
}

function clampStageGraphZoom(zoom) {
  return Math.max(0.6, Math.min(1.8, Math.round(Number(zoom || 1) * 100) / 100));
}

function getStageGraphZoom() {
  return clampStageGraphZoom(S.ui.stageGraphZoom || 1);
}

function setStageGraphZoom(nextZoom) {
  const normalized = clampStageGraphZoom(nextZoom);
  if (normalized === getStageGraphZoom()) return;
  S.ui.stageGraphZoom = normalized;
  renderProcessTab();
}

function nudgeStageGraphZoom(delta) {
  setStageGraphZoom(getStageGraphZoom() + delta);
}

function resetStageGraphZoom() {
  setStageGraphZoom(1);
}

function getCurrentStageItem() {
  return getStageItems(S.doc).find((stage) => stage.id === S.ui.stageId) || null;
}

function openStagePanorama(stageId = S.ui.stageId || getStageItems(S.doc)[0]?.id || null, navOptions = {}) {
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'process';
    next.procView = 'stage';
    next.stageViewMode = 'panorama';
    next.stageId = stageId;
    next.stageEditorCollapsed = true;
    next.taskId = null;
    return next;
  }, navOptions);
  S.ui.procView = 'stage';
  S.ui.stageViewMode = 'panorama';
  S.ui.stageId = stageId;
  S.ui.stageEditorCollapsed = true;
  S.ui.stageNameEditId = '';
  renderProcessTab();
}

function openStageDetail(stageId = S.ui.stageId || getStageItems(S.doc)[0]?.id || null, navOptions = {}) {
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'process';
    next.procView = 'stage';
    next.stageViewMode = 'detail';
    next.stageId = stageId;
    next.stageEditorCollapsed = true;
    next.taskId = null;
    return next;
  }, navOptions);
  S.ui.procView = 'stage';
  S.ui.stageViewMode = 'detail';
  S.ui.stageId = stageId;
  S.ui.stageEditorCollapsed = true;
  S.ui.stageNameEditId = '';
  renderProcessTab();
}

function navigateStageView(stageId, mode = 'detail', navOptions = {}) {
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'process';
    next.procView = 'stage';
    next.stageViewMode = mode === 'panorama' ? 'panorama' : 'detail';
    next.stageId = stageId || getStageItems(S.doc)[0]?.id || null;
    next.taskId = null;
    next.stageEditorCollapsed = true;
    return next;
  }, navOptions);
  S.ui.tab = 'process';
  S.ui.procView = 'stage';
  S.ui.stageViewMode = mode === 'panorama' ? 'panorama' : 'detail';
  S.ui.stageId = stageId || getStageItems(S.doc)[0]?.id || null;
  S.ui.stageEditorCollapsed = true;
  S.ui.stageNameEditId = '';
  S.ui.taskId = null;
  render();
}

function ensureStageSelection() {
  const items = getStageItems(S.doc);
  if (!items.some((stage) => stage.id === S.ui.stageId)) {
    S.ui.stageId = items[0]?.id || null;
  }
}

function nextStageFlowRefId() {
  const usedIds = new Set(getStageFlowRefs(S.doc).map((ref) => String(ref.id || '').trim()).filter(Boolean));
  let index = 1;
  while (usedIds.has(`SFR${index}`)) index += 1;
  return `SFR${index}`;
}

function nextStageFlowLinkId() {
  const usedIds = new Set(getStageFlowLinks(S.doc).map((link) => String(link.id || '').trim()).filter(Boolean));
  let index = 1;
  while (usedIds.has(`SFL${index}`)) index += 1;
  return `SFL${index}`;
}

function syncLegacyStageIdForProcess(procId) {
  const proc = (S.doc.processes || []).find((item) => item.id === procId);
  if (!proc) return;
  const refs = getProcessStageRefs(procId, S.doc);
  proc.stageId = refs[0]?.stageId || '';
  if (!refs.length) proc.stagePos = normalizeGraphOffset(proc.stagePos);
}

function addStageProcessRef(stageId, procId, options = {}) {
  const normalizedStageId = isVirtualStageId(stageId) ? '' : String(stageId || '').trim();
  const normalizedProcId = String(procId || '').trim();
  if (!normalizedStageId || !normalizedProcId) return null;
  const existing = getStageFlowRefs(S.doc).find((ref) => ref.stageId === normalizedStageId && ref.processId === normalizedProcId);
  if (existing) return existing;
  const order = getStageProcessRefs(normalizedStageId, S.doc).length + 1;
  const ref = normalizeStageFlowRefEntry({
    id: nextStageFlowRefId(),
    stageId: normalizedStageId,
    processId: normalizedProcId,
    order,
    pos: { x: 0, y: 0 },
  }, getStageFlowRefs(S.doc).length + 1);
  getStageFlowRefs(S.doc).push(ref);
  syncLegacyStageIdForProcess(normalizedProcId);
  if (!options.silent) markModified();
  return ref;
}

function removeStageProcessRef(stageId, procId, options = {}) {
  const normalizedStageId = isVirtualStageId(stageId) ? '' : String(stageId || '').trim();
  const normalizedProcId = String(procId || '').trim();
  const removedRefs = getStageFlowRefs(S.doc).filter((ref) => ref.stageId === normalizedStageId && ref.processId === normalizedProcId);
  if (!removedRefs.length) return false;
  const removedRefIds = new Set(removedRefs.map((ref) => ref.id));
  S.doc.stageFlowRefs = getStageFlowRefs(S.doc).filter((ref) => !removedRefIds.has(ref.id));
  S.doc.stageFlowLinks = getStageFlowLinks(S.doc).filter((link) => !removedRefIds.has(link.fromRefId) && !removedRefIds.has(link.toRefId));
  getStageProcessRefs(normalizedStageId, S.doc).forEach((ref, index) => { ref.order = index + 1; });
  syncLegacyStageIdForProcess(normalizedProcId);
  if (!options.silent) markModified();
  return true;
}

function moveStageProcessRef(stageId, procId, dir) {
  const refs = getStageProcessRefs(stageId, S.doc);
  const index = refs.findIndex((ref) => ref.processId === procId);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= refs.length) return;
  [refs[index], refs[targetIndex]] = [refs[targetIndex], refs[index]];
  refs.forEach((ref, orderIndex) => { ref.order = orderIndex + 1; });
  markModified();
}

function addStage(subDomain = '', afterStageId = '', options = {}) {
  const stages = getStages(S.doc);
  const id = nextStableId('S', stages);
  const row = normalizeStageEntry({
    id,
    name: `业务阶段${stages.length + 1}`,
    subDomain: String(subDomain || '').trim(),
    pos: { x: 0, y: 0 },
    processLinks: [],
  }, stages.length + 1, S.doc.processes || []);
  const insertIndex = stages.findIndex((stage) => stage.id === afterStageId);
  if (insertIndex >= 0) stages.splice(insertIndex + 1, 0, row);
  else stages.push(row);
  S.ui.stageId = id;
  S.ui.procView = 'stage';
  S.ui.stageViewMode = options.keepPanorama ? 'panorama' : 'detail';
  if (options.keepPanorama) S.ui.stageEditorCollapsed = false;
  markModified();
  renderProcessTab();
}

function addStageFromPanorama(afterStageId = '') {
  const sourceStage = findStage(afterStageId, S.doc);
  addStage(sourceStage?.subDomain || '', afterStageId, { keepPanorama: true });
}

function moveStage(stageId, dir) {
  const stages = getStages(S.doc);
  const index = stages.findIndex((stage) => stage.id === stageId);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= stages.length) return;
  [stages[index], stages[targetIndex]] = [stages[targetIndex], stages[index]];
  S.ui.stageId = stageId;
  markModified();
  renderSidebar();
  rerenderStageWorkbench();
}

async function removeStage(stageId) {
  if (isVirtualStageId(stageId)) return;
  const stage = findStage(stageId, S.doc);
  if (!stage) return;
  if (!await showAppConfirm(`确认删除业务阶段 ${stage.name || stage.id} 吗？阶段内流程不会删除，但会变成未设置业务阶段。`, {
    title: '删除业务阶段',
    confirmLabel: '删除',
  })) return;
  if (String(S.ui.stageNameEditId || '') === String(stageId || '')) S.ui.stageNameEditId = '';
  S.doc.stages = getStages(S.doc).filter((item) => item.id !== stageId);
  S.doc.stageLinks = getStageLinks(S.doc).filter((link) => link.fromStageId !== stageId && link.toStageId !== stageId);
  const removedRefIds = new Set(getStageProcessRefs(stageId, S.doc).map((ref) => ref.id));
  const removedProcIds = new Set(getStageProcessRefs(stageId, S.doc).map((ref) => ref.processId));
  S.doc.stageFlowRefs = getStageFlowRefs(S.doc).filter((ref) => ref.stageId !== stageId);
  S.doc.stageFlowLinks = getStageFlowLinks(S.doc).filter((link) => link.stageId !== stageId && !removedRefIds.has(link.fromRefId) && !removedRefIds.has(link.toRefId));
  removedProcIds.forEach((procId) => syncLegacyStageIdForProcess(procId));
  if (S.ui.stageLinkFocusId === stageId) S.ui.stageLinkFocusId = '';
  ensureStageSelection();
  S.ui.stageViewMode = 'panorama';
  markModified();
  renderProcessTab();
}

function renameStageId(stageId, nextStageId) {
  const stage = findStage(stageId, S.doc);
  if (!stage) return;
  const normalizedId = String(nextStageId || '').trim();
  if (!normalizedId || normalizedId === stage.id) return;
  if (findStage(normalizedId, S.doc)) return;
  const previousId = stage.id;
  stage.id = normalizedId;
  (S.doc.processes || []).forEach((proc) => {
    if (String(proc.stageId || '').trim() === previousId) proc.stageId = normalizedId;
  });
  getStageFlowRefs(S.doc).forEach((ref) => {
    if (ref.stageId === previousId) ref.stageId = normalizedId;
  });
  getStageFlowLinks(S.doc).forEach((link) => {
    if (link.stageId === previousId) link.stageId = normalizedId;
  });
  getStageLinks(S.doc).forEach((link) => {
    if (link.fromStageId === previousId) link.fromStageId = normalizedId;
    if (link.toStageId === previousId) link.toStageId = normalizedId;
  });
  if (S.ui.stageId === previousId) S.ui.stageId = normalizedId;
  markModified();
}

function setStage(stageId, key, value) {
  const stage = findStage(stageId, S.doc);
  if (!stage) return;
  if (key === 'id') {
    renameStageId(stageId, value);
    return;
  }
  if (key === 'pos') {
    stage.pos = normalizeGraphOffset(value);
  } else if (key === 'panoramaPos') {
    stage.panoramaPos = normalizeGraphOffset(value);
  } else if (key === 'panoramaSlot') {
    stage.panoramaSlot = normalizeGridSlot(value);
  } else {
    stage[key] = typeof value === 'string' ? value : value;
  }
  markModified();
}

function isStageNameInlineEditing(stageId) {
  return S.ui.stageEditorCollapsed === false && String(S.ui.stageNameEditId || '') === String(stageId || '');
}

function startStageNameEdit(stageId, event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (S.ui.stageEditorCollapsed !== false) return;
  const stage = findStage(stageId, S.doc);
  if (!stage) return;
  S.ui.stageNameEditId = stage.id;
  rerenderStageWorkbench({
    focusSelector: '[data-testid="stage-name-inline-input"]',
    selectText: true,
  });
}

function finishStageNameEdit(stageId, nextName, options = {}) {
  const normalizedStageId = String(stageId || '');
  if (String(S.ui.stageNameEditId || '') !== normalizedStageId) return;
  const stage = findStage(normalizedStageId, S.doc);
  S.ui.stageNameEditId = '';
  const normalizedName = String(nextName || '').trim();
  if (stage && normalizedName && normalizedName !== String(stage.name || '')) {
    stage.name = normalizedName;
    markModified();
    renderSidebar();
  }
  if (!options.skipRender) rerenderStageWorkbench();
}

function cancelStageNameEdit(stageId) {
  if (String(S.ui.stageNameEditId || '') !== String(stageId || '')) return;
  S.ui.stageNameEditId = '';
  rerenderStageWorkbench();
}

function handleStageNameEditKeydown(event, stageId) {
  if (event.key === 'Enter') {
    event.preventDefault();
    finishStageNameEdit(stageId, event.currentTarget.value);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelStageNameEdit(stageId);
  }
}

function renderStageNameInlineEditor(stageId, label, canEdit, className = 'stage-graph-node-title') {
  const stageLabel = String(label || stageId || '');
  if (canEdit && isStageNameInlineEditing(stageId)) {
    return `<input class="stage-name-inline-input ${className}" data-testid="stage-name-inline-input" data-stage-id="${esc(stageId)}"
      aria-label="阶段名称" type="text" value="${esc(stageLabel)}"
      onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()"
      onkeydown="handleStageNameEditKeydown(event,'${esc(stageId)}')"
      onblur="finishStageNameEdit('${esc(stageId)}',this.value)">`;
  }
  return `<span class="${className}"${canEdit ? ` title="双击修改阶段名称" ondblclick="startStageNameEdit('${esc(stageId)}',event)"` : ''}>${esc(stageLabel)}</span>`;
}

function nextPanoramaColumnId(model = getPanoramaModel(S.doc)) {
  const usedIds = new Set((model?.columns || []).map((column) => column.id));
  let index = 1;
  while (usedIds.has(`C${index}`)) index += 1;
  return `C${index}`;
}

function nextPanoramaLaneId(model = getPanoramaModel(S.doc)) {
  const usedIds = new Set((model?.lanes || []).map((lane) => lane.id));
  let index = 1;
  while (usedIds.has(`L${index}`)) index += 1;
  return `L${index}`;
}

function setPanoramaColumn(columnId, key, value) {
  const model = getPanoramaModel(S.doc);
  const column = model.columns.find((item) => item.id === columnId);
  if (!column || !['name', 'scope', 'badge'].includes(key)) return;
  column[key] = String(value || '');
  markModified();
}

function addPanoramaColumn(afterColumnId = '') {
  const model = getPanoramaModel(S.doc);
  const column = { id: nextPanoramaColumnId(model), name: '', scope: '', badge: '' };
  const insertIndex = model.columns.findIndex((item) => item.id === afterColumnId);
  if (insertIndex >= 0) model.columns.splice(insertIndex + 1, 0, column);
  else model.columns.push(column);
  getPanoramaModel(S.doc);
  markModified();
  rerenderStageWorkbench();
}

function movePanoramaColumn(columnId, dir) {
  const model = getPanoramaModel(S.doc);
  const index = model.columns.findIndex((item) => item.id === columnId);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= model.columns.length) return;
  [model.columns[index], model.columns[targetIndex]] = [model.columns[targetIndex], model.columns[index]];
  markModified();
  rerenderStageWorkbench();
}

async function removePanoramaColumn(columnId) {
  const model = getPanoramaModel(S.doc);
  if (model.columns.length <= 1) return;
  const nextColumns = model.columns.filter((column) => column.id !== columnId);
  if (nextColumns.length === model.columns.length) return;
  const column = model.columns.find((item) => item.id === columnId);
  const affectedStages = getStages(S.doc).filter((stage) => stage.panoramaColumnUid === columnId);
  const message = affectedStages.length
    ? `确认删除价值流「${column?.name || columnId}」吗？其中 ${affectedStages.length} 个阶段会保留，但会变成未归类，需要重新放入其他单元格。`
    : `确认删除价值流「${column?.name || columnId}」吗？`;
  if (!await showAppConfirm(message, {
    title: '删除价值流',
    confirmLabel: '删除',
  })) return;
  model.columns = nextColumns;
  model.cells = model.cells.filter((cell) => cell.columnUid !== columnId);
  getStages(S.doc).forEach((stage) => {
    if (stage.panoramaColumnUid === columnId) stage.panoramaColumnUid = '';
  });
  getPanoramaModel(S.doc);
  markModified();
  rerenderStageWorkbench();
}

function setPanoramaLane(laneId, key, value) {
  const model = getPanoramaModel(S.doc);
  const lane = model.lanes.find((item) => item.id === laneId);
  if (!lane || !['name', 'badge', 'note'].includes(key)) return;
  lane[key] = String(value || '');
  markModified();
}

function addPanoramaLane(afterLaneId = '') {
  const model = getPanoramaModel(S.doc);
  const lane = { id: nextPanoramaLaneId(model), name: '', badge: '', note: '' };
  const insertIndex = model.lanes.findIndex((item) => item.id === afterLaneId);
  if (insertIndex >= 0) model.lanes.splice(insertIndex + 1, 0, lane);
  else model.lanes.push(lane);
  getPanoramaModel(S.doc);
  markModified();
  rerenderStageWorkbench();
}

function movePanoramaLane(laneId, dir) {
  const model = getPanoramaModel(S.doc);
  const index = model.lanes.findIndex((item) => item.id === laneId);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= model.lanes.length) return;
  [model.lanes[index], model.lanes[targetIndex]] = [model.lanes[targetIndex], model.lanes[index]];
  markModified();
  rerenderStageWorkbench();
}

async function removePanoramaLane(laneId) {
  const model = getPanoramaModel(S.doc);
  if (model.lanes.length <= 1) return;
  const nextLanes = model.lanes.filter((lane) => lane.id !== laneId);
  if (nextLanes.length === model.lanes.length) return;
  const lane = model.lanes.find((item) => item.id === laneId);
  const affectedStages = getStages(S.doc).filter((stage) => stage.panoramaLaneUid === laneId);
  const message = affectedStages.length
    ? `确认删除业务域「${lane?.name || laneId}」吗？其中 ${affectedStages.length} 个阶段会保留，但会变成未归类，需要重新放入其他单元格。`
    : `确认删除业务域「${lane?.name || laneId}」吗？`;
  if (!await showAppConfirm(message, {
    title: '删除业务域',
    confirmLabel: '删除',
  })) return;
  model.lanes = nextLanes;
  model.cells = model.cells.filter((cell) => cell.laneUid !== laneId);
  getStages(S.doc).forEach((stage) => {
    if (stage.panoramaLaneUid === laneId) stage.panoramaLaneUid = '';
  });
  getPanoramaModel(S.doc);
  markModified();
  rerenderStageWorkbench();
}

function setPanoramaCell(laneId, columnId, key, value) {
  const model = getPanoramaModel(S.doc);
  const cell = model.cells.find((item) => item.laneUid === laneId && item.columnUid === columnId);
  if (!cell || !['status', 'text'].includes(key)) return;
  cell[key] = String(value || '');
  markModified();
}

async function addStageFromMatrixCell(laneId, columnId) {
  const model = getPanoramaModel(S.doc);
  if (!hasPanoramaLane(model, laneId) || !hasPanoramaColumn(model, columnId)) return;
  const name = await showAppPrompt('请输入业务阶段名称', '', {
    title: '新增业务阶段',
  });
  if (name === null) return;
  const stageName = String(name || '').trim();
  if (!stageName) return;
  const stages = getStages(S.doc);
  const id = nextStableId('S', stages);
  stages.push(normalizeStageEntry({
    id,
    name: stageName,
    subDomain: '',
    panoramaColumnUid: columnId,
    panoramaLaneUid: laneId,
    panoramaPos: null,
    pos: { x: 0, y: 0 },
    processLinks: [],
  }, stages.length + 1, S.doc.processes || []));
  S.ui.stageId = id;
  S.ui.procView = 'stage';
  S.ui.stageViewMode = 'panorama';
  S.ui.stageEditorCollapsed = false;
  markModified();
  renderSidebar();
  rerenderStageWorkbench();
}

function addProcessToStage(stageId, procId) {
  if (!procId) return;
  addStageProcessRef(stageId, procId);
  rerenderStageWorkbench({ focusSelector: '[data-testid="stage-process-select"]' });
}

function moveProcInStage(stageId, procId, dir) {
  moveStageProcessRef(stageId, procId, dir);
  renderSidebar();
  rerenderStageWorkbench();
}

function removeProcessFromStage(stageId, procId) {
  if (!procId) return;
  removeStageProcessRef(stageId, procId);
  rerenderStageWorkbench();
}

function pickDefaultStageLinkPair(stages, preferredStageId = '') {
  const preferredIndex = stages.findIndex((stage) => stage.id === preferredStageId);
  const fromIndex = preferredIndex >= 0 ? preferredIndex : 0;
  const toIndex = fromIndex < stages.length - 1 ? fromIndex + 1 : Math.max(0, fromIndex - 1);
  return {
    fromStageId: stages[fromIndex]?.id || '',
    toStageId: stages[toIndex]?.id || stages[fromIndex]?.id || '',
  };
}

function addStageLink(afterUid = '', preferredStageId = '') {
  const stages = getStages(S.doc).filter((stage) => !stage.virtual);
  if (stages.length < 2) return;
  const links = getStageLinks(S.doc);
  const row = normalizeStageLinkEntry(pickDefaultStageLinkPair(stages, preferredStageId || S.ui.stageLinkFocusId || ''));
  const insertIndex = links.findIndex((link) => link.uid === afterUid);
  if (insertIndex >= 0) links.splice(insertIndex + 1, 0, row);
  else links.push(row);
  markModified();
  rerenderStageWorkbench();
}

function setStageLink(linkUid, key, value) {
  const link = getStageLinks(S.doc).find((item) => item.uid === linkUid);
  if (!link) return;
  link[key] = String(value || '').trim();
  markModified();
}

function removeStageLink(linkUid) {
  const links = getStageLinks(S.doc);
  const nextLinks = links.filter((item) => item.uid !== linkUid);
  if (nextLinks.length === links.length) return;
  S.doc.stageLinks = nextLinks;
  markModified();
  rerenderStageWorkbench();
}

function moveStageLink(linkUid, dir) {
  const links = getStageLinks(S.doc);
  const index = links.findIndex((item) => item.uid === linkUid);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= links.length) return;
  [links[index], links[targetIndex]] = [links[targetIndex], links[index]];
  markModified();
  rerenderStageWorkbench();
}

function revealStageLinkEditor(drawerBody) {
  if (!drawerBody) return;
  const target = drawerBody.querySelector('[data-testid="stage-link-row"]')
    || drawerBody.querySelector('[data-testid="stage-link-focus-note"]')
    || drawerBody.querySelector('.stage-link-list');
  if (!target) return;
  const drawerRect = drawerBody.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const buffer = 12;
  if (targetRect.top < drawerRect.top + buffer) {
    drawerBody.scrollTop += targetRect.top - drawerRect.top - buffer;
  } else if (targetRect.bottom > drawerRect.bottom - buffer) {
    drawerBody.scrollTop += targetRect.bottom - drawerRect.bottom + buffer;
  }
}

function selectStageForPanorama(stageId) {
  if (!findStage(stageId, S.doc)) return;
  S.ui.procView = 'stage';
  S.ui.stageViewMode = 'panorama';
  S.ui.stageId = stageId;
  S.ui.stageLinkFocusId = stageId;
  S.ui.stageEditorCollapsed = false;
  rerenderStageWorkbench({ revealStageLinks: true });
}

function clearStageLinkFocus() {
  S.ui.stageLinkFocusId = '';
  rerenderStageWorkbench();
}

function addStageProcessLink(stageId, afterUid = '') {
  const stage = findStage(stageId, S.doc);
  if (!stage) return;
  const refs = getStageProcessRefs(stageId, S.doc);
  if (refs.length < 2) return;
  const linkId = nextStageFlowLinkId();
  const links = getStageFlowLinks(S.doc).filter((link) => link.stageId === stageId);
  const row = normalizeStageFlowLinkEntry({
    id: linkId,
    stageId,
    fromRefId: refs[0].id,
    toRefId: refs[Math.min(1, refs.length - 1)].id,
  }, getStageFlowLinks(S.doc).length + 1);
  const insertIndex = links.findIndex((link) => link.id === afterUid);
  if (insertIndex >= 0) links.splice(insertIndex + 1, 0, row);
  else links.push(row);
  const others = getStageFlowLinks(S.doc).filter((link) => link.stageId !== stageId);
  S.doc.stageFlowLinks = [...others, ...links];
  markModified();
  rerenderStageWorkbench();
}

function addStageProcessLinkBetweenRefs(stageId, fromRefId, toRefId) {
  const stage = findStage(stageId, S.doc);
  if (!stage) return;
  const normalizedFrom = String(fromRefId || '').trim();
  const normalizedTo = String(toRefId || '').trim();
  if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) return;
  const refs = new Set(getStageProcessRefs(stageId, S.doc).map((ref) => ref.id));
  if (!refs.has(normalizedFrom) || !refs.has(normalizedTo)) return;
  const linkId = nextStageFlowLinkId();
  const links = getStageFlowLinks(S.doc);
  const duplicate = links.some((link) => (
    link.stageId === stageId
    && link.fromRefId === normalizedFrom
    && link.toRefId === normalizedTo
  ));
  if (duplicate) return;
  links.push(normalizeStageFlowLinkEntry({
    id: linkId,
    stageId,
    fromRefId: normalizedFrom,
    toRefId: normalizedTo,
  }, links.length + 1));
  markModified();
  rerenderStageWorkbench();
}

function getStageFlowLinkDraft(stageId) {
  const draft = S.ui.stageFlowLinkDraft || {};
  return draft.stageId === stageId ? String(draft.fromRefId || '').trim() : '';
}

function startStageFlowLinkDraft(stageId, fromRefId) {
  if (!findStage(stageId, S.doc)) return;
  if (!findStageProcessRef(fromRefId, S.doc)) return;
  S.ui.stageFlowLinkDraft = { stageId, fromRefId };
  rerenderStageWorkbench();
}

function clearStageFlowLinkDraft() {
  S.ui.stageFlowLinkDraft = null;
  rerenderStageWorkbench();
}

function setStageProcessLink(stageId, linkUid, key, value) {
  const link = getStageFlowLinks(S.doc).find((item) => item.stageId === stageId && item.id === linkUid);
  if (!link) return;
  link[key] = String(value || '').trim();
  markModified();
}

function removeStageProcessLink(stageId, linkUid) {
  const links = getStageFlowLinks(S.doc);
  const removedLink = links.find((item) => item.stageId === stageId && item.id === linkUid);
  const nextLinks = links.filter((item) => !(item.stageId === stageId && item.id === linkUid));
  if (nextLinks.length === links.length) return;
  S.doc.stageFlowLinks = nextLinks;
  if (removedLink) {
    const fromRef = findStageProcessRef(removedLink.fromRefId, S.doc);
    const toRef = findStageProcessRef(removedLink.toRefId, S.doc);
    const stage = findStage(stageId, S.doc);
    if (stage && fromRef?.processId && toRef?.processId) {
      stage.processLinks = getStageProcessLinks(stage).filter((link) => (
        !(link.fromProcessId === fromRef.processId && link.toProcessId === toRef.processId)
      ));
    }
  }
  markModified();
  rerenderStageWorkbench();
}

function moveStageProcessLink(stageId, linkUid, dir) {
  const links = getStageFlowLinks(S.doc).filter((item) => item.stageId === stageId);
  const index = links.findIndex((item) => item.id === linkUid);
  const targetIndex = index + dir;
  if (index < 0 || targetIndex < 0 || targetIndex >= links.length) return;
  [links[index], links[targetIndex]] = [links[targetIndex], links[index]];
  const others = getStageFlowLinks(S.doc).filter((item) => item.stageId !== stageId);
  S.doc.stageFlowLinks = [...others, ...links];
  markModified();
  rerenderStageWorkbench();
}

function rerenderStageWorkbench(options = {}) {
  const mainShell = document.querySelector('.stage-main-shell');
  const drawerBody = document.querySelector('.stage-drawer .drawer-body');
  const valueStreamScroll = document.querySelector('.value-stream-scroll');
  const pageRoot = document.scrollingElement || document.documentElement;
  const mainScrollTop = mainShell?.scrollTop || 0;
  const mainScrollLeft = mainShell?.scrollLeft || 0;
  const drawerScrollTop = drawerBody?.scrollTop || 0;
  const valueStreamScrollTop = valueStreamScroll?.scrollTop || 0;
  const valueStreamScrollLeft = valueStreamScroll?.scrollLeft || 0;
  const pageTop = pageRoot?.scrollTop || 0;
  const pageLeft = pageRoot?.scrollLeft || 0;
  renderProcessTab();
  requestAnimationFrame(() => {
    const nextMainShell = document.querySelector('.stage-main-shell');
    const nextDrawerBody = document.querySelector('.stage-drawer .drawer-body');
    const nextValueStreamScroll = document.querySelector('.value-stream-scroll');
    const nextPageRoot = document.scrollingElement || document.documentElement;
    if (nextMainShell) {
      nextMainShell.scrollTop = options.mainScrollTop ?? mainScrollTop;
      nextMainShell.scrollLeft = options.mainScrollLeft ?? mainScrollLeft;
    }
    if (nextDrawerBody) nextDrawerBody.scrollTop = options.drawerScrollTop ?? drawerScrollTop;
    if (nextValueStreamScroll) {
      nextValueStreamScroll.scrollTop = options.valueStreamScrollTop ?? valueStreamScrollTop;
      nextValueStreamScroll.scrollLeft = options.valueStreamScrollLeft ?? valueStreamScrollLeft;
      syncValueStreamHScrollFromContent(nextValueStreamScroll);
    }
    if (options.revealStageLinks && nextDrawerBody) revealStageLinkEditor(nextDrawerBody);
    if (nextPageRoot) {
      nextPageRoot.scrollTop = pageTop;
      nextPageRoot.scrollLeft = pageLeft;
    }
    if (options.focusSelector) {
      const field = document.querySelector(options.focusSelector);
      if (field?.focus) {
        try {
          field.focus({ preventScroll: true });
        } catch (_) {
          field.focus();
        }
        if (options.selectText && typeof field.select === 'function') {
          field.select();
        } else if (options.caretToEnd && typeof field.setSelectionRange === 'function') {
          const end = String(field.value || '').length;
          field.setSelectionRange(end, end);
        }
      }
    }
  });
}

function setStageEditorCollapsed(nextValue) {
  const normalized = Boolean(nextValue);
  if (Boolean(S.ui.stageEditorCollapsed) === normalized) return;
  if (!normalized && S.ui.procView === 'stage' && S.ui.stageViewMode === 'detail' && !getCurrentStageItem()) {
    S.ui.stageViewMode = 'panorama';
  }
  S.ui.stageEditorCollapsed = normalized;
  if (normalized) S.ui.stageNameEditId = '';
  renderProcessTab();
}

function toggleStageEditorDrawer(forceOpen = null) {
  if (typeof forceOpen === 'boolean') {
    setStageEditorCollapsed(!forceOpen);
    return;
  }
  setStageEditorCollapsed(!S.ui.stageEditorCollapsed);
}

function getStageNodeOffset(kind, nodeId) {
  if (kind === 'stage') {
    return normalizeGraphOffset(findStage(nodeId, S.doc)?.pos);
  }
  if (kind === 'stage-ref') {
    return normalizeGraphOffset(findStageProcessRef(nodeId, S.doc)?.pos);
  }
  return normalizeGraphOffset((S.doc.processes || []).find((proc) => proc.id === nodeId)?.stagePos);
}

function setStageNodeOffset(kind, nodeId, nextOffset) {
  if (kind === 'stage') {
    const stage = findStage(nodeId, S.doc);
    if (!stage) return;
    stage.pos = normalizeGraphOffset(nextOffset);
    return;
  }
  if (kind === 'stage-ref') {
    const ref = findStageProcessRef(nodeId, S.doc);
    if (!ref) return;
    ref.pos = normalizeGraphOffset(nextOffset);
    return;
  }
  const proc = (S.doc.processes || []).find((item) => item.id === nodeId);
  if (!proc) return;
  proc.stagePos = normalizeGraphOffset(nextOffset);
}

function startStageNodeDrag(kind, nodeId, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  stageDragState = {
    kind,
    nodeId,
    startX: event.clientX,
    startY: event.clientY,
    startOffset: getStageNodeOffset(kind, nodeId),
  };
  document.addEventListener('mousemove', onStageNodeDrag);
  document.addEventListener('mouseup', endStageNodeDrag);
}

function clearStageDragTargetCell() {
  document.querySelectorAll('.value-stream-cell.is-drag-target').forEach((cell) => {
    cell.classList.remove('is-drag-target');
    const overlay = cell.querySelector('.stage-drag-slot-overlay');
    if (overlay) overlay.style.display = 'none';
  });
}

function syncValueStreamHScrollFromContent(content) {
  const scroller = content?.closest?.('.value-stream-scroll-wrap')?.querySelector?.('.value-stream-hscroll');
  if (!content || !scroller || scroller.dataset.syncing === 'true') return;
  content.dataset.syncing = 'true';
  scroller.scrollLeft = content.scrollLeft || 0;
  content.dataset.syncing = '';
}

function syncValueStreamContentFromHScroll(scroller) {
  const content = scroller?.closest?.('.value-stream-scroll-wrap')?.querySelector?.('.value-stream-scroll');
  if (!content || !scroller || content.dataset.syncing === 'true') return;
  scroller.dataset.syncing = 'true';
  content.scrollLeft = scroller.scrollLeft || 0;
  scroller.dataset.syncing = '';
}

function getStageDragTargetCell(event) {
  if (!event || !stageDragState || stageDragState.kind !== 'stage' || !isStagePanoramaEditing()) return null;
  const draggedNode = document.querySelector(`.stage-graph-node[data-node-id="${CSS.escape(stageDragState.nodeId)}"]`);
  const elements = document.elementsFromPoint(event.clientX, event.clientY) || [];
  for (const element of elements) {
    // 跳过拖动物本身（z-index=5，始终在最上层）
    if (draggedNode && (element === draggedNode || draggedNode.contains(element))) continue;
    const cell = element?.closest?.('.value-stream-cell');
    if (cell) return cell;
  }
  return null;
}

function getStageDragTargetSlot(cell, event) {
  if (!cell || !event) return null;
  const board = cell.querySelector('.value-stream-stage-board');
  if (!board) return null;
  const boardRect = board.getBoundingClientRect();
  const col = Math.max(0, Math.round((event.clientX - boardRect.left - MATRIX_STAGE_BOARD_PAD) / MATRIX_STAGE_SLOT_W));
  const row = Math.max(0, Math.round((event.clientY - boardRect.top - MATRIX_STAGE_BOARD_PAD) / MATRIX_STAGE_SLOT_H));
  return { row, col };
}

function highlightStageDragSlot(cell, slot) {
  if (!cell || !slot) return;
  let overlay = cell.querySelector('.stage-drag-slot-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'stage-drag-slot-overlay';
    const board = cell.querySelector('.value-stream-stage-board');
    if (board) board.appendChild(overlay);
  }
  const x = MATRIX_STAGE_BOARD_PAD + slot.col * MATRIX_STAGE_SLOT_W;
  const y = MATRIX_STAGE_BOARD_PAD + slot.row * MATRIX_STAGE_SLOT_H;
  overlay.style.cssText = `left:${x}px;top:${y}px;width:${MATRIX_STAGE_SLOT_W}px;height:${MATRIX_STAGE_SLOT_H}px;display:block`;
  overlay.dataset.slotRow = slot.row;
  overlay.dataset.slotCol = slot.col;
}

function updateStageDragTargetCell(event) {
  clearStageDragTargetCell();
  const cell = getStageDragTargetCell(event);
  if (cell) {
    cell.classList.add('is-drag-target');
    const slot = getStageDragTargetSlot(cell, event);
    if (slot) highlightStageDragSlot(cell, slot);
  }
  return cell;
}

function onStageNodeDrag(event) {
  if (!stageDragState) return;
  // 非编辑模式下不显示拖曳反馈（不移动卡片、不高亮格子）
  if (stageDragState.kind === 'stage' && !isStagePanoramaEditing()) return;
  const dx = event.clientX - stageDragState.startX;
  const dy = event.clientY - stageDragState.startY;
  const zoom = getStageGraphZoom() || 1;
  const graphDx = dx / zoom;
  const graphDy = dy / zoom;
  const node = document.querySelector(`.stage-graph-node[data-node-id="${stageDragState.nodeId}"]`);
  if (node) {
    node.style.transform = `translate(${graphDx}px,${graphDy}px)`;
    node.style.zIndex = '5';
  }
  if (stageDragState.kind === 'stage-ref') {
    updateStageFlowDragLinks(stageDragState.nodeId, graphDx, graphDy);
  }
  if (stageDragState.kind === 'stage') {
    updateStageDragTargetCell(event);
  }
}

function endStageNodeDrag(event) {
  if (!stageDragState) return;
  const { kind, nodeId, startX, startY, startOffset } = stageDragState;
  const dx = event.clientX - startX;
  const dy = event.clientY - startY;
  document.removeEventListener('mousemove', onStageNodeDrag);
  document.removeEventListener('mouseup', endStageNodeDrag);
  if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
    clearStageDragTargetCell();
    stageDragState = null;
    if (kind === 'stage') {
      if (S.ui.stageEditorCollapsed === false && event.detail >= 2) {
        startStageNameEdit(nodeId, event);
        return;
      }
      if ((S.ui.stageViewMode || 'panorama') === 'panorama' && S.ui.stageEditorCollapsed === false) {
        selectStageForPanorama(nodeId);
      } else {
        openStageDetail(nodeId);
      }
    }
    else if (kind === 'stage-ref') {
      const ref = findStageProcessRef(nodeId, S.doc);
      const currentStage = getCurrentStageItem();
      if (S.ui.procView === 'stage' && S.ui.stageViewMode === 'detail' && S.ui.stageEditorCollapsed === false && currentStage && !currentStage.virtual) return;
      if (ref?.processId) navigate('process', { procId: ref.processId, taskId: null });
    } else navigate('process', { procId: nodeId, taskId: null });
    return;
  }
  // 非编辑模式下拖曳不生效：不调位置、不显示"待保存"
  if (kind === 'stage' && !isStagePanoramaEditing()) {
    clearStageDragTargetCell();
    stageDragState = null;
    return;
  }

  if (kind === 'stage' && isStagePanoramaEditing()) {
    const cell = updateStageDragTargetCell(event);
    const stage = findStage(nodeId, S.doc);
    if (cell && stage) {
      const laneId = String(cell.dataset.laneId || '').trim();
      const columnId = String(cell.dataset.columnId || '').trim();
      const board = cell.querySelector('.value-stream-stage-board');
      const boardRect = board?.getBoundingClientRect();
      stage.panoramaLaneUid = laneId;
      stage.panoramaColumnUid = columnId;
      if (boardRect) {
        stage.panoramaSlot = {
          row: Math.max(0, Math.round((event.clientY - boardRect.top - MATRIX_STAGE_CARD_H / 2 - MATRIX_STAGE_BOARD_PAD) / MATRIX_STAGE_SLOT_H)),
          col: Math.max(0, Math.round((event.clientX - boardRect.left - MATRIX_STAGE_CARD_W / 2 - MATRIX_STAGE_BOARD_PAD) / MATRIX_STAGE_SLOT_W)),
        };
        stage.panoramaPos = null;
      }
      markModified();
      clearStageDragTargetCell();
      stageDragState = null;
      rerenderStageWorkbench({
        valueStreamScrollTop: cell.closest('.value-stream-scroll')?.scrollTop || 0,
        valueStreamScrollLeft: cell.closest('.value-stream-scroll')?.scrollLeft || 0,
      });
      return;
    }
  }
  clearStageDragTargetCell();
  stageDragState = null;
  const zoom = getStageGraphZoom() || 1;
  setStageNodeOffset(kind, nodeId, {
    x: startOffset.x + Math.round(dx / zoom),
    y: startOffset.y + Math.round(dy / zoom),
  });
  markModified();
  rerenderStageWorkbench();
}

function buildOrderedGraphLayers(nodes, links) {
  const nodeIds = nodes.map((node) => node.id);
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const nextMap = new Map(nodeIds.map((id) => [id, []]));
  for (const link of links) {
    if (!indegree.has(link.from) || !indegree.has(link.to)) continue;
    indegree.set(link.to, (indegree.get(link.to) || 0) + 1);
    nextMap.get(link.from).push(link.to);
  }
  const queue = nodeIds.filter((id) => (indegree.get(id) || 0) === 0);
  if (!queue.length && nodeIds.length) queue.push(nodeIds[0]);
  const layers = new Map(nodeIds.map((id) => [id, 0]));
  const ordered = [];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    const nextIds = nextMap.get(id) || [];
    for (const nextId of nextIds) {
      layers.set(nextId, Math.max(layers.get(nextId) || 0, (layers.get(id) || 0) + 1));
      indegree.set(nextId, (indegree.get(nextId) || 0) - 1);
      if ((indegree.get(nextId) || 0) <= 0) queue.push(nextId);
    }
  }
  nodeIds.forEach((id) => {
    if (seen.has(id)) return;
    ordered.push(id);
    layers.set(id, Math.max(...Array.from(layers.values()), 0) + 1);
  });
  return { layers, ordered };
}

function measureStageGraphNodeWidth(label) {
  const text = String(label || '').trim();
  return Math.max(132, Math.min(220, 48 + text.length * 14));
}

function routeStageGraphLink(fromPos, toPos, laneIndex = 0) {
  const sx = fromPos.x + fromPos.w / 2;
  const sy = fromPos.y + fromPos.h;
  const tx = toPos.x + toPos.w / 2;
  const ty = toPos.y;
  if (ty > sy) {
    const midY = sy + Math.max(28, ((ty - sy) / 2) + laneIndex * 10);
    return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
  }
  const laneX = Math.max(sx, tx) + 48 + laneIndex * 18;
  const startY = fromPos.y + fromPos.h / 2;
  const endY = toPos.y + toPos.h / 2;
  return `M ${sx} ${startY} L ${laneX} ${startY} L ${laneX} ${endY} L ${tx} ${endY}`;
}

function buildStageGraphLayout(nodes, links, kind) {
  const { layers, ordered } = buildOrderedGraphLayers(nodes, links);
  const layersMap = new Map();
  ordered.forEach((id) => {
    const layerIndex = layers.get(id) || 0;
    if (!layersMap.has(layerIndex)) layersMap.set(layerIndex, []);
    layersMap.get(layerIndex).push(nodes.find((node) => node.id === id));
  });
  const layerEntries = Array.from(layersMap.entries()).sort((left, right) => left[0] - right[0]);
  const gapX = 72;
  const gapY = 138;
  const padX = 56;
  const padY = 36;
  const nodeH = 54;
  const positions = {};
  let boardW = 640;
  layerEntries.forEach(([, layerNodes], layerOrder) => {
    const widths = layerNodes.map((node) => measureStageGraphNodeWidth(node.label));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, layerNodes.length - 1) * gapX;
    boardW = Math.max(boardW, totalWidth + padX * 2);
    let cursorX = padX + Math.max(0, (boardW - padX * 2 - totalWidth) / 2);
    const y = padY + layerOrder * gapY;
    layerNodes.forEach((node, index) => {
      const width = widths[index];
      const offset = getStageNodeOffset(kind, node.id);
      positions[node.id] = {
        x: cursorX + offset.x,
        y: y + offset.y,
        w: width,
        h: nodeH,
      };
      cursorX += width + gapX;
    });
  });
  const boardH = Math.max(260, padY * 2 + Math.max(0, layerEntries.length - 1) * gapY + nodeH);
  const routedLinks = links
    .filter((link) => positions[link.from] && positions[link.to])
    .map((link, index) => ({
      ...link,
      path: routeStageGraphLink(positions[link.from], positions[link.to], index % 3),
    }));
  return { positions, links: routedLinks, boardW, boardH };
}

const STAGE_FLOW_NODE_W = 62;
const STAGE_FLOW_NODE_H = 128;
const STAGE_FLOW_GAP_X = 46;
const STAGE_FLOW_ROW_GAP = 34;
const STAGE_FLOW_PAD_X = 24;
const STAGE_FLOW_PAD_Y = 38;

function getStageFlowGroupLabel(node) {
  return String(node?.group || node?.meta || '').trim();
}

function setFlowGroupForProcesses(processIdsText, nextValue, sourceEl = null) {
  const ids = new Set(String(processIdsText || '').split('|').map((id) => id.trim()).filter(Boolean));
  if (!ids.size) return;
  const normalized = String(nextValue || '').trim();
  (S.doc.processes || []).forEach((proc) => {
    if (ids.has(String(proc.id || '').trim())) proc.flowGroup = normalized;
  });
  if (sourceEl) {
    const editor = sourceEl.closest?.('.stage-flow-group-editor');
    const board = editor?.closest?.('.stage-flow-board');
    const processIds = editor?.dataset?.processIds || String(processIdsText || '');
    const groupBox = Array.from(board?.querySelectorAll?.('.stage-flow-group-box[data-process-ids]') || [])
      .find((box) => box.dataset.processIds === processIds);
    const title = groupBox?.querySelector?.('.stage-flow-group-title');
    if (title) {
      title.textContent = normalized || '未分组';
      title.classList.toggle('is-placeholder', !normalized);
    }
  }
  markModified();
}

function clearFlowGroupForProcesses(processIdsText) {
  setFlowGroupForProcesses(processIdsText, '');
  rerenderStageWorkbench();
}

function groupIsolatedStageFlowRows(isolatedNodes) {
  if (!isolatedNodes.length) return [];
  const grouped = [];
  const groupIndexByLabel = new Map();
  isolatedNodes.forEach((node) => {
    const label = getStageFlowGroupLabel(node);
    const key = label || '__ungrouped__';
    if (!groupIndexByLabel.has(key)) {
      groupIndexByLabel.set(key, grouped.length);
      grouped.push([]);
    }
    grouped[groupIndexByLabel.get(key)].push(node.id);
  });
  return grouped;
}

function getStageFlowRows(nodes, links) {
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const linkedIds = new Set();
  const undirected = new Map(nodes.map((node) => [node.id, []]));
  links.forEach((link) => {
    if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) return;
    linkedIds.add(link.from);
    linkedIds.add(link.to);
    undirected.get(link.from).push(link.to);
    undirected.get(link.to).push(link.from);
  });
  if (!linkedIds.size) return groupIsolatedStageFlowRows(nodes);

  const visited = new Set();
  const rows = [];
  linkedIds.forEach((startId) => {
    if (visited.has(startId)) return;
    const component = [];
    const stack = [startId];
    visited.add(startId);
    while (stack.length) {
      const id = stack.pop();
      component.push(id);
      (undirected.get(id) || []).forEach((nextId) => {
        if (visited.has(nextId)) return;
        visited.add(nextId);
        stack.push(nextId);
      });
    }
    const componentIds = new Set(component);
    const indegree = new Map(component.map((id) => [id, 0]));
    const outgoing = new Map(component.map((id) => [id, []]));
    links.forEach((link) => {
      if (!componentIds.has(link.from) || !componentIds.has(link.to)) return;
      outgoing.get(link.from).push(link.to);
      indegree.set(link.to, (indegree.get(link.to) || 0) + 1);
    });
    const queue = component
      .filter((id) => (indegree.get(id) || 0) === 0)
      .sort((left, right) => (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0));
    const ordered = [];
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
      (outgoing.get(id) || []).forEach((nextId) => {
        indegree.set(nextId, (indegree.get(nextId) || 0) - 1);
        if ((indegree.get(nextId) || 0) <= 0) {
          queue.push(nextId);
          queue.sort((left, right) => (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0));
        }
      });
    }
    component
      .filter((id) => !seen.has(id))
      .sort((left, right) => (nodeOrder.get(left) || 0) - (nodeOrder.get(right) || 0))
      .forEach((id) => ordered.push(id));
    rows.push(ordered);
  });

  const isolated = nodes
    .filter((node) => !linkedIds.has(node.id))
    .sort((left, right) => (nodeOrder.get(left.id) || 0) - (nodeOrder.get(right.id) || 0));
  rows.push(...groupIsolatedStageFlowRows(isolated));
  return rows;
}

function getStageFlowAnchors(fromPos, toPos) {
  const fromCenterX = fromPos.x + fromPos.w / 2;
  const toCenterX = toPos.x + toPos.w / 2;
  const toRight = toCenterX >= fromCenterX;
  return {
    sx: toRight ? fromPos.x + fromPos.w : fromPos.x,
    sy: fromPos.y + fromPos.h / 2,
    tx: toRight ? toPos.x : toPos.x + toPos.w,
    ty: toPos.y + toPos.h / 2,
    dir: toRight ? 1 : -1,
  };
}

function routeStageFlowLink(fromPos, toPos, laneIndex = 0) {
  const { sx, sy, tx, ty, dir } = getStageFlowAnchors(fromPos, toPos);
  const deltaX = tx - sx;
  const forwardGap = deltaX * dir;
  if (Math.abs(sy - ty) < 8 && forwardGap > 0) {
    const midX = sx + dir * (forwardGap / 2);
    return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
  }
  if (forwardGap > 0) {
    const midX = sx + dir * (forwardGap / 2);
    return `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ty} L ${tx} ${ty}`;
  }
  const fallbackSx = dir > 0 ? fromPos.x + fromPos.w : fromPos.x;
  const fallbackTx = dir > 0 ? toPos.x + toPos.w : toPos.x;
  const laneX = dir > 0
    ? Math.max(fallbackSx, fallbackTx) + 34 + laneIndex * 12
    : Math.min(fallbackSx, fallbackTx) - 34 - laneIndex * 12;
  return `M ${fallbackSx} ${sy} L ${laneX} ${sy} L ${laneX} ${ty} L ${fallbackTx} ${ty}`;
}

function getStageFlowLinkActionPosition(fromPos, toPos) {
  const { sx, sy, tx, ty } = getStageFlowAnchors(fromPos, toPos);
  return {
    x: Math.round((sx + tx) / 2) - 11,
    y: Math.round((sy + ty) / 2) - 11,
  };
}

function buildStageFlowGroupBoxes(rows, nodes, links, positions, options = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const boxes = [];
  rows.forEach((row, rowIndex) => {
    let segment = [];
    let currentLabel = null;
    const flushSegment = () => {
      if (!segment.length) return;
      const label = currentLabel || '';
      if (!label) {
        segment = [];
        return;
      }
      const segmentPositions = segment.map((id) => positions[id]).filter(Boolean);
      if (!segmentPositions.length) {
        segment = [];
        return;
      }
      const minX = Math.min(...segmentPositions.map((pos) => pos.x));
      const minY = Math.min(...segmentPositions.map((pos) => pos.y));
      const maxX = Math.max(...segmentPositions.map((pos) => pos.x + pos.w));
      const maxY = Math.max(...segmentPositions.map((pos) => pos.y + pos.h));
      const groupExtraH = options.includeNodeGroupEditors ? 58 : 42;
      boxes.push({
        id: `group-${rowIndex}-${boxes.length}`,
        label,
        processIds: segment.map((id) => nodeById.get(id)?.processId || '').filter(Boolean),
        x: Math.max(6, minX - 14),
        y: Math.max(6, minY - 28),
        w: Math.max(92, maxX - minX + 28),
        h: Math.max(STAGE_FLOW_NODE_H + groupExtraH, maxY - minY + groupExtraH),
      });
      segment = [];
    };
    row.forEach((nodeId) => {
      const label = getStageFlowGroupLabel(nodeById.get(nodeId));
      if (currentLabel !== null && label !== currentLabel) flushSegment();
      currentLabel = label;
      segment.push(nodeId);
    });
    flushSegment();
  });
  return boxes;
}

function renderStageFlowNodeGroupEditor(node, pos) {
  const processId = String(node?.processId || '').trim();
  if (!processId || !pos) return '';
  const editorW = 104;
  const left = Math.max(4, Math.round(pos.x + pos.w / 2 - editorW / 2));
  const top = Math.round(pos.y + pos.h + 4);
  return `<div class="stage-flow-node-group-editor" data-testid="stage-flow-node-group-editor"
      data-process-id="${esc(processId)}"
      style="left:${left}px;top:${top}px;width:${editorW}px"
      onmousedown="event.stopPropagation()" onclick="event.stopPropagation()">
      <span>分组</span>
      <input data-testid="stage-flow-node-group-input" data-process-id="${esc(processId)}"
        aria-label="流程分组" type="text" value="${esc(node.group || '')}" placeholder="... " size="4"
        title="${esc(node.group || '未分组')}"
        onmousedown="event.stopPropagation()" onclick="event.stopPropagation()"
        oninput="this.title=this.value||'未分组';setFlowGroupForProcesses('${esc(processId)}',this.value)"
        onblur="rerenderStageWorkbench()"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
      <button type="button" title="清空分组" aria-label="清空分组"
        onmousedown="event.preventDefault();event.stopPropagation()"
        onclick="event.stopPropagation();clearFlowGroupForProcesses('${esc(processId)}')">×</button>
    </div>`;
}

function readStageFlowDomPositions(dragNodeId = '', graphDx = 0, graphDy = 0) {
  const positions = {};
  document.querySelectorAll('.stage-flow-board .stage-flow-node[data-node-id]').forEach((node) => {
    const nodeId = node.dataset.nodeId || '';
    const x = Number.parseFloat(node.style.left || '0') + (nodeId === dragNodeId ? graphDx : 0);
    const y = Number.parseFloat(node.style.top || '0') + (nodeId === dragNodeId ? graphDy : 0);
    const w = Number.parseFloat(node.style.width || '') || node.offsetWidth || STAGE_FLOW_NODE_W;
    const h = Number.parseFloat(node.style.height || '') || node.offsetHeight || STAGE_FLOW_NODE_H;
    positions[nodeId] = { x, y, w, h };
  });
  return positions;
}

function updateStageFlowDragLinks(dragNodeId, graphDx, graphDy) {
  const board = document.querySelector('.stage-flow-board');
  if (!board) return;
  const positions = readStageFlowDomPositions(dragNodeId, graphDx, graphDy);
  const paths = Array.from(board.querySelectorAll('.stage-flow-link[data-link-from][data-link-to]'));
  paths.forEach((path, index) => {
    const fromPos = positions[path.dataset.linkFrom];
    const toPos = positions[path.dataset.linkTo];
    if (!fromPos || !toPos) return;
    path.setAttribute('d', routeStageFlowLink(fromPos, toPos, index % 4));
  });
  board.querySelectorAll('.stage-flow-link-remove[data-link-from][data-link-to]').forEach((button) => {
    const fromPos = positions[button.dataset.linkFrom];
    const toPos = positions[button.dataset.linkTo];
    if (!fromPos || !toPos) return;
    const actionPos = getStageFlowLinkActionPosition(fromPos, toPos);
    button.style.left = `${actionPos.x}px`;
    button.style.top = `${actionPos.y}px`;
  });
}

function buildStageFlowGuideLayout(nodes, links, options = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const rows = getStageFlowRows(nodes, links);
  const positions = {};
  rows.forEach((row, rowIndex) => {
    const y = STAGE_FLOW_PAD_Y + rowIndex * (STAGE_FLOW_NODE_H + STAGE_FLOW_ROW_GAP);
    row.forEach((nodeId, colIndex) => {
      const node = nodeById.get(nodeId);
      if (!node) return;
      const offset = getStageNodeOffset('stage-ref', node.id);
      const pos = {
        x: STAGE_FLOW_PAD_X + colIndex * (STAGE_FLOW_NODE_W + STAGE_FLOW_GAP_X) + offset.x,
        y: y + offset.y,
        w: STAGE_FLOW_NODE_W,
        h: STAGE_FLOW_NODE_H,
      };
      positions[node.id] = pos;
    });
  });
  const positionList = Object.values(positions);
  const minX = positionList.length ? Math.min(...positionList.map((pos) => pos.x)) : STAGE_FLOW_PAD_X;
  const minY = positionList.length ? Math.min(...positionList.map((pos) => pos.y)) : STAGE_FLOW_PAD_Y;
  const shiftX = minX < STAGE_FLOW_PAD_X ? STAGE_FLOW_PAD_X - minX : 0;
  const shiftY = minY < STAGE_FLOW_PAD_Y ? STAGE_FLOW_PAD_Y - minY : 0;
  if (shiftX || shiftY) {
    positionList.forEach((pos) => {
      pos.x += shiftX;
      pos.y += shiftY;
    });
  }
  const groups = buildStageFlowGroupBoxes(rows, nodes, links, positions, options);
  let boardW = 720;
  let boardH = Math.max(260, STAGE_FLOW_PAD_Y * 2 + rows.length * STAGE_FLOW_NODE_H + Math.max(0, rows.length - 1) * STAGE_FLOW_ROW_GAP);
  positionList.forEach((pos) => {
    boardW = Math.max(boardW, pos.x + pos.w + STAGE_FLOW_PAD_X);
    boardH = Math.max(boardH, pos.y + pos.h + STAGE_FLOW_PAD_Y);
  });
  groups.forEach((group) => {
    boardW = Math.max(boardW, group.x + group.w + STAGE_FLOW_PAD_X);
    boardH = Math.max(boardH, group.y + group.h + STAGE_FLOW_PAD_Y);
  });
  const routedLinks = links
    .filter((link) => positions[link.from] && positions[link.to])
    .map((link, index) => ({
      ...link,
      path: routeStageFlowLink(positions[link.from], positions[link.to], index % 4),
    }));
  return { positions, links: routedLinks, groups, boardW, boardH };
}

const MATRIX_STAGE_CARD_W = 108;
const MATRIX_STAGE_CARD_H = 28;
const MATRIX_STAGE_SLOT_W = 184;
const MATRIX_STAGE_SLOT_H = 38;
const MATRIX_STAGE_BOARD_PAD = 8;

function estimateMatrixStageTextWidth(text) {
  return Array.from(String(text || '')).reduce((width, char) => {
    return width + (/[\u0000-\u00ff]/.test(char) ? 6 : 12);
  }, 0);
}

function getMatrixStageNodeWidth(node) {
  const flowCount = Math.max(0, Number(node?._processCount || 0) || 0);
  const countWidth = flowCount > 0 ? 24 : 6;
  return Math.max(MATRIX_STAGE_CARD_W, estimateMatrixStageTextWidth(node?.label || '') + countWidth + 28);
}

function hasPanoramaColumn(model, columnId) {
  return (model?.columns || []).some((column) => column.id === columnId);
}

function hasPanoramaLane(model, laneId) {
  return (model?.lanes || []).some((lane) => lane.id === laneId);
}

function getFallbackPanoramaColumnId(model, index = 0) {
  const columns = model?.columns || [];
  if (!columns.length) return '';
  const fallbackIndex = Math.max(0, Math.min(columns.length - 1, Number.isFinite(index) ? index : 0));
  return columns[fallbackIndex]?.id || columns[0]?.id || '';
}

function getFallbackPanoramaLaneId(model) {
  return model?.lanes?.[0]?.id || '';
}

function findPanoramaLaneId(model, laneId) {
  return hasPanoramaLane(model, laneId) ? laneId : '';
}

function inferDeliveryLane(node, model) {
  const text = `${node.label || ''} ${node.meta || ''} ${node.searchText || ''}`;
  const receiptLaneId = findPanoramaLaneId(model, 'receipt-system');
  const smartLaneId = findPanoramaLaneId(model, 'smart-platform-phase2');
  if (receiptLaneId && /示例仓单|存量系统|结算部|已有系统|既有职责|维护品种信息|维护合约信息/.test(text)) return receiptLaneId;
  if (smartLaneId) return smartLaneId;
  return getFallbackPanoramaLaneId(model);
}

function inferDeliveryValueStream(node, index, model) {
  const label = String(node.label || '');
  const text = `${label} ${node.meta || ''} ${node.searchText || ''}`;
  const hasAny = (...words) => words.some((word) => text.includes(word));
  const labelHasAny = (...words) => words.some((word) => label.includes(word));
  const known = (columnId) => (hasPanoramaColumn(model, columnId) ? columnId : getFallbackPanoramaColumnId(model, index));
  const knownOne = (columnIds) => columnIds.find((columnId) => hasPanoramaColumn(model, columnId)) || getFallbackPanoramaColumnId(model, index);
  const handling = () => knownOne(['businessHandling', 'inStock', 'inbound', 'outbound']);
  const risk = () => knownOne(['riskSupervision', 'other']);
  if (labelHasAny('监管', '风控', '风险', '预警', '异常', '核验', '监测', '查询', '追溯', '统计', '报表', '视频', '物联网', '摄像头', '环境采集', '大屏')) return risk();
  if (hasAny('仓单', '示例预报', '仓库仓单注册', '厂库仓单注册', '仓单注册', '仓单注销', '仓单流转', '仓单分配', '同步仓单', '入库管理', '出库管理', '厂库出库', '预报配对', '现场示例')) return handling();
  if (hasAny('会员', '客户', '用户', '账号', '账户', '主体', '主体管理', '服务机构', '示例机构', '机构维护', '仓库信息', '仓库管理', '示例仓库', '仓库', '厂库', '质检机构')) return known('participants');
  if (hasAny('参数', '参数管理', '品种参数', '品种', '合约', '商品', '规则', '标准', '升贴水', '费率', '费用', '基础数据', '基础档案', '数据字典', '品牌', '等级规格')) return known('parameters');
  if (hasAny('入库', '出库', '在库', '业务办理', '预约', '预报', '质检', '检验', '验收', '仓单', '仓单注册', '注册', '注销', '生成仓单', '配对', '交收', '履约', '示例办理', '仓单分配', '过户', '转让', '抵押', '质押', '冻结', '解冻', '货转', '流转', '同步仓单')) return handling();
  if (hasAny('风控', '风险', '预警', '异常', '核验', '监测', '库存', '查询', '追溯', '统计', '报表', '监管')) return risk();
  return hasPanoramaColumn(model, 'businessHandling')
    ? known('businessHandling')
    : getFallbackPanoramaColumnId(model, Number.isFinite(node._valueStreamIndex) ? node._valueStreamIndex : index);
}

function inferCoarsePanoramaStageName(node) {
  const label = String(node?.label || '');
  const text = `${label} ${node?.meta || ''} ${node?.searchText || ''}`;
  if (/仓库仓单注册|厂库仓单注册|仓单注册|示例预报|入库预约|入库管理|入库/.test(text)) return '仓单注册';
  if (/仓单注销|出库管理|厂库出库|出库/.test(text)) return '仓单注销';
  if (/仓单流转|仓单事件|过户|转让|抵押|质押|冻结|解冻|示例配对|配对|交收|履约/.test(text)) return '仓单流转';
  if (/监管|风控|风险|预警|异常|核验|监测|库存|查询|追溯|统计|报表|视频|物联网|摄像头|环境采集|大屏/.test(label)) return '风险监管';
  if (/基础档案|基础数据|数据字典|参数|品种|合约|商品|品牌|等级规格|规格|规则|标准|升贴水|费率|费用/.test(text)) return '品种参数管理';
  if (/仓库主体|仓库资质|仓房|垛位|提货地点|点位|仓库信息|示例仓库|仓库管理/.test(text)) return '仓库管理';
  if (/质检机构|检验机构/.test(text)) return '质检机构管理';
  if (/登录|接入|账号|账户|角色|菜单|权限|鉴权|用户|会员|客户|平台协同/.test(text)) return '账号管理';
  return '';
}

function coarsenPanoramaStageNodes(stageNodes) {
  const grouped = [];
  const groupIndexByName = new Map();
  stageNodes.forEach((node) => {
    const coarseName = inferCoarsePanoramaStageName(node);
    if (!coarseName) {
      grouped.push(node);
      return;
    }
    const groupIndex = groupIndexByName.get(coarseName);
    if (groupIndex === undefined) {
      const groupNode = {
        ...node,
        label: coarseName,
        _memberCount: 1,
        _processCount: Math.max(0, Number(node._processCount || 0) || 0),
        _memberNodeIds: [node.id],
        _valueStreamIndex: Number.isFinite(node._valueStreamIndex) ? node._valueStreamIndex : 0,
      };
      grouped.push(groupNode);
      groupIndexByName.set(coarseName, grouped.length - 1);
      return;
    }
    const groupNode = grouped[groupIndex];
    groupNode._memberCount = (groupNode._memberCount || 1) + 1;
    groupNode._processCount = Math.max(0, Number(groupNode._processCount || 0) || 0)
      + Math.max(0, Number(node._processCount || 0) || 0);
    groupNode._memberNodeIds = [...(groupNode._memberNodeIds || [groupNode.id]), node.id];
    groupNode._linked = !!groupNode._linked || !!node._linked;
    groupNode._valueStreamIndex = Math.min(
      Number.isFinite(groupNode._valueStreamIndex) ? groupNode._valueStreamIndex : 0,
      Number.isFinite(node._valueStreamIndex) ? node._valueStreamIndex : 0
    );
    if (node.label === coarseName) groupNode.id = node.id;
  });
  return grouped;
}

function resolveStagePanoramaPlacement(node, index, model) {
  const stage = node?.stage || node || {};
  const stageColumnId = String(stage.panoramaColumnUid || '').trim();
  const stageLaneId = String(stage.panoramaLaneUid || '').trim();
  return {
    columnId: hasPanoramaColumn(model, stageColumnId) ? stageColumnId : inferDeliveryValueStream(node, index, model),
    laneId: hasPanoramaLane(model, stageLaneId) ? stageLaneId : inferDeliveryLane(node, model),
  };
}

function getStageBusinessDomainLabel(stage) {
  if (!stage || isVirtualStageId(stage.id)) return '未归属业务域';
  const model = getPanoramaModel(S.doc);
  const stageIndex = getStages(S.doc).findIndex((item) => item.id === stage.id);
  const placement = resolveStagePanoramaPlacement({
    ...stage,
    stage,
    label: stage.name || stage.id,
    meta: '',
    searchText: '',
  }, stageIndex >= 0 ? stageIndex : 0, model);
  const lane = (model.lanes || []).find((item) => item.id === placement.laneId);
  return lane?.name || '未归属业务域';
}

function groupStagesByPanoramaCell(nodes, model, coarsen = true) {
  const groups = new Map();
  (model?.lanes || []).forEach((lane) => {
    (model?.columns || []).forEach((column) => groups.set(`${lane.id}::${column.id}`, []));
  });
  nodes.forEach((node, index) => {
    const placement = resolveStagePanoramaPlacement(node, index, model);
    const key = `${placement.laneId}::${placement.columnId}`;
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  });
  if (coarsen) {
    groups.forEach((stageNodes, key) => {
      groups.set(key, coarsenPanoramaStageNodes(stageNodes));
    });
  }
  return groups;
}

function isStagePanoramaEditing() {
  return (S.ui.stageViewMode || 'panorama') === 'panorama' && S.ui.stageEditorCollapsed === false;
}

function renderMatrixFieldInput({ testId, value, ariaLabel, caption, scope, oninput, extraAttrs = '' }) {
  return `<label class="matrix-edit-field" data-field-scope="${esc(scope || testId)}" ${extraAttrs}>
    <span class="matrix-field-caption" data-testid="matrix-field-caption">${esc(caption || ariaLabel || '')}</span>
    <input class="matrix-inline-input" type="text" value="${esc(value || '')}" data-testid="${testId}" aria-label="${esc(ariaLabel)}" placeholder="${esc(caption || ariaLabel || '')}" ${extraAttrs} oninput="${oninput}">
  </label>`;
}

function renderMatrixHeaderCell(column, index, totalColumns, editing) {
  if (editing) {
    return `<div class="value-stream-header is-editing" data-testid="value-stream-header" data-column-id="${esc(column.id)}" data-stream-id="${esc(column.id)}">
      <div class="matrix-cell-actions">
        <button class="matrix-mini-btn" type="button" data-testid="matrix-column-add-after" data-column-id="${esc(column.id)}" onclick="addPanoramaColumn('${esc(column.id)}')" title="新增右侧价值流">＋</button>
        <button class="matrix-mini-btn" type="button" data-testid="matrix-column-move-left" data-column-id="${esc(column.id)}" onclick="movePanoramaColumn('${esc(column.id)}',-1)" ${index === 0 ? 'disabled' : ''} title="左移">←</button>
        <button class="matrix-mini-btn" type="button" data-testid="matrix-column-move-right" data-column-id="${esc(column.id)}" onclick="movePanoramaColumn('${esc(column.id)}',1)" ${index === totalColumns - 1 ? 'disabled' : ''} title="右移">→</button>
        <button class="matrix-mini-btn danger" type="button" data-testid="matrix-column-delete" data-column-id="${esc(column.id)}" onclick="removePanoramaColumn('${esc(column.id)}')" ${totalColumns <= 1 ? 'disabled' : ''} title="删除价值流">✕</button>
      </div>
      ${renderMatrixFieldInput({
        testId: 'matrix-column-badge',
        value: column.badge || '',
        ariaLabel: '价值链环节',
        caption: '价值链环节',
        scope: 'column-badge',
        extraAttrs: `data-column-id="${esc(column.id)}"`,
        oninput: `setPanoramaColumn('${esc(column.id)}','badge',this.value)`,
      })}
      ${renderMatrixFieldInput({
        testId: 'matrix-column-name',
        value: column.name || '',
        ariaLabel: '环节定义/说明',
        caption: '环节定义/说明',
        scope: 'column-name',
        extraAttrs: `data-column-id="${esc(column.id)}"`,
        oninput: `setPanoramaColumn('${esc(column.id)}','name',this.value)`,
      })}
      ${renderMatrixFieldInput({
        testId: 'matrix-column-scope',
        value: column.scope || '',
        ariaLabel: '创造价值',
        caption: '创造价值',
        scope: 'column-scope',
        extraAttrs: `data-column-id="${esc(column.id)}"`,
        oninput: `setPanoramaColumn('${esc(column.id)}','scope',this.value)`,
      })}
    </div>`;
  }
  return `<div class="value-stream-header" data-testid="value-stream-header" data-column-id="${esc(column.id)}" data-stream-id="${esc(column.id)}">
    ${column.badge ? `<span class="value-stream-lane-badge">${esc(column.badge)}</span>` : ''}
    <strong>${esc(column.name)}</strong>
    ${column.scope ? `<span>${esc(column.scope)}</span>` : ''}
  </div>`;
}

function renderMatrixLaneCell(lane, index, totalLanes, editing) {
  if (editing) {
    return `<div class="value-stream-lane is-editing" data-lane-id="${esc(lane.id)}">
      <div class="matrix-cell-actions">
        <button class="matrix-mini-btn" type="button" data-testid="matrix-lane-add-after" data-lane-id="${esc(lane.id)}" onclick="addPanoramaLane('${esc(lane.id)}')" title="新增下方业务域">＋</button>
        <button class="matrix-mini-btn" type="button" data-testid="matrix-lane-move-up" data-lane-id="${esc(lane.id)}" onclick="movePanoramaLane('${esc(lane.id)}',-1)" ${index === 0 ? 'disabled' : ''} title="上移">↑</button>
        <button class="matrix-mini-btn" type="button" data-testid="matrix-lane-move-down" data-lane-id="${esc(lane.id)}" onclick="movePanoramaLane('${esc(lane.id)}',1)" ${index === totalLanes - 1 ? 'disabled' : ''} title="下移">↓</button>
        <button class="matrix-mini-btn danger" type="button" data-testid="matrix-lane-delete" data-lane-id="${esc(lane.id)}" onclick="removePanoramaLane('${esc(lane.id)}')" ${totalLanes <= 1 ? 'disabled' : ''} title="删除业务域">✕</button>
      </div>
      ${renderMatrixFieldInput({
        testId: 'matrix-lane-badge',
        value: lane.badge || '',
        ariaLabel: '业务域标签',
        caption: '标签',
        scope: 'lane-badge',
        extraAttrs: `data-lane-id="${esc(lane.id)}"`,
        oninput: `setPanoramaLane('${esc(lane.id)}','badge',this.value)`,
      })}
      ${renderMatrixFieldInput({
        testId: 'matrix-lane-name',
        value: lane.name || '',
        ariaLabel: '业务域正文',
        caption: '正文',
        scope: 'lane-name',
        extraAttrs: `data-lane-id="${esc(lane.id)}"`,
        oninput: `setPanoramaLane('${esc(lane.id)}','name',this.value)`,
      })}
      ${renderMatrixFieldInput({
        testId: 'matrix-lane-note',
        value: lane.note || '',
        ariaLabel: '业务域备注',
        caption: '备注',
        scope: 'lane-note',
        extraAttrs: `data-lane-id="${esc(lane.id)}"`,
        oninput: `setPanoramaLane('${esc(lane.id)}','note',this.value)`,
      })}
    </div>`;
  }
  return `<div class="value-stream-lane">
    ${lane.badge ? `<span class="value-stream-lane-badge">${esc(lane.badge)}</span>` : ''}
    <strong>${esc(lane.name)}</strong>
    ${lane.note ? `<span>${esc(lane.note)}</span>` : ''}
  </div>`;
}

function getMatrixStageSlot(node, index) {
  const slot = normalizeGridSlot(node?.stage?.panoramaSlot);
  if (slot) return slot;
  const pos = node?.stage?.panoramaPos;
  if (pos && typeof pos === 'object') {
    const normalizedPos = normalizeGraphOffset(pos);
    return {
      row: Math.max(0, Math.round((normalizedPos.y - MATRIX_STAGE_BOARD_PAD) / MATRIX_STAGE_SLOT_H)),
      col: Math.max(0, Math.round((normalizedPos.x - MATRIX_STAGE_BOARD_PAD) / MATRIX_STAGE_SLOT_W)),
    };
  }
  return { row: Math.floor(index / 2), col: index % 2 };
}

function getMatrixStageNodePosition(node, index) {
  const slot = getMatrixStageSlot(node, index);
  return {
    x: MATRIX_STAGE_BOARD_PAD + slot.col * MATRIX_STAGE_SLOT_W,
    y: MATRIX_STAGE_BOARD_PAD + slot.row * MATRIX_STAGE_SLOT_H,
  };
}

function getMatrixStageBoardHeight(stageNodes, editing = false) {
  if (!stageNodes.length) return editing ? 48 : 42;
  const maxBottom = stageNodes.reduce((maxY, node, index) => {
    const pos = getMatrixStageNodePosition(node, index);
    return Math.max(maxY, pos.y + MATRIX_STAGE_CARD_H + 8);
  }, 0);
  return Math.max(editing ? 82 : 54, maxBottom + (editing ? 30 : 0));
}

function getMatrixStageBoardWidth(stageNodes, editing = false) {
  if (!stageNodes.length) return editing ? 132 : 120;
  const maxRight = stageNodes.reduce((maxX, node, index) => {
    const pos = getMatrixStageNodePosition(node, index);
    return Math.max(maxX, pos.x + getMatrixStageNodeWidth(node) + MATRIX_STAGE_BOARD_PAD);
  }, 0);
  return Math.max(editing ? 250 : 132, maxRight);
}

function renderMatrixStageBoard(lane, column, stageNodes, editing) {
  const focusedStageId = String(S.ui.stageLinkFocusId || '').trim();
  const cellId = `${lane.id}::${column.id}`;
  const boardH = getMatrixStageBoardHeight(stageNodes, editing);
  const boardW = getMatrixStageBoardWidth(stageNodes, editing);
  return `<div class="value-stream-stage-board" data-testid="value-stream-stage-board" style="height:${boardH}px;min-width:${boardW}px">
    ${stageNodes.map((node, index) => {
      const pos = getMatrixStageNodePosition(node, index);
      const slot = getMatrixStageSlot(node, index);
      const flowCount = Math.max(0, Number(node._processCount || 0) || 0);
      const nodeTitle = flowCount ? `${node.label}（${flowCount} 个流程）` : (node.label || '');
      const canRenameStage = Boolean(editing && !node.stage?.virtual);
      const nodeW = getMatrixStageNodeWidth(node);
      return `<div class="stage-graph-node stage-kind stage-matrix-stage${focusedStageId && node.id === focusedStageId ? ' is-selected' : ''}" role="button" tabindex="0"
        style="left:${pos.x}px;top:${pos.y}px;width:${nodeW}px"
        data-node-id="${esc(node.id)}" data-testid="stage-graph-node" title="${esc(nodeTitle)}"
        data-member-count="${flowCount}" data-flow-count="${flowCount}"
        data-grid-row="${slot.row}" data-grid-col="${slot.col}"
        ondblclick="startStageNameEdit('${esc(node.id)}',event)"
        onmousedown="startStageNodeDrag('stage','${esc(node.id)}',event)">
        ${renderStageNameInlineEditor(node.id, node.label, canRenameStage)}
        ${flowCount > 0 ? `<span class="stage-node-count" aria-label="流程数量">${flowCount}</span>` : ''}
        ${editing ? `<span class="matrix-stage-delete" data-testid="matrix-stage-delete" title="删除阶段" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();removeStage('${esc(node.id)}')">✕</span>` : ''}
      </div>`;
    }).join('')}
    ${editing ? `<button class="matrix-stage-add" type="button" data-testid="matrix-stage-add" data-cell-id="${esc(cellId)}" onclick="addStageFromMatrixCell('${esc(lane.id)}','${esc(column.id)}')">＋ 阶段</button>` : ''}
  </div>`;
}

function renderValueStreamCell(lane, column, cell, stageNodes, editing = false) {
  const sortedStages = [...stageNodes].sort((left, right) => {
    const linkedDelta = Number(!!right._linked) - Number(!!left._linked);
    if(linkedDelta) return linkedDelta;
    return (left._valueStreamIndex || 0) - (right._valueStreamIndex || 0);
  });
  const cellId = `${lane.id}::${column.id}`;
  return `<div class="value-stream-cell${sortedStages.length ? ' has-stages' : ''}${editing ? ' is-editing' : ''}" data-cell-id="${esc(cellId)}" data-lane-id="${esc(lane.id)}" data-column-id="${esc(column.id)}">
    ${editing ? `<div class="matrix-body-editors">
      ${renderMatrixFieldInput({
        testId: 'matrix-cell-status',
        value: cell.status || '',
        ariaLabel: '单元格标签',
        caption: '标签',
        scope: 'cell-status',
        extraAttrs: `data-cell-id="${esc(cellId)}"`,
        oninput: `setPanoramaCell('${esc(lane.id)}','${esc(column.id)}','status',this.value)`,
      })}
      ${renderMatrixFieldInput({
        testId: 'matrix-cell-text',
        value: cell.text || '',
        ariaLabel: '单元格备注',
        caption: '备注',
        scope: 'cell-text',
        extraAttrs: `data-cell-id="${esc(cellId)}"`,
        oninput: `setPanoramaCell('${esc(lane.id)}','${esc(column.id)}','text',this.value)`,
      })}
    </div>` : `
      ${cell.status ? `<div class="value-stream-cell-status">${esc(cell.status)}</div>` : ''}
      ${cell.text ? `<div class="value-stream-cell-text">${esc(cell.text)}</div>` : ''}
    `}
    ${renderMatrixStageBoard(lane, column, sortedStages, editing)}
  </div>`;
}

function getValueStreamColumnMinWidths(model, groupedStages, editing = false) {
  const count = Math.max(1, (model?.columns || []).length);
  const columnMin = editing ? 220 : 210;
  return (model?.columns || []).map((column) => {
    const required = (model?.lanes || []).reduce((maxWidth, lane) => {
      const stages = groupedStages?.get?.(`${lane.id}::${column.id}`) || [];
      return Math.max(maxWidth, getMatrixStageBoardWidth(stages, editing) + 16);
    }, columnMin);
    return Math.ceil(Math.max(columnMin, required));
  }).slice(0, count);
}

function getValueStreamGridStyle(model, editing = false, groupedStages = null) {
  const axisMin = editing ? 220 : 154;
  const columnWidths = getValueStreamColumnMinWidths(model, groupedStages, editing);
  const columnTracks = columnWidths.map((width) => `minmax(${width}px,1fr)`).join(' ');
  if (editing) return `grid-template-columns:minmax(${axisMin}px,.8fr) ${columnTracks}`;
  return `grid-template-columns:minmax(${axisMin}px,.9fr) ${columnTracks}`;
}

function getValueStreamMatrixBaseWidth(model, editing = false, groupedStages = null) {
  const axisMin = editing ? 220 : 154;
  const columnWidths = getValueStreamColumnMinWidths(model, groupedStages, editing);
  return axisMin + columnWidths.reduce((sum, width) => sum + width, 0);
}

function renderStagePanoramaMatrixMarkup({ nodes, links, emptyText = '暂无内容', testId = 'stage-graph' }) {
  const model = getPanoramaModel(S.doc);
  const linkedStageIds = new Set();
  links.forEach((link) => {
    linkedStageIds.add(link.from);
    linkedStageIds.add(link.to);
  });
  const indexedNodes = nodes.map((node, index) => ({
    ...node,
    _valueStreamIndex: index,
    _linked: linkedStageIds.has(node.id),
  }));
  const editing = isStagePanoramaEditing();
  const groupedStages = groupStagesByPanoramaCell(indexedNodes, model, false);
  const gridStyle = getValueStreamGridStyle(model, editing, groupedStages);
  const zoom = getStageGraphZoom();
  const matrixBaseWidth = getValueStreamMatrixBaseWidth(model, editing, groupedStages);
  const matrixStyle = `width:max(100%, ${matrixBaseWidth}px);min-width:${matrixBaseWidth}px;zoom:${editing ? zoom : 1}`;
  const hScrollWidth = Math.ceil(matrixBaseWidth * (editing ? zoom : 1));
  return `<div class="stage-graph value-stream-graph" data-testid="${testId}">
    <div class="value-stream-scroll-wrap" data-testid="value-stream-scroll-wrap">
      <div class="value-stream-scroll" data-testid="value-stream-scroll" onscroll="syncValueStreamHScrollFromContent(this)">
      <div class="value-stream-matrix${editing ? ' is-editing' : ''}" data-testid="value-stream-matrix" data-editing="${editing ? 'true' : 'false'}" style="${matrixStyle}">
        <div class="value-stream-header-row" style="${gridStyle}">
          <div class="value-stream-axis">业务域 / 价值流</div>
          ${model.columns.map((column, index) => renderMatrixHeaderCell(column, index, model.columns.length, editing)).join('')}
        </div>
        <div class="value-stream-body">
          ${model.lanes.map((lane, index) => `<div class="value-stream-row" data-testid="value-stream-row" data-lane-id="${esc(lane.id)}" style="${gridStyle}">
            ${renderMatrixLaneCell(lane, index, model.lanes.length, editing)}
            ${model.columns.map((column) => renderValueStreamCell(lane, column, getPanoramaCell(model, lane.id, column.id), groupedStages.get(`${lane.id}::${column.id}`) || [], editing)).join('')}
          </div>`).join('')}
        </div>
      </div>
      </div>
      <div class="value-stream-hscroll" data-testid="value-stream-hscroll" onscroll="syncValueStreamContentFromHScroll(this)">
        <div style="width:${hScrollWidth}px;height:1px"></div>
      </div>
    </div>
  </div>`;
}

function renderStageFlowCanvasTools(stageItem, processRefs) {
  const stage = stageItem && !stageItem.virtual ? findStage(stageItem.id, S.doc) : null;
  if (!stage) {
    return `<div class="stage-flow-canvas-tools is-muted" data-testid="stage-flow-canvas-tools">
      <span>未设置业务阶段仅用于承接待归类流程，不能维护阶段内连线。</span>
    </div>`;
  }
  const allProcesses = S.doc.processes || [];
  const availableProcesses = allProcesses.filter((proc) => !processRefs.some((item) => item.processId === proc.id));
  const businessDomain = getStageBusinessDomainLabel(stage);
  return `<div class="stage-flow-canvas-tools" data-testid="stage-flow-canvas-tools">
    <div class="stage-flow-domain-readonly" data-testid="stage-business-domain-readonly">
      <span>所属业务域</span>
      <strong>${esc(businessDomain)}</strong>
    </div>
    <div class="stage-flow-tool-group stage-flow-node-tools">
      <select data-testid="stage-process-select" id="stage-process-select" onchange="addProcessToStage('${esc(stage.id)}',this.value);this.value=''">
        <option value="">选择已有流程加入当前阶段...</option>
        ${availableProcesses.map((proc) => `<option value="${esc(proc.id)}">${esc(proc.name || '未命名流程')}</option>`).join('')}
      </select>
    </div>
  </div>`;
}

function renderStageFlowGuideMarkup({ stageItem, nodes, links, emptyText = '暂无内容', testId = 'stage-graph', editing = false, processRefs = [] }) {
  const showTools = editing && stageItem;
  const canEditStage = editing && stageItem && !stageItem.virtual;
  if (!nodes.length) {
    return `<div class="stage-graph stage-flow-guide${editing ? ' is-editing' : ''}" data-testid="${testId}">
      ${showTools ? renderStageFlowCanvasTools(stageItem, processRefs) : ''}
      <div class="diag-empty stage-flow-empty" data-testid="${testId}-empty">
        <span>${emptyText}</span>
        ${canEditStage ? `<button class="btn btn-outline btn-sm" type="button" data-testid="stage-flow-node-add-button" onclick="addStageFlowNode('${esc(stageItem.id)}')">+ 新流程</button>` : ''}
      </div>
    </div>`;
  }
  const graph = buildStageFlowGuideLayout(nodes, links, { includeNodeGroupEditors: canEditStage });
  const zoom = getStageGraphZoom();
  const zoomedW = Math.max(240, Math.round(graph.boardW * zoom));
  const zoomedH = Math.max(180, Math.round(graph.boardH * zoom));
  const draftFromRefId = canEditStage ? getStageFlowLinkDraft(stageItem.id) : '';
  return `<div class="stage-graph stage-flow-guide${editing ? ' is-editing' : ''}" data-testid="${testId}">
    ${showTools ? renderStageFlowCanvasTools(stageItem, processRefs) : ''}
    <div class="stage-graph-zoom-shell stage-flow-zoom-shell" style="width:${zoomedW}px;height:${zoomedH}px">
      <div class="stage-graph-zoom-target" style="width:${graph.boardW}px;height:${graph.boardH}px;transform:scale(${zoom});transform-origin:0 0;">
        <div class="stage-graph-board stage-flow-board" style="width:${graph.boardW}px;height:${graph.boardH}px">
          ${canEditStage ? `<button class="stage-flow-board-add" type="button" data-testid="stage-flow-node-add-button"
            onmousedown="event.stopPropagation()" onclick="event.stopPropagation();addStageFlowNode('${esc(stageItem.id)}')">+ 流程</button>` : ''}
          ${graph.groups.map((group) => `<div class="stage-flow-group-box" data-testid="stage-flow-group" aria-label="流程分组"
              data-process-ids="${esc((group.processIds || []).join('|'))}"
              style="left:${group.x}px;top:${group.y}px;width:${group.w}px;height:${group.h}px">
              <div class="stage-flow-group-title${group.label ? '' : ' is-placeholder'}">${esc(group.label || '未分组')}</div>
            </div>`).join('')}
          <svg class="stage-graph-svg" width="${graph.boardW}" height="${graph.boardH}" viewBox="0 0 ${graph.boardW} ${graph.boardH}" aria-hidden="true">
            <defs>
              <marker id="stage-flow-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 z" fill="#52677f"></path>
              </marker>
            </defs>
            ${graph.links.map((link) => `<path class="stage-graph-link stage-flow-link"
              data-link-from="${esc(link.from)}" data-link-to="${esc(link.to)}"
              d="${link.path}" fill="none" stroke="#52677f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#stage-flow-arrow)"></path>`).join('')}
          </svg>
          ${canEditStage ? graph.links.map((link) => {
            const fromPos = graph.positions[link.from];
            const toPos = graph.positions[link.to];
            if (!fromPos || !toPos || !link.id) return '';
            const actionPos = getStageFlowLinkActionPosition(fromPos, toPos);
            return `<button class="stage-flow-link-remove" type="button" data-testid="stage-process-link-remove-button"
              data-link-from="${esc(link.from)}" data-link-to="${esc(link.to)}"
              title="删除连线" aria-label="删除连线"
              style="left:${actionPos.x}px;top:${actionPos.y}px"
              onmousedown="event.stopPropagation()" onclick="event.stopPropagation();removeStageProcessLink('${esc(stageItem.id)}','${esc(link.id)}')">×</button>`;
          }).join('') : ''}
          ${nodes.map((node) => {
            const pos = graph.positions[node.id];
            const procId = node.processId || '';
            if (canEditStage) {
              const isDraftSource = draftFromRefId === node.id;
              const isDraftTarget = draftFromRefId && draftFromRefId !== node.id;
              const linkButton = isDraftSource
                ? `<button class="stage-quick-btn warning" type="button" data-testid="stage-flow-link-cancel-button" title="取消连线" aria-label="取消连线" onclick="clearStageFlowLinkDraft()">↺</button>`
                : (isDraftTarget
                  ? `<button class="stage-quick-btn success" type="button" data-testid="stage-flow-link-target-button" title="连到这里" aria-label="连到这里" onclick="S.ui.stageFlowLinkDraft=null;addStageProcessLinkBetweenRefs('${esc(stageItem.id)}','${esc(draftFromRefId)}','${esc(node.id)}')">↦</button>`
                  : `<button class="stage-quick-btn" type="button" data-testid="stage-flow-link-source-button" title="从这里连线" aria-label="从这里连线" onclick="startStageFlowLinkDraft('${esc(stageItem.id)}','${esc(node.id)}')">→</button>`);
              return `<div class="stage-graph-node process-kind stage-flow-node is-editable${isDraftSource ? ' is-link-source' : ''}${isDraftTarget ? ' is-link-target' : ''}" data-node-id="${esc(node.id)}" data-testid="stage-graph-node" data-process-id="${esc(procId)}"
                onmousedown="startStageNodeDrag('stage-ref','${esc(node.id)}',event)"
                style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px">
                <textarea class="stage-flow-name-input" data-testid="stage-flow-name-input" data-process-id="${esc(procId)}" aria-label="流程名称" placeholder="新流程"
                  onmousedown="event.stopPropagation()" onclick="event.stopPropagation()"
                  oninput="setProc('${esc(procId)}','name',this.value);renderSidebar()">${esc(node.name || '')}</textarea>
                <div class="stage-flow-node-actions" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()">
                  <button class="stage-quick-btn" type="button" data-testid="stage-member-view-button" title="查看流程" aria-label="查看流程" onclick="navigate('process',{procId:'${esc(procId)}',taskId:null})">↗</button>
                  ${linkButton}
                  <button class="stage-quick-btn danger" type="button" data-testid="stage-member-remove-button" title="移出阶段" aria-label="移出阶段" onclick="removeProcessFromStage('${esc(stageItem.id)}','${esc(procId)}')">−</button>
                  <button class="stage-quick-btn danger" type="button" data-testid="stage-member-delete-button" title="删除流程" aria-label="删除流程" onclick="removeProcess('${esc(procId)}')">×</button>
                </div>
              </div>`;
            }
            return `<div class="stage-graph-node process-kind stage-flow-node" data-node-id="${esc(node.id)}" data-testid="stage-graph-node" data-process-id="${esc(procId)}"
              onmousedown="startStageNodeDrag('stage-ref','${esc(node.id)}',event)"
              style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px">
              <span class="stage-flow-node-title">${esc(node.label)}</span>
            </div>`;
          }).join('')}
          ${canEditStage ? nodes.map((node) => renderStageFlowNodeGroupEditor(node, graph.positions[node.id])).join('') : ''}
        </div>
      </div>
    </div>
  </div>`;
}

function renderStageGraphMarkup({ nodes, links, kind = 'stage', emptyText = '暂无内容', testId = 'stage-graph', stageItem = null, editing = false, processRefs = [] }) {
  if (kind === 'stage') {
    return renderStagePanoramaMatrixMarkup({ nodes, links, emptyText, testId });
  }
  if (kind === 'stage-ref') {
    return renderStageFlowGuideMarkup({ stageItem, nodes, links, emptyText, testId, editing, processRefs });
  }
  if (!nodes.length) return `<div class="diag-empty" data-testid="${testId}-empty">${emptyText}</div>`;
  const graph = buildStageGraphLayout(nodes, links, kind);
  const focusedStageId = kind === 'stage' ? String(S.ui.stageLinkFocusId || '').trim() : '';
  const zoom = getStageGraphZoom();
  const zoomedW = Math.max(240, Math.round(graph.boardW * zoom));
  const zoomedH = Math.max(180, Math.round(graph.boardH * zoom));
  return `<div class="stage-graph" data-testid="${testId}">
    <div class="stage-graph-zoom-shell" style="width:${zoomedW}px;height:${zoomedH}px">
      <div class="stage-graph-zoom-target" style="width:${graph.boardW}px;height:${graph.boardH}px;transform:scale(${zoom});transform-origin:0 0;">
        <div class="stage-graph-board" style="width:${graph.boardW}px;height:${graph.boardH}px">
          <svg class="stage-graph-svg" width="${graph.boardW}" height="${graph.boardH}" viewBox="0 0 ${graph.boardW} ${graph.boardH}" aria-hidden="true">
            <defs>
              <marker id="stage-graph-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
                <path d="M0,0 L0,8 L8,4 z" fill="#64748b"></path>
              </marker>
            </defs>
            ${graph.links.map((link) => {
              const related = focusedStageId && (link.from === focusedStageId || link.to === focusedStageId);
              const muted = focusedStageId && !related;
              return `<path class="stage-graph-link${related ? ' is-related' : ''}${muted ? ' is-muted' : ''}"
                data-link-from="${esc(link.from)}" data-link-to="${esc(link.to)}"
                d="${link.path}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#stage-graph-arrow)"></path>`;
            }).join('')}
          </svg>
          ${nodes.map((node) => {
            const pos = graph.positions[node.id];
            const selected = focusedStageId && node.id === focusedStageId;
            return `<button class="stage-graph-node ${kind==='stage'?'stage-kind':'process-kind'}${selected ? ' is-selected' : ''}" type="button"
              data-node-id="${esc(node.id)}" data-testid="stage-graph-node"
              onmousedown="startStageNodeDrag('${kind}','${esc(node.id)}',event)"
              style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px">
              <span class="stage-graph-node-title">${esc(node.label)}</span>
              ${node.meta ? `<span class="stage-graph-node-meta">${esc(node.meta)}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

function buildStagePanoramaGraphData() {
  const stageItems = getStageItems(S.doc).filter((stage) => !stage.virtual);
  const nodes = stageItems.map((stage) => {
    const processRefs = getStageProcessRefs(stage.id, S.doc);
    const searchText = processRefs.map((ref) => {
      const proc = getStageRefProcess(ref, S.doc);
      const taskNames = getProcNodes(proc).map((task) => task.name || '').join(' ');
      return `${proc?.name || ''} ${proc?.subDomain || ''} ${proc?.flowGroup || ''} ${taskNames}`;
    }).join(' ');
    return {
      id: stage.id,
      label: stage.name || stage.id,
      meta: stage.subDomain || '',
      searchText,
      _processCount: processRefs.length,
      stage,
    };
  });
  const stageIdSet = new Set(stageItems.map((stage) => stage.id));
  const links = getStageLinks(S.doc)
    .filter((link) => stageIdSet.has(link.fromStageId) && stageIdSet.has(link.toStageId))
    .map((link) => ({ from: link.fromStageId, to: link.toStageId }));
  return { nodes, links };
}

function buildStageDetailGraphData(stageId) {
  const processRefs = getStageProcessRefs(stageId, S.doc);
  const processes = processRefs.map((ref) => getStageRefProcess(ref, S.doc)).filter(Boolean);
  const nodes = processRefs.map((ref) => {
      const proc = getStageRefProcess(ref, S.doc);
    return {
      id: ref.id,
      label: proc?.name || proc?.id || ref.processId,
      name: proc?.name || '',
      meta: '',
      group: proc?.flowGroup || '',
      processId: proc?.id || ref.processId,
    };
  });
  const links = getStageFlowLinks(S.doc)
    .filter((link) => link.stageId === stageId)
    .map((link) => ({ id: link.id, from: link.fromRefId, to: link.toRefId }));
  return { nodes, links, processes, processRefs };
}

function renderStageLinkEditor(stageItems) {
  const realStages = stageItems.filter((stage) => !stage.virtual);
  const links = getStageLinks(S.doc);
  const focusedStage = realStages.find((stage) => stage.id === S.ui.stageLinkFocusId) || null;
  const visibleLinks = focusedStage
    ? links.filter((link) => link.fromStageId === focusedStage.id || link.toStageId === focusedStage.id)
    : links;
  const selectionNote = focusedStage
    ? `<div class="stage-link-focus-note" data-testid="stage-link-focus-note">
        <span>已选中：${esc(focusedStage.name || focusedStage.id)}，仅显示相关连线 ${visibleLinks.length} / ${links.length}</span>
        <button class="stage-quick-btn stage-quick-btn-text" type="button" data-testid="stage-link-clear-focus" onclick="clearStageLinkFocus()">显示全部</button>
      </div>`
    : '<div class="stage-link-focus-note muted">点击左侧全景图中的阶段节点，可只查看它的相关连线。</div>';
  return `<div class="stage-editor-section">
    <div class="stage-editor-section-head">
      <h5>阶段连线</h5>
      <button class="btn btn-outline btn-sm" type="button" onclick="addStageLink('', '${esc(focusedStage?.id || '')}')">＋ 添加连线</button>
    </div>
    ${selectionNote}
    ${visibleLinks.length ? `<div class="stage-link-list">
      ${visibleLinks.map((link) => {
        const linkIndex = links.findIndex((item) => item.uid === link.uid);
        const related = focusedStage && (link.fromStageId === focusedStage.id || link.toStageId === focusedStage.id);
        return `<div class="stage-link-row${related ? ' is-related' : ''}" data-testid="stage-link-row">
        <select onchange="setStageLink('${esc(link.uid)}','fromStageId',this.value)">
          ${realStages.map((stage) => `<option value="${esc(stage.id)}" ${link.fromStageId===stage.id?'selected':''}>${esc(stage.name || stage.id)}</option>`).join('')}
        </select>
        <span class="stage-link-arrow">→</span>
        <select onchange="setStageLink('${esc(link.uid)}','toStageId',this.value)">
          ${realStages.map((stage) => `<option value="${esc(stage.id)}" ${link.toStageId===stage.id?'selected':''}>${esc(stage.name || stage.id)}</option>`).join('')}
        </select>
        <div class="row-actions">
          <button class="stage-quick-btn" type="button" data-testid="stage-link-add-button" onclick="addStageLink('${esc(link.uid)}','${esc(focusedStage?.id || '')}')">＋</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-link-move-up" onclick="moveStageLink('${esc(link.uid)}',-1)" ${linkIndex <= 0 ? 'disabled' : ''}>↑</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-link-move-down" onclick="moveStageLink('${esc(link.uid)}',1)" ${linkIndex === links.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="stage-quick-btn danger" type="button" data-testid="stage-link-remove-button" onclick="removeStageLink('${esc(link.uid)}')">✕</button>
        </div>
      </div>`;
      }).join('')}
    </div>` : `<p class="no-refs">${focusedStage ? '该阶段暂无相关连线，可点击“添加连线”补一条。' : '暂无阶段连线，先添加一条。'}</p>`}
  </div>`;
}

function renderStageProcessLinkEditor(stage, processRefs) {
  const links = stage ? getStageFlowLinks(S.doc).filter((link) => link.stageId === stage.id) : [];
  if (!stage) {
    return `<div class="stage-editor-section"><h5>阶段内流程连线</h5><p class="no-refs">未设置业务阶段只用于承接旧流程，不在这里维护流程连线。</p></div>`;
  }
  return `<div class="stage-editor-section">
    <div class="stage-editor-section-head">
      <h5>阶段内流程连线</h5>
      <button class="btn btn-outline btn-sm" type="button" onclick="addStageProcessLink('${esc(stage.id)}')" ${processRefs.length > 1 ? '' : 'disabled'}>＋ 添加连线</button>
    </div>
    ${links.length ? `<div class="stage-link-list">
      ${links.map((link) => `<div class="stage-link-row" data-testid="stage-process-link-row">
        <select onchange="setStageProcessLink('${esc(stage.id)}','${esc(link.id)}','fromRefId',this.value)">
          ${processRefs.map((ref) => {
            const proc = getStageRefProcess(ref, S.doc);
            return `<option value="${esc(ref.id)}" ${link.fromRefId===ref.id?'selected':''}>${esc(proc?.name || proc?.id || ref.processId)}</option>`;
          }).join('')}
        </select>
        <span class="stage-link-arrow">→</span>
        <select onchange="setStageProcessLink('${esc(stage.id)}','${esc(link.id)}','toRefId',this.value)">
          ${processRefs.map((ref) => {
            const proc = getStageRefProcess(ref, S.doc);
            return `<option value="${esc(ref.id)}" ${link.toRefId===ref.id?'selected':''}>${esc(proc?.name || proc?.id || ref.processId)}</option>`;
          }).join('')}
        </select>
        <div class="row-actions">
          <button class="stage-quick-btn" type="button" data-testid="stage-process-link-add-button" onclick="addStageProcessLink('${esc(stage.id)}','${esc(link.id)}')">＋</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-process-link-move-up" onclick="moveStageProcessLink('${esc(stage.id)}','${esc(link.id)}',-1)">↑</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-process-link-move-down" onclick="moveStageProcessLink('${esc(stage.id)}','${esc(link.id)}',1)">↓</button>
          <button class="stage-quick-btn danger" type="button" data-testid="stage-process-link-remove-button" onclick="removeStageProcessLink('${esc(stage.id)}','${esc(link.id)}')">✕</button>
        </div>
      </div>`).join('')}
    </div>` : '<p class="no-refs">暂无阶段内流程连线，先添加一条。</p>'}
  </div>`;
}

function renderStageProcessMembership(stageItem, processRefs) {
  const processes = processRefs.map((ref) => getStageRefProcess(ref, S.doc)).filter(Boolean);
  const allProcesses = S.doc.processes || [];
  const availableProcesses = allProcesses.filter((proc) => {
    if (processRefs.some((item) => item.processId === proc.id)) return false;
    if (stageItem.virtual) return false;
    return true;
  });
  return `<div class="stage-editor-section">
    <div class="stage-editor-section-head">
      <h5>成员流程</h5>
      ${!stageItem.virtual ? `<button class="btn btn-outline btn-sm" type="button" data-testid="stage-member-add-button" onclick="addProcess('${esc(stageItem.subDomain || '')}','${esc(stageItem.id)}')">＋ 新流程</button>` : ''}
    </div>
    ${processes.length ? `<div class="stage-member-list">
      ${processRefs.map((ref, index) => {
        const proc = getStageRefProcess(ref, S.doc);
        return `<div class="stage-member-chip" data-testid="stage-member-chip">
        <span class="stage-member-label">${esc(proc.name || '未命名流程')}</span>
        <div class="stage-member-actions">
          <button class="stage-quick-btn stage-quick-btn-text" type="button" data-testid="stage-member-view-button" onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:null})">查看</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-member-move-up" onclick="moveProcInStage('${esc(stageItem.id)}','${esc(proc.id)}',-1)" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-member-move-down" onclick="moveProcInStage('${esc(stageItem.id)}','${esc(proc.id)}',1)" ${index === processRefs.length - 1 ? 'disabled' : ''}>↓</button>
          ${!stageItem.virtual ? `<button class="stage-quick-btn danger stage-quick-btn-text" type="button" data-testid="stage-member-remove-button" onclick="removeProcessFromStage('${esc(stageItem.id)}','${esc(proc.id)}')">移出</button>` : ''}
          ${!stageItem.virtual ? `<button class="stage-quick-btn danger stage-quick-btn-text" type="button" data-testid="stage-member-delete-button" onclick="removeProcess('${esc(proc.id)}')">删除</button>` : ''}
        </div>
      </div>`;
      }).join('')}
    </div>` : '<p class="no-refs">当前阶段还没有流程。</p>'}
    ${!stageItem.virtual ? `<div class="stage-inline-row">
      <select data-testid="stage-process-select" id="stage-process-select">
        <option value="">选择已有流程加入当前阶段...</option>
        ${availableProcesses.map((proc) => `<option value="${esc(proc.id)}">${esc(proc.name || '未命名流程')}</option>`).join('')}
      </select>
      <button class="btn btn-outline btn-sm" type="button" data-testid="stage-member-join-button" onclick="addProcessToStage('${esc(stageItem.id)}',document.getElementById('stage-process-select').value)">加入</button>
    </div>` : '<p class="stage-tip">这些流程尚未归入真实业务阶段，可新建阶段后逐步迁移。</p>'}
  </div>`;
}

function renderPanoramaTableEditor(model) {
  const columns = model.columns || [];
  const lanes = model.lanes || [];
  return `<div class="stage-editor-section panorama-table-editor" data-testid="panorama-table-editor">
    <div class="stage-editor-section-head">
      <h5>全景表格</h5>
    </div>
    <div class="panorama-config-block">
      <div class="panorama-config-title">
        <span>价值流列</span>
        <button class="btn btn-outline btn-sm" type="button" data-testid="panorama-column-add" onclick="addPanoramaColumn()">＋ 新增列</button>
      </div>
      <div class="panorama-config-list">
        ${columns.map((column, index) => `<div class="panorama-config-row" data-column-id="${esc(column.id)}">
          <input type="text" value="${esc(column.name || '')}" data-testid="panorama-column-name" data-column-id="${esc(column.id)}" aria-label="价值流名称"
            oninput="setPanoramaColumn('${esc(column.id)}','name',this.value);rerenderStageWorkbench({focusSelector:'[data-testid=&quot;panorama-column-name&quot;][data-column-id=&quot;${esc(column.id)}&quot;]'})">
          <input type="text" value="${esc(column.scope || '')}" data-testid="panorama-column-scope" data-column-id="${esc(column.id)}" aria-label="价值流范围"
            oninput="setPanoramaColumn('${esc(column.id)}','scope',this.value);rerenderStageWorkbench({focusSelector:'[data-testid=&quot;panorama-column-scope&quot;][data-column-id=&quot;${esc(column.id)}&quot;]'})">
          <div class="stage-overview-row-actions">
            <button class="stage-quick-btn" type="button" data-testid="panorama-column-add-after" onclick="addPanoramaColumn('${esc(column.id)}')">＋</button>
            <button class="stage-quick-btn" type="button" data-testid="panorama-column-move-left" onclick="movePanoramaColumn('${esc(column.id)}',-1)" ${index === 0 ? 'disabled' : ''}>←</button>
            <button class="stage-quick-btn" type="button" data-testid="panorama-column-move-right" onclick="movePanoramaColumn('${esc(column.id)}',1)" ${index === columns.length - 1 ? 'disabled' : ''}>→</button>
            <button class="stage-quick-btn danger" type="button" data-testid="panorama-column-delete" onclick="removePanoramaColumn('${esc(column.id)}')" ${columns.length <= 1 ? 'disabled' : ''}>✕</button>
          </div>
        </div>`).join('')}
      </div>
    </div>
    <div class="panorama-config-block">
      <div class="panorama-config-title">
        <span>业务域行</span>
        <button class="btn btn-outline btn-sm" type="button" data-testid="panorama-lane-add" onclick="addPanoramaLane()">＋ 新增行</button>
      </div>
      <div class="panorama-config-list">
        ${lanes.map((lane, index) => `<div class="panorama-config-row panorama-lane-editor-row" data-lane-id="${esc(lane.id)}">
          <input type="text" value="${esc(lane.name || '')}" data-testid="panorama-lane-name" data-lane-id="${esc(lane.id)}" aria-label="业务域名称"
            oninput="setPanoramaLane('${esc(lane.id)}','name',this.value);rerenderStageWorkbench({focusSelector:'[data-testid=&quot;panorama-lane-name&quot;][data-lane-id=&quot;${esc(lane.id)}&quot;]'})">
          <input type="text" value="${esc(lane.badge || '')}" data-testid="panorama-lane-badge" data-lane-id="${esc(lane.id)}" aria-label="业务域标签"
            oninput="setPanoramaLane('${esc(lane.id)}','badge',this.value);rerenderStageWorkbench({focusSelector:'[data-testid=&quot;panorama-lane-badge&quot;][data-lane-id=&quot;${esc(lane.id)}&quot;]'})">
          <input type="text" value="${esc(lane.note || '')}" data-testid="panorama-lane-note" data-lane-id="${esc(lane.id)}" aria-label="业务域说明"
            oninput="setPanoramaLane('${esc(lane.id)}','note',this.value);rerenderStageWorkbench({focusSelector:'[data-testid=&quot;panorama-lane-note&quot;][data-lane-id=&quot;${esc(lane.id)}&quot;]'})">
          <div class="stage-overview-row-actions">
            <button class="stage-quick-btn" type="button" data-testid="panorama-lane-add-after" onclick="addPanoramaLane('${esc(lane.id)}')">＋</button>
            <button class="stage-quick-btn" type="button" data-testid="panorama-lane-move-up" onclick="movePanoramaLane('${esc(lane.id)}',-1)" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="stage-quick-btn" type="button" data-testid="panorama-lane-move-down" onclick="movePanoramaLane('${esc(lane.id)}',1)" ${index === lanes.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="stage-quick-btn danger" type="button" data-testid="panorama-lane-delete" onclick="removePanoramaLane('${esc(lane.id)}')" ${lanes.length <= 1 ? 'disabled' : ''}>✕</button>
          </div>
        </div>`).join('')}
      </div>
    </div>
    <div class="panorama-config-block">
      <div class="panorama-config-title">
        <span>单元格说明</span>
      </div>
      <div class="panorama-cell-editor-grid">
        ${lanes.flatMap((lane) => columns.map((column) => {
          const cell = getPanoramaCell(model, lane.id, column.id);
          const cellId = `${lane.id}::${column.id}`;
          return `<div class="panorama-cell-editor-row" data-cell-id="${esc(cellId)}">
            <span class="panorama-cell-coordinate">${esc(lane.name || lane.id)} / ${esc(column.name || column.id)}</span>
            <input type="text" value="${esc(cell.status || '')}" data-testid="panorama-cell-status" data-cell-id="${esc(cellId)}" aria-label="单元格状态"
              oninput="setPanoramaCell('${esc(lane.id)}','${esc(column.id)}','status',this.value);rerenderStageWorkbench({focusSelector:'[data-testid=&quot;panorama-cell-status&quot;][data-cell-id=&quot;${esc(cellId)}&quot;]'})">
            <input type="text" value="${esc(cell.text || '')}" data-testid="panorama-cell-text" data-cell-id="${esc(cellId)}" aria-label="单元格说明"
              oninput="setPanoramaCell('${esc(lane.id)}','${esc(column.id)}','text',this.value);rerenderStageWorkbench({focusSelector:'[data-testid=&quot;panorama-cell-text&quot;][data-cell-id=&quot;${esc(cellId)}&quot;]'})">
          </div>`;
        })).join('')}
      </div>
    </div>
  </div>`;
}

function renderStagePanoramaEditor(stageItems) {
  const realStages = stageItems.filter((stage) => !stage.virtual);
  const model = getPanoramaModel(S.doc);
  return `<div class="stage-editor-section" data-testid="stage-panorama-editor">
    <div class="stage-editor-section-head">
      <h5>业务阶段</h5>
      <button class="btn btn-outline btn-sm" type="button" data-testid="stage-overview-add-button" onclick="addStageFromPanorama()">＋ 新建阶段</button>
    </div>
    ${realStages.length ? `<div class="stage-overview-editor-list">
      ${realStages.map((stage, index) => {
        const focused = S.ui.stageLinkFocusId === stage.id;
        const placement = resolveStagePanoramaPlacement({ stage, label: stage.name || stage.id, meta: stage.subDomain || '', searchText: '' }, index, model);
        return `<div class="stage-overview-editor-row${focused ? ' is-focused' : ''}" data-testid="stage-overview-row" data-stage-id="${esc(stage.id)}">
        <input type="text" value="${esc(stage.name || '')}"
          aria-label="阶段名称"
          oninput="setStage('${esc(stage.id)}','name',this.value);renderSidebar();rerenderStageWorkbench({focusSelector:'[data-testid=&quot;stage-overview-row&quot;] input[aria-label=&quot;阶段名称&quot;]'})">
        <input type="text" value="${esc(stage.subDomain || '')}"
          aria-label="业务组件"
          oninput="setStage('${esc(stage.id)}','subDomain',this.value);renderSidebar();rerenderStageWorkbench({focusSelector:'[data-testid=&quot;stage-overview-row&quot;] input[aria-label=&quot;业务组件&quot;]'})">
        <select data-testid="stage-panorama-column-select" aria-label="价值流归属"
          onchange="setStage('${esc(stage.id)}','panoramaColumnUid',this.value);rerenderStageWorkbench({focusSelector:'[data-stage-id=&quot;${esc(stage.id)}&quot;] [data-testid=&quot;stage-panorama-column-select&quot;]'})">
          ${model.columns.map((column) => `<option value="${esc(column.id)}" ${column.id === placement.columnId ? 'selected' : ''}>${esc(column.name || column.id)}</option>`).join('')}
        </select>
        <select data-testid="stage-panorama-lane-select" aria-label="业务域归属"
          onchange="setStage('${esc(stage.id)}','panoramaLaneUid',this.value);rerenderStageWorkbench({focusSelector:'[data-stage-id=&quot;${esc(stage.id)}&quot;] [data-testid=&quot;stage-panorama-lane-select&quot;]'})">
          ${model.lanes.map((lane) => `<option value="${esc(lane.id)}" ${lane.id === placement.laneId ? 'selected' : ''}>${esc(lane.name || lane.id)}</option>`).join('')}
        </select>
        <div class="stage-overview-row-actions">
          <button class="stage-quick-btn stage-quick-btn-text" type="button" data-testid="stage-overview-focus-links-button" onclick="selectStageForPanorama('${esc(stage.id)}')">连线</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-overview-add-after-button" onclick="addStageFromPanorama('${esc(stage.id)}')">＋</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-overview-move-up" onclick="moveStage('${esc(stage.id)}',-1)" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="stage-quick-btn" type="button" data-testid="stage-overview-move-down" onclick="moveStage('${esc(stage.id)}',1)" ${index === realStages.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="stage-quick-btn danger" type="button" data-testid="stage-overview-delete-button"
            onclick="removeStage('${esc(stage.id)}')" title="删除阶段">✕</button>
        </div>
      </div>`;
      }).join('')}
    </div>` : '<p class="no-refs">暂无业务阶段，先新建一个阶段。</p>'}
  </div>
  ${renderPanoramaTableEditor(model)}`;
}

function renderStageDrawer(stageItem) {
  const drawerW = getDrawerWidth('process');
  const stage = stageItem && !stageItem.virtual ? findStage(stageItem.id, S.doc) : null;
  const processRefs = stageItem ? getStageProcessRefs(stageItem.id, S.doc) : [];
  const stageItems = getStageItems(S.doc);
  const panoramaMode = (S.ui.stageViewMode || 'panorama') === 'panorama';
  const drawerTitle = panoramaMode
    ? '业务全景编辑'
    : (stageItem ? `${stageItem.name || ''}`.trim() : '业务阶段');
  return `<div class="stage-drawer open" style="width:${drawerW}px" data-testid="stage-drawer">
    <div class="drawer-resize-handle" data-testid="stage-drawer-resize-handle" onmousedown="startDrawerResize(event)"></div>
    <div class="drawer-head">
      <div class="drawer-crumb">${esc(drawerTitle)}</div>
      <div class="drawer-actions">
        <button class="drawer-close" type="button" data-testid="stage-drawer-close" onclick="toggleStageEditorDrawer(false)" title="关闭抽屉">✕</button>
      </div>
    </div>
    <div class="drawer-body">
      ${panoramaMode ? `
        ${renderStagePanoramaEditor(stageItems)}
        ${renderStageLinkEditor(stageItems)}
      ` : `
      ${stage ? `<div class="form-grid">
        <div class="field-group">
          <label>阶段名称</label>
          <input data-testid="stage-name-input" type="text" value="${esc(stage.name || '')}"
            oninput="setStage('${esc(stage.id)}','name',this.value);renderSidebar();rerenderStageWorkbench({focusSelector:'[data-testid=&quot;stage-name-input&quot;]'})">
        </div>
        <div class="field-group">
          <label>业务组件</label>
          <input data-testid="stage-subdomain-input" type="text" value="${esc(stage.subDomain || '')}"
            oninput="setStage('${esc(stage.id)}','subDomain',this.value);renderSidebar();rerenderStageWorkbench({focusSelector:'[data-testid=&quot;stage-subdomain-input&quot;]'})">
        </div>
      </div>` : '<div class="stage-tip">当前查看的是“未设置业务阶段”虚拟分组，用于承接还未归类的流程。</div>'}
      ${renderStageProcessMembership(stageItem || { virtual: true, id: UNASSIGNED_STAGE_ID, subDomain: '' }, processRefs)}
      ${renderStageProcessLinkEditor(stage, processRefs)}
      `}
    </div>
  </div>`;
}

function renderStageWorkbench() {
  ensureStageSelection();
  const stageItem = getCurrentStageItem();
  const showDetail = S.ui.stageViewMode === 'detail' && stageItem;
  const showEditor = S.ui.stageEditorCollapsed === false;
  const showDrawer = false;
  const editorOffset = 0;
  const panoramaGraph = buildStagePanoramaGraphData();
  const detailGraph = stageItem ? buildStageDetailGraphData(stageItem.id) : { nodes: [], links: [], processes: [], processRefs: [] };
  const detailStageName = showDetail
    ? renderStageNameInlineEditor(stageItem.id, stageItem.name || stageItem.id, showEditor && !stageItem.virtual, 'stage-detail-name-text')
    : '';
  const detailHeader = showDetail ? `<div class="stage-compact-head" data-testid="stage-compact-head">
    <button class="btn btn-ghost-sm" type="button" onclick="openStagePanorama()">业务全景</button>
    <span class="stage-breadcrumb-sep">/</span>
    <div class="stage-card-title" data-testid="stage-detail-title">${detailStageName}<span class="stage-detail-title-suffix"> · 阶段详情</span></div>
  </div>` : '';
  return `<div class="stage-workbench" data-testid="process-stage-view">
    <div class="stage-main-shell" style="margin-right:${editorOffset}px">
      <div class="stage-main">
        <div class="stage-card">
          ${detailHeader}
          ${showDetail
            ? renderStageGraphMarkup({
                nodes: detailGraph.nodes,
                links: detailGraph.links,
                kind: 'stage-ref',
                emptyText: '当前阶段还没有流程。打开编辑后，可直接在图上新增流程。',
                testId: 'stage-detail-graph',
                stageItem,
                editing: showEditor,
                processRefs: detailGraph.processRefs,
              })
            : renderStageGraphMarkup({
                nodes: panoramaGraph.nodes,
                links: panoramaGraph.links,
                kind: 'stage',
                emptyText: '暂无业务阶段，先新建一个阶段。',
                testId: 'stage-panorama-graph',
              })}
        </div>
      </div>
    </div>
    ${showDrawer ? renderStageDrawer(stageItem || { id: UNASSIGNED_STAGE_ID, name: UNASSIGNED_STAGE_NAME, virtual: true, subDomain: '' }) : ''}
  </div>`;
}

function buildOrchestrationFlowHtml(task) {
  const orchestrationTasks = getNodeOrchestrationTasks(task);
  if(!orchestrationTasks.length) {
    return `<div class="orch-flow-empty">暂无节点任务，先补充该流程节点下的任务拆解。</div>`;
  }
  return `<div class="orch-flow-frame" data-testid="orchestration-flow">
    <div class="orch-flow-node-label">节点 ${esc(task.name || '未命名节点')}</div>
    <div class="orch-flow-track">
      ${orchestrationTasks.map((item, index) => `
        <div class="orch-flow-item">
          <div class="orch-flow-card tone-${String(item.type || 'Custom').toLowerCase()}">
            <span class="orch-flow-index">${index + 1}</span>
            <div class="orch-flow-text">
              <strong>${esc(item.name || `任务 ${index + 1}`)}</strong>
              <span>${esc(item.target || (item.type === 'Query' ? '待补充查询目标' : '待补充执行目标'))}</span>
            </div>
          </div>
          ${index < orchestrationTasks.length - 1 ? '<div class="orch-flow-arrow">→</div>' : ''}
        </div>`).join('')}
    </div>
  </div>`;
}

function renderProcTaskFlow(containerId, proc, activeTaskId, onClickMap) {
  const el = document.getElementById(containerId);
  if(!el) return;
  const nodes = getProcNodes(proc);
  if(!nodes.length) {
    el.innerHTML = `<div class="diag-empty">暂无节点，先补充流程节点。</div>`;
    initZoom(containerId);
    return;
  }

  let html = `<div class="ptf-wrap" data-testid="global-orchestration-flow">
    <div class="ptf-se">开始</div>`;
  for(const node of nodes) {
    const orchestrationTasks = getNodeOrchestrationTasks(node);
    html += `<div class="ptf-outer-arrow">→</div>
      <div class="ptf-node-frame ${node.id === activeTaskId ? 'active' : ''}" data-id="${esc(node.id)}">
        <div class="ptf-node-head">
          <span class="ptf-node-name">${esc(node.name || '未命名节点')}</span>
        </div>
        <div class="ptf-node-track">`;
    if(orchestrationTasks.length) {
      orchestrationTasks.forEach((item, index) => {
        html += `<div class="ptf-task-item tone-${String(item.type || 'Custom').toLowerCase()}">
            <span class="ptf-task-index">${index + 1}</span>
            <div class="ptf-task-text">
              <strong>${esc(item.name || `任务 ${index + 1}`)}</strong>
              <span>${esc(item.target || '待补充目标')}</span>
            </div>
          </div>`;
        if(index < orchestrationTasks.length - 1) {
          html += `<div class="ptf-inner-arrow">→</div>`;
        }
      });
    } else {
      html += `<div class="ptf-empty">暂无节点任务</div>`;
    }
    html += `</div></div>`;
  }
  html += `<div class="ptf-outer-arrow">→</div>
    <div class="ptf-se">结束</div>
  </div>`;

  el.innerHTML = html;

  if(onClickMap) {
    for(const [nodeId, handler] of Object.entries(onClickMap)) {
      const nodeEl = el.querySelector(`.ptf-node-frame[data-id="${nodeId}"]`);
      if(nodeEl) {
        nodeEl.style.cursor = 'pointer';
        nodeEl.addEventListener('click', handler);
      }
    }
  }

  el.addEventListener('mousedown', (ev) => {
    if(ev.target.closest('.ptf-node-frame,.ptf-task-item,.ptf-se')) return;
    ev.preventDefault();
    startEfPan(el, ev);
  });

  initZoom(containerId);
  if(ZOOM[containerId] && ZOOM[containerId] !== 1) applyZoom(containerId);
}

function renderNodePerspectiveSwitch() {
  const perspective = S.ui.nodePerspective || 'user';
  return `<div class="node-perspective-switch" data-testid="node-perspective-switch">
    <button
      type="button"
      class="node-perspective-btn ${perspective === 'user' ? 'active' : ''}"
      data-testid="node-perspective-user"
      onclick="setNodePerspective('user')"
    >定义用户步骤</button>
    <button
      type="button"
      class="node-perspective-btn ${perspective === 'engineering' ? 'active' : ''}"
      data-testid="node-perspective-engineering"
      onclick="setNodePerspective('engineering')"
    >节点任务</button>
  </div>`;
}

function renderStepNoteEditor(proc, task, step, index) {
  const editKey = getStepNoteEditKey(proc.id, task.id, index);
  const isEditing = S.ui.stepNoteEditKey === editKey;
  const note = String(step.note || '');
  if (isEditing) {
    return `<div class="step-note-editor" data-testid="step-note-editor">
      ${renderRichTextEditor({
        value: note,
        testIdPrefix: 'step-note-rich-text',
        className: 'step-note',
        placeholder: '备注 / 规则 / 说明 / 链接',
      })}
      <div class="step-note-actions">
        <span class="step-note-tip">支持加粗、编号列表和项目列表；粘贴内容会自动清理为安全格式</span>
        <button class="btn btn-primary btn-sm" type="button" data-testid="step-note-save"
          onclick="saveStepNote('${esc(proc.id)}','${esc(task.id)}',${index},this.closest('.step-note-editor').querySelector('.rich-text-storage').value)">保存</button>
        <button class="btn btn-outline btn-sm" type="button" data-testid="step-note-cancel"
          onclick="cancelStepNoteEdit('${esc(proc.id)}','${esc(task.id)}',${index})">取消</button>
      </div>
    </div>`;
  }
  if (note.trim()) {
    return `<div class="step-note-preview" data-testid="step-note-preview">
      <span class="rich-text-rendered">${renderRichTextValue(note)}</span>
      <button class="btn btn-ghost-sm" type="button" data-testid="step-note-edit"
        onclick="startStepNoteEdit('${esc(proc.id)}','${esc(task.id)}',${index})">修改备注</button>
    </div>`;
  }
  return `<div class="step-note-empty">
    <button class="btn btn-ghost-sm" type="button" data-testid="step-note-add"
      onclick="startStepNoteEdit('${esc(proc.id)}','${esc(task.id)}',${index})">＋备注/规则</button>
  </div>`;
}

function renderUserStepsSection(proc, task) {
  const userSteps = getNodeUserSteps(task);
  return `<div class="form-section node-perspective-panel active" data-testid="user-steps-section">
    <div class="section-toolbar">
      <h4>定义用户步骤 <span class="section-count">${userSteps.length} 项</span></h4>
      <button class="btn btn-outline btn-sm" type="button" onclick="addStep('${esc(proc.id)}','${esc(task.id)}')">＋添加步骤</button>
    </div>
    <p class="section-hint">面向产品视角，描述页面上的查看、点击、填写、提交等用户动作。</p>
    ${userSteps.length ? `<div class="step-list">${userSteps.map((s, i) => `
      <div class="step-row" data-step-index="${i}">
        <div class="step-row-top">
          <span class="step-num">${i + 1}</span>
          <select class="step-type" onchange="onStepTypeChange(this,'${esc(proc.id)}','${esc(task.id)}',${i})">
            ${STEP_TYPES.map((t) => `<option value="${t.value}" ${(t.value === '__other__' ? isCustomStepType(s.type) : s.type === t.value) ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
          ${isCustomStepType(s.type) ? `<input class="step-type-custom" type="text" value="${esc(s.type)}" placeholder="自定义类型"
            oninput="setStep('${esc(proc.id)}','${esc(task.id)}',${i},'type',this.value)">` : ''}
          <textarea class="step-name auto-resize" rows="1" placeholder="步骤描述"
            oninput="setStep('${esc(proc.id)}','${esc(task.id)}',${i},'name',this.value);autoResize(this)"
            >${esc(s.name || '')}</textarea>
          <div class="step-actions">
            <button class="step-action step-add-after" type="button" title="在下方插入步骤" onclick="addStep('${esc(proc.id)}','${esc(task.id)}',${i})">+</button>
            <button class="step-action step-move-up" type="button" title="上移" ${i === 0 ? 'disabled' : ''} onclick="moveStep('${esc(proc.id)}','${esc(task.id)}',${i},-1)">↑</button>
            <button class="step-action step-move-down" type="button" title="下移" ${i === userSteps.length - 1 ? 'disabled' : ''} onclick="moveStep('${esc(proc.id)}','${esc(task.id)}',${i},1)">↓</button>
            <button class="step-del" type="button" onclick="removeStep('${esc(proc.id)}','${esc(task.id)}',${i})">✕</button>
          </div>
        </div>
        ${renderStepNoteEditor(proc, task, s, i)}
      </div>`).join('')}</div>` : '<p class="no-refs">暂无用户操作步骤</p>'}
  </div>`;
}

function renderOrchestrationNoteEditor(proc, task, item, index) {
  const editKey = getOrchestrationNoteEditKey(proc.id, task.id, index);
  const isEditing = S.ui.orchestrationNoteEditKey === editKey;
  const note = String(item.note || '');
  if (isEditing) {
    return `<div class="step-note-editor orchestration-note-editor" data-testid="orchestration-note-editor">
      ${renderRichTextEditor({
        value: note,
        testIdPrefix: 'orchestration-note-rich-text',
        className: 'step-note',
        placeholder: '输入输出 / 前置条件 / 异常处理 / 链接',
      })}
      <div class="step-note-actions">
        <span class="step-note-tip">支持加粗、编号列表和项目列表；粘贴内容会自动清理为安全格式</span>
        <button class="btn btn-primary btn-sm" type="button" data-testid="orchestration-note-save"
          onclick="saveOrchestrationNote('${esc(proc.id)}','${esc(task.id)}',${index},this.closest('.orchestration-note-editor').querySelector('.rich-text-storage').value)">保存</button>
        <button class="btn btn-outline btn-sm" type="button" data-testid="orchestration-note-cancel"
          onclick="cancelOrchestrationNoteEdit('${esc(proc.id)}','${esc(task.id)}',${index})">取消</button>
      </div>
    </div>`;
  }
  if (note.trim()) {
    return `<div class="step-note-preview orchestration-note-preview" data-testid="orchestration-note-preview">
      <span class="rich-text-rendered">${renderRichTextValue(note)}</span>
      <button class="btn btn-ghost-sm" type="button" data-testid="orchestration-note-edit"
        onclick="startOrchestrationNoteEdit('${esc(proc.id)}','${esc(task.id)}',${index})">修改备注</button>
    </div>`;
  }
  return `<div class="step-note-empty orchestration-note-empty">
    <button class="btn btn-ghost-sm" type="button" data-testid="orchestration-note-add"
      onclick="startOrchestrationNoteEdit('${esc(proc.id)}','${esc(task.id)}',${index})">＋备注</button>
  </div>`;
}

function renderOrchestrationSection(proc, task) {
  const orchestrationTasks = getNodeOrchestrationTasks(task);
  const reuseFilter = getOrchestrationReuseFilter(proc.id, task.id);
  const allReusableTasks = getReusableOrchestrationTaskItems(proc.id, task.id);
  const capabilityOptions = Array.from(new Map(allReusableTasks.map((item) => [item.capabilityId, item.capabilityName])).entries())
    .sort((left, right) => left[1].localeCompare(right[1], 'zh-CN'));
  const capabilityFilteredTasks = reuseFilter.capabilityId
    ? allReusableTasks.filter((item) => item.capabilityId === reuseFilter.capabilityId)
    : allReusableTasks;
  const constructOptions = Array.from(new Map(capabilityFilteredTasks.map((item) => [item.constructId, item.constructName])).entries())
    .sort((left, right) => left[1].localeCompare(right[1], 'zh-CN'));
  const activeConstructId = constructOptions.some(([id]) => id === reuseFilter.constructId) ? reuseFilter.constructId : '';
  const reusableTasks = getReusableOrchestrationTaskItems(proc.id, task.id, {
    capabilityId: reuseFilter.capabilityId,
    constructId: activeConstructId,
    query: reuseFilter.query,
  });
  const reuseSelectId = `orch-reuse-${String(task.id || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const visibleReusableTasks = reusableTasks.slice(0, 120);
  const reuseDisabled = !visibleReusableTasks.length;
  return `<div class="form-section node-perspective-panel active" data-testid="orchestration-section">
    <div class="section-toolbar">
      <h4>节点任务 <span class="section-count">${orchestrationTasks.length} 项</span></h4>
      <div class="orch-toolbar-actions">
        <button class="btn btn-outline btn-sm" type="button" data-testid="orchestration-task-manager-button"
          onclick="openTaskDefinitionManager()">管理任务定义</button>
      </div>
    </div>
    <div class="orch-reuse-block" data-testid="orchestration-reuse-block">
      <div class="orch-block-head">
        <strong>复用已有任务</strong>
        <span>从业务组件 / 业务构件中选择已有任务，加入当前节点编排。</span>
        <button class="btn btn-outline btn-sm" type="button" data-testid="orchestration-define-new-task"
          onclick="defineTaskDefinitionForNode('${esc(proc.id)}','${esc(task.id)}')">去定义新任务</button>
      </div>
      <div class="orch-reuse-panel" data-testid="orchestration-reuse-panel">
        <select data-testid="orchestration-reuse-capability-select" aria-label="选择业务组件"
          onchange="setOrchestrationReuseFilter('${esc(proc.id)}','${esc(task.id)}','capabilityId',this.value)" ${allReusableTasks.length ? '' : 'disabled'}>
          <option value="">全部业务组件</option>
          ${capabilityOptions.map(([id, name]) => `<option value="${esc(id)}" ${reuseFilter.capabilityId === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}
        </select>
        <select data-testid="orchestration-reuse-construct-select" aria-label="选择业务构件"
          onchange="setOrchestrationReuseFilter('${esc(proc.id)}','${esc(task.id)}','constructId',this.value)" ${capabilityFilteredTasks.length ? '' : 'disabled'}>
          <option value="">全部业务构件</option>
          ${constructOptions.map(([id, name]) => `<option value="${esc(id)}" ${activeConstructId === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}
        </select>
        <input type="search" data-testid="orchestration-reuse-search" aria-label="搜索任务定义"
          value="${esc(reuseFilter.query)}" placeholder="搜索任务名称 / 服务 / 备注"
          oninput="setOrchestrationReuseFilter('${esc(proc.id)}','${esc(task.id)}','query',this.value)" ${allReusableTasks.length ? '' : 'disabled'}>
        <select id="${esc(reuseSelectId)}" data-testid="orchestration-reuse-select" aria-label="选择任务定义" ${reuseDisabled ? 'disabled' : ''}>
          <option value="">选择任务...</option>
          ${visibleReusableTasks.map((item) => `<option value="${esc(item.key)}">${esc(item.label)}</option>`).join('')}
        </select>
        <button class="btn btn-outline btn-sm" type="button" data-testid="orchestration-reuse-button" ${reuseDisabled ? 'disabled' : ''}
          onclick="reuseOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',document.getElementById('${esc(reuseSelectId)}').value)">加入节点</button>
        ${reusableTasks.length > visibleReusableTasks.length ? `<span class="orch-reuse-more">还有 ${reusableTasks.length - visibleReusableTasks.length} 项，继续搜索缩小范围</span>` : ''}
      </div>
    </div>
    <div class="orch-compose-head" data-testid="orchestration-compose-head">
      <strong>当前节点任务编排</strong>
      <span>行尾按钮用于插入、上移、下移或移出当前节点。</span>
    </div>
    ${buildOrchestrationFlowHtml(task)}
    ${orchestrationTasks.length ? `<div class="orch-list">${orchestrationTasks.map((item, index) => `
      <div class="orch-card" data-orch-index="${index}">
        <div class="orch-row orch-row-main">
          <span class="orch-index">${index + 1}</span>
          <input class="orch-name" type="text" value="${esc(item.name || '')}" placeholder="如：校验账户状态"
            oninput="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'name',this.value)">
          <select onchange="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'type',this.value);rerenderProcessEditor()">
            ${ORCHESTRATION_TYPES.map((option) => `<option value="${option.value}" ${item.type === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
          <select data-testid="orchestration-task-capability-select"
            onchange="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'businessComponentId',this.value);rerenderProcessEditor({ focusSelector: '.orch-card[data-orch-index=&quot;${index}&quot;] [data-testid=&quot;orchestration-task-capability-select&quot;]', selectText: false })">
            ${renderTaskCapabilityOptions(item.businessComponentId || '')}
          </select>
          <select data-testid="orchestration-task-construct-select"
            onchange="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'constructId',this.value);rerenderProcessEditor({ focusSelector: '.orch-card[data-orch-index=&quot;${index}&quot;] [data-testid=&quot;orchestration-task-construct-select&quot;]', selectText: false })">
            ${renderTaskConstructOptionsForCapability(item.constructId || item.businessConstructId || '', item.businessComponentId || '')}
          </select>
          <div class="step-actions orch-actions">
            <button class="step-action" type="button" title="在下方定义并加入任务" onclick="defineTaskDefinitionForNode('${esc(proc.id)}','${esc(task.id)}',${index})">+</button>
            <button class="step-action" type="button" title="上移" ${index === 0 ? 'disabled' : ''} onclick="moveOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},-1)">↑</button>
            <button class="step-action" type="button" title="下移" ${index === orchestrationTasks.length - 1 ? 'disabled' : ''} onclick="moveOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},1)">↓</button>
            <button class="step-del" type="button" onclick="removeOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index})">✕</button>
          </div>
        </div>
        <div class="orch-row orch-row-secondary">
          ${item.type === 'Query' ? `<select onchange="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'querySourceKind',this.value)">
            ${QUERY_SOURCE_KINDS.map((option) => `<option value="${option.value}" ${item.querySourceKind === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>` : ''}
          <label class="orch-tech-field ${item.type === 'Query' ? '' : 'orch-tech-field-wide'}">
            <span>技术承接</span>
            <input type="text" data-testid="orchestration-task-target-input" value="${esc(item.target || '')}" placeholder="目标服务 / 字典 / 枚举"
              oninput="setOrchestrationTask('${esc(proc.id)}','${esc(task.id)}',${index},'target',this.value)">
          </label>
        </div>
        ${renderOrchestrationNoteEditor(proc, task, item, index)}
      </div>`).join('')}</div>` : '<p class="no-refs">暂无节点任务</p>'}
  </div>`;
}

function renderTaskFormEntityOptions(selectedEntityId) {
  const entities = S.doc?.entities || [];
  return `<option value="">不绑定实体</option>${entities.map((entity) => (
    `<option value="${esc(entity.id)}" ${entity.id === selectedEntityId ? 'selected' : ''}>${esc(entity.name || '未命名实体')}</option>`
  )).join('')}`;
}

function renderTaskFormFieldOptions(form, section, selectedFieldName) {
  const fields = getEntityFieldsForFormSection(section, form);
  if (!String(section?.entity_id || form?.entity_id || '').trim()) return '<option value="">先绑定实体</option>';
  if (!fields.length) return '<option value="">实体暂无字段</option>';
  return `<option value="">不映射</option>${fields.map((field) => {
    const fieldName = String(field.name || '').trim();
    return `<option value="${esc(fieldName)}" ${fieldName === selectedFieldName ? 'selected' : ''}>${esc(fieldName)}</option>`;
  }).join('')}`;
}

function renderTaskFormFieldRow(proc, task, form, section, field, fieldIndex) {
  const fieldOptions = renderTaskFormFieldOptions(form, section, field.entity_field || '');
  const sectionEntityId = String(section?.entity_id || form?.entity_id || '').trim();
  const entityFieldDisabled = !sectionEntityId || !getEntityFieldsForFormSection(section, form).length ? 'disabled' : '';
  const fieldCount = (section.fields || []).length;
  return `<tr class="task-form-field-row" data-testid="task-form-field-row" data-field-id="${esc(field.id)}">
    <td>
      <input type="text" data-testid="task-form-field-name" data-field-id="${esc(field.id)}"
        value="${esc(field.name || '')}" placeholder="字段名称"
        oninput="setTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}','name',this.value)">
    </td>
    <td>
      <select data-testid="task-form-field-type" data-field-id="${esc(field.id)}"
        onchange="setTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}','type',this.value)">
        ${FORM_FIELD_TYPES.map((type) => `<option value="${type.value}" ${field.type === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}
      </select>
    </td>
    <td class="task-form-required-cell">
      <input type="checkbox" data-testid="task-form-field-required" data-field-id="${esc(field.id)}" ${field.required ? 'checked' : ''}
        onchange="setTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}','required',this.checked)">
    </td>
    <td>
      <select data-testid="task-form-entity-field" data-field-id="${esc(field.id)}" ${entityFieldDisabled}
        onchange="setTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}','entity_field',this.value)">
        ${fieldOptions}
      </select>
    </td>
    <td>
      <textarea class="auto-resize" rows="1" data-testid="task-form-field-note" data-field-id="${esc(field.id)}"
        placeholder="校验规则 / 展示说明"
        oninput="setTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}','note',this.value);autoResize(this)"
        >${esc(field.note || '')}</textarea>
    </td>
    <td class="task-form-action-cell">
      <div class="step-actions task-form-inline-actions">
        <button class="step-action" type="button" data-testid="task-form-field-add-after" title="在下方插入字段"
          onclick="addTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}')">+</button>
        <button class="step-action" type="button" data-testid="task-form-field-move-up" title="上移" ${fieldIndex === 0 ? 'disabled' : ''}
          onclick="moveTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}',-1)">↑</button>
        <button class="step-action" type="button" data-testid="task-form-field-move-down" title="下移" ${fieldIndex === fieldCount - 1 ? 'disabled' : ''}
          onclick="moveTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}',1)">↓</button>
        <button class="step-del" type="button" data-testid="task-form-field-delete" title="删除字段"
        onclick="removeTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','${esc(field.id)}')">✕</button>
      </div>
    </td>
  </tr>`;
}

function renderTaskFormSectionCard(proc, task, form, section, sectionIndex) {
  const fields = section.fields || [];
  const onlySection = (form.sections || []).length <= 1;
  return `<div class="task-form-section-card" data-testid="task-form-section-card" data-section-id="${esc(section.id)}">
    <div class="task-form-section-head">
      <input type="text" data-testid="task-form-section-name" data-section-id="${esc(section.id)}"
        value="${esc(section.name || '')}" placeholder="分组名称，如：基本信息"
        oninput="setTaskFormSection('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','name',this.value)">
      <input type="text" data-testid="task-form-section-note" data-section-id="${esc(section.id)}"
        value="${esc(section.note || '')}" placeholder="分组说明"
        oninput="setTaskFormSection('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','note',this.value)">
      <select data-testid="task-form-section-entity" data-section-id="${esc(section.id)}"
        onchange="setTaskFormSection('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}','entity_id',this.value);rerenderProcessEditor({focusSelector:'[data-testid=&quot;task-form-section-entity&quot;][data-section-id=&quot;${esc(section.id)}&quot;]'})">
        ${renderTaskFormEntityOptions(section.entity_id || form.entity_id || '')}
      </select>
      <button class="btn btn-outline btn-sm" type="button" data-testid="task-form-field-add"
        onclick="addTaskFormField('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}')">＋字段</button>
      <div class="step-actions task-form-inline-actions">
        <button class="step-action" type="button" data-testid="task-form-section-add-after" title="在下方插入分组"
          onclick="addTaskFormSection('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}')">+</button>
        <button class="step-action" type="button" data-testid="task-form-section-move-up" title="上移" ${sectionIndex === 0 ? 'disabled' : ''}
          onclick="moveTaskFormSection('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}',-1)">↑</button>
        <button class="step-action" type="button" data-testid="task-form-section-move-down" title="下移" ${sectionIndex === (form.sections || []).length - 1 ? 'disabled' : ''}
          onclick="moveTaskFormSection('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}',1)">↓</button>
        <button class="step-del" type="button" data-testid="task-form-section-delete" title="删除分组" ${onlySection ? 'disabled' : ''}
          onclick="removeTaskFormSection('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','${esc(section.id)}')">✕</button>
      </div>
    </div>
    ${fields.length ? `<div class="task-form-field-table-wrap">
      <table class="task-form-field-table">
        <thead><tr><th>字段</th><th>类型</th><th>必填</th><th>实体字段</th><th>说明</th><th></th></tr></thead>
        <tbody>${fields.map((field, fieldIndex) => renderTaskFormFieldRow(proc, task, form, section, field, fieldIndex)).join('')}</tbody>
      </table>
    </div>` : `<p class="no-refs task-form-empty">分组 ${sectionIndex + 1} 暂无字段</p>`}
  </div>`;
}

function renderTaskFormCard(proc, task, form, index) {
  return `<div class="task-form-card" data-testid="task-form-card" data-form-id="${esc(form.id)}">
    <div class="task-form-card-head">
      <span class="task-form-index">F${index + 1}</span>
      <input type="text" data-testid="task-form-name" data-form-id="${esc(form.id)}"
        value="${esc(form.name || '')}" placeholder="表单名称，如：仓库管理列表"
        oninput="setTaskForm('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','name',this.value)">
      <span class="task-form-entity-summary" data-testid="task-form-entity-summary">${esc(getTaskFormEntitySummary(form))}</span>
      <button class="step-del" type="button" data-testid="task-form-delete" title="删除表单"
        onclick="removeTaskForm('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}')">✕</button>
    </div>
    <input class="task-form-purpose" type="text" data-testid="task-form-purpose" data-form-id="${esc(form.id)}"
      value="${esc(form.purpose || '')}" placeholder="表单用途，如：筛选、列表、新增、详情、输出说明"
      oninput="setTaskForm('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}','purpose',this.value)">
    <div class="task-form-sections">
      ${(form.sections || []).map((section, sectionIndex) => renderTaskFormSectionCard(proc, task, form, section, sectionIndex)).join('')}
    </div>
    <button class="btn btn-ghost-sm task-form-section-add" type="button" data-testid="task-form-section-add"
      onclick="addTaskFormSection('${esc(proc.id)}','${esc(task.id)}','${esc(form.id)}')">＋添加分组</button>
  </div>`;
}

function renderTaskFormsSection(proc, task) {
  const forms = getTaskForms(task);
  return `<div class="form-section task-forms-section" data-testid="task-forms-section">
    <div class="section-toolbar">
      <h4>表单模型 <span class="section-count">${forms.length} 个表单</span></h4>
      <button class="btn btn-outline btn-sm" type="button" data-testid="task-form-add"
        onclick="addTaskForm('${esc(proc.id)}','${esc(task.id)}')">＋添加表单</button>
    </div>
    <p class="section-hint">表单是节点办理时看到或填写的界面载体；实体是沉淀后的业务数据。一个节点可绑定多个表单，表单字段可按需映射到实体字段。</p>
    ${forms.length ? `<div class="task-form-list">${forms.map((form, index) => renderTaskFormCard(proc, task, form, index)).join('')}</div>` : '<p class="no-refs">暂无表单模型</p>'}
  </div>`;
}

function renderTaskBusinessRuleCard(proc, task, rule, index, total) {
  const editKey = getTaskBusinessRuleEditKey(proc.id, task.id, rule.id);
  const isEditingContent = S.ui.businessRuleEditKey === editKey;
  const hasContent = String(rule.content || '').trim();
  return `<div class="task-rule-card" data-rule-id="${esc(rule.id)}">
    <div class="task-rule-head">
      <span class="task-form-index">${index + 1}</span>
      <input type="text" data-testid="task-rule-name" data-rule-id="${esc(rule.id)}"
        value="${esc(rule.name || '')}" placeholder="规则名称，如：前置条件 / 输出 / 交互规则"
        oninput="setTaskBusinessRule('${esc(proc.id)}','${esc(task.id)}','${esc(rule.id)}','name',this.value)">
      <div class="task-form-inline-actions">
        <button class="step-action" type="button" title="上移" ${index === 0 ? 'disabled' : ''}
          onclick="moveTaskBusinessRule('${esc(proc.id)}','${esc(task.id)}','${esc(rule.id)}',-1)">↑</button>
        <button class="step-action" type="button" title="下移" ${index >= total - 1 ? 'disabled' : ''}
          onclick="moveTaskBusinessRule('${esc(proc.id)}','${esc(task.id)}','${esc(rule.id)}',1)">↓</button>
        <button class="step-del" type="button"
          onclick="removeTaskBusinessRule('${esc(proc.id)}','${esc(task.id)}','${esc(rule.id)}')">删除</button>
      </div>
    </div>
    ${isEditingContent ? `
      ${renderRichTextEditor({
        value: rule.content || '',
        testIdPrefix: 'task-rule-rich-text',
        className: 'task-rule-content',
        placeholder: '规则内容可多行记录，适合沉淀输入、输出、前置条件、后置条件、交互规则等',
      })}
      <div class="task-rule-content-actions">
        <span class="task-rule-draft-hint">编辑后点击保存才会同步到模型和预览。</span>
        <button class="btn btn-primary btn-sm" type="button" data-testid="task-rule-content-save"
          onclick="saveTaskBusinessRuleContent('${esc(proc.id)}','${esc(task.id)}','${esc(rule.id)}',this.closest('.task-rule-card').querySelector('.rich-text-storage').value)">保存</button>
        <button class="btn btn-ghost-sm" type="button" data-testid="task-rule-content-cancel"
          onclick="cancelTaskBusinessRuleContentEdit('${esc(proc.id)}','${esc(task.id)}','${esc(rule.id)}')">取消</button>
      </div>
    ` : `
      <div class="task-rule-content-preview" data-testid="task-rule-content-preview">
        ${hasContent ? `<div class="rich-text-rendered">${renderRichTextValue(rule.content || '')}</div>` : '<span class="task-rule-empty-content">暂无规则内容</span>'}
        <button class="btn btn-outline btn-sm" type="button" data-testid="task-rule-content-edit"
          onclick="startTaskBusinessRuleContentEdit('${esc(proc.id)}','${esc(task.id)}','${esc(rule.id)}')">编辑内容</button>
      </div>
    `}
  </div>`;
}

function renderTaskBusinessRulesSection(proc, task) {
  const rules = getNodeBusinessRules(task);
  return `<div class="form-section task-rules-section" data-testid="task-business-rules-section">
    <div class="section-toolbar">
      <h4>业务规则 <span class="section-count">${rules.length} 条规则</span></h4>
      <div class="task-rule-actions">
        <button class="btn btn-ghost-sm" type="button" data-testid="task-rule-templates"
          onclick="ensureTaskBusinessRuleTemplates('${esc(proc.id)}','${esc(task.id)}')">补常用项</button>
        <button class="btn btn-outline btn-sm" type="button" data-testid="task-rule-add"
          onclick="addTaskBusinessRule('${esc(proc.id)}','${esc(task.id)}')">＋添加规则</button>
      </div>
    </div>
    <p class="section-hint">用于结构化沉淀前置条件、后置条件、输入、输出、交互规则、非功能需求等，也可以自定义规则名称。</p>
    ${rules.length
      ? `<div class="task-rule-list">${rules.map((rule, index) => renderTaskBusinessRuleCard(proc, task, rule, index, rules.length)).join('')}</div>`
      : '<p class="no-refs">暂无业务规则</p>'}
  </div>`;
}

/* ═══════════════════════════════════════════════════════════
   RENDER — Process Tab  (上：实时图 | 下：编辑)
═══════════════════════════════════════════════════════════ */
function getProcessPanoramaContexts(proc, doc = S.doc) {
  const processId = String(proc?.id || '').trim();
  if (!processId) return [];
  const stageRefs = getProcessStageRefs(processId, doc);
  const stages = getStages(doc);
  const stageById = new Map(stages.map((stage, index) => [String(stage.id || '').trim(), { stage, index }]));
  const panorama = getPanoramaModel(doc);
  const columns = Array.isArray(panorama?.columns) ? panorama.columns : [];
  const lanes = Array.isArray(panorama?.lanes) ? panorama.lanes : [];
  const columnById = new Map(columns.map((column, index) => [String(column.id || '').trim(), { column, index }]));
  const laneById = new Map(lanes.map((lane, index) => [String(lane.id || '').trim(), { lane, index }]));
  const contexts = [];

  for (const ref of stageRefs) {
    const stageEntry = stageById.get(String(ref.stageId || '').trim());
    if (!stageEntry?.stage || stageEntry.stage.id === UNASSIGNED_STAGE_ID) continue;
    const stage = stageEntry.stage;
    const columnEntry = columnById.get(String(stage.panoramaColumnUid || '').trim());
    const laneEntry = laneById.get(String(stage.panoramaLaneUid || '').trim());
    const hasPanoramaPosition = Boolean(columnEntry?.column && laneEntry?.lane);
    const laneName = String(laneEntry?.lane?.name || '').trim();
    const columnName = String(columnEntry?.column?.name || '').trim();
    contexts.push({
      key: hasPanoramaPosition
        ? `panorama:${laneEntry.lane.id}:${columnEntry.column.id}:stage:${stage.id}`
        : `stage-unclassified:${stage.id}`,
      title: hasPanoramaPosition ? `${laneName || '未命名业务域'} / ${columnName || '未命名价值流'}` : '未归类阶段',
      subtitle: `阶段：${String(stage.name || '未命名阶段').trim() || '未命名阶段'}`,
      sortKey: [
        hasPanoramaPosition ? 0 : 1,
        laneEntry?.index ?? 9999,
        columnEntry?.index ?? 9999,
        stageEntry.index,
        ref.order ?? 9999,
      ],
    });
  }

  if (!contexts.length) {
    contexts.push({
      key: 'process-unassigned-stage',
      title: '未放入阶段',
      subtitle: '流程尚未归入任何阶段',
      sortKey: [2, 9999, 9999, 9999, 9999],
    });
  }

  return contexts;
}

function buildRoleProcessContextGroups(processes, doc = S.doc) {
  const groupMap = new Map();
  for (const proc of processes) {
    const contexts = getProcessPanoramaContexts(proc, doc);
    for (const context of contexts) {
      if (!groupMap.has(context.key)) {
        groupMap.set(context.key, {
          key: context.key,
          name: context.title,
          subtitle: context.subtitle,
          sortKey: context.sortKey,
          items: [],
          processIds: new Set(),
        });
      }
      const group = groupMap.get(context.key);
      const procId = String(proc.id || '').trim();
      if (!group.processIds.has(procId)) {
        group.processIds.add(procId);
        group.items.push(proc);
      }
    }
  }
  return Array.from(groupMap.values())
    .sort((left, right) => {
      for (let index = 0; index < Math.max(left.sortKey.length, right.sortKey.length); index += 1) {
        const diff = (left.sortKey[index] ?? 0) - (right.sortKey[index] ?? 0);
        if (diff) return diff;
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN');
    })
    .map((group) => {
      group.items.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hans-CN'));
      delete group.processIds;
      return group;
    });
}

function getProcessRoleContextLabel(proc) {
  const context = getProcessPanoramaContexts(proc)[0];
  if (!context) return '';
  if (context.title === '未放入阶段') return context.title;
  return `${context.title} · ${context.subtitle.replace(/^阶段：/, '')}`;
}

function buildRoleUsecaseMap(selectedRole, options = {}) {
  const readonly = Boolean(options.readonly);
  const usageByProcess = selectedRole ? getRoleUsageByProcess(selectedRole.id) : new Map();
  const participatingOnly = Boolean(options.participatingOnly && selectedRole);
  const roleGroups = participatingOnly
    ? [{ name: getRoleGroupName(selectedRole), roles: [selectedRole] }]
    : getGroupedRoles();
  const processes = participatingOnly
    ? Array.from(usageByProcess.values()).map(({ proc }) => proc)
    : (S.doc?.processes || []);
  const processGroups = buildRoleProcessContextGroups(processes);

  const roleFrames = [];
  const roleNodes = [];
  let roleY = 24;
  for(const group of roleGroups) {
    const frameHeight = 48 + group.roles.length * 46;
    roleFrames.push({ name: group.name, x: 24, y: roleY, width: 250, height: frameHeight });
    group.roles.forEach((role, index) => {
      roleNodes.push({
        role,
        x: 42,
        y: roleY + 34 + index * 42,
        width: 214,
        height: 32,
      });
    });
    roleY += frameHeight + 18;
  }

  const processFrames = [];
  const processNodes = [];
  const columnX = [340, 650];
  const columnHeights = [24, 24];
  for(const group of processGroups) {
    const frameHeight = 72 + group.items.length * 40;
    const columnIndex = columnHeights[0] <= columnHeights[1] ? 0 : 1;
    const frameX = columnX[columnIndex];
    const frameY = columnHeights[columnIndex];
    processFrames.push({ name: group.name, subtitle: group.subtitle, x: frameX, y: frameY, width: 270, height: frameHeight });
    group.items.forEach((proc, index) => {
      processNodes.push({
        proc,
        groupKey: group.key,
        x: frameX + 18,
        y: frameY + 54 + index * 36,
        width: 234,
        height: 28,
      });
    });
    columnHeights[columnIndex] += frameHeight + 18;
  }

  const canvasHeight = Math.max(roleY, ...columnHeights) + 24;
  const selectedNode = selectedRole ? roleNodes.find((node) => node.role.id === selectedRole.id) : null;

  const lines = selectedNode ? processNodes
    .filter((node) => usageByProcess.has(node.proc.id))
    .map((node) => {
      const taskCount = usageByProcess.get(node.proc.id).tasks.length;
      const startX = selectedNode.x + selectedNode.width;
      const startY = selectedNode.y + selectedNode.height / 2;
      const endX = node.x;
      const endY = node.y + node.height / 2;
      const midX = startX + (endX - startX) / 2;
      return {
        path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`,
        taskCount,
        labelX: midX + 4,
        labelY: endY - 6,
      };
    })
    : [];

  return `<div class="role-usecase-map-wrap${participatingOnly ? ' focused' : ''}" data-testid="role-usecase-map">
    <div class="role-usecase-map-canvas" style="min-width:980px;height:${canvasHeight}px">
      <svg class="role-usecase-map-svg" width="980" height="${canvasHeight}" viewBox="0 0 980 ${canvasHeight}" preserveAspectRatio="none">
        ${lines.map((line) => `
          <path d="${line.path}" class="role-usecase-line"></path>
          <text x="${line.labelX}" y="${line.labelY}" class="role-usecase-line-label">${line.taskCount}N</text>
        `).join('')}
      </svg>
      ${roleFrames.map((frame) => `
        <div class="role-usecase-group role-side-group" style="left:${frame.x}px;top:${frame.y}px;width:${frame.width}px;height:${frame.height}px">
          <div class="role-usecase-group-title">${esc(frame.name)}</div>
        </div>
      `).join('')}
      ${processFrames.map((frame) => `
        <div class="role-usecase-group role-proc-group" style="left:${frame.x}px;top:${frame.y}px;width:${frame.width}px;height:${frame.height}px">
          <div class="role-usecase-group-title">
            <span>${esc(frame.name)}</span>
            ${frame.subtitle ? `<small>${esc(frame.subtitle)}</small>` : ''}
          </div>
        </div>
      `).join('')}
      ${roleNodes.map((node) => {
        const active = selectedRole?.id === node.role.id ? ' active' : '';
        const usage = getRoleUsageSummary(node.role.id);
        const tagName = readonly ? 'div' : 'button';
        const actionAttr = readonly ? '' : ` type="button" onclick="S.ui.roleId='${esc(node.role.id)}';renderProcessTab()"`;
        return `<${tagName} class="role-usecase-role${active}${readonly ? ' readonly' : ''}" data-role-id="${esc(node.role.id)}"
          style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"${actionAttr}>
          <span class="role-usecase-role-name">${esc(node.role.name)}</span>
          <span class="role-usecase-role-meta">${usage.processCount}P · ${usage.taskCount}N</span>
        </${tagName}>`;
      }).join('')}
      ${processNodes.map((node) => {
        const linked = usageByProcess.has(node.proc.id) ? ' linked' : '';
        const taskCount = usageByProcess.has(node.proc.id) ? usageByProcess.get(node.proc.id).tasks.length : 0;
        const tagName = readonly ? 'div' : 'button';
        const actionAttr = readonly ? '' : ` type="button" onclick="navigate('process',{procId:'${esc(node.proc.id)}',taskId:null})"`;
        return `<${tagName} class="role-usecase-process${linked}${readonly ? ' readonly' : ''}" data-process-id="${esc(node.proc.id)}"
          style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px"${actionAttr}>
          <span class="role-usecase-process-name">${esc(node.proc.name || '未命名流程')}</span>
          ${taskCount ? `<span class="role-usecase-process-count">${taskCount}N</span>` : ''}
        </${tagName}>`;
      }).join('')}
    </div>
  </div>`;
}

function renderProcessRoleView() {
  const roles = getRoles();
  ensureSelectedRole();
  const selectedRole = getRoleById(S.ui.roleId);
  if(!roles.length) {
    return `<div class="proc-role-empty" data-testid="process-role-view">
      <p>暂无角色词典，请先到业务域页新增角色。</p>
      <button class="btn btn-outline btn-sm" onclick="navigate('domain')">前往角色管理</button>
    </div>`;
  }

  const usageByProcess = selectedRole ? getRoleUsageByProcess(selectedRole.id) : new Map();
  const selectedSummary = selectedRole ? getRoleUsageSummary(selectedRole.id) : { processCount: 0, taskCount: 0 };
  const participatingOnly = Boolean(S.ui.roleParticipatingOnly);

  const detail = selectedRole ? `
    <div class="proc-role-detail-head">
      <div>
        <div class="proc-role-detail-title">${esc(selectedRole.name)}</div>
        <div class="proc-role-detail-subtitle">${selectedRole.desc ? esc(selectedRole.desc) : '当前角色参与的流程与节点'} · 分组：${esc(getRoleGroupName(selectedRole))}</div>
      </div>
      <div class="proc-role-detail-badges">
        <span class="proc-role-badge">流程 ${selectedSummary.processCount}</span>
        <span class="proc-role-badge">节点 ${selectedSummary.taskCount}</span>
      </div>
    </div>
    ${usageByProcess.size ? Array.from(usageByProcess.values()).map(({ proc, tasks }) => `
      <div class="proc-role-usage-card">
        <div class="proc-role-usage-head">
          <div>
            <span class="proc-role-usage-proc">${esc(proc.name || '未命名流程')}</span>
            ${getProcessRoleContextLabel(proc) ? `<span class="proc-role-usage-subdomain">${esc(getProcessRoleContextLabel(proc))}</span>` : ''}
          </div>
          <button class="btn btn-ghost-sm" onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:null})">查看流程</button>
        </div>
        <div class="proc-role-task-list">
          ${tasks.map((task, index) => {
            const nodeTaskCount = getNodeOrchestrationTasks(task).length;
            const nodeName = String(task.name || '').trim() || `未命名节点 ${index + 1}`;
            return `<button class="role-task-chip" data-testid="role-view-task-chip"
            onclick="navigate('process',{procId:'${esc(proc.id)}',taskId:'${esc(task.id)}'})">
            ${esc(nodeName)}${nodeTaskCount ? ` · ${nodeTaskCount} 任务` : ''}
          </button>`;
          }).join('')}
        </div>
      </div>
    `).join('') : '<p class="no-refs">当前角色尚未被任何节点引用</p>'}
  ` : '<p class="no-refs">请选择一个角色查看参与的流程</p>';

  return `<div class="proc-role-view" data-testid="process-role-view">
    <div class="proc-role-map-panel">
      <div class="proc-role-map-head">
        <div class="proc-role-map-title">
          角色用例图
          <span class="inline-help" tabindex="0" data-tip="全局展示角色参与的流程模板。点击左侧角色可高亮它参与的流程，点击流程可进入编辑。">?</span>
        </div>
        <div class="proc-role-map-tools">
          ${selectedRole ? `<label class="role-focus-toggle">
            <input type="checkbox" data-testid="role-participating-only-toggle"
              ${participatingOnly ? 'checked' : ''}
              onchange="S.ui.roleParticipatingOnly=this.checked;renderProcessTab()">
            <span>只看参与流程</span>
          </label>` : ''}
          ${selectedRole ? `<div class="proc-role-map-focus" data-testid="role-projection-summary">当前角色：${esc(selectedRole.name)} · 涉及流程 ${selectedSummary.processCount} · 涉及节点 ${selectedSummary.taskCount}${participatingOnly ? ' · 只显示参与流程' : ' · 全局视图'}</div>` : ''}
        </div>
      </div>
      ${buildRoleUsecaseMap(selectedRole, { participatingOnly })}
    </div>
    <div class="proc-role-detail">${detail}</div>
  </div>`;
}

function getFirstRoleIdForProcess(proc) {
  if (!proc) return '';
  for (const node of getProcNodes(proc)) {
    const roleId = getTaskRoleIds(node)[0];
    if (roleId && getRoleById(roleId)) return roleId;
  }
  return '';
}

function openRoleProjection() {
  const roleId = getFirstRoleIdForProcess(currentProc());
  if (roleId) S.ui.roleId = roleId;
  setProcView('role');
}

function getDefaultTaskIdForProc(proc, preferredTaskId = S.ui.taskId) {
  const nodes = getProcNodes(proc);
  if (!nodes.length) return null;
  if (preferredTaskId && nodes.some((node) => node.id === preferredTaskId)) return preferredTaskId;
  return nodes[0].id;
}

function openProcessFlowView(navOptions = {}) {
  const proc = currentProc() || S.doc?.processes?.[0] || null;
  const taskId = getProcessFlowShowTasks() ? getDefaultTaskIdForProc(proc) : null;
  queueUiNavigationHistoryFor((next) => {
    next.tab = 'process';
    next.procView = 'flow';
    next.procId = proc?.id || null;
    next.taskId = taskId;
    return next;
  }, navOptions);
  S.ui.tab = 'process';
  S.ui.procView = 'flow';
  S.ui.procId = proc?.id || null;
  S.ui.taskId = taskId;
  render();
}

function selectProcessFlow(procId) {
  const proc = (S.doc?.processes || []).find((item) => item.id === procId) || S.doc?.processes?.[0] || null;
  S.ui.procId = proc?.id || null;
  S.ui.taskId = getProcessFlowShowTasks() ? getDefaultTaskIdForProc(proc, null) : null;
  S.ui.procView = 'flow';
  renderProcessTab();
}

function closeProcessEditor() {
  if (!S.ui.procId && S.doc?.processes?.length) {
    S.ui.procId = S.doc.processes[0].id;
  }
  S.ui.procView = 'flow';
  const proc = currentProc() || S.doc?.processes?.[0] || null;
  S.ui.taskId = getProcessFlowShowTasks() ? getDefaultTaskIdForProc(proc, null) : null;
  renderProcessTab();
}

function toggleTaskLevel() {
  S.ui.procTasklevelCollapsed = !S.ui.procTasklevelCollapsed;
  renderProcessTab();
}

function renderProcessZoomControls(containerId, primary = false) {
  const prefix = primary ? ' data-testid="process-flow-' : '';
  const suffix = primary ? '"' : '';
  return `<div class="diagram-floating-tools">
    <div class="zoom-controls">
      <button class="zoom-btn" type="button"${prefix}zoom-in${suffix} onclick="zoomBy('${containerId}',0.2)">＋</button>
      <button class="zoom-btn" type="button"${prefix}zoom-reset${suffix} onclick="resetZoom('${containerId}')">◎</button>
      <button class="zoom-btn" type="button"${prefix}zoom-out${suffix} onclick="zoomBy('${containerId}',-0.2)">－</button>
    </div>
  </div>`;
}

function renderProcessSummaryHelpPanel() {
  const card = (title, desc, svg) => `<div class="summary-help-card" data-testid="process-summary-help-card">
    <strong>${esc(title)}</strong>
    <span>${esc(desc)}</span>
    <svg viewBox="0 0 360 116" aria-hidden="true">
      <defs>
        <marker id="summary-help-arrow" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,4 L0,8 Z" fill="#64748b"></path>
        </marker>
      </defs>
      ${svg}
    </svg>
  </div>`;
  const node = (x, y, text, cls = '') => `<rect class="msh-node ${cls}" x="${x}" y="${y}" width="74" height="34" rx="7"></rect><text class="msh-node-text" x="${x + 37}" y="${y + 21}">${esc(text)}</text>`;
  const end = (x, y, text) => `<rect class="msh-boundary" x="${x}" y="${y}" width="58" height="30" rx="15"></rect><text class="msh-node-text" x="${x + 29}" y="${y + 19}">${esc(text)}</text>`;
  const line = (points, cls = '') => `<polyline class="msh-link ${cls}" points="${points}"></polyline>`;
  const label = (x, y, text) => `<rect class="msh-label-bg" x="${x}" y="${y}" width="${Math.max(34, text.length * 13 + 14)}" height="20" rx="10"></rect><text class="msh-label" x="${x + Math.max(17, (text.length * 13 + 14) / 2)}" y="${y + 14}">${esc(text)}</text>`;
  return `<span class="process-summary-help-wrap" data-testid="process-summary-help" onclick="toggleProcessSummaryHelp(event)" onmouseleave="clearProcessSummaryHelpSuppressed(this)">
    <span class="process-summary-help-icon">?</span>
    <div class="process-summary-help-panel" data-testid="process-summary-help-panel">
      <div class="summary-help-head">
        <strong>摘要图怎么读</strong>
        <span>按业务路径排布，不按角色排布；复杂流程会自动展开为多排。</span>
      </div>
      <div class="summary-help-grid">
        ${card('纯顺序', '同一行用直线表达连续办理。', `
          ${end(10, 42, '开始')}${line('68,57 98,57')}${node(98, 40, 'A', 'msh-blue')}${line('172,57 202,57')}${node(202, 40, 'B', 'msh-green')}${line('276,57 302,57')}${end(302, 42, '结束')}
        `)}
        ${card('一个分支', '一个节点后出现多条下游路径。', `
          ${end(10, 42, '开始')}${line('68,57 98,57')}${node(98, 40, 'A', 'msh-blue')}${line('172,57 206,57 206,30 230,30')}${label(184, 10, '通过')}${node(230, 13, 'B', 'msh-green')}${line('172,57 206,57 206,84 230,84')}${label(184, 90, '驳回')}${node(230, 67, 'C', 'msh-yellow')}
        `)}
        ${card('分支后归并', '多排路径在公共节点处收束。', `
          ${node(24, 40, 'A', 'msh-blue')}${line('98,57 132,57 132,30 156,30')}${node(156, 13, 'B', 'msh-green')}${line('98,57 132,57 132,84 156,84')}${node(156, 67, 'C', 'msh-yellow')}${line('230,30 260,30 260,57 282,57')}${line('230,84 260,84 260,57 282,57')}${node(282, 40, 'D', 'msh-green')}
        `)}
        ${card('可跳过归并', '一条路径经过办理节点，另一条路径直接收束到公共节点。', `
          ${node(24, 40, 'A', 'msh-blue')}${line('98,57 132,57 132,30 156,30')}${label(112, 10, '是')}${node(156, 13, 'B', 'msh-green')}${line('230,30 258,30 258,57 286,57')}${line('98,57 132,57 132,84 258,84 258,57 286,57')}${label(112, 88, '否')}${node(286, 40, 'D', 'msh-yellow')}
        `)}
        ${card('分支直接结束', '某条路径没有办理节点，直接办结。', `
          ${node(32, 40, 'A', 'msh-blue')}${line('106,57 144,57 144,30 174,30')}${label(120, 10, '通过')}${node(174, 13, 'B', 'msh-green')}${line('106,57 144,57 144,84 278,84')}${label(120, 90, '不通过')}${end(278, 69, '结束')}
        `)}
        ${card('多起点', '多条开始连线会展开为多条入口路径。', `
          ${end(10, 42, '开始')}${line('68,57 96,57 96,30 126,30')}${node(126, 13, 'A', 'msh-blue')}${line('68,57 96,57 96,84 126,84')}${node(126, 67, 'B', 'msh-yellow')}${line('200,30 230,30 230,57 258,57')}${line('200,84 230,84 230,57 258,57')}${node(258, 40, 'C', 'msh-green')}
        `)}
        ${card('多个结束连线', '多个终止路径收束到同一个结束点。', `
          ${node(60, 13, 'B', 'msh-green')}${node(60, 67, 'C', 'msh-yellow')}${line('134,30 184,30 184,57 246,57')}${line('134,84 184,84 184,57 246,57')}${end(246, 42, '结束')}
        `)}
        ${card('回退/撤回', '回退作为辅助线展示，不打乱主路径。', `
          ${node(40, 40, 'A', 'msh-blue')}${line('114,57 156,57')}${node(156, 40, 'B', 'msh-green')}${line('230,57 274,57')}${end(274, 42, '结束')}${line('193,40 193,18 77,18 77,40', 'msh-return')}${label(108, 20, '撤回')}
        `)}
      </div>
    </div>
  </span>`;
}

function toggleProcessSummaryHelp(event) {
  event.preventDefault();
  event.stopPropagation();
  const wrap = event.currentTarget;
  const shouldOpen = !wrap.classList.contains('is-open');
  document.querySelectorAll('.process-summary-help-wrap.is-open').forEach((item) => {
    if (item !== wrap) item.classList.remove('is-open');
  });
  wrap.classList.toggle('is-suppressed', !shouldOpen);
  wrap.classList.toggle('is-open', shouldOpen);
}

function clearProcessSummaryHelpSuppressed(wrap) {
  wrap?.classList?.remove('is-suppressed');
}

function closeProcessSummaryHelp(event) {
  if (event?.target?.closest?.('.process-summary-help-wrap')) return;
  document.querySelectorAll('.process-summary-help-wrap.is-open').forEach((item) => item.classList.remove('is-open'));
}

document.addEventListener('click', closeProcessSummaryHelp);

function renderProcessFlowStage(proc, { editing = false, task = null, drawerW = 0 } = {}) {
  const procs = S.doc?.processes || [];
  const offsetStyle = editing ? ` style="margin-right:${drawerW}px"` : '';
  const taskLevelMode = getProcessFlowShowTasks() && !!task;
  const diagMode = taskLevelMode ? ' taskflow-mode' : '';
  const diagramMode = getProcessFlowMode();
  const diagramControls = `<div class="process-diagram-mode" data-testid="process-flow-mode">
    ${renderProcessSummaryHelpPanel()}
    <button class="vtb ${diagramMode === 'linear' ? 'active' : ''}" type="button" data-testid="process-flow-mode-linear" onclick="setProcessFlowMode('linear')">摘要图</button>
    <button class="vtb ${diagramMode === 'swimlane' ? 'active' : ''}" type="button" data-testid="process-flow-mode-swimlane" onclick="setProcessFlowMode('swimlane')">泳道图</button>
  </div>`;
  const entityToggle = `<label class="process-diagram-entity-toggle" data-testid="process-flow-entity-toggle">
    <input type="checkbox" ${getProcessFlowShowEntities() ? 'checked' : ''} onchange="toggleProcessFlowEntities(this.checked)">
    <span>显示实体</span>
  </label>`;
  const taskToggle = `<label class="process-diagram-entity-toggle" data-testid="process-flow-task-toggle">
    <input type="checkbox" ${getProcessFlowShowTasks() ? 'checked' : ''} onchange="toggleProcessFlowTasks(this.checked)">
    <span>显示任务</span>
  </label>`;
  return `<div class="process-flow-view${taskLevelMode ? ' has-tasklevel' : ''}${diagramMode === 'swimlane' ? ' is-swimlane' : ''}" data-testid="process-flow-view"${offsetStyle}>
    <div class="process-flow-card${taskLevelMode ? ' has-tasklevel' : ''}">
      <div class="process-flow-head">
        <div class="process-flow-actions">
          ${procs.length ? `<select data-testid="process-flow-select" onchange="selectProcessFlow(this.value)">
            ${procs.map((item) => `<option value="${esc(item.id)}" ${proc?.id===item.id?'selected':''}>${esc(item.name || '未命名流程')}</option>`).join('')}
          </select>` : ''}
          ${diagramControls}
          ${entityToggle}
          ${taskToggle}
        </div>
      </div>
      ${taskLevelMode ? `<div class="process-diagram-stack" data-testid="process-tasklevel-stack">
        <div class="process-diagram-panel" data-testid="process-context-flow" aria-label="流程图">
          <div class="drawer-diag process-main-diag process-context-diag process-context-main-diag">
            ${renderProcessZoomControls('proc-context-diagram')}
            <div id="proc-context-diagram" class="live-diagram" style="padding:8px 14px"></div>
          </div>
        </div>
        <div class="process-diagram-panel" data-testid="process-tasklevel-flow" aria-label="节点任务">
          <div class="drawer-diag process-main-diag${diagMode}">
            ${renderProcessZoomControls('proc-diagram', true)}
            <div id="proc-diagram" class="live-diagram" style="padding:10px 16px"></div>
          </div>
        </div>
      </div>` : `<div class="drawer-diag process-main-diag${diagMode}">
        ${renderProcessZoomControls('proc-diagram', true)}
        <div id="proc-diagram" class="live-diagram" style="padding:10px 16px"></div>
      </div>`}
    </div>
  </div>`;
}

function renderProcessFlowDiagram(proc, task) {
  if (!proc) return;
  const clickMap = {};
  for (const node of getProcNodes(proc)) {
    clickMap[node.id] = () => navigate('process', { procId: proc.id, taskId: node.id });
  }
  if (task && document.getElementById('proc-context-diagram')) {
    renderProcFlow('proc-context-diagram', proc, clickMap);
    renderProcTaskFlow('proc-diagram', proc, task.id, clickMap);
  } else if (task) {
    renderProcFlow('proc-diagram', proc, clickMap);
  } else {
    renderProcFlow('proc-diagram', proc, clickMap);
  }
}

function renderProcessTab() {
  ensureProcPos(S.doc);
  const procs=S.doc.processes||[];
  const proc=currentProc();
  let task=currentTask();
  const view=S.ui.procView||'stage';
  const stageItem = view === 'stage' ? getCurrentStageItem() : null;
  const realStageDetail = view === 'stage' && S.ui.stageViewMode === 'detail' && stageItem && !stageItem.virtual;
  const panoramaActive = view === 'stage' && (S.ui.stageViewMode || 'panorama') === 'panorama';
  const stageDetailActive = view === 'stage' && S.ui.stageViewMode === 'detail';
  const flowViewActive = view === 'flow' || view === 'list';
  const stageEditing = view === 'stage' && S.ui.stageEditorCollapsed === false;
  const displayProc = proc || procs[0] || null;
  if ((view === 'flow' || view === 'list') && getProcessFlowShowTasks() && displayProc && !task) {
    S.ui.taskId = getDefaultTaskIdForProc(displayProc, null);
    task = currentTask();
  }
  if (view === 'list' && !proc && displayProc) {
    S.ui.procId = displayProc.id;
    S.ui.procView = 'flow';
    renderProcessTab();
    return;
  }
  const toolbarOffset = view === 'list' && proc
    ? getDrawerWidth('process')
    : 0;
  const helpText = panoramaActive
    ? (stageEditing
      ? '直接在矩阵里维护业务域、价值流、单元格说明和阶段卡片；横向摆放表达大致先后，纵向摆放表达并列。'
      : '横轴是价值流，纵轴是业务域或产品边界；点击阶段可钻取详情，打开编辑可直接维护全景表格。')
    : (stageDetailActive
      ? (stageEditing
        ? '在图上直接维护流程名称和连线；横向表示大致先后，未连接或并列流程会放在下方，也可拖动节点微调位置。'
        : '当前节点就是流程，连线表达阶段内流程的先后与分支关系。点击流程节点可进入流程编辑。')
      : (flowViewActive
        ? '按办理顺序查看当前流程，节点表示业务人员需要关注的关键环节。'
        : '按角色查看参与的流程和任务，点击流程可进入对应流程编辑。'));
  const toolbarActions = [
    `<span class="inline-help toolbar-help" tabindex="0" data-testid="process-view-help" data-tip="${esc(helpText)}">?</span>`,
    (stageDetailActive || (panoramaActive && stageEditing)) ? `<div class="zoom-controls">
      <button class="zoom-btn" type="button" data-testid="stage-zoom-in" onclick="nudgeStageGraphZoom(0.1)">＋</button>
      <button class="zoom-btn zoom-reset-btn" type="button" data-testid="stage-zoom-reset" onclick="resetStageGraphZoom()">${Math.round(getStageGraphZoom() * 100)}%</button>
      <button class="zoom-btn" type="button" data-testid="stage-zoom-out" onclick="nudgeStageGraphZoom(-0.1)">－</button>
    </div>` : '',
    (panoramaActive || stageDetailActive) ? (stageEditing
      ? '<button class="btn btn-ghost-sm" type="button" data-testid="stage-editor-hide" onclick="toggleStageEditorDrawer(false)">关闭编辑</button>'
      : '<button class="btn btn-outline btn-sm" type="button" data-testid="stage-editor-open" onclick="toggleStageEditorDrawer(true)">打开编辑</button>') : '',
    view === 'flow' && displayProc ? `<button class="btn btn-outline btn-sm" type="button" data-testid="process-editor-open" onclick="openProcessEditor('${esc(displayProc.id)}',${task ? `'${esc(task.id)}'` : 'null'})">打开编辑</button>` : '',
  ].filter(Boolean).join('');

  /* ── 视图切换工具栏 ── */
  let h=`<div class="proc-view-toolbar">
    <div class="proc-view-toolbar-main" ${toolbarOffset ? `style="margin-right:${toolbarOffset}px"` : ''}>
      <div class="view-toggle-group">
        <button class="vtb ${panoramaActive?'active':''}" data-testid="process-switch-panorama" onclick="openStagePanorama()">全景视图</button>
        <button class="vtb ${stageDetailActive?'active':''}" data-testid="process-switch-stage" onclick="openStageDetail()">阶段视图</button>
        <button class="vtb ${flowViewActive?'active':''}" data-testid="process-switch-card" onclick="openProcessFlowView()">流程视图</button>
        <button class="vtb ${view==='role'?'active':''}" data-testid="process-switch-role" onclick="openRoleProjection()">角色视图</button>
      </div>
      <div class="proc-view-actions">${toolbarActions}</div>
    </div>
  </div>`;

  if(!procs.length && view!=='stage') {
    h+=`<div style="padding:24px;color:var(--text-m)">暂无流程，点击右上角新建</div>`;
    document.getElementById('tab-content').innerHTML=h;
    return;
  }

  if(view==='stage') {
    h += renderStageWorkbench();
    document.getElementById('tab-content').innerHTML = h;
    return;
  }

  /* ══ 流程视图 ══ */
  if(view==='flow') {
    if (displayProc && !S.ui.procId) S.ui.procId = displayProc.id;
    h+=renderProcessFlowStage(displayProc, { editing: false, task });
    const tabContent = document.getElementById('tab-content');
    tabContent.innerHTML=h;
    renderProcessFlowDiagram(displayProc, task);
    return;
  }

  if(view==='role') {
    h += renderProcessRoleView();
    document.getElementById('tab-content').innerHTML = h;
    return;
  }

  /* ══ 流程编辑模式：中间流程图 + 右侧抽屉编辑 ══ */
  const drawerW = getDrawerWidth('process');
  h+=renderProcessFlowStage(proc || procs[0] || null, { editing: !!proc, task, drawerW });

  /* ── 右侧抽屉（只承载编辑表单） ── */
  h+=`<div class="proc-drawer${proc?' open':''}" style="width:${drawerW}px">
    <div class="drawer-resize-handle" data-testid="process-drawer-resize-handle" onmousedown="startDrawerResize(event)"></div>`;

  if(proc) {
    /* 抽屉头部 */
    h+=`<div class="drawer-head">
      <div class="drawer-crumb">
        <span class="drawer-crumb-proc" onclick="${task ? `openProcessEditor('${esc(proc.id)}', null)` : ''}"
          title="回到流程">${esc(proc.name||'未命名流程')}</span>
        ${task?`<span class="dc-sep">›</span>
          <span>节点 ${esc(task.name||'未命名节点')}</span>`:''}
      </div>
      <div class="drawer-actions">
        ${task?`<button class="btn btn-danger btn-sm" onclick="removeTask('${esc(proc.id)}','${esc(task.id)}')">\u5220\u9664\u8282\u70b9</button>`:''}
        <button class="drawer-close" type="button" data-testid="process-editor-close" onclick="closeProcessEditor()" title="关闭编辑">✕</button>
      </div>
    </div>`;

    /* 流程图（小图） */
    /* 编辑表单 */
    h+=`<div class="drawer-body">`;

    if(task) {
      /* ── 节点编辑 ── */
      h+=`<div class="form-grid" style="margin-bottom:16px">
        <div class="field-group">
          <label>节点名称</label>
          <input type="text" data-testid="process-task-name-input" value="${esc(task.name||'')}" placeholder="如：新增仓库"
            oninput="setTask('${esc(proc.id)}','${esc(task.id)}','name',this.value)">
        </div>
        <div class="field-group">
          <label>执行角色</label>`;

      h+=renderTaskRolePicker(proc, task);
      h+=`</div>
      </div>`;

      /* 步骤 */
      h+=renderNodePerspectiveSwitch();
      if ((S.ui.nodePerspective || 'user') === 'engineering') {
        h+=renderOrchestrationSection(proc, task);
      } else {
        h+=renderUserStepsSection(proc, task);
      }

      /* 涉及实体 */
      const eops=task.entity_ops||[];
      h+=`<div class="form-section"><h4>涉及实体</h4>`;
      if(eops.length){
        h+=`<div class="eop-list">`;
        for(const eo of eops){
          const en=getEntityName(eo.entity_id);
          h+=`<div class="eop-tag">
            <span class="eop-name" onclick="navigate('data',{entityId:'${eo.entity_id}'})" title="→ 实体详情">${esc(en)}</span>
            <div class="eop-ops">`;
          for(const op of ['C','R','U','D']){
            const chk=eo.ops?.includes(op)?'checked':'';
            const cls=op==='C'?'op-c':op==='U'?'op-u':op==='D'?'op-d':'';
            h+=`<label class="op-cb">
              <input type="checkbox" ${chk}
                onchange="toggleEntityOp('${esc(proc.id)}','${esc(task.id)}','${eo.entity_id}','${op}',this.checked)">
              <span class="${cls}">${op}</span></label>`;
          }
          h+=`</div><button class="eop-del" onclick="removeEntityOp('${esc(proc.id)}','${esc(task.id)}','${eo.entity_id}')">✕</button></div>`;
        }
        h+=`</div>`;
      } else { h+=`<p class="no-refs" style="margin-bottom:8px">尚未关联实体</p>`; }
      const avail=(S.doc.entities||[]).filter(e=>!eops.some(eo=>eo.entity_id===e.id));
      if(avail.length){
        h+=`<div class="add-eop-row">
          <select id="eop-sel-${task.id}">
            <option value="">选择实体...</option>
            ${avail.map(e=>`<option value="${e.id}">${esc(e.name || '未命名实体')}</option>`).join('')}
          </select>
          <button class="btn btn-outline btn-sm"
            onclick="addEntityOp('${esc(proc.id)}','${esc(task.id)}',document.getElementById('eop-sel-${task.id}').value)">关联</button>
        </div>`;
      }
      h+=`</div>`;

      h+=renderTaskFormsSection(proc, task);
      h+=renderTaskBusinessRulesSection(proc, task);

    } else {
      /* ── 流程信息 ── */
      const prototypeFiles = getProcPrototypeFiles(proc);
      const prototypeInputId = formatPrototypeInputId(proc.id);
      const processStageRefs = getProcessStageRefs(proc.id, S.doc);
      const processStageRefChips = processStageRefs
        .map((ref) => {
          const stageName = getStageDisplayName(ref.stageId, S.doc);
          return `<button class="proc-stage-ref-chip" type="button" data-testid="proc-stage-ref-chip" onclick="openStageDetail('${esc(ref.stageId)}')">${esc(stageName)}</button>`;
        })
        .join('');
      h+=`<div class="form-grid">
        <div class="field-group">
          <label>流程名称</label>
          <input type="text" id="proc-name-input" value="${esc(proc.name||'')}"
            placeholder="如：采购入库流程"
            oninput="setProc('${esc(proc.id)}','name',this.value);renderSidebar()">
        </div>
        <div class="field-group field-group-wide">
          <label>涉及业务阶段</label>
          <div class="proc-stage-ref-list" data-testid="proc-stage-ref-list">
            ${processStageRefChips || '<span class="no-refs">暂未涉及业务阶段</span>'}
          </div>
          <div class="field-hint">阶段与流程的关系请在阶段视图中维护</div>
        </div>
        <div class="field-group">
          <label>触发条件</label>
          <input type="text" value="${esc(proc.trigger||'')}" placeholder="什么事件触发此流程"
            oninput="setProc('${esc(proc.id)}','trigger',this.value)">
        </div>
        <div class="field-group">
          <label>预期结果</label>
          <input type="text" value="${esc(proc.outcome||'')}" placeholder="流程完成后达成的状态"
            oninput="setProc('${esc(proc.id)}','outcome',this.value)">
        </div>
      </div>
      ${renderProcessFlowRoutingEditor(proc)}
      <div class="form-section">
        <div class="section-toolbar">
          <h4>流程原型/附件${prototypeFiles.length ? `<span class="section-count">${prototypeFiles.length}项</span>` : ''}</h4>
        </div>
        ${prototypeFiles.length ? `<div class="prototype-file-list" data-testid="proc-prototype-list">
          ${prototypeFiles.map((file) => {
            const currentVersion = findProcessPrototypeVersion(file);
            const versionCount = Array.isArray(file.versions) ? file.versions.length : 0;
            const expanded = isProcessPrototypeExpanded(proc.id, file.uid);
            const fileKind = getProcessAttachmentKind(currentVersion || file);
            const canPreviewCurrent = canPreviewProcessAttachment(currentVersion || file);
            return `<div class="prototype-file-item" data-testid="proc-prototype-item">
            <div class="prototype-file-meta">
              <strong class="prototype-file-name">${esc(file.name || '')}</strong>
              <span class="prototype-file-version">当前 v${currentVersion?.number || 1} · 共${versionCount || 1}版${currentVersion?.uploadedAt ? ` · ${esc(currentVersion.uploadedAt)}` : ''}</span>
              <span class="prototype-file-kind">${esc(fileKind)}</span>
            </div>
            <div class="prototype-file-actions">
              <button class="btn btn-ghost-sm" type="button" data-testid="proc-prototype-toggle" data-prototype-toggle="${esc(file.uid)}"
                onclick="toggleProcessPrototypeVersions('${esc(proc.id)}','${esc(file.uid)}')">${expanded ? '收起' : '展开'}版本</button>
              ${canPreviewCurrent ? `<button class="btn btn-ghost-sm" type="button" data-testid="proc-prototype-open"
                onclick="openProcessPrototypeFile('${esc(proc.id)}','${esc(file.uid)}')">查看</button>` : ''}
              <button class="btn btn-ghost-sm" type="button" data-testid="proc-prototype-download"
                onclick="downloadProcessPrototypeFile('${esc(proc.id)}','${esc(file.uid)}')">下载</button>
              <button class="btn btn-ghost-sm prototype-file-remove" type="button" data-testid="proc-prototype-remove"
                onclick="removeProcessPrototypeFile('${esc(proc.id)}','${esc(file.uid)}')">删除</button>
            </div>
            ${expanded ? `<div class="prototype-version-list" data-testid="proc-prototype-version-list">
              ${file.versions.map((version) => `<div class="prototype-version-item" data-testid="proc-prototype-version-item">
                <div class="prototype-version-meta">
                  <strong class="prototype-version-label">v${version.number}${version.uid === file.versionUid ? ' · 当前引用' : ''}</strong>
                  <span class="prototype-version-time">${esc(version.uploadedAt || '未记录上传时间')}</span>
                </div>
                <div class="prototype-version-actions">
                  ${canPreviewProcessAttachment(version) ? `<button class="btn btn-ghost-sm" type="button" data-testid="proc-prototype-version-open"
                    onclick="openProcessPrototypeFile('${esc(proc.id)}','${esc(file.uid)}','${esc(version.uid)}')">查看</button>` : ''}
                  <button class="btn btn-ghost-sm" type="button" data-testid="proc-prototype-version-download"
                    onclick="downloadProcessPrototypeFile('${esc(proc.id)}','${esc(file.uid)}','${esc(version.uid)}')">下载</button>
                </div>
              </div>`).join('')}
            </div>` : ''}
          </div>`;
          }).join('')}
        </div>` : `<p class="no-refs" style="margin-bottom:8px">尚未上传流程原型/附件</p>`}
        <div class="prototype-upload-row" data-testid="proc-prototype-upload">
          <input type="file" id="${prototypeInputId}" data-testid="proc-prototype-input"
            accept=".html,.htm,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.txt,.json,.csv" multiple>
          <button class="btn btn-outline btn-sm" type="button" data-testid="proc-prototype-upload-button"
            onclick="addProcessPrototypeFiles('${esc(proc.id)}','${prototypeInputId}')">上传附件</button>
        </div>
        <div class="prototype-upload-progress ${(S.ui.procAttachmentUpload || {}).active ? '' : 'hidden'}" data-testid="proc-prototype-upload-progress">
          <div class="prototype-upload-progress-track"><span data-testid="proc-prototype-upload-progress-bar" style="width:${Number((S.ui.procAttachmentUpload || {}).percent || 0)}%"></span></div>
          <strong data-testid="proc-prototype-upload-progress-message">${esc((S.ui.procAttachmentUpload || {}).message || '正在上传...')}</strong>
        </div>
        <p class="prototype-upload-hint">支持上传 HTML 原型、图片、PDF、Office 文档和文本类附件；同名上传会自动新增版本，并把最新上传设为当前引用。</p>
      </div>
      <p style="margin-top:14px;font-size:12px;color:var(--text-m)">
        点击上方流程图中的流程节点可直接进入节点编辑
      </p>`;
      const procFocusSelector = S.ui.procEditorFocusSelector || '#proc-name-input';
      setTimeout(() => {
        const field = document.querySelector(procFocusSelector);
        if (!field) return;
        if (typeof field.focus === 'function') {
          try {
            field.focus({ preventScroll: true });
          } catch (error) {
            field.focus();
          }
        }
      },40);
      S.ui.procEditorFocusSelector = '';
    }

    h+=`</div>`; /* end drawer-body */
  } else {
    /* 无选中：提示语 */
    h+=`<div class="drawer-empty"><p>从流程视图选择流程节点后打开编辑</p></div>`;
  }

  h+=`</div>`; /* end proc-drawer */

  const tabContent = document.getElementById('tab-content');
  if (typeof renderBusinessModelDialog === 'function') {
    h += renderBusinessModelDialog();
  }
  tabContent.innerHTML = h;
  syncTaskReturnableToggle(tabContent);
  if (typeof initAutoResize === 'function') initAutoResize();

  renderProcessFlowDiagram(proc, task);
}

/* 仅刷新流程图，不重建整个 DOM（输入框连续输入时用） */
function renderProcDiagramNow() {
  const proc=currentProc(); if(!proc) return;
  renderProcessFlowDiagram(proc, currentTask());
}

function isCustomStepType(type) {
  if (type === null || type === undefined) return false;
  return !STEP_TYPES.some(t => t.value !== '__other__' && t.value === type);
}
function onStepTypeChange(sel, procId, taskId, idx) {
  const val = sel.value;
  if (val === '__other__') {
    setStep(procId, taskId, idx, 'type', '');
    render();
    const rows = document.querySelectorAll('.step-row');
    const input = rows[idx]?.querySelector('.step-type-custom');
    if (input) { input.focus(); }
  } else {
    setStep(procId, taskId, idx, 'type', val);
    render();
  }
}
