# Status

## 当前状态

T1、T2、T3 已完成并分别提交；当前准备进入 T4“HTTP 降级协作接口”。

## 本轮完成

- 自动同步防抖从 3 秒放宽到 5 秒，降低大文档频繁 snapshot 发送概率。
- 前端为当前文档计算轻量 hash，内容未变化时不再排队或发送 snapshot。
- ack 和远端 snapshot 会更新已同步 hash，避免后续无意义重复同步。
- 离线编辑后重连时，已同步 hash 使用 `baseDocument`，避免把本地未同步稿误判为已同步。

## 自动验收

- `node --check app\collab.js` 通过。
- `python -m py_compile blm_core\diagnostics.py blm_core\server.py blm_core\collab.py blm.py` 通过。
- 旧 `baseSeq` rebase smoke test 通过：本地旧基线提交不会覆盖服务端新增内容。
- Playwright 点击验收暂未执行：本机 npm/npx 缓存路径异常，暂无可用浏览器自动化工具。

## 下一步

进入 T4：补 HTTP poll/snapshot 降级接口，并让“立即同步”在 WebSocket 不可用时仍有可用路径。

## 风险与备注

- 当前协作协议仍保留 snapshot 架构，本轮未引入 CRDT。
- 日志默认写入工作区下的 `.logs`，避免污染业务文档目录展示。
- `tools/e2e/artifacts/` 是本地测试产物，暂不纳入提交。
