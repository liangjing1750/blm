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
      // 边界细节：服务端内存文档与磁盘加载文档哈希不同（save_collaboration_working_copy 会修改结构），
      // 客户端自行计算 SHA-1 永不可能匹配。唯一可信来源是 joined/sync 响应中的 documentHash。
      // joined 消息到达后 serverDocumentHash 被设置，后续同步直接使用。
      const baseDocumentHash = runtime.collab.serverDocumentHash || '';
      const result = await this.api.collabSnapshot(runtime.currentFile, frozenDocument, {
        baseSeq: runtime.collab.draftBaseSeqOverride ?? runtime.collab.acceptedSeq ?? runtime.collab.seq ?? 0,
        baseDocumentHash,
        recoveryMode: Boolean(runtime.collab.recoveryMode),
        user: this.collaboration.currentUser(),
      });
      const document = result?.document || result?.merged_document || result?.mergedDocument || runtime.doc;
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
