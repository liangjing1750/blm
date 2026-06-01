'use strict';

const COLLAB_SNAPSHOT_DEBOUNCE_MS = 3000;
const COLLAB_RECONNECT_MS = 3000;
const COLLAB_PING_MS = 10000;
const COLLAB_USER_PROFILE_KEY = 'blm.user.profile';
const COLLAB_USER_SESSION_KEY = 'blm.user.sessionId';

function normalizeCollabDisplayName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^用户[0-9a-f]{4}$/i.test(text)) return '';
  if (text === '未设置用户') return '';
  if (/^[{[]/.test(text) && /(?:user|name|sessionId|clientId)/.test(text)) return '';
  return text.slice(0, 40);
}

function createLocalUserId() {
  if (crypto?.randomUUID) return `user-${crypto.randomUUID()}`;
  return `user-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function getCollabSessionId() {
  let sessionId = sessionStorage.getItem(COLLAB_USER_SESSION_KEY) || '';
  if (!sessionId) {
    sessionId = crypto?.randomUUID ? `session-${crypto.randomUUID()}` : `session-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    sessionStorage.setItem(COLLAB_USER_SESSION_KEY, sessionId);
  }
  return sessionId;
}

function loadCollabUserProfile() {
  let profile = null;
  try {
    profile = JSON.parse(localStorage.getItem(COLLAB_USER_PROFILE_KEY) || 'null');
  } catch (_) {
    profile = null;
  }
  const legacyName = normalizeCollabDisplayName(localStorage.getItem('blm.collab.userName') || '');
  const name = normalizeCollabDisplayName(profile?.name || legacyName || '');
  const id = String(profile?.id || '').trim() || createLocalUserId();
  const nextProfile = { id, name, sessionId: getCollabSessionId() };
  S.user = { ...nextProfile };
  if (!profile || profile.id !== id || profile.name !== name) {
    localStorage.setItem(COLLAB_USER_PROFILE_KEY, JSON.stringify({ id, name }));
  }
  return nextProfile;
}

function saveCollabUserProfile(name) {
  const current = loadCollabUserProfile();
  const displayName = normalizeCollabDisplayName(name);
  const next = {
    id: current.id || createLocalUserId(),
    name: displayName,
  };
  localStorage.setItem(COLLAB_USER_PROFILE_KEY, JSON.stringify(next));
  localStorage.removeItem('blm.collab.userName');
  S.user = { ...next, sessionId: getCollabSessionId() };
  renderUserAccountButton();
  if (S.currentFile && S.runtime.supportsCollab && !S.readOnly) {
    connectCollabSession(S.currentFile);
  }
  return S.user;
}

function getCollabUserProfile() {
  const profile = loadCollabUserProfile();
  return {
    id: profile.id,
    name: profile.name,
    sessionId: profile.sessionId,
  };
}

function hasConfiguredCollabUser() {
  return Boolean(loadCollabUserProfile().name);
}

function renderUserAccountButton() {
  const button = document.getElementById('user-account-button');
  if (!button) return;
  const profile = loadCollabUserProfile();
  const hasName = Boolean(profile.name);
  button.textContent = hasName ? profile.name : '用户信息配置';
  button.title = hasName ? `当前用户：${profile.name}` : '配置协作显示名称';
  button.classList.toggle('empty', !hasName);
}

function openUserAccountModal() {
  const profile = loadCollabUserProfile();
  const input = document.getElementById('user-display-name-input');
  const note = document.getElementById('user-session-note');
  if (input) input.value = profile.name || '';
  if (note) note.textContent = `浏览器用户ID：${profile.id}；当前页面连接ID：${profile.sessionId}`;
  openModalById('user-modal-overlay');
  setTimeout(() => input?.focus(), 50);
}

function closeUserAccountModal() {
  closeModalById('user-modal-overlay');
}

function saveUserAccountFromModal() {
  const input = document.getElementById('user-display-name-input');
  const name = String(input?.value || '').trim();
  if (!normalizeCollabDisplayName(name)) return showAppAlert('请填写真实显示名称，用于协作时识别修改人。');
  saveCollabUserProfile(name);
  closeUserAccountModal();
  showAppToast('用户信息已更新。');
  if (!S.doc && typeof openStartupLocatorIfPresent === 'function') {
    openStartupLocatorIfPresent().then((opened) => {
      if (!opened && typeof render === 'function') render();
    });
  }
}

function getCollabPayloadUserName(payload) {
  const raw = payload?.user;
  if (typeof raw === 'object' && raw !== null) {
    return normalizeCollabDisplayName(raw.name || raw.user) || '其他用户';
  }
  return normalizeCollabDisplayName(raw) || '其他用户';
}

