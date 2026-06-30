# 设计

## 落点

- 新增 `workbenches/preview/PreviewWorkbench`。
- Shell 只负责挂载，不承载预览和导出逻辑。

## 数据来源

只读使用 `getAngularRuntimeState()` 当前文档和文件名。

## 导出方式

本切片使用浏览器 Blob 生成下载，不调用后端接口，不改变文档模型，不触发保存或同步。

## 验收

进入 `/preview` 后能看到文档标题、统计概要、流程清单；点击导出 JSON 会生成下载 Blob。
