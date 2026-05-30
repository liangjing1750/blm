from __future__ import annotations

import base64
import hashlib
import json
import secrets
import socket
import struct
import threading
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from blm_core.storage import WorkspaceStorage


WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CHANGELOG_COMPACT_THRESHOLD = 60
CHANGELOG_COMPACT_BYTES = 2 * 1024 * 1024


class WebSocketProtocolError(RuntimeError):
    pass


@dataclass
class CollabClient:
    client_id: str
    user: str
    handler: Any
    user_id: str = ""
    user_name: str = ""
    session_id: str = ""
    send_lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        if not self.user_name:
            self.user_name = self.user
        if not self.user_id:
            self.user_id = self.user_name or self.client_id


@dataclass
class CollabSession:
    doc_name: str
    document: dict
    seq: int = 0
    clients: dict[str, CollabClient] = field(default_factory=dict)
    dirty: bool = False


class CollaborationManager:
    def __init__(self, storage: WorkspaceStorage, *, autosave_interval: float = 3.0):
        self.storage = storage
        self.autosave_interval = max(0.0, float(autosave_interval))
        self._sessions: dict[str, CollabSession] = {}
        self._autosave_timers: dict[str, threading.Timer] = {}
        self._lock = threading.RLock()

    def handle_websocket(self, handler) -> None:
        if not self._is_websocket_request(handler):
            handler.send_error(400, "expected websocket upgrade")
            return
        self._accept_websocket(handler)
        client: CollabClient | None = None
        session: CollabSession | None = None
        try:
            while True:
                message = self._read_message(handler.connection)
                if message is None:
                    break
                payload = self._decode_json_message(message)
                event_type = str(payload.get("type", "")).strip()
                if event_type == "join":
                    doc_name = str(payload.get("doc", "")).strip()
                    user_profile = self._normalize_user_profile(payload.get("user"))
                    client, session = self._join(handler, doc_name, user_profile)
                    self._send_json(
                        client,
                        {
                            "type": "joined",
                            "doc": session.doc_name,
                            "seq": session.seq,
                            "clientId": client.client_id,
                            "document": session.document,
                            "users": self._session_users(session),
                        },
                    )
                    self._broadcast_presence(session)
                elif event_type == "change":
                    if not client or not session:
                        self._send_raw_error(handler, "请先加入协作会话")
                        continue
                    record = self._apply_change(session, client, payload)
                    self._send_json(client, {"type": "ack", "seq": record["seq"]})
                    self._broadcast_json(
                        session,
                        {
                            "type": "change",
                            "doc": session.doc_name,
                            "seq": record["seq"],
                            "user": client.user,
                            "userId": client.user_id,
                            "clientId": client.client_id,
                            "changes": record["changes"],
                        },
                        exclude_client_id=client.client_id,
                    )
                elif event_type == "snapshot":
                    if not client or not session:
                        self._send_raw_error(handler, "请先加入协作会话")
                        continue
                    record = self._apply_snapshot(session, client, payload)
                    self._send_json(client, {"type": "ack", "seq": record["seq"], "mode": "snapshot"})
                    self._broadcast_json(
                        session,
                        {
                            "type": "snapshot",
                            "doc": session.doc_name,
                            "seq": record["seq"],
                            "user": client.user,
                            "userId": client.user_id,
                            "clientId": client.client_id,
                            "document": session.document,
                        },
                        exclude_client_id=client.client_id,
                    )
                elif event_type == "ping":
                    if client:
                        self._send_json(client, {"type": "pong"})
                    else:
                        self._send_frame(handler.connection, json.dumps({"type": "pong"}).encode("utf-8"))
                else:
                    message = f"未知协作事件: {event_type}"
                    if client:
                        self._send_json(client, {"type": "error", "message": message})
                    else:
                        self._send_raw_error(handler, message)
        except (ConnectionError, OSError, WebSocketProtocolError) as exc:
            try:
                self._send_raw_error(handler, str(exc))
            except OSError:
                pass
        finally:
            if client and session:
                self._leave(session, client.client_id)

    def _is_websocket_request(self, handler) -> bool:
        upgrade = str(handler.headers.get("Upgrade", "")).lower()
        key = str(handler.headers.get("Sec-WebSocket-Key", "")).strip()
        return upgrade == "websocket" and bool(key)

    def _accept_websocket(self, handler) -> None:
        key = str(handler.headers.get("Sec-WebSocket-Key", "")).strip()
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode("ascii")).digest()).decode("ascii")
        response = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n"
            "\r\n"
        )
        handler.connection.sendall(response.encode("ascii"))

    def _normalize_user_profile(self, raw_user: Any) -> dict[str, str]:
        if isinstance(raw_user, dict):
            user_id = str(raw_user.get("id", "")).strip()
            user_name = str(raw_user.get("name", "")).strip()
            session_id = str(raw_user.get("sessionId", "")).strip()
        else:
            user_name = str(raw_user or "").strip()
            user_id = user_name
            session_id = ""
        if not user_name:
            user_name = "未设置用户"
        if not user_id:
            user_id = user_name
        return {
            "id": user_id[:80],
            "name": user_name[:40],
            "sessionId": session_id[:80],
        }

    def _join(self, handler, doc_name: str, user_profile: dict[str, str]) -> tuple[CollabClient, CollabSession]:
        if not doc_name:
            raise WebSocketProtocolError("doc is required")
        safe_name = self.storage._validate_name(doc_name)
        with self._lock:
            session = self._sessions.get(safe_name)
            if not session:
                document, seq = self._load_document_with_changelog(safe_name)
                session = CollabSession(
                    doc_name=safe_name,
                    document=document,
                    seq=seq,
                )
                self._sessions[safe_name] = session
            client = CollabClient(
                client_id=f"client-{secrets.token_hex(8)}",
                user=user_profile["name"],
                user_id=user_profile["id"],
                user_name=user_profile["name"],
                session_id=user_profile["sessionId"],
                handler=handler,
            )
            session.clients[client.client_id] = client
            return client, session

    def _leave(self, session: CollabSession, client_id: str) -> None:
        with self._lock:
            session.clients.pop(client_id, None)
            if session.clients:
                self._broadcast_presence(session)
            else:
                self._flush_autosave(session.doc_name)
                self._sessions.pop(session.doc_name, None)

    def _apply_change(self, session: CollabSession, client: CollabClient, payload: dict) -> dict:
        changes = payload.get("changes")
        if not isinstance(changes, list):
            changes = []
        normalized_changes = []
        with self._lock:
            for change in changes:
                if not isinstance(change, dict):
                    continue
                path = str(change.get("path", "")).strip()
                if not path:
                    continue
                old_value = self._get_path(session.document, path)
                new_value = deepcopy(change.get("new"))
                self._set_path(session.document, path, new_value)
                normalized_changes.append(
                    {
                        "path": path,
                        "old": deepcopy(change.get("old", old_value)),
                        "new": new_value,
                    }
                )
            session.seq += 1
            record = {
                "seq": session.seq,
                "doc": session.doc_name,
                "user": client.user,
                "userId": client.user_id,
                "clientId": client.client_id,
                "ts": datetime.now(timezone.utc).isoformat(),
                "baseSeq": payload.get("baseSeq"),
                "changes": normalized_changes,
            }
            self._append_changelog(session.doc_name, record)
            session.dirty = True
            self._schedule_autosave(session)
            return record

    def _apply_snapshot(self, session: CollabSession, client: CollabClient, payload: dict) -> dict:
        document = payload.get("document")
        if not isinstance(document, dict):
            raise WebSocketProtocolError("snapshot document must be object")
        with self._lock:
            session.document = deepcopy(document)
            session.seq += 1
            record = {
                "seq": session.seq,
                "doc": session.doc_name,
                "user": client.user,
                "userId": client.user_id,
                "clientId": client.client_id,
                "ts": datetime.now(timezone.utc).isoformat(),
                "baseSeq": payload.get("baseSeq"),
                "mode": "snapshot",
                "document": deepcopy(session.document),
            }
            self._append_changelog(session.doc_name, record)
            session.dirty = True
            self._schedule_autosave(session)
            return record

    def _schedule_autosave(self, session: CollabSession) -> None:
        existing = self._autosave_timers.pop(session.doc_name, None)
        if existing:
            existing.cancel()
        if self.autosave_interval <= 0:
            self._flush_autosave(session.doc_name)
            return
        timer = threading.Timer(self.autosave_interval, self._flush_autosave, args=(session.doc_name,))
        timer.daemon = True
        self._autosave_timers[session.doc_name] = timer
        timer.start()

    def _flush_autosave(self, doc_name: str) -> None:
        with self._lock:
            self._autosave_timers.pop(doc_name, None)
            session = self._sessions.get(doc_name)
            if not session or not session.dirty:
                return
            document = deepcopy(session.document)
            session.dirty = False
        try:
            saved_document = self.storage.save_collaboration_working_copy(doc_name, document)
            self.storage.maybe_snapshot_auto_history(doc_name, saved_document)
        except OSError:
            with self._lock:
                session = self._sessions.get(doc_name)
                if session:
                    session.dirty = True

    def _session_users(self, session: CollabSession) -> list[dict]:
        grouped: dict[str, dict] = {}
        for client in session.clients.values():
            user_id = client.user_id or client.user_name or client.client_id
            if user_id not in grouped:
                grouped[user_id] = {
                    "id": user_id,
                    "userId": user_id,
                    "user": client.user_name,
                    "name": client.user_name,
                    "clientIds": [],
                    "sessionIds": [],
                    "connectionCount": 0,
                }
            grouped[user_id]["clientIds"].append(client.client_id)
            if client.session_id:
                grouped[user_id]["sessionIds"].append(client.session_id)
            grouped[user_id]["connectionCount"] += 1
        return sorted(grouped.values(), key=lambda item: str(item["name"]))

    def _broadcast_presence(self, session: CollabSession) -> None:
        self._broadcast_json(
            session,
            {
                "type": "presence",
                "doc": session.doc_name,
                "users": self._session_users(session),
            },
        )

    def _broadcast_json(self, session: CollabSession, payload: dict, *, exclude_client_id: str = "") -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        for client in list(session.clients.values()):
            if exclude_client_id and client.client_id == exclude_client_id:
                continue
            try:
                self._send_frame(client.handler.connection, encoded, client.send_lock)
            except OSError:
                session.clients.pop(client.client_id, None)

    def _send_json(self, client: CollabClient, payload: dict) -> None:
        self._send_frame(
            client.handler.connection,
            json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            client.send_lock,
        )

    def _send_raw_error(self, handler, message: str) -> None:
        self._send_frame(
            handler.connection,
            json.dumps({"type": "error", "message": message}, ensure_ascii=False).encode("utf-8"),
        )

    def _read_message(self, conn: socket.socket) -> str | None:
        header = self._recv_exact(conn, 2)
        if not header:
            return None
        first, second = header
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", self._recv_exact(conn, 2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self._recv_exact(conn, 8))[0]
        mask = self._recv_exact(conn, 4) if masked else b""
        payload = self._recv_exact(conn, length) if length else b""
        if masked:
            payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        if opcode == 0x8:
            return None
        if opcode == 0x9:
            self._send_frame(conn, payload, opcode=0xA)
            return self._read_message(conn)
        if opcode != 0x1:
            raise WebSocketProtocolError(f"unsupported websocket opcode: {opcode}")
        return payload.decode("utf-8")

    def _send_frame(
        self,
        conn: socket.socket,
        payload: bytes,
        send_lock: threading.Lock | None = None,
        *,
        opcode: int = 0x1,
    ) -> None:
        lock = send_lock or threading.Lock()
        with lock:
            length = len(payload)
            header = bytearray([0x80 | opcode])
            if length < 126:
                header.append(length)
            elif length <= 0xFFFF:
                header.append(126)
                header.extend(struct.pack("!H", length))
            else:
                header.append(127)
                header.extend(struct.pack("!Q", length))
            conn.sendall(bytes(header) + payload)

    def _recv_exact(self, conn: socket.socket, length: int) -> bytes:
        chunks = bytearray()
        while len(chunks) < length:
            chunk = conn.recv(length - len(chunks))
            if not chunk:
                raise ConnectionError("websocket disconnected")
            chunks.extend(chunk)
        return bytes(chunks)

    def _decode_json_message(self, message: str) -> dict:
        try:
            payload = json.loads(message or "{}")
        except json.JSONDecodeError as exc:
            raise WebSocketProtocolError("invalid json") from exc
        if not isinstance(payload, dict):
            raise WebSocketProtocolError("message must be object")
        return payload

    def _collab_dir(self, doc_name: str) -> Path:
        package_dir = self.storage._package_dir(self.storage._validate_name(doc_name))
        package_dir.mkdir(parents=True, exist_ok=True)
        collab_dir = package_dir / "collab"
        collab_dir.mkdir(exist_ok=True)
        return collab_dir

    def _append_changelog(self, doc_name: str, record: dict) -> None:
        changelog_path = self._collab_dir(doc_name) / "changelog.jsonl"
        with changelog_path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
        self._compact_changelog_if_needed(changelog_path, record)

    def _compact_changelog_if_needed(self, changelog_path: Path, record: dict) -> None:
        if record.get("mode") != "snapshot" or not isinstance(record.get("document"), dict):
            return
        try:
            lines = [line for line in changelog_path.read_text("utf-8").splitlines() if line.strip()]
        except OSError:
            return
        try:
            size_exceeded = changelog_path.stat().st_size > CHANGELOG_COMPACT_BYTES
        except OSError:
            size_exceeded = False
        if len(lines) <= CHANGELOG_COMPACT_THRESHOLD and not size_exceeded:
            return
        compact_record = dict(record)
        compact_record["compacted"] = True
        changelog_path.write_text(
            json.dumps(compact_record, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )

    def _load_document_with_changelog(self, doc_name: str) -> tuple[dict, int]:
        document = self.storage.load(doc_name)
        last_seq = 0
        for record in self._read_changelog_records(doc_name):
            last_seq = max(last_seq, int(record.get("seq") or 0))
            if record.get("mode") == "snapshot" and isinstance(record.get("document"), dict):
                document = deepcopy(record["document"])
                continue
            changes = record.get("changes")
            if isinstance(changes, list):
                for change in changes:
                    if not isinstance(change, dict):
                        continue
                    path = str(change.get("path", "")).strip()
                    if path:
                        self._set_path(document, path, deepcopy(change.get("new")))
        return document, last_seq

    def _read_changelog_records(self, doc_name: str) -> list[dict]:
        changelog_path = self._collab_dir(doc_name) / "changelog.jsonl"
        if not changelog_path.exists():
            return []
        records = []
        try:
            for line in changelog_path.read_text("utf-8").splitlines():
                if not line.strip():
                    continue
                payload = json.loads(line)
                if isinstance(payload, dict):
                    records.append(payload)
        except (OSError, ValueError, json.JSONDecodeError):
            return records
        return records

    def _get_path(self, document: dict, path: str) -> Any:
        current: Any = document
        for token in self._parse_path(path):
            if isinstance(token, int):
                if not isinstance(current, list) or token >= len(current):
                    return None
                current = current[token]
            else:
                if not isinstance(current, dict):
                    return None
                current = current.get(token)
        return deepcopy(current)

    def _set_path(self, document: dict, path: str, value: Any) -> None:
        tokens = self._parse_path(path)
        if not tokens:
            return
        current: Any = document
        for token in tokens[:-1]:
            if isinstance(token, int):
                if not isinstance(current, list):
                    raise WebSocketProtocolError(f"path segment is not list: {path}")
                while len(current) <= token:
                    current.append({})
                current = current[token]
            else:
                if not isinstance(current, dict):
                    raise WebSocketProtocolError(f"path segment is not object: {path}")
                if token not in current or current[token] is None:
                    current[token] = {}
                current = current[token]
        last = tokens[-1]
        if isinstance(last, int):
            if not isinstance(current, list):
                raise WebSocketProtocolError(f"path target is not list: {path}")
            while len(current) <= last:
                current.append(None)
            current[last] = value
        else:
            if not isinstance(current, dict):
                raise WebSocketProtocolError(f"path target is not object: {path}")
            current[last] = value

    def _parse_path(self, path: str) -> list[str | int]:
        tokens: list[str | int] = []
        for segment in str(path or "").split("."):
            rest = segment.strip()
            if not rest:
                continue
            while "[" in rest:
                before, after = rest.split("[", 1)
                if before:
                    tokens.append(before)
                index_text, _, rest = after.partition("]")
                if not index_text.isdigit():
                    raise WebSocketProtocolError(f"invalid path index: {path}")
                tokens.append(int(index_text))
            if rest:
                tokens.append(rest)
        return tokens
