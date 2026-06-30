# 设计

- `CompareResult` 增加 `unchanged` 计数，`CompareRow.kind` 增加 `相同`。
- `ShellComponent` 增加 `compareReportMode`，打开弹窗和重新比对时默认置为 `diff`。
- `buildCompareResult()` 在集合比对时保留相同对象。
- 模板新增报告头和 `compare-report-mode-toggle` 按钮。
- `diff` 模式过滤 `相同` 行；`all` 模式展示全部行。

# 边界

- 不改变后端接口。
- 不改变文档模型。
- 不复制旧版字符串渲染实现。
