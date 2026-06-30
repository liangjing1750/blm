# 需求梳理

## 背景

旧版导出 DOCX 会先提交异步任务，期间显示等待/进度反馈，任务完成后再下载生成的 Word 文件。Angular 目前已经恢复 ZIP 文档包导出，但 DOCX 异步导出入口仍缺失。

## 本轮范围

- 在预览工作台增加“导出 DOCX”按钮。
- 当前文档已保存时，调用 `/api/export-docx/start` 提交任务。
- 轮询 `/api/export-jobs/<jobId>`，等待任务完成。
- 完成后调用 `/api/export-jobs/<jobId>/download` 下载 DOCX。
- 导出期间显示等待框。

## 暂不负责

- 旧版导出格式确认弹窗。
- DOCX 内容生成逻辑。
- 复杂进度条百分比 UI。
