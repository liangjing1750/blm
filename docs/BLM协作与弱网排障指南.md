# BLM 协作与弱网排障指南

本文用于排查 BLM 部署到内网服务器后，部分团队频繁断线、同步慢、打开报错等问题。

## 1. 先区分三类问题

| 现象 | 初步判断 | 优先排查 |
| --- | --- | --- |
| 页面打不开 | HTTP 服务或端口不可达 | 服务是否启动、防火墙、端口策略、代理 |
| 页面能打开，但协作断线 | WebSocket Upgrade 或跨网段策略问题 | 防火墙、网关、代理是否允许 WebSocket |
| 页面能打开，协作能连，但同步慢 | 大文档、代理超时、保存耗时 | 文档大小、请求体限制、服务端耗时日志 |

## 2. 用户侧排查步骤

### 第一步：确认页面能否打开

- 不能打开：先检查 BLM 主服务端口，默认 `8081`。
- 能打开：说明 HTTP 静态资源和普通 API 基本可达，继续看协作连接。

### 第二步：打开协作连接诊断

点击顶栏“协作在线 / 协作连接中”状态，查看：

- `连接状态`：已连接、重连恢复中、未连接。
- `同步通道`：WebSocket、HTTP 降级、重连中。
- `Socket`：`OPEN` 表示 WebSocket 已连上；`CLOSED`、`NONE` 表示未连上。
- `Seq`：协作版本号。多人同步时应持续增长。
- `在线用户`：用于确认服务端是否识别到当前用户。
- `最近错误`：如果有错误，复制给管理员。

### 第三步：点击“立即同步”

- 成功：说明 WebSocket 或 HTTP 降级至少有一条通道可用。
- 失败：复制诊断信息，继续看管理端和日志。

### 第四步：访问管理端

管理端默认端口是 `8091`：

```text
http://服务器地址:8091
```

管理端可以查看：

- 服务运行状态。
- 当前协作会话和在线用户。
- 最近结构化日志。
- 诊断包下载。

### 第五步：下载诊断包

在管理端点击“下载诊断包”，把压缩包交给管理员。压缩包通常包含：

- `status.json`
- `recent-log-events.json`
- `logs/blm.log`
- `logs/errors.log`

## 3. HTTP 降级机制

BLM 正常使用 WebSocket 做实时协作：

```text
浏览器  <--WebSocket-->  BLM 服务端
```

当 WebSocket 不稳定时，前端会进入 HTTP 降级：

```text
浏览器  --HTTP Poll-->      BLM 服务端
浏览器  --HTTP Snapshot-->  BLM 服务端
```

降级触发条件：

- WebSocket 已连接过，但后续断开。
- WebSocket 连接超时。
- 用户点击“立即同步”时，WebSocket 仍未就绪。

恢复机制：

- 降级期间仍会持续尝试 WebSocket 重连。
- WebSocket 恢复后自动退出 HTTP 轮询。
- 用户无需手动切换降级模式。

为什么不提供普通用户主动切换按钮：

- 降级只是弱网兜底，实时性比 WebSocket 低。
- 普通用户只需要关注“立即同步”是否成功。
- 管理员通过诊断信息判断当前是否进入降级通道。

## 4. 日志位置

日志默认写入：

```text
workspace/.logs/blm.log
workspace/.logs/errors.log
```

`blm.log` 是结构化 JSONL，每一行是一条事件。

## 5. 日志字段格式

示例：

```json
{
  "ts": "2026-06-03T10:35:12+0800",
  "level": "info",
  "logger": "blm.collab",
  "event": "collab.snapshot",
  "doc": "交割智慧监管平台",
  "seq": 128,
  "baseSeq": 127,
  "rebased": false,
  "clientId": "client-xxxx",
  "user": "梁晶",
  "documentBytes": 2048123,
  "elapsedMs": 318
}
```

字段说明：

