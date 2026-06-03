from __future__ import annotations

import http.server
import io
import json
import time
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

from blm_core.diagnostics import get_log_dir, log_event, read_recent_log_events
from blm_core.storage import WorkspaceStorage


def create_admin_handler(
    storage: WorkspaceStorage,
    collab,
    *,
    workspace_dir: Path,
    app_port: int,
    started_at: float,
):
    class BlmAdminHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/":
                return self._html(_admin_page())
            if path == "/api/status":
                return self._json(_status_payload(storage, collab, workspace_dir, app_port, started_at))
            if path == "/api/logs/recent":
                return self._json({"ok": True, "events": read_recent_log_events(200)})
            if path == "/api/diagnostics.zip":
                return self._diagnostics_zip()
            return self._json({"error": "not found"}, 404)

        def log_message(self, *_):
            pass

        def _diagnostics_zip(self):
            payload = io.BytesIO()
            status = _status_payload(storage, collab, workspace_dir, app_port, started_at)
            with zipfile.ZipFile(payload, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("status.json", json.dumps(status, ensure_ascii=False, indent=2))
                archive.writestr(
                    "recent-log-events.json",
                    json.dumps(read_recent_log_events(500), ensure_ascii=False, indent=2),
                )
                log_dir = get_log_dir()
                if log_dir and log_dir.exists():
                    for path in sorted(log_dir.glob("*.log*")):
                        if path.is_file():
                            archive.write(path, f"logs/{path.name}")
            body = payload.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Disposition", 'attachment; filename="blm-diagnostics.zip"')
            self.end_headers()
            self.wfile.write(body)

        def _json(self, payload, code: int = 200):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _html(self, payload: str, code: int = 200):
            body = payload.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return BlmAdminHandler


def _status_payload(
    storage: WorkspaceStorage,
    collab,
    workspace_dir: Path,
    app_port: int,
    started_at: float,
) -> dict:
    try:
        documents = storage.list_document_summaries()
    except Exception as exc:
        documents = []
        document_error = str(exc)
    else:
        document_error = ""
    collab_status = collab.diagnostics() if collab else {}
    recent_events = read_recent_log_events(100)
    relationships = _build_relationships(documents, collab_status)
    log_summary = _build_log_summary(recent_events)
    return {
        "ok": True,
        "service": {
            "appPort": app_port,
            "uptimeSeconds": int(time.time() - started_at),
            "workspaceDir": str(workspace_dir),
            "logDir": str(get_log_dir() or ""),
        },
        "documents": {
            "count": len(documents),
            "items": documents,
            "error": document_error,
        },
        "collaboration": collab_status,
        "relationships": relationships,
        "logSummary": log_summary,
        "recentEvents": recent_events[:50],
    }


def _build_relationships(documents: list[dict], collab_status: dict) -> dict:
    sessions = collab_status.get("sessions", []) if isinstance(collab_status, dict) else []
    document_by_name = {
        str(item.get("name", "")).strip(): dict(item)
        for item in documents
        if isinstance(item, dict) and str(item.get("name", "")).strip()
    }
    users: dict[str, dict] = {}
    connections: list[dict] = []
    session_by_doc: dict[str, dict] = {}

    for session in sessions:
        if not isinstance(session, dict):
            continue
        doc_name = str(session.get("doc", "")).strip()
        session_by_doc[doc_name] = session
        for user in session.get("users", []) if isinstance(session.get("users"), list) else []:
            if not isinstance(user, dict):
                continue
            user_id = str(user.get("userId") or user.get("id") or user.get("name") or "未设置用户").strip() or "未设置用户"
            user_name = str(user.get("name") or user.get("user") or user_id).strip() or user_id
            entry = users.setdefault(
                user_id,
                {
                    "id": user_id,
                    "name": user_name,
                    "documentCount": 0,
                    "documents": [],
                    "connectionCount": 0,
                    "remoteAddrs": [],
                    "clientIds": [],
                    "sessionIds": [],
                },
            )
            if doc_name and doc_name not in entry["documents"]:
                entry["documents"].append(doc_name)
                entry["documentCount"] = len(entry["documents"])
            entry["connectionCount"] += int(user.get("connectionCount") or 0)
            entry["remoteAddrs"] = sorted(set([*entry["remoteAddrs"], *[str(item) for item in user.get("remoteAddrs", []) if item]]))
            entry["clientIds"] = sorted(set([*entry["clientIds"], *[str(item) for item in user.get("clientIds", []) if item]]))
            entry["sessionIds"] = sorted(set([*entry["sessionIds"], *[str(item) for item in user.get("sessionIds", []) if item]]))
            for client_id in user.get("clientIds", []) if isinstance(user.get("clientIds"), list) else []:
                connections.append(
                    {
                        "doc": doc_name,
                        "userId": user_id,
                        "userName": user_name,
                        "clientId": str(client_id),
                        "sessionIds": user.get("sessionIds", []),
                        "remoteAddrs": user.get("remoteAddrs", []),
                    }
                )

    related_documents = []
    for doc_name, document in document_by_name.items():
        session = session_by_doc.get(doc_name, {})
        users_for_doc = session.get("users", []) if isinstance(session.get("users"), list) else []
        related_documents.append(
            {
                **document,
                "online": bool(session),
                "seq": session.get("seq", 0),
                "dirty": bool(session.get("dirty", False)),
                "autosavePending": bool(session.get("autosavePending", False)),
                "connectionCount": int(session.get("connectionCount") or 0),
                "userCount": len(users_for_doc),
                "users": [str(item.get("name") or item.get("user") or item.get("id") or "") for item in users_for_doc if isinstance(item, dict)],
            }
        )
    for doc_name, session in session_by_doc.items():
        if doc_name in document_by_name:
            continue
        users_for_doc = session.get("users", []) if isinstance(session.get("users"), list) else []
        related_documents.append(
            {
                "name": doc_name,
                "title": doc_name,
                "space": "",
                "tags": [],
                "author": "",
                "date": "",
                "online": True,
                "seq": session.get("seq", 0),
                "dirty": bool(session.get("dirty", False)),
                "autosavePending": bool(session.get("autosavePending", False)),
                "connectionCount": int(session.get("connectionCount") or 0),
                "userCount": len(users_for_doc),
                "users": [str(item.get("name") or item.get("user") or item.get("id") or "") for item in users_for_doc if isinstance(item, dict)],
            }
        )

    return {
        "users": sorted(users.values(), key=lambda item: (str(item.get("name", "")), str(item.get("id", "")))),
        "connections": sorted(connections, key=lambda item: (str(item.get("doc", "")), str(item.get("userName", "")), str(item.get("clientId", "")))),
        "documents": sorted(related_documents, key=lambda item: (not item.get("online"), str(item.get("name", "")))),
    }


def _build_log_summary(events: list[dict]) -> dict:
    event_counts: Counter[str] = Counter()
    logger_counts: Counter[str] = Counter()
    document_counts: Counter[str] = Counter()
    errors: list[dict] = []
    for item in events:
        if not isinstance(item, dict):
            continue
        event = str(item.get("event", "") or "unknown")
        logger = str(item.get("logger", "") or "unknown")
        event_counts[event] += 1
        logger_counts[logger] += 1
        doc = str(item.get("doc") or item.get("document") or item.get("name") or "").strip()
        if doc:
            document_counts[doc] += 1
        if str(item.get("level", "")).lower() == "error":
            errors.append(item)
    return {
        "total": len(events),
        "errorCount": len(errors),
        "eventCounts": dict(event_counts.most_common(20)),
        "loggerCounts": dict(logger_counts.most_common(20)),
        "documentCounts": dict(document_counts.most_common(20)),
        "recentErrors": errors[-10:],
    }


def _admin_page() -> str:
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BLM 管理端</title>
  <style>
    :root{--bg:#f4f7fb;--panel:#fff;--line:#dbe4ef;--text:#0f172a;--muted:#64748b;--blue:#2563eb;--green:#16a34a;--amber:#d97706;--red:#dc2626}
    *{box-sizing:border-box}
    body{font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;margin:0;background:var(--bg);color:var(--text)}
    header{background:#172033;color:#e2e8f0;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px}
    header strong{font-size:18px} header small{display:block;color:#94a3b8}
    main{padding:20px;display:flex;flex-direction:column;gap:16px}
    .toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    button,a{border:1px solid #93c5fd;border-radius:8px;background:#eff6ff;color:#1d4ed8;padding:7px 10px;text-decoration:none;font-weight:700;cursor:pointer}
    .ghost{background:transparent;color:#dbeafe;border-color:#475569}
    .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;box-shadow:0 8px 24px rgba(15,23,42,.05)}
    .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
    .metric{border:1px solid var(--line);border-radius:10px;padding:12px;background:#f8fafc}
    .metric span{display:block;color:var(--muted);font-size:12px;font-weight:800}.metric strong{font-size:24px}
    .metric.good strong{color:var(--green)}.metric.warn strong{color:var(--amber)}.metric.bad strong{color:var(--red)}
    .layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr);gap:16px;align-items:start}
    .section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .section-head h2{margin:0;font-size:16px}.section-head span{color:var(--muted);font-size:12px}
    .tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
    .tab{border-color:var(--line);background:#fff;color:#334155}.tab.active{background:#2563eb;color:#fff;border-color:#2563eb}
    .tab-panel{display:none}.tab-panel.active{display:block}
    table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}
    th,td{padding:9px 10px;border-bottom:1px solid #edf2f7;text-align:left;vertical-align:top}
    th{background:#f8fafc;color:#475569;font-size:12px} tr:last-child td{border-bottom:none}
    .mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
    .pill{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 8px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:12px;font-weight:700}
    .pill.green{background:#ecfdf5;border-color:#bbf7d0;color:#15803d}.pill.red{background:#fef2f2;border-color:#fecaca;color:#b91c1c}.pill.gray{background:#f8fafc;border-color:#e2e8f0;color:#64748b}
    .logs{display:flex;flex-direction:column;gap:8px;max-height:560px;overflow:auto}
    .log-item{border:1px solid var(--line);border-radius:8px;background:#fff;padding:9px}
    .log-item.error{border-color:#fecaca;background:#fff7f7}
    .log-line{display:flex;gap:8px;align-items:center;justify-content:space-between}
    pre{max-height:420px;overflow:auto;background:#0f172a;color:#dbeafe;padding:12px;border-radius:8px;white-space:pre-wrap}
    @media(max-width:1100px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.layout{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header>
    <div><strong>BLM 管理端</strong><small id="service-line">加载服务状态...</small></div>
    <div class="toolbar">
      <button class="ghost" type="button" onclick="refresh()">立即刷新</button>
      <a href="/api/diagnostics.zip">下载诊断包</a>
    </div>
  </header>
  <main>
    <section class="card">
      <div class="section-head"><h2>运行概览</h2><span id="refresh-line">未刷新</span></div>
      <div class="metrics" id="metrics"></div>
    </section>
    <div class="layout">
      <section class="card">
        <div class="section-head"><h2>协作关系</h2><span>用户、连接、文档分开查看</span></div>
        <div class="tabs">
          <button class="tab active" type="button" data-tab="users" onclick="switchTab('users')">用户</button>
          <button class="tab" type="button" data-tab="connections" onclick="switchTab('connections')">连接</button>
          <button class="tab" type="button" data-tab="documents" onclick="switchTab('documents')">文档</button>
        </div>
        <div id="panel-users" class="tab-panel active"></div>
        <div id="panel-connections" class="tab-panel"></div>
        <div id="panel-documents" class="tab-panel"></div>
      </section>
      <section class="card">
        <div class="section-head"><h2>最近日志</h2><span id="log-summary-line"></span></div>
        <div id="logs" class="logs">加载中...</div>
      </section>
    </div>
    <section class="card">
      <details>
        <summary><strong>展开原始状态 JSON</strong></summary>
        <pre id="raw-status">加载中...</pre>
      </details>
    </section>
  </main>
  <script>
    let latestStatus = null;
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const fmtTime = (value) => value ? new Date(value).toLocaleString('zh-CN') : '-';
    const fmtDuration = (seconds) => {
      const sec = Number(seconds || 0);
      if (sec < 60) return `${sec} 秒`;
      if (sec < 3600) return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
      return `${Math.floor(sec / 3600)} 小时 ${Math.floor((sec % 3600) / 60)} 分`;
    };
    function switchTab(name){
      document.querySelectorAll('.tab').forEach((item)=>item.classList.toggle('active', item.dataset.tab === name));
      document.querySelectorAll('.tab-panel').forEach((item)=>item.classList.toggle('active', item.id === `panel-${name}`));
    }
    function renderTable(headers, rows, emptyText){
      if(!rows.length) return `<div class="pill gray">${esc(emptyText || '暂无数据')}</div>`;
      return `<table><thead><tr>${headers.map((item)=>`<th>${esc(item)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    }
    function renderMetrics(status){
      const rel = status.relationships || {};
      const users = rel.users || [];
      const connections = rel.connections || [];
      const documents = rel.documents || [];
      const activeDocs = documents.filter((item)=>item.online).length;
      const errors = status.logSummary?.errorCount || 0;
      const cards = [
        ['文档', status.documents?.count ?? 0, ''],
        ['活跃文档', activeDocs, activeDocs ? 'good' : ''],
        ['在线用户', users.length, users.length ? 'good' : ''],
        ['连接', connections.length, connections.length ? 'good' : ''],
        ['错误日志', errors, errors ? 'bad' : 'good'],
      ];
      document.getElementById('metrics').innerHTML = cards.map(([k,v,cls])=>`<div class="metric ${cls}"><span>${k}</span><strong>${v}</strong></div>`).join('');
    }
    function renderRelationships(status){
      const rel = status.relationships || {};
      const users = rel.users || [];
      const connections = rel.connections || [];
      const documents = rel.documents || [];
      document.getElementById('panel-users').innerHTML = renderTable(
        ['用户', '文档', '连接', '远端地址'],
        users.map((item)=>`<tr><td><strong>${esc(item.name || item.id)}</strong><br><span class="mono">${esc(item.id)}</span></td><td>${(item.documents || []).map((doc)=>`<span class="pill">${esc(doc)}</span>`).join(' ') || '-'}</td><td>${esc(item.connectionCount)}</td><td class="mono">${esc((item.remoteAddrs || []).join('\\n') || '-')}</td></tr>`),
        '暂无在线用户'
      );
      document.getElementById('panel-connections').innerHTML = renderTable(
        ['文档', '用户', '客户端', '远端地址'],
        connections.map((item)=>`<tr><td>${esc(item.doc)}</td><td>${esc(item.userName || item.userId)}</td><td class="mono">${esc(item.clientId)}</td><td class="mono">${esc((item.remoteAddrs || []).join('\\n') || '-')}</td></tr>`),
        '暂无连接'
      );
      document.getElementById('panel-documents').innerHTML = renderTable(
        ['文档', '空间', '状态', '用户', 'Seq'],
        documents.map((item)=>`<tr><td><strong>${esc(item.title || item.name)}</strong><br><span class="mono">${esc(item.name)}</span></td><td>${esc(item.space || '-')}</td><td>${item.online ? '<span class="pill green">在线</span>' : '<span class="pill gray">离线</span>'} ${item.dirty ? '<span class="pill red">待落盘</span>' : ''} ${item.autosavePending ? '<span class="pill">自动同步中</span>' : ''}</td><td>${(item.users || []).map((name)=>`<span class="pill">${esc(name || '未设置用户')}</span>`).join(' ') || '-'}</td><td>${esc(item.seq || 0)}</td></tr>`),
        '暂无文档'
      );
    }
    function renderLogs(status){
      const events = status.recentEvents || [];
      const summary = status.logSummary || {};
      document.getElementById('log-summary-line').textContent = `最近 ${summary.total || events.length} 条，错误 ${summary.errorCount || 0} 条`;
      document.getElementById('logs').innerHTML = events.length ? events.slice().reverse().map((item)=>`
        <div class="log-item ${item.level === 'error' ? 'error' : ''}">
          <div class="log-line"><strong>${esc(item.event || '-')}</strong><span class="pill ${item.level === 'error' ? 'red' : 'gray'}">${esc(item.level || 'info')}</span></div>
          <div class="mono">${esc(item.ts || '')} · ${esc(item.logger || '')}</div>
          <details><summary>字段</summary><pre>${esc(JSON.stringify(item, null, 2))}</pre></details>
        </div>`).join('') : '<div class="pill gray">暂无日志</div>';
    }
    async function refresh(){
      const status = await fetch('/api/status', {cache:'no-store'}).then(r=>r.json());
      latestStatus = status;
      document.getElementById('service-line').textContent = `主端口 ${status.service?.appPort ?? '-'} · 运行 ${fmtDuration(status.service?.uptimeSeconds || 0)} · ${status.service?.workspaceDir || ''}`;
      document.getElementById('refresh-line').textContent = `刷新于 ${new Date().toLocaleTimeString('zh-CN')} · 每 5 秒自动刷新`;
      renderMetrics(status);
      renderRelationships(status);
      renderLogs(status);
      document.getElementById('raw-status').textContent = JSON.stringify(status, null, 2);
    }
    refresh().catch((error)=>{document.getElementById('refresh-line').textContent = `刷新失败：${error.message}`});
    setInterval(()=>refresh().catch(()=>{}), 5000);
  </script>
</body>
</html>"""


def log_admin_start(port: int, workspace_dir: Path) -> None:
    log_event("blm.admin", "admin.start", port=port, workspaceDir=workspace_dir)
