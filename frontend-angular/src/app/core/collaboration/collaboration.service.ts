import { Injectable } from '@angular/core';
import { emitRuntimeRefresh, getAngularRuntimeState } from '../runtime/angular-runtime';

interface CollaborationUserProfile {
  id: string;
  sessionId: string;
  name: string;
}

interface CollaborationMessage {
  type?: string;
  seq?: number;
  users?: Array<Record<string, unknown>>;
  user?: string | Record<string, unknown>;
  userId?: string;
  clientId?: string;
  documentHash?: string;
}

interface LocalDocumentSavedMessage {
  type: 'document_saved';
  docName: string;
  sessionId: string;
  userName: string;
  at: string;
}

@Injectable({ providedIn: 'root' })
export class CollaborationService {
  private socket: WebSocket | null = null;
  private docName = '';
  private pingTimer: number | null = null;
  private profile: CollaborationUserProfile | null = null;
  private readonly localSaveChannel: BroadcastChannel | null = this.createLocalSaveChannel();

  // 模块意图：承接旧版实时协作的“状态可见 + 主动同步”能力，UI 只订阅 runtime.collab。
  // 关键流程：WebSocket 只负责 join/presence/updated；文档提交仍由 SyncService 走 HTTP snapshot。
  // 边界细节：收到远端 updated 只标记“有更新待同步”，不能自动覆盖当前正在编辑的文档。
  start(docName: string): void {
    const runtime = getAngularRuntimeState();
    if (!docName || runtime.readOnly || !runtime.runtime.supportsCollab) return;
    if (this.docName === docName && this.socket && this.socket.readyState <= WebSocket.OPEN) {
      if (this.socket.readyState === WebSocket.OPEN && !runtime.collab.connected) {
        runtime.collab.connected = true;
        emitRuntimeRefresh();
      }
      return;
    }
    try {
      this.stop();
      this.docName = docName;
      this.profile = this.loadProfile();
      runtime.collab.connected = false;
      runtime.collab.users = [];
      runtime.collab.lastError = '';
      emitRuntimeRefresh();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/collab/ws`);
      this.socket = socket;
      socket.addEventListener('open', () => this.join(socket, docName));
      socket.addEventListener('message', (event) => this.handleMessage(event.data));
      socket.addEventListener('close', () => this.markDisconnected(socket));
      socket.addEventListener('error', () => this.markDisconnected(socket));
    } catch (error) {
      runtime.collab.connected = false;
      runtime.collab.lastError = error instanceof Error ? error.message : String(error);
      emitRuntimeRefresh();
    }
  }

  stop(): void {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
    this.socket = null;
    this.docName = '';
    const runtime = getAngularRuntimeState();
    runtime.collab.connected = false;
    runtime.collab.users = [];
    emitRuntimeRefresh();
  }

  markLocalChanged(): void {
    const runtime = getAngularRuntimeState();
    if (!runtime.currentFile || runtime.readOnly) return;
    runtime.collab.pendingSnapshot = true;
    emitRuntimeRefresh();
  }

  beginSync(): void {
    const runtime = getAngularRuntimeState();
    runtime.collab.syncing = true;
    runtime.collab.pendingSnapshot = false;
    runtime.collab.lastError = '';
    emitRuntimeRefresh();
  }

  finishSync(seq: number): void {
    const runtime = getAngularRuntimeState();
    runtime.collab.seq = seq;
    runtime.collab.acceptedSeq = seq;
    runtime.collab.syncing = false;
    runtime.collab.pendingSnapshot = false;
    runtime.collab.hasRemoteUpdate = false;
    runtime.collab.lastSyncedAt = new Date().toISOString();
    runtime.collab.lastActivity = null;
    emitRuntimeRefresh();
  }

  failSync(error: unknown): void {
    const runtime = getAngularRuntimeState();
    runtime.collab.syncing = false;
    runtime.collab.pendingSnapshot = true;
    runtime.collab.lastError = error instanceof Error ? error.message : String(error);
    emitRuntimeRefresh();
  }

  statusText(): string {
    const runtime = getAngularRuntimeState();
    if (!runtime.currentFile || !runtime.runtime.supportsCollab) return '';
    if (runtime.readOnly) return '\u53ea\u8bfb\u7248\u672c';
    if (!runtime.collab.connected) return '\u534f\u4f5c\u8fde\u63a5\u4e2d';
    const names = this.onlineNames();
    if (!names.length) return '\u534f\u4f5c\u5728\u7ebf';
    if (names.length <= 3) return `\u534f\u4f5c ${names.join('\u3001')}\u5728\u7ebf`;
    return `\u534f\u4f5c ${names[0]}\u3001${names[1]} \u7b49${names.length}\u4eba\u5728\u7ebf`;
  }

  onlineNames(): string[] {
    const runtime = getAngularRuntimeState();
    const profile = this.profile || this.loadProfile();
    const names: string[] = [];
    for (const item of runtime.collab.users || []) {
      const rawName = String(item['name'] || item['user'] || '').trim();
      const name = rawName || profile.name;
      if (!name) continue;
      const count = Number(item['connectionCount'] || 1);
      names.push(count > 1 ? `${name}\uff08${count}\u4e2a\u7a97\u53e3\uff09` : name);
    }
    // \u786e\u4fdd\u5f53\u524d\u7528\u6237\u4e5f\u5728\u5217\u8868\u4e2d
    if (profile.name && !names.includes(profile.name) && !names.some((n) => n.startsWith(`${profile.name}\uff08`))) {
      names.unshift(profile.name);
    }
    return Array.from(new Set(names));
  }

  allOnlineUsers(): Array<{ name: string; connectionCount: number }> {
    const runtime = getAngularRuntimeState();
    const profile = this.profile || this.loadProfile();
    const users = (runtime.collab.users || []).map((item) => ({
      name: String(item['name'] || item['user'] || '').trim() || profile.name,
      connectionCount: Number(item['connectionCount'] || 1),
    }));
    if (profile.name && !users.some((u) => u.name === profile.name)) {
      users.unshift({ name: profile.name, connectionCount: 1 });
    }
    return users;
  }

  currentUser(): CollaborationUserProfile {
    this.profile = this.profile || this.loadProfile();
    return this.profile;
  }

  announceDocumentSaved(docName: string): void {
    if (!docName) return;
    const profile = this.currentUser();
    const payload: LocalDocumentSavedMessage = {
      type: 'document_saved',
      docName,
      sessionId: profile.sessionId,
      userName: profile.name,
      at: new Date().toISOString(),
    };
    this.localSaveChannel?.postMessage(payload);
    try {
      localStorage.setItem('blm.localDocumentSaved', JSON.stringify(payload));
    } catch {
      // localStorage may be unavailable in constrained test/browser contexts.
    }
  }

  private join(socket: WebSocket, docName: string): void {
    if (this.socket !== socket || !this.profile) return;
    socket.send(JSON.stringify({ type: 'join', doc: docName, user: this.profile }));
    this.pingTimer = window.setInterval(() => {
      if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  private handleMessage(raw: string): void {
    let payload: CollaborationMessage;
    try {
      payload = JSON.parse(raw) as CollaborationMessage;
    } catch {
      return;
    }
    const runtime = getAngularRuntimeState();
    if (payload.type === 'joined') {
      runtime.collab.connected = true;
      runtime.collab.seq = Number(payload.seq || runtime.collab.seq || 0);
      runtime.collab.acceptedSeq = runtime.collab.seq;
      runtime.collab.users = payload.users || [];
      // 保存服务端当前文档哈希，使得首次同步时 baseDocumentHash 非空，
      // 服务端 verified_current_base 检查通过，删除操作不会被 merge 还原。
      if (payload.documentHash) {
        runtime.collab.serverDocumentHash = String(payload.documentHash);
      }
    } else if (payload.type === 'presence') {
      runtime.collab.users = payload.users || [];
    } else if (payload.type === 'updated' || payload.type === 'snapshot_notice' || payload.type === 'snapshot') {
      const nextSeq = Number(payload.seq || runtime.collab.seq || 0);
      runtime.collab.seq = Math.max(runtime.collab.seq || 0, nextSeq);
      runtime.collab.hasRemoteUpdate = true;
      runtime.collab.lastActivity = { user: this.messageUser(payload), at: new Date().toISOString() };
    }
    emitRuntimeRefresh();
  }

  private markDisconnected(socket: WebSocket): void {
    if (this.socket !== socket) return;
    const runtime = getAngularRuntimeState();
    runtime.collab.connected = false;
    runtime.collab.syncing = false;
    emitRuntimeRefresh();
  }

  private handleLocalDocumentSaved(payload: LocalDocumentSavedMessage): void {
    const runtime = getAngularRuntimeState();
    const profile = this.currentUser();
    if (!payload || payload.type !== 'document_saved') return;
    if (!runtime.currentFile || runtime.readOnly) return;
    if (payload.docName !== runtime.currentFile) return;
    if (payload.sessionId === profile.sessionId) return;
    runtime.collab.hasRemoteUpdate = true;
    runtime.collab.lastActivity = { user: payload.userName || '其他用户', at: payload.at || new Date().toISOString() };
    emitRuntimeRefresh();
  }

  private createLocalSaveChannel(): BroadcastChannel | null {
    const handlePayload = (payload: unknown) => {
      if (this.isLocalDocumentSavedMessage(payload)) this.handleLocalDocumentSaved(payload);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key !== 'blm.localDocumentSaved' || !event.newValue) return;
        try {
          handlePayload(JSON.parse(event.newValue));
        } catch {
          // Ignore malformed cross-tab notifications.
        }
      });
    }
    if (typeof BroadcastChannel === 'undefined') return null;
    const channel = new BroadcastChannel('blm.document-updates');
    channel.addEventListener('message', (event) => handlePayload(event.data));
    return channel;
  }

  private isLocalDocumentSavedMessage(payload: unknown): payload is LocalDocumentSavedMessage {
    if (!payload || typeof payload !== 'object') return false;
    const message = payload as Partial<LocalDocumentSavedMessage>;
    return message.type === 'document_saved' && typeof message.docName === 'string';
  }

  private messageUser(payload: CollaborationMessage): string {
    if (typeof payload.user === 'string') return payload.user;
    if (payload.user && typeof payload.user === 'object') return String(payload.user['name'] || payload.user['user'] || '其他用户');
    return '其他用户';
  }

  private loadProfile(): CollaborationUserProfile {
    const idKey = 'blm.collab.userId';
    const sessionKey = 'blm.collab.sessionId';
    const nameKey = 'blm.collab.userName';
    const id = localStorage.getItem(idKey) || this.createId();
    const sessionId = sessionStorage.getItem(sessionKey) || this.createId();
    let name = (localStorage.getItem(nameKey) || '').trim();
    // 迁移旧版 blm.user.profile 中的用户名
    if (!name) {
      name = this.migrateLegacyUserName();
    }
    // 规范化显示名称，拒绝无效默认值
    name = CollaborationService.normalizeDisplayName(name);
    localStorage.setItem(idKey, id);
    sessionStorage.setItem(sessionKey, sessionId);
    if (name) {
      localStorage.setItem(nameKey, name);
    } else {
      localStorage.removeItem(nameKey);
    }
    return { id, sessionId, name };
  }

  private migrateLegacyUserName(): string {
    try {
      const legacy = JSON.parse(localStorage.getItem('blm.user.profile') || 'null');
      if (legacy && typeof legacy.name === 'string') {
        const legacyName = CollaborationService.normalizeDisplayName(legacy.name);
        if (legacyName) return legacyName;
      }
    } catch (_) { /* ignore */ }
    return '';
  }

  static normalizeDisplayName(value: string): string {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^用户[0-9a-f]{4}$/i.test(text)) return '';
    if (text === '未设置用户') return '';
    if (/^[{[]/.test(text) && /(?:user|name|sessionId|clientId)/.test(text)) return '';
    return text.slice(0, 40);
  }

  setUserName(name: string): void {
    const normalized = CollaborationService.normalizeDisplayName(name);
    if (normalized) {
      localStorage.setItem('blm.collab.userName', normalized);
    } else {
      localStorage.removeItem('blm.collab.userName');
    }
    this.profile = this.loadProfile();
    // 同步更新旧版 profile 键
    this.saveLegacyProfile(this.profile.id, this.profile.name);
  }

  private saveLegacyProfile(id: string, name: string): void {
    try {
      localStorage.setItem('blm.user.profile', JSON.stringify({ id, name }));
    } catch (_) { /* ignore */ }
  }

  static isUserNameConfigured(): boolean {
    const name = localStorage.getItem('blm.collab.userName') || '';
    return CollaborationService.normalizeDisplayName(name) !== '';
  }

  private createId(): string {
    return globalThis.crypto?.randomUUID?.() || `collab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
