"""Shared memory manager — MEMORY.md read/write with context injection."""

from pathlib import Path

MEMORY_FILE = "MEMORY.md"


class MemoryManager:
    """Manages the shared team memory file (MEMORY.md)."""

    def __init__(self, memory_path: Path):
        self.path = Path(memory_path)

    def read(self) -> str:
        if not self.path.exists():
            return ""
        return self.path.read_text("utf-8").strip()

    def write(self, content: str) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(content.strip() + "\n", "utf-8")

    def append(self, note: str) -> None:
        current = self.read()
        if current:
            current += "\n\n"
        current += f"- {note.strip()}"
        self.write(current)

    def system_block(self) -> str:
        """Return memory as a system prompt injection block."""
        content = self.read()
        if not content:
            return ""
        return f"## 团队记忆\n\n{content}"
