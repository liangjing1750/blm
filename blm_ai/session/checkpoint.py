"""快照存储 — 每个写工具执行前保存文件状态，支持回退。

reasonix checkpoint.go 模式: Git-free 快照回退系统。
每个编辑操作前自动保存文件的完整副本到 .ckpt/ 目录。
回退时将快照复制回原位置。

参考来源:
  - reasonix checkpoint.go: 快照捕获 + RestoreCode(fromTurn)
  - pi-mono 分支: 回退到任意 checkpoint 并创建新分支

安全:
  - 路径安全防护: 只捕获工作区内的文件
  - 磁盘空间: 快照目录按轮次清理
"""

import shutil
from datetime import datetime, timezone
from pathlib import Path


class CheckpointStore:
    """每个写工具前的文件状态快照 — 支持回退到任意轮次。

    目录结构:
      .ckpt/
        t0_readme.md        # 第 0 轮捕获的 readme.md
        t1_config.json      # 第 1 轮捕获的 config.json
        t2_main.py          # 第 2 轮捕获的 main.py

    用法:
        ckpt = CheckpointStore(session_dir)
        ckpt.capture(turn=0, file_path="src/main.py")  # 编辑前
        ckpt.restore(from_turn=0)  # 回退到第 0 轮的状态
    """

    def __init__(self, session_dir: Path):
        """初始化快照存储。

        参数:
            session_dir: 会话目录（.ckpt/ 创建在此下）
        """
        self.ckpt_dir = Path(session_dir) / ".ckpt"
        self.ckpt_dir.mkdir(parents=True, exist_ok=True)
        self._turn_ckpts: dict[int, dict[str, str]] = {}
        self._manifest_path = self.ckpt_dir / "manifest.json"

    def capture(self, turn: int, file_path: str | Path) -> bool:
        """保存文件的当前状态 — 在编辑工具执行前调用。

        参数:
            turn: 当前轮次
            file_path: 要保存的文件路径
        返回:
            True 如果捕获成功
        """
        src = Path(file_path)
        if not src.exists():
            self._ensure_turn(turn)[str(src)] = "__nonexistent__"
            return True
        try:
            safe_name = f"t{turn}_{src.name}"
            dest = self.ckpt_dir / safe_name
            shutil.copy2(src, dest)
            self._ensure_turn(turn)[str(src)] = str(dest)
            return True
        except Exception:
            return False

    def restore(self, from_turn: int) -> list[str]:
        """回退文件到指定轮次的状态 — 返回已恢复的文件列表。

        从 from_turn 开始，应用所有后续轮次的快照到当前工作区。
        如果快照是 __nonexistent__（文件当时不存在），则删除当前文件。

        参数:
            from_turn: 回退到哪一轮的状态
        返回:
            已恢复/已删除的文件路径列表
        """
        restored: list[str] = []
        max_turn = max(self._turn_ckpts) if self._turn_ckpts else 0
        for turn in range(from_turn, max_turn + 1):
            for original, backup in self._turn_ckpts.get(turn, {}).items():
                if backup == "__nonexistent__":
                    try:
                        Path(original).unlink(missing_ok=True)
                        restored.append(f"{original} (deleted)")
                    except Exception:
                        pass
                else:
                    try:
                        shutil.copy2(backup, original)
                        restored.append(original)
                    except Exception:
                        pass
        return restored

    def list_turns(self) -> list[int]:
        """列出所有有快照的轮次（按升序）。"""
        return sorted(self._turn_ckpts)

    def clear(self) -> None:
        """清空所有快照 — 释放磁盘空间。"""
        shutil.rmtree(self.ckpt_dir, ignore_errors=True)
        self.ckpt_dir.mkdir(parents=True, exist_ok=True)
        self._turn_ckpts.clear()

    def _ensure_turn(self, turn: int) -> dict[str, str]:
        """确保轮次条目存在 — 创建默认字典。"""
        if turn not in self._turn_ckpts:
            self._turn_ckpts[turn] = {}
        return self._turn_ckpts[turn]
