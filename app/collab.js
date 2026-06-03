'use strict';

const COLLAB_SNAPSHOT_DEBOUNCE_MS = 5000;
const COLLAB_RECONNECT_MS = 3000;
const COLLAB_PING_MS = 10000;
const COLLAB_POLL_MS = 10000;
const COLLAB_USER_PROFILE_KEY = 'blm.user.profile';
const COLLAB_USER_SESSION_KEY = 'blm.user.sessionId';
const COLLAB_DRAFT_DB_NAME = 'blm-collab-drafts';
const COLLAB_DRAFT_STORE_NAME = 'drafts';
const COLLAB_DRAFT_STORAGE_PREFIX = 'blm.collab.draft.';

function normalizeCollabDisplayName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^用户[0-9a-f]{4}$/i.test(text)) return '';
  if (text === '未设置用户') return '';
  if (/^[{[]/.test(text) && /(?:user|name|sessionId|clientId)/.test(text)) return '';
  return text.slice(0, 40);
}

function escapeCollabHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCollabTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('zh-CN', { hour12: false });
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

function getCollabDraftKey(docName = S.currentFile) {
  const profile = loadCollabUserProfile();
  const userId = String(profile.id || 'anonymous').trim() || 'anonymous';
  return `${String(docName || '').trim()}::${userId}`;
}

function getCollabDraftStorageKey(docName = S.currentFile) {
  return `${COLLAB_DRAFT_STORAGE_PREFIX}${encodeURIComponent(getCollabDraftKey(docName))}`;
}

function openCollabDraftDb() {
  if (!window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(COLLAB_DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(COLLAB_DRAFT_STORE_NAME)) {
        db.createObjectStore(COLLAB_DRAFT_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function putCollabDraftRecord(record) {
  const db = await openCollabDraftDb();
  if (db) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(COLLAB_DRAFT_STORE_NAME, 'readwrite');
      tx.objectStore(COLLAB_DRAFT_STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('draft db write failed'));
    }).finally(() => db.close());
    return;
  }
  localStorage.setItem(getCollabDraftStorageKey(record.docName), JSON.stringify(record));
}

async function getCollabDraftRecord(docName = S.currentFile) {
  const key = getCollabDraftKey(docName);
  const db = await openCollabDraftDb();
  if (db) {
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(COLLAB_DRAFT_STORE_NAME, 'readonly');
        const request = tx.objectStore(COLLAB_DRAFT_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('draft db read failed'));
      }).finally(() => db.close());
    } catch (_) {
      // Fall through to localStorage fallback.
    }
  }
  try {
    return JSON.parse(localStorage.getItem(getCollabDraftStorageKey(docName)) || 'null');
  } catch (_) {
    return null;
  }
}

async function deleteCollabDraftRecord(docName = S.currentFile) {
  const key = getCollabDraftKey(docName);
  const db = await openCollabDraftDb();
  if (db) {
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(COLLAB_DRAFT_STORE_NAME, 'readwrite');
        tx.objectStore(COLLAB_DRAFT_STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('draft db delete failed'));
      }).finally(() => db.close());
    } catch (_) {
      // Keep fallback cleanup below.
    }
  }
  localStorage.removeItem(getCollabDraftStorageKey(docName));
}

function setLocalDraftState(pending, draft = null, error = '') {
  S.collab.localDraftPending = Boolean(pending);
  S.collab.localDraftUpdatedAt = draft?.updatedAt || '';
  S.collab.localDraftKey = draft?.key || '';
  S.collab.localDraftError = error || '';
}

