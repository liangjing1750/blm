#!/usr/bin/env python3
"""
BLM - Business Language Modeling Tool
用法:
  python blm.py                  启动服务器（默认）
  python -m blm serve            启动服务器
  python -m blm ai ask <name>    业务问答
  python -m blm ai export <name> AI 截图导出 DOCX
"""

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from blm_core.server import run_server

PORT = 8081
ADMIN_PORT = 8091
ROOT = Path(__file__).parent


@dataclass(frozen=True)
class RuntimeConfig:
    port: int
    admin_port: int | None
    app_dir: Path
    workspace_dir: Path
    open_browser: bool


def _read_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off", ""}


def _resolve_path(root: Path, value: str | None, fallback: Path) -> Path:
    if not value:
        return fallback
    path = Path(value)
    if path.is_absolute():
        return path
    return root / path


def build_runtime_config() -> RuntimeConfig:
    port_text = (os.getenv("BLM_PORT") or str(PORT)).strip()
    try:
        port = int(port_text)
    except ValueError as exc:
        raise ValueError("BLM_PORT 必须是整数") from exc
    admin_port_text = (os.getenv("BLM_ADMIN_PORT") or str(ADMIN_PORT)).strip()
    admin_port = None
    if admin_port_text:
        try:
            parsed_admin_port = int(admin_port_text)
        except ValueError as exc:
            raise ValueError("BLM_ADMIN_PORT 必须是整数") from exc
        admin_port = parsed_admin_port if parsed_admin_port > 0 else None

    app_dir = _resolve_path(ROOT, os.getenv("BLM_APP_DIR"), ROOT / "app")
    workspace_dir = _resolve_path(ROOT, os.getenv("BLM_WORKSPACE_DIR"), ROOT / "workspace")
    open_browser = not _read_bool_env("BLM_NO_BROWSER", False)
    return RuntimeConfig(
        port=port,
        admin_port=admin_port,
        app_dir=app_dir,
        workspace_dir=workspace_dir,
        open_browser=open_browser,
    )


def _get_workspace_dir() -> Path:
    return _resolve_path(ROOT, os.getenv("BLM_WORKSPACE_DIR"), ROOT / "workspace")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="BLM - Business Language Modeling Tool")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("serve", help="启动 Web 服务器")

    ai_parser = subparsers.add_parser("ai", help="启动 AI 助手")
    ai_parser.add_argument("workspace", nargs="?", help="工作区名称（可选，启动后可在对话中切换）")

    args = parser.parse_args(argv)

    if args.command == "ai":
        from blm_ai.config import load_config
        from blm_ai.cli import run_agent
        config = load_config(_get_workspace_dir())
        run_agent(args.workspace, config)
    elif args.command == "serve":
        config = build_runtime_config()
        run_server(
            port=config.port,
            app_dir=config.app_dir,
            workspace_dir=config.workspace_dir,
            open_browser=config.open_browser,
            admin_port=config.admin_port,
        )
    else:
        config = build_runtime_config()
        run_server(
            port=config.port,
            app_dir=config.app_dir,
            workspace_dir=config.workspace_dir,
            open_browser=config.open_browser,
            admin_port=config.admin_port,
        )


if __name__ == "__main__":
    main()
