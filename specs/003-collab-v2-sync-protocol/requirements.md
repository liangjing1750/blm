# Requirements: 协作同步协议 v2

## 背景

当前协作代码存在工作丢失风险：服务端在 baseSeq 过旧时直接拒绝客户端提交，三方合并逻辑手写且脆弱，
增量 change 被禁用但代码残留，两套保存路径互相覆盖，提交原文无留痕。

## 目标

重构为"先落盘后合并"模型：WebSocket 只通知不传文档，Ctrl+S 为唯一提交入口，
服务端串行加锁，先保存提交原文再自动合并，100%不丢工作。

## 非目标

- 不引入增量字段同步（不做 OT/CRDT）
- 不自动推文档到客户端
- 不弹出冲突选择交互

## 需求

### R1: 100%不丢工作
每次 Ctrl+S 先持久化原文（submit-record），再尝试合并。合并失败时原文可找回。本地草稿（IndexedDB）兜底。

### R2: WebSocket 只通知不传文档
presence（在线用户）、updated（有人保存了，seq+user）、ping/pong。

### R3: 唯一同步入口 Ctrl+S
删掉增量 change、删掉 5 秒自动推 snapshot、删掉远端自动刷新。服务端按文档加锁串行处理。

### R4: 自动合并三种策略
baseSeq 匹配 → 直接接受；能找到 baseDoc → 三方合并；太旧 → 保守合并 server_doc vs user_doc。

### R5: 完整留痕
submit-record（每次 Ctrl+S 提交原文）+ sync-log.jsonl（同步事件日志）。

### R6: 前端行为
收到 updated 通知 → 只显示 banner，不动 S.doc/acceptedSeq。只有 Ctrl+S 成功后更新。

## 验收标准

| AC | 条件 |
|---|---|
| AC1 | A/B 同时改不同字段 → 双方修改全部保留 |
| AC2 | A/B 同时改同一字段 → 后者覆盖，前者提交原文可找回 |
| AC3 | baseSeq 太旧 → 不拒绝，提交原文保留，保守合并 |
| AC4 | 10 并发 Ctrl+S → seq 单调递增，manifest 不损坏 |
| AC5 | 大文档同步 → 不返回半截 JSON |
| AC6 | 提交原文可查看和恢复 |
| AC7 | 收到 updated 后 acceptedSeq 不变 |
| AC8 | 服务端异常时本地草稿可恢复 |

## 并发测试覆盖

| 用户A修改 | 用户B修改 |
|---|---|
| 新增角色 | 修改角色名 |
| 修改流程名 | 新增流程 |
| 修改节点名 | 新增节点 |
| 修改role_uid | 修改同一节点role_uid |
| 新增gateway | 新增edge |
| 新增实体 | 修改实体名 |
| 新增字段 | 修改同一字段 |
| 修改状态转换 | 新增状态转换 |
| 新增ref | 修改ref order |
| 修改流程+实体+角色 | 修改同一批流程+实体+角色 |
