import { Injectable } from '@angular/core';
import { DocumentStore } from '../document/document-store';
import { emitRuntimeRefresh, getAngularRuntimeState, replaceRuntimeDocument } from '../runtime/angular-runtime';

const COLLAB_DRAFT_DB_NAME = 'blm-collab-drafts';
const COLLAB_DRAFT_STORE_NAME = 'drafts';
const COLLAB_DRAFT_STORAGE_PREFIX = 'blm.collab.draft.';
const COLLAB_USER_PROFILE_KEY = 'blm.user.profile';
const COLLAB_USER_SESSION_KEY = 'blm.user.sessionId';
const COLLAB_LEGACY_SESSION_KEY = 'blm.collab.sessionId';

export interface LocalCollabDraftRecord {
  key: string;
  docName: string;
  userId: string;
  userName: string;
  sessionId: string;
  baseSeq: number;
  generation: number;
  updatedAt: string;
  contentHash: string;
  document: any;
}

interface LocalCollabDraftUser {
  id: string;
  name: string;
  sessionId: string;
}

@Injectable({ providedIn: 'root' })
export class LocalCollabDraftService {
  private generation = 0;
  private clearedGeneration = 0;

  constructor(private readonly documentStore: DocumentStore) {}

  // 模块意图：延续旧 collab.js 的本地草稿协议，让新版 Angular 能读取同一批 IndexedDB/localStorage 记录。
  // 关键流程：编辑时保存完整文档；打开文档后按内容 hash 判断是否需要恢复；同步成功后清理草稿。
  // 边界细节：草稿只属于 docName + userId，不跨用户恢复；本服务不主动调用远端同步，只标记 pendingSnapshot。
  async saveCurrentDraft(documentHash = ''): Promise<LocalCollabDraftRecord | null> {
    const runtime = getAngularRuntimeState();
    if (!runtime.currentFile || !runtime.doc || runtime.readOnly || !runtime.runtime.supportsCollab) return null;
    const profile = this.currentUser();
    const generation = this.generation + 1;
    this.generation = generation;
    const draft: LocalCollabDraftRecord = {
      key: this.draftKey(runtime.currentFile, profile.id),
      docName: runtime.currentFile,
      userId: profile.id,
      userName: profile.name,
      sessionId: profile.sessionId,
      baseSeq: Number(runtime.collab.draftBaseSeqOverride ?? runtime.collab.acceptedSeq ?? runtime.collab.seq ?? 0),
      generation,
      updatedAt: new Date().toISOString(),
      contentHash: documentHash || this.hashDocument(runtime.doc),
      document: this.cloneDocument(runtime.doc),
    };
    await this.putDraftRecord(draft);
    if (generation <= this.clearedGeneration) {
      await this.deleteDraftRecord(draft.docName);
      return null;
    }
    return draft;
  }

  async findRecoverableDraft(docName: string, serverDocument: any): Promise<LocalCollabDraftRecord | null> {
    const draft = await this.getDraftRecord(docName);
    if (!draft || !draft.document || draft.docName !== docName) return null;
    const serverHash = this.hashDocument(serverDocument);
    const draftHash = draft.contentHash || this.hashDocument(draft.document);
    if (serverHash && draftHash && serverHash === draftHash) {
      await this.clearDraft(docName);
      return null;
    }
    return draft;
  }

  applyRecoveredDraft(docName: string, draft: LocalCollabDraftRecord): void {
    const restored = this.cloneDocument(draft.document || {});
    restored.meta = restored.meta && typeof restored.meta === 'object' ? restored.meta : {};
    restored.meta.readonly = false;
    delete restored.meta.version_id;
    delete restored.meta.version_label;
    replaceRuntimeDocument(restored, docName);
    this.documentStore.load(restored, docName);
    const runtime = getAngularRuntimeState();
    runtime.readOnly = false;
    runtime.modified = true;
    runtime.collab.pendingSnapshot = true;
    runtime.collab.draftBaseSeqOverride = Number(draft.baseSeq || 0);
    runtime.collab.recoveryMode = true;
    runtime.collab.forceSnapshotSync = true;
    emitRuntimeRefresh();
  }

