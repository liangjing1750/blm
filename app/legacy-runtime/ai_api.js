/** BLM AI 通信层 — 独立于 api.js，可替换、可移除 */

const ai_api = {
  /** 通用 AI 对话 SSE — 供 ai.js 抽屉使用 */
  chatStream(prompt, onEvent, onDone, onError) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/agent/chat');
    xhr.setRequestHeader('Content-Type', 'application/json');
    const uid = (typeof S !== 'undefined' && S.user && S.user.id) ? S.user.id : 'default';
    let lastIndex = 0;
    xhr.onprogress = () => {
      const t = xhr.responseText.substring(lastIndex); lastIndex = xhr.responseText.length;
      for (const line of t.split('\n')) {
        if (line.startsWith('data: ')) {
          try { const d = JSON.parse(line.slice(6)); onEvent(d); if (d.done) { onDone(); return; } if (d.error) { onError(d.error); return; } } catch (_) {}
        }
      }
    };
    xhr.onloadend = () => onDone();
    xhr.onerror = () => onError('Network error');
    xhr.send(JSON.stringify({ prompt, userId: uid }));
    return xhr;
  },

  /** 工作区问答 SSE */
  askStream(workspace, question, onChunk, onDone, onError) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ai/ask');
    xhr.setRequestHeader('Content-Type', 'application/json');
    let lastIndex = 0;
    xhr.onprogress = () => {
      const t = xhr.responseText.substring(lastIndex); lastIndex = xhr.responseText.length;
      const lines = t.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { const d = JSON.parse(line.slice(6)); if (d.text) onChunk(d.text); if (d.done) onDone(); if (d.error) onError(d.error); } catch (_) {}
        }
      }
    };
    xhr.onloadend = () => onDone();
    xhr.onerror = () => onError('Network error');
    xhr.send(JSON.stringify({ workspace, question }));
  },

  /** 会话列表 */
  async sessions() {
    return fetch('/api/ai/sessions').then(r => r.json());
  },

  /** 启动导出 */
  async exportStart(workspace) {
    const r = await fetch('/api/ai/export/start', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ workspace }) });
    return r.json();
  },

  /** 导出进度 */
  async exportJob(jobId) {
    return fetch(`/api/ai/export/${encodeURIComponent(jobId)}`).then(r => r.json());
  },
};
