from __future__ import annotations

import base64
import http.server
import json
import os
import socket
import struct
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from blm_core.collab import CollabClient, CollabSession, CollaborationManager, WebSocketProtocolError
from blm_core.document import create_empty_document
from blm_core.server import create_handler
from blm_core.storage import WorkspaceStorage


def _masked_client_frame(payload: dict) -> bytes:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    mask = b"\x01\x02\x03\x04"
    header = bytearray([0x81])
    length = len(raw)
    if length < 126:
        header.append(0x80 | length)
    elif length <= 0xFFFF:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(raw))
    return bytes(header) + mask + masked


def _masked_raw_frame(raw: bytes, *, opcode: int = 0x1, fin: bool = True) -> bytes:
    mask = b"\x05\x06\x07\x08"
    header = bytearray([(0x80 if fin else 0x00) | opcode])
    length = len(raw)
    if length < 126:
        header.append(0x80 | length)
    elif length <= 0xFFFF:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(raw))
    return bytes(header) + mask + masked


def _masked_fragmented_client_frame(payload: dict, split_at: int) -> bytes:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return (
        _masked_raw_frame(raw[:split_at], opcode=0x1, fin=False)
        + _masked_raw_frame(raw[split_at:], opcode=0x0, fin=True)
    )


def _recv_exact(sock: socket.socket, length: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < length:
        chunk = sock.recv(length - len(chunks))
        if not chunk:
            raise RuntimeError("socket closed")
        chunks.extend(chunk)
    return bytes(chunks)


def _recv_json_frame(sock: socket.socket) -> tuple[int, dict]:
    first, second = _recv_exact(sock, 2)
    opcode = first & 0x0F
    length = second & 0x7F
    if length == 126:
        length = struct.unpack("!H", _recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _recv_exact(sock, 8))[0]
    payload = _recv_exact(sock, length) if length else b""
    return opcode, json.loads(payload.decode("utf-8"))


class CollaborationWebSocketTests(unittest.TestCase):
    def _connect_ws(self, server_port: int) -> socket.socket:
        sock = socket.create_connection(("127.0.0.1", server_port), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            "GET /api/collab/ws HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{server_port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        sock.sendall(request.encode("ascii"))
        response = b""
        while b"\r\n\r\n" not in response:
            response += sock.recv(1)
        self.assertIn(b"101 Switching Protocols", response)
        return sock

    def _start_server(self, storage: WorkspaceStorage):
        collab = CollaborationManager(storage)
        handler = create_handler(Path.cwd() / "app", storage, collab)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, thread

    def test_join_change_ack_and_changelog(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            storage = WorkspaceStorage(root / "workspace")
            storage.save("CollabSmoke", create_empty_document("CollabSmoke"))
            server, _thread = self._start_server(storage)
            try:
                sock = self._connect_ws(server.server_port)
                self.addCleanup(sock.close)

                sock.sendall(_masked_client_frame({"type": "join", "doc": "CollabSmoke", "user": "Tester"}))
                opcode, joined = _recv_json_frame(sock)
                self.assertEqual(opcode, 1)
                self.assertEqual(joined["type"], "joined")
                self.assertEqual(joined["seq"], 0)

                sock.sendall(
                    _masked_client_frame(
                        {
                            "type": "change",
                            "baseSeq": joined["seq"],
                            "changes": [{"path": "meta.author", "new": "Tester"}],
                        }
                    )
                )
                message_types = []
                for _ in range(3):
                    _, message = _recv_json_frame(sock)
                    message_types.append(message.get("type"))
                    if message.get("type") == "ack":
                        break
                self.assertIn("presence", message_types)
                self.assertIn("ack", message_types)

                changelog = root / "workspace" / "CollabSmoke" / "collab" / "changelog.jsonl"
                record = json.loads(changelog.read_text("utf-8").splitlines()[-1])
                self.assertEqual(record["seq"], 1)
                self.assertEqual(record["changes"][0]["path"], "meta.author")
                self.assertEqual(record["changes"][0]["new"], "Tester")
            finally:
                server.shutdown()
                server.server_close()

    def test_change_is_broadcast_to_other_clients(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            storage.save("CollabSmoke", create_empty_document("CollabSmoke"))
            server, _thread = self._start_server(storage)
            try:
                left = self._connect_ws(server.server_port)
                right = self._connect_ws(server.server_port)
                self.addCleanup(left.close)
                self.addCleanup(right.close)

                left.sendall(_masked_client_frame({"type": "join", "doc": "CollabSmoke", "user": "Left"}))
                _, left_joined = _recv_json_frame(left)
                self.assertEqual(left_joined["type"], "joined")
                _, left_presence = _recv_json_frame(left)
                self.assertEqual(left_presence["type"], "presence")

                right.sendall(_masked_client_frame({"type": "join", "doc": "CollabSmoke", "user": "Right"}))
                _, right_joined = _recv_json_frame(right)
                self.assertEqual(right_joined["type"], "joined")
                _, right_presence = _recv_json_frame(right)
                self.assertEqual(right_presence["type"], "presence")
                _, left_remote_presence = _recv_json_frame(left)
                self.assertEqual(left_remote_presence["type"], "presence")

                left.sendall(
                    _masked_client_frame(
                        {
                            "type": "change",
                            "baseSeq": left_joined["seq"],
                            "changes": [{"path": "meta.author", "new": "Left"}],
                        }
                    )
                )
                _, left_ack = _recv_json_frame(left)
                self.assertEqual(left_ack["type"], "ack")
                _, right_change = _recv_json_frame(right)
                self.assertEqual(right_change["type"], "change")
                self.assertEqual(right_change["changes"][0]["path"], "meta.author")
                self.assertEqual(right_change["changes"][0]["new"], "Left")
            finally:
                server.shutdown()
                server.server_close()

    def test_same_user_multiple_connections_are_grouped_in_presence(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            storage.save("CollabSmoke", create_empty_document("CollabSmoke"))
            server, _thread = self._start_server(storage)
            try:
                first = self._connect_ws(server.server_port)
                second = self._connect_ws(server.server_port)
                self.addCleanup(first.close)
                self.addCleanup(second.close)

                user_profile = {"id": "u-zhangsan", "name": "张三", "sessionId": "tab-a"}
                first.sendall(_masked_client_frame({"type": "join", "doc": "CollabSmoke", "user": user_profile}))
                _, first_joined = _recv_json_frame(first)
                self.assertEqual(first_joined["users"][0]["name"], "张三")
                self.assertEqual(first_joined["users"][0]["connectionCount"], 1)
                _recv_json_frame(first)

                second.sendall(_masked_client_frame({"type": "join", "doc": "CollabSmoke", "user": {**user_profile, "sessionId": "tab-b"}}))
                _, second_joined = _recv_json_frame(second)
                self.assertEqual(len(second_joined["users"]), 1)
                self.assertEqual(second_joined["users"][0]["name"], "张三")
                self.assertEqual(second_joined["users"][0]["connectionCount"], 2)
            finally:
                server.shutdown()
                server.server_close()

    def test_join_accepts_user_display_name_aliases(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            storage.save("CollabSmoke", create_empty_document("CollabSmoke"))
            server, _thread = self._start_server(storage)
            try:
                sock = self._connect_ws(server.server_port)
                self.addCleanup(sock.close)

                sock.sendall(
                    _masked_client_frame(
                        {
                            "type": "join",
                            "doc": "CollabSmoke",
                            "user": {"id": "u-lisi", "displayName": "李四", "sessionId": "tab-a"},
                        }
                    )
                )
                _, joined = _recv_json_frame(sock)
                self.assertEqual(joined["type"], "joined")
                self.assertEqual(joined["users"][0]["name"], "李四")
                self.assertEqual(joined["users"][0]["userId"], "u-lisi")
            finally:
                server.shutdown()
                server.server_close()

    def test_session_users_drops_stale_connections(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            manager = CollaborationManager(storage)
            fresh = CollabClient("client-fresh", "张三", handler=None, user_id="u-zhangsan", user_name="张三")
            stale = CollabClient("client-stale", "旧用户", handler=None, user_id="u-old", user_name="旧用户")
            stale.last_seen = (datetime.now(timezone.utc) - timedelta(seconds=120)).timestamp()
            session = CollabSession(
                "CollabSmoke",
                create_empty_document("CollabSmoke"),
                clients={fresh.client_id: fresh, stale.client_id: stale},
            )

            users = manager._session_users(session)

            self.assertEqual([user["name"] for user in users], ["张三"])
            self.assertNotIn("client-stale", session.clients)

    def test_snapshot_replaces_session_document_and_is_broadcast(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            storage = WorkspaceStorage(root / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            server, _thread = self._start_server(storage)
            try:
                left = self._connect_ws(server.server_port)
                right = self._connect_ws(server.server_port)
                self.addCleanup(left.close)
                self.addCleanup(right.close)

                left.sendall(_masked_client_frame({"type": "join", "doc": "CollabSmoke", "user": "Left"}))
                _, left_joined = _recv_json_frame(left)
                _recv_json_frame(left)
                right.sendall(_masked_client_frame({"type": "join", "doc": "CollabSmoke", "user": "Right"}))
                _recv_json_frame(right)
                _recv_json_frame(right)
                _recv_json_frame(left)

                next_document = dict(storage.load("CollabSmoke"))
                next_document["meta"] = dict(next_document["meta"])
                next_document["meta"]["author"] = "Snapshot Author"
                next_document["processes"] = list(next_document["processes"])
                next_document["processes"].append({"uid": "proc-new", "name": "新增流程", "nodes": []})
                left.sendall(
                    _masked_client_frame(
                        {
                            "type": "snapshot",
                            "baseSeq": left_joined["seq"],
                            "document": next_document,
                        }
                    )
                )
                _, left_ack = _recv_json_frame(left)
                self.assertEqual(left_ack["type"], "ack")
                self.assertEqual(left_ack["mode"], "snapshot")
                self.assertEqual(left_ack["document"]["meta"]["author"], "Snapshot Author")
                self.assertEqual(storage.load("CollabSmoke")["meta"]["author"], "Snapshot Author")
                _, right_snapshot = _recv_json_frame(right)
                self.assertEqual(right_snapshot["type"], "snapshot")
                self.assertEqual(right_snapshot["document"]["meta"]["author"], "Snapshot Author")
                self.assertEqual(right_snapshot["document"]["processes"][-1]["name"], "新增流程")

                changelog = root / "workspace" / "CollabSmoke" / "collab" / "changelog.jsonl"
                record = json.loads(changelog.read_text("utf-8").splitlines()[-1])
                self.assertEqual(record["mode"], "snapshot")
                self.assertNotIn("document", record)
            finally:
                server.shutdown()
                server.server_close()

    def test_fragmented_snapshot_frame_is_assembled_before_json_decode(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            server, _thread = self._start_server(storage)
            try:
                sock = self._connect_ws(server.server_port)
                self.addCleanup(sock.close)

                sock.sendall(_masked_client_frame({"type": "join", "doc": "CollabSmoke", "user": "Tester"}))
                _, joined = _recv_json_frame(sock)
                self.assertEqual(joined["type"], "joined")
                _recv_json_frame(sock)

                next_document = storage.load("CollabSmoke")
                next_document["meta"]["author"] = "Fragmented Snapshot"
                next_document["meta"]["note"] = "x" * 200_000
                payload = {
                    "type": "snapshot",
                    "baseSeq": joined["seq"],
                    "document": next_document,
                }
                sock.sendall(_masked_fragmented_client_frame(payload, split_at=4096))

                _, ack = _recv_json_frame(sock)
                self.assertEqual(ack["type"], "ack")
                self.assertEqual(ack["mode"], "snapshot")
                self.assertEqual(storage.load("CollabSmoke")["meta"]["author"], "Fragmented Snapshot")
            finally:
                server.shutdown()
                server.server_close()

    def test_join_replays_changelog_after_session_restarts(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage)
            manager._append_changelog(
                "CollabSmoke",
                {
                    "seq": 1,
                    "doc": "CollabSmoke",
                    "user": "Tester",
                    "clientId": "client-test",
                    "ts": "2026-05-29T00:00:00+00:00",
                    "changes": [{"path": "meta.author", "new": "Replayed"}],
                },
            )
            loaded, seq = manager._load_document_with_changelog("CollabSmoke")
            self.assertEqual(seq, 1)
            self.assertEqual(loaded["meta"]["author"], "Replayed")

    def test_legacy_snapshot_documents_are_compacted_and_not_replayed_over_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "Manifest Author"
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage)
            stale_snapshot = create_empty_document("CollabSmoke")
            stale_snapshot["meta"]["author"] = "Stale Snapshot"
            manager._append_changelog(
                "CollabSmoke",
                {
                    "seq": 1,
                    "doc": "CollabSmoke",
                    "user": "Legacy",
                    "clientId": "client-legacy",
                    "ts": "2026-05-29T00:00:00+00:00",
                    "mode": "snapshot",
                    "document": stale_snapshot,
                },
            )
            changelog_path = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "changelog.jsonl"
            self.assertIn('"document"', changelog_path.read_text("utf-8"))

            loaded, seq = manager._load_document_with_changelog("CollabSmoke")

            self.assertEqual(seq, 1)
            self.assertEqual(loaded["meta"]["author"], "Manifest Author")
            self.assertNotIn('"document"', changelog_path.read_text("utf-8"))

    def test_autosave_persists_collaboration_working_copy_and_compact_auto_history(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            storage = WorkspaceStorage(root / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)
            session = CollabSession("CollabSmoke", storage.load("CollabSmoke"))
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-test", "Tester", handler=None)

            next_document = create_empty_document("CollabSmoke")
            next_document["meta"]["author"] = "Autosaved"
            manager._apply_snapshot(session, client, {"document": next_document})

            persisted = storage.load("CollabSmoke")
            history_entries = storage.list_history("CollabSmoke")
            self.assertEqual(persisted["meta"]["author"], "Autosaved")
            self.assertEqual(len(history_entries), 1)
            self.assertEqual(history_entries[0]["kind"], "auto")
            self.assertEqual(history_entries[0]["reason"], "time_window")

    def test_snapshot_ack_means_working_copy_is_already_persisted(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=3600)
            session = CollabSession("CollabSmoke", storage.load("CollabSmoke"))
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-test", "Tester", handler=None)

            next_document = create_empty_document("CollabSmoke")
            next_document["meta"]["author"] = "Persisted before ack"
            record = manager._apply_snapshot(session, client, {"document": next_document})

            self.assertEqual(record["mode"], "snapshot")
            self.assertFalse(session.dirty)
            self.assertEqual(storage.load("CollabSmoke")["meta"]["author"], "Persisted before ack")
            self.assertEqual(session.document["meta"]["author"], "Persisted before ack")

    def test_stale_snapshot_is_rebased_against_server_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_document = create_empty_document("CollabSmoke")
            base_document["meta"]["author"] = "Base"
            base_document["meta"]["date"] = "2026-06-03"
            storage.save("CollabSmoke", base_document)
            manager = CollaborationManager(storage, autosave_interval=0)
            server_document = create_empty_document("CollabSmoke")
            server_document["meta"]["author"] = "Server Author"
            server_document["meta"]["date"] = "2026-06-03"
            session = CollabSession("CollabSmoke", server_document, seq=1, snapshots={0: base_document, 1: server_document})
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-test", "Tester", handler=None)

            local_document = create_empty_document("CollabSmoke")
            local_document["meta"]["author"] = "Base"
            local_document["meta"]["date"] = "2026-06-04"
            record = manager._apply_snapshot(session, client, {"baseSeq": 0, "document": local_document})

            self.assertTrue(record["rebased"])
            self.assertEqual(session.document["meta"]["author"], "Server Author")
            self.assertEqual(session.document["meta"]["date"], "2026-06-04")

    def test_too_old_snapshot_does_not_overwrite_and_writes_conflict_copy(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            server_document = create_empty_document("CollabSmoke")
            server_document["meta"]["author"] = "Server Author"
            storage.save("CollabSmoke", server_document)
            manager = CollaborationManager(storage, autosave_interval=0)
            session = CollabSession("CollabSmoke", server_document, seq=50, snapshots={50: server_document})
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-test", "Tester", handler=None)

            stale_document = create_empty_document("CollabSmoke")
            stale_document["meta"]["author"] = "Local Draft"
            with self.assertRaisesRegex(WebSocketProtocolError, "baseSeq is too old"):
                manager._apply_snapshot(session, client, {"baseSeq": 1, "document": stale_document})

            self.assertEqual(session.document["meta"]["author"], "Server Author")
            conflict_dir = storage._package_dir("CollabSmoke") / "collab" / "conflicts"
            conflict_files = list(conflict_dir.glob("*.json"))
            self.assertEqual(len(conflict_files), 1)
            conflict = json.loads(conflict_files[0].read_text("utf-8"))
            self.assertEqual(conflict["reason"], "baseSeq_too_old")
            self.assertEqual(conflict["serverSeq"], 50)
            self.assertEqual(conflict["baseSeq"], 1)
            self.assertEqual(conflict["document"]["meta"]["author"], "Local Draft")

    def test_named_version_is_readonly_snapshot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "Versioned"
            storage.save("CollabSmoke", document)

            created = storage.create_named_version("CollabSmoke", document, message="评审通过")
            version_id = created["version"]["id"]
            loaded = storage.load_version("CollabSmoke", version_id)
            versions = storage.list_versions("CollabSmoke")

            self.assertEqual(loaded["meta"]["author"], "Versioned")
            self.assertTrue(loaded["meta"]["readonly"])
            self.assertEqual(loaded["meta"]["version_id"], version_id)
            self.assertEqual(versions[0]["id"], version_id)
            self.assertEqual(versions[0]["message"], "评审通过")

    def test_snapshot_changelog_compacts_after_threshold(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage)
            for seq in range(1, 105):
                record = {
                    "seq": seq,
                    "doc": "CollabSmoke",
                    "user": "Tester",
                    "clientId": "client-test",
                    "ts": "2026-05-29T00:00:00+00:00",
                    "mode": "snapshot" if seq == 104 else "change",
                    "document": document if seq == 104 else None,
                    "changes": [{"path": "meta.author", "new": f"Tester {seq}"}],
                }
                manager._append_changelog("CollabSmoke", record)

            changelog = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "changelog.jsonl"
            lines = changelog.read_text("utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            compacted = json.loads(lines[0])
            self.assertTrue(compacted["compacted"])
            self.assertEqual(compacted["seq"], 104)

    def test_snapshot_changelog_compacts_after_size_limit(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["note"] = "x" * (2 * 1024 * 1024 + 1)
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage)
            record = {
                "seq": 1,
                "doc": "CollabSmoke",
                "user": "Tester",
                "clientId": "client-test",
                "ts": "2026-05-29T00:00:00+00:00",
                "mode": "snapshot",
                "document": document,
            }

            manager._append_changelog("CollabSmoke", record)

            changelog = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "changelog.jsonl"
            lines = changelog.read_text("utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            self.assertTrue(json.loads(lines[0])["compacted"])


if __name__ == "__main__":
    unittest.main()
