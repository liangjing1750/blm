"""会话持久化 — JSONL 树形存储 + 分支导航。

直接移植自 pi-mono 的 jsonl-storage.ts 设计。
每个会话是一个 .jsonl 文件，每行一个 JSON 条目，通过 id/parentId 形成树。

条目类型: session（头部）、message（消息）、compaction（压缩记录）、
          branch_summary（分支摘要）、custom（自定义）、leaf（叶子指针）。

参考来源:
  - pi-mono jsonl-storage.ts: 树形会话存储 + 分支元数据
  - reasonix session.go: Snapshot/Replace 操作
  - hermes 会话搜索: FTS5 索引

文件格式示例:
  {"type":"session","version":3,"id":"abc","timestamp":"20260101-120000","cwd":"/path"}
  {"type":"message","id":"m1","parentId":null,"message":{...}}
  {"type":"compaction","id":"c1","parentId":"m10","summary":"...","firstKeptEntryId":"m11"}
  {"type":"leaf","id":"leaf","targetId":"m25"}
"""

import json
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

# ---- 数据模型 ----

@dataclass
class SessionEntry:
    """会话树中的一个条目 — 可以是消息、压缩、分支等。"""
    id: str
    type: str
    parent_id: str | None = None
    timestamp: str = ""
    data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """序列化为 JSON 兼容的字典。"""
        d = {
            "type": self.type, "id": self.id,
            "parentId": self.parent_id, "timestamp": self.timestamp,
            **self.data,
        }
        return {k: v for k, v in d.items() if v is not None}


@dataclass
class SessionMeta:
    """会话元数据 — 创建时生成，用于列表和搜索。"""
    id: str
    path: Path
    version: int = 3
    cwd: str = ""
    created_at: str = ""
    message_count: int = 0
    turn_count: int = 0
    parent_session: str | None = None

# ---- 会话存储 ----

