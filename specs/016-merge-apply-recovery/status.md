# 状态

当前切片：恢复无冲突合并结果落盘。

已确认：

- 后端已有 `/api/merge/analyze` 和 `/api/merge/apply`。
- Angular 已有 `ApiService.save()` 和 `openLoadedDocument()` 可复用。

剩余风险：

- 冲突 resolutions UI 尚未恢复。
- 本轮不处理 base 文档选择。
