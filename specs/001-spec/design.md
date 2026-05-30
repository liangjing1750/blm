# Design

## 概览

实时协作采用渐进式架构：

```text
当前阶段：HTTP 加载/保存 + WebSocket 协作会话 + 追加式变更日志
后续阶段：自动保存 + 命名版本 + 快照只读链接 + 字段级冲突提示
```

第一阶段只建立协作通道，不强制所有编辑行为立即改成实时提交。这样可以在不破坏现有保存链路的前提下，验证协议、会话、日志和广播能力。

## 核心对象

### CollabSession

按文档维度维护：

- `doc_name`
- `seq`
- `document`
- `clients`

### CollabClient

每个 WebSocket 连接维护：

- `client_id`
- `user`
- `handler`
- `send_lock`

### ChangeRecord

追加到 JSONL：

```json
{
  "seq": 1,
  "doc": "交割智慧监管平台",
  "user": "张三",
  "clientId": "client_xxx",
  "ts": "2026-05-29T14:00:00+08:00",
  "changes": [
    {
      "path": "meta.author",
      "old": "旧作者",
      "new": "新作者"
    }
  ]
}
```

## 协议

客户端到服务端：

```json
{ "type": "join", "doc": "担保品系统", "user": "张三" }
{ "type": "change", "baseSeq": 10, "changes": [{ "path": "meta.author", "old": "A", "new": "B" }] }
{ "type": "ping" }
```

服务端到客户端：

```json
{ "type": "joined", "doc": "担保品系统", "seq": 10, "document": {}, "users": [] }
{ "type": "change", "seq": 11, "user": "张三", "changes": [] }
{ "type": "presence", "users": [] }
{ "type": "ack", "seq": 11 }
{ "type": "error", "message": "..." }
```

## 存储

第一阶段在每个文档包下增加：

```text
workspace/
  文档名/
    manifest.json
    collab/
      changelog.jsonl
```

`manifest.json` 仍由现有保存链路写入。`changelog.jsonl` 是后续自动保存和版本重放的基础。

协作工作稿自动落盘与手动保存不同：

- 协作变更会在服务端节流后写回 `manifest.json`。
- 自动落盘不创建普通历史快照，避免 3 秒级同步刷爆 `.history`。
- 文档 `revision` 不因协作自动落盘递增，正式审计边界由“归档版本”承担。

新协作会话启动时，服务端先加载 `manifest.json`，再回放 `collab/changelog.jsonl`：

- 遇到 `snapshot` 记录，直接用快照替换当前会话文档。
- 遇到 `change` 记录，按 path 应用字段变更。
- 回放后的最大 `seq` 作为当前会话起点。

## 冲突策略

第一阶段采用“字段变更 + 准实时整文档快照”的组合策略：

- 低风险字段可以继续发送 `change` 事件。
- 所有会调用 `markModified()` 的编辑操作，都会在 3 秒节流后发送 `snapshot` 事件。
- `snapshot` 代表当前工作稿的完整文档状态，服务端按 `seq` 记录并广播给其他协作者。
- 这样可以先覆盖所有操作类型，不需要逐个编辑函数改造成细粒度事件。

`snapshot` 的代价是日志较大、冲突粒度较粗。考虑到 BLM 协作通常按模块分工，且用户接受 3s~30s 的准实时刷新，这个复杂度更合适。

### 本地待同步与远程快照冲突

当客户端已经有本地待同步快照时，如果收到其他协作者广播的远程 `snapshot`：

- 不立即覆盖本地 `S.doc`。
- 将远程快照暂存在 `S.collab.pendingRemoteSnapshot`。
- 在顶部显示冲突提示，告知“检测到其他人的协作更新，当前本地也有未同步修改”。
- 用户可以选择：
  - 应用远程：用远程快照替换本地工作稿。
  - 保留本地：重新排队发送本地快照，稍后覆盖远程。
  - 稍后处理：保留提示，不改变当前文档。

这个策略不是最终精细合并，但它先解决最危险的问题：多人编辑时不能静默覆盖。

后续对高风险路径分级：

- 低风险：标量字段，如名称、说明、作者。
- 中风险：对象字段，如节点位置、展示配置。
- 高风险：数组增删、引用关系、流程连线，需要操作级事件，而不是裸 path。

## URL 与快照的关系

实时协作只处理 `latest` 工作稿。命名版本和快照仍走 HTTP 加载，且只读，不连接 WebSocket。

后续链接形态：

```text
latest:   /#/doc/{docAlias}?tab=process&proc={processUid}
version:  /#/doc/{docAlias}?at=version:{versionUid}&tab=data&entity={entityUid}
snapshot: /#/doc/{docAlias}?at=snapshot:{snapshotUid}&tab=process&proc={processUid}
```

## 风险与扩展点

- Python `http.server` 没有现成 WebSocket 支持，当前实现了最小 WebSocket 握手和帧解析。
- 当前前端大量编辑函数直接修改 `S.doc`，后续接入实时变更时需要集中变更入口。
- LWW 对数组和引用关系不够安全，后续必须把“新增节点、删除实体、调整连线”等定义为操作事件。
- 自动保存需要明确何时把协作会话中的内存文档写回 `manifest.json`，避免与现有手动保存互相覆盖。

## 对标产品差距

腾讯在线文档、语雀这类产品的优势不只是“多人在线”，还包括稳定的协作心智：

- 编辑即保存，页面只显示轻量状态，不用反复提醒用户手动保存。
- 版本是正式归档动作，而不是每次输入都变成用户要理解的历史记录。
- 链接可以稳定定位到具体页面、段落或对象，并支持只读版本回看。
- 文档列表通常按空间、项目、标签、最近访问组织，而不是一条扁平列表。
- 协作者信息更细：谁在线、谁刚改了哪里、当前是否离线。

BLM 当前选择“3 秒准实时快照 + 命名版本”的路线，复杂度低于 CRDT/OT，但要用产品机制补齐心智：轻量状态、版本记录、定位链接、空间标签和日志压缩。

## 定位链接

定位链接不常驻显示，避免干扰建模界面。用户在主视图右键打开轻量菜单：

- 复制当前视图链接。
- 流程视图下可复制当前流程链接。
- 节点编辑/选中节点时可复制当前节点链接。
- 数据视图下可复制当前实体链接。
- 查看只读版本时可复制当前版本链接。

链接使用查询参数：

```text
?doc=文档名&tab=process&proc=流程UID&task=节点UID&view=swimlane
?doc=文档名&tab=data&entity=实体UID
?doc=文档名&at=version:版本号&tab=domain
```

## 团队空间与标签

团队空间和标签属于文档元数据：

```json
{
  "meta": {
    "space": "交割业务",
    "tags": "担保品，WPF"
  }
}
```

打开文档时，服务端提供轻量摘要列表，前端按 `space` 分组展示；标签作为辅助筛选和识别信息展示。

## 版本记录与自动保存存储策略

- 顶部一级按钮“历史记录”统一展示归档版本和近期历史。
- “归档版本”用于评审、发布、Confluence 链接等稳定引用。
- 协作自动保存只更新工作稿，不生成普通 `.history` 快照。
- `collab/changelog.jsonl` 按条数或文件体积触发压缩，只保留最新 snapshot 作为重放起点，减少长期运行后的加载和存储成本。
