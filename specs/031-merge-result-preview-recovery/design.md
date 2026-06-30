# 031 合并结果预览恢复 - 设计

## 概要设计

模块归属：`frontend-angular/src/app/shell/`。

主入口：顶部工具栏“合并前检查”弹窗中的“合并前检查”按钮。

读模型：复用 `MergeAnalysis.merged_document`。该字段来自后端合并分析结果，Shell 只做只读摘要，不修改文档内容。

写模型：无新增写入逻辑；生成合并文档仍沿用现有 `saveMergeResult()`。

UI 状态：

- 有 `merged_document`：展示“合并结果预览”摘要块。
- 无 `merged_document`：不展示摘要块，避免误导用户。
- 冲突和校验列表保持现有行为。

## 详细设计

### ShellComponent

职责：提供模板可调用的只读摘要 helper。

不负责：合并算法、冲突裁决、后端校验。

输入：`MergeAnalysis` 或 `merged_document`。

输出：用于模板展示的标题、业务域和数组计数。

边界细节：不同历史文档可能使用 `terms` 或 `language` 表达术语，因此术语计数兼容读取两种字段，但不写回模型。

### shell.component.html

职责：在 `merge-analysis` 中追加一个 `data-testid="merge-result-preview"` 的结果预览块。

不负责：构造合并结果或隐藏现有冲突处理。

展示项：

- 标题
- 业务域
- 角色
- 流程
- 实体
- 任务
- 术语
