"""会话管理器 — 按用户隔离，CRUD + 列表 + 加载。"""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from blm_ai.session.storage import SessionMeta, SessionStorage


@dataclass
class SessionInfo:
    id: str; path: str; title: str = ""; cwd: str = ""
    created_at: str = ""; message_count: int = 0; turn_count: int = 0
    model: str = ""; parent_session: str | None = None


class SessionManager:
    """按用户隔离的会话管理器。"""

    def __init__(self, sessions_root: Path, user_id: str = "default"):
        self.root = Path(sessions_root)
        self.user_id = user_id
        self.dir = self.root / user_id
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / ".trash").mkdir(exist_ok=True)

    def create(self, cwd: str = "", parent: str | None = None) -> SessionMeta:
        storage = SessionStorage(self.dir)
        return storage.create(cwd=cwd, parent_session=parent)

    def list_all(self, limit: int = 50) -> list[SessionInfo]:
        sessions = []
        for f in sorted(self.dir.glob("*.jsonl"), reverse=True)[:limit]:
            try:
                info = self._parse(f)
                if info: sessions.append(info)
            except Exception: continue
        return sessions

    def load(self, session_id: str) -> SessionStorage | None:
        for f in self.dir.glob("*.jsonl"):
            if session_id in f.name:
                storage = SessionStorage(self.dir); storage.load(f); return storage
        return None

    def delete(self, session_id: str, permanent: bool = False) -> bool:
        for f in self.dir.glob("*.jsonl"):
            if session_id in f.name:
                if permanent: f.unlink()
                else: f.rename(self.dir / ".trash" / f.name)
                return True
        return False

    def rename(self, session_id: str, title: str) -> bool:
        for f in self.dir.glob("*.jsonl"):
            if session_id in f.name:
                with open(f, "a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"type":"custom","id":f"rename-{title}","parentId":None,"timestamp":datetime.now(timezone.utc).isoformat(),"customType":"session_info","name":title}, ensure_ascii=False) + "\n")
                return True
        return False

    @staticmethod
    def _parse(f: Path) -> SessionInfo | None:
        with open(f, encoding="utf-8") as fh:
            header = json.loads(fh.readline().strip())
        msg_count = sum(1 for _ in open(f, encoding="utf-8") if '"type":"message"' in _)
        return SessionInfo(id=header.get("id", f.stem), path=str(f), cwd=header.get("cwd",""), created_at=header.get("timestamp",""), message_count=msg_count, parent_session=header.get("parentSession"))
