# Status

## 当前状态

T1、T2、T3、T4 已完成并分别提交；当前准备进入 T5“独立管理端”。

## 本轮完成

- 后端新增 `GET /api/collab/poll`，可按 seq 拉取最新文档和在线用户。
- 后端新增 `POST /api/collab/snapshot`，复用 `CollaborationManager` 的串行 baseSeq/rebase 逻辑。
- 前端在 WebSocket 超时或断开时启动 10 秒轮询降级。
- 用户点击“立即同步”时，如果 WebSocket 未就绪，会通过 HTTP snapshot 尝试同步。

## 自动验收

- `node --check app\collab.js`、`node --check app\api.js` 通过。
- `python -m py_compile blm_core\diagnostics.py blm_core\server.py blm_core\collab.py blm.py` 通过。
- HTTP snapshot 旧 `baseSeq` rebase smoke test 通过：降级通道也不会覆盖服务端新增内容。
- Playwright 点击验收暂未执行：本机 npm/npx 缓存路径异常，暂无可用浏览器自动化工具。

## 下一步

进入 T5：补只读管理端，展示服务状态、协作连接、最近日志，并提供诊断包。

## 风险与备注

- 当前协作协议仍保留 snapshot 架构，本轮未引入 CRDT。
- 日志默认写入工作区下的 `.logs`，避免污染业务文档目录展示。
- `tools/e2e/artifacts/` 是本地测试产物，暂不纳入提交。
