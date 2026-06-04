from __future__ import annotations

import json
import threading
import time
import uuid
from copy import deepcopy
from pathlib import Path


class FeedbackStore:
    """Small hidden store for product feedback.

    Feedback is collaborative operational data, not a BLM model document. Keeping it
    outside the normal document save path avoids model normalization and last-write
    races when several users submit feedback at the same time.
    """

    def __init__(self, workspace_dir: Path):
        self.workspace_dir = Path(workspace_dir)
        self.root = self.workspace_dir / ".user_ask"
        self.path = self.root / "feedback.json"
        self._lock = threading.RLock()

    def load(self) -> dict:
        with self._lock:
            document = self._read_unlocked()
            self._write_unlocked(document)
            return deepcopy(document)

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
            "category": _choice(data.get("category"), {"缺陷", "建议", "问题"}, "问题"),
            "title": title,
            "description": str(data.get("description") or "").strip(),
            "status": "待处理",
            "reply": "",
            "repliedBy": "",
            "repliedAt": "",
            "messages": [],
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
        item["category"] = _choice(data.get("category"), {"缺陷", "建议", "问题"}, item.get("category") or "问题")
        item["status"] = _choice(data.get("status"), {"待处理", "处理中", "已解决", "已关闭"}, item.get("status") or "待处理")

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
        "category": _choice(item.get("category"), {"缺陷", "建议", "问题"}, "问题"),
        "title": str(item.get("title") or "(无标题)"),
        "description": str(item.get("description") or ""),
        "status": _choice(item.get("status"), {"待处理", "处理中", "已解决", "已关闭"}, "待处理"),
        "reply": str(item.get("reply") or ""),
        "repliedBy": str(item.get("repliedBy") or ""),
        "repliedAt": str(item.get("repliedAt") or ""),
        "messages": [],
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
            }
        )
    for index, message in enumerate(normalized["messages"], 1):
        message["floor"] = index
    return normalized


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
    }


def _choice(value, allowed: set[str], default: str) -> str:
    text = str(value or "").strip()
    return text if text in allowed else default


def _user_name(user: dict) -> str:
    return str(user.get("name") or user.get("displayName") or "匿名").strip() or "匿名"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())
