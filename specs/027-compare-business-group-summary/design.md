# 设计

- 在 `ShellComponent` 中增加 `compareGroups(result)` 读模型方法。
- `compareGroups` 基于 `visibleCompareRows(result)` 计算分组，避免重复维护 diff/all 过滤规则。
- 模板在总数卡片下新增 `compare-group-summary`，展示每个 section 的可见行数量。
- 列表从扁平 `preview-row` 改为按 `compare-group` 包裹，每组有标题和数量。
- 不改变 `CompareResult` 数据来源和后端接口。
