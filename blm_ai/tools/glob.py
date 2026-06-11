"""Glob 工具 — 文件模式匹配，自动排除系统目录。"""
from pathlib import Path
from blm_ai.kernel.tool import Tool, ToolContext

SKIP = {'.git','__pycache__','node_modules','.venv','vendor','.blm_ai_temp'}

class GlobTool(Tool):
    name = 'glob'
    description = 'Find files matching a glob pattern. Returns relative paths.'
    parameters = {'type':'object','properties':{'pattern':{'type':'string'}},'required':['pattern']}
    read_only = True

    def __init__(self, workspace_root: str = ''):
        self.root = Path(workspace_root or Path.cwd())

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        pattern = args.get('pattern', '*')
        try:
            matches = []
            for m in sorted(self.root.glob(pattern)):
                if m.is_file() and not any(d in m.parts for d in SKIP):
                    matches.append(str(m.relative_to(self.root)))
            return "\n".join(matches[:200]) if matches else '(no matches)'
        except Exception as e:
            return f'Error: {e}'
