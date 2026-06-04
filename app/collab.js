'use strict';

const COLLAB_SNAPSHOT_DEBOUNCE_MS = 5000;
const COLLAB_RECONNECT_MS = 3000;
const COLLAB_PING_MS = 10000;
const COLLAB_POLL_MS = 10000;
const COLLAB_ACTIVE_SYNC_ONLY = true;
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
    wsClientId: S.collab?.clientId || '',
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
    baseSeq: Number(S.collab?.draftBaseSeqOverride ?? S.collab?.acceptedSeq ?? S.collab?.seq ?? 0),
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
      // 草稿内容与服务端一致，说明已由其他浏览器同步过，自动清除
      await clearLocalCollabDraft(docName);
      return;
    }
    setLocalDraftState(true, draft);
    if (S.collab.promptingLocalDraft) return;
    S.collab.promptingLocalDraft = true;
    const draftSeq = Number(draft.baseSeq || 0);
    const serverSeq = Number(S.collab?.seq || 0);
    const behindInfo = draftSeq < serverSeq
      ? `\n\n注意：草稿基准版本(seq=${draftSeq})落后于服务端当前版本(seq=${serverSeq})，可能已有其他人在此期间修改了文档。`
      : '';
    const confirmed = await showAppConfirm(
      `检测到当前浏览器存在未同步草稿（${formatCollabTime(draft.updatedAt || new Date().toISOString())}）。是否恢复草稿并立即同步？${behindInfo}`,
      {
        title: '发现本地草稿',
        confirmLabel: '恢复并同步',
        cancelLabel: '丢弃草稿（使用最新版）',
      },
    );
    if (!confirmed) {
      await clearLocalCollabDraft(docName);
      return;
    }
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
    ? ' · 待同步'
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
    acceptedSeq: Number(state.acceptedSeq || 0),
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
    `本地基线Seq：${snapshot.acceptedSeq}`,
    `ClientId：${snapshot.clientId || '-'}`,
    `待同步：${snapshot.pendingSnapshot ? '是' : '否'}`,
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
      <div><span>本地基线</span><strong>${snapshot.acceptedSeq}</strong></div>
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
    <details class="collab-diagnostic-raw">
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
  // v2: 弱网环境不弹窗阻塞，只在状态栏提示
  const overlay = document.getElementById('collab-reconnect-overlay');
  overlay?.classList.add('hidden');
  document.body?.classList.remove('is-collab-reconnecting');
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
  S.collab.acceptedSeq = 0;
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
  S.collab.forceSnapshotSync = false;
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
    if (result.changed) {
      receiveRemoteCollabNotice();
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
  S.collab.forceSnapshotSync = true;
  renderCollabConflictBanner();
  if (typeof renderToolbar === 'function') renderToolbar();
  return true;
}

async function syncCollabImmediatelyFromCommand() {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly) return false;
  // 总是走 HTTP 同步，不依赖 WebSocket 状态
  preserveLocalSnapshotForImmediateSync();
  const syncedByHttp = await flushCollabSnapshotHttp();
  if (syncedByHttp) {
    S.collab.hasConflict = false;
    S.collab.forceSnapshotSync = false;
    renderCollabConflictBanner();
  }
  showAppToast(syncedByHttp ? '已同步。' : `同步失败：${S.collab.lastError || '请稍后重试'}`);
  return true;
}

