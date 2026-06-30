# 034 合并校验删除类修复恢复 - 设计

## 概要设计

模块归属：`frontend-angular/src/app/shell/`。

主入口：合并弹窗校验问题卡片中的自动修复按钮。

读模型：`MergeAnalysis.validation_issues` 与 `MergeAnalysis.merged_document`。

写模型：只更新弹窗内合并草稿，随后由 `/api/document/validate` 返回规范化文档和剩余校验项。

## 详细设计

### mergeValidationFix(issue)

扩展识别：

- `stage_flow_link`
- `stage_process_link`
- `relation`

输出修复按钮文案和建议文案。

### applyMergeValidationFixToDocument(document, issue)

扩展执行：

- `stage_flow_link`：按 `id/uid` 删除 `stageFlowLinks`。
- `stage_process_link`：定位 stage 后按 `uid/id` 删除 `processLinks`。
- `relation`：按 `uid/id` 删除 `relations`。

边界细节：路径 token 同时兼容 `uid` 和 `id`，延续当前文档兼容策略。
