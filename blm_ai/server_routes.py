"""AI 路由模块 — 独立于 blm_core/server.py，通过 register_ai_routes() 注入。

server.py 只需调用 register_ai_routes(BlmRequestHandler, storage) 即可挂载所有 AI 端点。
修改 AI 端点不需要动 server.py —— 实现 AI 与 BLM 的解耦。

端点:
  GET  /api/ai/sessions          — 用户会话列表
  GET  /api/ai/export/{id}/status — 导出进度
  GET  /api/ai/export/{id}/download — 导出下载
  POST /api/agent/chat           — 通用对话 (SSE WireEvent)
  POST /api/ai/ask               — 工作区问答 (SSE)
  POST /api/ai/export/start      — 启动导出
"""

import asyncio
import json
import threading
import time
import uuid

# ---- WireEvent 转换 ----

def _to_wire(event):
    """AgentEvent → WireEvent dict for SSE streaming。"""
    kind = getattr(event, 'kind', '')
    if kind == 'llm_response': return {'kind':'llm_response','text':event.text,'tool_blocks':event.tool_blocks}
    if kind == 'text_delta': return {'kind':'text_delta','text':event.text}
    if kind == 'tool_dispatch': return {'kind':'tool_dispatch','tool_id':event.tool_id,'tool_name':event.tool_name,'args':event.args,'read_only':event.read_only}
    if kind == 'tool_result': return {'kind':'tool_result','tool_id':event.tool_id,'tool_name':event.tool_name,'output':event.output,'is_error':event.is_error}
    if kind == 'tool_progress': return {'kind':'tool_progress','tool_id':event.tool_id,'tool_name':event.tool_name,'output':event.output}
    if kind == 'approval_request': return {'kind':'approval_request','approval_id':event.approval_id,'tool_name':event.tool_name,'reason':event.reason}
    if kind == 'error': return {'kind':'error','error':event.error,'recoverable':event.recoverable}
    if kind == 'agent_complete': return {'done':True}
    if kind == 'turn_started': return {'kind':'turn_started','turn':event.turn}
    if kind == 'turn_done': return {'kind':'turn_done','turn':event.turn}
    if kind == 'usage': return {'kind':'usage','prompt_tokens':event.prompt_tokens,'completion_tokens':event.completion_tokens,'total_tokens':event.total_tokens}
    return None

# ---- SSE 流式响应 ----

def _stream_sse(handler, storage, prompt):
    """通用 SSE 流式响应 — 创建 Agent 并将事件转为 WireEvent 推送。"""
    from blm_ai.config import load_config
    from blm_ai.agent_builder import build_blm_agent

    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("Connection", "keep-alive")
    handler.end_headers()

    config = load_config(storage.workspace_dir)
    config.interactive = False
    agent = build_blm_agent(config)

    async def _run():
        async for event in agent.run(prompt):
            wire = _to_wire(event)
            if wire:
                handler.wfile.write(f"data: {json.dumps(wire, ensure_ascii=False)}\n\n".encode())
                handler.wfile.flush()

    def _thread():
        asyncio.run(_run())

    t = threading.Thread(target=_thread, daemon=True)
    t.start()
    t.join(timeout=300)

# ---- Handler 方法（按 handler/storage 参数化） ----

def _handle_agent_chat(handler, body, storage):
    """POST /api/agent/chat — 通用 AI 对话 SSE。"""
    payload = _decode(handler, body)
    if isinstance(payload, tuple): return handler._json(payload[0], payload[1])
    prompt = str(payload.get("prompt", "")).strip()
    if not prompt: return handler._json({"error":"prompt is required"}, 400)
    _stream_sse(handler, storage, prompt)

def _handle_ai_ask(handler, body, storage):
    """POST /api/ai/ask — 工作区问答 SSE。"""
    payload = _decode(handler, body)
    if isinstance(payload, tuple): return handler._json(payload[0], payload[1])
    workspace = str(payload.get("workspace","")).strip()
    question = str(payload.get("question","")).strip()
    if not workspace or not question: return handler._json({"error":"workspace and question required"}, 400)
    _stream_sse(handler, storage, f"请先加载工作区 '{workspace}' 的内容，然后回答: {question}")

def _handle_ai_sessions(handler, body, storage):
    """GET /api/ai/sessions — 用户会话列表。"""
    user_id = str(handler.headers.get("X-User-Id", "default")).strip()
    from blm_ai.session.manager import SessionManager
    mgr = SessionManager(storage.workspace_dir / ".blm" / "sessions", user_id)
    sessions = [{"id":s.id,"cwd":s.cwd,"created_at":s.created_at,"message_count":s.message_count} for s in mgr.list_all()]
    return handler._json(sessions)

