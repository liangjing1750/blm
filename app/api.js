'use strict';

async function postJson(url, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  }).then((response) => response.json());
}

const api = {
  async runtime() {
    return fetch('/api/runtime').then((response) => response.json());
  },
  async files() {
    return fetch('/api/files').then((response) => response.json());
  },
  async load(name) {
    return fetch(`/api/load/${encodeURIComponent(name)}`).then((response) => response.json());
  },
  async save(name, doc) {
    return postJson(`/api/save/${encodeURIComponent(name)}`, doc);
  },
  async rename(oldName, newName, document, overwrite = false) {
    return postJson('/api/rename', {
      old_name: oldName,
      new_name: newName,
      document,
      overwrite,
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
  async restoreHistory(name, snapshotId) {
    return postJson('/api/history/restore', { name, snapshot_id: snapshotId });
  },
  async trash() {
    return fetch('/api/trash').then((response) => response.json());
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
  async exportMd(name) {
    return fetch(`/api/export/${encodeURIComponent(name)}`).then((response) => response.text());
  },
  async exportBundle(name) {
    return fetch(`/api/export-bundle/${encodeURIComponent(name)}`);
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
};
