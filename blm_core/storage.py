from __future__ import annotations

import base64
import hashlib
import io
import json
import mimetypes
import os
import re
import shutil
import threading
import uuid
import zipfile
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path

from blm_core.document import canonical_document, create_empty_document, migrate_document
from blm_core.docx import DocxAttachment, DocxImage, build_docx_from_preview_markdown
from blm_core.markdown import MarkdownExporter
from blm_core.merge import apply_merge


TRASH_ENTRY_RE = re.compile(r"^(?P<name>.+)-(?P<timestamp>\d{8}-\d{6}-\d{6})$")
INVALID_PATH_COMPONENT_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')
PACKAGE_MANIFEST_NAME = "manifest.json"
SNAPSHOT_META_NAME = "snapshot.json"
ATTACHMENTS_DIR_NAME = ".attachments"
ATTACHMENTS_INDEX_NAME = "attachments.json"
EXPORT_ATTACHMENTS_DIR_NAME = "attachments"
AUTO_HISTORY_WINDOW_SECONDS = 10 * 60
AUTO_HISTORY_RECENT_DAYS = 1
AUTO_HISTORY_DAILY_DAYS = 7
MANUAL_HISTORY_KEEP_COUNT = 30
MANUAL_HISTORY_KEEP_DAYS = 30


class InvalidDocumentNameError(ValueError):
    """Raised when a workspace document name is unsafe."""


class InvalidDocumentPathError(ValueError):
    """Raised when a file path is missing or points to an invalid location."""


class InvalidWorkspaceEntryError(ValueError):
    """Raised when a workspace snapshot or trash entry is unsafe."""


class DocumentFileStore:
    def __init__(self, exporter: MarkdownExporter | None = None):
        self.exporter = exporter or MarkdownExporter()

    def load_raw_path(self, path: str | Path) -> dict:
        file_path = self._normalize_path(path)
        if not file_path.exists():
            raise FileNotFoundError(str(file_path))
        return json.loads(file_path.read_text("utf-8"))

    def load_path(self, path: str | Path) -> dict:
        return migrate_document(self.load_raw_path(path))

    def save_path(self, path: str | Path, document: dict) -> dict:
        file_path = self._normalize_path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        migrated_document = canonical_document(document)
        file_path.write_text(
            json.dumps(migrated_document, ensure_ascii=False, indent=2),
            "utf-8",
        )
        file_path.with_suffix(".md").write_text(self.exporter.export(migrated_document), "utf-8")
        return migrated_document

    def export_markdown_path(self, path: str | Path) -> str:
        return self.exporter.export(self.load_path(path))

    def _normalize_path(self, path: str | Path) -> Path:
        normalized = Path(str(path or "").strip())
        if not str(normalized):
            raise InvalidDocumentPathError("路径不能为空")
        if normalized.name in {".", ".."}:
            raise InvalidDocumentPathError("路径不合法")
        return normalized