function renderCollabStatus() {
  const badge = document.getElementById('collab-status');
  if (!badge) return;
  const state = S.collab || {};
  if (!S.currentFile || !S.runtime.supportsCollab) {
    badge.classList.add('hidden');
    badge.removeAttribute('data-users');
    return;
  }
  if (S.readOnly) {
    badge.classList.remove('hidden', 'connected', 'offline');
    badge.classList.add('offline');
    badge.textContent = '只读版本';
    badge.title = '当前查看的是命名版本快照，不连接实时协作会话';
    badge.removeAttribute('data-users');
    return;
  }
  const users = Array.isArray(state.users) ? state.users : [];
  const currentProfile = loadCollabUserProfile();
  const names = users.map((item) => {
    const rawName = typeof item === 'object' && item !== null ? (item.name || item.user) : item;
    const rawId = typeof item === 'object' && item !== null ? String(item.userId || item.id || '').trim() : '';
    const sessionIds = Array.isArray(item?.sessionIds) ? item.sessionIds.map((sessionId) => String(sessionId || '').trim()) : [];
    const clientIds = Array.isArray(item?.clientIds) ? item.clientIds.map((clientId) => String(clientId || '').trim()) : [];
    const isCurrentUser = rawId === currentProfile.id
      || sessionIds.includes(currentProfile.sessionId)
      || clientIds.includes(state.clientId)
      || (users.length === 1 && Boolean(currentProfile.name));
    const name = normalizeCollabDisplayName(typeof rawName === 'object' ? rawName?.name || rawName?.user : rawName)
      || (isCurrentUser ? currentProfile.name : '')
      || '未设置用户';
    const count = Number(item.connectionCount || 1);
    return count > 1 ? `${name}（${count}个窗口）` : name;
  }).filter((name) => name && name !== '未设置用户');
  if (state.connected && currentProfile.name && !names.some((name) => name === currentProfile.name || name.startsWith(`${currentProfile.name}（`))) {
    names.unshift(currentProfile.name);
  }
  const onlineText = names.length <= 2 && names.length
    ? names.join('、')
    : `${names.length || 1} 人`;
  const hasQueuedSnapshot = Boolean(state.pendingSnapshot || state.snapshotTimer);
  const suffix = state.syncing ? ' · 同步中' : hasQueuedSnapshot ? ' · 待自动同步' : state.lastSyncedAt ? ' · 已同步' : '';
  const activity = state.lastActivity?.user ? ` · ${state.lastActivity.user}刚更新` : '';
  badge.classList.remove('hidden', 'connected', 'offline');
  badge.classList.add(state.connected ? 'connected' : 'offline');
  badge.textContent = state.connected
    ? `协作 ${onlineText}在线${suffix}${activity}`
    : '协作连接中';
  badge.title = names.length ? `在线：${names.join('、')}` : '正在连接实时协作会话';
  if (state.connected && names.length) {
    badge.dataset.users = `在线用户\n${names.join('\n')}`;
  } else {
    badge.removeAttribute('data-users');
  }
}

function renderCollabReconnectOverlay() {
  const overlay = document.getElementById('collab-reconnect-overlay');
  const detail = document.getElementById('collab-reconnect-detail');
  const active = Boolean(
    S.currentFile
      && S.runtime.supportsCollab
      && !S.readOnly
      && S.collab?.recovering
      && !S.collab?.connected,
  );
  overlay?.classList.toggle('hidden', !active);
  document.body?.classList.toggle('is-collab-reconnecting', active);
  if (detail && active) {
    detail.textContent = S.modified || S.collab?.pendingSnapshot
      ? '本地修改仍保留在当前浏览器内存中，重连成功后会立即同步。请不要关闭页面。'
      : '正在恢复实时协作连接，恢复前暂时暂停编辑。请不要关闭页面。';
  }
}

