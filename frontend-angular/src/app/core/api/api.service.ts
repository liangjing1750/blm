import { Injectable } from '@angular/core';

export interface WorkspaceSummary {
  name: string;
  title?: string;
  space?: string;
  tags?: string[];
  author?: string;
  date?: string;
}

export interface TrashEntry {
  id: string;
  label?: string;
  doc_name?: string;
  timestamp?: string;
}

export interface ManualDocSummary {
  id: string;
  title: string;
  summary?: string;
}

export interface FeedbackDocument {
  items?: FeedbackItem[];
}

export interface FeedbackItem {
  uid: string;
  category?: string;
  status?: string;
  title?: string;
  description?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  messages?: FeedbackMessage[];
}

export interface FeedbackMessage {
  uid?: string;
  floor?: number;
  author?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  attachments?: Array<Record<string, unknown>>;
}

export interface AgentHandoffPayload {
  sourceApp: 'blm';
  workspacePath?: string;
  workspaceId?: string;
  documentId?: string;
  currentRoute?: string;
  selectedBusinessObject?: Record<string, unknown>;
  currentPageTitle?: string;
  currentUserIntent?: string;
  pluginId: 'blm-agent-plugin';
  documentSummary?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  // 模块意图：集中承接浏览器到后端的 HTTP 调用，替代旧 api.js 的散落全局函数。
  // 关键流程：主线只覆盖文件列表、新建、打开、保存和协作快照；工具类接口后续按垂直功能补齐。
  // 边界细节：接口路径保持与后端一致，不改变数据模型，也不改变服务端合并逻辑。
  async runtime(): Promise<any> {
    return this.getJson('/api/runtime');
  }

  async fileSummaries(): Promise<WorkspaceSummary[]> {
    return this.getJson('/api/files/meta', []);
  }

  async trash(): Promise<TrashEntry[]> {
    return this.getJson('/api/trash', []);
  }

  async restoreTrash(entryId: string): Promise<any> {
    return this.postJson('/api/trash/restore', { entry_id: entryId });
  }

  async deleteTrash(entryIds: string[]): Promise<any> {
    return this.postJson('/api/trash/delete', { entry_ids: entryIds });
  }

  async clearTrash(): Promise<any> {
    return this.postJson('/api/trash/clear', {});
  }

  async files(): Promise<string[]> {
    return this.getJson('/api/files', []);
  }

  async create(name: string): Promise<any> {
    return this.postJson('/api/new', { name });
  }

  async copyDocument(sourceName: string, targetName: string): Promise<any> {
    return this.postJson('/api/copy', {
      source_name: sourceName,
      target_name: targetName,
    });
  }

  async deleteDocument(name: string): Promise<any> {
    return this.postJson(`/api/delete/${encodeURIComponent(name)}`, {});
  }

  async createVersion(name: string, document: any, message = ''): Promise<any> {
    return this.postJson('/api/version/create', { name, document, message });
  }

  async load(name: string): Promise<any> {
    return this.getJson(`/api/load/${encodeURIComponent(name)}`);
  }

  async save(name: string, document: any, options: Record<string, unknown> = {}): Promise<any> {
    return this.postJson(`/api/save/${encodeURIComponent(name)}`, {
      document,
      base_revision: options['baseRevision'],
      base_document: options['baseDocument'],
      rebase: options['rebase'] !== false,
      save_message: options['saveMessage'] || '',
    });
  }

  async collabSnapshot(name: string, document: any, options: Record<string, unknown> = {}): Promise<any> {
    return this.postJson('/api/collab/snapshot', {
      name,
      document,
      baseSeq: options['baseSeq'] || 0,
      baseDocumentHash: options['baseDocumentHash'] || '',
      documentHash: options['documentHash'] || '',
      recoveryMode: Boolean(options['recoveryMode']),
      user: options['user'] || {},
    });
  }

  async history(name: string): Promise<any[]> {
    return this.getJson(`/api/history/${encodeURIComponent(name)}`, []);
  }

  async versions(name: string): Promise<any[]> {
    return this.getJson(`/api/versions/${encodeURIComponent(name)}`, []);
  }

  async loadVersion(name: string, versionId: string): Promise<any> {
    return this.postJson('/api/version/load', { name, version_id: versionId });
  }

  async loadHistory(name: string, snapshotId: string): Promise<any> {
    return this.postJson('/api/history/load', { name, snapshot_id: snapshotId });
  }

  async restoreHistory(name: string, snapshotId: string): Promise<any> {
    return this.postJson('/api/history/restore', { name, snapshot_id: snapshotId });
  }

  async collabSubmits(name: string): Promise<any> {
    return this.postJson('/api/collab/submits/list', { name });
  }

  async loadCollabSubmit(name: string, submitId: string): Promise<any> {
    return this.postJson('/api/collab/submits/load', { name, submitId });
  }

  async analyzeMerge(payload: Record<string, unknown>): Promise<any> {
    return this.postJson('/api/merge/analyze', payload);
  }

  async applyMerge(payload: Record<string, unknown>): Promise<any> {
    return this.postJson('/api/merge/apply', payload);
  }

  async validateDocument(document: any): Promise<any> {
    return this.postJson('/api/document/validate', { document });
  }

  async exportBundle(name: string): Promise<Response> {
    return fetch(`/api/export-bundle/${encodeURIComponent(name)}`);
  }

  async startDocxExport(name: string): Promise<any> {
    return this.postJson('/api/export-docx/start', { name });
  }

  async exportJob(jobId: string): Promise<any> {
    return this.getJson(`/api/export-jobs/${encodeURIComponent(jobId)}`);
  }

  async exportRenderDocument(jobId: string): Promise<any> {
    return this.getJson(`/api/export-jobs/${encodeURIComponent(jobId)}/render-document`);
  }

  async downloadExportJob(jobId: string): Promise<Response> {
    return fetch(`/api/export-jobs/${encodeURIComponent(jobId)}/download`);
  }

  async docs(): Promise<ManualDocSummary[]> {
    return this.getJson('/api/docs', []);
  }

  async doc(docId: string): Promise<any> {
    return this.getJson(`/api/docs/${encodeURIComponent(docId)}`);
  }

  async feedback(): Promise<FeedbackDocument> {
    return this.getJson('/api/feedback', { items: [] });
  }

  async saveFeedback(payload: Record<string, unknown>): Promise<FeedbackDocument> {
    return this.postJson('/api/feedback', payload);
  }

  async createAgentHandoff(payload: AgentHandoffPayload): Promise<{ handoffId: string }> {
    return this.postJson('/api/agent/handoff', payload);
  }

  private async getJson<T>(url: string, fallback?: T): Promise<T> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      if (fallback !== undefined) return fallback;
      throw new Error(`GET ${url} failed: ${response.status}`);
    }
    return response.json();
  }

  private async postJson<T = any>(url: string, payload: unknown): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.error) {
      throw new Error(result?.error || `POST ${url} failed: ${response.status}`);
    }
    return result;
  }
}
