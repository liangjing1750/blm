# Design: 协作同步协议 v2

## 概览

```
浏览器A ──WebSocket──┐         浏览器B ──WebSocket──┐
  │  presence/updated │           │  presence/updated │
  │                   ▼           │                   ▼
  │           CollaborationManager          │
  │            │ doc_lock │ seq │           │
  │            ▼                           │
  │    ┌──────────────┐                    │
  │    │  _apply_save │                    │
  │    │  1.submit    │                    │
  │    │  2.merge     │                    │
  │    │  3.manifest  │                    │
  │    │  4.sync-log  │                    │
  │    │  5.broadcast │                    │
  │    └──────────────┘                    │
  │                                        │
Ctrl+S ──→ HTTP POST /api/collab/save ←── Ctrl+S
```

## 核心对象

### CollabSession（简化）
```python
@dataclass
class CollabSession:
    doc_name: str
    document: dict         # 当前工作稿（内存中）
    seq: int = 0           # 单调递增序号
    clients: dict[str, CollabClient]
    snapshots: dict[int, dict]  # 最近 40 个 seq 的快照，用于三方合并找 baseDoc
    lock: threading.RLock  # 文档级串行锁
```

### submit-record
```
workspace/文档名/collab/submits/
  {timestamp}__seq{N}__baseSeq{M}__{userId}.json
```
每次 Ctrl+S 的完整提交原文。不会被删除，是最后兜底。

### sync-log.jsonl
```
workspace/文档名/collab/sync-log.jsonl
```
```json
{"seq":12, "baseSeq":9, "user":"张三", "userId":"...", "submitId":"...", "merged":true, "conflictCount":0, "createdAt":"..."}
```

## 流程：_apply_save

```
收到 Ctrl+S (HTTP POST /api/collab/save)
  ↓
doc_lock.acquire()
  ↓
读取 session.document, session.seq
  ↓
┌─ _save_submit_record(session, client, document, base_seq)
│  写入 collab/submits/{ts}__seq{N}__baseSeq{M}__{user}.json
│  返回 submit_id
└─
  ↓
if base_seq == session.seq:
    merged = document                              # 无冲突
elif base_doc := session.snapshots.get(base_seq):
    merged, stats = _merge_collaboration(          # 三方合并
        base_doc, document, session.document
    )
else:
    merged, stats = _merge_collaboration(          # 保守合并
        session.document, document                 # 服务端 vs 用户
    )
    stats["base_missing"] = True
  ↓
_write_manifest(session.doc_name, merged)
_write_sync_log(session, submit_id, base_seq, stats)
  ↓
session.document = merged
session.seq += 1
_remember_snapshot(session, seq, merged)
  ↓
_broadcast("updated", seq=session.seq, user=client.name)
  ↓
doc_lock.release()
  ↓
return { "ok": true, "seq": session.seq, "document": merged }
```

## 协议消息

### WebSocket（4种消息）

```
C → S:  {"type":"join",    "doc":"...", "user":{...}}
S → C:  {"type":"joined",  "seq":N, "users":[...]}

C → S:  {"type":"ping"}
S → C:  {"type":"pong"}

S → C:  {"type":"presence", "doc":"...", "users":[...]}
S → C:  {"type":"updated",  "doc":"...", "seq":N, "user":"...", "userId":"..."}
```

### HTTP（Ctrl+S入口）

```
POST /api/collab/save
Body: { "doc": "...", "baseSeq": N, "document": {...}, "user": {...} }
Response: { "ok": true, "seq": N, "document": {...} }
```

## 合并策略: _merge_collaboration

封装 `blm_core/merge.py` 的 `analyze_merge("3way", ...)`：

```python
def _merge_collaboration(base_doc, user_doc, server_doc=None):
    """
    返回 (merged_document, stats)
    stats: { "merged": bool, "conflictCount": int, "base_missing": bool }
    """
    if server_doc is None:
        # 两方合并（保守模式）
        result = analyze_merge("combine", left=server_doc, right=user_doc)
    else:
        # 三方合并
        result = analyze_merge("3way", left=user_doc, right=server_doc, base=base_doc)
    
    stats = {
        "merged": True,
        "conflictCount": len(result.get("conflicts", [])),
    }
    
    # 有冲突时用自动策略落结果，不弹交互
    if stats["conflictCount"] > 0:
        merged = _auto_resolve_merge(result)
    else:
        merged = result.get("merged_document", server_doc or {})
    
    return merged, stats
```

## 前端行为

```
用户编辑 → S.doc 变化 → 本地草稿持续保存
  ↓
收到 updated 通知 → S.collab.seq = payload.seq
  → S.collab.hasConflict = true → 显示 banner "检测到新版本"
  → acceptedSeq 不变，S.doc 不变
  ↓
用户 Ctrl+S → HTTP POST /api/collab/save
  → 成功 → S.doc = result.document
  → S.collab.acceptedSeq = result.seq
  → S.modified = false
  → 清除本地草稿
```

## 删除清单

| 删除 | 替代 |
|---|---|
| `_apply_change` | 不做增量 |
| `sendCollabChange(s)` | 不做增量 |
| `applyRemoteCollabChanges` | 不做增量 |
| `_merge_local_document_changes` | `_merge_collaboration` |
| `_write_conflict_snapshot` | `_save_submit_record` |
| `_schedule_autosave` / `_flush_autosave` | Ctrl+S 触发 |
| `changelog.jsonl` | `sync-log.jsonl` |
| `COLLAB_ACTIVE_SYNC_ONLY` | 无 change 通道 |
| HTTP poll 降级 | WebSocket 重连 |

## 目录结构

```
workspace/文档名/collab/
  submits/                              ← 提交原文（永久保留）
    20260603-143022__seq12__baseSeq9__张三.json
  sync-log.jsonl                        ← 同步事件日志
```

## 风险与扩展

- **submit-record 无限增长**: 后续可按时间或数量自动清理，保留最近 N 条
- **快照内存**: `session.snapshots` 只保留最近 40 个 seq，足够覆盖正常协作窗口
- **合并策略不完美**: submit-record 作为最后兜底；用户可通过历史记录手动恢复
- **未来可扩展**: 如需命名版本，直接基于 submit-record 或特定 seq 的快照创建
