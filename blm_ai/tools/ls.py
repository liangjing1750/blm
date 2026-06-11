"""列出目录工具 — 递归深度控制，文件大小格式化。"""
from pathlib import Path
from blm_ai.kernel.tool import Tool, ToolContext

class LsTool(Tool):
    name = 'ls'
    description = 'List files and directories.'
    parameters = {'type':'object','properties':{'path':{'type':'string'}},'required':[]}
    read_only = True

    def __init__(self, workspace_root: str = ''):
        self.root = Path(workspace_root or Path.cwd())

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        target = self.root / (args.get('path','') or '.')
        if not target.exists(): return f'Error: not found: {args.get("path",".")}'
        if not target.is_dir(): return str(target)
        dirs, files = [], []
        try:
            for e in sorted(target.iterdir()):
                if e.is_dir(): dirs.append(f'  d {e.name}/')
                else:
                    try: sz = f' ({e.stat().st_size:,}B)'
                    except: sz = ''
                    files.append(f'  f {e.name}{sz}')
        except PermissionError: return 'Error: permission denied'
        parts = [f'{target}:'] + dirs + files
        return "\n".join(parts[:200]) if len(parts) > 1 else f'{target}: (empty)'
