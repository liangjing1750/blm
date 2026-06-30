# Design

## 设计原则

1. 先定义语义边界，再扩展数据模型。
2. 构件任务是抽象业务能力，不绑定单一运行时。
3. 应用服务是场景入口，不是流程节点或构件的下级。
4. 编排变量只在单个应用服务调用上下文中存在。
5. 第一版只做串行任务链路和参数映射，不做复杂控制流。
6. 继续保持 BLM 本地优先、文件驱动、JSON 可读可迁移。

## 概念关系

```text
流程节点
  └── 引用应用服务

应用服务
  ├── HTTP 接口定义
  ├── 编排上下文变量
  ├── 编排步骤
  │   └── 引用构件任务
  └── 返回映射

业务组件
  └── 业务构件
      ├── 实体
      ├── 构件任务
      └── 技术承接
```

关键边界：

- 流程节点回答“谁在什么责任边界内做什么”。
- 应用服务回答“某个页面动作或流程动作调用哪个无状态接入接口”。
- 应用编排回答“这个接口内部如何组织多个构件任务，并传递参数变量”。
- 构件任务回答“某个业务构件能提供什么抽象能力”。
- 技术承接回答“这个抽象能力未来如何落到运行时或代码生成”。

## 工作台职责

### 流程工作台

负责维护流程节点和业务动作来源。第一版只需要能看到或选择节点关联的应用服务。

不负责：

- 不维护构件任务参数。
- 不维护技术承接。
- 不维护编排变量。

### 构件工作台

负责维护业务构件、构件任务、输入输出参数和技术承接。

构件任务建议字段：

```json
{
  "uid": "task-save-reservation",
  "name": "保存入库预约",
  "intent": "Command",
  "constructUid": "construct-inbound-reservation",
  "inputs": [
    { "name": "warehouseId", "type": "string", "required": true, "desc": "仓库标识" },
    { "name": "productId", "type": "string", "required": true, "desc": "品种标识" },
    { "name": "goodsAmount", "type": "number", "required": true, "desc": "预约数量" },
    { "name": "operatorId", "type": "string", "required": true, "desc": "操作人" }
  ],
  "outputs": [
    { "name": "reservationId", "type": "string", "desc": "入库预约标识" },
    { "name": "reservationNo", "type": "string", "desc": "入库预约编号" }
  ],
  "technicalHandover": {
    "runtimeKind": "DomainServiceJar",
    "target": "InboundReservationService.submit",
    "note": "由 FSM 内嵌领域服务承接，后续可映射为领域服务方法或 Agent 生成物。"
  }
}
```

说明：

- `intent` 先使用 `Query / Command / Validate / Calculate / Notify / StateChange / Event`。
- `technicalHandover` 是说明性结构，不要求第一版可执行。
- 现有 `taskDefinitions.parameters.inputs/outputs` 可以作为兼容来源；后续是否升级字段结构，需要单独任务确认。

### 应用编排工作台

负责维护应用服务和应用服务内部编排。

应用服务建议字段：

```json
{
  "uid": "service-submit-inbound-reservation",
  "name": "提交入库预约",
  "method": "POST",
  "path": "/inbound-reservations/submit",
  "desc": "客户提交入库预约时调用的无状态接入服务接口。",
  "nodeRefs": [
    { "processUid": "process-inbound-appointment", "nodeUid": "node-customer-submit" }
  ],
  "requestParams": [
    { "name": "warehouseId", "type": "string", "required": true },
    { "name": "productId", "type": "string", "required": true },
    { "name": "goodsAmount", "type": "number", "required": true },
    { "name": "appointmentDate", "type": "date", "required": true }
  ],
  "responseParams": [
    { "name": "reservationNo", "type": "string" },
    { "name": "status", "type": "string" }
  ],
  "orchestration": {
    "variables": [],
    "steps": [],
    "returnMapping": []
  }
}
```

编排建议字段：

