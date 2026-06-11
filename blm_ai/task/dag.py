"""任务 DAG 系统 — s12 文件持久化的任务依赖图。

s12 模式: 每个任务是一个 JSON 文件，支持 blockedBy 依赖关系。
状态机: pending → in_progress → completed（阻止启动未满足依赖的任务）。
"""

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path


class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"


@dataclass
class Task:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    subject: str = ""
    description: str = ""
    status: TaskStatus = TaskStatus.PENDING
    owner: str = ""
    blocked_by: list[str] = field(default_factory=list)
    blocks: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: str = ""

    def can_start(self, all_tasks: dict[str, "Task"]) -> bool:
        """检查所有依赖是否已完成 — 依赖未满足则不能开始。"""
        if self.status == TaskStatus.CANCELLED:
            return False
        for bid in self.blocked_by:
            dep = all_tasks.get(bid)
            if dep and dep.status != TaskStatus.COMPLETED:
                return False
        return self.status == TaskStatus.PENDING

    def mark_in_progress(self, owner: str = "") -> None:
        self.status = TaskStatus.IN_PROGRESS
        self.owner = owner
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def mark_completed(self) -> None:
        self.status = TaskStatus.COMPLETED
        self.completed_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.completed_at

    def mark_blocked(self, reason: str = "") -> None:
        self.status = TaskStatus.BLOCKED
        self.description = f"{self.description}\n[BLOCKED: {reason}]" if reason else self.description
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        return {
            "id": self.id, "subject": self.subject, "description": self.description,
            "status": self.status.value, "owner": self.owner,
            "blockedBy": self.blocked_by, "blocks": self.blocks,
            "tags": self.tags,
            "createdAt": self.created_at, "updatedAt": self.updated_at,
            "completedAt": self.completed_at,
        }


class TaskDAG:
    """任务依赖图 — 管理任务集合及其依赖关系。"""

    def __init__(self):
        self._tasks: dict[str, Task] = {}

    def add(self, task: Task) -> None:
        self._tasks[task.id] = task

    def get(self, task_id: str) -> Task | None:
        return self._tasks.get(task_id)

    def list_all(self, status: TaskStatus | None = None) -> list[Task]:
        tasks = list(self._tasks.values())
        if status:
            tasks = [t for t in tasks if t.status == status]
        return sorted(tasks, key=lambda t: t.created_at, reverse=True)

    def get_ready(self) -> list[Task]:
        """返回所有依赖已满足的待处理任务。"""
        return [t for t in self._tasks.values() if t.can_start(self._tasks)]

    def get_blocked(self) -> list[Task]:
        """返回被阻塞的任务及其阻塞原因。"""
        blocked = []
        for task in self._tasks.values():
            if task.status == TaskStatus.PENDING:
                unmet = [bid for bid in task.blocked_by
                         if self._tasks.get(bid, Task()).status != TaskStatus.COMPLETED]
                if unmet:
                    blocked.append((task, unmet))
        return [t for t, _ in blocked]

    def get_next(self) -> Task | None:
        """返回下一个可开始的任务（FIFO 顺序）。"""
        ready = self.get_ready()
        return ready[0] if ready else None

    @property
    def stats(self) -> dict:
        counts = {s.value: 0 for s in TaskStatus}
        for t in self._tasks.values():
            counts[t.status.value] += 1
        return {"total": len(self._tasks), **counts}
