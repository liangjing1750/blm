# 流程视图导出五步法记录

## 1. 需求梳理

- 流程视图导出由两部分组成：流程图完整截图、流程下所有节点内容。
- 流程标题遵循全局标题体系，使用四级标题：`流程：XX`。
- 节点内容不重新实现字段拼接，复用节点导出的 `buildNodeContent()`。
- 截图必须适配滚动条场景，目标是捕获完整流程画布，而不是滚动容器的可视区域。

## 2. 概要设计

- 新增 `ProcessExporter` 作为流程视图导出入口。
- `getContent()` 返回结构化 `ViewContent`：
  - `heading4`：流程标题。
  - 流程基础信息表。
  - `image`：流程图截图占位。
  - 多个节点片段：直接拼接 `buildNodeContent()` 输出。
- `captureAll()` 返回一张流程图截图。

## 3. 详细设计

- `buildProcessContent(document, process)`：纯函数，负责内容拼接，便于测试。
- `captureProcessFlowGraph()`：DOM 截图入口，优先找当前流程画布。
- `captureFullElement()`：截图前临时展开父容器 overflow/max-width/max-height，并将画布 zoom 归 1。
- `createCurrentProcessExporter()`：流程工作台根据当前 `procId` 创建流程导出器。

## 4. 实现代码

- 新增 `frontend-angular/src/app/core/export/exporters/process-exporter.ts`。
- 扩展 `process-export-dispatcher.ts`，支持流程 exporter。
- 扩展 `process-workbench-shell.component.ts`，在流程视图下启用导出按钮。

## 5. 设计并实现用例

- `process-exporter.spec.ts`：
  - 验证流程导出包含四级流程标题、流程图 image、节点五级标题。
  - 验证 `ProcessExporter` 文件名标签和截图数组契约。
- `process-export-dispatcher.spec.ts`：
  - 验证当前 `procId` 可创建流程导出器。

## 当前风险

- 单元测试覆盖了内容拼接和 exporter 契约；完整滚动截图仍需要浏览器手工或 E2E 验证。
- 当前流程截图依赖现有 `.process-flow-canvas` 的完整宽高，若后续流程图渲染迁移，需要同步更新选择器。
