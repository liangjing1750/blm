# 设计

- 复用 `compareGroups(result)`，不新增后端或数据模型。
- 模板将每个 `compare-model-group` 内的 `preview-row` 改为 `table.compare-business-table`。
- 每行展示 `$index + 1`、`row.kind`、`row.name + row.detail`。
- 保持空态 `没有发现模型差异。`。
