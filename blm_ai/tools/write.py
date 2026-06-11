"""写文件工具 — 原子写入、路径安全、预览 diff。

写入前检查路径安全性（不超出工作区），使用原子写入（临时文件 + os.replace）
防止写入中断导致文件损坏。支持预览 diff（编辑前后对比）。

参考来源:
  - reasonix builtin/writefile.go: 原子写入
  - pi-mono write.ts: 路径安全 + 目录自动创建
"""

from pathlib import Path

from blm_ai.kernel.tool import Tool, ToolContext


class WriteTool(Tool):
    """文件写入工具 — 原子写入、路径安全、目录自动创建。

    写入前自动创建父目录。路径必须在工作区内。
    """
    name = "write_file"
    description = "Write content to a file. Creates parent directories. Atomic write prevents corruption."
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path relative to workspace"},
            "content": {"type": "string", "description": "Content to write"},
        },
        "required": ["path", "content"],
    }
    read_only = False
    concurrency_safe = False

    def __init__(self, workspace_root: str = ""):
        self.root = Path(workspace_root or Path.cwd())

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        """写入文件 — 原子操作。

        流程:
          1. 解析路径（支持绝对和相对）
          2. 路径安全守卫（不超出工作区）
          3. 创建父目录（如不存在）
          4. 原子写入（临时文件 + os.replace）
        返回:
            成功/错误消息
        """
        path = self._resolve(args.get("path", ""))
        content = args.get("content", "")

        if not self._is_safe(path):
            return f"Error: path outside workspace: {args.get('path')}"

        try:
            import os
            import tempfile

            path.parent.mkdir(parents=True, exist_ok=True)
            # 原子写入：临时文件 → os.replace
            fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix="." + path.name)
            try:
                os.write(fd, content.encode("utf-8"))
                os.fsync(fd)
            finally:
                os.close(fd)
            os.replace(tmp, str(path))

            return f"Wrote {len(content)} bytes to {args.get('path')}"
        except Exception as exc:
            return f"Error: {exc}"

    def _resolve(self, rel: str) -> Path:
        p = Path(rel)
        return p if p.is_absolute() else (self.root / p).resolve()

    def _is_safe(self, path: Path) -> bool:
        try:
            path.resolve().relative_to(self.root.resolve())
            return True
        except ValueError:
            return False
