# 设计

## 概要设计

- 入口仍在 `ShellComponent` 的合并弹窗。
- 查询和合并算法继续交给后端 `/api/merge/analyze` 和已有 `merged_document`。
- 写入使用现有 `ApiService.save(name, document)`，不新增后端接口。

## 详细设计

- `MergeAnalysis` 补充 `suggested_name` 字段。
- 新增 `saveMergeResult()`：
  - 若未检查，提示先执行合并前检查。
  - 若存在冲突，提示先处理冲突。
  - 若存在校验问题，提示不能生成文档。
  - 计算目标名称，写入 `merged_document.meta.title/domain`。
  - 调用 `api.save()` 保存并打开结果。

## 验证

- 组件测试模拟用户执行检查后点击生成，断言 `/api/save/<name>` 被调用，且当前运行时切到新文档。