async function flushCollabSnapshotHttp() {
  if (!S.currentFile || !S.runtime.supportsCollab || S.readOnly || !S.doc || !api?.collabSnapshot) return false;
  const documentHash = hashCollabDocument(S.doc);
  if (documentHash && documentHash === S.collab.lastSyncedDocumentHash && !hasPendingRemoteCollabSnapshot() && !S.collab.forceSnapshotSync) {
    S.modified = false;
    S.collab.pendingSnapshot = false;
    await clearLocalCollabDraft(S.currentFile);
    return true;
  }
  // 冻结当前文档快照，防止同步期间用户继续编辑导致发送不一致内容
  const frozenDoc = cloneCollabDocument(S.doc);
  const frozenHash = hashCollabDocument(frozenDoc);
  S.collab.syncing = true;
  S.collab.pendingSnapshot = false;
  S.collab.inFlightDocumentHash = frozenHash;
  renderCollabStatus();
  if (typeof renderToolbar === 'function') renderToolbar();
  // 显示保存进度
  if (typeof setSaveProgress === 'function') {
    setSaveProgress(true, 30, '正在同步协作内容...', '正在发送文档到服务端进行合并。');
  }
  try {
    const result = await api.collabSnapshot(S.currentFile, frozenDoc, {
      baseSeq: Number(S.collab.draftBaseSeqOverride ?? S.collab.acceptedSeq ?? S.collab.seq ?? 0),
      documentHash: frozenHash,
      user: getCollabUserProfile(),
    });
    if (!result || result.error) {
      S.collab.pendingSnapshot = true;
      S.collab.lastError = result?.error || 'HTTP snapshot failed';
      return false;
    }
    if (typeof setSaveProgress === 'function') {
      setSaveProgress(true, 70, '正在接收合并结果...', '服务端已完成合并，正在刷新本地内容。');
    }
    S.collab.seq = Number(result.seq || S.collab.seq || 0);
    S.collab.acceptedSeq = S.collab.seq;
    // 检测同步期间用户是否有新编辑
    const postSyncHash = hashCollabDocument(S.doc);
    const hadNewEditsDuringSync = frozenHash !== postSyncHash;
    if (result.conflictCount > 0) {
      // 有冲突 → 先关闭等待框，再弹冲突裁决界面
      if (typeof setSaveProgress === 'function') setSaveProgress(false);
      const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
      const resolution = await showCollabConflictDialog(conflicts);
      if (resolution === 'mine') {
        // 用户选择保留自己的版本：恢复冻结文档，标记待同步
        S.doc = frozenDoc;
        hydrateDocumentForUi(S.doc);
        S.modified = true;
        S.collab.pendingSnapshot = true;
        S.collab.hasConflict = false;
        S.collab.acceptedSeq = S.collab.seq;
        renderCollabConflictBanner();
        renderCollabStatus();
        const snapMine = captureScrollSnapshots();
        render();
        restoreScrollSnapshots(snapMine);
        if (typeof renderToolbar === 'function') renderToolbar();
        if (typeof loadWorkspaceDocumentSummaries === 'function') void loadWorkspaceDocumentSummaries();
        return true;
      }
      // 使用服务端版本
      if (result.document && typeof result.document === 'object') {
        S.doc = result.document;
        hydrateDocumentForUi(S.doc);
      }
      S.modified = false;
      S.collab.pendingSnapshot = false;
      S.collab.hasConflict = false;
      S.collab.acceptedSeq = S.collab.seq;
      S.collab.lastSyncedDocumentHash = hashCollabDocument(S.doc);
      await clearLocalCollabDraft(S.currentFile);
      renderCollabConflictBanner();
      renderCollabStatus();
      const snapServer = captureScrollSnapshots();
      render();
      restoreScrollSnapshots(snapServer);
      if (typeof loadWorkspaceDocumentSummaries === 'function') void loadWorkspaceDocumentSummaries();
      return true;
    }
    if (result.document && typeof result.document === 'object') {
      S.doc = result.document;
      hydrateDocumentForUi(S.doc);
    }
    S.modified = hadNewEditsDuringSync;
    S.collab.pendingSnapshot = hadNewEditsDuringSync;
    S.collab.lastSyncedAt = new Date().toISOString();
    S.collab.lastAcceptedDocument = S.doc ? cloneCollabDocument(S.doc) : null;
    S.collab.lastSyncedDocumentHash = hashCollabDocument(S.doc);
    S.collab.queuedDocumentHash = S.collab.lastSyncedDocumentHash;
    S.collab.inFlightDocumentHash = '';
    S.collab.forceSnapshotSync = false;
    await clearLocalCollabDraft(S.currentFile);
    startCollabPollingFallback();
    // 保存滚动位置，render() 后恢复，避免界面跳动
    const scrollSnap = captureScrollSnapshots();
    render();
    restoreScrollSnapshots(scrollSnap);
    if (typeof renderToolbar === 'function') renderToolbar();
    renderCollabStatus();
    if (typeof setSaveProgress === 'function') {
      setSaveProgress(true, 100, hadNewEditsDuringSync ? '同步完成（有新修改待同步）' : '同步完成', '文档已更新到最新版本。');
      setTimeout(() => setSaveProgress(false), 350);
    }
    if (hadNewEditsDuringSync) {
      queueCollabSnapshotSync();
    }
    // 刷新文件摘要缓存（团队空间/标签可能在本次保存中变更）
    if (typeof loadWorkspaceDocumentSummaries === 'function') {
      void loadWorkspaceDocumentSummaries();
    }
    return true;
  } catch (error) {
    S.collab.pendingSnapshot = true;
    S.collab.lastError = String(error?.message || error || 'HTTP snapshot failed');
    return false;
  } finally {
    S.collab.syncing = false;
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
    if (typeof setSaveProgress === 'function') {
      setTimeout(() => setSaveProgress(false), 350);
    }
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
    S.collab.acceptedSeq = S.collab.seq;
    S.collab.users = Array.isArray(payload.users) ? payload.users : [];
    renderCollabStatus();
    renderCollabReconnectOverlay();
    if (typeof renderToolbar === 'function') renderToolbar();
    if (S.modified || S.collab.pendingSnapshot) {
      saveLocalCollabDraft(hashCollabDocument(S.doc));
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
    receiveRemoteCollabNotice();
    return;
  }
  if (payload.type === 'snapshot' || payload.type === 'snapshot_notice') {
    S.collab.seq = Number(payload.seq || S.collab.seq || 0);
    S.collab.lastActivity = {
      user: getCollabPayloadUserName(payload),
      mode: 'snapshot',
      at: new Date().toISOString(),
    };
    receiveRemoteCollabNotice();
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
        S.collab.acceptedSeq = S.collab.seq;
        S.collab.forceSnapshotSync = false;
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
  if (COLLAB_ACTIVE_SYNC_ONLY) {
    if (S.collab.snapshotTimer) {
      clearTimeout(S.collab.snapshotTimer);
      S.collab.snapshotTimer = null;
    }
    renderCollabStatus();
    if (typeof renderToolbar === 'function') renderToolbar();
    return;
  }
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
    && !S.collab.forceSnapshotSync
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
    baseSeq: Number(S.collab.draftBaseSeqOverride ?? S.collab.acceptedSeq ?? S.collab.seq ?? 0),
    documentHash,
    document: S.doc,
  }));
}