def _handle_ai_export_start(handler, body, storage):
    """POST /api/ai/export/start — 启动 AI 导出。"""
    payload = _decode(handler, body)
    if isinstance(payload, tuple): return handler._json(payload[0], payload[1])
    workspace = str(payload.get("workspace","")).strip()
    if not workspace: return handler._json({"error":"workspace required"}, 400)
    try:
        storage.load(workspace)
    except Exception as e:
        return handler._json({"error":str(e)}, 404)

    job_id = uuid.uuid4().hex
    job = {"id":job_id,"workspace":workspace,"status":"queued","progress":5,"message":"AI 分析中...","filename":"","payload":None,"error":"","createdAt":time.time(),"updatedAt":time.time()}
    with _export_lock:
        _export_jobs[job_id] = job
    threading.Thread(target=_run_export_job, args=(job_id, workspace, storage), daemon=True).start()
    return handler._json(_public_job(job))

# ---- 导出 Job 管理 ----

_export_jobs = {}
_export_lock = threading.RLock()

def _public_job(job):
    return {"id":job.get("id",""),"workspace":job.get("workspace",""),"status":job.get("status",""),"progress":int(job.get("progress") or 0),"message":job.get("message",""),"filename":job.get("filename",""),"error":job.get("error","")}

def _run_export_job(job_id, workspace, storage):
    def update(**kw):
        with _export_lock:
            j = _export_jobs.get(job_id)
            if j: j.update(kw); j["updatedAt"] = time.time()
    update(status="running", progress=12)
    try:
        from blm_ai.config import load_config
        from blm_ai.agent_builder import build_blm_agent
        config = load_config(storage.workspace_dir); config.interactive = False
        agent = build_blm_agent(config)

        async def _run():
            async for event in agent.run(f"为工作区 '{workspace}' 生成 DOCX 导出文档。output_path 请指定为临时目录。"):
                pass
        asyncio.run(_run())
        update(status="done", progress=100, message="DOCX 已生成")
    except Exception as e:
        update(status="failed", progress=100, error=str(e))

def _handle_ai_export_status(handler, path, storage):
    """GET /api/ai/export/{id}/status。"""
    job_id = path.split("/api/ai/export/")[1].split("/")[0]
    with _export_lock:
        job = _export_jobs.get(job_id)
        return handler._json(_public_job(job)) if job else handler._json({"error":"not found"}, 404)

def _handle_ai_export_download(handler, path, storage):
    """GET /api/ai/export/{id}/download。"""
    job_id = path.split("/api/ai/export/")[1].split("/download")[0]
    with _export_lock:
        job = _export_jobs.get(job_id)
        if not job: return handler._json({"error":"not found"}, 404)
        if job.get("status")!="done" or not isinstance(job.get("payload"), bytes):
            return handler._json({"error":"not ready"}, 409)
        return handler._binary(job["payload"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename=job.get("filename","blm-ai-export.docx"))

# ---- 解码 ----

def _decode(handler, body):
    try: return json.loads(body or b"{}")
    except json.JSONDecodeError: return {"error":"invalid json"}, 400

# ---- 注册入口 ----

def register_ai_routes(handler_cls, storage):
    """向 BlmRequestHandler 类注入 AI 路由。

    在 server.py 的 create_handler() 中调用:
        from blm_ai.server_routes import register_ai_routes
        register_ai_routes(BlmRequestHandler, storage)

    这会向 handler 类添加 _ai_routes_get 和 _ai_routes_post 字典。
    server.py 的 do_GET/do_POST 会检查这些字典来路由 AI 请求。
    """
    handler_cls._ai_routes_get = {
        "/api/ai/sessions": lambda self: _handle_ai_sessions(self, None, storage),
    }
    handler_cls._ai_routes_post = {
        "/api/agent/chat": lambda self, body: _handle_agent_chat(self, body, storage),
        "/api/ai/ask": lambda self, body: _handle_ai_ask(self, body, storage),
        "/api/ai/export/start": lambda self, body: _handle_ai_export_start(self, body, storage),
    }
    handler_cls._ai_export_status = lambda self, path: _handle_ai_export_status(self, path, storage)
    handler_cls._ai_export_download = lambda self, path: _handle_ai_export_download(self, path, storage)
