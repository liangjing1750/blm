"""配置管理 — 环境变量、TOML 文件、命令行参数统一入口。

支持多种配置来源（优先级从高到低）:
  1. 环境变量（BLM_*、LLM_PROVIDER 等）
  2. .env 文件（python-dotenv 自动加载）
  3. 代码默认值

提供者检测: 根据 LLM_PROVIDER 自动选择 Anthropic 或 OpenAI 兼容客户端。
Workspace 根目录默认从 BLM_WORKSPACE_DIR 环境变量读取。

参考来源:
  - reasonix config.go: TOML + 多 provider 配置
  - hermes config: 环境变量 + 插件配置
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


@dataclass
class Config:
    """BLM Agent 全局配置。

    provider_kind: "anthropic" / "openai" / "qwen" / "deepseek-openai"
    base_url: API 端点 URL
    api_key: API 密钥
    model_id: 模型名称
    workspace_dir: 工作区根目录（BLM workspace/ 的路径）
    temp_dir: 临时文件目录
    max_turns: Agent 最大轮次
    interactive: 是否交互模式（True = 需要用户确认工具调用）
    permission_mode: 权限模式（"default"/"bypass"/"plan"/"headless"）
    """
    base_url: str = ""
    api_key: str = ""
    model_id: str = ""
    provider_kind: str = "openai"
    workspace_dir: Path = field(default_factory=Path.cwd)
    temp_dir: Path = field(default_factory=lambda: Path.cwd() / ".blm_ai_temp")
    max_turns: int = 30
    interactive: bool = True
    permission_mode: str = "default"


def load_config(workspace_dir: str | Path | None = None) -> Config:
    """加载配置 — 从环境变量组装 Config 对象。

    检测逻辑:
      - LLM_PROVIDER=openai → 读取 OPENAI_BASE_URL/OPENAI_API_KEY
      - LLM_PROVIDER=anthropic → 读取 ANTHROPIC_BASE_URL/ANTHROPIC_API_KEY
      - MODEL_ID 覆盖模型名称
      - BLM_WORKSPACE_DIR 覆盖工作区根目录

    参数:
        workspace_dir: 工作区根目录（覆盖环境变量 BLM_WORKSPACE_DIR）
    返回:
        完整配置对象
    """
    load_dotenv(override=True)

    provider = os.getenv("LLM_PROVIDER", "openai").strip().lower()
    ws = Path(workspace_dir) if workspace_dir else Path(
        os.getenv("BLM_WORKSPACE_DIR", str(Path.cwd()))
    )

    if provider == "openai":
        return Config(
            provider_kind="openai",
            base_url=os.getenv("OPENAI_BASE_URL", ""),
            api_key=os.getenv("OPENAI_API_KEY", ""),
            model_id=os.getenv("MODEL_ID", ""),
            workspace_dir=ws,
            temp_dir=ws / ".blm_ai_temp",
            max_turns=int(os.getenv("BLM_MAX_TURNS", "30")),
            interactive=os.getenv("BLM_INTERACTIVE", "1") not in ("0", "false", "no"),
            permission_mode=os.getenv("BLM_PERMISSION_MODE", "default"),
        )
    else:
        base_url = os.getenv("ANTHROPIC_BASE_URL", "")
        if base_url:
            os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)
        return Config(
            provider_kind="anthropic",
            base_url=base_url,
            api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            model_id=os.getenv("MODEL_ID", ""),
            workspace_dir=ws,
            temp_dir=ws / ".blm_ai_temp",
            max_turns=int(os.getenv("BLM_MAX_TURNS", "30")),
            interactive=os.getenv("BLM_INTERACTIVE", "1") not in ("0", "false", "no"),
            permission_mode=os.getenv("BLM_PERMISSION_MODE", "default"),
        )
