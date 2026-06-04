'use strict';

async function postJson(url, payload) {
  let body = JSON.stringify(payload || {});
  const headers = { 'Content-Type': 'application/json' };
  const bodyBytes = new TextEncoder().encode(body);
  if (bodyBytes.length > 1024 && typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      writer.write(bodyBytes);
      writer.close();
      const compressed = await new Response(cs.readable).arrayBuffer();
      headers['Content-Encoding'] = 'gzip';
      body = compressed;
    } catch (_) { /* fall through to uncompressed */ }
  }
  return fetch(url, {
    method: 'POST',
    headers,
    body,
  }).then((response) => response.json());
}

function postJsonWithProgress(url, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = JSON.stringify(payload || {});
    if (body.length > 1024 * 1024) {
      console.warn(`[BLM save] large JSON payload: ${(body.length / 1024 / 1024).toFixed(2)} MB`, url);
    }
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      const result = xhr.response || JSON.parse(xhr.responseText || '{}');
      resolve(result);
    };
    xhr.onerror = () => reject(new Error('request failed'));
    xhr.send(body);
  });
}

function uploadBinary(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Attachment-Name', encodeURIComponent(file.name || 'attachment'));
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      const result = xhr.response || JSON.parse(xhr.responseText || '{}');
      resolve({
        ...(result && typeof result === 'object' ? result : {}),
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300 && !result?.error,
      });
    };
    xhr.onerror = () => reject(new Error('upload failed'));
    xhr.send(file);
  });
}

const api = {
  async runtime() {
    return fetch('/api/runtime').then((response) => response.json());
  },
  async files() {
    return fetch('/api/files').then((response) => response.json());
  },
  async fileSummaries() {
    return fetch('/api/files/meta').then((response) => {
      if (!response.ok) return [];
      return response.json();
    }).catch(() => []);
  },
  async load(name) {
    return fetch(`/api/load/${encodeURIComponent(name)}`).then((response) => response.json());
  },
  async save(name, doc, onProgress, options = {}) {
    return postJsonWithProgress(`/api/save/${encodeURIComponent(name)}`, {
      document: doc,
      base_revision: options.baseRevision,
      base_document: options.baseDocument,
      rebase: options.rebase !== false,
      save_message: options.saveMessage || '',
    }, onProgress);
  },
  async uploadAttachment(file, onProgress) {
    return uploadBinary('/api/attachment-upload', file, onProgress);
  },
  attachmentUrl(name, attachmentUid, versionUid, options = {}) {
    const url = `/api/attachment/${encodeURIComponent(name)}/${encodeURIComponent(attachmentUid)}/${encodeURIComponent(versionUid)}`;
    return options.download ? `${url}?download=1` : url;
  },
  async rename(oldName, newName, document, overwrite = false, onProgress, options = {}) {
    return postJsonWithProgress('/api/rename', {
      old_name: oldName,
      new_name: newName,
      document,
      overwrite,
      save_message: options.saveMessage || '',
    }, onProgress);
  },
  async copyDocument(sourceName, targetName) {
    return postJson('/api/copy', {
      source_name: sourceName,
      target_name: targetName,
    });
  },
  async create(name) {
    return postJson('/api/new', { name });
  },
  async del(name) {
    return postJson(`/api/delete/${encodeURIComponent(name)}`, {});
  },
  async history(name) {
    return fetch(`/api/history/${encodeURIComponent(name)}`).then((response) => response.json());
  },
  async versions(name) {
    return fetch(`/api/versions/${encodeURIComponent(name)}`).then((response) => response.json());
  },
  async createVersion(name, document, message = '') {
    return postJson('/api/version/create', { name, document, message });
  },
  async loadVersion(name, versionId) {
    return postJson('/api/version/load', { name, version_id: versionId });
  },
  async restoreHistory(name, snapshotId) {
    return postJson('/api/history/restore', { name, snapshot_id: snapshotId });
  },
  async loadHistory(name, snapshotId) {
    return postJson('/api/history/load', { name, snapshot_id: snapshotId });
  },
  async trash() {
    return fetch('/api/trash').then((response) => response.json());
  },
  async feedback() {
    return fetch('/api/feedback').then((response) => response.json());
  },
  async saveFeedback(payload) {
    return postJson('/api/feedback', payload);
  },
  async docs() {
    return fetch('/api/docs').then((response) => response.json());
  },
  async doc(docId) {
    return fetch(`/api/docs/${encodeURIComponent(docId)}`).then((response) => response.json());
  },
  async restoreTrash(entryId) {
    return postJson('/api/trash/restore', { entry_id: entryId });
  },
  async deleteTrash(entryIds) {
    return postJson('/api/trash/delete', { entry_ids: Array.isArray(entryIds) ? entryIds : [entryIds] });
  },
  async clearTrash() {
    return postJson('/api/trash/clear', {});
  },
  async exportMd(name) {
    return fetch(`/api/export/${encodeURIComponent(name)}`).then((response) => response.text());
  },
  async exportBundle(name) {
    return fetch(`/api/export-bundle/${encodeURIComponent(name)}`);
  },
  async exportDocx(name) {
    return fetch(`/api/export-docx/${encodeURIComponent(name)}`);
  },
  async startDocxExport(name) {
    return postJson('/api/export-docx/start', { name });
  },
  async exportJob(jobId) {
    return fetch(`/api/export-jobs/${encodeURIComponent(jobId)}`).then((response) => response.json());
  },
  async downloadExportJob(jobId) {
    return fetch(`/api/export-jobs/${encodeURIComponent(jobId)}/download`);
  },
  async exportJson(name) {
    return this.load(name);
  },
  async analyzeMerge(payload) {
    return postJson('/api/merge/analyze', payload);
  },
  async applyMerge(payload) {
    return postJson('/api/merge/apply', payload);
  },
  async validateDocument(document) {
    return postJson('/api/document/validate', { document });
  },
  async collabPoll(name, seq = 0) {
    const query = new URLSearchParams({
      name: String(name || ''),
      seq: String(seq || 0),
    });
    return fetch(`/api/collab/poll?${query.toString()}`).then((response) => response.json());
  },
  async collabSnapshot(name, document, options = {}) {
    return postJson('/api/collab/snapshot', {
      name,
      document,
      baseSeq: options.baseSeq || 0,
      documentHash: options.documentHash || '',
      user: options.user || {},
    });
  },
};
