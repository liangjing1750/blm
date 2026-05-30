'use strict';

const COLLAB_SNAPSHOT_DEBOUNCE_MS = 3000;
const COLLAB_RECONNECT_MS = 3000;

function getCollabUserName() {
  const stored = localStorage.getItem('blm.collab.userName') || '';
  if (stored.trim()) return stored.trim();
  const fallback = `用户${Math.random().toString(16).slice(2, 6)}`;
  localStorage.setItem('blm.collab.userName', fallback);
  return fallback;
}

function renderCollabStatus() {
  const badge = document.getElementById('collab-status');
  if (!badge) return;
  const state = S.collab || {};
  if (!S.currentFile || !S.runtime.supportsCollab) {
    badge.classList.add('hidden');
    return;
  }
  if (S.readOnly) {
    badge.classList.remove('hidden', 'connected', 'offline');
    badge.classList.add('offline');
    badge.textContent = '只读版本';
    badge.title = '当前查看的是命名版本快照，不连接实时协作会话';
    return;
  }
  const users = Array.isArray(state.users) ? state.users : [];
  const names = users.map((item) => item.user).filter(Boolean);
  const hasQueuedSnapshot = Boolean(state.pendingSnapshot || state.snapshotTimer);
  const suffix = state.syncing ? ' · 同步中' : hasQueuedSnapshot ? ' · 待自动同步' : state.lastSyncedAt ? ' · 已同步' : '';
  const activity = state.lastActivity?.user ? ` · ${state.lastActivity.user}刚更新` : '';
  badge.classList.remove('hidden', 'connected', 'offline');
  badge.classList.add(state.connected ? 'connected' : 'offline');
  badge.textContent = state.connected
    ? `协作 ${names.length || 1} 人在线${suffix}${activity}`
    : '协作连接中';
  badge.title = names.length ? `在线：${names.join('、')}` : '正在连接实时协作会话';
}