class WorkspaceStorage(DocumentFileStore):
    def __init__(self, workspace_dir: Path, exporter: MarkdownExporter | None = None):
        super().__init__(exporter=exporter)
        self.workspace_dir = Path(workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        self.trash_dir = self.workspace_dir / ".trash"
        self.temp_dir = self.workspace_dir / ".tmp"
        self.uploads_dir = self.workspace_dir / ".uploads"
        self.attachments_dir = self.workspace_dir / ATTACHMENTS_DIR_NAME
        self.trash_dir.mkdir(exist_ok=True)
        self.temp_dir.mkdir(exist_ok=True)
        self.uploads_dir.mkdir(exist_ok=True)
        self.history_limit = MANUAL_HISTORY_KEEP_COUNT
        self.auto_history_window_seconds = AUTO_HISTORY_WINDOW_SECONDS
        self.auto_history_recent_days = AUTO_HISTORY_RECENT_DAYS
        self.auto_history_daily_days = AUTO_HISTORY_DAILY_DAYS
        self.manual_history_keep_count = MANUAL_HISTORY_KEEP_COUNT
        self.manual_history_keep_days = MANUAL_HISTORY_KEEP_DAYS
        self._write_locks = {}
        self._write_locks_lock = threading.Lock()
        self._shared_write_lock = threading.RLock()

    def _get_write_lock(self, safe_name: str):
        with self._write_locks_lock:
            if safe_name not in self._write_locks:
                self._write_locks[safe_name] = threading.RLock()
            return self._write_locks[safe_name]

    def list_documents(self) -> list[str]:
        names: set[str] = set()
        for entry in self.workspace_dir.iterdir():
            if entry.name.startswith("."):
                continue
            if self._is_package_dir(entry):
                names.add(entry.name)
            elif entry.is_file() and entry.suffix == ".json":
                names.add(entry.stem)
        return sorted(names)

    def list_document_summaries(self) -> list[dict]:
        summaries: list[dict] = []
        for name in self.list_documents():
            try:
                meta = self._load_manifest_meta(name)
            except (FileNotFoundError, InvalidDocumentNameError, OSError, ValueError):
                continue
            if not meta:
                continue
            raw_tags = meta.get("tags", [])
            tags = raw_tags if isinstance(raw_tags, list) else str(raw_tags or "").replace("，", ",").split(",")
            summaries.append(
                {
                    "name": name,
                    "title": str(meta.get("domain") or meta.get("title") or name).strip() or name,
                    "space": str(meta.get("space") or meta.get("teamSpace") or "默认空间").strip() or "默认空间",
                    "tags": [str(item).strip() for item in tags if str(item).strip()],
                    "author": str(meta.get("author", "")).strip(),
                    "date": str(meta.get("date", "")).strip(),
                }
            )
        return summaries

    def _load_manifest_meta(self, name: str) -> dict | None:
        """只读manifest的meta段，不加载完整文档"""
        safe_name = self._validate_name(name)
        path = self._manifest_path(self._package_dir(safe_name))
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                # 读取前8KB足够覆盖meta段
                head = f.read(8192)
            # 简单解析：找到"meta"后的{...}对象
            idx = head.find('"meta"')
            if idx < 0:
                return None
            # 跳到"meta": 后的 {
            rest = head[idx + 6:]  # skip "meta"
            brace_idx = rest.find('{')
            if brace_idx < 0:
                return None
            rest = rest[brace_idx:]
            depth = 0
            end = 0
            for i, ch in enumerate(rest):
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end == 0:
                return None
            meta_json = rest[:end]
            return json.loads(meta_json)
        except (json.JSONDecodeError, OSError):
            return None

    def list_history(self, name: str, *, limit: int | None = None, offset: int = 0) -> list[dict]:
        safe_name = self._validate_name(name)
        target_dir = self._history_dir(name)
        if not target_dir.exists():
            return []
        offset = max(0, int(offset or 0))
        limit_value = int(limit) if limit is not None else None
        if limit_value is not None:
            limit_value = max(0, limit_value)
        end_index = offset + limit_value if limit_value is not None else None
        entries: list[dict] = []
        seen_ids: set[str] = set()
        valid_snapshots: list[Path] = []
        for snapshot in sorted(target_dir.iterdir(), key=lambda item: item.name):
            if (snapshot.is_dir() and self._is_package_dir(snapshot)) or (snapshot.is_file() and snapshot.suffix == ".json"):
                valid_snapshots.append(snapshot)
        inferred_seq_by_id: dict[str, int] = {}
        for index, snapshot in enumerate(valid_snapshots, start=1):
            snapshot_id = snapshot.name if snapshot.is_dir() else snapshot.stem
            snapshot_meta = self._read_snapshot_meta(snapshot)
            try:
                seq = int(snapshot_meta.get("seq", 0) or 0)
            except (TypeError, ValueError):
                seq = 0
            inferred_seq_by_id[snapshot_id] = seq if seq > 0 else index
        ordered_snapshots = sorted(valid_snapshots, key=lambda item: item.name, reverse=True)
        for snapshot in ordered_snapshots[offset:end_index]:
            if snapshot.is_dir() and self._is_package_dir(snapshot):
                snapshot_id = snapshot.name
            elif snapshot.is_file() and snapshot.suffix == ".json":
                snapshot_id = snapshot.stem
            else:
                continue
            if snapshot_id in seen_ids:
                continue
            seen_ids.add(snapshot_id)
            snapshot_meta = self._read_snapshot_meta(snapshot)
            message = str(snapshot_meta.get("message", "")).strip()
            timestamp_label = str(snapshot_meta.get("timestampLabel", "")).strip() or self._format_timestamp_label(snapshot_id)
            kind = str(snapshot_meta.get("kind", "")).strip() or "manual"
            reason = str(snapshot_meta.get("reason", "")).strip() or ("manual_message" if message else "manual_save")
            size = self._snapshot_size(snapshot)
            entries.append(
                {
                    "id": snapshot_id,
                    "label": f"{message}（{timestamp_label}）" if message else timestamp_label,
                    "doc_name": safe_name,
                    "message": message,
                    "kind": kind,
                    "reason": reason,
                    "content_hash": str(snapshot_meta.get("contentHash", "")).strip(),
                    "user": str(snapshot_meta.get("user", "")).strip(),
                    "created_at": str(snapshot_meta.get("createdAt", "")).strip(),
                    "seq": inferred_seq_by_id.get(snapshot_id, 0),
                    "size": size,
                    "documentBytes": size,
                    "timestamp": snapshot_id,
                    "timestamp_label": timestamp_label,
                }
            )
        # 追加 ZIP 归档中的快照
        if limit_value is not None and len(entries) >= limit_value:
            return entries
        archive_offset = max(0, offset - len(ordered_snapshots))
        remaining_limit = None if limit_value is None else max(0, limit_value - len(entries))
        archive = self._history_archive_path(name)
        archive_names = sorted([
            zip_name
            for zip_name in self._zlist(archive)
            if len(zip_name.split("/")) >= 2 and zip_name.split("/")[-1] == "manifest.json"
        ], reverse=True)
        archive_page = archive_names[archive_offset:archive_offset + remaining_limit if remaining_limit is not None else None]
        for zip_name in archive_page:
            parts = zip_name.split("/")
            if len(parts) < 2 or parts[-1] != "manifest.json":
                continue
            snapshot_id = parts[0]
            if snapshot_id in seen_ids:
                continue
            seen_ids.add(snapshot_id)
            try:
                raw = self._zread(archive, zip_name)
                size = len(raw) if raw else 0
            except Exception:
                size = 0
            timestamp_label = self._format_timestamp_label(snapshot_id)
            entries.append({
                "id": snapshot_id,
                "label": timestamp_label,
                "doc_name": safe_name,
                "message": "",
                "kind": "auto",
                "reason": "archive",
                "content_hash": "",
                "user": "",
                "created_at": "",
                "seq": inferred_seq_by_id.get(snapshot_id, 0),
                "size": size,
                "documentBytes": size,
                "timestamp": snapshot_id,
                "timestamp_label": timestamp_label,
            })
        return entries

    @staticmethod
    def _snapshot_size(snapshot: Path) -> int:
        try:
            if snapshot.is_file():
                return int(snapshot.stat().st_size)
            manifest_path = snapshot / "manifest" / PACKAGE_MANIFEST_NAME
            if manifest_path.is_file():
                return int(manifest_path.stat().st_size)
            legacy_manifest_path = snapshot / PACKAGE_MANIFEST_NAME
            if legacy_manifest_path.is_file():
                return int(legacy_manifest_path.stat().st_size)
            total = 0
            for child in snapshot.rglob("*"):
                if child.is_file():
                    total += int(child.stat().st_size)
            return total
        except OSError:
            return 0

    def restore_history(self, name: str, snapshot_id: str) -> dict:
        safe_name = self._validate_name(name)
        with self._get_write_lock(safe_name):
            document = self._load_history_snapshot(safe_name, snapshot_id)
            return self.save(name, document)

    def load_history(self, name: str, snapshot_id: str) -> dict:
        return self._load_history_snapshot(self._validate_name(name), snapshot_id)

    @staticmethod
    def _zopen(path):
        """打开 ZIP 文件，不存在则返回 None"""
        p = Path(path) if not isinstance(path, Path) else path
        return zipfile.ZipFile(str(p), "r") if p.is_file() else None

    @staticmethod
    def _zread(path: Path, name: str) -> bytes | None:
        """从 ZIP 文件中读取条目"""
        zf = WorkspaceStorage._zopen(path)
        if zf is None:
            return None
        try:
            return zf.read(name)
        except KeyError:
            return None
        finally:
            zf.close()

    @staticmethod
    def _zlist(path: Path, prefix: str = "") -> list[str]:
        """列出 ZIP 中所有条目名"""
        zf = WorkspaceStorage._zopen(path)
        if zf is None:
            return []
        try:
            names = zf.namelist()
            return [n for n in names if n.startswith(prefix)] if prefix else list(names)
        finally:
            zf.close()

    def list_versions(self, name: str, *, limit: int | None = None, offset: int = 0) -> list[dict]:
        safe_name = self._validate_name(name)
        target_dir = self._versions_dir(name)
        if not target_dir.exists():
            return []
        offset = max(0, int(offset or 0))
        limit_value = int(limit) if limit is not None else None
        if limit_value is not None:
            limit_value = max(0, limit_value)
        end_index = offset + limit_value if limit_value is not None else None
        entries: list[dict] = []
        for version_dir in sorted(target_dir.iterdir(), key=lambda item: item.name, reverse=True)[offset:end_index]:
            if not version_dir.is_dir() or not self._is_package_dir(version_dir):
                continue
            meta = self._read_named_version_meta(version_dir)
            version_id = str(meta.get("id", "")).strip() or version_dir.name
            message = str(meta.get("message", "")).strip()
            timestamp_label = str(meta.get("timestampLabel", "")).strip() or self._format_timestamp_label(version_id)
            entries.append(
                {
                    "id": version_id,
                    "label": f"{message}（{timestamp_label}）" if message else timestamp_label,
                    "doc_name": safe_name,
                    "message": message,
                    "timestamp": str(meta.get("timestamp", "")).strip() or version_id,
                    "timestamp_label": timestamp_label,
                }
            )
        return entries

    def create_named_version(self, name: str, document: dict | None = None, *, message: str = "") -> dict:
        safe_name = self._validate_name(name)
        with self._get_write_lock(safe_name):
            source_document = deepcopy(document) if isinstance(document, dict) else self.load(safe_name)
            version_id = self._timestamp()
            target_root = self._versions_dir(name)
            version_dir = target_root / version_id
            target_root.mkdir(parents=True, exist_ok=True)
            self._write_package_dir(version_dir, safe_name, source_document, source_package_dir=self._package_dir(safe_name))
            self._write_named_version_meta(version_dir, version_id, str(message or "").strip())
            return {
                "ok": True,
                "version": self._read_named_version_meta(version_dir),
                "document": self._load_package_dir(version_dir),
            }

    def load_version(self, name: str, version_id: str) -> dict:
        safe_name = self._validate_name(name)
        safe_version_id = self._sanitize_workspace_entry(version_id)
        version_dir = self._versions_dir(name) / safe_version_id
        if not self._is_package_dir(version_dir):
            raise FileNotFoundError(version_id)
        document = self._load_package_dir(version_dir)
        document["meta"] = document.get("meta") if isinstance(document.get("meta"), dict) else {}
        document["meta"]["readonly"] = True
        document["meta"]["version_id"] = safe_version_id
        document["meta"]["version_label"] = self._read_named_version_meta(version_dir).get("message", "")
        return document

    def list_trash(self) -> list[dict]:
        if not self.trash_dir.exists():
            return []
        entries: list[dict] = []
        seen_ids: set[str] = set()
        for entry in sorted(self.trash_dir.iterdir(), key=lambda item: item.name, reverse=True):
            if entry.is_dir() and self._is_package_dir(entry):
                entry_id = entry.name
            elif entry.is_file() and entry.suffix == ".json":
                entry_id = entry.name
            else:
                continue
            if entry_id in seen_ids:
                continue
            original_name, timestamp = self._parse_trash_entry_name(entry_id)
            seen_ids.add(entry_id)
            entries.append(
                {
                    "id": entry_id,
                    "label": f"{original_name} ({timestamp})",
                    "doc_name": original_name,
                    "timestamp": timestamp,
                }
            )
        return entries

    def restore_trash(self, entry_id: str) -> tuple[str, dict]:
        safe_entry_id = self._sanitize_workspace_entry(entry_id)
        original_name, _ = self._parse_trash_entry_name(safe_entry_id)
        with self._get_write_lock(self._validate_name(original_name)):
            entry_path = self.trash_dir / safe_entry_id
            if entry_path.is_dir() and self._is_package_dir(entry_path):
                document = self._load_package_dir(entry_path)
                restored_document = self.save(original_name, document)
                shutil.rmtree(entry_path, ignore_errors=True)
                return original_name, restored_document
            if entry_path.is_file() and entry_path.suffix == ".json":
                document = self.load_raw_path(entry_path)
                restored_document = self.save(original_name, document)
                entry_path.unlink(missing_ok=True)
                entry_path.with_suffix(".md").unlink(missing_ok=True)
                return original_name, restored_document
            raise FileNotFoundError(safe_entry_id)

    def delete_trash(self, entry_ids: list[str]) -> dict:
        with self._shared_write_lock:
            deleted = 0
            for entry_id in entry_ids:
                safe_entry_id = self._sanitize_workspace_entry(str(entry_id or "").strip())
                if not safe_entry_id:
                    continue
                entry_path = self.trash_dir / safe_entry_id
                if not entry_path.exists():
                    continue
                self._delete_trash_entry_path(entry_path)
                deleted += 1
            return {"ok": True, "deleted": deleted}

    def clear_trash(self) -> dict:
        with self._shared_write_lock:
            deleted = 0
            for entry in list(self.trash_dir.iterdir()) if self.trash_dir.exists() else []:
                if entry.is_dir() or entry.is_file():
                    self._delete_trash_entry_path(entry)
                    deleted += 1
            return {"ok": True, "deleted": deleted}

    def load(self, name: str) -> dict:
        safe_name = self._validate_name(name)
        package_dir = self._package_dir(safe_name)
        if self._is_package_dir(package_dir):
            return self._load_package_dir(package_dir)
        legacy_json_path = self._legacy_json_path(safe_name)
        if legacy_json_path.exists():
            return self.load_path(legacy_json_path)
        raise FileNotFoundError(name)

    def load_attachment_payload(self, name: str, attachment_uid: str, version_uid: str) -> tuple[str, str, bytes]:
        safe_name = self._validate_name(name)
        safe_attachment_uid = str(attachment_uid or "").strip()
        safe_version_uid = str(version_uid or "").strip()
        if not safe_attachment_uid or not safe_version_uid:
            raise FileNotFoundError("attachment")
        package_dir = self._package_dir(safe_name)
        if not self._is_package_dir(package_dir):
            raise FileNotFoundError(name)
        raw_document = json.loads(self._manifest_path(package_dir).read_text("utf-8"))
        document_uid = self._document_uid(raw_document if isinstance(raw_document, dict) else {})
        attachments_by_uid = self._load_attachment_index(document_uid, package_dir)
        attachment = attachments_by_uid.get(safe_attachment_uid)
        if not attachment:
            raise FileNotFoundError(safe_attachment_uid)
        version = next(
            (item for item in attachment.get("versions", []) if str(item.get("uid", "")).strip() == safe_version_uid),
            None,
        )
        if not version:
            raise FileNotFoundError(safe_version_uid)
        payload = self._load_attachment_bytes(document_uid, version, package_dir)
        if not payload:
            raise FileNotFoundError(safe_version_uid)
        filename = str(version.get("name", "")).strip() or str(attachment.get("name", "")).strip() or "attachment"
        content_type = str(version.get("contentType", "")).strip() or "application/octet-stream"
        return filename, content_type, payload

    def stage_attachment_upload(self, filename: str, content_type: str, payload: bytes) -> dict:
        self.uploads_dir.mkdir(exist_ok=True)
        token = uuid.uuid4().hex
        upload_path = self.uploads_dir / f"{token}.bin"
        meta_path = self.uploads_dir / f"{token}.json"
        safe_filename = Path(str(filename or "").strip()).name or "attachment"
        upload_path.write_bytes(payload)
        meta = {
            "token": token,
            "name": safe_filename,
            "contentType": str(content_type or "").strip() or "application/octet-stream",
            "size": len(payload),
        }
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")
        return meta

    def _staged_upload_paths(self, token: str) -> tuple[Path, Path]:
        safe_token = re.sub(r"[^a-fA-F0-9]", "", str(token or "").strip())
        if not safe_token or len(safe_token) != 32:
            raise FileNotFoundError("upload")
        return self.uploads_dir / f"{safe_token}.bin", self.uploads_dir / f"{safe_token}.json"

    def _read_staged_upload(self, token: str) -> tuple[dict, bytes]:
        upload_path, meta_path = self._staged_upload_paths(token)
        if not upload_path.is_file() or not meta_path.is_file():
            raise FileNotFoundError("upload")
        meta = json.loads(meta_path.read_text("utf-8"))
        return meta if isinstance(meta, dict) else {}, upload_path.read_bytes()

    def _read_staged_upload_meta(self, token: str) -> tuple[dict, Path, Path]:
        upload_path, meta_path = self._staged_upload_paths(token)
        if not upload_path.is_file() or not meta_path.is_file():
            raise FileNotFoundError("upload")
        meta = json.loads(meta_path.read_text("utf-8"))
        return meta if isinstance(meta, dict) else {}, upload_path, meta_path

    def _delete_staged_upload(self, token: str) -> None:
        try:
            upload_path, meta_path = self._staged_upload_paths(token)
        except FileNotFoundError:
            return
        upload_path.unlink(missing_ok=True)
        meta_path.unlink(missing_ok=True)

    def _copy_file_fast(self, source: str | Path, target: str | Path) -> None:
        source_path = Path(source)
        target_path = Path(target)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(source_path, target_path)
        except OSError:
            shutil.copy2(source_path, target_path)

    def _move_file_fast(self, source: Path, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.replace(source, target)
        except OSError:
            shutil.copy2(source, target)
            source.unlink(missing_ok=True)

    def _copy_package_metadata(self, source_dir: Path, target_dir: Path, safe_name: str) -> None:
        target_dir.mkdir(parents=True, exist_ok=True)
        self._manifest_path(target_dir).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self._manifest_path(source_dir), self._manifest_path(target_dir))
        markdown_path = self._package_markdown_path(source_dir, safe_name)
        if markdown_path.is_file():
            shutil.copy2(markdown_path, self._package_markdown_path(target_dir, safe_name))
        attachments_index = source_dir / EXPORT_ATTACHMENTS_DIR_NAME / ATTACHMENTS_INDEX_NAME
        if attachments_index.is_file():
            target_index = target_dir / EXPORT_ATTACHMENTS_DIR_NAME / ATTACHMENTS_INDEX_NAME
            target_index.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(attachments_index, target_index)

    def save(self, name: str, document: dict, *, save_message: str = "") -> dict:
        safe_name = self._validate_name(name)
        with self._get_write_lock(safe_name):
            if self._workspace_document_exists(safe_name):
                current_document = self.load(safe_name)
                if self._should_snapshot_manual_history(current_document, document, save_message):
                    self._snapshot_document(safe_name, save_message=save_message, kind="manual")
            current_revision = self._current_document_revision(safe_name)
            document_to_save = self._with_document_revision(document, current_revision + 1)
            saved_document = self._save_workspace_document(safe_name, document_to_save)
            self._remove_legacy_workspace_files(safe_name)
            return saved_document

    def save_collaboration_working_copy(self, name: str, document: dict) -> dict:
        """Persist the live collaboration draft (revision不适用于协作流)."""
        safe_name = self._validate_name(name)
        with self._get_write_lock(safe_name):
            saved_document = self._save_workspace_document(safe_name, document)
            self._remove_legacy_workspace_files(safe_name)
            return saved_document

    def maybe_snapshot_auto_history(self, name: str, document: dict) -> dict:
        """Create or update a compact auto-sync history point when the state is worth keeping."""
        safe_name = self._validate_name(name)
        with self._get_write_lock(safe_name):
            if not self._workspace_document_exists(safe_name):
                return {"ok": False, "skipped": True, "reason": "missing_document"}
            source_document = deepcopy(document if isinstance(document, dict) else self.load(safe_name))
            content_hash = self._history_content_hash(source_document)
            target_root = self._history_dir(name)
            target_root.mkdir(parents=True, exist_ok=True)
            history_entries = self._history_snapshot_entries(target_root)
            last_same_hash = next(
                (
                    entry
                    for entry in sorted(history_entries, key=lambda item: item["timestamp"], reverse=True)
                    if entry["meta"].get("contentHash") == content_hash
                ),
                None,
            )
            if last_same_hash:
                return {"ok": True, "skipped": True, "reason": "same_content", "content_hash": content_hash}

            reason = self._auto_history_reason(source_document, history_entries)
            if not reason:
                return {"ok": True, "skipped": True, "reason": "window_not_elapsed", "content_hash": content_hash}

            replace_entry = self._find_replaceable_auto_history_entry(history_entries, reason)
            snapshot_path = replace_entry["path"] if replace_entry else None
            snapshot_id = replace_entry["id"] if replace_entry else self._timestamp()
            if snapshot_path is not None and snapshot_path.exists():
                if snapshot_path.is_dir():
                    shutil.rmtree(snapshot_path, ignore_errors=True)
                else:
                    snapshot_path.unlink(missing_ok=True)
                    snapshot_path.with_suffix(".md").unlink(missing_ok=True)

            self._snapshot_document(
                safe_name,
                save_message="",
                snapshot_document=source_document,
                kind="auto",
                reason=reason,
                content_hash=content_hash,
                snapshot_id=snapshot_id,
            )
            self._trim_history(target_root)
            return {"ok": True, "skipped": False, "reason": reason, "content_hash": content_hash, "snapshot_id": snapshot_id}

    def save_with_revision(
        self,
        name: str,
        document: dict,
        *,
        base_revision: int | str | None = None,
        base_document: dict | None = None,
        rebase: bool = False,
        save_message: str = "",
    ) -> dict:
        safe_name = self._validate_name(name)
        with self._get_write_lock(safe_name):
            exists = self._workspace_document_exists(safe_name)
            current_document = self.load(safe_name) if exists else None
            current_revision = self._document_revision(current_document) if current_document else 0
            expected_revision = self._coerce_revision(base_revision)
            document_to_save = document
            rebased = False
            merge_result: dict | None = None

            if expected_revision is not None and exists and expected_revision != current_revision:
                if not rebase or not isinstance(base_document, dict):
                    return {
                        "ok": False,
                        "error": "revision_conflict",
                        "message": "文档已被其他人保存，请重新加载或合并后再保存。",
                        "current_revision": current_revision,
                        "base_revision": expected_revision,
                        "current_document": current_document,
                    }
                merge_result = apply_merge(
                    "3way",
                    left_document=document,
                    right_document=current_document or {},
                    base_document=base_document,
                )
                if merge_result.get("conflicts"):
                    return {
                        "ok": False,
                        "error": "revision_conflict",
                        "message": "文档已被其他人保存，自动合并存在冲突，请先处理冲突。",
                        "current_revision": current_revision,
                        "base_revision": expected_revision,
                        **merge_result,
                    }
                document_to_save = merge_result.get("merged_document") or document
                rebased = True

            if exists:
                snapshot_source = base_document if expected_revision is not None and expected_revision == current_revision and isinstance(base_document, dict) else None
                candidate_source = snapshot_source if isinstance(snapshot_source, dict) else current_document
                if self._should_snapshot_manual_history(candidate_source or {}, document_to_save, save_message):
                    self._snapshot_document(safe_name, save_message=save_message, snapshot_document=snapshot_source, kind="manual")
            document_to_save = self._with_document_revision(document_to_save, current_revision + 1)
            saved_document = self._save_workspace_document(safe_name, document_to_save)
            self._remove_legacy_workspace_files(safe_name)
            return {
                "ok": True,
                "document": saved_document,
                "revision": self._document_revision(saved_document),
                "rebased": rebased,
                "merge_summary": (merge_result or {}).get("summary", {}),
            }

    def rename(
        self,
        old_name: str,
        new_name: str,
        document: dict,
        *,
        overwrite: bool = False,
        save_message: str = "",
    ) -> tuple[str, dict]:
        old_safe_name = self._validate_name(old_name)
        new_safe_name = self._validate_name(new_name)
        # 同时获取新旧两个文档的锁，避免跟save并发绕过
        with self._get_write_lock(old_safe_name), self._get_write_lock(new_safe_name):
            if old_safe_name == new_safe_name:
                return new_safe_name, self.save(new_safe_name, document, save_message=save_message)
            if self._workspace_document_exists(new_safe_name) and not overwrite:
                raise FileExistsError(new_safe_name)
            if overwrite and self._workspace_document_exists(new_safe_name):
                saved_document = self.save(new_safe_name, document, save_message=save_message)
            else:
                saved_document = self._save_workspace_document(new_safe_name, document)
                self._remove_legacy_workspace_files(new_safe_name)
            self._move_workspace_document_to_trash(old_safe_name, self._timestamp())
            return new_safe_name, saved_document

    def copy_document(self, source_name: str, target_name: str) -> dict:
        source_safe_name = self._validate_name(source_name)
        target_safe_name = self._validate_name(target_name)
        with self._get_write_lock(source_safe_name), self._get_write_lock(target_safe_name):
            if self._workspace_document_exists(target_safe_name):
                raise FileExistsError(target_safe_name)
            if not self._workspace_document_exists(source_safe_name):
                raise FileNotFoundError(source_safe_name)

            self.temp_dir.mkdir(exist_ok=True)
            temp_dir = self.temp_dir / f"{target_safe_name}.copy-{self._timestamp()}"
            target_dir = self._package_dir(target_safe_name)
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
            try:
                source_package_dir = self._package_dir(source_safe_name)
                source_legacy_json_path = self._legacy_json_path(source_safe_name)
                if self._is_package_dir(source_package_dir):
                    shutil.copytree(source_package_dir, temp_dir)
                elif source_legacy_json_path.exists():
                    self._write_package_dir(temp_dir, target_safe_name, self.load_path(source_legacy_json_path))
                else:
                    raise FileNotFoundError(source_safe_name)

                document = self._load_package_dir(temp_dir)
                document["meta"] = document.get("meta") if isinstance(document.get("meta"), dict) else {}
                document["meta"]["title"] = target_safe_name
                document["meta"]["domain"] = target_safe_name
                document["meta"]["document_uid"] = uuid.uuid4().hex
                document["meta"]["revision"] = 1
                saved_document = self._write_package_dir(temp_dir, target_safe_name, document, source_package_dir=temp_dir)
                if target_dir.exists():
                    shutil.rmtree(target_dir, ignore_errors=True)
                shutil.move(str(temp_dir), str(target_dir))
                self._remove_legacy_workspace_files(target_safe_name)
                return self._load_package_dir(target_dir) or saved_document
            finally:
                if temp_dir.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)

    def create(self, name: str) -> dict:
        safe_name = self._validate_name(name)
        with self._get_write_lock(safe_name):
            if self._workspace_document_exists(safe_name):
                raise FileExistsError(name)
            return self._save_workspace_document(safe_name, create_empty_document(safe_name))

    def delete(self, name: str) -> None:
        safe_name = self._validate_name(name)
        with self._get_write_lock(safe_name):
            self._move_workspace_document_to_trash(safe_name, self._timestamp())

    def export_markdown(self, name: str) -> str:
        return self.exporter.export(self.load(name))

    def build_export_bundle(self, name: str, graph_images: list[DocxImage] | None = None) -> tuple[str, bytes]:
        safe_name = self._validate_name(name)
        document = canonical_document(self.load(safe_name))
        return self.build_export_bundle_from_document(safe_name, document, graph_images=graph_images)

    def build_export_bundle_from_document(self, name: str, document: dict, graph_images: list[DocxImage] | None = None) -> tuple[str, bytes]:
        safe_name = self._validate_name(name)
        document = canonical_document(document)
        package_dir = self._package_dir(safe_name)
        package_document_uid = ""
        package_attachments_by_uid: dict[str, dict] = {}
        if self._is_package_dir(package_dir):
            raw_document = json.loads(self._manifest_path(package_dir).read_text("utf-8"))
            package_document_uid = self._document_uid(raw_document if isinstance(raw_document, dict) else {})
            package_attachments_by_uid = self._load_attachment_index(package_document_uid, package_dir)
        bundle_manifest = deepcopy(document)
        packaged_files: list[tuple[Path, bytes]] = []
        export_attachments: list[dict] = []
        for process_index, process in enumerate(bundle_manifest.get("processes", []), start=1):
            process_uid = str(process.get("uid", "")).strip() or f"process-{process_index}"
            process_id = str(process.get("id", "")).strip() or process_uid
            process_name = str(process.get("name", "")).strip()
            prototype_refs: list[dict] = []
            prototype_sources = process.get("prototypeFiles", [])
            if not isinstance(prototype_sources, list):
                prototype_sources = []
            for prototype_index, prototype in enumerate(prototype_sources, start=1):
                normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
                attachment_uid = str(normalized.get("uid", "")).strip() or f"attachment-{process_index}-{prototype_index}"
                package_attachment = package_attachments_by_uid.get(attachment_uid)
                versions_source = package_attachment.get("versions", []) if package_attachment else normalized.get("versions", [])
                if not isinstance(versions_source, list) or not versions_source:
                    versions_source = [
                        {
                            "uid": str(normalized.get("versionUid", "")).strip() or f"{attachment_uid}-v1",
                            "number": 1,
                            "name": str(normalized.get("name", "")).strip() or f"原型{prototype_index}.html",
                            "content": str(normalized.get("content", "")),
                            "contentType": str(normalized.get("contentType", "text/html")).strip() or "text/html",
                            "contentEncoding": str(normalized.get("contentEncoding", "")).strip(),
                            "size": int(normalized.get("size") or 0),
                            "uploadedAt": str(normalized.get("uploadedAt", "")).strip(),
                        }
                    ]
                export_versions: list[dict] = []
                for version_index, version in enumerate(versions_source, start=1):
                    raw_version = version if isinstance(version, dict) else {"content": str(version or "")}
                    version_uid = str(raw_version.get("uid", "")).strip() or f"{attachment_uid}-v{version_index}"
                    try:
                        version_number = int(raw_version.get("number") or version_index)
                    except (TypeError, ValueError):
                        version_number = version_index
                    if version_number < 1:
                        version_number = version_index
                    version_name = str(raw_version.get("name", "")).strip() or str(normalized.get("name", "")).strip() or f"原型{prototype_index}.html"
                    content_type = str(raw_version.get("contentType", "text/html")).strip() or "text/html"
                    content_encoding = str(raw_version.get("contentEncoding", "")).strip()
                    payload = (
                        self._load_attachment_bytes(package_document_uid, raw_version, package_dir)
                        if package_attachment and package_document_uid
                        else self._decode_attachment_content(raw_version.get("content", ""), content_encoding)
                    )
                    stored_relative_path = str(raw_version.get("path", "")).strip()
                    relative_path = Path(EXPORT_ATTACHMENTS_DIR_NAME) / (
                        Path(stored_relative_path)
                        if stored_relative_path
                        else self._attachment_version_relative_path(
                            attachment_uid,
                            version_number,
                            version_name,
                            content_type,
                            process_uid=process_uid,
                            process_name=process_name,
                        )
                    )
                    packaged_files.append((relative_path, payload))
                    export_versions.append(
                        {
                            "uid": version_uid,
                            "number": version_number,
                            "name": version_name,
                            "contentType": content_type,
                            "contentEncoding": "base64" if content_encoding == "base64" else "",
                            "size": int(raw_version.get("size") or len(payload)),
                            "uploadedAt": str(raw_version.get("uploadedAt", "")).strip(),
                            "path": relative_path.as_posix(),
                        }
                    )
                export_attachments.append(
                    {
                        "uid": attachment_uid,
                        "name": str((package_attachment or {}).get("name", "")).strip() or str(normalized.get("name", "")).strip() or export_versions[-1]["name"],
                        "ownerType": "process",
                        "ownerUid": process_uid,
                        "ownerId": process_id,
                        "ownerName": process_name,
                        "versions": export_versions,
                    }
                )
                current_version_uid = str(normalized.get("versionUid", "")).strip() or export_versions[-1]["uid"]
                if not any(version["uid"] == current_version_uid for version in export_versions):
                    current_version_uid = export_versions[-1]["uid"]
                prototype_refs.append(
                    {
                        "uid": attachment_uid,
                        "versionUid": current_version_uid,
                    }
                )
            process["prototypeFiles"] = prototype_refs
            for node_index, node in enumerate(process.get("nodes", []) if isinstance(process.get("nodes", []), list) else [], start=1):
                node_uid = str(node.get("uid", "") or node.get("id", "")).strip() or f"node-{process_index}-{node_index}"
                node_id = str(node.get("id", "") or node.get("uid", "")).strip() or node_uid
                node_name = str(node.get("name", "")).strip()
                node_refs: list[dict] = []
                node_sources = node.get("prototypeFiles", [])
                if not isinstance(node_sources, list):
                    node_sources = []
                for prototype_index, prototype in enumerate(node_sources, start=1):
                    normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
                    attachment_uid = str(normalized.get("uid", "")).strip() or f"node-attachment-{process_index}-{node_index}-{prototype_index}"
                    package_attachment = package_attachments_by_uid.get(attachment_uid)
                    versions_source = package_attachment.get("versions", []) if package_attachment else normalized.get("versions", [])
                    if not isinstance(versions_source, list) or not versions_source:
                        versions_source = [
                            {
                                "uid": str(normalized.get("versionUid", "")).strip() or f"{attachment_uid}-v1",
                                "number": 1,
                                "name": str(normalized.get("name", "")).strip() or f"节点附件{prototype_index}.html",
                                "content": str(normalized.get("content", "")),
                                "contentType": str(normalized.get("contentType", "text/html")).strip() or "text/html",
                                "contentEncoding": str(normalized.get("contentEncoding", "")).strip(),
                                "size": int(normalized.get("size") or 0),
                                "uploadedAt": str(normalized.get("uploadedAt", "")).strip(),
                            }
                        ]
                    export_versions: list[dict] = []
                    for version_index, version in enumerate(versions_source, start=1):
                        raw_version = version if isinstance(version, dict) else {"content": str(version or "")}
                        version_uid = str(raw_version.get("uid", "")).strip() or f"{attachment_uid}-v{version_index}"
                        try:
                            version_number = int(raw_version.get("number") or version_index)
                        except (TypeError, ValueError):
                            version_number = version_index
                        if version_number < 1:
                            version_number = version_index
                        version_name = str(raw_version.get("name", "")).strip() or str(normalized.get("name", "")).strip() or f"节点附件{prototype_index}.html"
                        content_type = str(raw_version.get("contentType", "text/html")).strip() or "text/html"
                        content_encoding = str(raw_version.get("contentEncoding", "")).strip()
                        payload = (
                            self._load_attachment_bytes(package_document_uid, raw_version, package_dir)
                            if package_attachment and package_document_uid
                            else self._decode_attachment_content(raw_version.get("content", ""), content_encoding)
                        )
                        stored_relative_path = str(raw_version.get("path", "")).strip()
                        relative_path = Path(EXPORT_ATTACHMENTS_DIR_NAME) / (
                            Path(stored_relative_path)
                            if stored_relative_path
                            else self._attachment_version_relative_path(
                                attachment_uid,
                                version_number,
                                version_name,
                                content_type,
                                owner_type="node",
                                owner_uid=node_uid,
                                owner_name=node_name,
                            )
                        )
                        packaged_files.append((relative_path, payload))
                        export_versions.append(
                            {
                                "uid": version_uid,
                                "number": version_number,
                                "name": version_name,
                                "contentType": content_type,
                                "contentEncoding": "base64" if content_encoding == "base64" else "",
                                "size": int(raw_version.get("size") or len(payload)),
                                "uploadedAt": str(raw_version.get("uploadedAt", "")).strip(),
                                "path": relative_path.as_posix(),
                            }
                        )
                    export_attachments.append(
                        {
                            "uid": attachment_uid,
                            "name": str((package_attachment or {}).get("name", "")).strip() or str(normalized.get("name", "")).strip() or export_versions[-1]["name"],
                            "ownerType": "node",
                            "ownerUid": node_uid,
                            "ownerId": node_id,
                            "ownerName": node_name,
                            "versions": export_versions,
                        }
                    )
                    current_version_uid = str(normalized.get("versionUid", "")).strip() or export_versions[-1]["uid"]
                    if not any(version["uid"] == current_version_uid for version in export_versions):
                        current_version_uid = export_versions[-1]["uid"]
                    node_refs.append(
                        {
                            "uid": attachment_uid,
                            "versionUid": current_version_uid,
                        }
                    )
                node["prototypeFiles"] = node_refs
        packaged_files.append(
            (
                Path(PACKAGE_MANIFEST_NAME),
                json.dumps(bundle_manifest, ensure_ascii=False, indent=2).encode("utf-8"),
            )
        )
        packaged_files.append(
            (
                Path(EXPORT_ATTACHMENTS_DIR_NAME) / ATTACHMENTS_INDEX_NAME,
                json.dumps({"attachments": export_attachments}, ensure_ascii=False, indent=2).encode("utf-8"),
            )
        )
        packaged_files.append(
            (
                Path(f"{safe_name}.md"),
                self._markdown_with_graph_images(self.exporter.export(document), graph_images or []).encode("utf-8"),
            )
        )
        for image in graph_images or []:
            packaged_files.append((Path("images") / image.name, image.payload))
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for relative_path, payload in packaged_files:
                archive.writestr(f"{safe_name}/{relative_path.as_posix()}", payload)
        return f"{safe_name}.zip", buffer.getvalue()

    def build_export_docx(self, name: str) -> tuple[str, bytes]:
        safe_name = self._validate_name(name)
        return self.build_export_docx_from_document(safe_name, self.load(safe_name))

    def build_export_docx_from_document(self, name: str, document: dict, graph_images: list[DocxImage] | None = None) -> tuple[str, bytes]:
        safe_name = self._validate_name(name)
        frozen_document = canonical_document(document)
        markdown = self.exporter.export(frozen_document)
        attachments: list[DocxAttachment] = []
        for process in frozen_document.get("processes", []):
            for owner in [process, *(process.get("nodes", []) if isinstance(process.get("nodes", []), list) else [])]:
                prototype_sources = owner.get("prototypeFiles", [])
                if not isinstance(prototype_sources, list):
                    continue
                for prototype in prototype_sources:
                    if not isinstance(prototype, dict):
                        continue
                    attachment_uid = str(prototype.get("uid", "")).strip()
                    version_uid = str(prototype.get("versionUid", "")).strip()
                    if not attachment_uid or not version_uid:
                        continue
                    try:
                        filename, content_type, payload = self.load_attachment_payload(safe_name, attachment_uid, version_uid)
                    except FileNotFoundError:
                        continue
                    attachments.append(DocxAttachment(name=filename, content_type=content_type, payload=payload))
        return (
            f"{safe_name}.docx",
            build_docx_from_preview_markdown(
                markdown,
                title=safe_name,
                graph_images=graph_images or [],
                attachments=attachments,
            ),
        )

    def _markdown_with_graph_images(self, markdown: str, graph_images: list[DocxImage]) -> str:
        """Embed captured graph snapshots into structured markdown.

        Each graph image is inserted as a figure reference inside the document
        body (not appended at the end), using the graph's title as caption.
        """
        if not graph_images:
            return markdown
        named: dict[str, str] = {}
        for image in graph_images:
            stem = Path(image.name).stem
            named[image.name] = stem.replace("-", " ").replace("_", " ")
        lines = list(str(markdown or "").rstrip().splitlines())
        inserted: set[str] = set()
        result: list[str] = []
        for line in lines:
            result.append(line)
            if not line.startswith("##"):
                continue
            heading = line.lstrip("# ").strip()
            for filename, title in named.items():
                if filename in inserted:
                    continue
                if title and (title in heading or heading in title):
                    result.append("")
                    result.append(f"![{title}](images/{filename})")
                    inserted.add(filename)
        for filename, title in named.items():
            if filename not in inserted:
                result.append("")
                result.append(f"![{title}](images/{filename})")
        return "\n".join(result).rstrip() + "\n"

    def migrate_workspace_layout(self) -> dict[str, int]:
        result = {"documents": 0, "history": 0, "trash": 0}
        for legacy_json_path in sorted(self.workspace_dir.glob("*.json")):
            if self._migrate_legacy_json_to_package(
                legacy_json_path,
                self._package_dir(legacy_json_path.stem),
                legacy_json_path.stem,
            ):
                result["documents"] += 1
        # 兼容旧 workspace 级 .history 目录和新文档级 history/ 目录
        old_history = self.workspace_dir / ".history"
        history_roots: list[Path] = []
        if old_history.is_dir():
            history_roots.extend(p for p in old_history.iterdir() if p.is_dir())
        # 文档级 history/
        for pkg in self.workspace_dir.iterdir():
            if not pkg.is_dir() or pkg.name.startswith("."):
                continue
            h = pkg / "history"
            if h.is_dir():
                history_roots.append(pkg)
        for history_root in sorted(set(history_roots), key=lambda p: p.name):
            for snapshot_json_path in sorted(history_root.glob("*.json")):
                if self._migrate_legacy_json_to_package(
                    snapshot_json_path,
                    history_root / snapshot_json_path.stem,
                    history_root.name,
                ):
                    result["history"] += 1
        for trash_json_path in sorted(self.trash_dir.glob("*.json")):
            original_name, _ = self._parse_trash_entry_name(trash_json_path.name)
            if self._migrate_legacy_json_to_package(
                trash_json_path,
                self.trash_dir / trash_json_path.stem,
                original_name,
            ):
                result["trash"] += 1
        return result

    def _package_dir(self, name: str) -> Path:
        return self.workspace_dir / self._validate_name(name)

    def _manifest_path(self, package_dir: Path) -> Path:
        return package_dir / "manifest" / PACKAGE_MANIFEST_NAME

    def _package_markdown_path(self, package_dir: Path, name: str) -> Path:
        return package_dir / "manifest" / f"{self._validate_name(name)}.md"

    def _remove_stale_package_markdown_files(self, package_dir: Path, name: str) -> None:
        expected_path = self._package_markdown_path(package_dir, name).resolve()
        if not package_dir.exists():
            return
        for markdown_path in package_dir.glob("*.md"):
            if markdown_path.resolve() != expected_path:
                markdown_path.unlink(missing_ok=True)

    def _legacy_json_path(self, name: str) -> Path:
        return self.workspace_dir / f"{self._validate_name(name)}.json"

    def _legacy_markdown_path(self, name: str) -> Path:
        return self.workspace_dir / f"{self._validate_name(name)}.md"

    def _attachment_root_for_doc(self, document_uid: str, package_dir: Path | None = None) -> Path:
        if package_dir is not None:
            return Path(package_dir) / EXPORT_ATTACHMENTS_DIR_NAME
        return self.attachments_dir / self._safe_path_component(document_uid, "doc")

    def _attachment_path(self, document_uid: str, attachment_key: str) -> Path:
        safe_key = Path(str(attachment_key or "").strip()).name
        return self._attachment_root_for_doc(document_uid) / self._safe_path_component(safe_key, "attachment.bin")

    def _attachment_index_path(self, document_uid: str, package_dir: Path | None = None) -> Path:
        return self._attachment_root_for_doc(document_uid, package_dir) / ATTACHMENTS_INDEX_NAME

    def _attachment_version_relative_path(
        self,
        attachment_uid: str,
        version_number: int,
        version_name: str,
        content_type: str,
        *,
        owner_type: str = "process",
        owner_uid: str = "",
        owner_name: str = "",
        process_uid: str = "",
        process_name: str = "",
    ) -> Path:
        safe_attachment_uid = self._safe_path_component(attachment_uid, "attachment")
        normalized_owner_type = str(owner_type or "process").strip() or "process"
        owner_dir = "nodes" if normalized_owner_type == "node" else "processes"
        resolved_owner_uid = owner_uid or process_uid or normalized_owner_type
        resolved_owner_name = owner_name or process_name
        safe_owner_uid = self._safe_path_component(resolved_owner_uid, normalized_owner_type)
        owner_label = str(resolved_owner_name or "").strip()
        safe_owner_name = self._safe_path_component(owner_label, "") if owner_label else ""
        safe_owner_dir = safe_owner_uid if not safe_owner_name else f"{safe_owner_uid}__{safe_owner_name}"
        safe_name = self._build_attachment_filename(version_name, content_type)
        return Path(owner_dir) / safe_owner_dir / safe_attachment_uid / f"v{max(int(version_number or 1), 1)}__{safe_name}"

    def _attachment_version_path(self, document_uid: str, relative_path: str | Path, package_dir: Path | None = None) -> Path:
        root = self._attachment_root_for_doc(document_uid, package_dir)
        candidate = (root / Path(str(relative_path or "").strip())).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError as exc:
            raise InvalidWorkspaceEntryError("附件路径不合法") from exc
        return candidate

    def _load_attachment_index(self, document_uid: str, package_dir: Path | None = None) -> dict[str, dict]:
        index_path = self._attachment_index_path(document_uid, package_dir)
        if not index_path.exists():
            return {}
        raw_payload = json.loads(index_path.read_text("utf-8"))
        attachments_source = raw_payload.get("attachments", []) if isinstance(raw_payload, dict) else []
        attachments_by_uid: dict[str, dict] = {}
        for attachment_index, attachment in enumerate(attachments_source, start=1):
            if not isinstance(attachment, dict):
                continue
            attachment_uid = str(attachment.get("uid", "")).strip() or f"attachment-{attachment_index}"
            versions_source = attachment.get("versions", [])
            if not isinstance(versions_source, list):
                versions_source = []
            normalized_versions: list[dict] = []
            for version_index, version in enumerate(versions_source, start=1):
                raw_version = version if isinstance(version, dict) else {}
                version_name = (
                    str(raw_version.get("name", "")).strip()
                    or str(attachment.get("name", "")).strip()
                    or f"原型{attachment_index}.html"
                )
                try:
                    version_number = int(raw_version.get("number") or version_index)
                except (TypeError, ValueError):
                    version_number = version_index
                if version_number < 1:
                    version_number = version_index
                content_type = str(raw_version.get("contentType", "text/html")).strip() or "text/html"
                relative_path = str(raw_version.get("path", "")).strip() or self._attachment_version_relative_path(
                    attachment_uid,
                    version_number,
                    version_name,
                    content_type,
                    owner_type=str(attachment.get("ownerType", "")).strip() or "process",
                    owner_uid=str(attachment.get("ownerUid", "") or attachment.get("ownerId", "")).strip(),
                    owner_name=str(attachment.get("ownerName", "")).strip(),
                ).as_posix()
                normalized_versions.append(
                    {
                        "uid": str(raw_version.get("uid", "")).strip() or f"{attachment_uid}-v{version_number}",
                        "number": version_number,
                        "name": version_name,
                        "contentType": content_type,
                        "contentEncoding": str(raw_version.get("contentEncoding", "")).strip(),
                        "size": int(raw_version.get("size") or 0),
                        "uploadedAt": str(raw_version.get("uploadedAt", "")).strip(),
                        "path": relative_path,
                    }
                )
            normalized_versions.sort(key=lambda item: (item["number"], item["uid"]))
            attachment_name = str(attachment.get("name", "")).strip() or (
                normalized_versions[-1]["name"] if normalized_versions else f"原型{attachment_index}.html"
            )
            attachments_by_uid[attachment_uid] = {
                "uid": attachment_uid,
                "name": attachment_name,
                "ownerType": str(attachment.get("ownerType", "")).strip() or "process",
                "ownerUid": str(attachment.get("ownerUid", "") or attachment.get("ownerId", "")).strip(),
                "ownerId": str(attachment.get("ownerId", "") or attachment.get("ownerUid", "")).strip(),
                "ownerName": str(attachment.get("ownerName", "")).strip(),
                "versions": normalized_versions,
            }
        return attachments_by_uid

    def _write_attachment_index(self, document_uid: str, attachments_by_uid: dict[str, dict], package_dir: Path | None = None) -> None:
        root = self._attachment_root_for_doc(document_uid, package_dir)
        root.mkdir(parents=True, exist_ok=True)
        serializable_attachments: list[dict] = []
        for attachment_uid in sorted(attachments_by_uid):
            attachment = attachments_by_uid[attachment_uid]
            versions = sorted(attachment.get("versions", []), key=lambda item: (item.get("number", 0), item.get("uid", "")))
            serializable_attachments.append(
                {
                    "uid": attachment_uid,
                    "name": str(attachment.get("name", "")).strip(),
                    "ownerType": str(attachment.get("ownerType", "")).strip() or "process",
                    "ownerUid": str(attachment.get("ownerUid", "") or attachment.get("ownerId", "")).strip(),
                    "ownerId": str(attachment.get("ownerId", "") or attachment.get("ownerUid", "")).strip(),
                    "ownerName": str(attachment.get("ownerName", "")).strip(),
                    "versions": [
                        {
                            "uid": str(version.get("uid", "")).strip(),
                            "number": int(version.get("number") or version_index),
                            "name": str(version.get("name", "")).strip(),
                            "contentType": str(version.get("contentType", "text/html")).strip() or "text/html",
                            "contentEncoding": str(version.get("contentEncoding", "")).strip(),
                            "size": int(version.get("size") or 0),
                            "uploadedAt": str(version.get("uploadedAt", "")).strip(),
                            "path": str(version.get("path", "")).strip(),
                        }
                        for version_index, version in enumerate(versions, start=1)
                    ],
                }
            )
        self._attachment_index_path(document_uid, package_dir).write_text(
            json.dumps({"attachments": serializable_attachments}, ensure_ascii=False, indent=2),
            "utf-8",
        )

    def _store_attachment_entry(
        self,
        document_uid: str,
        prototype: dict,
        *,
        package_dir: Path | None = None,
        source_package_dir: Path | None = None,
        owner_type: str = "process",
        owner_uid: str = "",
        owner_id: str = "",
        owner_name: str = "",
        process_uid: str = "",
        process_name: str = "",
        attachment_index: int,
        existing_attachment: dict | None,
        fallback_uploaded_at: str,
    ) -> tuple[dict, str]:
        attachment_uid = str(prototype.get("uid", "")).strip() or f"attachment-{attachment_index}"
        versions_source = prototype.get("versions", [])
        if not isinstance(versions_source, list) or not versions_source:
            existing_latest_version = (
                sorted((existing_attachment or {}).get("versions", []), key=lambda item: (item.get("number", 0), item.get("uid", "")))[-1]
                if (existing_attachment or {}).get("versions")
                else {}
            )
            versions_source = [
                {
                    "uid": str(prototype.get("versionUid", "")).strip()
                    or str(existing_latest_version.get("uid", "")).strip()
                    or f"{attachment_uid}-v1",
                    "number": existing_latest_version.get("number", 1) or 1,
                    "name": str(prototype.get("name", "")).strip() or f"原型{attachment_index}.html",
                    "content": str(prototype.get("content", "")),
                    "contentType": str(prototype.get("contentType", "text/html")).strip() or "text/html",
                    "contentEncoding": str(prototype.get("contentEncoding", "")).strip(),
                    "size": int(prototype.get("size") or 0),
                    "uploadedAt": str(prototype.get("uploadedAt", "")).strip()
                    or str(existing_latest_version.get("uploadedAt", "")).strip()
                    or fallback_uploaded_at,
                }
            ]
        existing_versions = {
            str(version.get("uid", "")).strip(): version
            for version in (existing_attachment or {}).get("versions", [])
            if str(version.get("uid", "")).strip()
        }
        existing_latest_version = (
            sorted(existing_versions.values(), key=lambda item: (item.get("number", 0), item.get("uid", "")))[-1]
            if existing_versions
            else {}
        )
        reuse_existing_current_version = (
            bool(existing_latest_version)
            and len(versions_source) == 1
            and not str(prototype.get("uploadedAt", "")).strip()
            and not any(
                str((version if isinstance(version, dict) else {}).get("uid", "")).strip() in existing_versions
                for version in versions_source
            )
        )
        stored_versions: list[dict] = []
        stored_version_uids: set[str] = set()
        for version_index, version in enumerate(versions_source, start=1):
            raw_version = version if isinstance(version, dict) else {"content": str(version or "")}
            version_uid = (
                str(existing_latest_version.get("uid", "")).strip()
                if reuse_existing_current_version and version_index == 1
                else str(raw_version.get("uid", "")).strip()
            ) or f"{attachment_uid}-v{version_index}"
            try:
                version_number = int(
                    existing_latest_version.get("number")
                    if reuse_existing_current_version and version_index == 1
                    else raw_version.get("number") or version_index
                )
            except (TypeError, ValueError):
                version_number = version_index
            if version_number < 1:
                version_number = version_index
            version_name = (
                str(raw_version.get("name", "")).strip()
                or str(prototype.get("name", "")).strip()
                or (existing_attachment or {}).get("name", "")
                or f"原型{attachment_index}.html"
            )
            content_type = str(raw_version.get("contentType", "text/html")).strip() or "text/html"
            content_encoding = str(raw_version.get("contentEncoding", "")).strip()
            inline_content = str(raw_version.get("content", ""))
            upload_token = str(raw_version.get("uploadToken", "")).strip()
            existing_version = existing_versions.get(version_uid, {})
            payload: bytes | None = None
            staged_upload_path: Path | None = None
            staged_meta_path: Path | None = None
            existing_source_path: Path | None = None
            if upload_token:
                try:
                    upload_meta, staged_upload_path, staged_meta_path = self._read_staged_upload_meta(upload_token)
                    version_name = str(upload_meta.get("name", "")).strip() or version_name
                    content_type = str(upload_meta.get("contentType", "")).strip() or content_type
                    content_encoding = ""
                    content_size = int(raw_version.get("size") or upload_meta.get("size") or staged_upload_path.stat().st_size)
                except FileNotFoundError:
                    if not existing_version:
                        raise
                    existing_source_path = self._attachment_version_path(
                        document_uid,
                        str(existing_version.get("path", "")).strip(),
                        source_package_dir or package_dir,
                    )
                    content_size = int(raw_version.get("size") or existing_version.get("size") or (existing_source_path.stat().st_size if existing_source_path.is_file() else 0))
            elif inline_content == "" and existing_version:
                existing_source_path = self._attachment_version_path(
                    document_uid,
                    str(existing_version.get("path", "")).strip(),
                    source_package_dir or package_dir,
                )
                content_size = int(raw_version.get("size") or existing_version.get("size") or (existing_source_path.stat().st_size if existing_source_path.is_file() else 0))
            else:
                payload = self._decode_attachment_content(inline_content, content_encoding)
                content_size = int(raw_version.get("size") or len(payload))
            uploaded_at = (
                str(raw_version.get("uploadedAt", "")).strip()
                or str(existing_version.get("uploadedAt", "")).strip()
                or fallback_uploaded_at
            )
            relative_path = (
                str(existing_version.get("path", "")).strip()
                or self._attachment_version_relative_path(
                    attachment_uid,
                    version_number,
                    version_name,
                    content_type,
                    owner_type=owner_type,
                    owner_uid=owner_uid or process_uid,
                    owner_name=owner_name or process_name,
                ).as_posix()
            )
            absolute_path = self._attachment_version_path(document_uid, relative_path, package_dir)
            if staged_upload_path:
                self._move_file_fast(staged_upload_path, absolute_path)
                if staged_meta_path:
                    staged_meta_path.unlink(missing_ok=True)
            elif existing_source_path and existing_source_path.is_file():
                if existing_source_path.resolve() != absolute_path.resolve():
                    self._copy_file_fast(existing_source_path, absolute_path)
            else:
                absolute_path.parent.mkdir(parents=True, exist_ok=True)
                absolute_path.write_bytes(payload or b"")
            stored_versions.append(
                {
                    "uid": version_uid,
                    "number": version_number,
                    "name": version_name,
                    "contentType": content_type,
                    "contentEncoding": "base64" if content_encoding == "base64" else "",
                    "size": content_size,
                    "uploadedAt": uploaded_at,
                    "path": relative_path,
                }
            )
            stored_version_uids.add(version_uid)
        for version_uid, existing_version in existing_versions.items():
            if version_uid not in stored_version_uids:
                stored_versions.append(existing_version)
        stored_versions.sort(key=lambda item: (item["number"], item["uid"]))
        current_version_uid = str(prototype.get("versionUid", "")).strip() or stored_versions[-1]["uid"]
        if not any(version["uid"] == current_version_uid for version in stored_versions):
            current_version_uid = stored_versions[-1]["uid"]
        attachment_name = (
            str(prototype.get("name", "")).strip()
            or next(
                (version["name"] for version in stored_versions if version["uid"] == current_version_uid),
                stored_versions[-1]["name"],
            )
        )
        return {
            "uid": attachment_uid,
            "name": attachment_name,
            "ownerType": owner_type or "process",
            "ownerUid": owner_uid or process_uid,
            "ownerId": owner_id or owner_uid or process_uid,
            "ownerName": owner_name or process_name,
            "versions": stored_versions,
        }, current_version_uid

    def _decode_attachment_content(self, content: object, content_encoding: str = "") -> bytes:
        if str(content_encoding or "").strip() == "base64":
            try:
                return base64.b64decode(str(content or "").encode("ascii"), validate=True)
            except (ValueError, TypeError):
                return b""
        return str(content or "").encode("utf-8")

    def _load_attachment_bytes(self, document_uid: str, version_meta: dict, package_dir: Path | None = None) -> bytes:
        relative_path = str(version_meta.get("path", "")).strip()
        if not relative_path:
            return b""
        version_path = self._attachment_version_path(document_uid, relative_path, package_dir)
        if not version_path.is_file():
            return b""
        return version_path.read_bytes()

    def _build_loaded_attachment_entry(self, attachment_meta: dict, version_uid: str, document_uid: str, package_dir: Path | None = None) -> dict:
        versions: list[dict] = []
        for version in attachment_meta.get("versions", []):
            versions.append(
                {
                    "uid": str(version.get("uid", "")).strip(),
                    "number": int(version.get("number") or len(versions) + 1),
                    "name": str(version.get("name", "")).strip(),
                    "contentType": str(version.get("contentType", "text/html")).strip() or "text/html",
                    "contentEncoding": str(version.get("contentEncoding", "")).strip(),
                    "size": int(version.get("size") or 0),
                    "uploadedAt": str(version.get("uploadedAt", "")).strip(),
                }
            )
        versions.sort(key=lambda item: (item["number"], item["uid"]))
        current_version = next((item for item in versions if item["uid"] == version_uid), versions[-1] if versions else None)
        if not current_version:
            return {
                "uid": str(attachment_meta.get("uid", "")).strip() or "attachment",
                "name": str(attachment_meta.get("name", "")).strip() or "原型.html",
                "versionUid": "",
                "contentType": "text/html",
                "contentEncoding": "",
                "size": 0,
                "uploadedAt": "",
                "versions": [],
            }
        return {
            "uid": str(attachment_meta.get("uid", "")).strip() or "attachment",
            "name": str(attachment_meta.get("name", "")).strip() or current_version["name"],
            "versionUid": current_version["uid"],
            "contentType": current_version["contentType"],
            "contentEncoding": current_version["contentEncoding"],
            "size": current_version["size"],
            "uploadedAt": current_version["uploadedAt"],
            "versions": versions,
        }

    def _format_uploaded_at(self, timestamp: float | None = None) -> str:
        moment = datetime.fromtimestamp(timestamp) if timestamp else datetime.now()
        return moment.strftime("%Y-%m-%d %H:%M:%S")

    def _history_snapshot_dir(self, name: str, snapshot_id: str) -> Path:
        return self._history_dir(name) / self._sanitize_workspace_entry(snapshot_id)

    def _history_snapshot_json_path(self, name: str, snapshot_id: str) -> Path:
        return self._history_dir(name) / f"{self._sanitize_workspace_entry(snapshot_id)}.json"

    def _history_dir(self, name: str) -> Path:
        """文档级历史快照目录（DOCNAME/history/）。"""
        d = self._package_dir(self._validate_name(name)) / "history"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _history_archive_path(self, name: str) -> Path:
        return self._history_dir(name) / "archive.zip"

    def _versions_dir(self, name: str) -> Path:
        """文档级归档版本目录（DOCNAME/versions/）。"""
        d = self._package_dir(self._validate_name(name)) / "versions"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _validate_name(self, name: str) -> str:
        normalized = (name or "").strip()
        if not normalized:
            raise InvalidDocumentNameError("名称不能为空")
        if any(separator in normalized for separator in ("/", "\\")):
            raise InvalidDocumentNameError("名称不能包含路径分隔符")
        if normalized in {".", ".."}:
            raise InvalidDocumentNameError("名称不合法")
        return normalized

    def _sanitize_workspace_entry(self, entry: str) -> str:
        normalized = Path(str(entry or "").strip()).name
        if not normalized or normalized in {".", ".."}:
            raise InvalidWorkspaceEntryError("记录标识不合法")
        if normalized != str(entry or "").strip():
            raise InvalidWorkspaceEntryError("记录标识不合法")
        return normalized

    def _is_package_dir(self, path: Path) -> bool:
        if not path.is_dir():
            return False
        if self._manifest_path(path).is_file():
            return True
        # 过渡期兼容：根目录有 manifest.json（旧格式，迁移脚本会处理）
        if (path / PACKAGE_MANIFEST_NAME).is_file():
            return True
        # 旧 manifest/ 目录（极老格式）
        if (path / "manifest" / PACKAGE_MANIFEST_NAME).is_file():
            return True
        return False

    def _workspace_document_exists(self, name: str) -> bool:
        safe_name = self._validate_name(name)
        return self._is_package_dir(self._package_dir(safe_name)) or self._legacy_json_path(safe_name).exists()

    def _coerce_revision(self, value: int | str | None) -> int | None:
        if value in (None, ""):
            return None
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return None

    def _document_revision(self, document: dict | None) -> int:
        if not isinstance(document, dict):
            return 0
        meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
        return self._coerce_revision(meta.get("revision")) or 0

    def _current_document_revision(self, name: str) -> int:
        safe_name = self._validate_name(name)
        if not self._workspace_document_exists(safe_name):
            return 0
        return self._document_revision(self.load(safe_name))

    def _with_document_revision(self, document: dict, revision: int) -> dict:
        next_document = deepcopy(document if isinstance(document, dict) else {})
        next_document["meta"] = next_document.get("meta") if isinstance(next_document.get("meta"), dict) else {}
        next_document["meta"]["revision"] = max(0, int(revision or 0))
        return next_document

    def _history_content_hash(self, document: dict | None) -> str:
        source = canonical_document(deepcopy(document if isinstance(document, dict) else {}))
        meta = source.get("meta") if isinstance(source.get("meta"), dict) else {}
        for key in ["revision", "readonly", "version_id", "version_label"]:
            meta.pop(key, None)
        source["meta"] = meta
        encoded = json.dumps(source, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _should_snapshot_manual_history(self, current_document: dict, next_document: dict, save_message: str = "") -> bool:
        if str(save_message or "").strip():
            return True
        return self._history_content_hash(current_document) != self._history_content_hash(next_document)

    def _history_snapshot_entries(self, target_root: Path) -> list[dict]:
        entries: list[dict] = []
        if not target_root.exists():
            return entries
        for entry in target_root.iterdir():
            if entry.is_dir() and self._is_package_dir(entry):
                snapshot_id = entry.name
            elif entry.is_file() and entry.suffix == ".json":
                snapshot_id = entry.stem
            else:
                continue
            meta = self._read_snapshot_meta(entry)
            entries.append(
                {
                    "id": snapshot_id,
                    "path": entry,
                    "meta": meta,
                    "timestamp": self._parse_snapshot_datetime(snapshot_id) or datetime.min,
                }
            )
        entries.sort(key=lambda item: item["timestamp"])
        return entries

    def _parse_snapshot_datetime(self, snapshot_id: str) -> datetime | None:
        try:
            return datetime.strptime(str(snapshot_id or "").strip(), "%Y%m%d-%H%M%S-%f")
        except ValueError:
            return None

    def _auto_history_reason(self, document: dict, history_entries: list[dict]) -> str:
        now = datetime.now()
        auto_entries = [entry for entry in history_entries if entry["meta"].get("kind") == "auto"]
        if not auto_entries:
            return "time_window"

        newest = max(auto_entries, key=lambda item: item["timestamp"])
        if self._has_structural_change(document, newest["path"]):
            return "structural_change"

        elapsed = now - newest["timestamp"]
        if newest["meta"].get("reason") == "time_window" and elapsed.total_seconds() < self.auto_history_window_seconds:
            return "time_window"
        if elapsed.total_seconds() >= self.auto_history_window_seconds:
            return "time_window"
        return ""

    def _find_replaceable_auto_history_entry(self, history_entries: list[dict], reason: str) -> dict | None:
        if reason != "time_window":
            return None
        now = datetime.now()
        auto_entries = [
            entry
            for entry in history_entries
            if entry["meta"].get("kind") == "auto"
            and entry["meta"].get("reason") == "time_window"
            and (now - entry["timestamp"]).total_seconds() < self.auto_history_window_seconds
        ]
        return max(auto_entries, key=lambda item: item["timestamp"], default=None)

    def _has_structural_change(self, document: dict, snapshot_path: Path) -> bool:
        try:
            previous = self._load_history_snapshot(snapshot_path.parent.name, snapshot_path.name if snapshot_path.is_dir() else snapshot_path.stem)
        except (FileNotFoundError, InvalidWorkspaceEntryError, OSError, ValueError):
            return True
        return self._structural_signature(previous) != self._structural_signature(document)

    def _structural_signature(self, document: dict | None) -> dict:
        source = document if isinstance(document, dict) else {}
        signatures: dict[str, list] = {}
        for key in ["valueStreams", "businessAreas", "stages", "components", "constructs", "tasks", "entities", "forms"]:
            items = source.get(key, [])
            signatures[key] = sorted(
                str(item.get("uid") or item.get("name") or "")
                for item in items
                if isinstance(item, dict)
            )
        process_signatures = []
        for process in source.get("processes", []) if isinstance(source.get("processes", []), list) else []:
            if not isinstance(process, dict):
                continue
            process_signatures.append(
                (
                    str(process.get("uid") or process.get("name") or ""),
                    tuple(sorted(str(item.get("uid") or item.get("name") or "") for item in process.get("nodes", []) if isinstance(item, dict))),
                    tuple(sorted(str(item.get("uid") or item.get("name") or "") for item in process.get("gateways", []) if isinstance(item, dict))),
                    tuple(sorted(str(item.get("uid") or item.get("name") or "") for item in process.get("flowEdges", []) if isinstance(item, dict))),
                    tuple(sorted(str(item.get("uid") or item.get("name") or "") for item in process.get("prototypeFiles", []) if isinstance(item, dict))),
                )
            )
        signatures["processes"] = sorted(process_signatures)
        return signatures

    def _snapshot_document(
        self,
        name: str,
        *,
        save_message: str = "",
        snapshot_document: dict | None = None,
        kind: str = "manual",
        reason: str = "",
        content_hash: str = "",
        snapshot_id: str = "",
        skip_canonical: bool = False,
        user: str = "",
        seq: int = 0,
    ) -> None:
        safe_name = self._validate_name(name)
        target_root = self._history_dir(name)
        snapshot_id = self._sanitize_workspace_entry(snapshot_id or self._timestamp())
        snapshot_dir = target_root / snapshot_id
        target_root.mkdir(parents=True, exist_ok=True)
        package_dir = self._package_dir(safe_name)
        legacy_json_path = self._legacy_json_path(safe_name)
        snapshot_document = deepcopy(snapshot_document) if isinstance(snapshot_document, dict) else self.load(safe_name)
        if self._is_package_dir(package_dir):
            self._copy_package_metadata(package_dir, snapshot_dir, safe_name)
            write_doc = snapshot_document if skip_canonical else canonical_document(snapshot_document)
            self._manifest_path(snapshot_dir).write_text(
                json.dumps(write_doc, ensure_ascii=False, indent=2),
                "utf-8",
            )
            self._package_markdown_path(snapshot_dir, safe_name).write_text(
                self.exporter.export(snapshot_document),
                "utf-8",
            )
        elif legacy_json_path.exists():
            self._write_package_dir(snapshot_dir, safe_name, snapshot_document)
        else:
            return
        self._write_snapshot_meta(
            snapshot_dir,
            snapshot_id,
            save_message,
            kind=kind,
            reason=reason,
            content_hash=content_hash or self._history_content_hash(snapshot_document),
            user=user,
            seq=int(seq or 0),
        )
        self._trim_history(target_root)

    def _load_history_snapshot(self, name: str, snapshot_id: str) -> dict:
        snapshot_dir = self._history_snapshot_dir(name, snapshot_id)
        if self._is_package_dir(snapshot_dir):
            return self._load_package_dir(snapshot_dir)
        snapshot_json_path = self._history_snapshot_json_path(name, snapshot_id)
        if snapshot_json_path.exists():
            return self.load_raw_path(snapshot_json_path)
        # 查 ZIP 归档
        archive = self._history_archive_path(name)
        raw = self._zread(archive, f"{snapshot_id}/manifest.json")
        if raw:
            return json.loads(raw.decode("utf-8"))
        raise FileNotFoundError(snapshot_id)

    def _snapshot_meta_path(self, snapshot_path: Path) -> Path:
        if snapshot_path.is_dir():
            return snapshot_path / SNAPSHOT_META_NAME
        return snapshot_path.with_suffix(".snapshot.json")

    def _read_snapshot_meta(self, snapshot_path: Path) -> dict:
        meta_path = self._snapshot_meta_path(snapshot_path)
        if not meta_path.is_file():
            return {}
        try:
            payload = json.loads(meta_path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _write_snapshot_meta(
        self,
        snapshot_dir: Path,
        snapshot_id: str,
        message: str,
        *,
        kind: str = "manual",
        reason: str = "",
        content_hash: str = "",
        user: str = "",
        seq: int = 0,
    ) -> None:
        normalized_kind = str(kind or "").strip()
        if normalized_kind not in ("auto", "manual", "collab"):
            normalized_kind = "manual"
        normalized_reason = str(reason or "").strip()
        if not normalized_reason:
            normalized_reason = "manual_message" if normalized_kind in ("manual", "collab") and str(message or "").strip() else (
                "manual_save" if normalized_kind in ("manual", "collab") else "time_window"
            )
        payload = {
            "id": snapshot_id,
            "message": str(message or "").strip(),
            "kind": normalized_kind,
            "reason": normalized_reason,
            "contentHash": str(content_hash or "").strip(),
            "createdAt": datetime.now().isoformat(timespec="seconds"),
            "timestamp": snapshot_id,
            "timestampLabel": self._format_timestamp_label(snapshot_id),
            "user": str(user or "").strip(),
            "seq": int(seq or 0),
        }
        (snapshot_dir / SNAPSHOT_META_NAME).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            "utf-8",
        )

    def _named_version_meta_path(self, version_dir: Path) -> Path:
        return version_dir / "version.json"

    def _read_named_version_meta(self, version_dir: Path) -> dict:
        meta_path = self._named_version_meta_path(version_dir)
        if not meta_path.is_file():
            return {}
        try:
            payload = json.loads(meta_path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _write_named_version_meta(self, version_dir: Path, version_id: str, message: str) -> None:
        payload = {
            "id": version_id,
            "message": str(message or "").strip(),
            "timestamp": version_id,
            "timestampLabel": self._format_timestamp_label(version_id),
        }
        self._named_version_meta_path(version_dir).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            "utf-8",
        )

    def _format_timestamp_label(self, snapshot_id: str) -> str:
        text = str(snapshot_id or "").strip()
        try:
            value = datetime.strptime(text[:15], "%Y%m%d-%H%M%S")
        except ValueError:
            return text
        return value.strftime("%Y年%m月%d日 %H时%M分%S秒")

    def _move_workspace_document_to_trash(self, name: str, timestamp: str) -> None:
        safe_name = self._validate_name(name)
        trash_entry_dir = self.trash_dir / f"{safe_name}-{timestamp}"
        package_dir = self._package_dir(safe_name)
        legacy_json_path = self._legacy_json_path(safe_name)
        if self._is_package_dir(package_dir):
            shutil.move(str(package_dir), str(trash_entry_dir))
            self._remove_legacy_workspace_files(safe_name)
            return
        if legacy_json_path.exists():
            self._write_package_dir(trash_entry_dir, safe_name, self.load_path(legacy_json_path))
            self._remove_legacy_workspace_files(safe_name)

    def _save_workspace_document(self, name: str, document: dict) -> dict:
        safe_name = self._validate_name(name)
        package_dir = self._package_dir(safe_name)
        if self._is_package_dir(package_dir):
            return self._write_package_dir(package_dir, safe_name, document, source_package_dir=package_dir)
        self.temp_dir.mkdir(exist_ok=True)
        temp_dir = self.temp_dir / f"{safe_name}.tmp-{self._timestamp()}"
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
        try:
            source_package_dir = package_dir if self._is_package_dir(package_dir) else None
            saved_document = self._write_package_dir(temp_dir, safe_name, document, source_package_dir=source_package_dir)
            if package_dir.exists():
                shutil.rmtree(package_dir, ignore_errors=True)
            shutil.move(str(temp_dir), str(package_dir))
            return saved_document
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)

    def _write_package_dir(self, package_dir: Path, name: str, document: dict, *, source_package_dir: Path | None = None) -> dict:
        safe_name = self._validate_name(name)
        migrated_document = migrate_document(document)
        manifest_document = deepcopy(migrated_document)
        document_uid = self._document_uid(manifest_document)
        existing_attachments_by_uid = self._load_attachment_index(document_uid, source_package_dir or package_dir)
        attachments_by_uid: dict[str, dict] = {}
        fallback_uploaded_at = self._format_uploaded_at()
        for process_index, process in enumerate(manifest_document.get("processes", []), start=1):
            process_uid = str(process.get("uid", "")).strip() or f"process-{process_index}"
            process_id = str(process.get("id", "")).strip() or process_uid
            process_name = str(process.get("name", "")).strip()
            prototype_refs: list[dict] = []
            prototype_sources = process.get("prototypeFiles", [])
            if not isinstance(prototype_sources, list):
                prototype_sources = []
            for prototype_index, prototype in enumerate(prototype_sources, start=1):
                normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
                stored_attachment, current_version_uid = self._store_attachment_entry(
                    document_uid,
                    normalized,
                    package_dir=package_dir,
                    source_package_dir=source_package_dir,
                    owner_type="process",
                    owner_uid=process_uid,
                    owner_id=process_id,
                    owner_name=process_name,
                    process_uid=process_uid,
                    process_name=process_name,
                    attachment_index=(process_index * 1000) + prototype_index,
                    existing_attachment=existing_attachments_by_uid.get(str(normalized.get("uid", "")).strip()),
                    fallback_uploaded_at=fallback_uploaded_at,
                )
                attachments_by_uid[stored_attachment["uid"]] = stored_attachment
                prototype_refs.append(
                    {
                        "uid": stored_attachment["uid"],
                        "versionUid": current_version_uid,
                    }
                )
            process["prototypeFiles"] = prototype_refs
            for node_index, node in enumerate(process.get("nodes", []) if isinstance(process.get("nodes", []), list) else [], start=1):
                node_uid = str(node.get("uid", "") or node.get("id", "")).strip() or f"node-{process_index}-{node_index}"
                node_id = str(node.get("id", "") or node.get("uid", "")).strip() or node_uid
                node_name = str(node.get("name", "")).strip()
                node_refs: list[dict] = []
                node_sources = node.get("prototypeFiles", [])
                if not isinstance(node_sources, list):
                    node_sources = []
                for prototype_index, prototype in enumerate(node_sources, start=1):
                    normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
                    stored_attachment, current_version_uid = self._store_attachment_entry(
                        document_uid,
                        normalized,
                        package_dir=package_dir,
                        source_package_dir=source_package_dir,
                        owner_type="node",
                        owner_uid=node_uid,
                        owner_id=node_id,
                        owner_name=node_name,
                        attachment_index=(process_index * 100000) + (node_index * 1000) + prototype_index,
                        existing_attachment=existing_attachments_by_uid.get(str(normalized.get("uid", "")).strip()),
                        fallback_uploaded_at=fallback_uploaded_at,
                    )
                    attachments_by_uid[stored_attachment["uid"]] = stored_attachment
                    node_refs.append(
                        {
                            "uid": stored_attachment["uid"],
                            "versionUid": current_version_uid,
                        }
                    )
                node["prototypeFiles"] = node_refs
        package_dir.mkdir(parents=True, exist_ok=True)
        self._manifest_path(package_dir).parent.mkdir(parents=True, exist_ok=True)
        self._manifest_path(package_dir).write_text(
            json.dumps(canonical_document(manifest_document, skip_migrate=True), ensure_ascii=False, indent=2),
            "utf-8",
        )
        self._package_markdown_path(package_dir, safe_name).write_text(
            self.exporter.export(migrated_document),
            "utf-8",
        )
        self._remove_stale_package_markdown_files(package_dir, safe_name)
        if attachments_by_uid or self._attachment_index_path(document_uid, package_dir).exists():
            self._write_attachment_index(document_uid, attachments_by_uid, package_dir)
        return self._load_package_dir(package_dir)

    def _load_package_dir(self, package_dir: Path) -> dict:
        manifest_path = self._manifest_path(package_dir)
        if not manifest_path.is_file():
            # 过渡期兼容：根目录 manifest.json
            manifest_path = package_dir / PACKAGE_MANIFEST_NAME
        if not manifest_path.is_file():
            raise FileNotFoundError(str(package_dir))
        raw_document = json.loads(manifest_path.read_text("utf-8"))
        document = deepcopy(raw_document if isinstance(raw_document, dict) else {})
        document_uid = self._document_uid(document)
        attachments_by_uid = self._load_attachment_index(document_uid, package_dir)
        for process_index, process in enumerate(document.get("processes", []), start=1):
            prototype_entries: list[dict] = []
            prototype_sources = process.get("prototypeFiles", [])
            if not isinstance(prototype_sources, list):
                prototype_sources = []
            for prototype_index, prototype in enumerate(prototype_sources, start=1):
                normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
                attachment_uid = str(normalized.get("uid", "")).strip()
                version_uid = str(normalized.get("versionUid", "")).strip()
                attachment_meta = attachments_by_uid.get(attachment_uid)
                if attachment_uid and version_uid and attachment_meta:
                    prototype_entries.append(self._build_loaded_attachment_entry(attachment_meta, version_uid, document_uid, package_dir))
                    continue

                prototype_name = str(normalized.get("name", "")).strip() or f"原型{prototype_index}.html"
                content_type = str(normalized.get("contentType", "text/html")).strip() or "text/html"
                attachment_key = str(normalized.get("attachmentKey", "")).strip()
                content = ""
                uploaded_at = ""
                if attachment_key:
                    attachment_path = self._attachment_path(document_uid, attachment_key)
                    if attachment_path.is_file():
                        content = attachment_path.read_text("utf-8")
                        uploaded_at = self._format_uploaded_at(attachment_path.stat().st_mtime)
                if not content:
                    relative_path = str(normalized.get("path", "")).strip()
                    relative_file = self._resolve_relative_path(package_dir, relative_path) if relative_path else None
                    if relative_file and relative_file.is_file():
                        content = relative_file.read_text("utf-8")
                        uploaded_at = self._format_uploaded_at(relative_file.stat().st_mtime)
                    else:
                        content = str(normalized.get("content", ""))
                version_uid = str(normalized.get("versionUid", "")).strip() or f"{attachment_uid or f'proto-{prototype_index}'}-v1"
                prototype_entries.append(
                    {
                        "uid": attachment_uid or str(normalized.get("uid", "")).strip() or f"proto-{prototype_index}",
                        "name": prototype_name,
                        "versionUid": version_uid,
                        "content": content,
                        "contentType": content_type,
                        "uploadedAt": uploaded_at or str(normalized.get("uploadedAt", "")).strip(),
                        "versions": [
                            {
                                "uid": version_uid,
                                "number": 1,
                                "name": prototype_name,
                                "content": content,
                                "contentType": content_type,
                                "uploadedAt": uploaded_at or str(normalized.get("uploadedAt", "")).strip(),
                            }
                        ],
                    }
                )
            process["prototypeFiles"] = prototype_entries
            for node_index, node in enumerate(process.get("nodes", []) if isinstance(process.get("nodes", []), list) else [], start=1):
                node_entries: list[dict] = []
                node_sources = node.get("prototypeFiles", [])
                if not isinstance(node_sources, list):
                    node_sources = []
                for prototype_index, prototype in enumerate(node_sources, start=1):
                    normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
                    attachment_uid = str(normalized.get("uid", "")).strip()
                    version_uid = str(normalized.get("versionUid", "")).strip()
                    attachment_meta = attachments_by_uid.get(attachment_uid)
                    if attachment_uid and version_uid and attachment_meta:
                        node_entries.append(self._build_loaded_attachment_entry(attachment_meta, version_uid, document_uid, package_dir))
                        continue

                    prototype_name = str(normalized.get("name", "")).strip() or f"节点附件{prototype_index}.html"
                    content_type = str(normalized.get("contentType", "text/html")).strip() or "text/html"
                    content = str(normalized.get("content", ""))
                    version_uid = version_uid or f"{attachment_uid or f'node-proto-{node_index}-{prototype_index}'}-v1"
                    node_entries.append(
                        {
                            "uid": attachment_uid or str(normalized.get("uid", "")).strip() or f"node-proto-{node_index}-{prototype_index}",
                            "name": prototype_name,
                            "versionUid": version_uid,
                            "content": content,
                            "contentType": content_type,
                            "uploadedAt": str(normalized.get("uploadedAt", "")).strip(),
                            "versions": [
                                {
                                    "uid": version_uid,
                                    "number": 1,
                                    "name": prototype_name,
                                    "content": content,
                                    "contentType": content_type,
                                    "uploadedAt": str(normalized.get("uploadedAt", "")).strip(),
                                }
                            ],
                        }
                    )
                node["prototypeFiles"] = node_entries
        return canonical_document(document)

    def _resolve_relative_path(self, base_dir: Path, relative_path: str) -> Path | None:
        candidate = (base_dir / relative_path).resolve()
        base = base_dir.resolve()
        try:
            candidate.relative_to(base)
        except ValueError:
            return None
        return candidate

    def _document_uid(self, document: dict) -> str:
        meta = document.get("meta", {}) if isinstance(document, dict) else {}
        return self._safe_path_component(str(meta.get("document_uid", "")).strip(), "document")

    def _ensure_attachment(
        self,
        document_uid: str,
        prototype_name: str,
        content: str,
        content_type: str,
        *,
        preferred_key: str = "",
    ) -> str:
        attachment_bytes = str(content or "").encode("utf-8")
        if preferred_key:
            preferred_path = self._attachment_path(document_uid, preferred_key)
            if preferred_path.is_file() and preferred_path.read_bytes() == attachment_bytes:
                return preferred_key
        attachment_key = self._build_attachment_key(prototype_name, attachment_bytes, content_type)
        attachment_path = self._attachment_path(document_uid, attachment_key)
        if attachment_path.is_file():
            if attachment_path.read_bytes() == attachment_bytes:
                return attachment_key
            attachment_key = self._build_conflicted_attachment_key(prototype_name, attachment_bytes, content_type)
            attachment_path = self._attachment_path(document_uid, attachment_key)
        if not attachment_path.exists():
            attachment_path.parent.mkdir(parents=True, exist_ok=True)
            attachment_path.write_bytes(attachment_bytes)
        return attachment_key

    def _build_attachment_key(self, prototype_name: str, attachment_bytes: bytes, content_type: str) -> str:
        return self._build_attachment_filename(prototype_name, content_type)

    def _build_conflicted_attachment_key(self, prototype_name: str, attachment_bytes: bytes, content_type: str) -> str:
        base_name = self._build_attachment_filename(prototype_name, content_type)
        digest = hashlib.sha256(attachment_bytes).hexdigest()[:12]
        base_path = Path(base_name)
        return f"{base_path.stem}__{digest}{base_path.suffix}"

    def _build_attachment_filename(self, prototype_name: str, content_type: str) -> str:
        extension = self._guess_attachment_extension(prototype_name, content_type)
        raw_name = Path(str(prototype_name or "").strip()).name
        safe_name = self._safe_path_component(raw_name, f"attachment{extension}")
        if Path(safe_name).suffix:
            return safe_name
        return f"{safe_name}{extension}"

    def _build_export_attachment_path(
        self,
        used_relative_paths: set[str],
        process_uid: str,
        prototype_name: str,
        content_type: str,
        prototype_index: int,
    ) -> Path:
        base_name = self._build_attachment_filename(
            prototype_name or f"prototype-{prototype_index}.html",
            content_type,
        )
        base_path = Path(base_name)
        counter = 1
        while True:
            candidate_name = base_name if counter == 1 else f"{base_path.stem}__{counter}{base_path.suffix}"
            relative_path = Path(EXPORT_ATTACHMENTS_DIR_NAME) / process_uid / candidate_name
            if relative_path.as_posix() not in used_relative_paths:
                return relative_path
            counter += 1

    def _guess_attachment_extension(self, prototype_name: str, content_type: str) -> str:
        suffix = Path(str(prototype_name or "").strip()).suffix.strip()
        if suffix:
            return suffix if suffix.startswith(".") else f".{suffix}"
        mime_type = str(content_type or "").split(";", 1)[0].strip().lower()
        guessed = mimetypes.guess_extension(mime_type) or ""
        if mime_type == "text/html":
            return ".html"
        return guessed or ".bin"

    def _remove_legacy_workspace_files(self, name: str) -> None:
        self._legacy_json_path(name).unlink(missing_ok=True)
        self._legacy_markdown_path(name).unlink(missing_ok=True)

    def _migrate_legacy_json_to_package(self, json_path: Path, target_dir: Path, name: str) -> bool:
        if not json_path.exists() or target_dir.exists():
            return False
        self.temp_dir.mkdir(exist_ok=True)
        temp_dir = self.temp_dir / f"{target_dir.name}.tmp-{self._timestamp()}"
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
        try:
            self._write_package_dir(temp_dir, name, self.load_path(json_path))
            shutil.move(str(temp_dir), str(target_dir))
            json_path.unlink(missing_ok=True)
            json_path.with_suffix(".md").unlink(missing_ok=True)
            return True
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)

    def _trim_history(self, target_dir: Path) -> None:
        entries = self._history_snapshot_entries(target_dir)
        if not entries:
            return
        now = datetime.now()
        delete_paths: set[Path] = set()

        manual_entries = [entry for entry in entries if entry["meta"].get("kind", "manual") != "auto"]
        manual_entries.sort(key=lambda item: item["timestamp"], reverse=True)
        manual_keep_count = max(0, min(int(self.manual_history_keep_count), int(self.history_limit)))
        manual_keep_days = max(0, int(self.manual_history_keep_days))
        for index, entry in enumerate(manual_entries):
            age = now - entry["timestamp"]
            if index < manual_keep_count or age <= timedelta(days=manual_keep_days):
                continue
            delete_paths.add(entry["path"])

        auto_entries = [entry for entry in entries if entry["meta"].get("kind") == "auto"]
        daily_groups: dict[str, list[dict]] = {}
        for entry in auto_entries:
            age = now - entry["timestamp"]
            if age > timedelta(days=self.auto_history_daily_days):
                delete_paths.add(entry["path"])
            elif age > timedelta(days=self.auto_history_recent_days):
                daily_groups.setdefault(entry["timestamp"].strftime("%Y-%m-%d"), []).append(entry)
        for group in daily_groups.values():
            group.sort(key=lambda item: item["timestamp"])
            keep = {group[0]["path"], group[-1]["path"]}
            for entry in group:
                if entry["path"] not in keep:
                    delete_paths.add(entry["path"])

        for snapshot in delete_paths:
            self._delete_history_snapshot_path(snapshot)

    def _delete_history_snapshot_path(self, snapshot: Path) -> None:
        if snapshot.is_dir():
            shutil.rmtree(snapshot, ignore_errors=True)
        else:
            snapshot.unlink(missing_ok=True)
            snapshot.with_suffix(".md").unlink(missing_ok=True)
            snapshot.with_suffix(".snapshot.json").unlink(missing_ok=True)

    def _delete_trash_entry_path(self, entry: Path) -> None:
        if entry.is_dir():
            shutil.rmtree(entry, ignore_errors=True)
        elif entry.is_file():
            entry.unlink(missing_ok=True)
            if entry.suffix == ".json":
                entry.with_suffix(".md").unlink(missing_ok=True)

    def _parse_trash_entry_name(self, entry_name: str) -> tuple[str, str]:
        safe_entry_name = self._sanitize_workspace_entry(entry_name)
        match = TRASH_ENTRY_RE.match(Path(safe_entry_name).stem)
        if not match:
            raise InvalidWorkspaceEntryError("回收站记录不合法")
        return match.group("name"), match.group("timestamp")

    def _safe_path_component(self, value: str, fallback: str) -> str:
        normalized = INVALID_PATH_COMPONENT_RE.sub("_", str(value or "").strip())
        normalized = normalized.strip(" .")
        return normalized or fallback

    def _timestamp(self) -> str:
        return datetime.now().strftime("%Y%m%d-%H%M%S-%f")
