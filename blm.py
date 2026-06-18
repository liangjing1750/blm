#!/usr/bin/env python3
"""
BLM - Business Language Modeling Tool

Usage:
  python blm.py
  python blm.py serve
"""

import argparse
import os
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
    # 模块意图：启动入口只负责解析运行时环境，把服务创建交给 blm_core.server。
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

    # 关键流程：目录允许通过环境变量覆盖，便于不同机器复用同一份代码。
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


def _run_server() -> None:
    config = build_runtime_config()
    run_server(
        port=config.port,
        app_dir=config.app_dir,
        workspace_dir=config.workspace_dir,
        open_browser=config.open_browser,
        admin_port=config.admin_port,
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="BLM - Business Language Modeling Tool")
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("serve", help="启动 Web 服务")

    args = parser.parse_args(argv)
    # 边界细节：无子命令时保持历史行为，直接启动本地 Web 服务。
    if args.command in {None, "serve"}:
        _run_server()
        return

    parser.error(f"unsupported command: {args.command}")


if __name__ == "__main__":
    main()
