# 设计

- 新增 `compareLeftName` 状态，打开比对框时默认等于 `runtime.currentFile`。
- 模板新增左侧文档下拉，数据复用 `workspaceFiles()`。
- `onCompareLeftNameChanged()` 清空左侧版本选择、清空结果并刷新左侧来源候选。
- `runCompare()` 左侧当前版本加载规则：
  - 若左侧文档就是当前打开文档，使用 `runtime.doc` 保留未提交编辑态。
  - 若左侧文档不是当前打开文档，通过 `api.load(name)` 加载。
- 右侧逻辑不变。
