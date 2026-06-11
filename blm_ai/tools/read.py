"""读文件工具 — 偏移/限制、图片检测、大文件分页。

支持文本文件和图片文件。大文件支持分页读取（offset/limit）。
图片文件自动检测 MIME 类型并返回 base64 编码。

参考来源:
  - pi-mono read.ts: 图片检测+缩放、大文件分页
  - reasonix builtin/readfile.go: 偏移+限制+截断
"""

import base64
import mimetypes
from pathlib import Path

from blm_ai.kernel.tool import Tool, ToolContext

DEFAULT_MAX_LINES = 2000
DEFAULT_MAX_BYTES = 256 * 1024
IMAGE_MAX_DIM = 2000

class ReadTool(Tool):
    """文件读取工具 — 文本分页、图片 base64、路径安全。"""
    name = "read_file"
    description = "Read file contents. Supports offset/limit for large files. Images returned as base64."
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path relative to workspace"},
            "offset": {"type": "integer", "description": "Line number to start (1-based)"},
            "limit": {"type": "integer", "description": "Max lines to read"},
        },
        "required": ["path"],
    }
    read_only = True

    def __init__(self, workspace_root: str = ""):
        self.root = Path(workspace_root or Path.cwd())

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        """读取文件 — 自动检测类型并分页处理。"""
        path = self._resolve(args.get("path", ""))
        if not path.exists():
            return f"Error: file not found: {args.get('path')}"
        if not self._is_safe(path):
            return f"Error: path outside workspace: {args.get('path')}"

        mime, _ = mimetypes.guess_type(str(path))
        if mime and mime.startswith("image/"):
            return self._read_image(path)

        return self._read_text(path, args.get("offset"), args.get("limit"))

    def _resolve(self, rel: str) -> Path:
        """解析相对路径到绝对路径。"""
        p = Path(rel)
        return p if p.is_absolute() else (self.root / p).resolve()

    def _is_safe(self, path: Path) -> bool:
        """路径安全守卫 — 确保文件在工作区内。"""
        try:
            path.resolve().relative_to(self.root.resolve())
            return True
        except ValueError:
            return False

    def _read_text(self, path: Path, offset: int | None, limit: int | None) -> str:
        """读取文本文件 — 支持分页。"""
        try:
            content = path.read_text("utf-8", errors="replace")
        except Exception as exc:
            return f"Error reading file: {exc}"

        lines = content.splitlines()
        total = len(lines)
        start = max(0, (offset or 1) - 1)
        end = min(start + (limit or DEFAULT_MAX_LINES), total)
        result = lines[start:end]
        output = "\n".join(result)

        if end < total:
            output += f"\n\n... ({total - end} more lines, use offset={end + 1} to continue)"
        if len(output.encode("utf-8")) > DEFAULT_MAX_BYTES:
            output = output[:DEFAULT_MAX_BYTES // 2] + "\n... (truncated)"

        return output

    def _read_image(self, path: Path) -> str:
        """读取图片 — base64 编码返回。"""
        try:
            data = path.read_bytes()
            b64 = base64.b64encode(data).decode("ascii")
            mime, _ = mimetypes.guess_type(str(path))
            return f"[Image: {path.name}] data:{mime};base64,{b64[:100]}... ({len(data)} bytes)"
        except Exception as exc:
            return f"Error reading image: {exc}"