function connectCollabSession(docName) {
  if (!hasConfiguredCollabUser()) {
    disconnectCollabSession({ intentional: true });
    renderUserAccountButton();
    openUserAccountModal();
    return;
  }
  if (!S.runtime.supportsCollab || !docName || S.readOnly) {
    disconnectCollabSession({ intentional: true });
    renderCollabStatus();
    return;
  }
  disconnectCollabSession({ intentional: true });
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/collab/ws`);
  const userProfile = getCollabUserProfile();
  S.collab.shouldReconnect = true;
  S.collab.socket = socket;
  S.collab.connected = false;
  S.collab.userName = userProfile.name;
  S.collab.docName = docName;
  S.collab.users = [];
  S.collab.pendingSnapshot = false;
  S.collab.syncing = false;
  S.collab.snapshotRevision = 0;
  S.collab.inFlightRevision = 0;
  renderCollabStatus();

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'join', doc: docName, user: userProfile }));
    if (S.collab.pingTimer) window.clearInterval(S.collab.pingTimer);
    S.collab.pingTimer = window.setInterval(() => {
      if (S.collab.socket?.readyState === WebSocket.OPEN) {
        S.collab.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, COLLAB_PING_MS);
  });
  socket.addEventListener('message', (event) => {
    handleCollabMessage(event.data);
  });
  socket.addEventListener('close', () => {
    if (S.collab.socket === socket) {
      S.collab.connected = false;
      S.collab.socket = null;
      S.collab.syncing = false;
      if (S.collab.shouldReconnect && S.currentFile === docName && !S.readOnly) {
        S.collab.recovering = true;
      }
      renderCollabStatus();
      renderCollabReconnectOverlay();
      scheduleCollabReconnect(docName);
    }
  });
  socket.addEventListener('error', () => {
    if (S.collab.socket === socket) {
      S.collab.connected = false;
      S.collab.syncing = false;
      if (S.collab.shouldReconnect && S.currentFile === docName && !S.readOnly) {
        S.collab.recovering = true;
      }
      renderCollabStatus();
      renderCollabReconnectOverlay();
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
  if (S.collab?.pingTimer) {
    clearInterval(S.collab.pingTimer);
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
  S.collab.pingTimer = null;
  S.collab.snapshotRevision = 0;
  S.collab.inFlightRevision = 0;
  S.collab.recovering = false;
  renderCollabStatus();
  renderCollabReconnectOverlay();
}

function scheduleCollabReconnect(docName) {
  if (!S.collab?.shouldReconnect || S.readOnly || S.currentFile !== docName) return;
  if (S.collab.reconnectTimer) clearTimeout(S.collab.reconnectTimer);
  S.collab.reconnectTimer = setTimeout(() => {
    S.collab.reconnectTimer = null;
    if (S.currentFile === docName && !S.readOnly) connectCollabSession(docName);
  }, COLLAB_RECONNECT_MS);
}

function waitForCollabReady(timeoutMs = 3000) {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly) return Promise.resolve(false);
  if (S.collab?.connected && S.collab?.socket?.readyState === WebSocket.OPEN) return Promise.resolve(true);
  S.collab.recovering = true;
  renderCollabStatus();
  renderCollabReconnectOverlay();
  if (!S.collab?.socket || S.collab.socket.readyState > WebSocket.OPEN || S.collab.docName !== S.currentFile) {
    connectCollabSession(S.currentFile);
    S.collab.recovering = true;
    renderCollabStatus();
    renderCollabReconnectOverlay();
  }
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (S.collab?.connected && S.collab?.socket?.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function syncCollabImmediatelyFromCommand() {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly) return false;
  if (typeof flushCollabSnapshotSync !== 'function') return false;
  const ready = await waitForCollabReady();
  if (!ready) {
    showAppToast('协作连接尚未就绪，请稍后再试。');
    return true;
  }
  if (!S.modified && !S.collab.pendingSnapshot && !S.collab.snapshotTimer && !S.collab.syncing) {
    showAppToast('当前内容已同步。');
    return true;
  }
  flushCollabSnapshotSync();
  showAppToast('已发起立即同步。');
  return true;
}

async function flushAndWaitForCollabSync(timeoutMs = 10000) {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly) return false;
  await syncCollabImmediatelyFromCommand();
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const pending = Boolean(S.modified || S.collab?.pendingSnapshot || S.collab?.snapshotTimer || S.collab?.syncing);
      if (!pending) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  });
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
    S.collab.recovering = false;
    S.collab.clientId = String(payload.clientId || '');
    S.collab.seq = Number(payload.seq || 0);
    S.collab.users = Array.isArray(payload.users) ? payload.users : [];
    renderCollabStatus();
    renderCollabReconnectOverlay();
    if (typeof renderToolbar === 'function') renderToolbar();
    if (S.modified || S.collab.pendingSnapshot) {
      flushCollabSnapshotSync();
    }
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
      user: getCollabPayloadUserName(payload),
      mode: 'change',
      at: new Date().toISOString(),
    };
    applyRemoteCollabChanges(payload.changes || []);
    return;
  }
  if (payload.type === 'snapshot') {
    S.collab.seq = Number(payload.seq || S.collab.seq || 0);
    S.collab.lastActivity = {
      user: getCollabPayloadUserName(payload),
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
      const ackIsLatestSnapshot = (S.collab.inFlightRevision || 0) >= (S.collab.snapshotRevision || 0);
      if (ackIsLatestSnapshot) {
        if (payload.document && typeof payload.document === 'object') {
          S.doc = payload.document;
          hydrateDocumentForUi(S.doc);
        }
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
  if (S.readOnly || !S.runtime.supportsCollab || !S.doc) return;
  S.collab.snapshotRevision = Number(S.collab.snapshotRevision || 0) + 1;
  S.collab.pendingSnapshot = true;
  if (!S.collab?.connected || S.collab?.socket?.readyState !== WebSocket.OPEN) {
    if (S.currentFile) S.collab.recovering = true;
    renderCollabStatus();
    renderCollabReconnectOverlay();
    if (typeof renderToolbar === 'function') renderToolbar();
    return;
  }
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
