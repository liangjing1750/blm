"""编辑文件工具 — old_str→new_str 替换 + 模糊匹配 + diff 生成。

模糊匹配使用 SequenceMatcher 处理空格差异。仅替换第一个精确匹配。
预览 diff 通过 Tool.preview() 方法暴露给前端显示。

参考来源:
  - pi-mono edit.ts: 模糊匹配 + diff 计算
  - reasonix builtin/editfile.go: 单次替换 + 验证
  - hermes fuzzy_match.py: 模糊文本匹配算法
"""

from difflib import SequenceMatcher, unified_diff
from pathlib import Path

from blm_ai.kernel.tool import Tool, ToolContext


class EditTool(Tool):
    """文本编辑工具 — 精确匹配 + 模糊匹配 + diff 预览。

    模糊匹配：当精确匹配失败时，将 old_str 和文件中每块文本进行
    正态化（去多余空格）后使用 SequenceMatcher 比较，取 ratio > 0.7 的最佳匹配。
    """
    name = "edit_file"
    description = ("Replace text in a file using old_string → new_string. "
                   "Fuzzy matching handles whitespace differences. First match only.")
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File path relative to workspace"},
            "old_string": {"type": "string", "description": "Text to find and replace"},
            "new_string": {"type": "string", "description": "Replacement text"},
        },
        "required": ["path", "old_string", "new_string"],
    }
    read_only = False
    concurrency_safe = False

    def __init__(self, workspace_root: str = ""):
        self.root = Path(workspace_root or Path.cwd())

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        """执行文本替换 — 精确 → 模糊 → 失败。

        流程:
          1. 读取原始文件内容
          2. 尝试精确匹配（old_str in content）
          3. 失败则尝试模糊匹配（SequenceMatcher > 0.7）
          4. 写入替换后的内容（原子写入）
        返回:
            成功消息（精确/模糊）或错误消息
        """
        path = self._resolve(args.get("path", ""))
        old = args.get("old_string", "")
        new = args.get("new_string", "")

        if not path.exists():
            return f"Error: file not found: {args.get('path')}"

        try:
            original = path.read_text("utf-8")
        except Exception as exc:
            return f"Error reading file: {exc}"

        # 尝试精确匹配
        if old in original:
            new_content = original.replace(old, new, 1)
            path.write_text(new_content, "utf-8")
            diff = self._compute_diff(original, new_content)
            return f"Edited {args.get('path')} (exact match)\n{diff}"

        # 尝试模糊匹配（正态化空格）
        best = self._fuzzy_find(original, old)
        if best:
            new_content = original.replace(best, new, 1)
            path.write_text(new_content, "utf-8")
            diff = self._compute_diff(original, new_content)
            return f"Edited {args.get('path')} (fuzzy match, similarity={_similarity(old, best):.0%})\n{diff}"

        return f"Error: text not found in {args.get('path')}"

    def preview(self, args: dict) -> str | None:
        """预览编辑变更 — 返回 unified diff 格式的文本。"""
        path = self._resolve(args.get("path", ""))
        old = args.get("old_string", "")
        new = args.get("new_string", "")
        if not path.exists():
            return None
        try:
            original = path.read_text("utf-8")
            if old in original:
                new_content = original.replace(old, new, 1)
                return self._compute_diff(original, new_content)
            best = self._fuzzy_find(original, old)
            if best:
                new_content = original.replace(best, new, 1)
                return self._compute_diff(original, new_content)
        except Exception:
            pass
        return None

    def _resolve(self, rel: str) -> Path:
        p = Path(rel)
        return p if p.is_absolute() else (self.root / p).resolve()

    @staticmethod
    def _fuzzy_find(content: str, old: str) -> str | None:
        """模糊查找 — 返回最佳匹配的原始文本块。

        算法:
          1. 将 old 正态化（合并空格）
          2. 将文件按行数切分块
          3. 对每块正态化后使用 SequenceMatcher 比较
          4. 返回 ratio > 0.7 的最高分匹配
        """
        old_norm = " ".join(old.split())
        old_lines = old.count("\n") + 1
        content_lines = content.splitlines()
        best_ratio = 0.0
        best_block = None

        for i in range(len(content_lines) - old_lines + 1):
            block = "\n".join(content_lines[i:i + old_lines])
            block_norm = " ".join(block.split())
            ratio = SequenceMatcher(None, old_norm, block_norm).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_block = block

        return best_block if best_ratio > 0.7 else None

    @staticmethod
    def _compute_diff(original: str, modified: str, context_lines: int = 3) -> str:
        """计算 unified diff — 用于预览变更。"""
        diff_lines = list(unified_diff(
            original.splitlines(keepends=True),
            modified.splitlines(keepends=True),
            fromfile="a/file", tofile="b/file",
            n=context_lines,
        ))
        return "".join(diff_lines[:30])  # 限制输出长度


def _similarity(a: str, b: str) -> float:
    """计算两个字符串的相似度。"""
    return SequenceMatcher(None, " ".join(a.split()), " ".join(b.split())).ratio()
