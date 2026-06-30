# 设计

## 概要设计

- `ApiService` 增加 `exportBundle(name)`，返回原始 `Response`，由调用方处理 blob 和错误。
- `PreviewWorkbench` 增加按钮和异步导出方法。
- 下载文件名优先采用 `Content-Disposition`，否则使用当前文档基础名。

## 边界

- 前端不重新组装 zip 内容。
- 当前没有 `runtime.currentFile` 时禁用按钮。
- DOCX 需要进度和等待态，后续单独恢复。
