# 设计

## 概要设计

- `ShellComponent` 保存一个 `mergeResolutions` 字典，键为 conflict id，值为选择。
- `canSaveMergeResult()` 在无冲突时沿用原逻辑；有冲突时要求每个冲突都有选择。
- `saveMergeResult()` 若存在冲突，重新加载右侧文档，调用 `api.applyMerge()`，再使用 apply 返回结果保存。

## 边界

- 前端只组装后端既有 resolutions 格式：`{ [conflictId]: { choice } }`。
- apply 后如果仍有冲突或校验问题，只更新弹窗结果，不写入工作区。
