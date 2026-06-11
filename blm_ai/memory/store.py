"""Memory store — atomic file writes with freeze-snapshot pattern.

Heritage: hermes-agent's memory_tool.py MemoryStore.
Key invariant: write-to-disk on mutation, but system-prompt snapshot is frozen
at session start (keeps prompt cache prefix stable).
"""

import os
import re
import tempfile
from enum import Enum
from pathlib import Path


class MemoryTarget(Enum):
    MEMORY = "memory"  # MEMORY.md — team conventions, project facts
    USER = "user"      # USER.md — personal preferences


DELIMITER = "\n§\n"  # paragraph sign — separates memory entries


class MemoryStore:
    """Bounded, file-backed curated memory with §-delimited entries.

    Writes immediately persist to disk. The system prompt reads from a
    frozen snapshot captured at session start — keeping the prompt cache
    prefix stable across turns.
    """

    def __init__(
        self,
        memory_path: Path,
        user_path: Path | None = None,
        memory_char_limit: int = 4000,
        user_char_limit: int = 2000,
    ):
        self.memory_path = Path(memory_path)
        self.user_path = Path(user_path) if user_path else self.memory_path.parent / "USER.md"
        self.memory_char_limit = memory_char_limit
        self.user_char_limit = user_char_limit

        # Freeze snapshots — captured at load time, never change mid-session
        self._snapshots: dict[str, str] = {}
        # Live state — always reflects current disk
        self._live: dict[str, str] = {}

    def load_from_disk(self) -> None:
        """Load both files and freeze the snapshot."""
        for target, path, limit in [
            ("memory", self.memory_path, self.memory_char_limit),
            ("user", self.user_path, self.user_char_limit),
        ]:
            content = ""
            if path.exists():
                content = path.read_text("utf-8").strip()[:limit]
            self._live[target] = content
            self._snapshots[target] = content

    def format_for_system_prompt(self, target: str = "memory") -> str:
        """Return the frozen snapshot (not live state)."""
        return self._snapshots.get(target, "")

    def add(self, target: str, content: str) -> dict:
        """Append a §-delimited entry. Returns operation result."""
        content = content.strip()
        if not content:
            return {"status": "error", "message": "Content is empty"}

        target_path = self._resolve_path(target)
        current = self._live.get(target, "")

        # Check duplicates
        if content in current:
            return {"status": "skipped", "message": "Entry already exists"}

        new_content = current + DELIMITER + content if current else content
        limit = self.memory_char_limit if target == "memory" else self.user_char_limit

        if len(new_content) > limit:
            # Drop oldest entries until within limit
            entries = new_content.split(DELIMITER)
            while entries and len(DELIMITER.join(entries)) > limit:
                entries.pop(0)
            new_content = DELIMITER.join(entries)

        _atomic_write(target_path, new_content)
        self._live[target] = new_content
        return {"status": "ok", "message": "Memory updated"}

    def remove(self, target: str, old_text: str) -> dict:
        """Remove an entry matching old_text. Returns operation result."""
        target_path = self._resolve_path(target)
        current = self._live.get(target, "")
        old_text = old_text.strip()

        entries = current.split(DELIMITER)
        new_entries = [e.strip() for e in entries if e.strip() != old_text]
        new_content = DELIMITER.join(new_entries)

        if new_content == current:
            return {"status": "not_found", "message": "Entry not found"}

        _atomic_write(target_path, new_content)
        self._live[target] = new_content
        return {"status": "ok", "message": "Memory entry removed"}

    def replace(self, target: str, old_text: str, new_content: str) -> dict:
        """Replace one entry with another."""
        self.remove(target, old_text)
        return self.add(target, new_content)

    def _resolve_path(self, target: str) -> Path:
        if target == "user":
            return self.user_path
        return self.memory_path


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix="." + path.name)
    try:
        os.write(fd, content.encode("utf-8"))
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(tmp, str(path))
