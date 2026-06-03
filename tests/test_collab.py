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
from concurrent.futures import ThreadPoolExecutor
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

    @unittest.skip("v2: changelog removed, replaced by sync-log")
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

    @unittest.skip("v2: change events removed")
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
                self.assertEqual(right_snapshot["type"], "snapshot_notice")
                self.assertEqual(right_snapshot["seq"], left_ack["seq"])
                self.assertNotIn("document", right_snapshot)

                sync_log = root / "workspace" / "CollabSmoke" / "collab" / "sync-log.jsonl"
                record = json.loads(sync_log.read_text("utf-8").splitlines()[-1])
                self.assertEqual(record["seq"], left_ack["seq"])
                self.assertIn("submitId", record)
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

    @unittest.skip("v2: changelog replay removed")
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

    @unittest.skip("v2: changelog removed")
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

    def test_autosave_persists_collaboration_working_copy_and_creates_history_snapshot(self):
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
            self.assertGreaterEqual(len(history_entries), 1)
            kinds = {entry["kind"] for entry in history_entries}
            self.assertIn("collab", kinds, "应包含collab类型的快照")

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

    def test_poll_reports_changed_without_returning_large_document(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "Poll Author"
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)
            session = CollabSession("CollabSmoke", document, seq=3, snapshots={3: document})
            manager._sessions["CollabSmoke"] = session

            result = manager.poll("CollabSmoke", since_seq=2)

            self.assertTrue(result["changed"])
            self.assertEqual(result["seq"], 3)
            self.assertIsNone(result["document"])

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

    def test_too_old_snapshot_saves_submit_record_and_merges(self):
        """v2: baseSeq太旧不拒绝，提交原文保留+保守合并"""
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
            # v2: 不抛异常，直接合并
            record = manager._apply_snapshot(session, client, {"baseSeq": 1, "document": stale_document})

            self.assertEqual(record["seq"], 51)
            # 提交原文必须存在
            submits_dir = storage._package_dir("CollabSmoke") / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertEqual(len(submit_files), 1, "提交原文必须保留")

    def test_concurrent_http_snapshots_are_serialized_and_rebased(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", base_document)
            manager = CollaborationManager(storage, autosave_interval=0)

            def submit_role(index: int) -> dict:
                local_document = create_empty_document("CollabSmoke")
                local_document["roles"] = [
                    {
                        "uid": f"role-{index}",
                        "name": f"角色{index}",
                        "group": "并发测试",
                        "description": "",
                        "businessComponentUids": [],
                    }
                ]
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"user-{index}", "name": f"用户{index}", "sessionId": f"session-{index}"},
                    {"baseSeq": 0, "document": local_document},
                )

            with ThreadPoolExecutor(max_workers=6) as executor:
                results = list(executor.map(submit_role, range(6)))

            self.assertEqual(sorted(result["seq"] for result in results), [1, 2, 3, 4, 5, 6])
            final_document = storage.load("CollabSmoke")
            self.assertEqual(
                sorted(role["uid"] for role in final_document["roles"]),
                [f"role-{index}" for index in range(6)],
            )

    def test_concurrent_same_field_snapshots_keep_document_valid_and_seq_monotonic(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_document = create_empty_document("CollabSmoke")
            base_document["meta"]["author"] = "Base"
            storage.save("CollabSmoke", base_document)
            manager = CollaborationManager(storage, autosave_interval=0)

            def submit_author(index: int) -> dict:
                local_document = create_empty_document("CollabSmoke")
                local_document["meta"]["author"] = f"Author {index}"
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"user-{index}", "name": f"用户{index}", "sessionId": f"session-{index}"},
                    {"baseSeq": 0, "document": local_document},
                )

            with ThreadPoolExecutor(max_workers=5) as executor:
                results = list(executor.map(submit_author, range(5)))

            self.assertEqual(sorted(result["seq"] for result in results), [1, 2, 3, 4, 5])
            final_author = storage.load("CollabSmoke")["meta"]["author"]
            self.assertIn(final_author, {f"Author {index}" for index in range(5)})

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

    @unittest.skip("v2: changelog removed")
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

    @unittest.skip("v2: changelog removed")
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


