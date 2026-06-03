# Status

## 当前状态

T1、T2、T3、T4、T5 已完成并分别提交；当前进入 T6“回归与文档收口”。

## 本轮完成

- 新增只读管理端 `blm_core.admin`。
- `BLM_ADMIN_PORT` 设置后会启动独立管理端口，不设置不影响现有主服务。
- 管理端提供 `/api/status`、`/api/logs/recent`、`/api/diagnostics.zip`。
- 管理端页面展示服务指标、协作会话、最近日志，并支持下载诊断包。

## 自动验收

- `python -m py_compile blm_core\admin.py blm_core\diagnostics.py blm_core\server.py blm_core\collab.py blm.py` 通过。
- 管理端临时端口 `/api/status` smoke test 通过。
- Playwright 点击验收暂未执行：本机 npm/npx 缓存路径异常，暂无可用浏览器自动化工具。

## 下一步

进入 T6：更新使用说明，补最终回归，整理无法自动截图的环境限制。

## 风险与备注

- 当前协作协议仍保留 snapshot 架构，本轮未引入 CRDT。
- 日志默认写入工作区下的 `.logs`，避免污染业务文档目录展示。
- `tools/e2e/artifacts/` 是本地测试产物，暂不纳入提交。
