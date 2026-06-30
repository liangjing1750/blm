# Tasks

## 执行规则

- 每次只推进一个任务。
- 开发前先确认该任务的修改范围、测试方式和验收标准。
- 涉及模型写入时，先写规范化或单元测试，再改实现。
- 涉及 Angular 组件时，优先写组件测试或结构测试，再改 UI。
- 每轮完成后更新本文件和 `status.md`。

## T0 建立 V3 应用编排规格

确认状态：本轮执行。

修改范围：

- [x] 新建 `specs/009-v3-application-orchestration/requirements.md`。
- [x] 新建 `specs/009-v3-application-orchestration/design.md`。
- [x] 新建 `specs/009-v3-application-orchestration/tasks.md`。
- [x] 新建 `specs/009-v3-application-orchestration/status.md`。
- [x] 不修改产品代码。

验收标准：

- [x] 写明三个已确认前提：构件任务选 D，应用服务单概念，变量为应用服务局部上下文。
- [x] 写明流程节点、应用服务、构件任务、技术承接和编排变量边界。
- [x] 用“提交入库预约”推演参数变量传递。

## T1 文档模型兼容设计与测试

确认状态：已开发，待用户验收。

修改范围：

- [x] 涉及 `frontend-angular/src/app/core/document/` 下的文档类型、规范化和查询逻辑。
- [x] 不直接修改后端保存格式。
- [x] 不删除旧 `services[].taskDefinitionUids`。

目标：

- [x] 旧文档没有 `services[].orchestration` 时，应用编排工作台能显示为空编排。
- [x] 旧 `taskDefinitionUids` 能转换为兼容的简单步骤展示。
- [x] 新增 `technicalHandover` 不影响旧任务定义读取。

验证：

- [x] 补模型单元测试覆盖旧服务、新服务、空编排、旧任务链路兼容。
- [x] 定向测试通过：`cd frontend-angular; npm.cmd test -- --watch=false --include src/app/core/document/document-model.spec.ts`。
- [x] 全量 Angular 单测通过：`cd frontend-angular; npm.cmd test -- --watch=false`。
- [x] 构建通过：`cd frontend-angular; npm.cmd run build`。

## T2 构件任务技术承接编辑

确认状态：已开发，待用户验收。

修改范围：

- [x] 涉及构件工作台 Angular 组件。
- [x] 涉及任务定义编辑 UI。
- [x] 不实现运行时调用。

目标：

- [x] 后端研发能在构件任务上维护输入参数、输出参数和技术承接说明。
- [x] 技术承接支持运行承接类型、目标标识和备注。
- [x] 构件任务仍是抽象能力，不在 UI 上暗示必须是 HTTP 接口或 Java 方法。

验证：

- [x] 组件测试覆盖输入输出参数展示和编辑。
- [x] 组件测试覆盖技术承接编辑态和只读态。
- [x] 定向测试通过：`cd frontend-angular; npm.cmd test -- --watch=false --include src/app/app.spec.ts`。
- [x] 全量 Angular 单测通过：`cd frontend-angular; npm.cmd test -- --watch=false`。
- [x] 构建通过：`cd frontend-angular; npm.cmd run build`。

## T3 应用服务基础定义

确认状态：已开发，待用户验收。

修改范围：

- [x] 涉及应用编排工作台 Angular 组件。
- [x] 涉及 `services[]` 的读取和编辑。
- [x] 不拆分“前端接口需求”和“应用服务”两个概念。

目标：

- [x] 技术经理能维护应用服务名称、HTTP 方法、路径、说明、请求参数和返回参数。
- [x] 应用服务继续保留节点引用字段，后续 T6 再做流程节点侧回看。
- [x] 空文档或无服务时保留现有列表空态。

验证：

