# BLM 服务端文件夹说明

## workspace/ 目录结构

```
workspace/
├── DOCNAME/                     ← 每个文档一个目录
│   ├── manifest/
│   │   ├── manifest.json        ← 主文档数据（全量 JSON）
│   │   └── DOCNAME.md           ← Markdown 预览（每次保存刷新）
│   ├── collab/
│   │   ├── submits/             ← 每次 Ctrl+S 的提交原文（100% 不丢失）
│   │   ├── sync-log.jsonl       ← 同步日志
│   │   └── state.json           ← 文档序列号（seq 持久化）
│   ├── history/                 ← 历史快照（每次保存自动生成）
│   │   └── 20260604-143000/     ← 快照 ID = 时间戳
│   │       └── manifest/        ← 该版本的文档内容
│   └── versions/                ← 归档版本（用户手动创建）
│       └── 20260604-150000/
│           └── manifest/
├── .trash/                      ← 回收站
│   └── DOCNAME-timestamp/       ← 删除的文档
├── .tmp/                        ← 临时文件（原子写入中转，技术用途）
├── .uploads/                    ← 附件上传
├── .user_ask/                   ← 反馈建议文档
└── .logs/                       ← 服务日志
```

## 关键文件说明

| 文件 | 作用 | 丢失可恢复？ |
|------|------|-------------|
| `manifest/manifest.json` | 当前文档全量数据 | 可从 history 或 submits 恢复 |
| `manifest/DOCNAME.md` | 预览文件 | 自动重新生成 |
| `collab/submits/*.json` | 每次 Ctrl+S 的完整文档原文 | 本身就是备份 |
| `collab/sync-log.jsonl` | 同步操作日志 | 诊断用 |
| `history/SNAPSHOT/` | 每次保存的历史版本 | 可预览、恢复、比对 |
| `versions/VERSION/` | 手动归档的稳定版本 | 只读快照 |

## 文档序列号（seq）

- `seq` 是文档的版本计数器，每次 Ctrl+S 成功后 +1
- 存储在 `history/SNAPSHOT/.snapshot.json` 的 `seq` 字段中
- 服务重启后从历史快照目录扫描恢复，不会归零
- 旧快照无 `seq` 字段时，以快照总数作为最低 seq

## 升级迁移

升级脚本位于 `upgrade/vX.Y/` 目录：
- `upgrade/v2.9/migrate_dirs.py` — 目录结构调整迁移