function hasLocalPendingCollabSnapshot() {
  return Boolean(S.modified || S.collab?.localDraftPending || S.collab?.pendingSnapshot || S.collab?.syncing || S.collab?.snapshotTimer);
}

function sendCollabChange(path, oldValue, newValue) {
  if (COLLAB_ACTIVE_SYNC_ONLY) return;
  const socket = S.collab?.socket;
  if (S.readOnly || !socket || socket.readyState !== WebSocket.OPEN || !S.collab.connected) return;
  socket.send(JSON.stringify({
    type: 'change',
    baseSeq: S.collab.acceptedSeq || S.collab.seq || 0,
    changes: [{ path, old: oldValue, new: newValue }],
  }));
}

function sendCollabChanges(changes) {
  if (COLLAB_ACTIVE_SYNC_ONLY) return;
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
    baseSeq: S.collab.acceptedSeq || S.collab.seq || 0,
    changes: normalized,
  }));
}

function applyRemoteCollabSnapshot(document) {
  if (!document || typeof document !== 'object') return;
  S.doc = document;
  S.collab.acceptedSeq = Number(S.collab.seq || S.collab.acceptedSeq || 0);
  S.collab.lastAcceptedDocument = cloneCollabDocument(document);
  S.collab.lastSyncedDocumentHash = hashCollabDocument(document);
  S.collab.queuedDocumentHash = S.collab.lastSyncedDocumentHash;
  S.collab.inFlightDocumentHash = '';
  S.collab.pendingRemoteSnapshot = null;
  S.collab.hasConflict = false;
  S.collab.forceSnapshotSync = false;
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

function receiveRemoteCollabNotice() {
  S.collab.pendingRemoteSnapshot = null;
  S.collab.hasConflict = true;
  S.collab.forceSnapshotSync = true;
  renderCollabStatus();
  if (typeof renderToolbar === 'function') renderToolbar();
}

function showCollabConflictDialog(conflicts) {
  return new Promise((resolve) => {
    const conflictList = (conflicts || []).map((c, i) => {
      // 兼容两种冲突来源：collab meta（user/server/字段名）和 merge 引擎（left_value/right_value）
      const userVal = formatCollabConflictValue(c.user ?? c.left_value);
      const serverVal = formatCollabConflictValue(c.server ?? c.right_value);
      const rawPath = c.path || '';
      const label = c.label
        || formatCollabConflictField(rawPath)
        || (c.kind ? `${c.kind} - ${c.item_type || ''}`.replace(/_/g, ' ') : rawPath);
      return `<div class="collab-conflict-item" data-conflict-index="${i}">
        <div class="collab-conflict-field">${esc(label)}</div>
        <div class="collab-conflict-cols">
          <div class="collab-conflict-col">
            <div class="collab-conflict-label">我的版本</div>
            <pre>${esc(userVal)}</pre>
            <button class="btn btn-outline btn-sm collab-conflict-choose" data-choice="mine" data-index="${i}">保留此项</button>
          </div>
          <div class="collab-conflict-col">
            <div class="collab-conflict-label">服务端版本</div>
            <pre>${esc(serverVal)}</pre>
            <button class="btn btn-outline btn-sm collab-conflict-choose" data-choice="server" data-index="${i}">保留此项</button>
          </div>
        </div>
      </div>`;
    }).join('');

    const html = `<div class="modal-overlay collab-conflict-overlay" id="collab-conflict-modal">
      <div class="modal collab-conflict-dialog">
        <h3>检测到 ${conflicts.length} 处修改冲突</h3>
        <p class="field-hint">以下字段被你和其他人同时修改了，请逐项选择保留哪个版本，或使用底部按钮一键处理。</p>
        <div class="collab-conflict-list">${conflictList}</div>
        <div class="collab-conflict-actions" style="justify-content:flex-end;gap:10px;margin-top:10px">
          <button class="btn btn-outline" id="collab-conflict-all-mine">全部保留我的版本</button>
          <button class="btn btn-primary" id="collab-conflict-all-server">全部使用服务端版本</button>
        </div>
      </div>
    </div>`;

    const overlay = document.createElement('div');
    overlay.innerHTML = html;
    document.body.appendChild(overlay.firstElementChild);

    const cleanup = () => {
      const modal = document.getElementById('collab-conflict-modal');
      if (modal) modal.remove();
    };

    // Per-field choices: highlight the selected one
    document.querySelectorAll('.collab-conflict-choose').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const item = btn.closest('.collab-conflict-item');
        item.querySelectorAll('.collab-conflict-choose').forEach((b) => b.classList.remove('btn-primary'));
        btn.classList.add('btn-primary');
      };
    });

    document.getElementById('collab-conflict-all-mine').onclick = () => { cleanup(); resolve('mine'); };
    document.getElementById('collab-conflict-all-server').onclick = () => { cleanup(); resolve('server'); };
  });
}

