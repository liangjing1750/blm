# Tasks: 协作同步协议 v2

## 阶段 0: 测试先行（TDD）

- [ ] **T0.1** 编写并发测试: A/B改不同字段 → 全部保留
- [ ] **T0.2** 编写并发测试: A/B改同一字段 → 后者覆盖 + 提交原文可找回
- [ ] **T0.3** 编写并发测试: baseSeq太旧 → 不拒绝 + submit-record存在
- [ ] **T0.4** 编写并发测试: 10线程并发 → seq单调 + manifest不损坏
- [ ] **T0.5** 编写并发测试: 大文档 → 不返回半截JSON
- [ ] **T0.6** 编写并发测试: 全部实体类型(角色/流程/节点/流转/实体/字段/阶段/ref/规则/混合)
- [ ] **T0.7** 编写并发测试: 收到updated后acceptedSeq不变

## 阶段 1: 服务端核心（先落盘后合并）

- [ ] **T1.1** 新增 `_save_submit_record()` — 保存提交原文到 collab/submits/
- [ ] **T1.2** 新增 `_write_sync_log()` — sync-log.jsonl 事件日志
- [ ] **T1.3** 新增 `_merge_collaboration()` — 封装 merge.py 的协作专用入口
- [ ] **T1.4** 重构 `_apply_snapshot` → `_apply_save` — 先落盘再合并流程
- [ ] **T1.5** 新增文档级锁 `_doc_lock` — 串行处理同一文档的 save
- [ ] **T1.6** 新增 HTTP 端点 `POST /api/collab/save`
- [ ] **T1.7** 运行 T0.1-T0.7 测试，全部通过

## 阶段 2: 删除死代码

- [ ] **T2.1** 删除 `_apply_change` 及相关 change replay
- [ ] **T2.2** 删除 `_merge_local_document_changes` / `_merge_local_array_changes`
- [ ] **T2.3** 删除 `_write_conflict_snapshot`
- [ ] **T2.4** 删除 `_schedule_autosave` / `_flush_autosave`
- [ ] **T2.5** 删除 `_compact_changelog_if_needed` / `_rewrite_changelog`
- [ ] **T2.6** 删除 `changelog.jsonl` 读写逻辑（`_load_document_with_changelog` 简化）
- [ ] **T2.7** 删除 HTTP poll / fallback 降级
- [ ] **T2.8** 运行全部测试，确认无回归

## 阶段 3: 前端适配

- [ ] **T3.1** 删除 `sendCollabChange` / `sendCollabChanges` / `applyRemoteCollabChanges`
- [ ] **T3.2** 删除 `COLLAB_ACTIVE_SYNC_ONLY` 常量
- [ ] **T3.3** 删除 `flushCollabSnapshotSync` (WebSocket snapshot)
- [ ] **T3.4** 删除 `receiveRemoteCollabSnapshot` (自动应用远端文档)
- [ ] **T3.5** 删除 HTTP 降级轮询 (`poll`/`fallback`)
- [ ] **T3.6** 修改 `handleCollabMessage` — updated 只通知不应用
- [ ] **T3.7** 修改 `Ctrl+S` → HTTP save + acceptedSeq 更新
- [ ] **T3.8** 修改 `handleCollabMessage` — 收到 `updated` 时 acceptedSeq 不变

## 阶段 4: 端到端验证

- [ ] **T4.1** 完整并发测试套件通过
- [ ] **T4.2** 手动验证: 两人同时编辑 → Ctrl+S → 无数据丢失
- [ ] **T4.3** 验证 submit-record 可被历史记录查看
- [ ] **T4.4** 验证本地草稿恢复流程
- [ ] **T4.5** 清理旧 collab 兼容代码
