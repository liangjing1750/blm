from __future__ import annotations

import http.server
import json
import mimetypes
import threading
import webbrowser
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

from blm_core.document import migrate_document
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


def create_handler(app_dir: Path, storage: WorkspaceStorage):
    docs_dir = (app_dir.parent / "docs").resolve()

    class BlmRequestHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(app_dir), **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            super().end_headers()

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/api/runtime":
                return self._json(
                    {
                        "api_version": API_VERSION,
                        "mode": "browser",
                        "supports_workspace": True,
                        "supports_merge": True,
                        "supports_docs": True,
                    }
                )
            if path == "/api/files":
                return self._json(storage.list_documents())
            if path == "/api/trash":
                return self._json(storage.list_trash())
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
            if path.startswith("/api/export-bundle/"):
                return self._handle_export_bundle(path)
            if path.startswith("/api/export/"):
                return self._handle_export(path)
            if path.startswith("/api/history/"):
                return self._handle_history(path)
            return super().do_GET()

        def do_POST(self):
            path = urlparse(self.path).path
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))

            if path.startswith("/api/save/"):
                return self._handle_save(path, body)
            if path == "/api/attachment-upload":
                return self._handle_attachment_upload(body)
            if path == "/api/rename":
                return self._handle_rename(body)
            if path == "/api/new":
                return self._handle_new(body)
            if path.startswith("/api/delete/"):
                return self._handle_delete(path)
            if path == "/api/history/load":
                return self._handle_history_load(body)
            if path == "/api/history/restore":
                return self._handle_history_restore(body)
            if path == "/api/trash/restore":
                return self._handle_trash_restore(body)
            if path == "/api/document/normalize":
                return self._handle_document_normalize(body)
            if path == "/api/document/validate":
                return self._handle_document_validate(body)
            if path == "/api/merge/analyze":
                return self._handle_merge_analyze(body)
            if path == "/api/merge/apply":
                return self._handle_merge_apply(body)

            return self._json({"error": "not found"}, 404)

        def log_message(self, *_):
            pass

        def _handle_load(self, path: str):
            name = unquote(path[len("/api/load/"):])
            try:
                return self._json(storage.load(name))
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)

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

        def _handle_history(self, path: str):
            name = unquote(path[len("/api/history/"):])
            try:
                return self._json(storage.list_history(name))
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
                document = json.loads(body or b"{}")
                saved_document = storage.save(name, document)
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
                )
                return self._json({"ok": True, "document": saved_document, "name": new_name})
            except InvalidDocumentNameError as exc:
                return self._json({"error": str(exc)}, 400)
            except FileExistsError:
                return self._json({"error": "已存在同名文档"}, 400)

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

        def _handle_history_load(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            name = str(payload.get("name", "")).strip()
            snapshot_id = str(payload.get("snapshot_id", "")).strip()
            try:
                document = storage.load_history(name, snapshot_id)
            except (InvalidDocumentNameError, InvalidWorkspaceEntryError) as exc:
                return self._json({"error": str(exc)}, 400)
            except FileNotFoundError:
                return self._json({"error": "not found"}, 404)
            return self._json({"ok": True, "name": name, "snapshot_id": snapshot_id, "document": document})

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

        def _handle_document_normalize(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            document = payload.get("document", {})
            return self._json({"ok": True, "document": migrate_document(document)})

        def _handle_document_validate(self, body: bytes):
            payload = self._decode_json(body)
            if isinstance(payload, tuple):
                return self._json(payload[0], payload[1])
            document = migrate_document(payload.get("document", {}))
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
) -> None:
    storage = WorkspaceStorage(workspace_dir)
    migration_result = storage.migrate_workspace_layout()
    handler = create_handler(app_dir, storage)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    url = f"http://0.0.0.0:{port}"

    print(f"BLM Tool 已启动: {url}")
    print(f"文档目录: {workspace_dir}")
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
