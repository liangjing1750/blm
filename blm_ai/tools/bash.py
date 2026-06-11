"""Bash 工具 — shell 命令执行，支持流式输出、超时、截断、进程组管理。

改编自 pi-mono 的 bash.ts 和 reasonix 的 sandbox 分类。
流式输出通过 ToolContext.emit() 发送进度事件给前端。
危险命令自动检测，通过 PermissionPipeline 门控。

参考来源:
  - pi-mono bash.ts: 流式输出 + 截断 + OutputAccumulator
  - reasonix bash.go: 进程组管理 + timeout + 只读分类
  - cc BashTool: concurrent-safe 标记 + sibling abort

安全:
  - 危险命令列表 + 子模式检测（sandbox.py）
  - Plan 模式阻止所有非只读 bash
  - 30秒超时 + 进程组强杀（防孤儿进程）
"""

import asyncio
import logging
import os
import signal
from pathlib import Path

from blm_ai.kernel.sandbox import classify_bash
from blm_ai.kernel.tool import Tool, ToolContext

logger = logging.getLogger(__name__)

DEFAULT_MAX_LINES = 500
DEFAULT_MAX_BYTES = 128 * 1024
DEFAULT_TIMEOUT = 120
BASH_UPDATE_INTERVAL = 0.1


class BashTool(Tool):
    """Shell 命令执行工具 — 流式输出 + 超时 + 截断。

    只读命令（ls/cat/grep 等）标记为 read_only=True，可通过 Plan 模式。
    危险命令（rm/DD/iptables 等）需要用户审批。
    """

    name = "bash"
    description = (
        "Run a shell command in the workspace directory. "
        "Read-only commands (ls, cat, grep, find, etc.) are safe. "
        "Destructive commands (rm, sudo, chmod, etc.) require approval."
    )
    parameters = {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "Shell command to run"},
            "timeout": {"type": "integer", "description": "Timeout in seconds (default 120)"},
        },
        "required": ["command"],
    }
    concurrency_safe = False  # bash 命令串行执行（避免竞态条件）

    def __init__(self, cwd: str | Path = ""):
        """初始化 Bash 工具。

        参数:
            cwd: 工作目录（命令在此目录下执行）
        """
        self.cwd = str(cwd or Path.cwd())
        self.read_only = False  # 运行时根据命令动态调整

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        """执行 shell 命令 — 流式输出 + 超时 + 截断。

        流程:
          1. 分类命令（只读/危险）
          2. 动态设置 read_only 标志（用于权限门控）
          3. 启动子进程
          4. 流式读取输出（通过 ctx.emit 发送进度事件）
          5. 超时保护 + 进程组强杀
          6. 截断长输出
        返回:
            命令的标准输出（可能截断）
        """
        command = args.get("command", "").strip()
        if not command:
            return "Error: no command provided"

        timeout = args.get("timeout", DEFAULT_TIMEOUT)

        # 分类命令 — 动态设置 read_only
        classification = classify_bash(command)
        self.read_only = classification.is_readonly

        try:
            # 启动子进程（Unix: 创建新会话以支持进程组强杀）
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=self.cwd,
                preexec_fn=os.setsid if os.name != "nt" else None,
            )

            # 流式读取输出
            output_parts: list[str] = []
            try:
                while True:
                    line = await asyncio.wait_for(
                        proc.stdout.readline(), timeout=timeout
                    )
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace")
                    output_parts.append(decoded)
                    # 发送进度事件（流式更新前端）
                    if ctx.events and len(output_parts) % 10 == 0:
                        ctx.emit("tool_progress", output=decoded[:200])
            except asyncio.TimeoutError:
                _kill_process(proc)
                return f"Error: Command timed out after {timeout}s\n{''.join(output_parts)}"

            await proc.wait()
            output = "".join(output_parts) if output_parts else "(no output)"
            output = self._truncate(output)
            return output

        except FileNotFoundError:
            return "Error: bash not available on this system"
        except Exception as exc:
            return f"Error executing command: {exc}"

    @staticmethod
    def _truncate(output: str) -> str:
        """截断长输出 — 保留头部，添加截断提示。

        优先按行截断（DEFAULT_MAX_LINES），然后按字节截断（DEFAULT_MAX_BYTES）。
        """
        lines = output.splitlines()
        if len(lines) > DEFAULT_MAX_LINES:
            kept = lines[:DEFAULT_MAX_LINES]
            total = len(lines)
            lines = kept + [f"\n... ({total - DEFAULT_MAX_LINES} more lines, {total} total)"]

        text = "\n".join(lines)
        if len(text.encode("utf-8")) > DEFAULT_MAX_BYTES:
            text = text[:DEFAULT_MAX_BYTES // 2]
            text += "\n\n... (output truncated to 64KB)"
        return text

    async def check_permissions(self, args: dict, ctx) -> str:
        """工具特定的权限检查 — 用于 PermissionPipeline Gate 2。"""
        command = args.get("command", "")
        classification = classify_bash(command)
        if classification.is_dangerous:
            return "deny" if "rm -rf /" in command else "ask"
        return "allow"


def _kill_process(proc: asyncio.subprocess.Process) -> None:
    """强杀子进程及其进程组 — 防止孤儿进程。"""
    try:
        if os.name != "nt":
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        else:
            proc.kill()
    except Exception:
        pass
