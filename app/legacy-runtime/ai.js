/** BLM AI 底部抽屉 v3 — 全局常驻 + 拖拽调整 + 会话切换 + Ctrl+J */

const AI = {
  _msgs: [], _tools: {}, _streaming: false, _abort: null,
  _charTimer: null, _pending: '',

  toggle() {
    const d = document.getElementById('ai-drawer');
    if (!d) return;
    d.classList.toggle('hidden');
    if (!d.classList.contains('hidden')) {
      const ws = (typeof S !== 'undefined' && S.currentFile) ? S.currentFile : '';
      const lbl = document.getElementById('ai-ws-label');
      if (lbl) lbl.textContent = ws ? '工作区: ' + ws : '';
      document.getElementById('ai-input')?.focus();
      AI._loadSessionList();
    }
  },

  _resizeStart(e) {
    e.preventDefault();
    const d = document.getElementById('ai-drawer'), startY = e.clientY, startH = d.offsetHeight;
    const onMove = (ev) => {
      const h = Math.max(120, Math.min(window.innerHeight * 0.80, startH + (startY - ev.clientY)));
      d.style.height = h + 'px';
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  },

  send() {
    const input = document.getElementById('ai-input');
    const text = (input.value || '').trim();
    if (!text || AI._streaming) return;
    AI._addBubble('user', text); input.value = '';
    AI._tools = {}; AI._pending = ''; AI._setStreaming(true);

    const ws = (typeof S !== 'undefined' && S.currentFile) ? S.currentFile : '';
    const prompt = ws ? `[工作区: ${ws}] ${text}` : text;

    if (typeof api !== 'undefined' && ai_api.chatStream) {
      AI._abort = ai_api.chatStream(prompt, AI._onSSE, AI._onDone, AI._onError);
    } else { AI._fallbackSSE(prompt); }
  },

  stop() { if (AI._abort) { try { AI._abort.abort(); } catch(_){} AI._abort = null; } clearInterval(AI._charTimer); AI._setStreaming(false); },

  _onSSE(data) {
    if (data.kind === 'tool_dispatch') { AI._flushTyping(); AI._addToolCard(data); }
    else if (data.kind === 'tool_result') { AI._updateToolCard(data); }
    else if (data.kind === 'tool_progress') { AI._updateToolProgress(data); }
    else if (data.kind === 'approval_request') { AI._showApproval(data); }
    else if (data.text) { AI._pending += data.text; if (!AI._charTimer) AI._startTyping(); }
  },
  _onDone() { AI._flushTyping(); clearInterval(AI._charTimer); AI._setStreaming(false); },
  _onError(err) { AI._addBubble('system', '错误: ' + err); AI._setStreaming(false); },

  _startTyping() {
    AI._charTimer = setInterval(() => {
      if (!AI._pending) { clearInterval(AI._charTimer); AI._charTimer = null; return; }
      const n = 2 + Math.floor(Math.random() * 3), chunk = AI._pending.slice(0, n); AI._pending = AI._pending.slice(n);
      let last = AI._msgs[AI._msgs.length - 1];
      if (!last || last.role !== 'assistant') last = AI._addBubble('assistant', '');
      last.text += chunk;
      last.el.innerHTML = (window.markedLib ? markedLib.parse(last.text) : AI._esc(last.text));
      document.getElementById('ai-body').scrollTop = 999999;
    }, 25);
  },
  _flushTyping() {
    if (!AI._pending) return;
    let last = AI._msgs[AI._msgs.length - 1];
    if (!last || last.role !== 'assistant') last = AI._addBubble('assistant', '');
    last.text += AI._pending; AI._pending = '';
    if (window.markedLib) try { last.el.innerHTML = markedLib.parse(last.text); } catch(_) {}
    else last.el.textContent = last.text;
  },

  _addToolCard(data) {
    const name = data.tool_name || data.name || 'tool', id = data.tool_id || data.id || 't' + Date.now();
    const body = document.getElementById('ai-body');
    const card = document.createElement('div'); card.className = 'ai-tool'; card.id = 'tool-' + id;
    card.innerHTML = `<div class="ai-tool-head" onclick="AI._toggleTool('${id}')"><span class="ai-tool-status running"></span><span class="ai-tool-name">${AI._esc(name)}</span><span class="ai-tool-arrow">▾</span></div><div class="ai-tool-body hidden" id="tool-body-${id}"><div class="ai-tool-args"><pre>${AI._esc(typeof data.args==='string'?data.args:JSON.stringify(data.args||{},null,2))}</pre></div><div class="ai-tool-output" id="tool-out-${id}">执行中...</div></div>`;
    body.appendChild(card); AI._tools[id] = { el: card }; body.scrollTop = 999999;
  },
  _updateToolCard(data) {
    const id = data.tool_id || data.id, t = AI._tools[id]; if (!t) return;
    t.el.querySelector('.ai-tool-status').className = 'ai-tool-status ' + (data.is_error ? 'failed' : 'done');
    const out = document.getElementById('tool-out-' + id); if (out) out.textContent = (data.output || '').slice(0, 5000);
  },
  _updateToolProgress(data) {
    const out = document.getElementById('tool-out-' + (data.tool_id || data.id));
    if (out) out.textContent = (data.output || '').slice(0, 2000);
  },
  _toggleTool(id) { document.getElementById('tool-body-' + id)?.classList.toggle('hidden'); },

  _showApproval(data) {
    const overlay = document.createElement('div'); overlay.className = 'ai-approval-overlay';
    overlay.innerHTML = `<div class="ai-approval-card"><h4>需要确认</h4><p>工具: <code>${AI._esc(data.tool_name||'')}</code></p><p>${AI._esc(data.reason||'')}</p><div class="ai-approval-btns"><button class="ai-approval-allow">允许</button><button class="ai-approval-deny">拒绝</button></div></div>`;
    overlay.querySelector('.ai-approval-allow').onclick = () => { overlay.remove(); /* TODO: POST approve */ };
    overlay.querySelector('.ai-approval-deny').onclick = () => { overlay.remove(); };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  },

  _switchSession(id) {
    if (!id || id === 'new') return;
    ai_api.sessions().then(r => r.json()).then(list => {
      /* TODO: load session messages via GET /api/ai/sessions/{id} */
      console.log('Switch to session:', id);
    }).catch(() => {});
  },
  _loadSessionList() {
    ai_api.sessions().then(r => r.json()).then(list => {
      const sel = document.getElementById('ai-session-select');
      if (!sel) return;
      sel.innerHTML = '<option value="new">新会话</option>';
      list.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.cwd||'会话'} (${s.message_count}条)`; sel.appendChild(o); });
    }).catch(() => {});
  },
  _addBubble(role, text) {
    const body = document.getElementById('ai-body'), div = document.createElement('div');
    div.className = 'ai-msg ai-msg-' + role; div.textContent = text;
    body.appendChild(div); body.scrollTop = 999999;
    const e = { role, el: div, text }; AI._msgs.push(e); return e;
  },
  _setStreaming(on) {
    AI._streaming = on;
    document.getElementById('ai-send-btn')?.classList.toggle('hidden', on);
    document.getElementById('ai-stop-btn')?.classList.toggle('hidden', !on);
    document.getElementById('ai-status').textContent = on ? '思考中...' : '就绪';
  },
  _onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); AI.send(); } },
  _esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
  _fallbackSSE(prompt) {
    const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/agent/chat'); xhr.setRequestHeader('Content-Type', 'application/json');
    let lastIdx = 0; xhr.onprogress = () => {
      const t = xhr.responseText.substring(lastIdx); lastIdx = xhr.responseText.length;
      for (const line of t.split('\n')) { if (line.startsWith('data: ')) { try { AI._onSSE(JSON.parse(line.slice(6))); } catch(_){} } }
    }; xhr.onloadend = () => AI._onDone(); xhr.onerror = () => AI._onError('网络错误');
    xhr.send(JSON.stringify({ prompt })); AI._abort = xhr;
  }
};

document.addEventListener('keydown', (e) => { if ((e.ctrlKey||e.metaKey) && e.key==='j') { e.preventDefault(); AI.toggle(); } });
