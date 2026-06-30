# 设计

## 概要设计

- `ShellComponent` 增加右侧比对来源状态：`compareRightSource`、`compareRightVersionId`、`compareRightVersions`。
- 打开比对弹窗或切换右侧文档时刷新归档版本列表。
- `runCompare()` 根据来源加载右侧文档：
  - current：`api.load(name)`
  - version：`api.loadVersion(name, versionId)`

## 验证

- 组件测试模拟选择右侧文档、切换归档版本、选择版本并运行比对。
- 断言请求 `/api/version/load`，并展示归档版本中的差异。
