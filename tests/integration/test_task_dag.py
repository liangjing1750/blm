"""集成测试: 任务 DAG — 创建→依赖检查→状态机→持久化。"""

import tempfile, unittest
from pathlib import Path
from blm_ai.task.dag import Task, TaskDAG, TaskStatus
from blm_ai.task.persistence import TaskStore


class TestTaskDAG(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.dag = TaskDAG()

    def tearDown(self):
        self.tmp.cleanup()

    def test_create_and_check_deps(self):
        """创建任务→依赖检查→标记完成。"""
        a = Task(id="a", subject="任务A")
        b = Task(id="b", subject="任务B", blocked_by=["a"])
        self.dag.add(a); self.dag.add(b)

        self.assertFalse(b.can_start(self.dag._tasks))
        a.mark_completed()
        self.assertTrue(b.can_start(self.dag._tasks))

    def test_get_ready_returns_unblocked(self):
        """get_ready 只返回依赖已满足的任务。"""
        self.dag.add(Task(id="a", subject="A"))
        self.dag.add(Task(id="b", subject="B", blocked_by=["a"]))
        ready = self.dag.get_ready()
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0].id, "a")

    def test_status_state_machine(self):
        """状态机: pending→in_progress→completed。"""
        t = Task(id="t1", subject="Test")
        self.assertEqual(t.status, TaskStatus.PENDING)
        t.mark_in_progress("worker-1")
        self.assertEqual(t.status, TaskStatus.IN_PROGRESS)
        self.assertEqual(t.owner, "worker-1")
        t.mark_completed()
        self.assertEqual(t.status, TaskStatus.COMPLETED)

    def test_persist_and_load(self):
        """任务持久化→重新加载。"""
        store = TaskStore(self.dir)
        t = Task(id="p1", subject="持久化测试", tags=["test"])
        store.save(t)

        loaded = store.load("p1")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.subject, "持久化测试")
        self.assertEqual(loaded.tags, ["test"])

        store.delete("p1")
        self.assertIsNone(store.load("p1"))

    def test_dag_stats(self):
        """DAG统计正确计数。"""
        self.dag.add(Task(id="a", subject="A")); self.dag.add(Task(id="b", subject="B"))
        stats = self.dag.stats
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["pending"], 2)


if __name__ == "__main__":
    unittest.main()
