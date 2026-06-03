# 设计

## 管理端

管理端继续保持只读、无依赖、独立端口，避免排障时依赖主业务页面。

### API

`/api/status` 在原有字段基础上增加：

- `relationships.users`：按用户聚合，展示用户在哪些文档在线、多少连接、远端地址。
- `relationships.connections`：按连接展开，展示文档、用户、客户端、会话、远端地址。
- `relationships.documents`：以磁盘文档为底座，叠加内存协作会话状态。
- `logSummary`：最近日志的事件计数、错误计数、最近错误。

### 页面

页面采用监控平台常见结构：

- 顶部状态栏：服务端口、运行时间、工作区、刷新时间。
- 指标卡：文档、活跃文档、在线用户、连接、错误。
- 明细区：用户、连接、文档、日志分开显示。
- 自动刷新：默认 5 秒。

## 任务参数

### 数据结构

```json
{
  "address": "http://service/path 或 package.Class.method",
  "parameters": {
    "inputs": [
      {"uid": "param-...", "name": "仓单编号", "type": "String", "required": true, "description": "", "example": ""}
    ],
    "outputs": []
  }
}
```

### 编辑策略

任务参数弹窗使用 UI 草稿：

- 打开弹窗时深拷贝任务定义的地址和参数。
- 用户在弹窗内编辑时只改草稿。
- 点击“保存”才写回任务定义并 `markModified()`。
- 点击“取消”丢弃草稿。

### 同步策略

保存任务参数后调用已有 `syncProcessTaskDefinitionFields()`，使流程节点中的复用任务保留同一份任务调用契约。

### 兼容

后端 `canonical_document()` 对任务定义和节点任务补 `address` 与 `parameters` 默认值，不保留历史分支逻辑，只做当前模型的规范化。
