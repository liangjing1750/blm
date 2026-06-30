# Tasks

## 执行规则

- 每次只推进一个可验证切片。
- 涉及模型写入先写失败测试。
- 涉及 Angular UI 先写组件级失败测试。
- 每轮结束更新 `tasks.md` 和 `status.md`。

## T0 建立应用工作台完善规格

确认状态：已完成。

- [x] 新建 `requirements.md`。
- [x] 新建 `design.md`。
- [x] 新建 `tasks.md`。
- [x] 新建 `status.md`。

## T1 服务 / 接口两级管理

确认状态：已完成。

- [x] 文档模型新增 `serviceGroups[]`。
- [x] 接口新增 `serviceGroupUid`。
- [x] 应用服务 tab 按服务分组展示接口。
- [x] 接口编辑态可选择所属服务。

## T2 嵌套接口参数

确认状态：已完成。

- [x] `ServiceParam` 支持 `children`。
- [x] 参数编辑 UI 支持树形新增/删除子参数。
- [x] JSON 导入/复制支持嵌套对象。

## T3 应用编排布局和滚动

确认状态：已完成。

- [x] 应用编排左侧改为步骤列表。
- [x] 右侧显示当前步骤详情、输入映射、输出绑定和返回映射。
- [x] 左右区域独立垂直滚动。

## T4 文档同步与浏览器截图

确认状态：部分完成。

- [x] 更新本规格状态文档。
- [ ] 更新用户手册 / 测试用例 / 设计文档中的应用工作台说明。
- [ ] 用“演示”文档截图验证应用工作台展示。

## T5 服务分组与组内接口可用性

确认状态：已完成。

- [x] BDD 场景：服务分组可以命名、折叠、删除，接口可以在组内维护。
- [x] 失败测试：`should let users maintain service groups and interfaces inside the selected group`。
- [x] 服务分组支持名称和说明编辑。
- [x] 服务分组支持折叠 / 展开。
- [x] 服务分组支持删除，删除后接口归入未分组。
- [x] 服务分组内支持新建接口。
- [x] 接口编辑态支持重新选择分组。

## T6 编排参数变量下拉选择

确认状态：已完成。

- [x] BDD 场景：第三个任务可以从前序任务输入/输出中选择输入来源。
- [x] 失败测试：`should choose orchestration mappings from accumulated nested variable options`。
- [x] 右侧维护面板增加参数变量池。
- [x] 输入映射来源、输入目标、输出来源、输出目标、返回来源、返回目标改为下拉选择。
- [x] 变量路径展开 Object、Array、List、Map 的嵌套字段。
- [x] 保留旧 `step.alias.param` 输出路径兼容，新增 `step.alias.output.param` 明确路径。

## 本轮验证

- [x] `npm.cmd test -- --watch=false --include src/app/app.spec.ts`
- [x] `npm.cmd test -- --watch=false`
- [x] `npm.cmd run build`
