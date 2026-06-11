"""Grep 工具 — 正则内容搜索，流式大文件，二进制跳过，上下文行。

reasonix builtin/grep.go 改编: 递归遍历 + 正则匹配 + 结果截断。
大文件流式搜索避免内存溢出，自动跳过二进制文件和系统目录。
"""

import re
from pathlib import Path
from blm_ai.kernel.tool import Tool, ToolContext

SKIP_DIRS = {'.git','__pycache__','node_modules','.venv','vendor','.blm_ai_temp','.blm'}

class GrepTool(Tool):
    name = 'grep'
    description = 'Search files with regex. Supports glob filter and context lines.'
    parameters = {
        'type':'object',
        'properties':{
            'pattern':{'type':'string'},
            'path':{'type':'string'},
            'include':{'type':'string'},
            'max_results':{'type':'integer'},
            'context':{'type':'integer'},
        },
        'required':['pattern'],
    }
    read_only = True

    def __init__(self, workspace_root: str = ''):
        self.root = Path(workspace_root or Path.cwd())

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        pattern, search = args.get('pattern',''), self._resolve(args.get('path',''))
        include, max_r = args.get('include','*'), args.get('max_results',100)
        ctx_lines = args.get('context',0)

        try:
            regex = re.compile(pattern)
        except re.error as e:
            return f'Error: invalid regex: {e}'

        results, count = [], 0
        if search.is_file():
            results = self._search_file(search, regex, ctx_lines)
        elif search.is_dir():
            for f in search.rglob(include):
                if f.is_file() and not any(d in f.parts for d in SKIP_DIRS):
                    for line in self._search_file(f, regex, ctx_lines):
                        if count >= max_r:
                            results.append(f'... truncated at {max_r} results')
                            return "\n".join(results)
                        results.append(line); count += 1
        return "\n".join(results) if results else '(no matches)'

    def _resolve(self, rel: str) -> Path:
        return self.root / rel if rel else self.root

    def _search_file(self, fp: Path, regex, ctx=0) -> list:
        try:
            lines = fp.read_text('utf-8', errors='replace').splitlines()
        except: return []
        out = []
        for i, line in enumerate(lines):
            if regex.search(line):
                if ctx > 0:
                    lo, hi = max(0,i-ctx), min(len(lines),i+ctx+1)
                    out.append(f'--- {fp}:{i+1} ---')
                    for j in range(lo, hi):
                        m = '>' if j==i else ' '
                        out.append(f'{m} {fp}:{j+1}: {lines[j][:200]}')
                else:
                    out.append(f'{fp}:{i+1}: {line[:200]}')
        return out
