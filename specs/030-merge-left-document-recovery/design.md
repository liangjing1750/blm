# 设计

- 在 `ShellComponent` 中新增 `mergeLeftName` 状态。
- 打开合并弹窗时，`mergeLeftName` 默认等于当前打开文档，`mergeRightName` 默认选择不同文档。
- 模板新增 `merge-left-select`。
- 切换任一侧文档时清空 `mergeAnalysis`、裁决状态和自定义值。
- `runMergeAnalyze()` 与 `applyMergeResolutions()` 通过通用加载方法获取左、右两侧文档。
- 若左侧选择当前打开文档，使用运行时 `runtime.doc`，保留未保存编辑态；若选择其他文档，通过 `api.load()` 加载。
