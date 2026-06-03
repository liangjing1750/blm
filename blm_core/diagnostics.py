from __future__ import annotations

import json
import logging
import platform
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any


_LOG_DIR: Path | None = None


class JsonLineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(record.created)),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": getattr(record, "event", record.getMessage()),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            payload.update(fields)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_diagnostics(workspace_dir: Path, *, log_dir: Path | None = None) -> Path:
    global _LOG_DIR
    resolved_log_dir = (log_dir or workspace_dir / ".logs").resolve()
    resolved_log_dir.mkdir(parents=True, exist_ok=True)
    _LOG_DIR = resolved_log_dir

    formatter = JsonLineFormatter()
    root = logging.getLogger("blm")
    root.setLevel(logging.INFO)
    root.handlers.clear()

    handler = RotatingFileHandler(
        resolved_log_dir / "blm.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=7,
        encoding="utf-8",
    )
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.propagate = False

    error_handler = RotatingFileHandler(
        resolved_log_dir / "errors.log",
        maxBytes=2 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(formatter)
    root.addHandler(error_handler)
    return resolved_log_dir


def get_log_dir() -> Path | None:
    return _LOG_DIR


def log_event(logger_name: str, event: str, **fields: Any) -> None:
    logger = logging.getLogger(logger_name if logger_name.startswith("blm") else f"blm.{logger_name}")
    logger.info(event, extra={"event": event, "fields": _safe_fields(fields)})


def log_error(logger_name: str, event: str, **fields: Any) -> None:
    logger = logging.getLogger(logger_name if logger_name.startswith("blm") else f"blm.{logger_name}")
    logger.error(event, extra={"event": event, "fields": _safe_fields(fields)})


def runtime_fields() -> dict[str, str]:
    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
    }


def read_recent_log_events(limit: int = 100) -> list[dict]:
    log_dir = get_log_dir()
    if not log_dir:
        return []
    path = log_dir / "blm.log"
    if not path.exists():
        return []
    try:
        lines = path.read_text("utf-8").splitlines()[-max(1, int(limit)) :]
    except OSError:
        return []
    events = []
    for line in lines:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            events.append(payload)
    return events


def _safe_fields(fields: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for key, value in fields.items():
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe[key] = value
        elif isinstance(value, Path):
            safe[key] = str(value)
        else:
            try:
                json.dumps(value, ensure_ascii=False)
            except TypeError:
                safe[key] = str(value)
            else:
                safe[key] = value
    return safe
