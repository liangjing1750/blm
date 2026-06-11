"""Context collapse — project a shorter view over conversation history.

Replace old messages with summary placeholders stored in a collapse store,
keeping granular context in the REPL array. Collapses persist across turns.

Adapted from cc's contextCollapse pattern.
"""

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class CollapseEntry:
    """A collapsed span of the conversation."""
    start_index: int
    end_index: int
    summary: str
    committed: bool = False
    token_savings: int = 0


@dataclass
class CollapseStore:
    """Stores collapse entries — one per collapsed span."""
    entries: list[CollapseEntry] = field(default_factory=list)

    def add(self, entry: CollapseEntry) -> None:
        self.entries.append(entry)
        self.entries.sort(key=lambda e: e.start_index)

    def get_for_index(self, index: int) -> CollapseEntry | None:
        for entry in self.entries:
            if entry.start_index <= index < entry.end_index:
                return entry
        return None

    def drain_uncommitted(self) -> list[CollapseEntry]:
        uncommitted = [e for e in self.entries if not e.committed]
        return uncommitted

    def commit_all(self) -> int:
        count = 0
        for entry in self.entries:
            if not entry.committed:
                entry.committed = True
                count += 1
        return count

    def clear(self) -> None:
        self.entries.clear()


def apply_collapses(
    messages: list[dict],
    store: CollapseStore | None = None,
) -> tuple[list[dict], bool]:
    """Replace collapsed spans with summary placeholders. Returns (messages, changed)."""
    if not store or not store.entries:
        return messages, False

    changed = False
    collapsed: list[dict] = []
    skip_until: int = -1

    for i, msg in enumerate(messages):
        if i < skip_until:
            continue

        entry = store.get_for_index(i)
        if entry and entry.committed:
            collapsed.append({
                "role": "system",
                "content": f"[{entry.end_index - entry.start_index} messages collapsed: {entry.summary[:200]}]",
            })
            skip_until = entry.end_index
            changed = True
        else:
            collapsed.append(msg)

    return collapsed, changed


def collapse_span(
    messages: list[dict],
    start: int,
    end: int,
    summary: str,
    store: CollapseStore | None = None,
) -> CollapseEntry:
    """Register a collapse for messages[start:end]."""
    if store is None:
        store = CollapseStore()
    entry = CollapseEntry(
        start_index=start,
        end_index=end,
        summary=summary,
        token_savings=len(messages[start:end]) * 200,  # rough estimate
    )
    store.add(entry)
    return entry
