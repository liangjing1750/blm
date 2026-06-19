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
      const result = await this.api.collabSnapshot(runtime.currentFile, runtime.doc, {
        baseSeq: runtime.collab.acceptedSeq || runtime.collab.seq || 0,
        user: this.collaboration.currentUser(),
      });
      const document = result?.document || result?.merged_document || result?.mergedDocument || runtime.doc;
      const nextSeq = Number(result?.seq || result?.serverSeq || result?.acceptedSeq || runtime.collab.seq || 0);
      runtime.modified = false;
      replaceRuntimeDocument(document, runtime.currentFile);
      this.documentStore.load(document, runtime.currentFile);
      this.collaboration.finishSync(nextSeq);
    } catch (error) {
      this.collaboration.failSync(error);
      throw error;
    }
  }
}