  async clearDraft(docName = getAngularRuntimeState().currentFile): Promise<void> {
    if (!docName) return;
    this.clearedGeneration = Math.max(this.clearedGeneration, this.generation);
    await this.deleteDraftRecord(docName);
    const runtime = getAngularRuntimeState();
    runtime.collab.draftBaseSeqOverride = undefined;
    emitRuntimeRefresh();
  }

  formatUpdatedAt(value: string): string {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return value || '';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  private currentUser(): LocalCollabDraftUser {
    let profile: any = null;
    try {
      profile = JSON.parse(localStorage.getItem(COLLAB_USER_PROFILE_KEY) || 'null');
    } catch {
      profile = null;
    }
    const id = String(profile?.id || '').trim() || 'anonymous';
    const name = String(profile?.name || '').trim();
    let sessionId = sessionStorage.getItem(COLLAB_USER_SESSION_KEY) || sessionStorage.getItem(COLLAB_LEGACY_SESSION_KEY) || '';
    if (!sessionId) {
      sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? `session-${crypto.randomUUID()}`
        : `session-${Date.now().toString(36)}`;
    }
    sessionStorage.setItem(COLLAB_USER_SESSION_KEY, sessionId);
    sessionStorage.setItem(COLLAB_LEGACY_SESSION_KEY, sessionId);
    return { id, name, sessionId };
  }

  private draftKey(docName: string, userId = this.currentUser().id): string {
    return `${String(docName || '').trim()}::${String(userId || 'anonymous').trim() || 'anonymous'}`;
  }

  private storageKey(docName: string): string {
    return `${COLLAB_DRAFT_STORAGE_PREFIX}${encodeURIComponent(this.draftKey(docName))}`;
  }

  private async putDraftRecord(record: LocalCollabDraftRecord): Promise<void> {
    const db = await this.openDraftDb();
    if (db) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(COLLAB_DRAFT_STORE_NAME, 'readwrite');
        tx.objectStore(COLLAB_DRAFT_STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('draft db write failed'));
      }).finally(() => db.close());
      return;
    }
    localStorage.setItem(this.storageKey(record.docName), JSON.stringify(record));
  }

  private async getDraftRecord(docName: string): Promise<LocalCollabDraftRecord | null> {
    const key = this.draftKey(docName);
    const db = await this.openDraftDb();
    if (db) {
      try {
        return await new Promise<LocalCollabDraftRecord | null>((resolve, reject) => {
          const tx = db.transaction(COLLAB_DRAFT_STORE_NAME, 'readonly');
          const request = tx.objectStore(COLLAB_DRAFT_STORE_NAME).get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error || new Error('draft db read failed'));
        }).finally(() => db.close());
      } catch {
        // IndexedDB 读取失败时回落到旧版 localStorage fallback。
      }
    }
    try {
      return JSON.parse(localStorage.getItem(this.storageKey(docName)) || 'null');
    } catch {
      return null;
    }
  }

  private async deleteDraftRecord(docName: string): Promise<void> {
    const key = this.draftKey(docName);
    const db = await this.openDraftDb();
    if (db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(COLLAB_DRAFT_STORE_NAME, 'readwrite');
          tx.objectStore(COLLAB_DRAFT_STORE_NAME).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('draft db delete failed'));
        }).finally(() => db.close());
      } catch {
        // 保留 fallback 清理，避免 IndexedDB 临时失败导致草稿一直残留。
      }
    }
    localStorage.removeItem(this.storageKey(docName));
  }

  private openDraftDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = indexedDB.open(COLLAB_DRAFT_DB_NAME, 1);
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

  private cloneDocument(document: any): any {
    if (typeof structuredClone === 'function') return structuredClone(document || {});
    return JSON.parse(JSON.stringify(document || {}));
  }

  private hashDocument(document: any): string {
    let text = '';
    try {
      text = JSON.stringify(document || null);
    } catch {
      return '';
    }
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
}
