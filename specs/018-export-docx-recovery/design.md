# 设计

## 概要设计

- `ApiService` 补齐 DOCX 导出任务接口。
- `PreviewWorkbench` 管理局部导出等待状态，复用 `WaitDialogComponent`。
- 下载文件名优先使用任务返回的 `filename`，否则从响应头读取，再否则退回当前文档名。

## 详细设计

- `exportDocx()`：
  - 无当前文件时直接返回。
  - 设置等待框为“正在提交 DOCX 导出任务”。
  - `startDocxExport(currentFile)` 获取 job。
  - 轮询 `exportJob(job.id)` 直到 `done` 或 `failed`。
  - `done` 后下载；`failed` 时结束等待并保留控制台错误。

## 验证

- 组件测试模拟用户点击 DOCX 导出按钮。
- 断言 start、job status、download 三个接口按顺序被请求。
- 断言等待框曾出现，下载 blob 被触发。
