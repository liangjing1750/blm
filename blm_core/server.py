from __future__ import annotations

import os
import gzip
import http.server
import json
import base64
import mimetypes
import re
import threading
import time
import uuid
import webbrowser
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import URLError
from urllib.parse import parse_qs, quote, unquote, urlparse

from blm_core.admin import create_admin_handler, log_admin_start
from blm_core.diagnostics import configure_diagnostics, log_error, log_event, runtime_fields
from blm_core.document import canonical_document, migrate_document
from blm_core.collab import CollaborationManager
from blm_core.export_graphs import list_export_graphs
from blm_core.feedback import FeedbackStore
from blm_core.docx import DocxImage
from blm_core.graph_screenshot import capture_graph_images
from blm_core.merge import analyze_merge, apply_merge, validate_document
from blm_core.storage import (
    InvalidDocumentNameError,
    InvalidWorkspaceEntryError,
    WorkspaceStorage,
)

def _load_app_version(root: Path) -> str:
    version_file = root / "version"
    try:
        return version_file.read_text("utf-8").strip() or "3.0"
    except Exception:
        return "3.0"


def _load_env(key: str, default: str = "", root: Path | None = None) -> str:
    if root is None:
        import __main__
        root = Path(getattr(__main__, "__file__", ".")).parent
    env_file = root / ".env"
    if not env_file.exists():
        return os.environ.get(key, default)
    # 环境变量优先于 .env 文件
    env_val = os.environ.get(key)
    if env_val is not None:
        return env_val
    try:
        for line in env_file.read_text("utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            candidate_key, _, value = line.partition("=")
            if candidate_key.strip() == key:
                return value.strip().strip('"').strip("'") or default
    except Exception:
        pass
    return os.environ.get(key, default)


DOCS_MANIFEST = [
    {
        "id": "index",
        "title": "文档导航",
        "filename": "index.md",
        "summary": "BLM 文档总览：用户文档、开发文档、指导原则、设计规格、重构资产。",
    },
    {
        "id": "user-manual",
        "title": "用户手册",
        "filename": "user/manual.md",
        "summary": "查看工作区使用方法、合并流程、回收站和导出说明。",
    },
    {
        "id": "workflow",
        "title": "工作流建议",
        "filename": "user/workflow.md",
        "summary": "团队推广 BLM 的推荐工作流程、角色分工和并行协作节奏。",
    },
    {
        "id": "collaboration-troubleshooting",
        "title": "协作与弱网排障指南",
        "filename": "user/collaboration.md",
        "summary": "查看实时协作、HTTP 降级、日志格式、管理端和跨网段断线排查步骤。",
    },
    {
        "id": "collaboration-merge",
        "title": "多人协作合并比对",
        "filename": "user/merge-comparison.md",
        "summary": "3-way 合并规则、冲突处理、旧版本提交、比对功能与历史记录操作。",
    },
    {
        "id": "design",
        "title": "设计文档",
        "filename": "dev/design.md",
        "summary": "产品边界、模块职责、数据模型、合并策略与协作流程。",
    },
    {
        "id": "data-model",
        "title": "数据模型",
        "filename": "dev/data-model.md",
        "summary": "六层建模体系：价值流、业务域、阶段、流程、节点、步骤。",
    },
    {
        "id": "modeling-thinking",
        "title": "业务建模思考",
        "filename": "dev/business-modeling.md",
        "summary": "业务建模方法论：迭代校准、流程分析、建模深度与分工。",
    },
    {
        "id": "testing",
        "title": "测试用例",
        "filename": "dev/testing.md",
        "summary": "Python 单元测试、浏览器 E2E 测试脚本和核心回归用例。",
    },
    {
        "id": "server-directory",
        "title": "服务端文件夹说明",
        "filename": "dev/server-layout.md",
        "summary": "workspace/ 目录结构、关键文件作用、文档序列号和升级迁移说明。",
    },
    {
        "id": "v3-thinking",
        "title": "v3 版本思考",
        "filename": "dev/v3-thinking.md",
        "summary": "v3 产品定位、角色定义、工作台设计、落地顺序。",
    },
    {
        "id": "angular-recovery",
        "title": "Angular 迁移恢复",
        "filename": "dev/angular-recovery.md",
        "summary": "Angular 迁移中丢失功能的恢复情况跟踪。",
    },
    {
        "id": "ai-handoff",
        "title": "AI 交接文档",
        "filename": "dev/ai-handoff.md",
        "summary": "AI 开发者上手指南：项目状态、目录结构、开发规范、验证流程。",
    },
    {
        "id": "release-20260511",
        "title": "发布记录 2026-05-11",
        "filename": "dev/release-notes/20260511.md",
        "summary": "实体状态图、预览增强、对比/合并优化、表单-实体关联优化。",
    },
    {
        "id": "release-20260513",
        "title": "发布记录 2026-05-13",
        "filename": "dev/release-notes/20260513.md",
        "summary": "阶段视图预览、附件存储优化、并行编辑防覆盖、后端健壮性修复。",
    },
    {
        "id": "steering-architecture",
        "title": "架构原则",
        "filename": "steering/architecture.md",
        "summary": "本地优先、文件驱动、向前兼容、业务概念优先。",
    },
    {
        "id": "steering-product",
        "title": "产品原则",
        "filename": "steering/product.md",
        "summary": "目标用户、成功标准。",
    },
    {
        "id": "steering-quality",
        "title": "质量原则",
        "filename": "steering/quality.md",
        "summary": "旧文档兼容率、回归通过率、默认工程实践。",
    },
    {
        "id": "spec-component-tabs",
        "title": "构件工作台 Tab 拆分",
        "filename": "specs/component-workbench-tabs.md",
        "summary": "构件工作台四 Tab 设计规格：组件/构件/任务定义/实体。",
    },
    {
        "id": "spec-app-service-ux",
        "title": "应用服务 UX 设计",
        "filename": "specs/application-service-ux.md",
        "summary": "服务组卡片 + 接口卡片 + 右侧抽屉编辑的设计规格。",
    },
    {
        "id": "spec-app-service-ux-plan",
        "title": "应用服务 UX 执行计划",
        "filename": "specs/application-service-ux-plan.md",
        "summary": "5 步实现任务：卡片浏览、抽屉详情、抽屉编辑、样式验证。",
    },
    {
        "id": "refactor-css-spec",
        "title": "CSS/SCSS 三层规范",
        "filename": "refactor/css-tiered-spec.md",
        "summary": "项目级/模块级/组件级样式管理规范与死样式清理流程。",
    },
    {
        "id": "refactor-data-terminology",
        "title": "数据术语表",
        "filename": "refactor/data-terminology.md",
        "summary": "工作区文档字段名扫描结果与标准化建议。",
    },
    {
        "id": "refactor-styles-classification",
        "title": "样式分类汇总",
        "filename": "refactor/styles-classification.md",
        "summary": "styles.scss 分类：在用样式（628）、全局（213）、疑似死样式（961）。",
    },
]
DOCS_INDEX = {item["id"]: item for item in DOCS_MANIFEST}
API_VERSION = 2


def build_attachment_content_disposition(filename: str) -> str:
    fallback = "".join(
        char if 32 <= ord(char) < 127 and char not in {'"', "\\", ";"} else "_"
        for char in str(filename or "").strip()
    ).strip(" .")
    if not fallback:
        fallback = "download"
    encoded_filename = quote(str(filename or fallback), safe="")
    return f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{encoded_filename}'


def create_handler(app_dir: Path, storage: WorkspaceStorage, collab: CollaborationManager | None = None):
    docs_dir = (app_dir.parent / "docs").resolve()
    feedback_store = FeedbackStore(storage.workspace_dir)
    export_jobs: dict[str, dict] = {}
    export_jobs_lock = threading.RLock()
    export_cache: dict[str, tuple[str, bytes]] = {}
    export_cache_lock = threading.RLock()

    class BlmRequestHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            self._request_status = 0
            self._request_started_at = 0.0
            super().__init__(*args, directory=str(app_dir), **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            super().end_headers()

        def send_response(self, code, message=None):
            self._request_status = int(code or 0)
            super().send_response(code, message)

        def do_GET(self):
            self._begin_request()
            try:
                path = urlparse(self.path).path
                if path == "/api/runtime":
                    return self._json(
                        {
                            "api_version": API_VERSION,
                            "mode": "browser",
                            "supports_workspace": True,
                            "supports_merge": True,
                            "supports_docs": True,
                            "supports_copy": True,
                            "supports_collab": bool(collab),
                            "agent_url": _load_env("AGENT_URL", "http://127.0.0.1:8088", app_dir.parent),
                            "app_version": _load_app_version(app_dir.parent),
                        }
                    )
                if path == "/api/collab/ws" and collab:
                    return collab.handle_websocket(self)
                if path == "/api/collab/poll" and collab:
                    return self._handle_collab_poll()
                if path == "/api/files":
                    return self._json(storage.list_documents())
                if path == "/api/files/meta":
                    return self._json(storage.list_document_summaries())
                if path == "/api/trash":
                    return self._json(storage.list_trash())
                if path == "/api/feedback":
                    return self._json(feedback_store.load())
                if path.startswith("/api/feedback/attachment/"):
                    return self._handle_feedback_attachment(path)
                if path == "/api/docs":
                    return self._json(DOCS_MANIFEST)
                if path.startswith("/api/docs/assets/"):
                    return self._handle_docs_asset(path)
                if path.startswith("/api/docs/"):
                    return self._handle_docs(path)
                if path.startswith("/api/load/"):
                    return self._handle_load(path)
                if path.startswith("/api/attachment/"):
                    return self._handle_attachment(path)
                if path.startswith("/api/export-docx/"):
                    return self._handle_export_docx(path)
                if getattr(self.__class__, '_ai_routes_get', None):
                    for prefix, handler in self.__class__._ai_routes_get.items():
                        if path == prefix: return handler(self)
                if path.startswith("/api/ai/export/") and path.endswith("/download"):
                    if hasattr(self.__class__, '_ai_export_download'):
                        return self.__class__._ai_export_download(self, path)
                if path.startswith("/api/ai/export/"):
                    if hasattr(self.__class__, '_ai_export_status'):
                        return self.__class__._ai_export_status(self, path)
                if path.startswith("/api/export-jobs/") and path.endswith("/render-document"):
                    return self._handle_export_job_render_document(path)
                if path.startswith("/api/export-jobs/") and path.endswith("/download"):
                    return self._handle_export_job_download(path)
                if path.startswith("/api/export-jobs/"):
                    return self._handle_export_job_status(path)
                if path.startswith("/api/export-bundle/"):
                    # 支持 ?version=xxx&format=json|md|docx 参数，缓存命中直接返回
                    qs = parse_qs(urlparse(self.path).query)
                    req_version = (qs.get("version") or [None])[0]
                    req_format = (qs.get("format") or [None])[0]
                    if req_version and req_format:
                        name = unquote(path[len("/api/export-bundle/"):].split("?")[0])
                        try:
                            safe_name = storage._validate_name(name)
                            cached = self._check_export_cache(safe_name, req_version, req_format)
                            if cached:
                                filename, payload = cached
                                ctype = "application/zip"
                                if req_format == "docx":
                                    ctype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                return self._binary(payload, ctype, filename=filename)
                        except (InvalidDocumentNameError, FileNotFoundError):
                            pass
                        return self._json({"cached": False}, 200)
                    return self._handle_export_bundle(path)
                if path.startswith("/api/export/"):
                    return self._handle_export(path)
                if path.startswith("/api/history/"):
                    return self._handle_history(path)
                if path.startswith("/api/versions/"):
                    return self._handle_versions(path)
                if not path.startswith("/api/") and not (app_dir / path.lstrip("/")).exists():
                    self.path = "/index.html"
                return super().do_GET()
            except Exception as exc:
                log_error("blm.http", "http.request.error", method="GET", path=self.path, error=str(exc))
                raise
            finally:
                self._finish_request("GET")

        def do_POST(self):
            self._begin_request()
            try:
                path = urlparse(self.path).path
                body = self._read_body()

                if path.startswith("/api/save/"):
                    return self._handle_save(path, body)
                if path == "/api/attachment-upload":
                    return self._handle_attachment_upload(body)
                if path == "/api/rename":
                    return self._handle_rename(body)
                if path == "/api/copy":
                    return self._handle_copy(body)
                if path == "/api/new":
                    return self._handle_new(body)
                if path.startswith("/api/delete/"):
                    return self._handle_delete(path)
                if path == "/api/history/load":
                    return self._handle_history_load(body)
                if path == "/api/history/restore":
                    return self._handle_history_restore(body)
                if path == "/api/version/create":
                    return self._handle_version_create(body)
                if path == "/api/version/load":
                    return self._handle_version_load(body)
                if path == "/api/trash/restore":
                    return self._handle_trash_restore(body)
                if path == "/api/trash/delete":
                    return self._handle_trash_delete(body)
                if path == "/api/trash/clear":
                    return self._handle_trash_clear(body)
                if path == "/api/feedback":
                    return self._handle_feedback(body)
                if path == "/api/feedback/attachment":
                    return self._handle_feedback_attachment_upload(body)
                if path == "/api/document/normalize":
                    return self._handle_document_normalize(body)
                if path == "/api/document/validate":
                    return self._handle_document_validate(body)
                if path == "/api/merge/analyze":
                    return self._handle_merge_analyze(body)
                if path == "/api/merge/apply":
                    return self._handle_merge_apply(body)
                if path == "/api/export/json/start":
                    return self._start_export(body, "json")
                if path == "/api/export/markdown/start":
                    return self._start_export(body, "markdown")
                if path == "/api/export-docx/start":
                    return self._start_export(body, "docx")
                if path == "/api/agent/handoff":
                    return self._handle_agent_handoff(body)
                if getattr(self.__class__, '_ai_routes_post', None):
                    for prefix, handler in self.__class__._ai_routes_post.items():
                        if path == prefix: return handler(self, body)
                if path == "/api/collab/snapshot" and collab:
                    return self._handle_collab_snapshot(body)
                if path == "/api/collab/submits/list" and collab:
                    return self._handle_collab_submits_list(body)
                if path == "/api/collab/submits/load" and collab:
                    return self._handle_collab_submits_load(body)

                return self._json({"error": "not found"}, 404)
            except Exception as exc:
                log_error("blm.http", "http.request.error", method="POST", path=self.path, error=str(exc))
                raise
            finally:
                self._finish_request("POST")

        def log_message(self, *_):
            pass

        def _read_body(self) -> bytes:
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.headers.get("Content-Encoding", "").lower() == "gzip":
                try:
                    return gzip.decompress(raw)
                except Exception:
                    pass
            return raw

        def _begin_request(self) -> None:
            self._request_started_at = time.perf_counter()
            self._request_status = 0

        def _finish_request(self, method: str) -> None:
            elapsed_ms = int((time.perf_counter() - float(self._request_started_at or time.perf_counter())) * 1000)
            path = urlparse(self.path).path
            if path.startswith(("/api/collab/ws", "/favicon")):
                return
            log_event(
                "blm.http",
                "http.request",
                method=method,
                path=path,
                status=self._request_status or 0,
                elapsedMs=elapsed_ms,
                clientIp=self.client_address[0] if self.client_address else "",
            )

        def _handle_load(self, path: str):
            name = unquote(path[len("/api/load/"):])
            try:
                return self._json(storage.load(name))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_collab_poll(self):
            query = parse_qs(urlparse(self.path).query)
            name = str((query.get("name") or [""])[0]).strip()
            seq_text = str((query.get("seq") or ["0"])[0]).strip()
            try:
                since_seq = int(seq_text or "0")
            except ValueError:
                since_seq = 0
            try:
                return self._json(collab.poll(name, since_seq))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_collab_snapshot(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            name = str(payload.get("name", "")).strip()
            if not name:
                return self._json({"error": "name is required"}, 400)
            user_profile = payload.get("user")
            if not isinstance(user_profile, dict):
                user_profile = {}
            user_profile = dict(user_profile)
            user_profile["remoteAddr"] = self.client_address[0] if self.client_address else ""
            try:
                result = collab.apply_http_snapshot(name, user_profile, payload)
                return self._json(result)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            except Exception as exc:
                return self._json({"error": str(exc)}, 409)

        def _handle_collab_submits_list(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            name = str(payload.get("name", "")).strip()
            if not name:
                return self._json({"error": "name is required"}, 400)
            try:
                submits = collab.list_submits(name)
                return self._json({"submits": submits})
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_collab_submits_load(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            name = str(payload.get("name", "")).strip()
            submit_id = str(payload.get("submitId", "")).strip()
            if not name or not submit_id:
                return self._json({"error": "name and submitId are required"}, 400)
            try:
                record = collab.load_submit(name, submit_id)
                if record is None:
                    return self._json({"error": "submit not found"}, 404)
                return self._json(record)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_feedback(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            user_profile = payload.get("user")
            if not isinstance(user_profile, dict):
                user_profile = {}
            payload = dict(payload)
            payload["user"] = dict(user_profile)
            payload["user"]["remoteAddr"] = self.client_address[0] if self.client_address else ""
            try:
                result = feedback_store.apply(payload)
            except ValueError as exc:
                return self._json({"error": str(exc)}, 400)
            except KeyError as exc:
                return self._json({"error": str(exc)}, 404)
            except FileNotFoundError as exc:
                return self._json({"error": str(exc)}, 404)
            if result.get("error"):
                return self._json(result, 400)
            return self._json(result)

        def _handle_feedback_attachment_upload(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            user_profile = payload.get("user")
            if not isinstance(user_profile, dict):
                user_profile = {}
            user_profile = dict(user_profile)
            user_profile["remoteAddr"] = self.client_address[0] if self.client_address else ""
            item_uid = str(payload.get("uid") or "").strip()
            message_uid = str(payload.get("messageUid") or "").strip()
            filename = str(payload.get("filename") or "").strip()
            content_type = str(payload.get("contentType") or "application/octet-stream").strip()
            data_base64 = str(payload.get("dataBase64") or "").strip()
            if "," in data_base64 and data_base64.lower().startswith("data:"):
                data_base64 = data_base64.split(",", 1)[1]
            try:
                attachment_payload = base64.b64decode(data_base64.encode("ascii"), validate=True)
                result = feedback_store.add_attachment(item_uid, filename, content_type, attachment_payload, message_uid, user_profile)
            except (ValueError, UnicodeEncodeError) as exc:
                return self._json({"error": str(exc)}, 400)
            except KeyError as exc:
                return self._json({"error": str(exc)}, 404)
            except OSError as exc:
                return self._json({"error": str(exc)}, 500)
            return self._json(result)

        def _handle_feedback_attachment(self, path: str):
            parts = path[len("/api/feedback/attachment/"):].strip("/").split("/")
            if len(parts) != 2:
                return self._json({"error": "not found"}, 404)
            item_uid, attachment_uid = [unquote(part) for part in parts]
            try:
                payload, attachment = feedback_store.read_attachment(item_uid, attachment_uid)
            except KeyError as exc:
                return self._json({"error": str(exc)}, 404)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            content_type = str(attachment.get("contentType") or "application/octet-stream")
            filename = str(attachment.get("filename") or "attachment")
            return self._binary(payload, content_type, filename=filename)

        def _handle_export(self, path: str):
            name = unquote(path[len("/api/export/"):])
            try:
                return self._text(storage.export_markdown(name))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_export_bundle(self, path: str):
            name = unquote(path[len("/api/export-bundle/"):])
            try:
                safe_name = storage._validate_name(name)
                frozen_document = storage.load(safe_name)
                graph_images = self._capture_export_graph_images(f"bundle-{uuid.uuid4().hex}", safe_name, frozen_document)
                filename, payload = storage.build_export_bundle_from_document(safe_name, frozen_document, graph_images=graph_images)
                return self._binary(payload, "application/zip", filename=filename)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_export_docx(self, path: str):
            name = unquote(path[len("/api/export-docx/"):])
            try:
                filename, payload = storage.build_export_docx(name)
                return self._binary(
                    payload,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    filename=filename,
                )
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_export_docx_start(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            name = str(payload.get("name", "")).strip()
            if not name:
                return self._json({"error": "name is required"}, 400)
            try:
                safe_name = storage._validate_name(name)
                frozen_document = storage.load(safe_name)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            job_id = uuid.uuid4().hex
            job = {
                "id": job_id,
                "name": safe_name,
                "status": "queued",
                "progress": 5,
                "message": "已冻结当前文档版本，等待生成 DOCX。",
                "filename": "",
                "document": frozen_document,
                "graphImages": [],
                "payload": None,
                "error": "",
                "createdAt": time.time(),
                "updatedAt": time.time(),
            }
            with export_jobs_lock:
                export_jobs[job_id] = job
            thread = threading.Thread(target=self._run_export_docx_job, args=(job_id,), daemon=True)
            thread.start()
            return self._json(self._public_export_job(job))

        def _run_export_docx_job(self, job_id: str):
            def update(**values):
                with export_jobs_lock:
                    job = export_jobs.get(job_id)
                    if not job:
                        return None
                    job.update(values)
                    job["updatedAt"] = time.time()
                    return dict(job)

            job = update(status="running", progress=12, message="正在读取冻结文档和附件。")
            if not job:
                return
            try:
                time.sleep(0.05)
                update(progress=32, message="正在把流程图、全景图和数据图转为静态图片。")
                graph_images = self._capture_export_graph_images(str(job_id), str(job["name"]), job.get("document") or {})
                update(progress=72, message="静态图形已生成，正在写入 DOCX。", graphImages=graph_images)
                filename, payload = storage.build_export_docx_from_document(str(job["name"]), job.get("document") or {}, graph_images=graph_images)
                update(
                    status="done",
                    progress=100,
                    message="DOCX 已生成，可以下载。",
                    filename=filename,
                    payload=payload,
                )
            except Exception as exc:  # pragma: no cover - defensive for background thread
                update(status="failed", progress=100, message="DOCX 生成失败。", error=str(exc), payload=None)

        # ── 统一导出：JSON / Markdown / DOCX ──
        # 缓存 key = "{name}_{version}_{format}"
        def _export_cache_key(self, name: str, version: str, fmt: str) -> str:
            return f"{name}_{version}_{fmt}"

        def _export_dir(self, name: str, fmt: str) -> Path:
            """返回 manifest/export-{fmt}/ 目录"""
            pkg = storage._package_dir(name) / "manifest" / f"export-{fmt}"
            pkg.mkdir(parents=True, exist_ok=True)
            return pkg

        def _check_export_cache(self, name: str, version: str, fmt: str):
            """从磁盘检查已缓存的导出产物"""
            ext = ".docx" if fmt == "docx" else ".zip"
            v = version.replace("/", "-").replace("\\", "-") or "latest"
            path = self._export_dir(name, fmt) / f"{name}-{v}{ext}"
            if path.exists():
                return (path.name, path.read_bytes())
            return None

        def _store_export_cache(self, name: str, version: str, fmt: str, filename: str, payload: bytes):
            """导出产物写入磁盘，永久缓存"""
            ext = ".docx" if fmt == "docx" else ".zip"
            v = version.replace("/", "-").replace("\\", "-") or "latest"
            path = self._export_dir(name, fmt) / f"{name}-{v}{ext}"
            path.write_bytes(payload)

        def _run_export_job(self, job_id: str, fmt: str):
            """Run export job: generate resources, store in cache, clean up."""
            def update(**values):
                with export_jobs_lock:
                    job = export_jobs.get(job_id)
                    if not job: return None
                    job.update(values); job["updatedAt"] = time.time()
                    return dict(job)

            job = update(status="running", progress=5, message="准备导出…")
            if not job: return
            try:
                name = str(job.get("name", ""))
                version = str(job.get("version", ""))
                document = job.get("document") or {}
                markdown = str(job.get("markdown", "") or "")

                # 使用前端 html2canvas 截的图
                graph_images = job.get("graphImages") or []

                if fmt == "json":
                    update(progress=50, message="正在打包 JSON+附件…")
                    filename, payload = storage.build_export_bundle_from_document(name, document, graph_images=graph_images)

                elif fmt == "markdown":
                    update(progress=50, message="正在打包 MD+截图+附件…")
                    if markdown:
                        from blm_core.docx import DocxImage
                        md_with_images = storage._markdown_with_graph_images(markdown, graph_images)
                        import io, zipfile
                        buf = io.BytesIO()
                        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                            archive.writestr(f"{name}.md", md_with_images.encode("utf-8"))
                            for img in graph_images:
                                archive.writestr(f"images/{img.name}", img.payload)
                        payload = buf.getvalue()
                        filename = f"{name}-md.zip"
                    else:
                        filename, payload = storage.build_export_bundle_from_document(name, document, graph_images=graph_images)

                else:  # docx
                    update(progress=60, message="正在读取冻结文档和附件。")
                    # 使用前端 html2canvas 截的图（已在 job["graphImages"] 中）
                    graph_images = job.get("graphImages") or []
                    update(progress=72, message=f"使用前端截图 ({len(graph_images)} 张)，正在写入 DOCX。")
                    filename, payload = storage.build_export_docx_from_document(name, document, graph_images=graph_images)

                # 保存图片到 manifest/export-images/ + index.json
                if graph_images:
                    img_dir = self._export_dir(name, "images")
                    idx: dict[str, str] = {}
                    for img in graph_images:
                        (img_dir / img.name).write_bytes(img.payload)
                        stem = img.name.rsplit(".", 1)[0] if "." in img.name else img.name
                        idx[stem] = img.name
                    (img_dir / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=2), "utf-8")

                # 存入缓存
                self._store_export_cache(name, version, fmt, filename, payload)
                update(status="done", progress=100, message="导出完成。", filename=filename, payload=payload)

            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("Export job %s failed: %s", job_id, exc)
                update(status="failed", progress=100, message="导出失败。", error=str(exc))

        def _start_export(self, body: bytes, fmt: str):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            name = str(payload.get("name", "")).strip()
            version = str(payload.get("version", "")).strip()
            markdown_text = str(payload.get("markdown", "") or "")
            screenshots_raw = payload.get("screenshots") or []
            if not name:
                return self._json({"error": "name is required"}, 400)
            try:
                safe_name = storage._validate_name(name)
                # 检查缓存
                cached = self._check_export_cache(safe_name, version, fmt)
                if cached:
                    return self._json({"id": f"cached:{safe_name}:{version}:{fmt}", "status": "done", "cached": True, **{}})
                frozen_document = storage.load(safe_name)
            except (InvalidDocumentNameError, FileNotFoundError) as exc:
                return self._json({"error": str(exc)}, 400)
            # 解析前端截图 base64 → DocxImage
            graph_images: list = []
            for item in screenshots_raw:
                if not isinstance(item, dict):
                    continue
                data_url = str(item.get("dataUrl") or "")
                if not data_url.startswith("data:image/png;base64,"):
                    continue
                raw = base64.b64decode(data_url[len("data:image/png;base64,"):])
                graph_id = str(item.get("id") or "")
                safe_name_part = re.sub(r"[^A-Za-z0-9._-]+", "-", graph_id).strip("-._")
                graph_images.append(DocxImage(
                    name=f"{safe_name_part}.png",
                    content_type="image/png",
                    payload=raw,
                    width=0, height=0,
                ))
            job_id = uuid.uuid4().hex
            job = {
                "id": job_id,
                "name": safe_name,
                "version": version,
                "status": "queued",
                "progress": 5,
                "message": "已加入导出队列。",
                "filename": "",
                "document": frozen_document,
                "markdown": markdown_text,
                "graphImages": graph_images,
                "payload": None,
                "error": "",
                "createdAt": time.time(),
                "updatedAt": time.time(),
            }
            with export_jobs_lock:
                export_jobs[job_id] = job
            thread = threading.Thread(target=self._run_export_job, args=(job_id, fmt), daemon=True)
            thread.start()
            return self._json(self._public_export_job(job))

        def _public_export_job(self, job: dict) -> dict:
            return {
                "id": job.get("id", ""),
                "name": job.get("name", ""),
                "status": job.get("status", ""),
                "progress": int(job.get("progress") or 0),
                "message": job.get("message", ""),
                "filename": job.get("filename", ""),
                "error": job.get("error", ""),
            }

        def _handle_export_job_status(self, path: str):
            job_id = unquote(path[len("/api/export-jobs/"):].strip("/"))
            if "/" in job_id:
                job_id = job_id.split("/", 1)[0]
            with export_jobs_lock:
                job = export_jobs.get(job_id)
                if not job:
                    return self._json({"error": "not found"}, 404)
                return self._json(self._public_export_job(job))

        def _handle_export_job_render_document(self, path: str):
            job_id = unquote(path[len("/api/export-jobs/"): -len("/render-document")].strip("/"))
            with export_jobs_lock:
                job = export_jobs.get(job_id)
                if not job:
                    return self._json({"error": "not found"}, 404)
                document = job.get("document") or {}
                return self._json({
                    "id": job.get("id", ""),
                    "name": job.get("name", ""),
                    "document": document,
                    "graphs": [graph.__dict__ for graph in list_export_graphs(document if isinstance(document, dict) else {})],
                })

        def _handle_export_job_download(self, path: str):
            job_id = unquote(path[len("/api/export-jobs/"): -len("/download")].strip("/"))
            with export_jobs_lock:
                job = export_jobs.get(job_id)
                if not job:
                    return self._json({"error": "not found"}, 404)
                if job.get("status") != "done" or not isinstance(job.get("payload"), bytes):
                    return self._json({"error": "not ready"}, 409)
                payload = bytes(job["payload"])
                filename = str(job.get("filename") or "blm-document.docx")
            return self._binary(
                payload,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                filename=filename,
            )

        def _capture_export_graph_images(self, job_id: str, name: str, document: dict):
            # 模块意图：把导出截图作为后台 job 的临时资源，不写回 workspace 文档，也不改变用户编辑态。
            # 关键流程：创建可被 /export/render/<jobId> 读取的冻结文档，再由 Playwright 按 data-export-graph-id 截图。
            # 边界细节：Playwright 不可用或截图失败时记录诊断并返回空图集，避免导出主流程直接崩溃。
            graphs = list_export_graphs(document if isinstance(document, dict) else {})
            if not graphs:
                return []
            temp_job = False
            with export_jobs_lock:
                if job_id not in export_jobs:
                    temp_job = True
                    export_jobs[job_id] = {
                        "id": job_id,
                        "name": name,
                        "status": "rendering",
                        "progress": 0,
                        "message": "正在渲染静态图形。",
                        "filename": "",
                        "document": document,
                        "payload": None,
                        "error": "",
                        "createdAt": time.time(),
                        "updatedAt": time.time(),
                    }
            try:
                host, port = self.server.server_address[:2]
                base_host = "127.0.0.1" if host in ("", "0.0.0.0", "::") else str(host)
                return capture_graph_images(f"http://{base_host}:{port}", job_id, graphs)
            except Exception as exc:
                log_error("export.graph_screenshot.failed", exc, document=name)
                return []
            finally:
                if temp_job:
                    with export_jobs_lock:
                        export_jobs.pop(job_id, None)

        def _handle_history(self, path: str):
            name = unquote(path[len("/api/history/"):])
            try:
                return self._json(storage.list_history(name))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_versions(self, path: str):
            name = unquote(path[len("/api/versions/"):])
            try:
                return self._json(storage.list_versions(name))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_docs(self, path: str):
            doc_id = unquote(path[len("/api/docs/"):]).strip("/")
            entry = DOCS_INDEX.get(doc_id)
            if not entry:
                return self._json({"error": "not found"}, 404)
            doc_path = (docs_dir / entry["filename"]).resolve()
            if not self._is_safe_docs_path(doc_path) or not doc_path.exists():
                return self._json({"error": "not found"}, 404)
            return self._json(
                {
                    "id": entry["id"],
                    "title": entry["title"],
                    "summary": entry["summary"],
                    "content": doc_path.read_text("utf-8"),
                }
            )

        def _handle_docs_asset(self, path: str):
            raw_relative_path = unquote(path[len("/api/docs/assets/"):]).strip("/")
            if not raw_relative_path:
                return self._json({"error": "not found"}, 404)
            asset_path = (docs_dir / raw_relative_path).resolve()
            if not self._is_safe_docs_path(asset_path) or not asset_path.is_file():
                return self._json({"error": "not found"}, 404)
            content_type = mimetypes.guess_type(asset_path.name)[0] or "application/octet-stream"
            return self._binary(asset_path.read_bytes(), content_type)

        def _handle_attachment(self, path: str):
            parts = path[len("/api/attachment/"):].strip("/").split("/")
            if len(parts) != 3:
                return self._json({"error": "not found"}, 404)
            name, attachment_uid, version_uid = [unquote(part) for part in parts]
            try:
                filename, content_type, payload = storage.load_attachment_payload(name, attachment_uid, version_uid)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            should_download = "download=1" in urlparse(self.path).query.split("&")
            return self._binary(payload, content_type, filename=filename if should_download else None)

        def _handle_attachment_upload(self, body: bytes):
            filename = unquote(self.headers.get("X-Attachment-Name", "")).strip()
            content_type = self.headers.get("Content-Type", "application/octet-stream")
            try:
                staged = storage.stage_attachment_upload(filename, content_type, body)
                return self._json({"ok": True, **staged})
            except OSError as exc:
                return self._json({"error": str(exc)}, 500)

        def _handle_save(self, path: str, body: bytes):
            name = unquote(path[len("/api/save/"):])
            try:
                payload = json.loads(body or b"{}")
                if isinstance(payload, dict) and isinstance(payload.get("document"), dict):
                    result = storage.save_with_revision(
                        name,
                        payload.get("document", {}),
                        base_revision=payload.get("base_revision"),
                        base_document=payload.get("base_document"),
                        rebase=bool(payload.get("rebase")),
                        save_message=str(payload.get("save_message", "")).strip(),
                    )
                    if not result.get("ok"):
                        return self._json(result, 409)
                    return self._json({"name": name, **result})
                saved_document = storage.save(name, payload)
                return self._json({"ok": True, "document": saved_document, "name": name})
            except json.JSONDecodeError:
                return self._json({"error": "invalid json"}, 400)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_rename(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                new_name, saved_document = storage.rename(
                    str(payload.get("old_name", "")).strip(),
                    str(payload.get("new_name", "")).strip(),
                    payload.get("document", {}),
                    overwrite=bool(payload.get("overwrite")),
                    save_message=str(payload.get("save_message", "")).strip(),
                )
                return self._json({"ok": True, "document": saved_document, "name": new_name})
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileExistsError:
                return self._json({"error": "已存在同名文档"}, 400)

        def _handle_copy(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                target_name = str(payload.get("target_name", "")).strip()
                copied_document = storage.copy_document(
                    str(payload.get("source_name", "")).strip(),
                    target_name,
                )
                return self._json({"ok": True, "document": copied_document, "name": target_name})
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileExistsError:
                return self._json({"error": "document already exists"}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            except Exception as exc:
                return self._json({"error": f"复制文档失败: {exc}"}, 500)

        def _handle_new(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])

            name = str(payload.get("name", "")).strip()
            if not name:
                return self._json({"error": "名称不能为空"}, 400)
            try:
                document = storage.create(name)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileExistsError:
                return self._json({"error": "已存在同名文档"}, 400)
            return self._json({"ok": True, "document": document, "name": name})

        def _handle_delete(self, path: str):
            name = unquote(path[len("/api/delete/"):])
            try:
                storage.delete(name)
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            return self._json({"ok": True})

        def _handle_history_restore(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                restored_document = storage.restore_history(
                    str(payload.get("name", "")).strip(),
                    str(payload.get("snapshot_id", "")).strip(),
                )
            except (InvalidDocumentNameError, InvalidWorkspaceEntryError) as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            return self._json(
                {
                    "ok": True,
                    "name": str(payload.get("name", "")).strip(),
                    "document": restored_document,
                }
            )

        def _handle_version_create(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                return self._json(storage.create_named_version(
                    str(payload.get("name", "")).strip(),
                    payload.get("document") if isinstance(payload.get("document"), dict) else None,
                    message=str(payload.get("message", "")).strip(),
                ))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_version_load(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                return self._json(storage.load_version(
                    str(payload.get("name", "")).strip(),
                    str(payload.get("version_id", "")).strip(),
                ))
            except (InvalidDocumentNameError, InvalidWorkspaceEntryError) as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

        def _handle_history_load(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            name = str(payload.get("name", "")).strip()
            snapshot_id = str(payload.get("snapshot_id", "")).strip()
            try:
                document = storage.load_history(name, snapshot_id)
                seq = 0
                for entry in storage.list_history(name):
                    if str(entry.get("id", "")) == snapshot_id:
                        seq = int(entry.get("seq", 0) or 0)
                        break
            except (InvalidDocumentNameError, InvalidWorkspaceEntryError) as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            return self._json({"ok": True, "name": name, "snapshot_id": snapshot_id, "seq": seq, "document": document})

        def _handle_trash_restore(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                restored_name, restored_document = storage.restore_trash(
                    str(payload.get("entry_id", "")).strip()
                )
            except (InvalidWorkspaceEntryError, InvalidDocumentNameError) as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            return self._json(
                {
                    "ok": True,
                    "name": restored_name,
                    "document": restored_document,
                }
            )

        def _handle_trash_delete(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            entry_ids = payload.get("entry_ids", [])
            if not isinstance(entry_ids, list):
                entry_ids = [entry_ids]
            try:
                return self._json(storage.delete_trash([str(item).strip() for item in entry_ids]))
            except InvalidWorkspaceEntryError as exc:
                return self._json({"error": str(exc)}, 400)

        def _handle_trash_clear(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            return self._json(storage.clear_trash())

        def _handle_document_normalize(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            document = payload.get("document", {})
            return self._json({"ok": True, "document": canonical_document(document)})

        def _handle_document_validate(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            document = canonical_document(payload.get("document", {}))
            return self._json(
                {
                    "ok": True,
                    "document": document,
                    "validation_issues": validate_document(document),
                }
            )

        def _handle_agent_handoff(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            payload["sourceApp"] = "blm"
            payload["pluginId"] = "blm-agent-plugin"
            payload.setdefault("handoffId", f"blm-{uuid.uuid4()}")
            payload.setdefault("createdAtMillis", int(time.time() * 1000))
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            try:
                req = urlrequest.Request(
                    f"{_load_env('AGENT_URL', 'http://127.0.0.1:8088', app_dir.parent)}/handoffs",
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urlrequest.urlopen(req, timeout=2) as resp:
                    response_body = resp.read()
                return self._json(json.loads(response_body.decode("utf-8") or "{}"))
            except (OSError, URLError, TimeoutError, json.JSONDecodeError) as exc:
                return self._json({"error": f"Easy Agent handoff failed: {exc}"}, 502)

        def _handle_merge_analyze(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                result = analyze_merge(
                    payload.get("mode") or "combine",
                    left_document=self._load_merge_document(payload, "left"),
                    right_document=self._load_merge_document(payload, "right"),
                    base_document=self._load_merge_document(payload, "base")
                    if self._has_merge_source(payload, "base")
                    else None,
                )
            except ValueError as exc:
                return self._json({"error": str(exc)}, 400)
            return self._json({"ok": True, **result})

        def _handle_merge_apply(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            try:
                result = apply_merge(
                    payload.get("mode") or "combine",
                    left_document=self._load_merge_document(payload, "left"),
                    right_document=self._load_merge_document(payload, "right"),
                    base_document=self._load_merge_document(payload, "base")
                    if self._has_merge_source(payload, "base")
                    else None,
                    resolutions=payload.get("resolutions", {}),
                )
            except ValueError as exc:
                return self._json({"error": str(exc)}, 400)
            return self._json({"ok": True, **result})

        def _has_merge_source(self, payload: dict, key_prefix: str) -> bool:
            return isinstance(payload.get(f"{key_prefix}_document"), dict)

        def _load_merge_document(self, payload: dict, key_prefix: str) -> dict:
            inline_document = payload.get(f"{key_prefix}_document")
            if isinstance(inline_document, dict):
                return inline_document
            raise ValueError("缺少合并文档内容")

        def _decode_json(self, body: bytes) -> dict | tuple[dict, int]:
            try:
                return json.loads(body or b"{}")
            except json.JSONDecodeError:
                return {"error": "invalid json"}, 400

        def _is_safe_docs_path(self, target_path: Path) -> bool:
            try:
                target_path.relative_to(docs_dir)
            except ValueError:
                return False
            return True

        def _json(self, payload, code: int = 200):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            accept_encoding = self.headers.get("Accept-Encoding", "").lower()
            if "gzip" in accept_encoding and len(body) > 1024:
                compressed = gzip.compress(body)
                self.send_response(code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Encoding", "gzip")
                self.send_header("Content-Length", str(len(compressed)))
                self.end_headers()
                self.wfile.write(compressed)
                return
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _binary(self, payload: bytes, content_type: str, code: int = 200, filename: str | None = None):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            if filename:
                self.send_header("Content-Disposition", build_attachment_content_disposition(filename))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _text(self, payload: str, code: int = 200):
            body = payload.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    # 注入 AI 路由 — AI 与 BLM 解耦的关键点

    return BlmRequestHandler


def run_server(
    port: int,
    app_dir: Path,
    workspace_dir: Path,
    open_browser: bool = True,
    admin_port: int | None = None,
    host: str = "127.0.0.1",
) -> None:
    started_at = time.time()
    storage = WorkspaceStorage(workspace_dir)
    log_dir = configure_diagnostics(workspace_dir)
    collab = CollaborationManager(storage)
    migration_result = storage.migrate_workspace_layout()
    handler = create_handler(app_dir, storage, collab)
    try:
        server = http.server.ThreadingHTTPServer((host, port), handler)
        server.allow_reuse_address = True
    except OSError as exc:
        print(f"\n?? 端口 {port} 已被占用，无法启动 BLM 服务。")
        print(f"   请先关闭占用该端口的进程，或设置环境变量 BLM_PORT 使用其他端口。")
        print(f"   错误详情: {exc}\n")
        raise SystemExit(1) from exc
    admin_server = None
    if admin_port:
        try:
            admin_handler = create_admin_handler(
                storage,
                collab,
                workspace_dir=workspace_dir,
                app_port=port,
                started_at=started_at,
            )
            admin_server = http.server.ThreadingHTTPServer((host, admin_port), admin_handler)
            admin_thread = threading.Thread(target=admin_server.serve_forever, daemon=True)
            admin_thread.start()
            log_admin_start(admin_port, workspace_dir)
        except OSError as exc:
            admin_server = None
            log_error("blm.admin", "admin.start.error", port=admin_port, error=str(exc))
            print(f"管理端启动失败: 端口 {admin_port} 不可用，主服务继续运行。")
    display_host = "127.0.0.1" if host in ("", "0.0.0.0", "::") else host
    url = f"http://{display_host}:{port}"

    print(f"BLM Tool 已启动: {url}")
    print(f"文档目录: {workspace_dir}")
    print(f"日志目录: {log_dir}")
    if admin_server:
        print(f"管理端: http://{display_host}:{admin_port}")
    log_event(
        "blm.server",
        "server.start",
        url=url,
        port=port,
        appDir=app_dir,
        workspaceDir=workspace_dir,
        logDir=log_dir,
        **runtime_fields(),
    )
    if any(migration_result.values()):
        print(
            "已完成文档包迁移: "
            f"workspace={migration_result['documents']}, "
            f"history={migration_result['history']}, "
            f"trash={migration_result['trash']}"
        )
    print("按 Ctrl+C 退出\n")

    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已退出")
    finally:
        if admin_server:
            admin_server.shutdown()
