# Status

## 本轮完成

- 确认方向采用“难而正确”的实时协作路线。
- 创建 `specs/001-spec`，明确第一阶段边界：保留现有 HTTP 保存，先新增实时会话、变更日志和广播通道。
- 新增 `blm_core/collab.py`，实现最小 WebSocket 握手、join、presence、ping、change ack、广播和 JSONL changelog。
- `blm_core/server.py` 接入 `/api/collab/ws`，`/api/runtime` 暴露 `supports_collab`。
- 前端新增 `app/collab.js`，文档打开后自动加入协作会话，并在左上角显示协作连接/在线人数。
- 文档基础信息里的 `meta.domain`、`meta.title`、`meta.author`、`meta.date` 已接入低风险字段级协作变更发送。
- 通过 `markModified()` 增加 3 秒节流的 `snapshot` 同步，所有既有编辑操作只要进入未保存状态，就会把当前文档工作稿广播给其他协作者。
- 新加入会话时会回放 `collab/changelog.jsonl`，即使之前的内存会话已结束，也能加载最近的协作工作稿。
- 本地存在待同步快照时收到远程 `snapshot`，前端不再静默覆盖，而是显示协作冲突提示，可选择应用远程、保留本地并同步、稍后处理。
- 协作变更会触发服务端自动落盘，最新工作稿写回 `manifest.json`，并且不会生成普通历史快照。
- 增加 `tests/test_collab.py`，覆盖握手、join、presence、change ack、双客户端广播和 changelog 写入。

## 当前状态

- S1 基础设施已经可用：服务端能接收 WebSocket 连接，按文档建立会话，给变更分配 `seq` 并写入 `collab/changelog.jsonl`。
- 前端目前完成“连接与在线状态展示”、远程 change 的通用应用函数、基础信息字段实时发送，以及所有编辑操作的准实时整文档快照同步。
- 现有 HTTP 保存、历史、合并链路没有被替换。

## 下一步

- 下一步进入命名版本：把“自动保存工作稿”和“存为评审版本”分开，形成可稳定链接的只读版本。
- 设计高风险操作事件：新增/删除节点、连线调整、实体字段变更不能简单靠裸 path。

## 风险与备注

- 当前 WebSocket 是标准库最小实现，已覆盖基础文本帧，但还不是完整通用 WebSocket Server。
- 现有前端编辑入口分散，实时协作的难点会在“收敛变更入口”，不是协议本身。
- `changelog.jsonl` 当前只追加协作事件，不会自动回放生成 `manifest.json`；自动保存属于下一阶段。

## 交接提示

- 先看 `specs/001-spec/design.md`，再看 `blm_core/collab.py`、`blm_core/server.py` 和 `app/collab.js`。
