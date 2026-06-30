# 设计

## 概要设计

- `ShellComponent` 新增 `mergeCustomValues` 字典。
- 下拉选择为 custom 时，显示文本输入框。
- `applyMergeResolutions()` 组装 resolutions 时，如果 choice 为 custom，则附加 `custom_value`。

## 边界

- 文本输入保持字符串，不在前端猜测 JSON 类型。
- 没有选择冲突处理方式时仍阻止保存。