- [x] 组件测试覆盖编辑已有服务的请求参数和返回参数。
- [x] 定向测试通过：`cd frontend-angular; npm.cmd test -- --watch=false --include src/app/app.spec.ts`。
- [x] 全量 Angular 单测通过：`cd frontend-angular; npm.cmd test -- --watch=false`。
- [x] 构建通过：`cd frontend-angular; npm.cmd run build`。

## T4 应用服务编排步骤

确认状态：已开发，待用户验收。

修改范围：

- [x] 涉及应用编排工作台步骤列表和构件任务选择器。
- [x] 涉及构件任务查询。
- [x] 不做条件分支、循环、并行或补偿。

目标：

- [x] 一个应用服务下可以串行编排多个构件任务。
- [x] 每个步骤能选择一个构件任务。
- [x] 步骤能维护稳定别名，用于 `step.<stepAlias>.*` 变量路径。

验证：

- [x] 组件测试覆盖读取 `orchestration.steps`、新增步骤和稳定别名。
- [x] 定向测试通过：`cd frontend-angular; npm.cmd test -- --watch=false --include src/app/app.spec.ts`。
- [x] 全量 Angular 单测通过：`cd frontend-angular; npm.cmd test -- --watch=false`。
- [x] 构建通过：`cd frontend-angular; npm.cmd run build`。

## T5 参数变量映射

确认状态：已开发，待用户验收。

修改范围：

- [x] 涉及应用编排工作台变量面板、输入映射表、输出绑定表、返回映射表。
- [x] 不引入表达式语言。
- [x] 不支持跨应用服务变量。

目标：

- [x] 支持 `request.*`、`context.*`、`step.<stepAlias>.*`、`const.*`、`return.*` 五类变量路径的文本录入。
- [x] 支持为步骤输入选择变量来源。
- [x] 支持把步骤输出绑定到步骤变量。
- [x] 支持从步骤变量和常量组装返回结果。

验证：

- [x] 组件测试覆盖步骤输入映射、输出绑定和返回映射。
- [x] 用“提交入库预约”样例验证变量链路可表达。
- [x] 定向测试通过：`cd frontend-angular; npm.cmd test -- --watch=false --include src/app/app.spec.ts`。
- [x] 全量 Angular 单测通过：`cd frontend-angular; npm.cmd test -- --watch=false`。
- [x] 构建通过：`cd frontend-angular; npm.cmd run build`。

## T6 流程节点引用应用服务

确认状态：已开发，待用户验收。

修改范围：

- [x] 涉及流程工作台节点详情。
- [x] 涉及应用服务弱引用。
- [x] 不要求产品经理维护应用编排细节。

目标：

- [x] 流程节点详情能展示关联应用服务。
- [x] 产品经理可回看接口名称、方法、路径和说明。
- [x] 参数映射和技术承接仍留在应用编排工作台和构件工作台。

验证：

- [x] 组件测试覆盖节点有关联服务时的只读展示。
- [x] 组件测试覆盖流程节点视图不暴露参数映射和技术承接细节。
- [x] 定向测试通过：`cd frontend-angular; npm.cmd test -- --watch=false --include src/app/app.spec.ts`。
- [x] 全量 Angular 单测通过：`cd frontend-angular; npm.cmd test -- --watch=false`。
- [x] 构建通过：`cd frontend-angular; npm.cmd run build`。

## T7 设计文档与用户手册同步

确认状态：已开发，待用户验收。

修改范围：

- [x] 更新 `docs/BLM设计文档.md`。
- [x] 更新 `docs/BLM用户手册.md`。
- [x] 更新 `docs/BLM测试用例.md`。

目标：

- [x] 文档说明 V3 应用编排的概念边界。
- [x] 用户手册说明构件任务、应用服务、变量映射的使用路径。
- [x] 测试用例记录关键回归旅程。

验证：

- [x] 文档审查。
- [x] 最小术语一致性检查：`rg -n "V3|应用编排|构件任务|技术承接|参数变量|流程节点回看" docs/BLM设计文档.md docs/BLM用户手册.md docs/BLM测试用例.md`。
