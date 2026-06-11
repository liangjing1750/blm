"""Background task manager — run tasks asynchronously with status tracking."""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from blm_ai.kernel.tool import Tool, ToolContext


@dataclass
class TaskJob:
    id: str
    name: str
    status: str = "queued"  # queued, running, done, failed
    progress: int = 0
    message: str = ""
    result: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TaskManager:
    """Lightweight in-process job manager."""

    def __init__(self):
        self._jobs: dict[str, TaskJob] = {}

    def create(self, name: str) -> TaskJob:
        job = TaskJob(id=uuid.uuid4().hex[:8], name=name)
        self._jobs[job.id] = job
        return job

    def update(self, job_id: str, **kwargs) -> None:
        job = self._jobs.get(job_id)
        if job:
            for k, v in kwargs.items():
                setattr(job, k, v)
            job.updated_at = datetime.now(timezone.utc).isoformat()

    def get(self, job_id: str) -> TaskJob | None:
        return self._jobs.get(job_id)

    def list_all(self) -> list[TaskJob]:
        return list(self._jobs.values())


class TaskTool(Tool):
    name = "task"
    description = "Manage background tasks. Use 'list' to see all, 'status' to check one."
    parameters = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["list", "status"],
                "description": "list or status"
            },
            "job_id": {"type": "string", "description": "Job ID for status check"},
        },
        "required": ["action"],
    }
    read_only = True

    def __init__(self, manager: TaskManager | None = None):
        super().__init__()
        self._tasks = manager or TaskManager()

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        action = args.get("action", "")
        if action == "list":
            jobs = self._tasks.list_all()
            if not jobs:
                return "(no background tasks)"
            return "\n".join(
                f"- {j.id}: {j.name} [{j.status}] {j.message}"
                for j in jobs
            )
        if action == "status":
            job = self._tasks.get(args.get("job_id", ""))
            if not job:
                return "Job not found"
            return (
                f"Job: {job.name}\n"
                f"Status: {job.status}\n"
                f"Progress: {job.progress}%\n"
                f"Message: {job.message}\n"
                f"Result: {job.result or 'N/A'}"
            )
        return f"Unknown action: {action}"
