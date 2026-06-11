"""测试会话模块 — storage, manager, checkpoint, branch。"""

import tempfile
import unittest
from pathlib import Path

from blm_ai.session.storage import SessionEntry, SessionMeta, SessionStorage
from blm_ai.session.manager import SessionInfo, SessionManager
from blm_ai.session.checkpoint import CheckpointStore
from blm_ai.session.branch import BranchManager


class TestSessionStorage(unittest.TestCase):
    """JSONL 会话存储 — 创建、追加、导航。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_create_session(self):
        """创建会话 — 生成 JSONL 文件。"""
        storage = SessionStorage(self.dir)
        meta = storage.create(cwd="/test")
        self.assertTrue(meta.path.exists())
        self.assertGreater(len(meta.id), 0)

    def test_append_and_get_messages(self):
        """追加消息并读取。"""
        storage = SessionStorage(self.dir)
        meta = storage.create()
        mid = storage.append_message({"role": "user", "content": "hello"})
        storage.set_leaf(mid)
        messages = storage.get_messages()
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["content"], "hello")

    def test_append_compaction(self):
        """追加压缩记录。"""
        storage = SessionStorage(self.dir)
        meta = storage.create()
        mid = storage.append_message({"role": "user", "content": "x"})
        cid = storage.append_compaction("summary text", mid, 1000)
        self.assertTrue(cid)

    def test_load_session(self):
        """加载已有会话。"""
        storage = SessionStorage(self.dir)
        meta = storage.create()
        mid = storage.append_message({"role": "user", "content": "persisted"})
        storage.set_leaf(mid)
        storage.flush(meta.path)

        storage2 = SessionStorage(self.dir)
        storage2.load(meta.path)
        messages = storage2.get_messages()
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["content"], "persisted")

    def test_get_path_to_root(self):
        """树形导航 — 从叶子到根。"""
        storage = SessionStorage(self.dir)
        meta = storage.create()
        m1 = storage.append_message({"role": "user", "content": "first"})
        m2 = storage.append_message({"role": "assistant", "content": "reply"}, parent_id=m1)
        storage.set_leaf(m2)
        path = storage.get_path_to_root()
        self.assertEqual(len(path), 2)


class TestSessionManager(unittest.TestCase):
    """会话管理器 — 列表、加载、删除。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_list_empty(self):
        """空列表。"""
        mgr = SessionManager(self.dir)
        self.assertEqual(len(mgr.list_all()), 0)

    def test_create_and_list(self):
        """创建并列出。"""
        mgr = SessionManager(self.dir)
        mgr.create(cwd="/test")
        sessions = mgr.list_all()
        self.assertEqual(len(sessions), 1)

    def test_delete(self):
        """删除（归档）会话。"""
        mgr = SessionManager(self.dir)
        meta = mgr.create()
        self.assertTrue(mgr.delete(meta.id))
        self.assertEqual(len(mgr.list_all()), 0)


class TestCheckpoint(unittest.TestCase):
    """快照存储 — 捕获和回退。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def test_capture_and_restore(self):
        """捕获文件 → 修改 → 回退。"""
        ckpt = CheckpointStore(self.dir)
        f = self.dir / "test.txt"
        f.write_text("original")
        ckpt.capture(0, f)
        f.write_text("modified")
        restored = ckpt.restore(0)
        self.assertIn(str(f), restored[0] if restored else "")
        self.assertEqual(f.read_text(), "original")


class TestBranch(unittest.TestCase):
    """分支管理器 — fork 和 rewind。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_summarize_range(self):
        """分支摘要范围。"""
        mgr = SessionManager(self.dir)
        meta = mgr.create()
        storage = mgr.load(meta.id)
        mid = storage.append_message({"role": "user", "content": "test"})
        storage.set_leaf(mid)
        storage.flush(meta.path)
        bm = BranchManager(self.dir)
        result = bm.summarize_range(meta.id, mid, "from")
        self.assertIsNotNone(result)


if __name__ == "__main__":
    unittest.main()
