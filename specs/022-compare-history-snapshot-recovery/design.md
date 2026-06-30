# 设计

## 概要设计

- 将 `CompareSource` 扩展为 `current | version | history`。
- 复用 `compareRightVersionId` 作为右侧来源条目 id。
- `refreshCompareRightVersions()` 根据来源调用 `api.versions()` 或 `api.history()`。
- `runCompare()` 在 history 来源下调用 `api.loadHistory(name, id)`。

## 验证

- 组件测试模拟选择右侧历史快照并运行比对。
- 断言请求 `/api/history/load`，并展示历史快照文档中的差异。
