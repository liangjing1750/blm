"""Session branching — fork, rewind, summarize.

pi-mono-style conversation tree navigation.
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from blm_ai.session.manager import SessionManager
from blm_ai.session.storage import SessionStorage


class BranchManager:
    """Manages conversation branches: fork, rewind, summarize ranges."""

    def __init__(self, sessions_dir: Path):
        self.dir = Path(sessions_dir)
        self.manager = SessionManager(sessions_dir)

    def fork(self, session_id: str, at_entry_id: str,
             cwd: str = "") -> str | None:
        """Create a new session by copying entries up to at_entry_id."""
        storage = self.manager.load(session_id)
        if not storage:
            return None

        # Create new session
        meta = self.manager.create(cwd=cwd, parent=session_id)

        # Copy entries up to the fork point
        path = storage.get_path_to_root()
        new_storage = SessionStorage(self.dir)
        parent_id = None
        for entry in path:
            if entry.type == "message":
                msg_id = new_storage.append_message(
                    entry.data.get("message", {}), parent_id=parent_id)
                parent_id = msg_id
            if entry.id == at_entry_id:
                break

        # Add branch summary
        new_storage.append_branch_summary(
            from_id=at_entry_id,
            summary=f"Forked from {session_id} at {at_entry_id}",
            parent_id=parent_id,
        )
        new_storage.flush(self.dir / f"{meta.id}.jsonl"
                          if not str(meta.path).endswith(".jsonl")
                          else meta.path)
        return meta.id

    def rewind(self, session_id: str, to_entry_id: str) -> bool:
        """Set the leaf to to_entry_id, effectively 'undoing' later entries."""
        storage = self.manager.load(session_id)
        if not storage:
            return False
        storage.set_leaf(to_entry_id)
        for f in self.dir.glob("*.jsonl"):
            if session_id in f.name:
                storage.flush(f)
                return True
        return False

    def summarize_range(
        self, session_id: str, from_entry_id: str, direction: str = "from"
    ) -> dict | None:
        """Get a summary of messages after/before a pivot entry.

        direction='from': summarize entries AFTER the pivot (keep earlier ones)
        direction='up_to': summarize entries BEFORE the pivot (keep recent ones)
        """
        storage = self.manager.load(session_id)
        if not storage:
            return None

        path = storage.get_path_to_root()
        entries_after = []
        found = False
        for entry in path:
            if entry.id == from_entry_id:
                found = True
                continue
            if found and direction == "from":
                entries_after.append(entry)
            elif not found and direction == "up_to":
                entries_after.append(entry)

        return {
            "pivot": from_entry_id,
            "direction": direction,
            "entry_count": len(entries_after),
            "first_id": entries_after[0].id if entries_after else None,
            "last_id": entries_after[-1].id if entries_after else None,
        }
