from __future__ import annotations

import http.server
import io
import json
import time
import zipfile
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
        "recentEvents": read_recent_log_events(50),
    }


def _admin_page() -> str:
    return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BLM 管理端</title>
  <style>
    body{font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f1f5f9;color:#0f172a}
    header{background:#1e293b;color:#e2e8f0;padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
    main{padding:20px;display:grid;gap:14px}
    .card{background:#fff;border:1px solid #dbe4ef;border-radius:10px;padding:14px;box-shadow:0 8px 24px rgba(15,23,42,.05)}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .metric{border:1px solid #dbe4ef;border-radius:8px;padding:10px;background:#f8fafc}
    .metric span{display:block;color:#64748b;font-size:12px;font-weight:700}.metric strong{font-size:20px}
    button,a{border:1px solid #93c5fd;border-radius:8px;background:#eff6ff;color:#1d4ed8;padding:7px 10px;text-decoration:none;font-weight:700;cursor:pointer}
    pre{max-height:420px;overflow:auto;background:#0f172a;color:#dbeafe;padding:12px;border-radius:8px;white-space:pre-wrap}
  </style>
</head>
<body>
  <header><strong>BLM 管理端</strong><a href="/api/diagnostics.zip">下载诊断包</a></header>
  <main>
    <section class="card">
      <div class="grid" id="metrics"></div>
    </section>
    <section class="card"><h3>协作会话</h3><pre id="collab">加载中...</pre></section>
    <section class="card"><h3>最近日志</h3><pre id="logs">加载中...</pre></section>
  </main>
  <script>
    async function refresh(){
      const status = await fetch('/api/status').then(r=>r.json());
      document.getElementById('metrics').innerHTML = [
        ['文档数', status.documents?.count ?? 0],
        ['协作会话', status.collaboration?.sessionCount ?? 0],
        ['运行秒数', status.service?.uptimeSeconds ?? 0],
        ['主端口', status.service?.appPort ?? '-']
      ].map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${v}</strong></div>`).join('');
      document.getElementById('collab').textContent = JSON.stringify(status.collaboration || {}, null, 2);
      document.getElementById('logs').textContent = JSON.stringify(status.recentEvents || [], null, 2);
    }
    refresh(); setInterval(refresh, 10000);
  </script>
</body>
</html>"""


def log_admin_start(port: int, workspace_dir: Path) -> None:
    log_event("blm.admin", "admin.start", port=port, workspaceDir=workspace_dir)