function connectCollabSession(docName) {
  if (!S.runtime.supportsCollab || !docName || S.readOnly) {
    disconnectCollabSession({ intentional: true });
    renderCollabStatus();
    return;
  }
  disconnectCollabSession({ intentional: true });
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/collab/ws`);
  const userName = getCollabUserName();
  S.collab.shouldReconnect = true;
  S.collab.socket = socket;
  S.collab.connected = false;
  S.collab.userName = userName;
  S.collab.docName = docName;
  S.collab.users = [];
  S.collab.pendingSnapshot = false;
  S.collab.syncing = false;
  S.collab.snapshotRevision = 0;
  S.collab.inFlightRevision = 0;
  renderCollabStatus();

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'join', doc: docName, user: userName }));
  });
  socket.addEventListener('message', (event) => {
    handleCollabMessage(event.data);
  });
  socket.addEventListener('close', () => {
    if (S.collab.socket === socket) {
      S.collab.connected = false;
      S.collab.socket = null;
      S.collab.syncing = false;
      renderCollabStatus();
      scheduleCollabReconnect(docName);
    }
  });
  socket.addEventListener('error', () => {
    if (S.collab.socket === socket) {
      S.collab.connected = false;
      S.collab.syncing = false;
      renderCollabStatus();
    }
  });
}

function disconnectCollabSession(options = {}) {
  const socket = S.collab?.socket;
  if (options.intentional) {
    S.collab.shouldReconnect = false;
  }
  if (S.collab?.reconnectTimer) {
    clearTimeout(S.collab.reconnectTimer);
    S.collab.reconnectTimer = null;
  }
  if (S.collab?.snapshotTimer) {
    clearTimeout(S.collab.snapshotTimer);
  }
  if (socket && socket.readyState <= WebSocket.OPEN) {
    socket.close();
  }
  S.collab.socket = null;
  S.collab.connected = false;
  S.collab.clientId = '';
  S.collab.users = [];
  S.collab.docName = '';
  S.collab.pendingSnapshot = false;
  S.collab.syncing = false;
  S.collab.snapshotTimer = null;
  S.collab.snapshotRevision = 0;
  S.collab.inFlightRevision = 0;
  renderCollabStatus();
}

function scheduleCollabReconnect(docName) {
  if (!S.collab?.shouldReconnect || S.readOnly || S.currentFile !== docName) return;
  if (S.collab.reconnectTimer) clearTimeout(S.collab.reconnectTimer);
  S.collab.reconnectTimer = setTimeout(() => {
    S.collab.reconnectTimer = null;
    if (S.currentFile === docName && !S.readOnly) connectCollabSession(docName);
  }, COLLAB_RECONNECT_MS);
}

function handleCollabMessage(raw) {
  let payload = null;
  try {
    payload = JSON.parse(raw || '{}');
  } catch (error) {
    console.warn('[BLM collab] invalid message', error);
    return;
  }
  if (payload.type === 'joined') {
    S.collab.connected = true;
    S.collab.clientId = String(payload.clientId || '');
    S.collab.seq = Number(payload.seq || 0);
    S.collab.users = Array.isArray(payload.users) ? payload.users : [];
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
    return;
  }
  if (payload.type === 'presence') {
    S.collab.users = Array.isArray(payload.users) ? payload.users : [];
    renderCollabStatus();
    return;
  }
  if (payload.type === 'change') {
    S.collab.seq = Number(payload.seq || S.collab.seq || 0);
    S.collab.lastActivity = {
      user: String(payload.user || '其他用户'),
      mode: 'change',
      at: new Date().toISOString(),
    };
    applyRemoteCollabChanges(payload.changes || []);
    return;
  }
  if (payload.type === 'snapshot') {
    S.collab.seq = Number(payload.seq || S.collab.seq || 0);
    S.collab.lastActivity = {
      user: String(payload.user || '其他用户'),
      mode: 'snapshot',
      at: new Date().toISOString(),
    };
    receiveRemoteCollabSnapshot(payload.document);
    return;
  }
  if (payload.type === 'ack') {
    S.collab.seq = Number(payload.seq || S.collab.seq || 0);
    if (payload.mode === 'snapshot') {
      S.collab.syncing = false;
      if ((S.collab.inFlightRevision || 0) >= (S.collab.snapshotRevision || 0)) {
        S.collab.pendingSnapshot = false;
        S.modified = false;
        if (typeof renderToolbar === 'function') renderToolbar();
      }
      S.collab.lastSyncedAt = new Date().toISOString();
      renderCollabStatus();
    }
  }
}

function queueCollabSnapshotSync() {
  if (S.readOnly || !S.runtime.supportsCollab || !S.collab?.connected || !S.doc) return;
  S.collab.snapshotRevision = Number(S.collab.snapshotRevision || 0) + 1;
  S.collab.pendingSnapshot = true;
  if (S.collab.snapshotTimer) clearTimeout(S.collab.snapshotTimer);
  S.collab.snapshotTimer = setTimeout(() => {
    flushCollabSnapshotSync();
  }, COLLAB_SNAPSHOT_DEBOUNCE_MS);
  renderCollabStatus();
  if (typeof renderToolbar === 'function') renderToolbar();
}

function flushCollabSnapshotSync() {
  const socket = S.collab?.socket;
  if (S.readOnly || !socket || socket.readyState !== WebSocket.OPEN || !S.collab.connected || !S.doc) return;
  S.collab.snapshotTimer = null;
  S.collab.pendingSnapshot = false;
  S.collab.syncing = true;
  S.collab.inFlightRevision = S.collab.snapshotRevision || 0;
  renderCollabStatus();
  if (typeof renderToolbar === 'function') renderToolbar();
  socket.send(JSON.stringify({
    type: 'snapshot',
    baseSeq: S.collab.seq || 0,
    document: S.doc,
  }));
}

function hasLocalPendingCollabSnapshot() {
  return Boolean(S.collab?.pendingSnapshot || S.collab?.syncing || S.collab?.snapshotTimer);
}

function sendCollabChange(path, oldValue, newValue) {
  const socket = S.collab?.socket;
  if (S.readOnly || !socket || socket.readyState !== WebSocket.OPEN || !S.collab.connected) return;
  socket.send(JSON.stringify({
    type: 'change',
    baseSeq: S.collab.seq || 0,
    changes: [{ path, old: oldValue, new: newValue }],
  }));
}

function sendCollabChanges(changes) {
  const socket = S.collab?.socket;
  if (S.readOnly || !socket || socket.readyState !== WebSocket.OPEN || !S.collab.connected) return;
  const normalized = (Array.isArray(changes) ? changes : [])
    .filter((change) => change && change.path)
    .map((change) => ({
      path: String(change.path),
      old: change.old,
      new: change.new,
    }));
  if (!normalized.length) return;
  socket.send(JSON.stringify({
    type: 'change',
    baseSeq: S.collab.seq || 0,
    changes: normalized,
  }));
}

function applyRemoteCollabSnapshot(document) {
  if (!document || typeof document !== 'object') return;
  S.doc = document;
  S.collab.pendingRemoteSnapshot = null;
  S.collab.hasConflict = false;
  hydrateDocumentForUi(S.doc);
  render();
  renderCollabStatus();
}

function receiveRemoteCollabSnapshot(document) {
  if (!document || typeof document !== 'object') return;
  if (hasLocalPendingCollabSnapshot()) {
    S.collab.pendingRemoteSnapshot = document;
    S.collab.hasConflict = true;
    renderCollabStatus();
    renderCollabConflictBanner();
    return;
  }
  applyRemoteCollabSnapshot(document);
}

function renderCollabConflictBanner() {
  const banner = document.getElementById('collab-conflict-alert');
  if (!banner) return;
  banner.classList.toggle('hidden', !S.collab?.hasConflict);
}

function applyPendingRemoteCollabSnapshot() {
  const remote = S.collab?.pendingRemoteSnapshot;
  if (!remote) {
    S.collab.hasConflict = false;
    renderCollabConflictBanner();
    return;
  }
  if (S.collab.snapshotTimer) {
    clearTimeout(S.collab.snapshotTimer);
    S.collab.snapshotTimer = null;
  }
  S.collab.pendingSnapshot = false;
  S.collab.syncing = false;
  S.modified = false;
  if (typeof renderToolbar === 'function') renderToolbar();
  applyRemoteCollabSnapshot(remote);
}

function keepLocalCollabSnapshot() {
  S.collab.pendingRemoteSnapshot = null;
  S.collab.hasConflict = false;
  S.collab.pendingSnapshot = true;
  renderCollabConflictBanner();
  flushCollabSnapshotSync();
}

function deferCollabConflict() {
  renderCollabConflictBanner();
}

function applyRemoteCollabChanges(changes) {
  if (!Array.isArray(changes) || !S.doc) return;
  let changed = false;
  changes.forEach((change) => {
    const path = String(change?.path || '').trim();
    if (!path) return;
    if (setCollabPathValue(S.doc, path, change.new)) changed = true;
  });
  if (changed) {
    hydrateDocumentForUi(S.doc);
    render();
    renderCollabStatus();
  }
}

function setCollabPathValue(target, path, value) {
  const tokens = parseCollabPath(path);
  if (!tokens.length) return false;
  let current = target;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (typeof token === 'number') {
      if (!Array.isArray(current)) return false;
      if (!current[token]) current[token] = {};
      current = current[token];
    } else {
      if (!current || typeof current !== 'object') return false;
      if (!current[token]) current[token] = {};
      current = current[token];
    }
  }
  const last = tokens[tokens.length - 1];
  if (typeof last === 'number') {
    if (!Array.isArray(current)) return false;
    current[last] = value;
  } else {
    if (!current || typeof current !== 'object') return false;
    current[last] = value;
  }
  return true;
}

function parseCollabPath(path) {
  const tokens = [];
  String(path || '').split('.').forEach((segment) => {
    let rest = segment.trim();
    while (rest.includes('[')) {
      const [before, after] = rest.split('[', 2);
      if (before) tokens.push(before);
      const end = after.indexOf(']');
      if (end < 0) return;
      const indexText = after.slice(0, end);
      if (/^\d+$/.test(indexText)) tokens.push(Number(indexText));
      rest = after.slice(end + 1);
    }
    if (rest) tokens.push(rest);
  });
  return tokens;
}
