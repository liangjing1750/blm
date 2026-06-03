# 状态

## 当前状态

管理端仪表盘和任务定义参数功能已实现，定向测试和语法检查通过，准备提交。

## 本轮完成

- `/api/status` 增加 `relationships.users/connections/documents` 与 `logSummary`。
- 管理端页面升级为仪表盘，包含运行概览、用户、连接、文档、日志、原始 JSON，默认 5 秒刷新。
- 任务定义增加 `address` 与 `parameters.inputs/outputs`。
- 任务参数采用弹窗草稿编辑，保存后一次性写入并同步引用该任务定义的节点任务。
- 后端 `canonical_document()` 会规范化任务定义和节点任务参数结构。
- 新增定向测试覆盖管理端状态 payload 与任务参数规范化。

## 验证

- `python -m unittest tests.test_backend.MigrateDocumentTests.test_canonical_document_normalizes_task_parameters tests.test_backend.WorkspaceStorageTests.test_admin_status_payload_exposes_relationships`
- `python -m py_compile blm_core/admin.py blm_core/document.py tests/test_backend.py`
- `node --check app/domain.js`
- `node --check app/process.js`
- `node --check app/state.js`

## 风险

- 本机当前未完成浏览器截图验证；本轮用后端测试、JS 语法检查和静态入口检查兜底。
- 全量 `tests.test_backend tests.test_collab` 存在一批既有历史断言与当前主干模型不一致的失败，本轮没有扩大修复范围。
