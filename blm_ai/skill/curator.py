"""Skill curator — automatic lifecycle management.

Periodically reviews agent-created skills and transitions them:
  active → stale (30 days unused) → archived (90 days unused, moved to .archive/)

Never touches bundled or hub-installed skills.
Pinned skills bypass all auto-transitions.
"""

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from blm_ai.skill.skill_telemetry import get_usage

logger = logging.getLogger(__name__)

CURATOR_INTERVAL_DAYS = 7
STALE_AFTER_DAYS = 30
ARCHIVE_AFTER_DAYS = 90


def run_curator(skills_dir: Path, dry_run: bool = False) -> dict:
    """Review skills and apply lifecycle transitions.

    Returns a report dict with actions taken.
    """
    skills_dir = Path(skills_dir)
    archive_dir = skills_dir / ".archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    usage = get_usage(skills_dir)
    now = datetime.now(timezone.utc)
    report = {"stale": [], "archived": [], "skipped": [], "errors": []}

    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue

        skill_file = entry / "SKILL.md"
        if not skill_file.exists():
            continue

        name = entry.name
        u = usage.get(name, {})

        # Skip pinned
        if u.get("pinned"):
            report["skipped"].append(f"{name} (pinned)")
            continue

        last_used = _parse_iso(u.get("last_used_at", "")) or _parse_iso(
            u.get("created_at", ""))
        use_count = u.get("use_count", 0)

        if last_used is None:
            continue

        days_since_use = (now - last_used).days

        if days_since_use >= ARCHIVE_AFTER_DAYS and use_count <= 1:
            # Archive: move to .archive/
            if not dry_run:
                try:
                    import shutil
                    dest = archive_dir / name
                    if dest.exists():
                        shutil.rmtree(dest)
                    shutil.move(str(entry), str(dest))
                except Exception as exc:
                    report["errors"].append(f"{name}: {exc}")
                    continue
            report["archived"].append(
                f"{name} ({days_since_use}d unused, {use_count} uses)")
        elif days_since_use >= STALE_AFTER_DAYS:
            report["stale"].append(
                f"{name} ({days_since_use}d unused, {use_count} uses)")

    if not dry_run and (report["stale"] or report["archived"]):
        logger.info(
            "Curator: %d stale, %d archived",
            len(report["stale"]), len(report["archived"]),
        )

    return report


def pin_skill(skills_dir: Path, name: str) -> bool:
    """Pin a skill to prevent auto-archival."""
    from blm_ai.skill.skill_telemetry import _read_usage, _write_usage
    try:
        data = _read_usage(skills_dir)
        if name not in data:
            data[name] = {}
        data[name]["pinned"] = True
        _write_usage(skills_dir, data)
        return True
    except Exception:
        return False


def unpin_skill(skills_dir: Path, name: str) -> bool:
    """Unpin a skill to allow auto-archival."""
    from blm_ai.skill.skill_telemetry import _read_usage, _write_usage
    try:
        data = _read_usage(skills_dir)
        if name in data:
            data[name].pop("pinned", None)
        _write_usage(skills_dir, data)
        return True
    except Exception:
        return False


def _parse_iso(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None
