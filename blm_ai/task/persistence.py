"""任务持久化 — .tasks/{id}.json 文件存储。

s12 模式: 每个任务一个 JSON 文件，原子写入。
"""

import json
import os
import tempfile
from pathlib import Path

from blm_ai.task.dag import Task, TaskDAG, TaskStatus


class TaskStore:
    """任务文件存储 — 加载/保存/列表。"""

    def __init__(self, tasks_dir: str | Path):
        self.dir = Path(tasks_dir)
        self.dir.mkdir(parents=True, exist_ok=True)

    def save(self, task: Task) -> None:
        """保存单个任务到 JSON 文件。"""
        filepath = self.dir / f"{task.id}.json"
        data = task.to_dict()
        _atomic_write_json(filepath, data)

    def load(self, task_id: str) -> Task | None:
        """从 JSON 文件加载任务。"""
        filepath = self.dir / f"{task_id}.json"
        if not filepath.exists():
            return None
        try:
            data = json.loads(filepath.read_text("utf-8"))
            return Task(
                id=data["id"], subject=data.get("subject", ""),
                description=data.get("description", ""),
                status=TaskStatus(data.get("status", "pending")),
                owner=data.get("owner", ""),
                blocked_by=data.get("blockedBy", []),
                blocks=data.get("blocks", []),
                tags=data.get("tags", []),
                created_at=data.get("createdAt", ""),
                updated_at=data.get("updatedAt", ""),
                completed_at=data.get("completedAt", ""),
            )
        except Exception:
            return None

    def load_all(self) -> TaskDAG:
        """加载所有任务到 DAG。"""
        dag = TaskDAG()
        for f in sorted(self.dir.glob("*.json")):
            task = self.load(f.stem)
            if task:
                dag.add(task)
        return dag

    def delete(self, task_id: str) -> bool:
        """删除任务文件。"""
        filepath = self.dir / f"{task_id}.json"
        if filepath.exists():
            filepath.unlink()
            return True
        return False

    def list_ids(self) -> list[str]:
        """列出所有任务 ID。"""
        return [f.stem for f in sorted(self.dir.glob("*.json"))]


def _atomic_write_json(filepath: Path, data: dict) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(filepath.parent), prefix="." + filepath.name)
    try:
        os.write(fd, json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(tmp, str(filepath))
