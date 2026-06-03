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

from blm_core.diagnostics import log_error, log_event
from blm_core.merge import analyze_merge
from blm_core.storage import WorkspaceStorage


WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CLIENT_STALE_SECONDS = 25


def _doc_hash(document: dict) -> str:
    try:
        text = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except (TypeError, ValueError):
        return ""
    d = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
    return d


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
    remote_addr: str = ""
    last_seen: float = field(default_factory=lambda: datetime.now(timezone.utc).timestamp())
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
    snapshots: dict[int, dict] = field(default_factory=dict)
    dirty: bool = False


class CollaborationManager:
    def __init__(self, storage: WorkspaceStorage, *, autosave_interval: float = 3.0):
        self.storage = storage
        self.autosave_interval = max(0.0, float(autosave_interval))
        self._sessions: dict[str, CollabSession] = {}
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
                if client:
                    client.last_seen = datetime.now(timezone.utc).timestamp()
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
                            "users": self._session_users(session),
                        },
                    )
                    self._broadcast_presence(session)
                elif event_type == "change":
                    self._send_raw_error(handler, "协议v2不支持增量change，请使用Ctrl+S触发同步")
                elif event_type == "snapshot":
                    if not client or not session:
                        self._send_raw_error(handler, "请先加入协作会话")
                        continue
                    try:
                        record = self._apply_snapshot(session, client, payload)
                    except WebSocketProtocolError as exc:
                        self._send_json(client, {"type": "error", "message": str(exc), "mode": "snapshot"})
                        continue
                    changed = bool(record.get("changed", True))
                    self._send_json(
                        client,
                        {
                            "type": "ack",
                            "seq": record["seq"],
                            "mode": "snapshot",
                            "rebased": bool(record.get("rebased")),
                            "document": session.document,
                            "changed": changed,
                        },
                    )
                    if changed:
                        self._broadcast_json(
                            session,
                            {
                                "type": "snapshot_notice",
                                "doc": session.doc_name,
                                "seq": record["seq"],
                                "user": client.user,
                                "userId": client.user_id,
                                "clientId": client.client_id,
                            },
                            exclude_client_id=client.client_id,
                        )
                elif event_type == "ping":
                    if client:
                        log_event(
                            "blm.collab",
                            "collab.ping",
                            doc=session.doc_name if session else "",
                            clientId=client.client_id,
                            user=client.user_name,
                        )
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
            log_error(
                "blm.collab",
                "collab.websocket.error",
                doc=session.doc_name if session else "",
                clientId=client.client_id if client else "",
                user=client.user_name if client else "",
                error=str(exc),
                remoteAddr=_handler_remote_addr(handler),
            )
            try:
                self._send_raw_error(handler, str(exc))
            except OSError:
                pass
        finally:
            if client and session:
                self._leave(session, client.client_id)

    def poll(self, doc_name: str, since_seq: int = 0) -> dict:
        safe_name = self.storage._validate_name(doc_name)
        with self._lock:
            session = self._get_or_create_session(safe_name)
            seq = int(session.seq or 0)
            include_document = False
            changed = seq > int(since_seq or 0)
            return {
                "ok": True,
                "doc": session.doc_name,
                "seq": seq,
                "changed": changed,
                "document": None,
                "users": self._session_users(session),
            }

    def apply_http_snapshot(self, doc_name: str, user_profile: dict[str, str], payload: dict) -> dict:
        safe_name = self.storage._validate_name(doc_name)
        with self._lock:
            session = self._get_or_create_session(safe_name)
            client = CollabClient(
                client_id=f"http-{secrets.token_hex(8)}",
                user=user_profile.get("name") or "HTTP",
                user_id=user_profile.get("id") or user_profile.get("name") or "HTTP",
                user_name=user_profile.get("name") or "HTTP",
                session_id=user_profile.get("sessionId") or "",
                remote_addr=str(user_profile.get("remoteAddr") or ""),
                handler=None,
            )
            record = self._apply_snapshot(session, client, payload)
            if record.get("changed", True):
                self._broadcast_json(
                    session,
                    {
                        "type": "snapshot_notice",
                        "doc": session.doc_name,
                        "seq": record["seq"],
                        "user": client.user,
                        "userId": client.user_id,
                        "clientId": client.client_id,
                    },
                )
            return {
                "ok": True,
                "doc": session.doc_name,
                "seq": record["seq"],
                "rebased": bool(record.get("rebased")),
                "changed": bool(record.get("changed", True)),
                "document": deepcopy(session.document),
            }

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
        if isinstance(raw_user, str):
            raw_text = raw_user.strip()
            if raw_text.startswith("{"):
                try:
                    parsed_user = json.loads(raw_text)
                except json.JSONDecodeError:
                    parsed_user = raw_user
                else:
                    raw_user = parsed_user
        if isinstance(raw_user, dict):
            user_id = str(raw_user.get("id", "")).strip()
            user_name = str(
                raw_user.get("name")
                or raw_user.get("user")
                or raw_user.get("displayName")
                or raw_user.get("username")
                or ""
            ).strip()
            session_id = str(raw_user.get("sessionId", "")).strip()
        else:
            user_name = str(raw_user or "").strip()
            user_id = user_name
            session_id = ""
        if not user_name or user_name == "未设置用户":
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
            session = self._get_or_create_session(safe_name)
            client = CollabClient(
                client_id=f"client-{secrets.token_hex(8)}",
                user=user_profile["name"],
                user_id=user_profile["id"],
                user_name=user_profile["name"],
                session_id=user_profile["sessionId"],
                remote_addr=_handler_remote_addr(handler),
                handler=handler,
            )
            session.clients[client.client_id] = client
            log_event(
                "blm.collab",
                "collab.join",
                doc=session.doc_name,
                seq=session.seq,
                clientId=client.client_id,
                user=client.user_name,
                userId=client.user_id,
                sessionId=client.session_id,
                remoteAddr=client.remote_addr,
                connectionCount=len(session.clients),
            )
            return client, session

    def _get_or_create_session(self, safe_name: str) -> CollabSession:
        session = self._sessions.get(safe_name)
        if session:
            return session
        document, seq = self._load_document_with_changelog(safe_name)
        session = CollabSession(
            doc_name=safe_name,
            document=document,
            seq=seq,
        )
        self._remember_snapshot(session)
        self._sessions[safe_name] = session
        return session

    def _leave(self, session: CollabSession, client_id: str) -> None:
        with self._lock:
            client = session.clients.pop(client_id, None)
            log_event(
                "blm.collab",
                "collab.leave",
                doc=session.doc_name,
                clientId=client_id,
                user=client.user_name if client else "",
                remoteAddr=client.remote_addr if client else "",
                remainingConnections=len(session.clients),
            )
            if session.clients:
                self._broadcast_presence(session)
            else:
                self._flush_autosave(session.doc_name)
                self._sessions.pop(session.doc_name, None)

    def _apply_snapshot(self, session: CollabSession, client: CollabClient, payload: dict) -> dict:
        started_at = datetime.now(timezone.utc).timestamp()
        document = payload.get("document")
        if not isinstance(document, dict):
            raise WebSocketProtocolError("snapshot document must be object")
        with self._lock:
            base_seq = self._parse_base_seq(payload.get("baseSeq")) or 0

            # 底线：先落盘提交原文
            submit_id = self._save_submit_record(session, client, document, base_seq)

            stats: dict = {"merged": True, "conflictCount": 0, "base_missing": False}
            if base_seq == session.seq:
                merged = document
            elif base_doc := session.snapshots.get(base_seq):
                merged, stats = self._merge_collaboration(base_doc, document, session.document)
            else:
                stats["base_missing"] = True
                merged, stats = self._merge_collaboration(session.document, document)

            old_json = json.dumps(session.document, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            new_json = json.dumps(merged, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            document_changed = old_json != new_json

            if document_changed:
                session.document = deepcopy(merged)
                session.seq += 1
                self._remember_snapshot(session)
                session.dirty = True

            stats["user"] = client.user_name
            stats["userId"] = client.user_id
            stats["changed"] = document_changed
            self._write_sync_log(session, submit_id, base_seq, stats)

            if document_changed:
                self._flush_autosave(session.doc_name)
            log_event(
                "blm.collab",
                "collab.snapshot",
                doc=session.doc_name,
                seq=session.seq,
                baseSeq=base_seq,
                clientId=client.client_id,
                user=client.user_name,
                submitId=submit_id,
                conflictCount=stats.get("conflictCount", 0),
                baseMissing=bool(stats.get("base_missing")),
                documentBytes=len(json.dumps(merged, ensure_ascii=False)),
                elapsedMs=int((datetime.now(timezone.utc).timestamp() - started_at) * 1000),
            )
            record = {
                "seq": session.seq,
                "doc": session.doc_name,
                "user": client.user,
                "userId": client.user_id,
                "clientId": client.client_id,
                "ts": datetime.now(timezone.utc).isoformat(),
                "baseSeq": base_seq,
                "mode": "snapshot",
                "rebased": base_seq != session.seq - 1,
                "submitId": submit_id,
                "changed": document_changed,
            }
            return record

    def _save_submit_record(
        self, session: CollabSession, client: CollabClient, document: dict, base_seq: int
    ) -> str:
        """每次Ctrl+S先落盘提交原文，返回 submit_id"""
        submits_dir = self._collab_dir(session.doc_name) / "submits"
        submits_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
        submit_id = f"{ts}__seq{session.seq + 1}__baseSeq{base_seq}__{client.user_name}"
        submit_path = submits_dir / f"{submit_id}.json"
        submit_path.write_text(
            json.dumps(
                {
                    "submitId": submit_id,
                    "doc": session.doc_name,
                    "seq": session.seq + 1,
                    "baseSeq": base_seq,
                    "user": client.user_name,
                    "userId": client.user_id,
                    "clientId": client.client_id,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "document": document,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        return submit_id

    def _write_sync_log(
        self, session: CollabSession, submit_id: str, base_seq: int, stats: dict
    ) -> None:
        """追加sync-log.jsonl"""
        log_path = self._collab_dir(session.doc_name) / "sync-log.jsonl"
        record = {
            "seq": session.seq,
            "baseSeq": base_seq,
            "user": stats.get("user", ""),
            "userId": stats.get("userId", ""),
            "submitId": submit_id,
            "merged": stats.get("merged", True),
            "conflictCount": int(stats.get("conflictCount", 0)),
            "baseMissing": bool(stats.get("base_missing", False)),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")

    def _merge_collaboration(
        self, base_doc: dict, user_doc: dict, server_doc: dict | None = None
    ) -> tuple[dict, dict]:
        """协作专用合并入口，内部复用 merge.py 的 analyze_merge"""
        if server_doc is None:
            result = analyze_merge("combine", left_document=base_doc, right_document=user_doc)
            source = "combine"
        else:
            result = analyze_merge(
                "3way", left_document=user_doc, right_document=server_doc, base_document=base_doc
            )
            source = "3way"

        conflicts = result.get("conflicts", [])
        stats = {
            "merged": True,
            "conflictCount": len(conflicts) if isinstance(conflicts, list) else 0,
            "source": source,
        }

        merged = result.get("merged_document") or server_doc or base_doc or user_doc or {}
        return merged, stats

    def _parse_base_seq(self, value: Any) -> int | None:
        if value is None or value == "":
            return None
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        return max(0, parsed)

    def _remember_snapshot(self, session: CollabSession) -> None:
        session.snapshots[int(session.seq)] = deepcopy(session.document)
        if len(session.snapshots) <= 40:
            return
        for seq in sorted(session.snapshots)[:-40]:
            session.snapshots.pop(seq, None)

    def _flush_autosave(self, doc_name: str) -> None:
        started_at = datetime.now(timezone.utc).timestamp()
        with self._lock:
            session = self._sessions.get(doc_name)
            if not session or not session.dirty:
                return
            document = deepcopy(session.document)
            session.dirty = False
        try:
            saved_document = self.storage.save_collaboration_working_copy(doc_name, document)
            self.storage.maybe_snapshot_auto_history(doc_name, saved_document)
            with self._lock:
                session = self._sessions.get(doc_name)
                if session and not session.dirty:
                    session.document = saved_document
            log_event(
                "blm.collab",
                "collab.autosave",
                doc=doc_name,
                documentBytes=len(json.dumps(saved_document, ensure_ascii=False)),
                elapsedMs=int((datetime.now(timezone.utc).timestamp() - started_at) * 1000),
            )
        except OSError:
            with self._lock:
                session = self._sessions.get(doc_name)
                if session:
                    session.dirty = True
            log_error(
                "blm.collab",
                "collab.autosave.error",
                doc=doc_name,
                elapsedMs=int((datetime.now(timezone.utc).timestamp() - started_at) * 1000),
            )

    def _session_users(self, session: CollabSession) -> list[dict]:
        self._drop_stale_clients(session)
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
                    "remoteAddrs": [],
                }
            grouped[user_id]["clientIds"].append(client.client_id)
            if client.session_id:
                grouped[user_id]["sessionIds"].append(client.session_id)
            grouped[user_id]["connectionCount"] += 1
            if client.remote_addr:
                grouped[user_id]["remoteAddrs"].append(client.remote_addr)
        return sorted(grouped.values(), key=lambda item: str(item["name"]))

    def diagnostics(self) -> dict:
        with self._lock:
            sessions = []
            for session in self._sessions.values():
                sessions.append(
                    {
                        "doc": session.doc_name,
                        "seq": session.seq,
                        "dirty": bool(session.dirty),
                        "connectionCount": len(session.clients),
                        "snapshotCount": len(session.snapshots),
                        "autosavePending": session.doc_name in self._autosave_timers,
                        "users": self._session_users(session),
                    }
                )
            return {
                "autosaveInterval": self.autosave_interval,
                "sessionCount": len(sessions),
                "sessions": sorted(sessions, key=lambda item: str(item["doc"])),
            }

    def _drop_stale_clients(self, session: CollabSession) -> None:
        now = datetime.now(timezone.utc).timestamp()
        stale_client_ids = [
            client.client_id
            for client in session.clients.values()
            if now - float(client.last_seen or now) > CLIENT_STALE_SECONDS
        ]
        for client_id in stale_client_ids:
            session.clients.pop(client_id, None)

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
        recipients = [
            client
            for client in list(session.clients.values())
            if not exclude_client_id or client.client_id != exclude_client_id
        ]
        if not recipients:
            return
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        for client in recipients:
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
        message = bytearray()
        started = False
        while True:
            header = self._recv_exact(conn, 2)
            if not header:
                return None
            first, second = header
            fin = bool(first & 0x80)
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
                continue
            if opcode == 0xA:
                continue
            if opcode == 0x1:
                if started:
                    raise WebSocketProtocolError("unexpected text frame while reading fragmented message")
                started = True
                message.extend(payload)
            elif opcode == 0x0:
                if not started:
                    raise WebSocketProtocolError("unexpected websocket continuation frame")
                message.extend(payload)
            else:
                raise WebSocketProtocolError(f"unsupported websocket opcode: {opcode}")
            if fin:
                return bytes(message).decode("utf-8")

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

    def _load_document_with_changelog(self, doc_name: str) -> tuple[dict, int]:
        document = self.storage.load(doc_name)
        return document, 0

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


def _handler_remote_addr(handler: Any) -> str:
    client_address = getattr(handler, "client_address", None)
    if isinstance(client_address, tuple) and client_address:
        return str(client_address[0])
    return ""
