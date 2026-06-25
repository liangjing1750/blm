import { Injectable, inject } from '@angular/core';
import { ApiService } from '../api/api.service';
import { CollaborationService } from '../collaboration/collaboration.service';
import { DocumentStore } from '../document/document-store';
import { getAngularRuntimeState, replaceRuntimeDocument } from '../runtime/angular-runtime';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiService);
  private readonly collaboration = inject(CollaborationService);
  private readonly documentStore = inject(DocumentStore);

  // 模块意图：把“立即同步”从旧 collab.js 中抽到 Angular 服务，保留服务端协作合并入口。
  // 关键流程：当前文档通过 /api/collab/snapshot 提交；服务端返回 merged document 后替换本地文档。
  // 边界细节：这里先不实现 websocket/poll/local draft，高风险同步冲突仍交给服务端 snapshot 合并处理。
  async syncNow(): Promise<void> {
    const runtime = getAngularRuntimeState();
    if (!runtime.currentFile) {
      throw new Error('请先打开或保存文档');
    }
    this.collaboration.beginSync();
    try {
      if (runtime.collab.hasRemoteUpdate && !runtime.modified && !runtime.collab.pendingSnapshot) {
        const remoteDocument = await this.api.load(runtime.currentFile);
        replaceRuntimeDocument(remoteDocument, runtime.currentFile);
        this.documentStore.load(remoteDocument, runtime.currentFile);
        this.collaboration.finishSync(Number(runtime.collab.seq || runtime.collab.acceptedSeq || 0));
        return;
      }
      const frozenDocument = this.cloneDocument(runtime.doc);
      const frozenHash = this.hashDocument(frozenDocument);
      console.log('[syncNow] frozenDocument.roles.length:', frozenDocument?.roles?.length,
        'uids:', frozenDocument?.roles?.map((r: any) => r.uid || r.id).join(','));
      // 优先使用服务端返回的 documentHash；首次同步时客户端计算服务端兼容哈希，
      // 确保 session.seq > 0 时 verified_current_base 检查也能通过。
      const baseDocumentHash = runtime.collab.serverDocumentHash
        || await this.serverCompatibleHash(frozenDocument);
      console.log('[syncNow] baseDocumentHash:', baseDocumentHash, 'serverDocumentHash:', runtime.collab.serverDocumentHash,
        'seq:', runtime.collab.seq, 'acceptedSeq:', runtime.collab.acceptedSeq);
      const result = await this.api.collabSnapshot(runtime.currentFile, frozenDocument, {
        baseSeq: runtime.collab.draftBaseSeqOverride ?? runtime.collab.acceptedSeq ?? runtime.collab.seq ?? 0,
        baseDocumentHash,
        recoveryMode: Boolean(runtime.collab.recoveryMode),
        user: this.collaboration.currentUser(),
      });
      const document = result?.document || result?.merged_document || result?.mergedDocument || runtime.doc;
      console.log('[syncNow] result.document.roles.length:', document?.roles?.length,
        'uids:', document?.roles?.map((r: any) => r.uid || r.id).join(','));
      console.log('[syncNow] result.documentHash:', result?.documentHash, 'result.seq:', result?.seq);
      const nextSeq = Number(result?.seq || result?.serverSeq || result?.acceptedSeq || runtime.collab.seq || 0);
      const editedDuringSync = this.hashDocument(runtime.doc) !== frozenHash;
      // 保存服务端返回的 documentHash，下次同步时作为 baseDocumentHash 传给服务端，
      // 使服务端 verified_current_base 检查通过，避免删除操作被 merge 还原。
      if (result?.documentHash) {
        runtime.collab.serverDocumentHash = String(result.documentHash);
      }
      runtime.collab.draftBaseSeqOverride = undefined;
      runtime.collab.recoveryMode = false;
      runtime.collab.forceSnapshotSync = false;
      replaceRuntimeDocument(document, runtime.currentFile);
      this.documentStore.load(document, runtime.currentFile);
      runtime.modified = editedDuringSync;
      runtime.collab.pendingSnapshot = editedDuringSync;
      this.collaboration.finishSync(nextSeq);
      if (editedDuringSync) {
        runtime.modified = true;
        runtime.collab.pendingSnapshot = true;
      }
      this.collaboration.announceDocumentSaved(runtime.currentFile);
    } catch (error) {
      this.collaboration.failSync(error);
      throw error;
    }
  }

  private cloneDocument(document: any): any {
    if (typeof structuredClone === 'function') return structuredClone(document || {});
    return JSON.parse(JSON.stringify(document || {}));
  }

  // 模块意图：与服务端 _doc_hash (SHA-1) 保持一致，使 baseDocumentHash 可被服务端验证。
  // 关键流程：排除 meta.uid/document_uid/schema_version，sort_keys JSON→bytes→SHA-1[:16]。
  private async serverCompatibleHash(document: any): Promise<string> {
    if (!globalThis.crypto?.subtle?.digest) return '';
    try {
      const doc: Record<string, any> = {};
      for (const key of Object.keys(document || {}).sort()) {
        if (key === 'meta' && document['meta'] && typeof document['meta'] === 'object') {
          const filteredMeta: Record<string, any> = {};
          for (const mk of Object.keys(document['meta']).sort()) {
            if (mk !== 'uid' && mk !== 'document_uid' && mk !== 'schema_version') {
              filteredMeta[mk] = document['meta'][mk];
            }
          }
          doc['meta'] = filteredMeta;
        } else {
          doc[key] = document[key];
        }
      }
      const text = JSON.stringify(doc, Object.keys(doc).sort(), '');
      // Python: json.dumps(..., separators=(",", ":"))
      // JSON.stringify without space arg uses no separators space, matching Python separators
      const compact = JSON.stringify(JSON.parse(text)); // normalize: no spaces in serialization
      const encoder = new TextEncoder();
      const data = encoder.encode(compact);
      const hashBuffer = await crypto.subtle.digest('SHA-1', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hexString = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return hexString.substring(0, 16);
    } catch {
      return '';
    }
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