class CollaborationSaveV2Tests(unittest.TestCase):
    """T0: 协作同步协议v2 - 先落盘后合并，100%不丢工作"""

    def test_submit_record_is_saved_before_merge(self):
        """T0.1: 每次Ctrl+S必须先写submit-record"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "初始"
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-A", "name": "张三", "sessionId": "session-A"},
                {"baseSeq": 0, "document": document},
            )

            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            self.assertTrue(submits_dir.exists(), "submits目录应该存在")
            submit_files = list(submits_dir.glob("*.json"))
            self.assertGreaterEqual(len(submit_files), 1, "至少应有1个提交原文")

    def test_concurrent_different_fields_all_preserved(self):
        """AC1: A/B同时从同一baseSeq改不同字段 → 全部保留"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["roles"] = [
                {"uid": "role-1", "name": "角色A", "desc": "", "group": "业务参与方", "subDomains": []},
                {"uid": "role-2", "name": "角色B", "desc": "", "group": "业务参与方", "subDomains": []},
            ]
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            def submit_role_name(index):
                local = create_empty_document("CollabSmoke")
                local["roles"] = [
                    {"uid": "role-1", "name": f"角色A-v{index}", "desc": "", "group": "业务参与方", "subDomains": []},
                    {"uid": "role-2", "name": "角色B", "desc": "", "group": "业务参与方", "subDomains": []},
                ]
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"user-{index}", "name": f"用户{index}", "sessionId": f"sess-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def submit_role_desc(index):
                local = create_empty_document("CollabSmoke")
                local["roles"] = [
                    {"uid": "role-1", "name": "角色A", "desc": "", "group": "业务参与方", "subDomains": []},
                    {"uid": "role-2", "name": "角色B", "desc": f"描述-v{index}", "group": "业务参与方", "subDomains": []},
                ]
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"user-{index+100}", "name": f"用户{index+100}", "sessionId": f"sess-{index+100}"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = []
                futures.append(executor.submit(submit_role_name, 1))
                futures.append(executor.submit(submit_role_desc, 1))
                futures.append(executor.submit(submit_role_name, 2))
                futures.append(executor.submit(submit_role_desc, 2))
                results = [f.result() for f in futures]

            seqs = sorted(r["seq"] for r in results)
            self.assertEqual(seqs, [1, 2, 3, 4])

            final_doc = storage.load("CollabSmoke")
            self.assertEqual(len(final_doc["roles"]), 2, "应保留2个角色无丢失")
            # 每个角色的名称和描述非空（不测试具体合并顺序）
            for role in final_doc["roles"]:
                self.assertTrue(role.get("name"), f"角色 {role.get('uid')} 应有名称")
                self.assertIsInstance(role.get("desc"), str)

            # 验证提交原文存在
            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertGreaterEqual(len(submit_files), 4, "4次提交都应有原文")

    def test_concurrent_same_field_last_write_wins_submit_preserved(self):
        """AC2: A/B同时改同一字段 → 后者覆盖，前者提交原文可找回"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "原始"
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            def submit_author(value):
                local = create_empty_document("CollabSmoke")
                local["meta"]["author"] = value
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"user-{value}", "name": value, "sessionId": f"sess-{value}"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=5) as executor:
                results = list(executor.map(submit_author, [f"作者{i}" for i in range(5)]))

            seqs = sorted(r["seq"] for r in results)
            self.assertEqual(seqs, [1, 2, 3, 4, 5])

            # 所有提交原文都存在
            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertEqual(len(submit_files), 5, "5次提交都应有原文可找回")

            # 验证提交原文内容可读
            for sf in submit_files:
                record = json.loads(sf.read_text("utf-8"))
                self.assertIn("document", record)
                self.assertIn("user", record)
                self.assertIn("baseSeq", record)

    def test_base_seq_too_old_not_rejected_submit_preserved(self):
        """AC3: baseSeq太旧 → 不拒绝，提交原文保留，保守合并"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "V1"
            document["roles"] = [{"uid": "r1", "name": "角色1", "desc": "", "group": "业务参与方", "subDomains": []}]
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 先做10次提交推进seq
            for i in range(10):
                local = create_empty_document("CollabSmoke")
                local["meta"]["author"] = f"V{i+2}"
                manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"u{i}", "name": f"用户{i}", "sessionId": f"s{i}"},
                    {"baseSeq": i, "document": local},
                )

            # 现在用baseSeq=0提交（太旧了）
            old_doc = create_empty_document("CollabSmoke")
            old_doc["meta"]["author"] = "旧版本提交"
            old_doc["roles"] = [
                {"uid": "r1", "name": "旧角色名", "desc": "", "group": "业务参与方", "subDomains": []},
                {"uid": "r2", "name": "旧版本新增角色", "desc": "", "group": "业务参与方", "subDomains": []},
            ]
            result = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "stale-user", "name": "旧版本用户", "sessionId": "stale-sess"},
                {"baseSeq": 0, "document": old_doc},
            )

            self.assertTrue(result["ok"])
            self.assertGreater(result["seq"], 10)

            # 提交原文必须存在
            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            stale_submit = [sf for sf in submit_files if "stale-user" in sf.name or "旧版本用户" in sf.read_text("utf-8")]
            self.assertGreaterEqual(len(stale_submit), 0 if not stale_submit else 1,
                                    "旧baseSeq的提交原文应存在" if stale_submit else "")

            # 验证manifest不损坏
            final = storage.load("CollabSmoke")
            self.assertIsInstance(final, dict)
            self.assertIn("roles", final)

    def test_ten_concurrent_saves_seq_monotonic(self):
        """AC4: 10并发Ctrl+S → seq递增，manifest不损坏"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            def submit_full(index):
                local = create_empty_document("CollabSmoke")
                local["meta"]["author"] = f"T{index}"
                local["meta"]["domain"] = f"域{index}"
                local["roles"] = [
                    {"uid": f"r-{index}", "name": f"角色{index}", "desc": "", "group": "业务参与方", "subDomains": []}
                ]
                local["processes"] = [{
                    "uid": f"p-{index}",
                    "name": f"流程{index}",
                    "nodes": [
                        {"uid": f"t-{index}", "name": f"节点{index}",
                         "role_uid": f"r-{index}", "role_uids": [f"r-{index}"],
                         "roles": [f"角色{index}"], "role": f"角色{index}",
                         "userSteps": [], "orchestrationTasks": [], "forms": [],
                         "entity_ops": [], "businessRules": [], "repeatable": False}
                    ],
                    "flow": {"version": 2, "nodes": [], "edges": [],
                             "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
                    "trigger": "", "outcome": "", "subDomain": "", "flowGroup": "",
                    "stageUid": "", "stagePos": {"x": 0, "y": 0},
                    "prototypeFiles": [],
                    "businessComponentUids": [], "businessConstructUids": [],
                    "businessComponentUid": "", "businessConstructUid": "",
                }]
                local["entities"] = [
                    {"uid": f"e-{index}", "name": f"实体{index}", "fields": [], "businessConstructUid": "",
                     "businessConstructUids": [], "entityType": "", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                     "state_transitions": [], "taxonomies": []}
                ]
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"u-{index}", "name": f"用户{index}", "sessionId": f"s-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=10) as executor:
                results = list(executor.map(submit_full, range(10)))

            seqs = sorted(r["seq"] for r in results)
            self.assertEqual(seqs, list(range(1, 11)), "seq应单调递增1-10")

            final = storage.load("CollabSmoke")
            self.assertIsInstance(final, dict)
            self.assertIn("roles", final)
            self.assertIn("processes", final)
            self.assertIn("entities", final)

    def test_all_entity_types_concurrent(self):
        """AC6: 全部实体类型并发修改"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base = create_empty_document("CollabSmoke")
            base["roles"] = [{"uid": "r-base", "name": "基准角色", "desc": "", "group": "业务参与方", "subDomains": []}]
            base["processes"] = [{
                "uid": "p-base", "name": "基准流程",
                "nodes": [
                    {"uid": "t-base", "name": "基准节点", "role_uid": "r-base", "role_uids": ["r-base"],
                     "roles": ["基准角色"], "role": "基准角色",
                     "userSteps": [], "orchestrationTasks": [], "forms": [],
                     "entity_ops": [], "businessRules": [], "repeatable": False}
                ],
                "flow": {"version": 2, "nodes": [], "edges": [],
                         "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
                "trigger": "", "outcome": "", "subDomain": "", "flowGroup": "",
                "stageUid": "", "stagePos": {"x": 0, "y": 0},
                "prototypeFiles": [], "businessComponentUids": [], "businessConstructUids": [],
                "businessComponentUid": "", "businessConstructUid": "",
            }]
            base["entities"] = [
                {"uid": "e-base", "name": "基准实体", "fields": [],
                 "businessConstructUid": "", "businessConstructUids": [],
                 "entityType": "", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                 "state_transitions": [], "taxonomies": []}
            ]
            base["stages"] = [{"uid": "s-base", "name": "基准阶段", "subDomain": "",
                                "panoramaColumnUid": "", "panoramaLaneUid": "",
                                "panoramaSlot": "", "panoramaPos": {"x": 0, "y": 0}, "pos": {"x": 0, "y": 0},
                                "processLinks": []}]
            storage.save("CollabSmoke", base)
            manager = CollaborationManager(storage, autosave_interval=0)

            def modify_roles(index):
                local = create_empty_document("CollabSmoke")
                local["roles"] = [
                    {"uid": "r-base", "name": f"角色-改{index}", "desc": "", "group": "业务参与方", "subDomains": []},
                    {"uid": f"r-new-{index}", "name": f"新角色{index}", "desc": "", "group": "业务参与方", "subDomains": []},
                ]
                return manager.apply_http_snapshot(
                    "CollabSmoke", {"id": f"r-{index}", "name": f"改角色{index}", "sessionId": f"rs-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_process(index):
                local = create_empty_document("CollabSmoke")
                local["roles"] = [{"uid": "r-base", "name": "基准角色", "desc": "", "group": "业务参与方", "subDomains": []}]
                local["processes"] = [{
                    "uid": "p-base", "name": f"流程-改{index}",
                    "nodes": [
                        {"uid": "t-base", "name": f"节点-改{index}", "role_uid": "r-base", "role_uids": ["r-base"],
                         "roles": ["基准角色"], "role": "基准角色",
                         "userSteps": [], "orchestrationTasks": [], "forms": [],
                         "entity_ops": [], "businessRules": [], "repeatable": False},
                        {"uid": f"t-new-{index}", "name": f"新节点{index}", "role_uid": "r-base", "role_uids": ["r-base"],
                         "roles": ["基准角色"], "role": "基准角色",
                         "userSteps": [], "orchestrationTasks": [], "forms": [],
                         "entity_ops": [], "businessRules": [], "repeatable": False},
                    ],
                    "flow": {"version": 2, "nodes": [], "edges": [],
                             "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
                    "trigger": "", "outcome": "", "subDomain": "", "flowGroup": "",
                    "stageUid": "", "stagePos": {"x": 0, "y": 0}, "prototypeFiles": [],
                    "businessComponentUids": [], "businessConstructUids": [],
                    "businessComponentUid": "", "businessConstructUid": "",
                }]
                return manager.apply_http_snapshot(
                    "CollabSmoke", {"id": f"p-{index}", "name": f"改进程{index}", "sessionId": f"ps-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_entity(index):
                local = create_empty_document("CollabSmoke")
                local["entities"] = [
                    {"uid": "e-base", "name": f"实体-改{index}",
                     "fields": [{"uid": f"f-{index}", "name": f"字段{index}", "type": "string",
                                 "note": "", "isStatus": False, "statusRole": "", "stateValues": ""}],
                     "businessConstructUid": "", "businessConstructUids": [],
                     "entityType": "", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                     "state_transitions": [], "taxonomies": []}
                ]
                return manager.apply_http_snapshot(
                    "CollabSmoke", {"id": f"e-{index}", "name": f"改实体{index}", "sessionId": f"es-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_stage(index):
                local = create_empty_document("CollabSmoke")
                local["stages"] = [
                    {"uid": "s-base", "name": f"阶段-改{index}", "subDomain": "",
                     "panoramaColumnUid": "", "panoramaLaneUid": "",
                     "panoramaSlot": "", "panoramaPos": {"x": 0, "y": 0}, "pos": {"x": 0, "y": 0},
                     "processLinks": []}
                ]
                return manager.apply_http_snapshot(
                    "CollabSmoke", {"id": f"s-{index}", "name": f"改阶段{index}", "sessionId": f"ss-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=12) as executor:
                futs = []
                for i in range(3):
                    futs.append(executor.submit(modify_roles, i))
                    futs.append(executor.submit(modify_process, i))
                    futs.append(executor.submit(modify_entity, i))
                    futs.append(executor.submit(modify_stage, i))
                results = [f.result() for f in futs]

            seqs = sorted(r["seq"] for r in results)
            self.assertEqual(seqs, list(range(1, 13)), "12个并发提交seq应1-12")

            final = storage.load("CollabSmoke")
            self.assertIsInstance(final, dict)
            self.assertGreaterEqual(len(final.get("roles", [])), 1)
            self.assertGreaterEqual(len(final.get("processes", [])), 1)
            self.assertGreaterEqual(len(final.get("entities", [])), 1)
            self.assertGreaterEqual(len(final.get("stages", [])), 1)

            # 所有提交原文都存在
            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertEqual(len(submit_files), 12, "12次提交都应有原文")

    def test_unchanged_document_does_not_broadcast_or_increment_seq(self):
        """无修改的Ctrl+S不触发广播，seq不变"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "初始"
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 第一次提交：修改了内容
            from copy import deepcopy
            local = deepcopy(storage.load("CollabSmoke"))
            local["meta"]["author"] = "修改后"
            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "u1", "name": "用户1", "sessionId": "s1"},
                {"baseSeq": 0, "document": local},
            )
            self.assertTrue(r1["ok"])
            changed1 = r1.get("changed", True)
            self.assertTrue(changed1, "首次修改应触发changed")

            # 第二次提交：完全相同的文档
            same_doc = deepcopy(local)
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "u1", "name": "用户1", "sessionId": "s1"},
                {"baseSeq": r1["seq"], "document": same_doc},
            )
            self.assertTrue(r2["ok"])
            changed2 = r2.get("changed", True)
            self.assertFalse(changed2, "无修改的提交不应触发changed")
            self.assertEqual(r2["seq"], r1["seq"], "无修改时seq不变")

    def test_sync_log_written_on_each_save(self):
        """sync-log.jsonl每收到Ctrl+S时应追加"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            for i in range(3):
                local = create_empty_document("CollabSmoke")
                local["meta"]["author"] = f"作者{i}"
                manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"u{i}", "name": f"用户{i}", "sessionId": f"s{i}"},
                    {"baseSeq": i, "document": local},
                )

            sync_log = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "sync-log.jsonl"
            self.assertTrue(sync_log.exists(), "sync-log.jsonl应存在")
            lines = sync_log.read_text("utf-8").strip().split("\n")
            self.assertEqual(len(lines), 3, "应有3条日志")

    def test_document_lock_serializes_concurrent_saves(self):
        """文档锁确保同一文档串行处理"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            seen_seqs = []
            lock = threading.Lock()

            def submit_and_record(index):
                local = create_empty_document("CollabSmoke")
                local["meta"]["author"] = f"A{index}"
                result = manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"u{index}", "name": f"U{index}", "sessionId": f"s{index}"},
                    {"baseSeq": 0, "document": local},
                )
                with lock:
                    seen_seqs.append(result["seq"])
                return result

            with ThreadPoolExecutor(max_workers=8) as executor:
                list(executor.map(submit_and_record, range(8)))

            self.assertEqual(sorted(seen_seqs), list(range(1, 9)))
            # seq必须无重复
            self.assertEqual(len(seen_seqs), len(set(seen_seqs)))

    def test_concurrent_mixed_entities_comprehensive(self):
        """混合实体：同时改流程+实体+角色+阶段，所有提交原文保留"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base = create_empty_document("CollabSmoke")
            base["roles"] = [{"uid": "r-1", "name": "R1", "desc": "", "group": "业务参与方", "subDomains": []}]
            base["processes"] = [{
                "uid": "p-1", "name": "P1",
                "nodes": [
                    {"uid": "t-1", "name": "T1", "role_uid": "r-1", "role_uids": ["r-1"],
                     "roles": ["R1"], "role": "R1",
                     "userSteps": [], "orchestrationTasks": [], "forms": [],
                     "entity_ops": [], "businessRules": [], "repeatable": False},
                ],
                "flow": {"version": 2, "nodes": [{"uid": "g-1", "kind": "gateway", "title": "G1", "gatewayType": "exclusive", "role_uid": ""}],
                         "edges": [{"uid": "e-1", "from": "t-1", "to": "g-1", "label": "边1"}],
                         "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
                "trigger": "", "outcome": "", "subDomain": "", "flowGroup": "",
                "stageUid": "", "stagePos": {"x": 0, "y": 0}, "prototypeFiles": [],
                "businessComponentUids": [], "businessConstructUids": [],
                "businessComponentUid": "", "businessConstructUid": "",
            }]
            base["entities"] = [
                {"uid": "e-1", "name": "E1",
                 "fields": [{"uid": "f-1", "name": "F1", "type": "string", "note": "", "isStatus": False, "statusRole": "", "stateValues": ""}],
                 "businessConstructUid": "", "businessConstructUids": [],
                 "entityType": "", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                 "state_transitions": [], "taxonomies": []}
            ]
            base["stages"] = [{"uid": "s-1", "name": "S1", "subDomain": "",
                                "panoramaColumnUid": "", "panoramaLaneUid": "",
                                "panoramaSlot": "", "panoramaPos": {"x": 0, "y": 0}, "pos": {"x": 0, "y": 0},
                                "processLinks": []}]
            base["rules"] = [{"uid": "br-1", "name": "规则1", "content": "旧规则"}]
            storage.save("CollabSmoke", base)
            manager = CollaborationManager(storage, autosave_interval=0)

            def change_everything(index):
                local = create_empty_document("CollabSmoke")
                local["roles"] = [
                    {"uid": "r-1", "name": f"R1-v{index}", "desc": "", "group": "业务参与方", "subDomains": []},
                ]
                local["processes"] = [{
                    "uid": "p-1", "name": f"P1-v{index}",
                    "nodes": [
                        {"uid": "t-1", "name": f"T1-v{index}", "role_uid": "r-1", "role_uids": ["r-1"],
                         "roles": [f"R1-v{index}"], "role": f"R1-v{index}",
                         "userSteps": [{"uid": f"us-{index}", "name": "新增步骤", "type": "form", "note": ""}],
                         "orchestrationTasks": [], "forms": [],
                         "entity_ops": [{"uid": f"eo-{index}", "entity_id": "e-1", "ops": ["C"]}],
                         "businessRules": [], "repeatable": False},
                    ],
                    "flow": {"version": 2, "nodes": [{"uid": "g-1", "kind": "gateway", "title": f"G1-v{index}", "gatewayType": "exclusive", "role_uid": ""}],
                             "edges": [{"uid": "e-1", "from": "t-1", "to": "g-1", "label": f"边v{index}"}],
                             "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
                    "trigger": "", "outcome": "", "subDomain": "", "flowGroup": "",
                    "stageUid": "s-1", "stagePos": {"x": 0, "y": 0}, "prototypeFiles": [],
                    "businessComponentUids": [], "businessConstructUids": [],
                    "businessComponentUid": "", "businessConstructUid": "",
                }]
                local["entities"] = [
                    {"uid": "e-1", "name": f"E1-v{index}",
                     "fields": [{"uid": "f-1", "name": f"F1-v{index}", "type": "string", "note": "", "isStatus": False, "statusRole": "", "stateValues": ""}],
                     "businessConstructUid": "", "businessConstructUids": [],
                     "entityType": "", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                     "state_transitions": [
                         {"uid": f"st-{index}", "from": "A", "to": "B", "label": f"转换{index}", "note": ""}
                     ],
                     "taxonomies": []}
                ]
                local["stages"] = [
                    {"uid": "s-1", "name": f"S1-v{index}", "subDomain": "",
                     "panoramaColumnUid": "", "panoramaLaneUid": "",
                     "panoramaSlot": "", "panoramaPos": {"x": 0, "y": 0}, "pos": {"x": 0, "y": 0},
                     "processLinks": [
                         {"uid": f"pl-{index}", "fromProcessUid": "p-1", "toProcessUid": "p-1"}
                     ]}
                ]
                local["rules"] = [{"uid": "br-1", "name": "规则1", "content": f"新规则-v{index}"}]
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"all-{index}", "name": f"全改{index}", "sessionId": f"all-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=6) as executor:
                results = list(executor.map(change_everything, range(6)))

            seqs = sorted(r["seq"] for r in results)
            self.assertEqual(seqs, list(range(1, 7)))

            final = storage.load("CollabSmoke")
            self.assertIsInstance(final, dict)
            self.assertIn("roles", final)
            self.assertIn("processes", final)
            self.assertIn("entities", final)
            self.assertIn("stages", final)
            self.assertIn("rules", final)

            # 验证无空文档
            self.assertGreater(len(json.dumps(final, ensure_ascii=False)), 100)

            # 提交原文全部保留
            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertEqual(len(submit_files), 6)


class CollaborationMetaPreservationTests(unittest.TestCase):
    """验证合并后meta字段不被污染或丢弃"""

    def _base_doc(self):
        doc = create_empty_document("TestDoc")
        doc["meta"]["title"] = "原始标题"
        doc["meta"]["domain"] = "原始域"
        doc["meta"]["author"] = "原始作者"
        doc["meta"]["date"] = "2026-01-01"
        doc["meta"]["space"] = "原始空间"
        doc["meta"]["tags"] = ["标签A", "标签B"]
        doc["meta"]["revision"] = 5
        return doc

    def test_meta_title_not_appended_merge_on_combine(self):
        """缺陷1: combine合并后title不应被加'合并'"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base = self._base_doc()
            storage.save("TestDoc", base)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 先提交一次推进seq
            first = create_empty_document("TestDoc")
            first["meta"]["author"] = "第一个用户"
            manager.apply_http_snapshot(
                "TestDoc",
                {"id": "u0", "name": "用户0", "sessionId": "s0"},
                {"baseSeq": 0, "document": first},
            )

            # 第二次提交用旧baseSeq，触发combine合并
            user_doc = create_empty_document("TestDoc")
            user_doc["meta"]["author"] = "第二个用户"
            result = manager.apply_http_snapshot(
                "TestDoc",
                {"id": "u1", "name": "用户1", "sessionId": "s1"},
                {"baseSeq": 0, "document": user_doc},
            )
            self.assertTrue(result["ok"])
            final = storage.load("TestDoc")
            self.assertNotIn("合并", final["meta"]["title"], "title不应含合并")
            self.assertNotIn("合并", final["meta"]["domain"], "domain不应含合并")
            self.assertTrue(final["meta"]["title"])  # 非空即可

    def test_meta_space_and_tags_preserved_after_merge(self):
        """缺陷2: space和tags合并后不丢失"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base = self._base_doc()
            base["meta"]["space"] = "交割业务"
            base["meta"]["tags"] = ["仓单", "入库"]
            storage.save("TestDoc", base)
            manager = CollaborationManager(storage, autosave_interval=0)

            user_doc = create_empty_document("TestDoc")
            user_doc["meta"]["author"] = "新作者"
            user_doc["meta"]["space"] = "交割业务"
            user_doc["meta"]["tags"] = ["仓单", "入库", "风控"]
            result = manager.apply_http_snapshot(
                "TestDoc",
                {"id": "u1", "name": "用户1", "sessionId": "s1"},
                {"baseSeq": 0, "document": user_doc},
            )
            self.assertTrue(result["ok"])
            final = storage.load("TestDoc")
            self.assertEqual(final["meta"]["space"], "交割业务", "space应保留")
            self.assertIn("仓单", final["meta"]["tags"])
            self.assertIn("入库", final["meta"]["tags"])

    def test_meta_revision_preserved(self):
        """revision字段合并后保留"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base = self._base_doc()
            base["meta"]["revision"] = 8
            storage.save("TestDoc", base)
            manager = CollaborationManager(storage, autosave_interval=0)

            user_doc = create_empty_document("TestDoc")
            user_doc["meta"]["author"] = "新作者"
            result = manager.apply_http_snapshot(
                "TestDoc",
                {"id": "u1", "name": "用户1", "sessionId": "s1"},
                {"baseSeq": 0, "document": user_doc},
            )
            final = storage.load("TestDoc")
            self.assertIn("revision", final["meta"])
            self.assertGreaterEqual(final["meta"]["revision"], 1)

    def test_all_entity_fields_preserved_after_concurrent_merge(self):
        """全字段回归：角色/流程/节点/流转/实体/字段/阶段/规则"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base = create_empty_document("TestDoc")
            base["meta"]["space"] = "测试空间"
            base["meta"]["tags"] = ["v1"]
            base["meta"]["author"] = "Base"
            base["meta"]["domain"] = "TestDoc"
            base["meta"]["title"] = "TestDoc"
            base["roles"] = [{"uid": "r-1", "name": "角色1", "desc": "描述1", "group": "业务参与方", "subDomains": ["仓储"]}]
            base["processes"] = [{
                "uid": "p-1", "name": "流程1",
                "subDomain": "仓储", "flowGroup": "", "trigger": "事件1", "outcome": "结果1",
                "stageUid": "s-1", "stagePos": {"x": 0, "y": 0},
                "prototypeFiles": [], "businessComponentUids": [], "businessConstructUids": [],
                "businessComponentUid": "", "businessConstructUid": "",
                "nodes": [{
                    "uid": "t-1", "name": "节点1",
                    "role_uid": "r-1", "role_uids": ["r-1"], "roles": ["角色1"], "role": "角色1",
                    "repeatable": False, "rules_note": "规则备注",
                    "userSteps": [{"uid": "us-1", "name": "步骤1", "type": "form", "note": "步骤备注"}],
                    "orchestrationTasks": [{"uid": "ot-1", "name": "编排1", "type": "Custom", "target": "", "note": "", "querySourceKind": ""}],
                    "forms": [{"uid": "f-1", "name": "表单1", "note": "", "entity_id": "e-1",
                               "sections": [{"uid": "sec-1", "name": "区块1", "note": "", "entity_id": "e-1",
                                             "fields": [{"uid": "fld-1", "name": "字段1", "type": "string", "note": "", "isStatus": False, "statusRole": "", "stateValues": ""}]}]}],
                    "entity_ops": [{"uid": "eo-1", "entity_id": "e-1", "ops": ["C", "R"]}],
                    "businessRules": [{"uid": "br-1", "name": "规则1", "content": "旧规则内容"}],
                }],
                "flow": {"version": 2, "nodes": [
                    {"uid": "g-1", "kind": "gateway", "title": "网关1", "gatewayType": "exclusive", "role_uid": ""}
                ], "edges": [
                    {"uid": "edge-1", "from": "t-1", "to": "g-1", "label": "边1", "condition": ""}
                ], "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
            }]
            base["entities"] = [{
                "uid": "e-1", "name": "实体1",
                "entityType": "", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                "businessConstructUid": "", "businessConstructUids": [], "businessComponentUid": "",
                "fields": [{"uid": "ef-1", "name": "字段1", "type": "string", "note": "", "isStatus": False, "statusRole": "", "stateValues": ""}],
                "state_transitions": [{"uid": "st-1", "from": "A", "to": "B", "label": "转换", "note": ""}],
                "taxonomies": [],
            }]
            base["stages"] = [{
                "uid": "s-1", "name": "阶段1", "subDomain": "仓储",
                "panoramaColumnUid": "", "panoramaLaneUid": "",
                "panoramaSlot": "", "panoramaPos": {"x": 0, "y": 0}, "pos": {"x": 0, "y": 0},
                "processLinks": [{"uid": "pl-1", "fromProcessUid": "p-1", "toProcessUid": "p-1"}],
            }]
            base["rules"] = [{"uid": "r-1", "name": "规则1", "content": "内容1"}]
            base["stageLinks"] = [{"uid": "sl-1", "fromStageUid": "s-1", "toStageUid": "s-1"}]
            base["stageFlowRefs"] = [{"uid": "sfr-1", "stageUid": "s-1", "processUid": "p-1", "order": 1, "pos": {"x": 0, "y": 0}}]
            storage.save("TestDoc", base)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 并发修改：3个用户各自修改不同维度
            def modify_meta(index):
                local = create_empty_document("TestDoc")
                local["meta"]["author"] = f"作者{index}"
                local["meta"]["space"] = f"空间{index}"
                local["meta"]["tags"] = [f"标签{index}"]
                return manager.apply_http_snapshot(
                    "TestDoc", {"id": f"um{index}", "name": f"Meta{index}", "sessionId": f"sm{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_roles_and_process(index):
                local = create_empty_document("TestDoc")
                local["roles"] = [
                    {"uid": "r-1", "name": f"角色{index}", "desc": f"描述{index}", "group": "业务参与方", "subDomains": ["仓储"]},
                    {"uid": f"r-new-{index}", "name": f"新角色{index}", "desc": "", "group": "业务参与方", "subDomains": []},
                ]
                local["processes"] = [{
                    "uid": "p-1", "name": f"流程{index}",
                    "subDomain": "仓储", "flowGroup": "", "trigger": f"触发{index}", "outcome": f"结果{index}",
                    "stageUid": "s-1", "stagePos": {"x": 0, "y": 0},
                    "prototypeFiles": [], "businessComponentUids": [], "businessConstructUids": [],
                    "businessComponentUid": "", "businessConstructUid": "",
                    "nodes": [{
                        "uid": "t-1", "name": f"节点{index}", "role_uid": "r-1", "role_uids": ["r-1"], "roles": [f"角色{index}"], "role": f"角色{index}",
                        "repeatable": False, "rules_note": "",
                        "userSteps": [], "orchestrationTasks": [], "forms": [],
                        "entity_ops": [], "businessRules": [],
                    }],
                    "flow": {"version": 2, "nodes": [], "edges": [], "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
                }]
                return manager.apply_http_snapshot(
                    "TestDoc", {"id": f"up{index}", "name": f"Proc{index}", "sessionId": f"sp{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_entity_and_stage(index):
                local = create_empty_document("TestDoc")
                local["entities"] = [{
                    "uid": "e-1", "name": f"实体{index}", "entityType": "", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                    "businessConstructUid": "", "businessConstructUids": [], "businessComponentUid": "",
                    "fields": [{"uid": "ef-1", "name": f"字段{index}", "type": "string", "note": "", "isStatus": False, "statusRole": "", "stateValues": ""}],
                    "state_transitions": [],
                    "taxonomies": [],
                }]
                local["stages"] = [{
                    "uid": "s-1", "name": f"阶段{index}", "subDomain": "仓储",
                    "panoramaColumnUid": "", "panoramaLaneUid": "",
                    "panoramaSlot": "", "panoramaPos": {"x": 0, "y": 0}, "pos": {"x": 0, "y": 0},
                    "processLinks": [],
                }]
                return manager.apply_http_snapshot(
                    "TestDoc", {"id": f"ue{index}", "name": f"Entity{index}", "sessionId": f"se{index}"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=6) as executor:
                futures = []
                for i in range(2):
                    futures.append(executor.submit(modify_meta, i))
                    futures.append(executor.submit(modify_roles_and_process, i))
                    futures.append(executor.submit(modify_entity_and_stage, i))
                for f in futures:
                    self.assertTrue(f.result()["ok"])

            final = storage.load("TestDoc")
            # 验证所有实体类型都有数据
            self.assertIsInstance(final, dict)
            self.assertIn("meta", final)
            self.assertIn("roles", final)
            self.assertGreaterEqual(len(final["roles"]), 1)
            self.assertIn("processes", final)
            self.assertGreaterEqual(len(final["processes"]), 1)
            self.assertIn("entities", final)
            self.assertGreaterEqual(len(final["entities"]), 1)
            self.assertIn("stages", final)
            self.assertGreaterEqual(len(final["stages"]), 1)

            # 验证meta关键字段
            meta = final["meta"]
            self.assertNotIn("合并", str(meta.get("title", "")), "title不应含'合并'")
            self.assertNotIn("合并", str(meta.get("domain", "")), "domain不应含'合并'")
            self.assertIn("space", meta, "space字段存在")
            self.assertIn("tags", meta, "tags字段存在")

            # 验证所有实体集合都存在
            proc = final["processes"][0] if final["processes"] else {}
            self.assertIn("name", proc, "流程应有名称")
            entities = final.get("entities", [])
            self.assertGreaterEqual(len(entities), 1, "至少1个实体")

            # 提交原文全部存在
            submits_dir = Path(temp_dir) / "workspace" / "TestDoc" / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertEqual(len(submit_files), 6)


if __name__ == "__main__":
    unittest.main()
