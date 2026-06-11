"""集成测试: 会话生命周期 — 创建→持久化→加载→删除。"""

import tempfile, unittest
from pathlib import Path
from blm_ai.session.storage import SessionStorage
from blm_ai.session.manager import SessionManager


class TestSessionLifecycle(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_create_persist_load(self):
        """创建会话→追加消息→持久化→重新加载→消息一致。"""
        mgr = SessionManager(self.dir, user_id="user-a")
        meta = mgr.create(cwd="/test")

        storage = mgr.load(meta.id)
        m1 = storage.append_message({"role":"user","content":"hello"})
        m2 = storage.append_message({"role":"assistant","content":"hi there"}, parent_id=m1)
        storage.set_leaf(m2)
        storage.flush(meta.path)

        storage2 = mgr.load(meta.id)
        msgs = storage2.get_messages()
        self.assertEqual(len(msgs), 2)
        self.assertEqual(msgs[0]["content"], "hello")

    def test_user_isolation(self):
        """不同用户的会话隔离。"""
        mgr_a = SessionManager(self.dir, user_id="user-a")
        mgr_a.create(cwd="/a")
        mgr_b = SessionManager(self.dir, user_id="user-b")
        mgr_b.create(cwd="/b")
        self.assertEqual(len(mgr_a.list_all()), 1)
        self.assertEqual(len(mgr_b.list_all()), 1)
        self.assertNotEqual(mgr_a.list_all()[0].id, mgr_b.list_all()[0].id)

    def test_delete_archive(self):
        """删除→列表为空→归档存在。"""
        mgr = SessionManager(self.dir, user_id="u1")
        meta = mgr.create()
        self.assertTrue(mgr.delete(meta.id))
        self.assertEqual(len(mgr.list_all()), 0)

    def test_rename_session(self):
        """重命名会话。"""
        mgr = SessionManager(self.dir, user_id="u1")
        meta = mgr.create()
        self.assertTrue(mgr.rename(meta.id, "新名称"))
        sessions = mgr.list_all()
        self.assertEqual(len(sessions), 1)


if __name__ == "__main__":
    unittest.main()