async function saveLocalCollabDraft(documentHash = '') {
  if (!S.currentFile || !S.doc || S.readOnly || !S.runtime.supportsCollab) return;
  const profile = loadCollabUserProfile();
  const generation = Number(S.collab.localDraftGeneration || 0) + 1;
  S.collab.localDraftGeneration = generation;
  const draft = {
    key: getCollabDraftKey(S.currentFile),
    docName: S.currentFile,
    userId: profile.id,
    userName: profile.name,
    sessionId: profile.sessionId,
    baseSeq: Number(S.collab?.draftBaseSeqOverride ?? S.collab?.seq ?? 0),
    generation,
    updatedAt: new Date().toISOString(),
    contentHash: documentHash || hashCollabDocument(S.doc),
    document: cloneCollabDocument(S.doc),
  };
  try {
    await putCollabDraftRecord(draft);
    if (generation <= Number(S.collab.localDraftClearedGeneration || 0)) {
      await deleteCollabDraftRecord(draft.docName);
      return;
    }
    setLocalDraftState(true, draft);
    renderCollabStatus();
  } catch (error) {
    setLocalDraftState(true, draft, String(error?.message || error || 'draft save failed'));
    renderCollabStatus();
  }
}

async function clearLocalCollabDraft(docName = S.currentFile) {
  if (!docName) return;
  S.collab.localDraftClearedGeneration = Math.max(
    Number(S.collab.localDraftClearedGeneration || 0),
    Number(S.collab.localDraftGeneration || 0),
  );
  try {
    await deleteCollabDraftRecord(docName);
  } finally {
    setLocalDraftState(false);
    S.collab.draftBaseSeqOverride = null;
    renderCollabStatus();
  }
}

