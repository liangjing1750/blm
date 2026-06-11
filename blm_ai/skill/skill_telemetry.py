"""Lightweight usage tracking for skills — best-effort, never blocks."""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def _usage_file(skills_dir: Path) -> Path:
    return Path(skills_dir) / ".usage.json"


def _read_usage(skills_dir: Path) -> dict:
    uf = _usage_file(skills_dir)
    if not uf.exists():
        return {}
    try:
        return json.loads(uf.read_text("utf-8"))
    except Exception:
        return {}


def _write_usage(skills_dir: Path, data: dict) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(skills_dir), prefix=".usage.")
    try:
        os.write(fd, json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(tmp, str(_usage_file(skills_dir)))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_entry(data: dict, name: str) -> dict:
    if name not in data:
        data[name] = {"created_at": _now(), "use_count": 0, "view_count": 0, "patch_count": 0}
    return data[name]


def bump_use(skills_dir: Path, name: str) -> None:
    try:
        data = _read_usage(skills_dir)
        e = _ensure_entry(data, name)
        e["use_count"] = e.get("use_count", 0) + 1
        e["last_used_at"] = _now()
        _write_usage(skills_dir, data)
    except Exception:
        pass  # best-effort


def bump_view(skills_dir: Path, name: str) -> None:
    try:
        data = _read_usage(skills_dir)
        e = _ensure_entry(data, name)
        e["view_count"] = e.get("view_count", 0) + 1
        e["last_viewed_at"] = _now()
        _write_usage(skills_dir, data)
    except Exception:
        pass


def bump_patch(skills_dir: Path, name: str) -> None:
    try:
        data = _read_usage(skills_dir)
        e = _ensure_entry(data, name)
        e["patch_count"] = e.get("patch_count", 0) + 1
        e["last_patched_at"] = _now()
        _write_usage(skills_dir, data)
    except Exception:
        pass


def get_usage(skills_dir: Path, name: str | None = None) -> dict:
    try:
        data = _read_usage(skills_dir)
        if name:
            return data.get(name, {})
        return data
    except Exception:
        return {}
