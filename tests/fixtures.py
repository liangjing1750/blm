"""测试 Fixtures — 临时目录、mock skills、mock workspaces。

提供可重用的测试辅助函数，避免每个测试文件重复 setup/teardown。
"""

import json
import tempfile
from pathlib import Path


class TempWorkspace:
    """临时工作区 — 自动创建和清理。

    Usage:
        with TempWorkspace() as ws:
            ws.create_skill("test-skill", "desc", "content")
            skills = ws.list_skills()
    """

    def __init__(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.skills_dir = self.root / ".blm" / "skills"
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        self.memory_path = self.root / ".blm" / "MEMORY.md"

    def create_skill(self, name: str, description: str, content: str) -> Path:
        from blm_ai.skill.skill_manager import SkillManager
        mgr = SkillManager(self.skills_dir)
        return mgr.create(name, description, content)

    def list_skills(self) -> list[dict]:
        from blm_ai.skill.skill_manager import SkillManager
        return SkillManager(self.skills_dir).list_all()

    def add_memory(self, text: str) -> None:
        self.memory_path.parent.mkdir(parents=True, exist_ok=True)
        current = self.memory_path.read_text("utf-8") if self.memory_path.exists() else ""
        self.memory_path.write_text((current + "\n§\n" + text).strip(), "utf-8")

    def create_session_file(self, session_id: str, messages: list[dict]) -> Path:
        sessions_dir = self.root / ".blm" / "sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)
        filepath = sessions_dir / f"test_{session_id}.jsonl"
        lines = []
        lines.append(json.dumps({"type": "session", "version": 3, "id": session_id,
                                  "timestamp": "20260101-120000", "cwd": str(self.root)}))
        parent_id = None
        for msg in messages:
            import uuid
            mid = uuid.uuid4().hex[:12]
            lines.append(json.dumps({"type": "message", "id": mid, "parentId": parent_id,
                                      "timestamp": "2026-01-01T12:00:00Z", "message": msg}))
            parent_id = mid
        lines.append(json.dumps({"type": "leaf", "id": "leaf", "targetId": parent_id,
                                  "timestamp": "2026-01-01T12:00:00Z"}))
        filepath.write_text("\n".join(lines), "utf-8")
        return filepath

    def cleanup(self):
        self.tmp.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.cleanup()


def make_mock_llm_factory():
    """返回测试用的 mock LLM 工厂函数。"""
    from tests.mock_llm import MockLLMClient
    return MockLLMClient
