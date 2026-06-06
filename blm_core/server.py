from __future__ import annotations

import gzip
import http.server
import json
import base64
import mimetypes
import threading
import time
import uuid
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from blm_core.admin import create_admin_handler, log_admin_start
from blm_core.diagnostics import configure_diagnostics, log_error, log_event, runtime_fields
from blm_core.document import canonical_document, migrate_document
from blm_core.collab import CollaborationManager
from blm_core.feedback import FeedbackStore
from blm_core.merge import analyze_merge, apply_merge, validate_document
from blm_core.storage import (
    InvalidDocumentNameError,
    InvalidWorkspaceEntryError,
    WorkspaceStorage,
)

DOCS_MANIFEST = [
    {
        "id": "user-manual",
        "title": "用户手册",
        "filename": "BLM用户手册.md",
        "summary": "查看工作区使用方法、合并流程、回收站和导出说明。",
    },
    {
        "id": "design",
        "title": "设计文档",
        "filename": "BLM设计文档.md",
        "summary": "查看当前浏览器版架构、工作流、合并和恢复机制。",
    },
    {
        "id": "modeling-thinking",
        "title": "业务建模思考",
        "filename": "业务建模思考.md",
        "summary": "理解业务组件、业务阶段、业务流程和分类标签之间的关系。",
    },
    {
        "id": "collaboration-troubleshooting",
        "title": "协作与弱网排障指南",
        "filename": "BLM协作与弱网排障指南.md",
        "summary": "查看实时协作、HTTP 降级、日志格式、管理端和跨网段断线排查步骤。",
    },
    {
        "id": "server-directory",
        "title": "服务端文件夹说明",
        "filename": "BLM服务端文件夹说明.md",
        "summary": "workspace/ 目录结构、关键文件作用、文档序列号和升级迁移说明。",
    },
    {
        "id": "collaboration-merge",
        "title": "多人协作合并比对",
        "filename": "BLM多人协作合并比对.md",
        "summary": "3-way 合并规则、冲突处理、旧版本提交、比对功能与历史记录操作。",
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
                if path.startswith("/api/export-jobs/") and path.endswith("/download"):
                    return self._handle_export_job_download(path)
                if path.startswith("/api/export-jobs/"):
                    return self._handle_export_job_status(path)
                if path.startswith("/api/export-bundle/"):
                    return self._handle_export_bundle(path)
                if path.startswith("/api/export/"):
                    return self._handle_export(path)
                if path.startswith("/api/history/"):
                    return self._handle_history(path)
                if path.startswith("/api/versions/"):
                    return self._handle_versions(path)
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
                if path == "/api/export-docx/start":
                    return self._handle_export_docx_start(body)
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
                filename, payload = storage.build_export_bundle(name)
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
                filename, payload = storage.build_export_docx_from_document(str(job["name"]), job.get("document") or {})
                update(
                    status="done",
                    progress=100,
                    message="DOCX 已生成，可以下载。",
                    filename=filename,
                    payload=payload,
                )
            except Exception as exc:  # pragma: no cover - defensive for background thread
                update(status="failed", progress=100, message="DOCX 生成失败。", error=str(exc), payload=None)

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

    return BlmRequestHandler


def run_server(
    port: int,
    app_dir: Path,
    workspace_dir: Path,
    open_browser: bool = True,
    admin_port: int | None = None,
) -> None:
    started_at = time.time()
    storage = WorkspaceStorage(workspace_dir)
    log_dir = configure_diagnostics(workspace_dir)
    collab = CollaborationManager(storage)
    migration_result = storage.migrate_workspace_layout()
    handler = create_handler(app_dir, storage, collab)
    try:
        server = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
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
            admin_server = http.server.ThreadingHTTPServer(("0.0.0.0", admin_port), admin_handler)
            admin_thread = threading.Thread(target=admin_server.serve_forever, daemon=True)
            admin_thread.start()
            log_admin_start(admin_port, workspace_dir)
        except OSError as exc:
            admin_server = None
            log_error("blm.admin", "admin.start.error", port=admin_port, error=str(exc))
            print(f"管理端启动失败: 端口 {admin_port} 不可用，主服务继续运行。")
    url = f"http://0.0.0.0:{port}"

    print(f"BLM Tool 已启动: {url}")
    print(f"文档目录: {workspace_dir}")
    print(f"日志目录: {log_dir}")
    if admin_server:
        print(f"管理端: http://0.0.0.0:{admin_port}")
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