function formatCollabConflictField(path) {
  const map = {
    'meta.title': '文档标题',
    'meta.domain': '文档标识',
    'meta.author': '文档作者',
    'meta.date': '文档日期',
    'meta.space': '所属空间',
    'meta.tags': '标签',
    'meta.revision': '版本号',
  };
  if (map[path]) return map[path];
  // 去掉技术前缀，翻译常见字段
  return path
    .replace(/^meta\./, '')
    .replace(/^roles\[\d+\]\./, '角色 · ')
    .replace(/^processes\[\d+\]\./, '流程 · ')
    .replace(/^entities\[\d+\]\./, '实体 · ')
    .replace(/^stages\[\d+\]\./, '阶段 · ')
    .replace(/^panorama\./, '全景 · ')
    .replace(/\./g, ' → ');
}

function formatCollabConflictValue(value) {
  if (value === undefined || value === null) return '（空）';
  if (Array.isArray(value)) return value.length ? value.join('、') : '（空列表）';
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); }
  }
  if (value === '') return '（空）';
  if (value === true) return '是';
  if (value === false) return '否';
  return String(value);
}

function captureScrollSnapshots() {
  const snap = {};
  const containers = [
    '.workbench-scroll',
    '.process-editor-scroll',
    '.entity-state-scroll',
    '.tab-content',
    '.sidebar-scroll',
  ];
  containers.forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) snap[sel] = { top: el.scrollTop, left: el.scrollLeft };
  });
  // also capture window-level and focused-input
  snap._window = { x: window.scrollX || 0, y: window.scrollY || 0 };
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
    snap._focus = { id: activeEl.id, tag: activeEl.tagName, selStart: activeEl.selectionStart, selEnd: activeEl.selectionEnd };
  }
  return snap;
}

function restoreScrollSnapshots(snap) {
  if (!snap) return;
  Object.keys(snap).forEach((sel) => {
    if (sel.startsWith('_')) return;
    const el = document.querySelector(sel);
    if (el && snap[sel] != null) {
      el.scrollTop = snap[sel].top || 0;
      el.scrollLeft = snap[sel].left || 0;
    }
  });
  if (snap._window) {
    window.scrollTo(snap._window.x || 0, snap._window.y || 0);
  }
  if (snap._focus) {
    const f = snap._focus;
    let el = f.id ? document.getElementById(f.id) : null;
    if (!el && f.tag) {
      const active = document.activeElement;
      if (active && active.tagName === f.tag) el = active;
    }
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      try { el.setSelectionRange(f.selStart, f.selEnd); } catch (e) { /* ignore */ }
    }
  }
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
