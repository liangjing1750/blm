# 设计

- 在 `CompareSource` 中增加 `submit`。
- 右侧来源切换到 `submit` 时复用现有版本下拉，数据来自 `api.collabSubmits(name)` 的 `submits` 数组。
- 下拉值优先使用 `submitId`，兼容 `id` 字段。
- 执行比对时调用 `api.loadCollabSubmit(name, submitId)`，并从返回值的 `document` 字段提取文档。
- 保持归档版本和历史快照路径不变。
