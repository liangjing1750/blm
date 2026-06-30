# 033 合并校验自动修复恢复 - 设计

## 概要设计

模块归属：

- `frontend-angular/src/app/core/api/api.service.ts`
- `frontend-angular/src/app/shell/shell.component.ts`
- `frontend-angular/src/app/shell/shell.component.html`

主入口：合并弹窗校验问题卡片中的“删除引用”按钮。

读模型：`MergeAnalysis.merged_document`、`MergeAnalysis.validation_issues`。

写模型：只修改内存中的合并结果草稿；通过 `/api/document/validate` 重新规范化和校验，不保存文件。

## 详细设计

### ApiService.validateDocument()

职责：包装现有 `/api/document/validate`。

不负责：判断修复策略。

输入：合并结果草稿。

输出：校验接口返回的 `{ document, validation_issues }`。

### ShellComponent

新增只读修复识别：

- `mergeValidationFix(issue)`：识别 `stageFlowRefs.*` 为自动修复项。

新增修复执行：

- `applyMergeValidationFix(index, action)`：复制 `merged_document`，应用修复，调用 `api.validateDocument()`，刷新 `mergeAnalysis`。

边界细节：

- 修复失败时只提示错误，不保存文档。
- `stageFlowRefs.<id>` 修复会同时清理 `stageFlowLinks` 中 `fromRefId/toRefId` 指向该 id 的连线。

### shell.component.html

校验项不再只是平铺文本；对可自动修复项显示一张校验卡片，包含问题说明、修复建议和按钮。