async function maybePromptLocalCollabDraftRecovery(docName = S.currentFile) {
  if (!docName || S.readOnly || !S.doc || S.collab?.checkingLocalDraft) return;
  S.collab.checkingLocalDraft = true;
  try {
    const draft = await getCollabDraftRecord(docName);
    if (!draft || !draft.document || draft.docName !== docName) {
      setLocalDraftState(false);
      return;
    }
    const currentHash = hashCollabDocument(S.doc);
    const draftHash = draft.contentHash || hashCollabDocument(draft.document);
    if (draftHash && currentHash && draftHash === currentHash) {
      await clearLocalCollabDraft(docName);
      return;
    }
    setLocalDraftState(true, draft);
    if (S.collab.promptingLocalDraft) return;
    S.collab.promptingLocalDraft = true;
    const confirmed = await showAppConfirm(
      `检测到当前浏览器存在未同步草稿（${formatCollabTime(draft.updatedAt || new Date().toISOString())}）。是否恢复草稿并立即同步？`,
      {
        title: '发现本地草稿',
        confirmLabel: '恢复并同步',
        cancelLabel: '稍后处理',
      },
    );
    if (confirmed && S.currentFile === docName) {
      S.doc = cloneCollabDocument(draft.document);
      hydrateDocumentForUi(S.doc);
      S.modified = true;
      S.collab.draftBaseSeqOverride = Number(draft.baseSeq || 0);
      S.collab.pendingSnapshot = true;
      render();
      queueCollabSnapshotSync();
      showAppToast('已恢复本地草稿，正在同步。');
    }
  } finally {
    S.collab.checkingLocalDraft = false;
    S.collab.promptingLocalDraft = false;
    renderCollabStatus();
  }
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
  const hasRemoteUpdate = Boolean(state.pendingRemoteSnapshot || state.hasConflict);
  const hasLocalDraft = Boolean(state.localDraftPending);
  const suffix = state.syncing
    ? ' · 同步中'
    : hasQueuedSnapshot
    ? ' · 待自动同步'
    : hasLocalDraft
    ? ' · 本地草稿待同步'
    : hasRemoteUpdate
    ? ' · 有更新待同步'
    : state.lastSyncedAt
    ? ' · 已同步'
    : '';
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

function getCollabDiagnosticsSnapshot() {
  const state = S.collab || {};
  const socket = state.socket || null;
  const users = Array.isArray(state.users) ? state.users : [];
  const userProfile = loadCollabUserProfile();
  const readyStateMap = {
    0: 'CONNECTING',
    1: 'OPEN',
    2: 'CLOSING',
    3: 'CLOSED',
  };
  return {
    document: S.currentFile || '',
    readOnly: Boolean(S.readOnly),
    currentUser: userProfile.name || '未设置',
    userId: userProfile.id || '',
    sessionId: userProfile.sessionId || '',
    connected: Boolean(state.connected),
    recovering: Boolean(state.recovering),
    seq: Number(state.seq || 0),
    clientId: state.clientId || '',
    socketReadyState: socket ? readyStateMap[socket.readyState] || String(socket.readyState) : 'NONE',
    fallbackMode: Boolean(state.fallbackMode),
    syncChannel: state.connected
      ? 'WebSocket'
      : state.fallbackMode
      ? 'HTTP 降级'
      : state.recovering
      ? '重连中'
      : '未连接',
    lastError: state.lastError || '',
    pendingSnapshot: Boolean(state.pendingSnapshot || state.snapshotTimer),
    syncing: Boolean(state.syncing),
    pendingRemote: Boolean(state.pendingRemoteSnapshot || state.hasConflict),
    localDraftPending: Boolean(state.localDraftPending),
    localDraftUpdatedAt: state.localDraftUpdatedAt || '',
    localDraftError: state.localDraftError || '',
    draftBaseSeq: state.draftBaseSeqOverride ?? null,
    lastSyncedAt: state.lastSyncedAt || '',
    lastActivity: state.lastActivity || null,
    users: users.map((item) => ({
      name: item?.name || item?.user || '',
      userId: item?.userId || item?.id || '',
      connectionCount: Number(item?.connectionCount || 1),
      sessionIds: Array.isArray(item?.sessionIds) ? item.sessionIds : [],
      remoteAddrs: Array.isArray(item?.remoteAddrs) ? item.remoteAddrs : [],
    })),
  };
}

function formatCollabDiagnosticsText(snapshot = getCollabDiagnosticsSnapshot()) {
  const lines = [
    `文档：${snapshot.document || '-'}`,
    `当前用户：${snapshot.currentUser || '-'}`,
    `连接状态：${snapshot.connected ? '已连接' : snapshot.recovering ? '重连中' : '未连接'}`,
    `Socket：${snapshot.socketReadyState}`,
    `当前同步通道：${snapshot.syncChannel}`,
    `降级轮询：${snapshot.fallbackMode ? '是' : '否'}`,
    `Seq：${snapshot.seq}`,
    `ClientId：${snapshot.clientId || '-'}`,
    `待自动同步：${snapshot.pendingSnapshot ? '是' : '否'}`,
    `同步中：${snapshot.syncing ? '是' : '否'}`,
    `远端更新待同步：${snapshot.pendingRemote ? '是' : '否'}`,
    `本地草稿：${snapshot.localDraftPending ? '有' : '无'}`,
    `草稿时间：${snapshot.localDraftUpdatedAt || '-'}`,
    `草稿基线Seq：${snapshot.draftBaseSeq ?? '-'}`,
    `最近同步：${snapshot.lastSyncedAt || '-'}`,
    `最近错误：${snapshot.lastError || '-'}`,
    `最近活动：${snapshot.lastActivity?.user ? `${snapshot.lastActivity.user} / ${snapshot.lastActivity.mode || ''} / ${snapshot.lastActivity.at || ''}` : '-'}`,
    '在线用户：',
  ];
  if (!snapshot.users.length) {
    lines.push('- 暂无');
  } else {
    snapshot.users.forEach((user) => {
      lines.push(`- ${user.name || '未设置'} (${user.connectionCount || 1} 个窗口) ${user.userId || ''}`);
    });
  }
  return lines.join('\n');
}

function renderCollabDiagnosticsModal() {
  const container = document.getElementById('collab-diagnostics-content');
  if (!container) return;
  const snapshot = getCollabDiagnosticsSnapshot();
  const statusText = snapshot.connected ? '已连接' : snapshot.recovering ? '重连恢复中' : '未连接';
  const lastActivityText = snapshot.lastActivity?.user
    ? `${snapshot.lastActivity.user} / ${snapshot.lastActivity.mode || ''} / ${snapshot.lastActivity.at || ''}`
    : '-';
  const errorHtml = snapshot.lastError
    ? `<div class="collab-diagnostic-error"><span>最近错误</span><strong>${escapeCollabHtml(snapshot.lastError)}</strong></div>`
    : '';
  const usersHtml = snapshot.users.length
    ? snapshot.users.map((user) => `
        <div class="collab-diagnostic-user">
          <strong>${escapeCollabHtml(user.name || '未设置用户')}</strong>
          <span>${Number(user.connectionCount || 1)} 个窗口</span>
        </div>
      `).join('')
    : '<div class="diag-empty">暂无在线用户。</div>';
  container.innerHTML = `
    <div class="collab-diagnostic-grid">
      <div><span>文档</span><strong>${escapeCollabHtml(snapshot.document || '-')}</strong></div>
      <div><span>连接状态</span><strong>${escapeCollabHtml(statusText)}</strong></div>
      <div><span>同步通道</span><strong>${escapeCollabHtml(snapshot.syncChannel)}</strong></div>
      <div><span>Socket</span><strong>${escapeCollabHtml(snapshot.socketReadyState)}</strong></div>
      <div><span>Seq</span><strong>${snapshot.seq}</strong></div>
      <div><span>待自动同步</span><strong>${snapshot.pendingSnapshot ? '是' : '否'}</strong></div>
      <div><span>同步中</span><strong>${snapshot.syncing ? '是' : '否'}</strong></div>
      <div><span>远端更新</span><strong>${snapshot.pendingRemote ? '待同步' : '无'}</strong></div>
      <div><span>本地草稿</span><strong>${snapshot.localDraftPending ? '有' : '无'}</strong></div>
      <div><span>草稿时间</span><strong>${escapeCollabHtml(snapshot.localDraftUpdatedAt ? formatCollabTime(snapshot.localDraftUpdatedAt) : '-')}</strong></div>
      <div><span>降级轮询</span><strong>${snapshot.fallbackMode ? '是' : '否'}</strong></div>
      <div><span>最近同步</span><strong>${escapeCollabHtml(snapshot.lastSyncedAt || '-')}</strong></div>
      <div><span>最近活动</span><strong>${escapeCollabHtml(lastActivityText)}</strong></div>
    </div>
    ${errorHtml}
    ${snapshot.localDraftError ? `<div class="collab-diagnostic-error"><span>草稿错误</span><strong>${escapeCollabHtml(snapshot.localDraftError)}</strong></div>` : ''}
    <div class="collab-diagnostic-section">
      <h4>在线用户</h4>
      <div class="collab-diagnostic-users">${usersHtml}</div>
    </div>
    <details class="collab-diagnostic-raw" open>
      <summary>原始诊断信息</summary>
      <pre>${escapeCollabHtml(formatCollabDiagnosticsText(snapshot))}</pre>
    </details>
  `;
}

function openCollabDiagnosticsModal() {
  renderCollabDiagnosticsModal();
  openModalById('collab-diagnostics-modal-overlay');
}

function closeCollabDiagnosticsModal() {
  closeModalById('collab-diagnostics-modal-overlay');
}

async function copyCollabDiagnostics() {
  const copied = await copyTextToClipboard(formatCollabDiagnosticsText());
  showAppToast(copied ? '协作诊断信息已复制。' : '复制失败，请手动展开诊断信息复制。');
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
  S.collab.recovering = false;
  S.collab.everConnected = false;
  S.collab.userName = userProfile.name;
  S.collab.docName = docName;
  S.collab.users = [];
  S.collab.pendingSnapshot = false;
  S.collab.syncing = false;
  S.collab.snapshotRevision = 0;
  S.collab.inFlightRevision = 0;
  S.collab.queuedDocumentHash = '';
  S.collab.inFlightDocumentHash = '';
  S.collab.lastSyncedDocumentHash = hashCollabDocument(S.modified ? (S.baseDocument || null) : S.doc);
  S.collab.fallbackMode = false;
  S.collab.lastAcceptedDocument = S.doc ? cloneCollabDocument(S.doc) : null;
  S.collab.localDraftKey = getCollabDraftKey(docName);
  S.collab.draftBaseSeqOverride = null;
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
      if (S.collab.everConnected && S.collab.shouldReconnect && S.currentFile === docName && !S.readOnly) {
        S.collab.recovering = true;
        startCollabPollingFallback();
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
      if (S.collab.everConnected && S.collab.shouldReconnect && S.currentFile === docName && !S.readOnly) {
        S.collab.recovering = true;
        startCollabPollingFallback();
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
  if (S.collab?.pollTimer) {
    clearInterval(S.collab.pollTimer);
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
  S.collab.queuedDocumentHash = '';
  S.collab.inFlightDocumentHash = '';
  S.collab.lastSyncedDocumentHash = '';
  S.collab.fallbackMode = false;
  S.collab.pollTimer = null;
  S.collab.pendingRemoteSnapshot = null;
  S.collab.hasConflict = false;
  S.collab.lastAcceptedDocument = null;
  S.collab.localDraftPending = false;
  S.collab.localDraftUpdatedAt = '';
  S.collab.localDraftError = '';
  S.collab.localDraftKey = '';
  S.collab.draftBaseSeqOverride = null;
  S.collab.recovering = false;
  S.collab.everConnected = false;
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
        startCollabPollingFallback();
        resolve(false);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

function startCollabPollingFallback() {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly) return;
  S.collab.fallbackMode = true;
  if (S.collab.pollTimer) {
    renderCollabStatus();
    return;
  }
  pollCollabOnce();
  S.collab.pollTimer = window.setInterval(() => {
    pollCollabOnce();
  }, COLLAB_POLL_MS);
  renderCollabStatus();
}

function stopCollabPollingFallback() {
  if (S.collab?.pollTimer) {
    window.clearInterval(S.collab.pollTimer);
    S.collab.pollTimer = null;
  }
  S.collab.fallbackMode = false;
}

async function pollCollabOnce() {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly || !api?.collabPoll) return;
  try {
    const result = await api.collabPoll(S.currentFile, S.collab?.seq || 0);
    if (!result || result.error) return;
    S.collab.seq = Number(result.seq || S.collab.seq || 0);
    S.collab.users = Array.isArray(result.users) ? result.users : S.collab.users || [];
    if (result.changed && result.document && typeof result.document === 'object') {
      receiveRemoteCollabSnapshot(result.document);
    }
    renderCollabStatus();
  } catch (error) {
    S.collab.lastError = String(error?.message || error || 'poll failed');
    renderCollabStatus();
  }
}

function cloneCollabDocument(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value || null));
}

function hashCollabDocument(value) {
  let text = '';
  try {
    text = JSON.stringify(value || null);
  } catch (_) {
    return '';
  }
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function getCollabItemKey(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  return String(item.uid || item.id || '').trim();
}

function mergeLocalArrayChanges(remoteValue, baseValue, localValue) {
  if (!Array.isArray(localValue) || !Array.isArray(baseValue) || !Array.isArray(remoteValue)) return cloneCollabDocument(localValue);
  const localKeys = localValue.map(getCollabItemKey);
  const baseKeys = baseValue.map(getCollabItemKey);
  const remoteKeys = remoteValue.map(getCollabItemKey);
  const canMergeByKey = localKeys.every(Boolean) && baseKeys.every(Boolean) && remoteKeys.every(Boolean);
  if (!canMergeByKey) {
    return JSON.stringify(localValue) === JSON.stringify(baseValue) ? cloneCollabDocument(remoteValue) : cloneCollabDocument(localValue);
  }
  const next = remoteValue.map((item) => cloneCollabDocument(item));
  const baseMap = new Map(baseValue.map((item) => [getCollabItemKey(item), item]));
  const localMap = new Map(localValue.map((item) => [getCollabItemKey(item), item]));
  const remoteIndexMap = new Map(next.map((item, index) => [getCollabItemKey(item), index]));

  for (const key of baseKeys) {
    if (localMap.has(key)) continue;
    const remoteIndex = remoteIndexMap.get(key);
    if (remoteIndex !== undefined) {
      next.splice(remoteIndex, 1);
      remoteIndexMap.clear();
      next.forEach((item, index) => remoteIndexMap.set(getCollabItemKey(item), index));
    }
  }

  for (const localItem of localValue) {
    const key = getCollabItemKey(localItem);
    const baseItem = baseMap.get(key);
    const remoteIndex = remoteIndexMap.get(key);
    if (!baseItem) {
      if (remoteIndex === undefined) next.push(cloneCollabDocument(localItem));
      continue;
    }
    if (remoteIndex !== undefined) {
      next[remoteIndex] = mergeLocalDocumentChanges(next[remoteIndex], baseItem, localItem);
    }
  }
  return next;
}

function mergeLocalDocumentChanges(remoteValue, baseValue, localValue) {
  if (JSON.stringify(localValue) === JSON.stringify(baseValue)) return cloneCollabDocument(remoteValue);
  if (Array.isArray(localValue) || Array.isArray(baseValue) || Array.isArray(remoteValue)) {
    return mergeLocalArrayChanges(remoteValue, baseValue, localValue);
  }
  if (!localValue || typeof localValue !== 'object' || !baseValue || typeof baseValue !== 'object' || !remoteValue || typeof remoteValue !== 'object') {
    return cloneCollabDocument(localValue);
  }
  const next = cloneCollabDocument(remoteValue);
  const keys = new Set([...Object.keys(localValue), ...Object.keys(baseValue)]);
  keys.forEach((key) => {
    if (!(key in localValue)) {
      delete next[key];
      return;
    }
    next[key] = mergeLocalDocumentChanges(next[key], baseValue[key], localValue[key]);
  });
  return next;
}

function hasPendingRemoteCollabSnapshot() {
  return Boolean(S.collab?.pendingRemoteSnapshot || S.collab?.hasConflict);
}

function preserveLocalSnapshotForImmediateSync() {
  if (!hasPendingRemoteCollabSnapshot()) return false;
  const remote = S.collab.pendingRemoteSnapshot;
  const base = S.collab.lastAcceptedDocument || S.baseDocument;
  if (remote && base && S.doc) {
    S.doc = mergeLocalDocumentChanges(remote, base, S.doc);
    hydrateDocumentForUi(S.doc);
    S.collab.pendingMergedRender = true;
  }
  S.collab.pendingRemoteSnapshot = null;
  S.collab.hasConflict = false;
  S.collab.pendingSnapshot = true;
  renderCollabConflictBanner();
  if (typeof renderToolbar === 'function') renderToolbar();
  return true;
}

async function syncCollabImmediatelyFromCommand() {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly) return false;
  if (typeof flushCollabSnapshotSync !== 'function') return false;
  const ready = await waitForCollabReady();
  if (!ready) {
    const syncedByHttp = await flushCollabSnapshotHttp();
    showAppToast(syncedByHttp ? '已通过降级通道完成同步。' : '协作连接尚未就绪，请稍后再试。');
    return true;
  }
  const resolvedRemoteConflict = preserveLocalSnapshotForImmediateSync();
  if (!S.modified && !resolvedRemoteConflict && !S.collab.pendingSnapshot && !S.collab.snapshotTimer && !S.collab.syncing) {
    showAppToast('当前内容已同步。');
    return true;
  }
  flushCollabSnapshotSync();
  showAppToast('已发起立即同步。');
  return true;
}

async function flushCollabSnapshotHttp() {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly || !S.doc || !api?.collabSnapshot) return false;
  const documentHash = hashCollabDocument(S.doc);
  if (documentHash && documentHash === S.collab.lastSyncedDocumentHash && !hasPendingRemoteCollabSnapshot()) {
    S.modified = false;
    S.collab.pendingSnapshot = false;
    await clearLocalCollabDraft(S.currentFile);
    return true;
  }
  S.collab.syncing = true;
  S.collab.pendingSnapshot = false;
  S.collab.inFlightDocumentHash = documentHash;
  renderCollabStatus();
  if (typeof renderToolbar === 'function') renderToolbar();
  try {
    const result = await api.collabSnapshot(S.currentFile, S.doc, {
      baseSeq: Number(S.collab.draftBaseSeqOverride ?? S.collab.seq ?? 0),
      documentHash,
      user: getCollabUserProfile(),
    });
    if (!result || result.error) {
      S.collab.pendingSnapshot = true;
      S.collab.lastError = result?.error || 'HTTP snapshot failed';
      return false;
    }
    S.collab.seq = Number(result.seq || S.collab.seq || 0);
    if (result.document && typeof result.document === 'object') {
      S.doc = result.document;
      hydrateDocumentForUi(S.doc);
    }
    S.modified = false;
    S.collab.pendingSnapshot = false;
    S.collab.lastSyncedAt = new Date().toISOString();
    S.collab.lastAcceptedDocument = S.doc ? cloneCollabDocument(S.doc) : null;
    S.collab.lastSyncedDocumentHash = hashCollabDocument(S.doc);
    S.collab.queuedDocumentHash = S.collab.lastSyncedDocumentHash;
    S.collab.inFlightDocumentHash = '';
    await clearLocalCollabDraft(S.currentFile);
    startCollabPollingFallback();
    if (!hasActiveLocalEditingContext()) render();
    if (typeof renderToolbar === 'function') renderToolbar();
    renderCollabStatus();
    return true;
  } catch (error) {
    S.collab.pendingSnapshot = true;
    S.collab.lastError = String(error?.message || error || 'HTTP snapshot failed');
    return false;
  } finally {
    S.collab.syncing = false;
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
  }
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
    stopCollabPollingFallback();
    S.collab.everConnected = true;
    S.collab.clientId = String(payload.clientId || '');
    S.collab.seq = Number(payload.seq || 0);
    S.collab.users = Array.isArray(payload.users) ? payload.users : [];
    renderCollabStatus();
    renderCollabReconnectOverlay();
    if (typeof renderToolbar === 'function') renderToolbar();
    if (S.modified || S.collab.pendingSnapshot) {
      flushCollabSnapshotSync();
    } else {
      setTimeout(() => {
        maybePromptLocalCollabDraftRecovery(S.currentFile);
      }, 100);
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
        S.collab.lastSyncedDocumentHash = hashCollabDocument(S.doc);
        S.collab.queuedDocumentHash = S.collab.lastSyncedDocumentHash;
        S.collab.inFlightDocumentHash = '';
        S.collab.lastAcceptedDocument = S.doc ? cloneCollabDocument(S.doc) : null;
        clearLocalCollabDraft(S.currentFile);
        if (S.collab.pendingMergedRender && !hasActiveLocalEditingContext()) {
          S.collab.pendingMergedRender = false;
          render();
        } else {
          S.collab.pendingMergedRender = false;
        }
        if (typeof renderToolbar === 'function') renderToolbar();
      }
      S.collab.lastSyncedAt = new Date().toISOString();
      renderCollabStatus();
    }
    return;
  }
  if (payload.type === 'error') {
    S.collab.syncing = false;
    S.collab.pendingSnapshot = true;
    S.collab.lastError = payload.message || '同步失败';
    if (S.collab.snapshotTimer) {
      clearTimeout(S.collab.snapshotTimer);
      S.collab.snapshotTimer = null;
    }
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
    showAppToast(payload.message || '同步失败，请重新打开文档后再试。');
  }
}