```json
{
  "variables": [
    { "name": "operatorId", "source": "context.operatorId", "type": "string" }
  ],
  "steps": [
    {
      "uid": "step-check-warehouse",
      "name": "校验仓库状态",
      "taskDefinitionUid": "task-check-warehouse-status",
      "inputMapping": [
        { "target": "warehouseId", "source": "request.warehouseId" }
      ],
      "outputMapping": [
        { "source": "available", "target": "step.checkWarehouse.available" }
      ]
    },
    {
      "uid": "step-save-reservation",
      "name": "保存入库预约",
      "taskDefinitionUid": "task-save-reservation",
      "inputMapping": [
        { "target": "warehouseId", "source": "request.warehouseId" },
        { "target": "productId", "source": "request.productId" },
        { "target": "goodsAmount", "source": "request.goodsAmount" },
        { "target": "operatorId", "source": "context.operatorId" }
      ],
      "outputMapping": [
        { "source": "reservationId", "target": "step.saveReservation.reservationId" },
        { "source": "reservationNo", "target": "step.saveReservation.reservationNo" }
      ]
    }
  ],
  "returnMapping": [
    { "target": "reservationNo", "source": "step.saveReservation.reservationNo" },
    { "target": "status", "source": "const.SUBMITTED" }
  ]
}
```

## 变量命名规则

第一版变量路径只允许以下根：

```text
request.*
context.*
step.<stepAlias>.*
const.*
return.*
```

规则：

- `request.*` 来自应用服务请求参数。
- `context.*` 来自调用上下文，由接入服务运行时提供，BLM 只描述变量名和含义。
- `step.<stepAlias>.*` 来自某个编排步骤输出。
- `const.*` 是应用服务编排内局部常量。
- `return.*` 只用于最终返回组装，不作为后续步骤输入来源。

第一版不支持：

- 跨应用服务变量。
- 全局变量。
- 动态表达式语言。
- 脚本片段。
- 深层数组转换。

## 与流程应用平台 CQRS 架构的对接

流程应用平台分为三类运行承接：

```text
无状态接入服务
  对应 BLM 应用服务。
  面向前端和外部调用方提供 HTTP 接口。

有状态流程引擎 + 内嵌领域服务
  对应构件任务的一类技术承接。
  流程引擎基于 FSM 纯内存运行，领域服务 Jar 承接业务组件、业务构件、聚合和任务方法。

无状态查询服务
  对应构件任务的一类技术承接。
  通过 FSM 事件溯源机制落库，再通过 SQL + HTTP 对外提供查询。
```

BLM 只描述接口、构件任务、参数映射和技术承接意图。运行时细节由流程应用平台和后续生成工具承接。

## 数据模型策略

第一版优先复用现有字段：

- 顶层 `services[]` 继续表示应用服务。
- `services[].taskDefinitionUids` 可作为旧的任务链路兼容字段。
- `services[].orchestration` 作为新增轻量结构承接变量和步骤。
- `taskDefinitions[]` 继续表示任务定义，新增或扩展 `constructUid`、`parameters`、`technicalHandover`。
- `processes[].nodes[]` 通过 `serviceUids` 或现有弱引用方式关联应用服务，具体字段名在实现任务中再确认。

模型升级原则：

- 先做兼容读取，再做编辑写入。
- 旧文档没有 `orchestration` 时，应显示为空编排，而不是报错。
- 旧 `taskDefinitionUids` 仍可被展示为简单任务链路。
- 新结构写入前必须补模型规范化和保存回归测试。

## UI 概要

### 构件工作台

建议新增“构件任务”详情区：

```text
构件
  ├── 实体
  ├── 构件任务
  │   ├── 输入参数
  │   ├── 输出参数
  │   └── 技术承接
  └── 关联流程参考
```

### 应用编排工作台

建议主界面分为三栏：

```text
左栏：应用服务列表
中栏：服务接口定义 + 编排步骤
右栏：变量面板 + 当前步骤输入输出映射
```

第一版控件重点：

- 应用服务基本信息。
- 请求参数和返回参数。
- 编排步骤列表。
- 步骤选择构件任务。
- 输入映射表。
- 输出绑定表。
- 返回映射表。

## 验证策略

设计阶段验证：

- 文档审查：确认边界和术语是否符合用户已确认前提。
- 示例推演：用“提交入库预约”检查参数变量是否能贯通。

实现阶段验证：

- 模型单元测试：兼容旧 `services[].taskDefinitionUids`，新增 `orchestration` 空态规范化。
- 组件测试：应用服务列表、步骤编辑、变量映射表、技术承接字段。
- 浏览器旅程：打开文档，进入应用编排工作台，新增服务，编排构件任务，回到流程节点查看引用。
- 构建验证：`cd frontend-angular; npm.cmd test -- --watch=false; npm.cmd run build`。
