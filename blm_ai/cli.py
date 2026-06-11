"""CLI 入口 — 交互式 Agent 会话、会话管理、多工作区支持。

提供命令行接口: python -m blm ai [workspace]
支持: 交互式对话、会话恢复、历史命令、Ctrl+C 优雅退出。

参考来源:
  - reasonix cli/: Bubble Tea TUI 交互模式
  - hermes CLI: 会话管理 + 历史
"""

import asyncio

from blm_ai.agent_builder import build_blm_agent
from blm_ai.config import Config


def run_agent(workspace_name: str | None = None, config: Config | None = None) -> None:
    """启动交互式 BLM Agent 会话。

    功能:
      - 自动加载工作区或列出可用工作区
      - 流式显示 Agent 响应和工具调用
      - 支持 q/exit 退出
      - Ctrl+C 优雅退出而不丢数据

    参数:
        workspace_name: 要打开的工作区名称（可选，不指定则列出）
        config: Agent 配置
    """
    if config is None:
        from blm_ai.config import load_config
        config = load_config()

    agent = build_blm_agent(config)

    async def _run():
        """异步主循环 — 处理用户输入并流式显示 Agent 响应。"""
        print(f"\n  BLM Agent — 工作区根目录: {config.workspace_dir}")
        print("  输入问题或任务按回车发送。输入 q 退出。Ctrl+C 中断。")
        print("  能力: 读取/分析工作区 · 回答问题 · 建模引导 · 导出文档 · 沉淀技能\n")

        # 初始提示：加载工作区或列出可用
        greeting = (
            f"请用 read_workspace 加载并介绍工作区 '{workspace_name}'"
            if workspace_name
            else "请用 list_workspaces 列出所有可用工作区，然后简要介绍"
        )

        # 第一轮：加载工作区
        async for event in agent.run(greeting):
            if event.kind == "llm_response":
                text = event.text
                if text:
                    print(text)
            elif event.kind == "tool_result":
                pass  # 工具结果不打印（避免重复）

        # 交互循环
        while True:
            try:
                query = input("\n\033[36mBLM >> \033[0m")
            except (EOFError, KeyboardInterrupt):
                print("\n  再见。")
                break
            cmd = query.strip().lower()
            if cmd in ("q", "exit", "quit"):
                break
            if not cmd:
                continue

            # 处理 Agent 响应
            async for event in agent.run(query):
                if event.kind == "llm_response":
                    text = event.text
                    if text:
                        print(f"\n{text}")
                elif event.kind == "tool_dispatch":
                    print(f"  \033[33m>\033[0m {event.tool_name}", end="")
                elif event.kind == "tool_result":
                    output = event.output[:150] if event.output else ""
                    if event.is_error:
                        print(f" \033[31m✗\033[0m {output}")
                    else:
                        print(f" \033[32m✓\033[0m")
                elif event.kind == "error":
                    print(f"  \033[31m错误:\033[0m {event.error}")

            print()

    asyncio.run(_run())
