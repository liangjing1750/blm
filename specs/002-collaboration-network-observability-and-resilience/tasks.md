# Tasks

## 用户旅程与 BDD 场景

### J1 管理员排查跨网段断线
- Given BLM 部署在内网服务器，部分用户频繁断线
- When 管理员打开日志或管理端
- Then 能看到服务启动、HTTP 请求、WebSocket join/leave/error、snapshot/autosave 耗时和最近错误

### J2 普通用户在弱网下编辑
- Given 用户正在编辑大文档
- When WebSocket 中断或远端有更新
- Then 页面不频繁弹横幅，不直接覆盖本地输入，用户能通过“立即同步”完成推送与拉取

### J3 WebSocket 不稳定时继续协作
- Given WebSocket 连接失败
- When 用户继续编辑并点击立即同步
- Then 系统通过 HTTP 降级接口提交 snapshot，并通过轮询拉取最新 seq

### J4 管理端巡检服务
- Given BLM 正在运行
- When 管理员打开独立管理端
- Then 能看到服务状态、文档列表、在线连接、最近错误、日志摘要和诊断包入口

## 实现切片

- [x] T1 日志与诊断基础
  - [x] 增加结构化日志工具，支持滚动文件
  - [x] 记录服务启动、HTTP 请求、异常响应
  - [x] 记录协作 join/leave/error/snapshot/autosave
  - [x] 暴露协作诊断快照给后续管理端复用
  - [x] 自动验收：py_compile、日志写入脚本
  - [ ] 关键协作 Playwright 测试：当前本机 npm/npx 缓存路径异常，暂记为环境阻塞

- [x] T2 前端连接诊断与少打扰提示
  - [x] 顶栏协作状态可点击查看诊断信息
  - [x] 诊断弹窗显示连接状态、seq、在线用户、待同步状态
  - [x] 远端更新沿用轻量状态，不新增频繁横幅
  - [x] 静态验收：入口、弹窗、JS 函数、CSS 均存在
  - [ ] Playwright 点击诊断入口并截图：当前本机 Playwright/npm 环境不可用

- [x] T3 大文档与弱网同步优化
  - [x] snapshot 发送前做 hash 去重
  - [x] 自动同步防抖从 3 秒调整为 5 秒，立即同步不受影响
  - [x] baseSeq 过旧时沿用服务端 rebase，不覆盖服务端
  - [x] 自动验收：旧 baseSeq 合并 smoke test、JS 语法检查、Python 编译

- [ ] T4 HTTP 降级协作接口
  - [ ] GET /api/collab/poll 返回当前 seq 和必要 snapshot
  - [ ] POST /api/collab/snapshot 复用服务端串行合并逻辑
  - [ ] 前端 WebSocket 不可用时进入 polling fallback
  - [ ] 自动验收：接口测试、断开 WebSocket 后立即同步测试

- [ ] T5 独立管理端
  - [ ] 支持 BLM_ADMIN_PORT 启动只读管理端
  - [ ] 管理端展示服务状态、文档状态、协作连接、日志摘要
  - [ ] 支持下载诊断包
  - [ ] 自动验收：管理端 health/status API 测试

- [ ] T6 回归与文档收口
  - [ ] 更新 docs 中协作、changelog 生命周期、弱网排障说明
  - [ ] 全量关键 UI 流程截图验收
  - [ ] 整理最终风险与后续建议
