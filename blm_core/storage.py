from __future__ import annotations

import hashlib
import io
import json
import mimetypes
import re
import shutil
import zipfile
from copy import deepcopy
from datetime import datetime
from pathlib import Path

from blm_core.document import create_empty_document, migrate_document
from blm_core.markdown import MarkdownExporter


TRASH_ENTRY_RE = re.compile(r"^(?P<name>.+)-(?P<timestamp>\d{8}-\d{6}-\d{6})$")
INVALID_PATH_COMPONENT_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')
PACKAGE_MANIFEST_NAME = "manifest.json"
ATTACHMENTS_DIR_NAME = ".attachments"
ATTACHMENTS_INDEX_NAME = "attachments.json"
EXPORT_ATTACHMENTS_DIR_NAME = "attachments"


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
        migrated_document = migrate_document(document)
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
        self.history_dir = self.workspace_dir / ".history"
        self.trash_dir = self.workspace_dir / ".trash"
        self.attachments_dir = self.workspace_dir / ATTACHMENTS_DIR_NAME
        self.history_dir.mkdir(exist_ok=True)
        self.trash_dir.mkdir(exist_ok=True)
        self.attachments_dir.mkdir(exist_ok=True)
        self.history_limit = 20

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

    def list_history(self, name: str) -> list[dict]:
        safe_name = self._validate_name(name)
        target_dir = self.history_dir / safe_name
        if not target_dir.exists():
            return []
        entries: list[dict] = []
        seen_ids: set[str] = set()
        for snapshot in sorted(target_dir.iterdir(), key=lambda item: item.name, reverse=True):
            if snapshot.is_dir() and self._is_package_dir(snapshot):
                snapshot_id = snapshot.name
            elif snapshot.is_file() and snapshot.suffix == ".json":
                snapshot_id = snapshot.stem
            else:
                continue
            if snapshot_id in seen_ids:
                continue
            seen_ids.add(snapshot_id)
            entries.append(
                {
                    "id": snapshot_id,
                    "label": snapshot_id,
                    "doc_name": safe_name,
                }
            )
        return entries

    def restore_history(self, name: str, snapshot_id: str) -> dict:
        document = self._load_history_snapshot(self._validate_name(name), snapshot_id)
        return self.save(name, document)

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
        entry_path = self.trash_dir / safe_entry_id
        original_name, _ = self._parse_trash_entry_name(safe_entry_id)
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

    def load(self, name: str) -> dict:
        safe_name = self._validate_name(name)
        package_dir = self._package_dir(safe_name)
        if self._is_package_dir(package_dir):
            return self._load_package_dir(package_dir)
        legacy_json_path = self._legacy_json_path(safe_name)
        if legacy_json_path.exists():
            return self.load_path(legacy_json_path)
        raise FileNotFoundError(name)

    def save(self, name: str, document: dict) -> dict:
        safe_name = self._validate_name(name)
        if self._workspace_document_exists(safe_name):
            self._snapshot_document(safe_name)
        saved_document = self._save_workspace_document(safe_name, document)
        self._remove_legacy_workspace_files(safe_name)
        return saved_document

    def rename(
        self,
        old_name: str,
        new_name: str,
        document: dict,
        *,
        overwrite: bool = False,
    ) -> tuple[str, dict]:
        old_safe_name = self._validate_name(old_name)
        new_safe_name = self._validate_name(new_name)
        if old_safe_name == new_safe_name:
            return new_safe_name, self.save(new_safe_name, document)
        if self._workspace_document_exists(new_safe_name) and not overwrite:
            raise FileExistsError(new_safe_name)
        if overwrite and self._workspace_document_exists(new_safe_name):
            saved_document = self.save(new_safe_name, document)
        else:
            saved_document = self._save_workspace_document(new_safe_name, document)
            self._remove_legacy_workspace_files(new_safe_name)
        self._move_workspace_document_to_trash(old_safe_name, self._timestamp())
        return new_safe_name, saved_document

    def create(self, name: str) -> dict:
        safe_name = self._validate_name(name)
        if self._workspace_document_exists(safe_name):
            raise FileExistsError(name)
        return self._save_workspace_document(safe_name, create_empty_document(safe_name))

    def delete(self, name: str) -> None:
        self._move_workspace_document_to_trash(self._validate_name(name), self._timestamp())

    def export_markdown(self, name: str) -> str:
        return self.exporter.export(self.load(name))

    def build_export_bundle(self, name: str) -> tuple[str, bytes]:
        safe_name = self._validate_name(name)
        document = migrate_document(self.load(safe_name))
        bundle_manifest = deepcopy(document)
        packaged_files: list[tuple[Path, bytes]] = []
        export_attachments: list[dict] = []
        for process_index, process in enumerate(bundle_manifest.get("processes", []), start=1):
            prototype_refs: list[dict] = []
            prototype_sources = process.get("prototypeFiles", [])
            if not isinstance(prototype_sources, list):
                prototype_sources = []
            for prototype_index, prototype in enumerate(prototype_sources, start=1):
                normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
                attachment_uid = str(normalized.get("uid", "")).strip() or f"attachment-{process_index}-{prototype_index}"
                versions_source = normalized.get("versions", [])
                if not isinstance(versions_source, list) or not versions_source:
                    versions_source = [
                        {
                            "uid": str(normalized.get("versionUid", "")).strip() or f"{attachment_uid}-v1",
                            "number": 1,
                            "name": str(normalized.get("name", "")).strip() or f"原型{prototype_index}.html",
                            "content": str(normalized.get("content", "")),
                            "contentType": str(normalized.get("contentType", "text/html")).strip() or "text/html",
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
                    relative_path = Path(EXPORT_ATTACHMENTS_DIR_NAME) / self._attachment_version_relative_path(
                        attachment_uid,
                        version_number,
                        version_name,
                        content_type,
                    )
                    packaged_files.append((relative_path, str(raw_version.get("content", "")).encode("utf-8")))
                    export_versions.append(
                        {
                            "uid": version_uid,
                            "number": version_number,
                            "name": version_name,
                            "contentType": content_type,
                            "uploadedAt": str(raw_version.get("uploadedAt", "")).strip(),
                            "path": relative_path.as_posix(),
                        }
                    )
                export_attachments.append(
                    {
                        "uid": attachment_uid,
                        "name": str(normalized.get("name", "")).strip() or export_versions[-1]["name"],
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
                self.exporter.export(document).encode("utf-8"),
            )
        )
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for relative_path, payload in packaged_files:
                archive.writestr(f"{safe_name}/{relative_path.as_posix()}", payload)
        return f"{safe_name}.zip", buffer.getvalue()

    def migrate_workspace_layout(self) -> dict[str, int]:
        result = {"documents": 0, "history": 0, "trash": 0}
        for legacy_json_path in sorted(self.workspace_dir.glob("*.json")):
            if self._migrate_legacy_json_to_package(
                legacy_json_path,
                self._package_dir(legacy_json_path.stem),
                legacy_json_path.stem,
            ):
                result["documents"] += 1
        for history_root in sorted(path for path in self.history_dir.iterdir() if path.is_dir()):
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
        return package_dir / PACKAGE_MANIFEST_NAME

    def _package_markdown_path(self, package_dir: Path, name: str) -> Path:
        return package_dir / f"{self._validate_name(name)}.md"

    def _legacy_json_path(self, name: str) -> Path:
        return self.workspace_dir / f"{self._validate_name(name)}.json"

    def _legacy_markdown_path(self, name: str) -> Path:
        return self.workspace_dir / f"{self._validate_name(name)}.md"

    def _attachment_root_for_doc(self, document_uid: str) -> Path:
        return self.attachments_dir / self._safe_path_component(document_uid, "doc")

    def _attachment_path(self, document_uid: str, attachment_key: str) -> Path:
        safe_key = Path(str(attachment_key or "").strip()).name
        return self._attachment_root_for_doc(document_uid) / self._safe_path_component(safe_key, "attachment.bin")

    def _attachment_index_path(self, document_uid: str) -> Path:
        return self._attachment_root_for_doc(document_uid) / ATTACHMENTS_INDEX_NAME

    def _attachment_version_relative_path(
        self,
        attachment_uid: str,
        version_number: int,
        version_name: str,
        content_type: str,
    ) -> Path:
        safe_attachment_uid = self._safe_path_component(attachment_uid, "attachment")
        safe_name = self._build_attachment_filename(version_name, content_type)
        return Path(safe_attachment_uid) / f"v{max(int(version_number or 1), 1)}__{safe_name}"

    def _attachment_version_path(self, document_uid: str, relative_path: str | Path) -> Path:
        root = self._attachment_root_for_doc(document_uid)
        candidate = (root / Path(str(relative_path or "").strip())).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError as exc:
            raise InvalidWorkspaceEntryError("附件路径不合法") from exc
        return candidate

    def _load_attachment_index(self, document_uid: str) -> dict[str, dict]:
        index_path = self._attachment_index_path(document_uid)
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
                ).as_posix()
                normalized_versions.append(
                    {
                        "uid": str(raw_version.get("uid", "")).strip() or f"{attachment_uid}-v{version_number}",
                        "number": version_number,
                        "name": version_name,
                        "contentType": content_type,
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
                "versions": normalized_versions,
            }
        return attachments_by_uid

    def _write_attachment_index(self, document_uid: str, attachments_by_uid: dict[str, dict]) -> None:
        root = self._attachment_root_for_doc(document_uid)
        root.mkdir(parents=True, exist_ok=True)
        serializable_attachments: list[dict] = []
        for attachment_uid in sorted(attachments_by_uid):
            attachment = attachments_by_uid[attachment_uid]
            versions = sorted(attachment.get("versions", []), key=lambda item: (item.get("number", 0), item.get("uid", "")))
            serializable_attachments.append(
                {
                    "uid": attachment_uid,
                    "name": str(attachment.get("name", "")).strip(),
                    "versions": [
                        {
                            "uid": str(version.get("uid", "")).strip(),
                            "number": int(version.get("number") or version_index),
                            "name": str(version.get("name", "")).strip(),
                            "contentType": str(version.get("contentType", "text/html")).strip() or "text/html",
                            "uploadedAt": str(version.get("uploadedAt", "")).strip(),
                            "path": str(version.get("path", "")).strip(),
                        }
                        for version_index, version in enumerate(versions, start=1)
                    ],
                }
            )
        self._attachment_index_path(document_uid).write_text(
            json.dumps({"attachments": serializable_attachments}, ensure_ascii=False, indent=2),
            "utf-8",
        )

    def _store_attachment_entry(
        self,
        document_uid: str,
        prototype: dict,
        *,
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
            uploaded_at = (
                str(raw_version.get("uploadedAt", "")).strip()
                or str(existing_versions.get(version_uid, {}).get("uploadedAt", "")).strip()
                or fallback_uploaded_at
            )
            relative_path = (
                str(existing_versions.get(version_uid, {}).get("path", "")).strip()
                or self._attachment_version_relative_path(
                    attachment_uid,
                    version_number,
                    version_name,
                    content_type,
                ).as_posix()
            )
            absolute_path = self._attachment_version_path(document_uid, relative_path)
            absolute_path.parent.mkdir(parents=True, exist_ok=True)
            absolute_path.write_text(str(raw_version.get("content", "")), "utf-8")
            stored_versions.append(
                {
                    "uid": version_uid,
                    "number": version_number,
                    "name": version_name,
                    "contentType": content_type,
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
            "versions": stored_versions,
        }, current_version_uid

    def _load_attachment_content(self, document_uid: str, version_meta: dict) -> str:
        relative_path = str(version_meta.get("path", "")).strip()
        if not relative_path:
            return ""
        version_path = self._attachment_version_path(document_uid, relative_path)
        if not version_path.is_file():
            return ""
        return version_path.read_text("utf-8")

    def _build_loaded_attachment_entry(self, attachment_meta: dict, version_uid: str, document_uid: str) -> dict:
        versions: list[dict] = []
        for version in attachment_meta.get("versions", []):
            version_content = self._load_attachment_content(document_uid, version)
            versions.append(
                {
                    "uid": str(version.get("uid", "")).strip(),
                    "number": int(version.get("number") or len(versions) + 1),
                    "name": str(version.get("name", "")).strip(),
                    "content": version_content,
                    "contentType": str(version.get("contentType", "text/html")).strip() or "text/html",
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
                "content": "",
                "contentType": "text/html",
                "uploadedAt": "",
                "versions": [],
            }
        return {
            "uid": str(attachment_meta.get("uid", "")).strip() or "attachment",
            "name": str(attachment_meta.get("name", "")).strip() or current_version["name"],
            "versionUid": current_version["uid"],
            "content": current_version["content"],
            "contentType": current_version["contentType"],
            "uploadedAt": current_version["uploadedAt"],
            "versions": versions,
        }

    def _format_uploaded_at(self, timestamp: float | None = None) -> str:
        moment = datetime.fromtimestamp(timestamp) if timestamp else datetime.now()
        return moment.strftime("%Y-%m-%d %H:%M:%S")

    def _history_snapshot_dir(self, name: str, snapshot_id: str) -> Path:
        return self.history_dir / self._validate_name(name) / self._sanitize_workspace_entry(snapshot_id)

    def _history_snapshot_json_path(self, name: str, snapshot_id: str) -> Path:
        return self.history_dir / self._validate_name(name) / f"{self._sanitize_workspace_entry(snapshot_id)}.json"

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
        return path.is_dir() and self._manifest_path(path).is_file()

    def _workspace_document_exists(self, name: str) -> bool:
        safe_name = self._validate_name(name)
        return self._is_package_dir(self._package_dir(safe_name)) or self._legacy_json_path(safe_name).exists()

    def _snapshot_document(self, name: str) -> None:
        safe_name = self._validate_name(name)
        target_root = self.history_dir / safe_name
        snapshot_dir = target_root / self._timestamp()
        target_root.mkdir(parents=True, exist_ok=True)
        package_dir = self._package_dir(safe_name)
        legacy_json_path = self._legacy_json_path(safe_name)
        if self._is_package_dir(package_dir):
            shutil.copytree(package_dir, snapshot_dir)
        elif legacy_json_path.exists():
            self._write_package_dir(snapshot_dir, safe_name, self.load_path(legacy_json_path))
        else:
            return
        self._trim_history(target_root)

    def _load_history_snapshot(self, name: str, snapshot_id: str) -> dict:
        snapshot_dir = self._history_snapshot_dir(name, snapshot_id)
        if self._is_package_dir(snapshot_dir):
            return self._load_package_dir(snapshot_dir)
        snapshot_json_path = self._history_snapshot_json_path(name, snapshot_id)
        if snapshot_json_path.exists():
            return self.load_raw_path(snapshot_json_path)
        raise FileNotFoundError(snapshot_id)

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
        temp_dir = self.workspace_dir / f".{safe_name}.tmp-{self._timestamp()}"
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
        try:
            saved_document = self._write_package_dir(temp_dir, safe_name, document)
            if package_dir.exists():
                shutil.rmtree(package_dir, ignore_errors=True)
            shutil.move(str(temp_dir), str(package_dir))
            return saved_document
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)

    def _write_package_dir(self, package_dir: Path, name: str, document: dict) -> dict:
        safe_name = self._validate_name(name)
        migrated_document = migrate_document(document)
        manifest_document = deepcopy(migrated_document)
        document_uid = self._document_uid(manifest_document)
        attachments_by_uid = self._load_attachment_index(document_uid)
        fallback_uploaded_at = self._format_uploaded_at()
        for process_index, process in enumerate(manifest_document.get("processes", []), start=1):
            prototype_refs: list[dict] = []
            prototype_sources = process.get("prototypeFiles", [])
            if not isinstance(prototype_sources, list):
                prototype_sources = []
            for prototype_index, prototype in enumerate(prototype_sources, start=1):
                normalized = prototype if isinstance(prototype, dict) else {"name": str(prototype or "").strip()}
                stored_attachment, current_version_uid = self._store_attachment_entry(
                    document_uid,
                    normalized,
                    attachment_index=(process_index * 1000) + prototype_index,
                    existing_attachment=attachments_by_uid.get(str(normalized.get("uid", "")).strip()),
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
        package_dir.mkdir(parents=True, exist_ok=True)
        self._manifest_path(package_dir).write_text(
            json.dumps(manifest_document, ensure_ascii=False, indent=2),
            "utf-8",
        )
        self._package_markdown_path(package_dir, safe_name).write_text(
            self.exporter.export(migrated_document),
            "utf-8",
        )
        self._write_attachment_index(document_uid, attachments_by_uid)
        return migrated_document

    def _load_package_dir(self, package_dir: Path) -> dict:
        manifest_path = self._manifest_path(package_dir)
        if not manifest_path.exists():
            raise FileNotFoundError(str(package_dir))
        raw_document = json.loads(manifest_path.read_text("utf-8"))
        document = deepcopy(raw_document if isinstance(raw_document, dict) else {})
        document_uid = self._document_uid(document)
        attachments_by_uid = self._load_attachment_index(document_uid)
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
                    prototype_entries.append(self._build_loaded_attachment_entry(attachment_meta, version_uid, document_uid))
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
        return migrate_document(document)

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
        temp_dir = target_dir.parent / f".{target_dir.name}.tmp-{self._timestamp()}"
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
        snapshots: list[Path] = []
        for entry in target_dir.iterdir():
            if entry.is_dir() and self._is_package_dir(entry):
                snapshots.append(entry)
            elif entry.is_file() and entry.suffix == ".json":
                snapshots.append(entry)
        snapshots.sort(key=lambda item: item.name if item.is_dir() else item.stem)
        overflow = len(snapshots) - self.history_limit
        if overflow <= 0:
            return
        for snapshot in snapshots[:overflow]:
            if snapshot.is_dir():
                shutil.rmtree(snapshot, ignore_errors=True)
            else:
                snapshot.unlink(missing_ok=True)
                snapshot.with_suffix(".md").unlink(missing_ok=True)

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
