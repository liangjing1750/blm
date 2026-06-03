# Design

## 概览

本次采用渐进式重构，不推翻现有 `manifest.json + collab/changelog.jsonl + WebSocket snapshot` 架构。

设计重点：

- 服务端保留唯一协作会话和 seq。
- snapshot 同步仍可使用，但服务端必须校验 `baseSeq`，避免旧客户端直接覆盖新文档。
- 可观测性优先：先补日志、诊断和管理端，再做协议级降级。
- 前端减少横幅，改成轻量状态和诊断入口。

## changelog 生命周期

`collab/changelog.jsonl` 是协作运行日志，不是业务文档内容。

产生：

```text
前端发送 change/snapshot
  -> 服务端在锁内处理
  -> seq + 1
  -> append changelog 一行
  -> 广播给其他连接
  -> autosave manifest.json
```

使用：

```text
服务端运行中:
  主要使用内存 session.document 和 session.seq。

服务端重启后:
  先加载 manifest.json，再重放 changelog，恢复 seq 和可能未完全落盘的协作状态。

日志压缩:
  changelog 过大时压缩，避免大文档恢复变慢。
```

删除影响：

- 文档主体仍可打开。
- 协作 seq、近期协作恢复和重放能力会丢失。
- 协作会从当前 manifest.json 重新开始。

## 核心对象

- `CollabSession`
  - 当前文档名、当前文档、当前 seq、在线客户端、近期 seq 快照。
- `CollabClient`
  - clientId、用户、sessionId、最后心跳时间、客户端 IP。
- `CollabDiagnostics`
  - 服务端状态、连接数、最近错误、日志摘要。
- `FrontendConnectionState`
  - WebSocket 状态、最近错误、RTT、待同步状态、降级模式。

## 流程与数据

### snapshot 同步

```text
client snapshot(baseSeq, document)
  -> server lock
  -> if baseSeq == currentSeq: accept
  -> if baseSeq < currentSeq: three-way merge
  -> if base missing: return error
  -> seq + 1
  -> append changelog
  -> autosave
  -> ack(document, seq, rebased)
  -> broadcast snapshot
```

### 远端更新体验

```text
用户正在编辑
  -> 收到远端 snapshot/change
  -> 不自动覆盖编辑器
  -> 顶栏显示“有更新待同步”
  -> 用户点击立即同步
  -> 服务端合并并返回最新文档
```

### 弱网降级

```text
WebSocket 连接失败或连续心跳失败
  -> 进入 reconnecting
  -> 若仍失败，进入 polling
  -> GET /api/collab/poll 拉取 seq/document
  -> POST /api/collab/snapshot 提交同步
```

## 关键决策

- 不立即做完整 CRDT。BLM 是结构化 JSON，团队规模小，snapshot + 服务端 baseSeq 合并足以作为当前阶段方案。
- 服务端必须是覆盖保护的最终裁判。前端可预合并，但不能作为唯一保障。
- 管理端先只读。真实网络排障最需要先看到状态和日志。
- 日志要结构化，但保持实现轻量，不引入重型依赖。

## 风险与扩展点

- 三方合并对同一富文本字段的真实冲突仍可能无法自动解决。
- 近期 seq 快照数量有限，长时间离线客户端可能需要重新加载。
- HTTP 轮询会增加服务端请求量，需要合理间隔。
- 管理端如果未来开放操作，需要增加鉴权。
