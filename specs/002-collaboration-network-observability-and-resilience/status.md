# Status

## 当前状态

T1、T2 已完成并分别提交；当前准备进入 T3“大文档与弱网同步优化”。

## 本轮完成

- 顶栏协作状态徽标支持点击和键盘打开“协作连接诊断”弹窗。
- 诊断弹窗显示当前文档、连接状态、socket readyState、seq、待自动同步、同步中、远端更新、最近同步、在线用户。
- 支持复制诊断信息，便于用户截图/粘贴给管理员排障。
- 复用现有轻量远端更新状态，不新增横幅。

## 自动验收

- `node --check app\collab.js` 通过。
- `python -m py_compile blm_core\diagnostics.py blm_core\server.py blm_core\collab.py blm.py` 通过。
- 静态检查通过：HTML 入口、弹窗、JS 函数、CSS 类均存在。
- Playwright 点击验收暂未执行：本机 npm/npx 缓存路径异常，暂无可用浏览器自动化工具。

## 下一步

进入 T3：snapshot hash 去重、弱网防抖和旧 baseSeq 底线测试。

## 风险与备注

- 当前协作协议仍保留 snapshot 架构，本轮未引入 CRDT。
- 日志默认写入工作区下的 `.logs`，避免污染业务文档目录展示。
- `tools/e2e/artifacts/` 是本地测试产物，暂不纳入提交。