class SessionStorage:
    """JSONL 文件支持的会话存储 — 支持树形导航和分支。

    用法:
        storage = SessionStorage(sessions_dir)
        meta = storage.create(cwd="/project")
        storage.append_message({"role": "user", "content": "hello"})
        storage.set_leaf("m1")
        storage.flush(meta.path)
        messages = storage.get_messages()  # 从叶子到根的路径
    """

    def __init__(self, sessions_dir: Path):
        """初始化会话存储。

        参数:
            sessions_dir: 会话文件存放目录
        """
        self.dir = Path(sessions_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self._entries: dict[str, SessionEntry] = {}
        self._leaf_id: str | None = None
        self._header: dict | None = None
        self._filepath: Path | None = None

    # ---- 创建 ----

    def create(self, cwd: str = "", parent_session: str | None = None) -> SessionMeta:
        """创建新会话 — 生成唯一 ID 和时间戳文件名。

        文件名格式: {timestamp}_{session_id}.jsonl
        如: 20260115-143022_a1b2c3d4e5f6.jsonl
        """
        session_id = uuid.uuid4().hex[:12]
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = f"{timestamp}_{session_id}.jsonl"
        filepath = self.dir / filename

        header = {
            "type": "session", "version": 3,
            "id": session_id, "timestamp": timestamp, "cwd": cwd,
        }
        if parent_session:
            header["parentSession"] = parent_session

        _atomic_write_line(filepath, json.dumps(header, ensure_ascii=False))
        self._filepath = filepath
        self._entries = {}
        self._header = header
        self._leaf_id = None

        return SessionMeta(
            id=session_id, path=filepath, version=3, cwd=cwd,
            created_at=timestamp, parent_session=parent_session,
        )

    # ---- 加载 ----

    def load(self, filepath: Path) -> None:
        """从 JSONL 文件加载会话 — 解析所有条目并重建树。"""
        self._entries.clear()
        self._leaf_id = None
        self._header = None
        self._filepath = filepath

        if not filepath.exists():
            return

        with open(filepath, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                eid = entry["id"]
                etype = entry.get("type", "")
                parent = entry.get("parentId")

                if etype == "session":
                    self._header = entry
                elif etype == "leaf":
                    self._leaf_id = entry.get("targetId")
                else:
                    data = {k: v for k, v in entry.items()
                            if k not in ("type", "id", "parentId", "timestamp")}
                    self._entries[eid] = SessionEntry(
                        id=eid, type=etype, parent_id=parent,
                        timestamp=entry.get("timestamp", ""), data=data,
                    )

    # ---- 追加 ----

    def append_message(self, message: dict, parent_id: str | None = None) -> str:
        """追加消息条目 — 返回新条目的 ID。

        参数:
            message: Anthropic 格式的消息字典
            parent_id: 父条目 ID（用于树形导航）
        返回:
            新消息条目的唯一 ID
        """
        msg_id = uuid.uuid4().hex[:12]
        entry = SessionEntry(
            id=msg_id, type="message", parent_id=parent_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            data={"message": message},
        )
        self._entries[msg_id] = entry
        return msg_id

    def append_compaction(self, summary: str, first_kept_id: str, tokens_before: int = 0) -> str:
        """追加压缩记录条目。

        参数:
            summary: LLM 生成的压缩摘要
            first_kept_id: 压缩后保留的第一条消息 ID
            tokens_before: 压缩前的令牌数
        """
        cid = uuid.uuid4().hex[:12]
        self._entries[cid] = SessionEntry(
            id=cid, type="compaction", parent_id=first_kept_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            data={"summary": summary, "firstKeptEntryId": first_kept_id,
                  "tokensBefore": tokens_before},
        )
        return cid

    def append_branch_summary(self, from_id: str, summary: str, parent_id: str | None = None) -> str:
        """追加分支摘要条目 — 记录从哪个点分支以及原因。"""
        bid = uuid.uuid4().hex[:12]
        self._entries[bid] = SessionEntry(
            id=bid, type="branch_summary", parent_id=parent_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            data={"fromId": from_id, "summary": summary},
        )
        return bid

    def set_leaf(self, target_id: str) -> None:
        """设置叶子指针 — 指向当前活跃的会话末端。"""
        self._leaf_id = target_id

    # ---- 导航 ----

    def get_path_to_root(self) -> list[SessionEntry]:
        """从叶子到根遍历 parentId 链 — 返回当前分支的完整路径。

        用于构建会话上下文（最近→最早的消息序列）。
        实现循环检测防止死循环。
        """
        path: list[SessionEntry] = []
        current = self._leaf_id
        visited: set[str] = set()
        while current and current not in visited:
            visited.add(current)
            entry = self._entries.get(current)
            if entry:
                path.append(entry)
                current = entry.parent_id
            else:
                break
        return list(reversed(path))

    def get_messages(self) -> list[dict]:
        """从路径中提取消息 — 处理压缩记录（替换为摘要消息）。

        返回 Anhtropic 格式的消息字典列表，可直接注入 Agent 上下文。
        """
        messages = []
        for entry in self.get_path_to_root():
            if entry.type == "message" and "message" in entry.data:
                messages.append(entry.data["message"])
            elif entry.type == "compaction":
                summary = entry.data.get("summary", "")
                messages.append({
                    "role": "user",
                    "content": (
                        f"## Session Summary\n\n"
                        f"{summary}\n\n"
                        f"--- END OF CONTEXT SUMMARY ---"
                    ),
                })
        return messages

    def get_message_count(self) -> int:
        """返回消息条目总数。"""
        return sum(1 for e in self._entries.values() if e.type == "message")

    def get_entry(self, entry_id: str) -> SessionEntry | None:
        """按 ID 获取单个条目。"""
        return self._entries.get(entry_id)

    # ---- 持久化 ----

    def flush(self, filepath: Path | None = None) -> None:
        """将所有待处理条目写入 JSONL 文件 — 增量追加模式。

        只写入之前文件中不存在的条目（通过 ID 去重）。
        """
        path = filepath or self._filepath
        if not path:
            return

        existing_ids: set[str] = set()
        if path.exists():
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            existing_ids.add(json.loads(line).get("id", ""))
                        except json.JSONDecodeError:
                            pass

        with open(path, "a", encoding="utf-8") as f:
            for eid, entry in self._entries.items():
                if eid not in existing_ids:
                    f.write(json.dumps(entry.to_dict(), ensure_ascii=False) + "\n")
            # 写入叶子指针
            if self._leaf_id:
                leaf = {
                    "type": "leaf", "id": uuid.uuid4().hex[:12],
                    "targetId": self._leaf_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                f.write(json.dumps(leaf, ensure_ascii=False) + "\n")

# ---- 工具 ----

def _atomic_write_line(filepath: Path, line: str) -> None:
    """原子写入一行到文件 — 使用临时文件 + os.replace。"""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(filepath.parent), prefix="." + filepath.name)
    try:
        os.write(fd, (line + "\n").encode("utf-8"))
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(tmp, str(filepath))
