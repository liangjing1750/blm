from __future__ import annotations

import json
import threading
import time
import uuid
from copy import deepcopy
from pathlib import Path


FEEDBACK_CATEGORIES = {"需求功能", "体验改进", "轻微缺陷", "严重问题"}
FEEDBACK_STATUSES = {"待处理", "处理中", "已解决", "已关闭"}
LEGACY_FEEDBACK_CATEGORY_MAP = {
    "需求": "需求功能",
    "建议": "体验改进",
    "问题": "体验改进",
    "缺陷": "轻微缺陷",
}
MAX_FEEDBACK_ATTACHMENT_BYTES = 20 * 1024 * 1024


class FeedbackStore:
    """Small hidden store for product feedback.

    Feedback is collaborative operational data, not a BLM model document. Keeping it
    outside the normal document save path avoids model normalization and last-write
    races when several users submit feedback at the same time.
    """

    def __init__(self, workspace_dir: Path):
        self.workspace_dir = Path(workspace_dir)
        self.root = self.workspace_dir / ".user_ask"
        self.attachments_root = self.root / "attachments"
        self.path = self.root / "feedback.json"
        self._lock = threading.RLock()

    def load(self) -> dict:
        with self._lock:
            document = self._read_unlocked()
            self._write_unlocked(document)
            return deepcopy(document)

    def add_attachment(
        self,
        item_uid: str,
        filename: str,
        content_type: str,
        payload: bytes,
        message_uid: str = "",
        user: dict | None = None,
    ) -> dict:
        if not isinstance(payload, (bytes, bytearray)):
            raise ValueError("attachment payload is required")
        data = bytes(payload)
        if not data:
            raise ValueError("attachment payload is required")
        if len(data) > MAX_FEEDBACK_ATTACHMENT_BYTES:
            raise ValueError("attachment is too large")
        item_uid = str(item_uid or "").strip()
        if not item_uid:
            raise ValueError("feedback uid is required")
        if "/" in item_uid or "\\" in item_uid or item_uid in {".", ".."}:
            raise ValueError("invalid feedback uid")
        safe_filename = _safe_filename(filename)
        attachment_uid = f"fbatt-{uuid.uuid4().hex}"
        stored_name = f"{attachment_uid}__{safe_filename}"
        with self._lock:
            document = self._read_unlocked()
            item = self._find_item_unlocked(document, {"uid": item_uid}, {})
            message = self._find_message_for_attachment(item, message_uid)
            item_dir = self.attachments_root / item_uid
            item_dir.mkdir(parents=True, exist_ok=True)
            (item_dir / stored_name).write_bytes(data)
            attachments = _attachments(message)
            attachments.append(
                {
                    "uid": attachment_uid,
                    "filename": safe_filename,
                    "storedName": stored_name,
                    "size": len(data),
                    "contentType": str(content_type or "application/octet-stream").strip() or "application/octet-stream",
                    "createdAt": _now(),
                    "author": _user_name(user or {}),
                }
            )
            document["updatedAt"] = _now()
            self._write_unlocked(document)
            return deepcopy(document)

    def delete_attachment(self, item_uid: str, attachment_uid: str, message_uid: str = "") -> dict:
        item_uid = str(item_uid or "").strip()
        attachment_uid = str(attachment_uid or "").strip()
        message_uid = str(message_uid or "").strip()
        if not item_uid or not attachment_uid:
            raise ValueError("feedback attachment is required")
        if "/" in item_uid or "\\" in item_uid or item_uid in {".", ".."}:
            raise ValueError("invalid feedback uid")
        with self._lock:
            document = self._read_unlocked()
            item = self._find_item_unlocked(document, {"uid": item_uid}, {})
            containers = []
            if message_uid:
                containers.append(self._find_message_for_attachment(item, message_uid))
            else:
                containers.extend(_messages(item))
                containers.append(item)
            removed = None
            for container in containers:
                attachments = _attachments(container)
                next_attachments = []
                for attachment in attachments:
                    if str(attachment.get("uid") or "") == attachment_uid:
                        removed = attachment
                    else:
                        next_attachments.append(attachment)
                if removed is not None:
                    container["attachments"] = next_attachments
                    break
            if removed is None:
                raise FileNotFoundError("feedback attachment not found")
            stored_name = str(removed.get("storedName") or "").strip()
            if stored_name and "/" not in stored_name and "\\" not in stored_name:
                try:
                    (self.attachments_root / item_uid / stored_name).unlink(missing_ok=True)
                except OSError:
                    pass
            document["updatedAt"] = _now()
            self._write_unlocked(document)
            return deepcopy(document)

    def read_attachment(self, item_uid: str, attachment_uid: str) -> tuple[bytes, dict]:
        item_uid = str(item_uid or "").strip()
        attachment_uid = str(attachment_uid or "").strip()
        if "/" in item_uid or "\\" in item_uid or item_uid in {".", ".."}:
            raise FileNotFoundError("feedback attachment not found")
        with self._lock:
            document = self._read_unlocked()
            item = self._find_item_unlocked(document, {"uid": item_uid}, {})
            attachment = next(
                (
                    entry
                    for container in [*_messages(item), item]
                    for entry in _attachments(container)
                    if str(entry.get("uid") or "") == attachment_uid
                ),
                None,
            )
            if attachment is None:
                raise FileNotFoundError("feedback attachment not found")
            stored_name = str(attachment.get("storedName") or "").strip()
            if not stored_name or "/" in stored_name or "\\" in stored_name:
                raise FileNotFoundError("feedback attachment not found")
            path = self.attachments_root / item_uid / stored_name
            if not path.is_file():
                raise FileNotFoundError("feedback attachment not found")
            return path.read_bytes(), deepcopy(attachment)

    def apply(self, payload: dict) -> dict:
        action = str(payload.get("action") or "").strip()
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        user = payload.get("user") if isinstance(payload.get("user"), dict) else {}
        with self._lock:
            document = self._read_unlocked()
            if action == "add":
                self._add_unlocked(document, data, user)
            elif action == "reply":
                self._reply_unlocked(document, payload, data, user)
            elif action == "update":
                self._update_unlocked(document, payload, data)
            elif action == "message":
                self._add_message_unlocked(document, payload, data, user)
            elif action == "editMessage":
                self._edit_message_unlocked(document, payload, data)
            elif action == "deleteAttachment":
                self._delete_attachment_unlocked(document, payload, data)
            else:
                return {"error": "unsupported feedback action"}
            document["updatedAt"] = _now()
            self._write_unlocked(document)
            return deepcopy(document)

    def _add_unlocked(self, document: dict, data: dict, user: dict) -> None:
        title = str(data.get("title") or "").strip()
        if not title:
            raise ValueError("title is required")
        item = {
            "uid": str(data.get("uid") or f"fb-{uuid.uuid4().hex}"),
            "author": _user_name(user),
            "createdAt": _now(),
            "category": _choice(data.get("category"), FEEDBACK_CATEGORIES, "体验改进"),
            "title": title,
            "description": str(data.get("description") or "").strip(),
            "status": "待处理",
            "reply": "",
            "repliedBy": "",
            "repliedAt": "",
            "messages": [],
            "attachments": [],
        }
        if item["description"]:
            item["messages"].append(_message(content=item["description"], user=user, floor=1))
        items = _items(document)
        if not any(existing.get("uid") == item["uid"] for existing in items):
            items.append(item)

    def _reply_unlocked(self, document: dict, payload: dict, data: dict, user: dict) -> None:
        uid = str(payload.get("uid") or data.get("uid") or "").strip()
        items = _items(document)
        item = next((entry for entry in items if str(entry.get("uid") or "") == uid), None)
        if item is None:
            index = payload.get("index")
            if isinstance(index, int) and 0 <= index < len(items):
                item = items[index]
        if item is None:
            raise KeyError("feedback item not found")
        item["reply"] = str(data.get("reply") or "").strip()
        item["status"] = _choice(data.get("status"), {"待处理", "处理中", "已解决", "已关闭"}, item.get("status") or "待处理")
        item["repliedBy"] = _user_name(user)
        item["repliedAt"] = _now()
        if item["reply"]:
            messages = _messages(item)
            messages.append(_message(content=item["reply"], user=user, floor=len(messages) + 1))

    def _update_unlocked(self, document: dict, payload: dict, data: dict) -> None:
        item = self._find_item_unlocked(document, payload, data)
        item["category"] = _choice(data.get("category"), FEEDBACK_CATEGORIES, item.get("category") or "体验改进")
        item["status"] = _choice(data.get("status"), FEEDBACK_STATUSES, item.get("status") or "待处理")
        if "description" in data:
            item["description"] = str(data.get("description") or "").strip()

    def _add_message_unlocked(self, document: dict, payload: dict, data: dict, user: dict) -> None:
        item = self._find_item_unlocked(document, payload, data)
        content = str(data.get("content") or "").strip()
        if not content:
            raise ValueError("message content is required")
        messages = _messages(item)
        messages.append(_message(content=content, user=user, floor=len(messages) + 1))

    def _edit_message_unlocked(self, document: dict, payload: dict, data: dict) -> None:
        item = self._find_item_unlocked(document, payload, data)
        message_uid = str(payload.get("messageUid") or data.get("messageUid") or "").strip()
        message = next((entry for entry in _messages(item) if str(entry.get("uid") or "") == message_uid), None)
        if message is None:
            raise KeyError("feedback message not found")
        content = str(data.get("content") or "").strip()
        if not content:
            raise ValueError("message content is required")
        message["content"] = content
        message["updatedAt"] = _now()

    def _delete_attachment_unlocked(self, document: dict, payload: dict, data: dict) -> None:
        item = self._find_item_unlocked(document, payload, data)
        attachment_uid = str(payload.get("attachmentUid") or data.get("attachmentUid") or "").strip()
        message_uid = str(payload.get("messageUid") or data.get("messageUid") or "").strip()
        if not attachment_uid:
            raise ValueError("feedback attachment is required")
        containers = [self._find_message_for_attachment(item, message_uid)] if message_uid else [*_messages(item), item]
        removed = None
        for container in containers:
            attachments = _attachments(container)
            next_attachments = []
            for attachment in attachments:
                if str(attachment.get("uid") or "") == attachment_uid:
                    removed = attachment
                else:
                    next_attachments.append(attachment)
            if removed is not None:
                container["attachments"] = next_attachments
                break
        if removed is None:
            raise FileNotFoundError("feedback attachment not found")
        stored_name = str(removed.get("storedName") or "").strip()
        item_uid = str(item.get("uid") or "").strip()
        if stored_name and item_uid and "/" not in stored_name and "\\" not in stored_name:
            try:
                (self.attachments_root / item_uid / stored_name).unlink(missing_ok=True)
            except OSError:
                pass

    def _find_message_for_attachment(self, item: dict, message_uid: str) -> dict:
        messages = _messages(item)
        target_uid = str(message_uid or "").strip()
        if target_uid:
            message = next((entry for entry in messages if str(entry.get("uid") or "") == target_uid), None)
            if message is None:
                raise KeyError("feedback message not found")
            return message
        if messages:
            return messages[0]
        message = _message(
            content=str(item.get("description") or item.get("title") or "").strip(),
            user={"name": item.get("author")},
            floor=1,
        )
        messages.append(message)
        return message

    def _find_item_unlocked(self, document: dict, payload: dict, data: dict) -> dict:
        uid = str(payload.get("uid") or data.get("uid") or "").strip()
        item = next((entry for entry in _items(document) if str(entry.get("uid") or "") == uid), None)
        if item is None:
            raise KeyError("feedback item not found")
        return item

    def _read_unlocked(self) -> dict:
        if self.path.is_file():
            try:
                data = json.loads(self.path.read_text("utf-8"))
                return _normalize_document(data)
            except (OSError, json.JSONDecodeError):
                pass
        legacy = self.root / "manifest.json"
        if legacy.is_file():
            try:
                data = json.loads(legacy.read_text("utf-8"))
                return _normalize_document(data)
            except (OSError, json.JSONDecodeError):
                pass
        return _normalize_document({})

    def _write_unlocked(self, document: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        payload = _normalize_document(document)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(self.path)


def _normalize_document(data: dict) -> dict:
    if not isinstance(data, dict):
        data = {}
    meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    items = data.get("items")
    if not isinstance(items, list):
        items = meta.get("feedbackItems") if isinstance(meta.get("feedbackItems"), list) else []
    normalized_items = []
    for item in items:
        if not isinstance(item, dict):
            continue
        normalized_items.append(_normalize_item(item))
    return {
        "meta": {
            "title": str(meta.get("title") or "反馈建议"),
            "domain": "feedback",
            "space": ".system",
        },
        "items": normalized_items,
        "updatedAt": str(data.get("updatedAt") or ""),
    }


def _items(document: dict) -> list[dict]:
    if not isinstance(document.get("items"), list):
        document["items"] = []
    return document["items"]


def _normalize_item(item: dict) -> dict:
    normalized = {
        "uid": str(item.get("uid") or f"fb-{uuid.uuid4().hex}"),
        "author": str(item.get("author") or "匿名"),
        "createdAt": str(item.get("createdAt") or ""),
        "category": _choice(item.get("category"), FEEDBACK_CATEGORIES, "体验改进"),
        "title": str(item.get("title") or "(无标题)"),
        "description": str(item.get("description") or ""),
        "status": _choice(item.get("status"), FEEDBACK_STATUSES, "待处理"),
        "reply": str(item.get("reply") or ""),
        "repliedBy": str(item.get("repliedBy") or ""),
        "repliedAt": str(item.get("repliedAt") or ""),
        "messages": [],
        "attachments": [],
    }
    raw_messages = item.get("messages") if isinstance(item.get("messages"), list) else []
    for index, raw in enumerate(raw_messages, 1):
        if not isinstance(raw, dict):
            continue
        content = str(raw.get("content") or "").strip()
        if not content:
            continue
        normalized["messages"].append(
            {
                "uid": str(raw.get("uid") or f"msg-{uuid.uuid4().hex}"),
                "floor": int(raw.get("floor") or index),
                "author": str(raw.get("author") or "匿名"),
                "createdAt": str(raw.get("createdAt") or ""),
                "updatedAt": str(raw.get("updatedAt") or ""),
                "content": content,
                "attachments": [
                    attachment
                    for attachment in (
                        _normalize_attachment(entry)
                        for entry in (raw.get("attachments") if isinstance(raw.get("attachments"), list) else [])
                    )
                    if attachment
                ],
            }
        )
    if not normalized["messages"] and normalized["description"]:
        normalized["messages"].append(
            {
                "uid": f"msg-{uuid.uuid4().hex}",
                "floor": 1,
                "author": normalized["author"],
                "createdAt": normalized["createdAt"],
                "updatedAt": "",
                "content": normalized["description"],
                "attachments": [],
            }
        )
    if normalized["reply"] and not any(message["content"] == normalized["reply"] for message in normalized["messages"]):
        normalized["messages"].append(
            {
                "uid": f"msg-{uuid.uuid4().hex}",
                "floor": len(normalized["messages"]) + 1,
                "author": normalized["repliedBy"] or "匿名",
                "createdAt": normalized["repliedAt"],
                "updatedAt": "",
                "content": normalized["reply"],
                "attachments": [],
            }
        )
    for index, message in enumerate(normalized["messages"], 1):
        message["floor"] = index
    raw_attachments = item.get("attachments") if isinstance(item.get("attachments"), list) else []
    legacy_attachments = []
    for raw in raw_attachments:
        if not isinstance(raw, dict):
            continue
        attachment = _normalize_attachment(raw)
        if attachment:
            legacy_attachments.append(attachment)
    if legacy_attachments:
        if not normalized["messages"]:
            normalized["messages"].append(
                {
                    "uid": f"msg-{uuid.uuid4().hex}",
                    "floor": 1,
                    "author": normalized["author"],
                    "createdAt": normalized["createdAt"],
                    "updatedAt": "",
                    "content": normalized["description"] or normalized["title"],
                    "attachments": [],
                }
            )
        normalized["messages"][0]["attachments"] = [
            *normalized["messages"][0].get("attachments", []),
            *legacy_attachments,
        ]
    return normalized


def _attachments(item: dict) -> list[dict]:
    if not isinstance(item.get("attachments"), list):
        item["attachments"] = []
    return item["attachments"]


def _normalize_attachment(raw: dict) -> dict | None:
    uid = str(raw.get("uid") or "").strip()
    filename = _safe_filename(raw.get("filename") or raw.get("name") or "attachment")
    stored_name = str(raw.get("storedName") or raw.get("stored_name") or "").strip()
    if not uid or not stored_name or "/" in stored_name or "\\" in stored_name:
        return None
    try:
        size = int(raw.get("size") or 0)
    except (TypeError, ValueError):
        size = 0
    return {
        "uid": uid,
        "filename": filename,
        "storedName": stored_name,
        "size": max(0, size),
        "contentType": str(raw.get("contentType") or raw.get("content_type") or "application/octet-stream").strip()
        or "application/octet-stream",
        "createdAt": str(raw.get("createdAt") or ""),
        "author": str(raw.get("author") or ""),
    }


def _messages(item: dict) -> list[dict]:
    if not isinstance(item.get("messages"), list):
        item["messages"] = []
    return item["messages"]


def _message(*, content: str, user: dict, floor: int) -> dict:
    return {
        "uid": f"msg-{uuid.uuid4().hex}",
        "floor": floor,
        "author": _user_name(user),
        "createdAt": _now(),
        "updatedAt": "",
        "content": content,
        "attachments": [],
    }


def _choice(value, allowed: set[str], default: str) -> str:
    text = str(value or "").strip()
    text = LEGACY_FEEDBACK_CATEGORY_MAP.get(text, text)
    return text if text in allowed else default


def _user_name(user: dict) -> str:
    return str(user.get("name") or user.get("displayName") or "匿名").strip() or "匿名"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())


def _safe_filename(value) -> str:
    text = str(value or "").replace("\\", "/").split("/")[-1].strip().strip(".")
    if not text:
        text = "attachment"
    cleaned = []
    for char in text:
        if ord(char) < 32 or char in {'"', "'", ":", "*", "?", "<", ">", "|"}:
            cleaned.append("_")
        else:
            cleaned.append(char)
    result = "".join(cleaned).strip(" .")
    return result[:160] or "attachment"
