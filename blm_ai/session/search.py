"""Cross-session search — SQLite FTS5-backed message lookup.

Three call modes:
  1. Discover: pass query → search across all sessions
  2. Scroll:  pass session_id + around_message_id → return window
  3. Browse:  no parameters → list recent sessions

Adapted from hermes' session_search_tool.py.
"""

import json
import sqlite3
import uuid
from pathlib import Path


class SessionSearch:
    """SQLite FTS5 search across all session messages."""

    def __init__(self, sessions_dir: Path, db_path: Path | None = None):
        self.dir = Path(sessions_dir)
        self.db_path = db_path or (self.dir / ".session_search.db")
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    session_path TEXT NOT NULL,
                    turn INTEGER DEFAULT 0,
                    role TEXT,
                    content TEXT,
                    timestamp TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            """)
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
                USING fts5(id, content, content=messages, content_rowid=rowid)
            """)
            conn.execute("""
                CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                    INSERT INTO messages_fts(rowid, id, content)
                    VALUES (new.rowid, new.id, new.content);
                END;
            """)
            conn.commit()

    def index_session(self, session_id: str, session_path: str) -> int:
        """Index all messages from a session JSONL file."""
        filepath = Path(session_path)
        if not filepath.exists():
            return 0

        count = 0
        with sqlite3.connect(str(self.db_path)) as conn:
            # Clear old index for this session
            conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))

            with open(filepath, encoding="utf-8") as f:
                turn = 0
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    etype = entry.get("type", "")
                    if etype == "message":
                        msg = entry.get("message", {})
                        role = msg.get("role", "")
                        content = self._extract_content(msg)
                        if content:
                            conn.execute(
                                "INSERT INTO messages(id, session_id, session_path, turn, role, content, timestamp) "
                                "VALUES(?, ?, ?, ?, ?, ?, ?)",
                                (uuid.uuid4().hex[:12], session_id, session_path,
                                 turn, role, content, entry.get("timestamp", "")),
                            )
                            count += 1
                    elif etype in ("turn_started", "compaction"):
                        turn += 1
            conn.commit()
        return count

    def search(self, query: str, limit: int = 5) -> list[dict]:
        """FTS5 full-text search across all sessions."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT m.* FROM messages m "
                "JOIN messages_fts f ON m.rowid = f.rowid "
                "WHERE messages_fts MATCH ? "
                "ORDER BY rank LIMIT ?",
                (query, limit),
            ).fetchall()
        return [dict(r) for r in rows]

    def scroll(self, session_id: str, around_message_id: str,
               window: int = 5) -> list[dict]:
        """Return messages around a given message ID."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            # Find the anchor's position
            anchor = conn.execute(
                "SELECT rowid FROM messages WHERE id = ? AND session_id = ?",
                (around_message_id, session_id),
            ).fetchone()
            if not anchor:
                return []

            rowid = anchor["rowid"]
            rows = conn.execute(
                "SELECT * FROM messages WHERE session_id = ? "
                "AND rowid BETWEEN ? AND ? ORDER BY rowid",
                (session_id, max(1, rowid - window), rowid + window),
            ).fetchall()
        return [dict(r) for r in rows]

    def recent_sessions(self, limit: int = 10) -> list[dict]:
        """Return recently active sessions."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT session_id, session_path, COUNT(*) as msg_count, "
                "MAX(timestamp) as last_active "
                "FROM messages GROUP BY session_id "
                "ORDER BY last_active DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    @staticmethod
    def _extract_content(msg: dict) -> str:
        content = msg.get("content", "")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        parts.append(str(block.get("text", "")))
                    elif block.get("type") == "tool_use":
                        parts.append(f"[tool:{block.get('name', '')}]")
                    elif block.get("type") == "tool_result":
                        parts.append(str(block.get("content", ""))[:200])
            return " ".join(parts)
        return ""
