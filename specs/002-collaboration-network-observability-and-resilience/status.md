# Status

## 当前状态

T1-T7 已完成。等待用户最终验收。

## 本轮完成

- 协作连接诊断弹窗改成更大的排障面板，原始诊断信息默认展开。
- 诊断信息增加同步通道、降级轮询、最近活动、最近错误。
- 新增 `docs/BLM协作与弱网排障指南.md`，说明 HTTP 降级、日志 JSONL 格式、常见事件和排查 SOP。
- 将《协作与弱网排障指南》加入内置文档列表。
- 管理端默认端口改为 `8091`，配置常量放在 `blm.py` 顶部；可用 `BLM_ADMIN_PORT=0` 临时关闭。
- 管理端端口占用时不拖死主服务，会记录 `admin.start.error`。

## 自动验收

- `python -m py_compile blm_core\admin.py blm_core\diagnostics.py blm_core\server.py blm_core\collab.py blm.py` 通过。
- `node --check app\collab.js`、`node --check app\api.js` 通过。
- 配置默认值 smoke test 通过：`build_runtime_config().admin_port == 8091`。
- 内置文档入口 smoke test 通过：`collaboration-troubleshooting` 已注册。
- 排障指南文件存在并包含日志格式、HTTP 降级、排查 SOP。
- 诊断日志、HTTP 降级、管理端 smoke tests 在上一轮已通过。
- Playwright 点击验收暂未执行：本机 npm/npx 缓存路径异常，暂无可用浏览器自动化工具。

## 下一步

等待用户验收；如本机 Playwright/npm 环境恢复，优先补 UI 截图验收。

## 风险与备注

- 当前协作协议仍保留 snapshot 架构，本轮未引入 CRDT。
- 日志默认写入工作区下的 `.logs`，避免污染业务文档目录展示。
- `tools/e2e/artifacts/` 是本地测试产物，暂不纳入提交。
- 本轮无法完成截图验收的原因：PowerShell 执行策略阻止 `npx.ps1`，`npx.cmd` 又因 npm 缓存路径不可用而失败；当前会话也未暴露可直接控制本地浏览器的工具。