function queueCollabSnapshotSync() {
  if (S.readOnly || !S.runtime.supportsCollab || !S.doc) return;
  const documentHash = hashCollabDocument(S.doc);
  if (
    documentHash
    && documentHash === S.collab.lastSyncedDocumentHash
    && !hasPendingRemoteCollabSnapshot()
    && !S.collab.syncing
  ) {
    S.collab.pendingSnapshot = false;
    S.modified = false;
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
    return;
  }
  if (
    documentHash
    && documentHash === S.collab.queuedDocumentHash
    && (S.collab.pendingSnapshot || S.collab.snapshotTimer || S.collab.syncing)
  ) {
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
    return;
  }
  S.collab.snapshotRevision = Number(S.collab.snapshotRevision || 0) + 1;
  S.collab.pendingSnapshot = true;
  S.collab.queuedDocumentHash = documentHash;
  saveLocalCollabDraft(documentHash);
  if (!S.collab?.connected || S.collab?.socket?.readyState !== WebSocket.OPEN) {
    if (S.currentFile && S.collab?.everConnected) S.collab.recovering = true;
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
  const documentHash = hashCollabDocument(S.doc);
  if (
    documentHash
    && documentHash === S.collab.lastSyncedDocumentHash
    && !hasPendingRemoteCollabSnapshot()
  ) {
    S.collab.snapshotTimer = null;
    S.collab.pendingSnapshot = false;
    S.collab.syncing = false;
    S.modified = false;
    clearLocalCollabDraft(S.currentFile);
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
    return;
  }
  S.collab.snapshotTimer = null;
  S.collab.pendingSnapshot = false;
  S.collab.syncing = true;
  S.collab.inFlightRevision = S.collab.snapshotRevision || 0;
  S.collab.inFlightDocumentHash = documentHash;
  S.collab.queuedDocumentHash = documentHash;
  renderCollabStatus();
  if (typeof renderToolbar === 'function') renderToolbar();
  socket.send(JSON.stringify({
    type: 'snapshot',
    baseSeq: Number(S.collab.draftBaseSeqOverride ?? S.collab.seq ?? 0),
    documentHash,
    document: S.doc,
  }));
}

function hasLocalPendingCollabSnapshot() {
  return Boolean(S.modified || S.collab?.localDraftPending || S.collab?.pendingSnapshot || S.collab?.syncing || S.collab?.snapshotTimer);
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
  S.collab.lastAcceptedDocument = cloneCollabDocument(document);
  S.collab.lastSyncedDocumentHash = hashCollabDocument(document);
  S.collab.queuedDocumentHash = S.collab.lastSyncedDocumentHash;
  S.collab.inFlightDocumentHash = '';
  S.collab.pendingRemoteSnapshot = null;
  S.collab.hasConflict = false;
  hydrateDocumentForUi(S.doc);
  render();
  renderCollabStatus();
}

function receiveRemoteCollabSnapshot(document) {
  if (!document || typeof document !== 'object') return;
  if (hasLocalPendingCollabSnapshot() || hasActiveLocalEditingContext()) {
    S.collab.pendingRemoteSnapshot = document;
    S.collab.hasConflict = true;
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
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
  preserveLocalSnapshotForImmediateSync();
  flushCollabSnapshotSync();
}

function deferCollabConflict() {
  renderCollabConflictBanner();
}

function applyRemoteCollabChanges(changes) {
  if (!Array.isArray(changes) || !S.doc) return;
  if (hasActiveLocalEditingContext()) {
    const draft = S.collab?.pendingRemoteSnapshot
      ? JSON.parse(JSON.stringify(S.collab.pendingRemoteSnapshot))
      : JSON.parse(JSON.stringify(S.doc));
    let remoteChanged = false;
    changes.forEach((change) => {
      const path = String(change?.path || '').trim();
      if (!path) return;
      if (setCollabPathValue(draft, path, change.new)) remoteChanged = true;
    });
    if (remoteChanged) {
      S.collab.pendingRemoteSnapshot = draft;
      S.collab.hasConflict = true;
      renderCollabStatus();
      if (typeof renderToolbar === 'function') renderToolbar();
    }
    return;
  }
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

function hasActiveLocalEditingContext() {
  if (!S.doc || S.readOnly) return false;
  const dialogMode = String(S.ui?.businessModelDialog?.mode || '');
  if (dialogMode) return true;
  if (S.ui?.entityDraft) return true;
  if (S.ui?.tab === 'data' && (S.ui.dataView || 'relation') === 'relation' && !S.ui.entityRelationEditorCollapsed && S.ui.entityId) return true;
  if (S.ui?.tab === 'data' && (S.ui.dataView || 'relation') === 'state' && !S.ui.stateEditorCollapsed) return true;
  if (S.ui?.tab === 'process' && S.ui.procView === 'list' && S.ui.taskId) return true;
  return false;
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
