# Tasks

## 执行规则

- 每次只推进一个任务。
- 每个任务开始前，先向用户确认修改范围、测试方式和验收标准。
- 用户确认后，按 TDD 或最小可验证方式开发。
- 开发完成后，先运行验证，再交给用户验收。
- 用户验收通过后，提交代码，再讨论下一个任务。

## T0 建立 v3 工作台 SDD 规格

- [x] 新建 `specs/007-blm-v3-workbench-planning`。
- [x] 写入 `requirements.md`。
- [x] 写入 `design.md`。
- [x] 写入 `tasks.md`。
- [x] 写入 `status.md`。
- [x] 用户确认 T0 规格可作为后续开发基线。

## T1 工作台导航与角色边界

确认状态：已开发，待用户验收。

修改范围：

- [x] 修改前端导航、工作台入口文案、结构测试。
- [x] 不改后端数据模型。
- [x] 不实现权限控制。

目标：

- [x] 5 类角色各有一个主要工作台。
- [x] 4 个工作台入口清晰：全景工作台、流程工作台、构件工作台、应用编排台。
- [x] 旧的误导性术语不作为应用编排台主入口展示。

测试思路：

- [x] 先补静态结构测试，验证主入口和关键角色边界文案。
- [x] 再做最小 UI 调整。
- [x] 定向测试通过：`python -m unittest tests.test_frontend_structure.FrontendStructureTests.test_role_workbench_layout_uses_responsibility_oriented_navigation`。
- [x] 用户验收通过后提交代码。

## T2 全景工作台整合视图

确认状态：已开发，待用户验收。

修改范围：

- [x] 涉及全景工作台前端展示。
- [x] 优先复用现有战略、价值流矩阵、业务组件数据和页面。
- [x] 不新增复杂画布编辑器。

目标：

- [x] 全景工作台按一张完整业务全景图展示：上层战略，中层价值与业务域矩阵，下层业务能力组件。
- [x] 价值流矩阵使用现有价值流、业务域和阶段数据。
- [x] 矩阵方向保持横向价值流、纵向业务域，单元格展示阶段。
- [x] 矩阵左上角用“业务域 / 价值流”水平斜线表头表达坐标关系。
- [x] 阶段卡片展示关联流程数量。
- [x] 点击业务能力组件后，仅将其支撑阶段高亮为橘色，不再展示冗余连线。
- [x] 全景图支持进入页面自动一屏自适应，并支持鼠标滚轮缩放。
- [x] 业务能力组件按核心、通用两层展示，核心在上、通用在下。
- [x] 业务能力组件卡片内展示关联构件，提升下层业务组件的分量感。
- [x] 文档信息从全景工作台移出，改为文件菜单下的“属性”弹窗。

测试思路：

- [x] 静态测试覆盖完整全景图、矩阵阶段单元、组件节点和支撑关系。
- [x] 静态测试覆盖价值流轴、业务域轴、阶段名称和流程数量。
- [x] 静态测试覆盖斜线表头、缩放入口、核心/通用分层、组件构件展示，并确认不再出现支撑连线。
- [x] 浏览器冒烟验证全景图可自适应、滚轮缩放、组件点击后阶段高亮。
- [x] 空数据场景应有清晰提示。
- [x] 定向测试通过：`python -m unittest tests.test_frontend_structure.FrontendStructureTests.test_panorama_workbench_groups_strategy_matrix_and_components`。
- [x] 定向测试通过：`python -m unittest tests.test_frontend_structure.FrontendStructureTests.test_file_menu_exposes_document_properties_modal`。
- [x] 用户要求完成 4 个小优化后提交代码。

## T2-R 前端按工作台重构

确认状态：已开发，待用户验收。

修改范围：

- [x] 建立 `core`、`shared`、`workbenches` 三层前端目录。
- [x] 按主工作台拆出全景、流程、构件、应用编排、实体、知识类 facade。
- [x] 全景工作台拆出独立视图模型和渲染模块。
- [x] 应用编排台拆出独立工作台模块。
- [x] 保持普通 `<script>` 加载，不切 ES Modules。
- [x] 不改后端数据模型。

目标：

- [x] 上层到下层单向依赖。
- [x] 同层工作台之间不直接依赖。
- [x] 后续修改全景和应用编排时，不再继续扩大 `domain.js`。
- [x] 流程、构件、实体先通过 facade 隔离入口，后续再逐步搬迁内部实现。

测试思路：

- [x] 架构测试覆盖目标目录、脚本加载、工作台同层隔离、视图模型不访问 DOM。
- [x] 定向测试通过：`python -m unittest tests.test_frontend_structure.FrontendStructureTests.test_workbench_target_architecture_boundaries`。
- [x] 定向测试通过：`python -m unittest tests.test_frontend_structure.FrontendStructureTests.test_split_scripts_exist tests.test_frontend_structure.FrontendStructureTests.test_split_scripts_pass_node_syntax_check tests.test_frontend_structure.FrontendStructureTests.test_workbench_target_architecture_boundaries`。
- [x] 用户要求完成 4 个小优化后提交代码。

## T3 流程工作台概念实体 UX

确认状态：待用户确认。

修改范围：

- 预计涉及流程节点、用户步骤、表单、实体展示区域。
- 优先复用现有 `entities`、forms、attachments。
- 不新增完整页面模型。

目标：

- 概念实体贴着流程、用户步骤、表单、原型说明展示。
- 产品经理只维护名称、业务含义和来源说明。
- 明确“界面不等于表单”。

测试思路：

- 先写结构测试或用户旅程验证概念实体入口。
- 验证字段、状态、关系不出现在产品经理主流程中。

## T4 构件工作台弱参考承接

确认状态：待用户确认。

修改范围：

- 预计涉及构件工作台、实体设计、任务定义展示。
- 优先复用现有实体和任务定义。
- 第一版按概念实体与逻辑实体一一对应展示，不扩展一对多关系。

目标：

- 构件工作台可以看到流程参考。
- 概念实体与逻辑实体边界清楚。
- 逻辑实体接近表结构，由后端研发维护。

测试思路：

- 测试概念实体、逻辑实体文案和边界。
- 测试空参考或无绑定时页面仍可正常展示。

## T5 应用编排工作台接口链路

确认状态：待用户确认。

修改范围：

- 预计涉及应用编排工作台前端展示和轻量数据承接。
- 不实现流程运行引擎。
- 不引入“应用服务场景”作为显性概念。

目标：

- 以页面/原型引用、用户步骤、操作入口、前端接口需求、后端任务链路为主线。
- 一个前端接口需求可以编排一组后端任务。
- 后端任务链路引用构件工作台任务定义。

测试思路：

- 先写用户旅程或结构测试验证链路展示。
- 验证“应用服务场景”“技术承接”不作为主入口出现。

## T6 AI 方法引导

确认状态：后置任务，待工作台边界稳定后再讨论。

目标：

- AI 助手按当前工作台给出 EA 方法提示。
- 先做提示和检查，不做自动改模型。
