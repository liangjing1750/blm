# Status: 协作同步协议 v2

## 本轮完成

- **T0**: 编写9个并发测试（全部实体类型覆盖），先红灯验证
- **T1**: 实现服务端核心：
  - `_save_submit_record()` — 每次Ctrl+S先落盘提交原文
  - `_write_sync_log()` — sync-log.jsonl事件日志
  - `_merge_collaboration()` — 封装merge.py的协作专用入口
  - 重构 `_apply_snapshot` — 先落盘后合并，永不拒绝
- **T2**: 删除/更新过时测试：
  - 删除 `test_too_old_snapshot_does_not_overwrite` (改为 v2 行为)
  - 更新 changelog.jsonl 检查改为 sync-log.jsonl
  - 修复 rebased 标志逻辑
- **前端**: 已由另一个 AI 对齐（acceptedSeq 独立追踪，Ctrl+S → HTTP 唯一入口）

## 当前状态

- 全部 28 个测试通过（19 旧 + 9 新）
- 服务端运行时验证通过（save/copy 正常）
- 核心循环：Ctrl+S → 先落盘 submit-record → 自动合并 → sync-log → 返回 merged document → 广播 updated 通知

## 下一步

- **T3**: 前端 `sendCollabChange`/`applyRemoteCollabChanges` 死代码删除（低优先级，不影响功能）
- **T4**: 真实双人协作手动验证
- 后续：submit-record 自动清理策略（防止无限增长）

## 风险与备注

- `_merge_collaboration` 复用了 merge.py 的 `analyze_merge`，内部走两文档合并逻辑，数组按 uid 匹配新增/删除
- submit-record 目前永久保留，不做清理——后续需要加数量/时间限制
- 现有旧历史 changelog.jsonl 不做迁移，新文档使用 sync-log.jsonl

## 交接提示

- 服务端核心在 `blm_core/collab.py` 的 `_apply_snapshot`（行 396-449）
- 新增方法: `_save_submit_record`、`_write_sync_log`、`_merge_collaboration`
- 测试在 `tests/test_collab.py` 的 `CollaborationSaveV2Tests` 类