| 字段 | 含义 |
| --- | --- |
| `ts` | 日志时间 |
| `level` | 日志级别，常见为 `info`、`error` |
| `logger` | 来源模块，例如 `blm.server`、`blm.http`、`blm.collab` |
| `event` | 事件名称 |
| `doc` | 文档名称 |
| `seq` | 服务端协作版本号 |
| `baseSeq` | 客户端提交时基于的版本号 |
| `rebased` | 是否发生服务端合并 |
| `clientId` | 浏览器连接 ID |
| `user` | 用户显示名称 |
| `clientIp` / `remoteAddr` | 客户端 IP，用于判断网段问题 |
| `documentBytes` | 文档大小 |
| `elapsedMs` | 事件耗时，单位毫秒 |
| `error` | 错误信息 |

## 6. 常见事件

| 事件 | 含义 | 排查价值 |
| --- | --- | --- |
| `server.start` | 主服务启动 | 确认端口、工作区、日志目录 |
| `admin.start` | 管理端启动 | 确认管理端口 |
| `http.request` | HTTP 请求 | 判断页面/API 是否可达 |
| `http.request.error` | HTTP 请求异常 | 查普通接口错误 |
| `collab.join` | 用户加入协作 | 判断 WebSocket 是否连上 |
| `collab.leave` | 用户离开协作 | 判断是否频繁断线 |
| `collab.websocket.error` | WebSocket 错误 | 查代理、防火墙、跨网段策略 |
| `collab.snapshot` | 协作快照同步 | 查同步耗时、文档大小、rebase |
| `collab.autosave` | 自动落盘 | 查保存耗时 |
| `collab.autosave.error` | 自动落盘失败 | 查文件权限、磁盘、路径问题 |

## 7. 管理员排查 SOP

### 场景 A：页面打不开

1. 在服务器上确认 BLM 是否启动。
2. 确认主端口，默认 `8081`。
3. 在客户端访问 `http://服务器地址:8081/api/runtime`。
4. 如果访问失败，检查防火墙、端口策略、反向代理。

### 场景 B：页面能打开，但协作断线

1. 让用户打开“协作连接诊断”，复制诊断信息。
2. 打开管理端，看该用户是否出现在协作会话里。
3. 查 `blm.log`，搜索该用户或客户端 IP。
4. 如果有 `http.request` 但没有 `collab.join`，重点查 WebSocket Upgrade。
5. 如果频繁出现 `collab.websocket.error` 或 `collab.leave`，重点查跨网段连接保持、代理空闲超时、防火墙策略。

### 场景 C：页面能打开，协作能连，但同步慢

1. 查 `collab.snapshot` 的 `documentBytes` 和 `elapsedMs`。
2. 查 `collab.autosave` 的 `elapsedMs`。
3. 如果 `documentBytes` 很大，考虑拆分文档或减少超大附件引用。
4. 如果 HTTP 请求超时，检查代理请求体大小、超时、缓冲设置。

### 场景 D：只有其他团队断线

1. 对比正常团队和异常团队的 `clientIp`。
2. 确认异常团队是否跨网段、跨安全域或经过代理。
3. 验证 HTTP 与 WebSocket 是否表现不同：
   - HTTP 正常、WebSocket 失败：优先查 WebSocket Upgrade。
   - HTTP 也失败：优先查网络 ACL、防火墙、端口访问。
4. 让网络管理员确认 `8081` 和 `8091` 是否允许访问，是否允许 WebSocket 长连接。

## 8. 服务启动与端口

默认端口：

- 业务端口：`8081`
- 管理端口：`8091`

在 `blm.py` 顶部可以直接修改：

```python
PORT = 8081
ADMIN_PORT = 8091
```

也可以用环境变量覆盖：

```powershell
$env:BLM_PORT="8081"
$env:BLM_ADMIN_PORT="8091"
python blm.py
```

如果临时不启动管理端：

```powershell
$env:BLM_ADMIN_PORT="0"
python blm.py
```
