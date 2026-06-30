# 设计

- 新增常量级读方法 `visibleCompareGroupRows(group)`，返回 `group.rows.slice(0, 40)`。
- 新增 `isCompareGroupTruncated(group)` 判断是否需要提示。
- 模板 `@for` 改为遍历 `visibleCompareGroupRows(group)`。
- 分组表格后追加提示文案。
