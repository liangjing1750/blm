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

from copy import deepcopy

from blm_core.collab import CollabClient, CollabSession, CollaborationManager, WebSocketProtocolError, _doc_hash
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
        """v2: baseSeq太旧不拒绝，提交原文保留，不同字段自动合并"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            server_document = create_empty_document("CollabSmoke")
            server_document["meta"]["author"] = "Server Author"
            storage.save("CollabSmoke", server_document)
            manager = CollaborationManager(storage, autosave_interval=0)
            session = CollabSession("CollabSmoke", server_document, seq=50, snapshots={50: server_document})
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-test", "Tester", handler=None)

            # 用server doc做base，只改不同字段(避免冲突)
            stale_document = deepcopy(server_document)
            stale_document["meta"]["date"] = "2026-06-04"  # 不同字段，不冲突
            record = manager._apply_snapshot(session, client, {"baseSeq": 1, "document": stale_document})

            self.assertEqual(record["seq"], 51)
            self.assertEqual(session.document["meta"]["date"], "2026-06-04")
            submits_dir = storage._package_dir("CollabSmoke") / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertEqual(len(submit_files), 1, "提交原文必须保留")

    def test_snapshot_with_current_seq_but_unverified_base_preserves_server_items(self):
        """旧客户端可能只同步seq，没有同步内容；不能让它用旧稿覆盖服务端。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            server_document = create_empty_document("CollabSmoke")
            server_document["processes"] = [{"uid": "proc-li", "name": "李龙谱流程", "nodes": []}]
            storage.save("CollabSmoke", server_document)
            manager = CollaborationManager(storage, autosave_interval=0)
            session = CollabSession(
                "CollabSmoke",
                deepcopy(server_document),
                seq=6,
                snapshots={6: deepcopy(server_document)},
            )
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-old", "旧客户端", handler=None)

            stale_local = create_empty_document("CollabSmoke")
            stale_local["processes"] = [{"uid": "proc-fan", "name": "樊朝鹏新增流程", "nodes": []}]
            record = manager._apply_snapshot(session, client, {"baseSeq": 6, "document": stale_local})

            self.assertTrue(record["rebased"])
            self.assertEqual(record["seq"], 7)
            self.assertEqual(
                sorted(process["name"] for process in session.document["processes"]),
                ["李龙谱流程", "樊朝鹏新增流程"],
            )

    def test_snapshot_with_verified_current_base_allows_intentional_delete(self):
        """新客户端带正确基线hash时，baseSeq相同的整稿替换可以表达用户主动删除。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            server_document = create_empty_document("CollabSmoke")
            server_document["processes"] = [{"uid": "proc-remove", "name": "待删除流程", "nodes": []}]
            storage.save("CollabSmoke", server_document)
            manager = CollaborationManager(storage, autosave_interval=0)
            session = CollabSession(
                "CollabSmoke",
                deepcopy(server_document),
                seq=9,
                snapshots={9: deepcopy(server_document)},
            )
            session._doc_hash_cache = _doc_hash(server_document)
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-new", "新客户端", handler=None)

            latest_local = deepcopy(server_document)
            latest_local["processes"] = []
            record = manager._apply_snapshot(
                session,
                client,
                {
                    "baseSeq": 9,
                    "baseDocumentHash": _doc_hash(server_document),
                    "document": latest_local,
                },
            )

            self.assertFalse(record["rebased"])
            self.assertEqual(record["seq"], 10)
            self.assertEqual(session.document["processes"], [])

    def test_stale_snapshot_three_way_keeps_server_and_user_additions(self):
        """有真实base时，3-way合并要同时保留服务端新增和用户本地新增。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_document = create_empty_document("CollabSmoke")
            base_document["processes"] = [{"uid": "proc-base", "name": "共同基线流程", "nodes": []}]
            server_document = deepcopy(base_document)
            server_document["processes"].append({"uid": "proc-server", "name": "服务端新增流程", "nodes": []})
            storage.save("CollabSmoke", server_document)
            manager = CollaborationManager(storage, autosave_interval=0)
            session = CollabSession(
                "CollabSmoke",
                deepcopy(server_document),
                seq=2,
                snapshots={1: deepcopy(base_document), 2: deepcopy(server_document)},
            )
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-user", "本地用户", handler=None)

            user_document = deepcopy(base_document)
            user_document["processes"].append({"uid": "proc-user", "name": "本地新增流程", "nodes": []})
            record = manager._apply_snapshot(session, client, {"baseSeq": 1, "document": user_document})

            self.assertTrue(record["rebased"])
            self.assertEqual(record["seq"], 3)
            self.assertEqual(
                {process["name"] for process in session.document["processes"]},
                {"共同基线流程", "本地新增流程", "服务端新增流程"},
            )

    def test_stale_snapshot_three_way_merges_process_flow_and_form_details(self):
        """恢复旧提交后再同步时，流程结构、节点表单和另一方新增任务都不能丢。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_document = create_empty_document("CollabSmoke")
            base_document["processes"] = [
                {
                    "uid": "proc-1",
                    "name": "仓库信息维护",
                    "nodes": [
                        {
                            "uid": "node-1",
                            "name": "提交仓库信息",
                            "userSteps": [],
                            "entity_ops": [],
                            "orchestrationTasks": [],
                            "businessRules": [],
                            "forms": [],
                        }
                    ],
                    "flow": {
                        "version": 2,
                        "orientation": "horizontal",
                        "nodes": [],
                        "edges": [{"uid": "edge-start", "from": "START", "to": "node-1", "label": ""}],
                        "layout": {},
                    },
                }
            ]
            base_document["taskDefinitions"] = []
            storage.save("CollabSmoke", base_document)
            manager = CollaborationManager(storage, autosave_interval=0)

            server_document = deepcopy(base_document)
            server_document["taskDefinitions"] = [
                {"uid": "task-add-warehouse", "name": "新增仓库信息", "type": "Service", "target": "Warehouse.add"},
                {"uid": "task-edit-warehouse", "name": "修改仓库信息", "type": "Service", "target": "Warehouse.edit"},
            ]
            server_document["processes"][0]["nodes"][0]["forms"] = [
                {
                    "uid": "form-warehouse",
                    "name": "仓库信息表单",
                    "sections": [
                        {
                            "uid": "section-basic",
                            "name": "基本信息",
                            "fields": [
                                {"uid": "field-name", "name": "仓库名称", "type": "string"},
                                {"uid": "field-code", "name": "仓库代码", "type": "string"},
                            ],
                        }
                    ],
                }
            ]
            server_document["processes"][0]["flow"]["edges"].append(
                {"uid": "edge-end", "from": "node-1", "to": "END", "label": "提交"}
            )
            storage.save("CollabSmoke", server_document)
            session = CollabSession(
                "CollabSmoke",
                deepcopy(server_document),
                seq=2,
                snapshots={1: deepcopy(base_document), 2: deepcopy(server_document)},
            )
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-recover", "恢复用户", handler=None)

            recovered_document = deepcopy(base_document)
            recovered_document["processes"][0]["nodes"][0]["userSteps"] = [
                {"uid": "step-1", "name": "填写仓库信息", "note": "恢复版本里的用户步骤"}
            ]
            recovered_document["processes"][0]["flow"]["nodes"] = [
                {"uid": "gateway-1", "kind": "gateway", "title": "是否需要复核"}
            ]
            recovered_document["processes"][0]["flow"]["edges"].append(
                {"uid": "edge-gateway", "from": "node-1", "to": "gateway-1", "label": "复核"}
            )

            record = manager._apply_snapshot(
                session,
                client,
                {"baseSeq": 1, "document": recovered_document, "recoveryMode": True},
            )

            self.assertTrue(record["rebased"])
            self.assertEqual(record["seq"], 3)
            final_process = session.document["processes"][0]
            self.assertEqual(
                {task["name"] for task in session.document["taskDefinitions"]},
                {"新增仓库信息", "修改仓库信息"},
            )
            self.assertEqual(final_process["nodes"][0]["userSteps"][0]["name"], "填写仓库信息")
            self.assertEqual(final_process["nodes"][0]["forms"][0]["sections"][0]["fields"][0]["name"], "仓库名称")
            self.assertEqual(
                {edge["uid"] for edge in final_process["flow"]["edges"]},
                {"edge-start", "edge-end", "edge-gateway"},
            )
            self.assertEqual(final_process["flow"]["nodes"][0]["title"], "是否需要复核")

    def test_stale_snapshot_delete_modify_is_preserved_without_blocking(self):
        """落后提交与服务端删除形成delete_modify时，协作恢复应保留对象并继续提交。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_document = create_empty_document("CollabSmoke")
            base_document["entities"] = [
                {"uid": "entity-1", "name": "仓库信息", "fields": [{"uid": "field-1", "name": "仓库名称"}]},
            ]
            storage.save("CollabSmoke", base_document)
            manager = CollaborationManager(storage, autosave_interval=0)

            server_document = deepcopy(base_document)
            server_document["entities"] = []
            session = CollabSession(
                "CollabSmoke",
                deepcopy(server_document),
                seq=2,
                snapshots={1: deepcopy(base_document), 2: deepcopy(server_document)},
            )
            manager._sessions["CollabSmoke"] = session
            client = CollabClient("client-recover", "恢复用户", handler=None)

            recovered_document = deepcopy(base_document)
            recovered_document["entities"][0]["fields"][0]["note"] = "恢复版本补充说明"
            record = manager._apply_snapshot(
                session,
                client,
                {"baseSeq": 1, "document": recovered_document, "recoveryMode": True},
            )

            self.assertEqual(record["seq"], 3)
            self.assertEqual(session.document["entities"][0]["fields"][0]["note"], "恢复版本补充说明")

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

    def test_concurrent_same_field_detects_conflict(self):
        """并发修改同一字段→冲突检测，seq不递增，提交原文保留"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_document = create_empty_document("CollabSmoke")
            base_document["meta"]["author"] = "Base"
            storage.save("CollabSmoke", base_document)
            manager = CollaborationManager(storage, autosave_interval=0)

            def submit_author(index: int) -> dict:
                local_document = deepcopy(base_document)
                local_document["meta"]["author"] = f"Author {index}"
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"user-{index}", "name": f"用户{index}", "sessionId": f"session-{index}"},
                    {"baseSeq": 0, "document": local_document},
                )

            with ThreadPoolExecutor(max_workers=5) as executor:
                results = list(executor.map(submit_author, range(5)))

            # 第一个成功(seq=1)，其余因冲突seq不变
            self.assertEqual(results[0]["seq"], 1)
            conflict_count = sum(1 for r in results if r.get("conflictCount", 0) > 0)
            self.assertGreaterEqual(conflict_count, 1, "至少应有1个冲突")
            # 提交原文全部保留
            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            self.assertEqual(len(list(submits_dir.glob("*.json"))), 5)

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
        """AC1: A/B同时从同一baseSeq改不同字段 → 全部保留（v2无冲突自动合并）"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["roles"] = [
                {"uid": "role-1", "name": "角色A", "desc": "", "group": "业务参与方", "subDomains": []},
                {"uid": "role-2", "name": "角色B", "desc": "", "group": "业务参与方", "subDomains": []},
            ]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 不同实体类型+不同字段：name vs desc → 无冲突
            def submit_role_name():
                local = deepcopy(base_doc)
                local["roles"][0]["name"] = "角色A-改名"
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": "user-name", "name": "改名人", "sessionId": "sess-name"},
                    {"baseSeq": 0, "document": local},
                )

            def submit_role_desc():
                local = deepcopy(base_doc)
                local["roles"][1]["desc"] = "描述已更新"
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": "user-desc", "name": "改描述人", "sessionId": "sess-desc"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [executor.submit(submit_role_name), executor.submit(submit_role_desc)]
                results = [f.result() for f in futures]

            seqs = sorted(r["seq"] for r in results)
            self.assertEqual(seqs, [1, 2])

            final_doc = storage.load("CollabSmoke")
            self.assertEqual(len(final_doc["roles"]), 2, "应保留2个角色无丢失")
            roles_by_uid = {r["uid"]: r for r in final_doc["roles"]}
            self.assertIn("role-1", roles_by_uid)
            self.assertIn("role-2", roles_by_uid)
            self.assertEqual(roles_by_uid["role-1"]["name"], "角色A-改名")
            self.assertEqual(roles_by_uid["role-2"]["desc"], "描述已更新")

            # 验证提交原文存在
            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertEqual(len(submit_files), 2, "2次提交都应有原文")

    def test_concurrent_same_field_last_write_wins_submit_preserved(self):
        """AC2: A/B同时改同一字段 → v2冲突检测，提交原文可找回"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["meta"]["author"] = "原始"
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            def submit_author(value):
                local = deepcopy(base_doc)
                local["meta"]["author"] = value
                return manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"user-{value}", "name": value, "sessionId": f"sess-{value}"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=5) as executor:
                results = list(executor.map(submit_author, [f"作者{i}" for i in range(5)]))

            # v2: 并发改同一字段→冲突检测，第一个成功seq=1，其余因冲突seq不变
            self.assertEqual(results[0]["seq"], 1)
            conflict_count = sum(1 for r in results if r.get("conflictCount", 0) > 0)
            self.assertGreaterEqual(conflict_count, 1, "至少应有1个冲突")

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
            base_doc = create_empty_document("CollabSmoke")
            base_doc["meta"]["author"] = "V1"
            base_doc["roles"] = [{"uid": "r1", "name": "角色1", "desc": "", "group": "业务参与方", "subDomains": []}]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 先做10次提交推进seq（每次deepcopy当前文档，修改不同字段避免冲突）
            for i in range(10):
                current = deepcopy(storage.load("CollabSmoke"))
                current["meta"]["author"] = f"V{i+2}"
                manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"u{i}", "name": f"用户{i}", "sessionId": f"s{i}"},
                    {"baseSeq": i, "document": current},
                )

            # 现在用baseSeq=0提交（太旧了），只添加新角色（不改动author避免冲突）
            old_doc = deepcopy(base_doc)
            old_doc["roles"] = [
                {"uid": "r1", "name": "角色1", "desc": "", "group": "业务参与方", "subDomains": []},
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
            self.assertGreaterEqual(len(submit_files), 11, "11次提交都应有原文")

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
                # 不修改meta共用字段（避免conflict），只添加唯一uid的新实体
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
                local = deepcopy(base)
                if index == 0:
                    local["roles"][0]["name"] = "角色-改名0"
                elif index == 1:
                    local["roles"][0]["desc"] = "描述-改1"
                else:
                    local["roles"][0]["group"] = "分组-改2"
                local["roles"].append(
                    {"uid": f"r-new-{index}", "name": f"新角色{index}", "desc": "", "group": "业务参与方", "subDomains": []}
                )
                return manager.apply_http_snapshot(
                    "CollabSmoke", {"id": f"r-{index}", "name": f"改角色{index}", "sessionId": f"rs-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_process(index):
                local = deepcopy(base)
                if index == 0:
                    local["processes"][0]["name"] = "流程-改名0"
                elif index == 1:
                    local["processes"][0]["trigger"] = "触发-改1"
                else:
                    local["processes"][0]["outcome"] = "结果-改2"
                local["processes"][0]["nodes"].append(
                    {"uid": f"t-new-{index}", "name": f"新节点{index}", "role_uid": "r-base", "role_uids": ["r-base"],
                     "roles": ["基准角色"], "role": "基准角色",
                     "userSteps": [], "orchestrationTasks": [], "forms": [],
                     "entity_ops": [], "businessRules": [], "repeatable": False}
                )
                return manager.apply_http_snapshot(
                    "CollabSmoke", {"id": f"p-{index}", "name": f"改进程{index}", "sessionId": f"ps-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_entity(index):
                local = deepcopy(base)
                if index == 0:
                    local["entities"][0]["name"] = "实体-改名0"
                elif index == 1:
                    local["entities"][0]["note"] = "备注-改1"
                else:
                    local["entities"][0]["group"] = "分组-改2"
                local["entities"][0].setdefault("fields", []).append(
                    {"uid": f"f-new-{index}", "name": f"字段{index}", "type": "string",
                     "note": "", "isStatus": False, "statusRole": "", "stateValues": ""}
                )
                return manager.apply_http_snapshot(
                    "CollabSmoke", {"id": f"e-{index}", "name": f"改实体{index}", "sessionId": f"es-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_stage(index):
                local = deepcopy(base)
                if index == 0:
                    local["stages"][0]["name"] = "阶段-改名0"
                elif index == 1:
                    local["stages"][0]["subDomain"] = "子域-改1"
                else:
                    local["stages"][0]["panoramaSlot"] = "槽位-改2"
                return manager.apply_http_snapshot(
                    "CollabSmoke", {"id": f"s-{index}", "name": f"改阶段{index}", "sessionId": f"ss-{index}"},
                    {"baseSeq": 0, "document": local},
                )

            with ThreadPoolExecutor(max_workers=8) as executor:
                futs = []
                for i in range(2):
                    futs.append(executor.submit(modify_roles, i))
                    futs.append(executor.submit(modify_process, i))
                    futs.append(executor.submit(modify_entity, i))
                    futs.append(executor.submit(modify_stage, i))
                results = [f.result() for f in futs]

            seqs = sorted(r["seq"] for r in results)
            self.assertEqual(seqs, list(range(1, 9)), "8个并发提交seq应1-8")

            final = storage.load("CollabSmoke")
            self.assertIsInstance(final, dict)
            self.assertGreaterEqual(len(final.get("roles", [])), 1)
            self.assertGreaterEqual(len(final.get("processes", [])), 1)
            self.assertGreaterEqual(len(final.get("entities", [])), 1)
            self.assertGreaterEqual(len(final.get("stages", [])), 1)

            # 所有提交原文都存在
            submits_dir = Path(temp_dir) / "workspace" / "CollabSmoke" / "collab" / "submits"
            submit_files = list(submits_dir.glob("*.json"))
            self.assertEqual(len(submit_files), 8, "8次提交都应有原文")

    def test_unchanged_document_does_not_broadcast_or_increment_seq(self):
        """无修改的Ctrl+S不触发广播，seq不变"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "初始"
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 第一次提交：修改了内容
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
        """文档锁确保同一文档串行处理，seq无重复"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            seen_seqs = []
            lock = threading.Lock()

            def submit_and_record(index):
                local = deepcopy(base_doc)
                local["roles"] = [
                    {"uid": f"role-{index}", "name": f"角色{index}", "desc": "", "group": "业务参与方", "subDomains": []}
                ]
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
                local = deepcopy(base)
                # 每个并发只添加新实体（不同uid），不修改现有实体避免冲突
                local["roles"].append(
                    {"uid": f"r-new-{index}", "name": f"新角色{index}", "desc": "", "group": "业务参与方", "subDomains": []}
                )
                local["processes"].append({
                    "uid": f"p-new-{index}", "name": f"新流程{index}",
                    "nodes": [
                        {"uid": f"tn-{index}", "name": f"新节点{index}", "role_uid": "r-1", "role_uids": ["r-1"],
                         "roles": ["R1"], "role": "R1",
                         "userSteps": [], "orchestrationTasks": [], "forms": [],
                         "entity_ops": [], "businessRules": [], "repeatable": False},
                    ],
                    "flow": {"version": 2, "nodes": [], "edges": [],
                             "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
                    "trigger": "", "outcome": "", "subDomain": "", "flowGroup": "",
                    "stageUid": "s-1", "stagePos": {"x": 0, "y": 0}, "prototypeFiles": [],
                    "businessComponentUids": [], "businessConstructUids": [],
                    "businessComponentUid": "", "businessConstructUid": "",
                })
                local["entities"].append(
                    {"uid": f"e-new-{index}", "name": f"新实体{index}",
                     "fields": [], "businessConstructUid": "", "businessConstructUids": [],
                     "entityType": "", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                     "state_transitions": [], "taxonomies": []}
                )
                local.setdefault("stages", []).append(
                    {"uid": f"s-new-{index}", "name": f"新阶段{index}", "subDomain": "",
                     "panoramaColumnUid": "", "panoramaLaneUid": "",
                     "panoramaSlot": "", "panoramaPos": {"x": 0, "y": 0}, "pos": {"x": 0, "y": 0},
                     "processLinks": []}
                )
                local.setdefault("rules", []).append(
                    {"uid": f"br-new-{index}", "name": f"新规则{index}", "content": f"内容{index}"}
                )
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

            # 验证新增实体数量（原有1+并发新增6）
            self.assertGreaterEqual(len(final.get("roles", [])), 7)
            self.assertGreaterEqual(len(final.get("processes", [])), 7)
            self.assertGreaterEqual(len(final.get("entities", [])), 7)
            self.assertGreaterEqual(len(final.get("stages", [])), 7)
            self.assertGreaterEqual(len(final.get("rules", [])), 7)

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

    def test_meta_revision_not_required_for_collab(self):
        """revision对协作流不是必须的"""
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
            self.assertTrue(final["meta"].get("author"), "author应存在")

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

            # 并发修改：6个提交各自修改不同字段，确保无冲突
            def modify_meta(index):
                local = deepcopy(base)
                if index == 0:
                    local["meta"]["author"] = "作者-新"
                else:
                    local["meta"]["space"] = "空间-新"
                    local["meta"]["tags"] = list(local["meta"].get("tags", [])) + ["新标签"]
                return manager.apply_http_snapshot(
                    "TestDoc", {"id": f"um{index}", "name": f"Meta{index}", "sessionId": f"sm{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_roles_and_process(index):
                local = deepcopy(base)
                if index == 0:
                    local["roles"][0]["name"] = "角色-新名称"
                    local["processes"][0]["name"] = "流程-新名称"
                else:
                    local["roles"][0]["desc"] = "角色-新描述"
                    local["processes"][0]["trigger"] = "新触发事件"
                local["roles"].append(
                    {"uid": f"r-new-{index}", "name": f"新角色{index}", "desc": "", "group": "业务参与方", "subDomains": []}
                )
                return manager.apply_http_snapshot(
                    "TestDoc", {"id": f"up{index}", "name": f"Proc{index}", "sessionId": f"sp{index}"},
                    {"baseSeq": 0, "document": local},
                )

            def modify_entity_and_stage(index):
                local = deepcopy(base)
                if index == 0:
                    local["entities"][0]["name"] = "实体-新名称"
                    local["stages"][0]["name"] = "阶段-新名称"
                else:
                    local["entities"][0]["note"] = "实体-新备注"
                    local["stages"][0]["subDomain"] = "新子域"
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


    def test_set_list_deletion_propagates_in_3way_merge(self):
        """缺陷：set_list（如businessConstructUids）删除应在3way合并中传播"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["roles"] = [{"uid": "r-1", "name": "角色1", "desc": "", "group": "业务参与方", "subDomains": []}]
            base_doc["processes"] = [{
                "uid": "p-1", "name": "流程1",
                "nodes": [
                    {"uid": "t-1", "name": "节点1", "role_uid": "r-1", "role_uids": ["r-1"],
                     "roles": ["角色1"], "role": "角色1",
                     "businessComponentUids": ["comp-A", "comp-B"],
                     "businessConstructUids": ["task-X", "task-Y"],
                     "userSteps": [], "orchestrationTasks": [], "forms": [],
                     "entity_ops": [], "businessRules": [], "repeatable": False}
                ],
                "flow": {"version": 2, "nodes": [], "edges": [],
                         "layout": {"swimlane": {"laneOrder": [], "items": {}, "labels": {}}}},
                "trigger": "", "outcome": "", "subDomain": "", "flowGroup": "",
                "stageUid": "", "stagePos": {"x": 0, "y": 0},
                "prototypeFiles": [], "businessComponentUids": ["comp-A", "comp-B"],
                "businessConstructUids": ["task-X", "task-Y"],
                "businessComponentUid": "", "businessConstructUid": "",
            }]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：移除了 task-X 和 comp-B
            doc_a = deepcopy(base_doc)
            doc_a["processes"][0]["businessConstructUids"] = ["task-Y"]  # 移除 task-X
            doc_a["processes"][0]["businessComponentUids"] = ["comp-A"]  # 移除 comp-B

            # 用户B：未做变更（保留所有原始值）
            doc_b = deepcopy(base_doc)

            # A先提交
            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "用户A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["seq"], 1)

            # B用旧baseSeq=0提交（内容无变化，但触发3way合并）
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "用户B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            proc = final["processes"][0]

            # 关键断言：task-X和comp-B的删除必须在合并后生效
            self.assertNotIn("task-X", proc["businessConstructUids"],
                             "task-X 被A移除，合并后应不在结果中")
            self.assertEqual(proc["businessConstructUids"], ["task-Y"],
                             "仅 task-Y 应保留")
            self.assertNotIn("comp-B", proc["businessComponentUids"],
                             "comp-B 被A移除，合并后应不在结果中")
            self.assertEqual(proc["businessComponentUids"], ["comp-A"],
                             "仅 comp-A 应保留")

    def test_task_definition_contract_preserved_in_3way_merge(self):
        """缺陷：taskDefinition的contract（address/parameters）在3way合并中丢失"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["taskDefinitions"] = [{
                "uid": "td-1",
                "name": "我的任务",
                "type": "Service",
                "target": "",
                "address": "",
                "parameters": {"inputs": [], "outputs": []},
                "note": "",
                "entityUids": [],
            }]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：填写契约（address + parameters）
            doc_a = deepcopy(base_doc)
            doc_a["taskDefinitions"][0]["address"] = "http://api.example.com/v1"
            doc_a["taskDefinitions"][0]["parameters"] = {
                "inputs": [
                    {"uid": "p-in-1", "name": "orderId", "type": "string", "required": True, "description": "订单号", "example": "ORD-001"}
                ],
                "outputs": [
                    {"uid": "p-out-1", "name": "status", "type": "string", "required": False, "description": "状态", "example": "OK"}
                ],
            }

            # A先提交
            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "用户A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["seq"], 1)

            # 用户B：用旧baseSeq=0提交（无变化，触发3way合并）
            doc_b = deepcopy(base_doc)
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "用户B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            td = final["taskDefinitions"][0]

            # 关键断言：address和parameters必须在合并后保留
            self.assertEqual(td["address"], "http://api.example.com/v1",
                             "address应在合并后保留")
            self.assertIsInstance(td.get("parameters"), dict,
                                  "parameters应存在且为对象")
            self.assertEqual(len(td["parameters"].get("inputs", [])), 1,
                             "inputs应保留1个参数")
            self.assertEqual(td["parameters"]["inputs"][0]["name"], "orderId",
                             "input参数名应保留")
            self.assertEqual(len(td["parameters"].get("outputs", [])), 1,
                             "outputs应保留1个参数")

    def test_panorama_crud_in_3way_merge(self):
        """全景视图增删改在3way合并中正确同步"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["panorama"] = {
                "columns": [
                    {"uid": "col-1", "name": "价值链1", "scope": "环节定义A", "badge": ""},
                    {"uid": "col-2", "name": "价值链2", "scope": "环节定义B", "badge": ""},
                ],
                "lanes": [
                    {"uid": "lane-1", "name": "业务域A", "badge": "标签A", "note": "备注A"},
                    {"uid": "lane-2", "name": "业务域B", "badge": "标签B", "note": "备注B"},
                ],
                "cells": [
                    {"columnUid": "col-1", "laneUid": "lane-1", "status": "主责", "text": "正文A"},
                    {"columnUid": "col-2", "laneUid": "lane-2", "status": "职责", "text": "正文B"},
                ],
            }
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：增删改 panorama
            doc_a = deepcopy(base_doc)
            # 改：修改 column-1 的 scope（环节定义）
            doc_a["panorama"]["columns"][0]["scope"] = "环节定义-已修改"
            # 改：修改 lane-1 的 badge（业务域标签）和 note（业务域备注）
            doc_a["panorama"]["lanes"][0]["badge"] = "标签-已修改"
            doc_a["panorama"]["lanes"][0]["note"] = "备注-已修改"
            # 改：修改 cell 的 text（单元格正文）
            cell_a = doc_a["panorama"]["cells"][0]
            cell_a["text"] = "正文-已修改"
            cell_a["status"] = "已变更"
            # 删：删除 col-2 和 lane-2 和对应的 cell
            doc_a["panorama"]["columns"] = [c for c in doc_a["panorama"]["columns"] if c["uid"] != "col-2"]
            doc_a["panorama"]["lanes"] = [l for l in doc_a["panorama"]["lanes"] if l["uid"] != "lane-2"]
            doc_a["panorama"]["cells"] = [c for c in doc_a["panorama"]["cells"]
                                          if not (c["columnUid"] == "col-2" and c["laneUid"] == "lane-2")]
            # 增：新增 column/lane/cell
            doc_a["panorama"]["columns"].append({"uid": "col-new", "name": "新价值链", "scope": "新环节定义", "badge": "新标签"})
            doc_a["panorama"]["lanes"].append({"uid": "lane-new", "name": "新业务域", "badge": "新标签", "note": "新备注"})
            doc_a["panorama"]["cells"].append(
                {"columnUid": "col-1", "laneUid": "lane-new", "status": "新主责", "text": "新正文"}
            )

            # A先提交
            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "用户A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["seq"], 1)

            # 用户B：用旧baseSeq=0提交（无变化，触发3way合并）
            doc_b = deepcopy(base_doc)
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "用户B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            pano = final.get("panorama", {})

            # 增：新列/行/单元格应存在
            col_uids = {c["uid"] for c in pano.get("columns", [])}
            self.assertIn("col-new", col_uids, "新增的column应在合并后保留")
            lane_uids = {l["uid"] for l in pano.get("lanes", [])}
            self.assertIn("lane-new", lane_uids, "新增的lane应在合并后保留")
            cell_keys = {(c["laneUid"], c["columnUid"]) for c in pano.get("cells", [])}
            self.assertIn(("lane-new", "col-1"), cell_keys, "新增的cell应在合并后保留")

            # 删：col-2 和 lane-2 应被移除
            self.assertNotIn("col-2", col_uids, "删除的column应不在合并后结果")
            self.assertNotIn("lane-2", lane_uids, "删除的lane应不在合并后结果")
            self.assertNotIn(("lane-2", "col-2"), cell_keys, "删除的cell应不在合并后结果")

            # 改：字段修改应保留
            col1 = next((c for c in pano["columns"] if c["uid"] == "col-1"), {})
            self.assertEqual(col1.get("scope"), "环节定义-已修改", "修改的column.scope应保留")
            lane1 = next((l for l in pano["lanes"] if l["uid"] == "lane-1"), {})
            self.assertEqual(lane1.get("badge"), "标签-已修改", "修改的lane.badge应保留")
            self.assertEqual(lane1.get("note"), "备注-已修改", "修改的lane.note应保留")
            cell_modified = next((c for c in pano["cells"]
                                  if c["columnUid"] == "col-1" and c["laneUid"] == "lane-1"), {})
            self.assertEqual(cell_modified.get("text"), "正文-已修改", "修改的cell.text应保留")
            self.assertEqual(cell_modified.get("status"), "已变更", "修改的cell.status应保留")


    def test_stage_panorama_position_preserved_in_3way_merge(self):
        """缺陷：stage的panoramaSlot/panoramaPos在3way合并中丢失"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["stages"] = [{
                "uid": "s-1", "name": "阶段1", "subDomain": "仓储",
                "panoramaColumnUid": "col-1", "panoramaLaneUid": "lane-1",
                "panoramaSlot": {"row": 0, "col": 0},
                "panoramaPos": {"x": 10, "y": 20},
                "pos": {"x": 100, "y": 200},
                "processLinks": [],
            }]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：拖曳阶段到单元格内新位置
            doc_a = deepcopy(base_doc)
            doc_a["stages"][0]["panoramaSlot"] = {"row": 1, "col": 2}
            doc_a["stages"][0]["panoramaPos"] = {"x": 55, "y": 88}
            doc_a["stages"][0]["panoramaColumnUid"] = "col-2"
            doc_a["stages"][0]["panoramaLaneUid"] = "lane-2"

            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "用户A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["seq"], 1)

            # 用户B：旧baseSeq触发3way合并
            doc_b = deepcopy(base_doc)
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "用户B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            stage = final["stages"][0]

            # 关键断言：panoramaSlot和panoramaPos在合并后必须保留
            self.assertEqual(stage["panoramaSlot"], {"row": 1, "col": 2},
                             "panoramaSlot应在合并后保留")
            self.assertEqual(stage["panoramaPos"], {"x": 55, "y": 88},
                             "panoramaPos应在合并后保留")
            self.assertEqual(stage["panoramaColumnUid"], "col-2",
                             "panoramaColumnUid应在合并后保留")
            self.assertEqual(stage["panoramaLaneUid"], "lane-2",
                             "panoramaLaneUid应在合并后保留")


    def test_entity_field_columns_preserved_in_3way_merge(self):
        """缺陷：实体字段各列的修改在3way合并中正确同步"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["entities"] = [{
                "uid": "e-1", "name": "实体1", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                "businessConstructUid": "", "businessConstructUids": [],
                "fields": [
                    {"uid": "f-1", "name": "字段A", "type": "string", "is_key": False,
                     "is_status": False, "status_role": "", "state_values": "", "note": ""},
                    {"uid": "f-2", "name": "字段B", "type": "string", "is_key": False,
                     "is_status": False, "status_role": "", "state_values": "", "note": ""},
                ],
                "state_transitions": [],
            }]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：修改字段各列
            doc_a = deepcopy(base_doc)
            f1 = doc_a["entities"][0]["fields"][0]
            f1["name"] = "字段A-改名"
            f1["type"] = "number"
            f1["is_key"] = True
            f1["note"] = "新备注"
            f2 = doc_a["entities"][0]["fields"][1]
            f2["is_status"] = True
            f2["status_role"] = "primary"
            f2["state_values"] = "草稿/审核/完成"

            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "用户A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])

            # 用户B：旧baseSeq触发3way合并
            doc_b = deepcopy(base_doc)
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "用户B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            fields = final["entities"][0]["fields"]
            f1_final = next((f for f in fields if f["uid"] == "f-1"), {})
            f2_final = next((f for f in fields if f["uid"] == "f-2"), {})

            self.assertEqual(f1_final.get("name"), "字段A-改名", "字段名应在合并后保留")
            self.assertEqual(f1_final.get("type"), "number", "字段类型应在合并后保留")
            self.assertTrue(f1_final.get("is_key"), "主键标记应在合并后保留")
            self.assertEqual(f1_final.get("note"), "新备注", "字段规则应在合并后保留")
            self.assertTrue(f2_final.get("is_status"), "状态标记应在合并后保留")
            self.assertEqual(f2_final.get("status_role"), "primary", "状态角色应在合并后保留")
            self.assertEqual(f2_final.get("state_values"), "草稿/审核/完成", "状态值应在合并后保留")

    def test_entity_relation_position_preserved_in_3way_merge(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["entities"] = [{
                "uid": "e-1", "name": "A Very Long Entity Name", "group": "", "note": "",
                "pos": {"x": 120, "y": 140},
                "businessConstructUid": "", "businessConstructUids": [],
                "fields": [], "state_transitions": [],
            }]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            doc_a = deepcopy(base_doc)
            doc_a["entities"][0]["note"] = "server-side business edit"
            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "User A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])

            doc_b = deepcopy(base_doc)
            doc_b["entities"][0]["pos"] = {"x": 456, "y": 234}
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "User B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final_entity = storage.load("CollabSmoke")["entities"][0]
            self.assertEqual(final_entity["note"], "server-side business edit")
            self.assertEqual(final_entity["pos"], {"x": 456, "y": 234})

    def test_entity_relation_deletion_propagates_in_3way_merge(self):
        """缺陷：实体关系的删除在3way合并中正确传播"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["entities"] = [
                {"uid": "e-1", "name": "订单", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                 "businessConstructUid": "", "businessConstructUids": [], "fields": [], "state_transitions": []},
                {"uid": "e-2", "name": "客户", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                 "businessConstructUid": "", "businessConstructUids": [], "fields": [], "state_transitions": []},
            ]
            base_doc["relations"] = [
                {"uid": "rel-1", "from": "e-1", "to": "e-2", "type": "association", "label": "关联"},
                {"uid": "rel-2", "from": "e-2", "to": "e-1", "type": "dependency", "label": "依赖"},
            ]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：删除 rel-2，保留 rel-1
            doc_a = deepcopy(base_doc)
            doc_a["relations"] = [r for r in doc_a["relations"] if r["uid"] != "rel-2"]

            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "用户A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["seq"], 1)

            # 用户B：旧baseSeq触发3way合并
            doc_b = deepcopy(base_doc)
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "用户B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            rel_uids = {r["uid"] for r in final.get("relations", [])}
            self.assertIn("rel-1", rel_uids, "rel-1应保留")
            self.assertNotIn("rel-2", rel_uids, "rel-2应在合并后被删除")
            self.assertEqual(len(final["relations"]), 1, "应只剩1个关系")


    def test_entity_relation_dedup_in_3way_merge(self):
        """缺陷：两边同时添加相同关系后合并出现重复"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["entities"] = [
                {"uid": "e-1", "name": "订单", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                 "businessConstructUid": "", "businessConstructUids": [], "fields": [], "state_transitions": []},
                {"uid": "e-2", "name": "客户", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                 "businessConstructUid": "", "businessConstructUids": [], "fields": [], "state_transitions": []},
            ]
            base_doc["relations"] = [
                {"uid": "rel-0", "from": "e-1", "to": "e-2", "type": "dependency", "label": "原始关系"},
            ]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：添加关系 R_A（e-1→e-2，同语义）
            doc_a = deepcopy(base_doc)
            doc_a["relations"].append(
                {"uid": "rel-a", "from": "e-1", "to": "e-2", "type": "association", "label": "关联关系"}
            )

            # 用户B：添加关系 R_B（e-1→e-2，同语义，不同uid）
            doc_b = deepcopy(base_doc)
            doc_b["relations"].append(
                {"uid": "rel-b", "from": "e-1", "to": "e-2", "type": "association", "label": "关联关系"}
            )

            # A先提交
            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "用户A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["seq"], 1)

            # B用旧baseSeq提交（触发3way合并）
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "用户B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            relations = final.get("relations", [])

            # 关键断言：同语义关系不应重复
            same_key_rels = [r for r in relations
                             if r.get("from") == "e-1" and r.get("to") == "e-2"
                             and r.get("type") == "association" and r.get("label") == "关联关系"]
            self.assertEqual(len(same_key_rels), 1,
                             f"同语义关系应去重为1条，实际{len(same_key_rels)}条: {same_key_rels}")
            # 总共应有 2 条关系（原始1 + 合并后的1）
            self.assertEqual(len(relations), 2,
                             f"总共应有2条关系（原始+合并），实际{len(relations)}条")


    def test_state_transition_reorder_preserved_in_3way_merge(self):
        """缺陷：state_transition上移/下移的排序变化在合并中保留"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["entities"] = [{
                "uid": "e-1", "name": "实体1", "group": "", "note": "", "pos": {"x": 0, "y": 0},
                "businessConstructUid": "", "businessConstructUids": [], "fields": [],
                "state_transitions": [
                    {"uid": "st-1", "from": "草稿", "to": "审核中", "label": "提交", "note": ""},
                    {"uid": "st-2", "from": "审核中", "to": "已通过", "label": "通过", "note": ""},
                    {"uid": "st-3", "from": "审核中", "to": "已驳回", "label": "驳回", "note": ""},
                ],
            }]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：上移 st-3（从第3位移到第1位）
            doc_a = deepcopy(base_doc)
            st = doc_a["entities"][0]["state_transitions"]
            st[0], st[1], st[2] = st[2], st[0], st[1]  # st-3 → st-1 → st-2

            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "用户A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])
            self.assertEqual(r1["seq"], 1)

            # 用户B：旧baseSeq触发3way合并
            doc_b = deepcopy(base_doc)
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "用户B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            transitions = final["entities"][0]["state_transitions"]
            order = [t["uid"] for t in transitions]
            self.assertEqual(order, ["st-3", "st-1", "st-2"],
                             f"排序应保留为 st-3, st-1, st-2，实际: {order}")


    def test_stage_flow_ref_reorder_preserved_in_3way_merge(self):
        """Stage process order is stored on stageFlowRefs.order and should survive 3-way merge."""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["roles"] = []
            base_doc["stages"] = [{"uid": "stage-1", "id": "S1", "name": "Stage 1", "subDomain": "", "pos": {}, "processLinks": []}]
            base_doc["processes"] = [
                {"uid": "proc-1", "id": "P1", "name": "Process 1", "subDomain": "", "flowGroup": "Group A", "stageId": "S1", "stagePos": {}, "prototypeFiles": [], "nodes": []},
                {"uid": "proc-2", "id": "P2", "name": "Process 2", "subDomain": "", "flowGroup": "Group A", "stageId": "S1", "stagePos": {}, "prototypeFiles": [], "nodes": []},
            ]
            base_doc["stageFlowRefs"] = [
                {"uid": "ref-1", "id": "SFR1", "stageId": "S1", "processId": "P1", "order": 1, "pos": {}},
                {"uid": "ref-2", "id": "SFR2", "stageId": "S1", "processId": "P2", "order": 2, "pos": {}},
            ]
            base_doc["stageFlowLinks"] = []
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            doc_a = deepcopy(base_doc)
            doc_a["stageFlowRefs"][0]["order"] = 2
            doc_a["stageFlowRefs"][1]["order"] = 1
            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-a", "name": "User A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertTrue(r1["ok"])

            doc_b = deepcopy(base_doc)
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "user-b", "name": "User B", "sessionId": "sb"},
                {"baseSeq": 0, "document": doc_b},
            )
            self.assertTrue(r2["ok"])

            final = storage.load("CollabSmoke")
            refs = sorted(final["stageFlowRefs"], key=lambda ref: ref["order"])
            self.assertEqual([ref["processUid"] for ref in refs], ["proc-2", "proc-1"])


class CollaborationSubmitRecoveryTests(unittest.TestCase):
    """从 submit-record 恢复 + 历史回退 + 3-way 合并"""

    def test_list_submits_returns_records(self):
        """提交记录可列出"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 触发3次保存，产生3条submit
            for i in range(3):
                local = deepcopy(storage.load("CollabSmoke"))
                local["meta"]["author"] = f"Author{i}"
                manager.apply_http_snapshot(
                    "CollabSmoke",
                    {"id": f"u{i}", "name": f"U{i}", "sessionId": f"s{i}"},
                    {"baseSeq": i, "document": local},
                )

            submits = manager.list_submits("CollabSmoke")
            self.assertEqual(len(submits), 3, "应有3条提交记录")
            self.assertIn("submitId", submits[0])
            self.assertIn("seq", submits[0])
            self.assertIn("baseSeq", submits[0])
            self.assertIn("createdAt", submits[0])

    def test_load_submit_returns_full_document(self):
        """加载提交记录返回完整文档"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            document = create_empty_document("CollabSmoke")
            document["meta"]["author"] = "Original"
            storage.save("CollabSmoke", document)
            manager = CollaborationManager(storage, autosave_interval=0)

            local = deepcopy(storage.load("CollabSmoke"))
            local["meta"]["author"] = "Saved"
            local["roles"] = [{"uid": "r1", "name": "Role1", "desc": "", "group": "G", "subDomains": []}]
            manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "u0", "name": "U0", "sessionId": "s0"},
                {"baseSeq": 0, "document": local},
            )

            submits = manager.list_submits("CollabSmoke")
            self.assertEqual(len(submits), 1)
            loaded = manager.load_submit("CollabSmoke", submits[0]["submitId"])
            self.assertIsInstance(loaded, dict)
            self.assertEqual(loaded["doc"], "CollabSmoke")
            self.assertEqual(loaded["document"]["meta"]["author"], "Saved")
            self.assertEqual(len(loaded["document"]["roles"]), 1)
            self.assertEqual(loaded["document"]["roles"][0]["name"], "Role1")

    def test_submit_restore_with_3way_merge_preserves_both_changes(self):
        """恢复旧submit后保存→3-way合并保留双方修改"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["meta"]["author"] = "Base"
            base_doc["meta"]["date"] = "2026-06-01"
            base_doc["roles"] = [{"uid": "r1", "name": "BaseRole", "desc": "", "group": "G", "subDomains": []}]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            # 用户A：修改role并保存（seq=1）
            doc_a = deepcopy(base_doc)
            doc_a["roles"][0]["name"] = "RoleByA"
            doc_a["meta"]["author"] = "AuthorA"
            r1 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "a", "name": "A", "sessionId": "sa"},
                {"baseSeq": 0, "document": doc_a},
            )
            self.assertEqual(r1["seq"], 1)

            # 用户B：修改date并保存（seq=2）
            doc_b = deepcopy(storage.load("CollabSmoke"))
            doc_b["meta"]["date"] = "2026-06-15"
            r2 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "b", "name": "B", "sessionId": "sb"},
                {"baseSeq": 1, "document": doc_b},
            )
            self.assertEqual(r2["seq"], 2)

            # 用户A发现自己的修改被覆盖了
            # 从submit记录恢复：找到seq=1的submit
            submits = manager.list_submits("CollabSmoke")
            submit_a = next(s for s in submits if s["seq"] == 1)
            recovered = manager.load_submit("CollabSmoke", submit_a["submitId"])
            recovered_doc = recovered["document"]
            recovered_base_seq = recovered["baseSeq"]

            # 用恢复的文档重新提交（baseSeq=0）
            r3 = manager.apply_http_snapshot(
                "CollabSmoke",
                {"id": "a-recover", "name": "A", "sessionId": "sa"},
                {"baseSeq": recovered_base_seq, "document": recovered_doc, "recoveryMode": True},
            )
            self.assertTrue(r3["ok"])
            self.assertEqual(r3["seq"], 3)

            final = storage.load("CollabSmoke")
            # A的role修改应保留
            self.assertEqual(final["roles"][0]["name"], "RoleByA", "A的角色名修改应保留")
            # A的author修改应保留
            self.assertEqual(final["meta"]["author"], "AuthorA", "A的作者修改应保留")
            # B的date修改也应保留（不同字段，自动合并）
            self.assertEqual(final["meta"]["date"], "2026-06-15", "B的日期修改应保留")


    def test_recovery_merge_keeps_server_only_process_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["meta"]["date"] = "2026-06-01"
            base_doc["processes"] = [
                {
                    "uid": "process-a",
                    "name": "Apply",
                    "nodes": [
                        {
                            "uid": "node-a",
                            "name": "Submit",
                            "forms": [
                                {
                                    "uid": "form-a",
                                    "name": "ApplyForm",
                                    "sections": [
                                        {
                                            "uid": "section-a",
                                            "name": "Main",
                                            "fields": [{"uid": "field-a", "name": "old field", "type": "text"}],
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ]
            storage.save("CollabSmoke", base_doc)
            manager = CollaborationManager(storage, autosave_interval=0)

            server_doc = deepcopy(base_doc)
            server_doc["meta"]["date"] = "2026-06-04"
            server_doc["processes"].append(
                {
                    "uid": "process-new-warehouse",
                    "name": "New Warehouse Info",
                    "nodes": [
                        {
                            "uid": "node-new-warehouse",
                            "name": "Register",
                            "forms": [
                                {
                                    "uid": "form-new-warehouse",
                                    "name": "Warehouse Form",
                                    "sections": [
                                        {
                                            "uid": "section-new-warehouse",
                                            "name": "Fields",
                                            "fields": [
                                                {"uid": "field-wh-name", "name": "warehouse name", "type": "text"},
                                                {"uid": "field-wh-code", "name": "warehouse code", "type": "text"},
                                            ],
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
            )
            recovered_doc = deepcopy(base_doc)
            recovered_doc["meta"]["date"] = "2026-06-05"

            merged, conflicts, _ = manager._merge_collaboration(
                base_doc, recovered_doc, server_doc, recovery_mode=True
            )
            merged_again, conflicts_again, _ = manager._merge_collaboration(
                base_doc, recovered_doc, merged, recovery_mode=True
            )

            self.assertEqual(conflicts, [])
            self.assertEqual(conflicts_again, [])
            self.assertEqual(_doc_hash(merged), _doc_hash(merged_again))
            new_process = next((p for p in merged["processes"] if p["uid"] == "process-new-warehouse"), None)
            self.assertIsNotNone(new_process)
            fields = new_process["nodes"][0]["forms"][0]["sections"][0]["fields"] if new_process else []
            self.assertEqual([field["name"] for field in fields], ["warehouse name", "warehouse code"])

    def test_very_old_baseseq_loads_from_disk_snapshot(self):
        """Given: 用户A保存50次后服务重启
           When: 用户B用baseSeq=30(已被内存淘汰)提交
           Then: 从磁盘历史快照加载base,精确3-way合并"""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            base_doc = create_empty_document("CollabSmoke")
            base_doc["meta"]["author"] = "Base"
            base_doc["meta"]["date"] = "2026-01-01"
            base_doc["roles"] = [{"uid": "r1", "name": "BaseRole", "desc": "", "group": "G", "subDomains": []}]
            storage.save("CollabSmoke", base_doc)

            # 模拟服务重启：每次创建新的manager来清空内存snapshots
            doc_name = "CollabSmoke"

            # 首次manager：做30次保存（seq到30，内存有0-30的snapshots）
            mgr1 = CollaborationManager(storage, autosave_interval=0)
            for i in range(30):
                local = deepcopy(storage.load(doc_name))
                local["meta"]["author"] = f"Author{i}"
                mgr1.apply_http_snapshot(doc_name,
                    {"id": f"u{i}", "name": f"U{i}", "sessionId": f"s{i}"},
                    {"baseSeq": i, "document": local})
            # seq=30处修改role名称
            local30 = deepcopy(storage.load(doc_name))
            local30["roles"][0]["name"] = "RoleChangedBySeq30"
            mgr1.apply_http_snapshot(doc_name,
                {"id": "u30", "name": "U30", "sessionId": "s30"},
                {"baseSeq": 30, "document": local30})
            del mgr1  # seq现在=31，内存snapshots清空

            # 用户B后来继续保存了20次（seq到51）
            mgr2 = CollaborationManager(storage, autosave_interval=0)
            for i in range(20):
                local = deepcopy(storage.load(doc_name))
                local["meta"]["date"] = f"2026-0{i+1}-15"
                mgr2.apply_http_snapshot(doc_name,
                    {"id": f"ub{i}", "name": f"UB{i}", "sessionId": f"sb{i}"},
                    {"baseSeq": i + 31, "document": local})

            # 现在seq=51，内存只有最近的snapshots

            # 用户A用非常旧的baseSeq=30提交
            old_doc = deepcopy(local30)  # seq=30时的文档
            old_doc["meta"]["author"] = "VeryOldAuthor"
            result = mgr2.apply_http_snapshot(doc_name,
                {"id": "old-a", "name": "OldA", "sessionId": "old-sess"},
                {"baseSeq": 30, "document": old_doc})

            self.assertTrue(result["ok"])
            final = storage.load(doc_name)

            # A的author修改应保留（A改了author，B没改）
            self.assertEqual(final["meta"]["author"], "VeryOldAuthor",
                             "A的author修改应保留")
            # B的date修改应保留（B改了date，A没改）
            self.assertIn("2026-0", final["meta"]["date"],
                          "B的date修改应保留")
            # seq=30时的role修改应保留
            self.assertEqual(final["roles"][0]["name"], "RoleChangedBySeq30",
                             "role修改应保留")
            # A的baseSeq太旧但不影响合并正确性
            self.assertGreater(result["seq"], 31)


    def test_recovery_mode_dedupes_process_and_preserves_form_field_details(self):
        """Recovery saves must not let stale duplicated flows wipe current form fields."""
        base_doc = create_empty_document("CollabSmoke")
        server_doc = create_empty_document("CollabSmoke")
        user_doc = create_empty_document("CollabSmoke")

        server_doc["processes"] = [
            {
                "uid": "proc-store-add",
                "name": "新增仓库信息",
                "nodes": [
                    {
                        "uid": "node-store-add",
                        "name": "新增交割仓库",
                        "forms": [
                            {
                                "uid": "form-store",
                                "name": "新增/修改仓库表单",
                                "sections": [
                                    {
                                        "uid": "sec-basic",
                                        "name": "基本信息",
                                        "fields": [
                                            {"uid": "field-code", "name": "仓库代码", "entity_field": "仓库代码", "type": "text"},
                                            {"uid": "field-name", "name": "仓库全称", "entity_field": "仓库全称", "type": "text"},
                                            {"uid": "field-location", "name": "提货地点维护", "entity_field": "", "type": "text"},
                                        ],
                                    },
                                    {
                                        "uid": "sec-owner",
                                        "name": "负责人信息",
                                        "fields": [
                                            {"uid": "field-owner", "name": "法人姓名", "entity_field": "法人姓名", "type": "text"},
                                        ],
                                    },
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
        user_doc["processes"] = [
            {
                "uid": "proc-store-add",
                "name": "新增仓库信息",
                "nodes": [
                    {
                        "uid": "node-store-add",
                        "name": "新增交割仓库",
                        "forms": [
                            {
                                "uid": "form-store",
                                "name": "新增/修改仓库表单",
                                "sections": [
                                    {
                                        "uid": "sec-basic",
                                        "name": "基本信息",
                                        "fields": [
                                            {"uid": "field-code", "name": "", "entity_field": "", "type": ""},
                                            {"uid": "field-name", "name": "", "entity_field": "", "type": ""},
                                            {"uid": "field-location", "name": "仓房维护", "entity_field": "", "type": "text"},
                                        ],
                                    },
                                    {"uid": "sec-owner", "name": "负责人信息", "fields": []},
                                ],
                            }
                        ],
                    }
                ],
            }
        ]

        manager = CollaborationManager(WorkspaceStorage(Path(tempfile.mkdtemp()) / "workspace"), autosave_interval=0)
        merged, conflicts, _stats = manager._merge_collaboration(base_doc, user_doc, server_doc, recovery_mode=True)

        matched_processes = [p for p in merged["processes"] if p.get("uid") == "proc-store-add"]
        self.assertEqual(len(matched_processes), 1)
        fields = []
        for node in matched_processes[0]["nodes"]:
            for form in node.get("forms", []):
                for section in form.get("sections", []):
                    fields.extend(section.get("fields", []))
        field_names = {field.get("name") for field in fields}
        self.assertIn("仓库代码", field_names)
        self.assertIn("仓库全称", field_names)
        self.assertIn("法人姓名", field_names)
        self.assertIn("提货地点维护", field_names)
        self.assertIn("仓房维护", field_names)
        self.assertNotIn("", field_names)
        self.assertEqual(len(conflicts), 0)

    def test_load_snapshot_by_seq_infers_legacy_history_seq_by_time_order(self):
        """Legacy history snapshots without seq should still be usable as 3-way bases."""
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = WorkspaceStorage(Path(temp_dir) / "workspace")
            manager = CollaborationManager(storage, autosave_interval=0)
            doc_name = "LegacyHistory"
            storage.save(doc_name, create_empty_document(doc_name))
            history_dir = storage._history_dir(doc_name)

            for index in range(1, 4):
                snapshot_id = f"20260604-00000{index}-000000"
                package_dir = history_dir / snapshot_id
                (package_dir / "manifest").mkdir(parents=True)
                doc = create_empty_document(doc_name)
                doc["meta"]["author"] = f"Author{index}"
                (package_dir / "manifest" / "manifest.json").write_text(
                    json.dumps(doc, ensure_ascii=False), encoding="utf-8"
                )
                (package_dir / "snapshot.json").write_text(
                    json.dumps({"id": snapshot_id, "kind": "collab", "createdAt": snapshot_id}, ensure_ascii=False),
                    encoding="utf-8",
                )

            loaded = manager._load_snapshot_by_seq(doc_name, 2)
            self.assertIsNotNone(loaded)
            self.assertEqual(loaded["meta"]["author"], "Author2")
            history_entries = storage.list_history(doc_name)
            entry_by_id = {entry["id"]: entry for entry in history_entries}
            self.assertEqual(entry_by_id["20260604-000002-000000"]["seq"], 2)


if __name__ == "__main__":
    unittest.main()
