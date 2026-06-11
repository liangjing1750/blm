"""记忆工具 — Agent 通过此工具读写团队记忆。

改编自 hermes tools/memory_tool.py: remember/forget/recall 三操作模式。
写入前自动进行威胁模式扫描。使用 § 分隔符管理记忆条目。
"""

from pathlib import Path
from blm_ai.kernel.tool import Tool, ToolContext
from blm_ai.memory.guard import is_safe
from blm_ai.memory.store import MemoryStore

class MemoryTool(Tool):
    name = 'memory'
    description = 'Manage team memory: add facts, remove entries, recall current state.'
    parameters = {
        'type':'object',
        'properties':{
            'action':{'type':'string','enum':['add','remove','recall']},
            'target':{'type':'string','enum':['memory','user']},
            'content':{'type':'string'},
        },
        'required':['action'],
    }
    read_only = False

    def __init__(self, memory_path: Path, user_path: Path | None = None):
        self._store = MemoryStore(memory_path, user_path)
        self._store.load_from_disk()

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        action, target, content = args.get('action',''), args.get('target','memory'), args.get('content','')
        try:
            if action == 'recall':
                snapshot = self._store.format_for_system_prompt(target)
                return snapshot if snapshot else f'(no {target} entries)'
            if action == 'add':
                if not content.strip(): return 'Error: content is empty'
                if not is_safe(content): return 'Error: content failed safety check'
                r = self._store.add(target, content)
                return f'{r["status"]}: {r["message"]}'
            if action == 'remove':
                if not content.strip(): return 'Error: content is empty'
                r = self._store.remove(target, content)
                return f'{r["status"]}: {r["message"]}'
            return f'Unknown action: {action}'
        except Exception as e:
            return f'Memory error: {e}'
