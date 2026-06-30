# 032 合并校验引导恢复 - 设计

## 概要设计

模块归属：`frontend-angular/src/app/shell/`。

主入口：合并弹窗的 `merge-analysis` 结果区。

读模型：`MergeAnalysis.conflicts` 与 `MergeAnalysis.validation_issues`。

写模型：无。

## 详细设计

### ShellComponent

新增只读状态判断：

- `hasMergeValidationIssues(analysis)`：判断是否存在校验项。
- `hasMergeConflicts(analysis)`：判断是否存在冲突项。

职责：为模板提供清晰布尔判断，避免模板中重复写复杂表达式。

不负责：校验项修复、冲突裁决、合并保存。

### shell.component.html

当 `validation_issues.length > 0` 时：

- 若存在冲突，展示 `data-testid="merge-validation-deferred"`，说明先处理冲突，生成前会重新校验。
- 若不存在冲突，展示 `data-testid="merge-internal-validation-error"`，说明合并结果仍有模型一致性问题，不建议手动删除引用。

校验问题明细列表继续保留，作为引导下方的具体证据。
