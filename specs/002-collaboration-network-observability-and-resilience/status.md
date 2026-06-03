# Status

## 当前状态

T1“日志与诊断基础”已完成代码实现，准备提交第一轮。

## 本轮完成

- 新增 `blm_core.diagnostics`，提供结构化 JSONL 日志、滚动文件、最近日志读取能力。
- 服务启动时记录端口、workspace、日志目录、Python/platform 信息。
- HTTP 请求记录 method、path、status、clientIp、elapsedMs。
- 协作会话记录 join、leave、ping、change、snapshot、autosave、error。
- `CollaborationManager.diagnostics()` 可返回会话、seq、在线用户、待自动保存状态，供管理端复用。

## 自动验收

- `python -m py_compile blm_core\diagnostics.py blm_core\server.py blm_core\collab.py blm.py` 通过。
- 诊断日志 smoke test 通过，已能写入并读取 `workspace/.logs/blm.log`。
- Playwright 回归暂未执行：PowerShell 阻止 `npx.ps1` 后，`npx.cmd` 又因 npm 缓存目录 `D:\Program Files\devsoft\node\node_cache` 不可写/不可创建而失败。

## 下一步

进入 T2“前端连接诊断与少打扰提示”，补诊断弹窗和连接状态可复制信息。

## 风险与备注

- 当前协作协议仍保留 snapshot 架构，本轮未引入 CRDT。
- 日志默认写入工作区下的 `.logs`，避免污染业务文档目录展示。
- `tools/e2e/artifacts/` 是本地测试产物，暂不纳入提交。
