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

## T3-R 角色管理与角色视图工作台重构

确认状态：已开发，待用户验收。

修改范围：
- [x] 新增独立角色工作台模块 `app/workbenches/role/role-workbench.js`。
- [x] 将角色管理渲染和角色视图跳转入口从 `domain.js` 迁入角色工作台模块。
- [x] 将角色用例图和流程角色视图渲染主体从 `process.js` 迁入角色工作台模块。
- [x] 将角色新增、删除、分组输入、业务域过滤、摘要统计、角色视图流程分组逻辑集中到角色工作台模块。
- [x] 旧 `domain.js`、`process.js` 不再定义角色管理和角色视图主体函数，只保留进入角色工作台的调用点。
- [x] 不改后端数据模型，不新增角色数据结构。

目标：
- [x] 点击角色管理中的角色或“角色视图”按钮，可以切到流程工作台的角色视图。
- [x] 角色管理与角色用例后续融合只能在角色工作台模块内推进，不继续扩大 `domain.js` 和 `process.js`。
- [x] 融合方向采用“横向角色管理 + 竖向角色用例”的联动结构，不强行合成一张图。

测试思路：
- [x] 结构测试覆盖角色工作台脚本加载、入口状态切换、旧文件无角色管理/角色视图主体函数。
- [x] 浏览器冒烟验证点击角色卡片后进入流程工作台角色视图。
- [x] 通过 `node --check` 和前端片段检查。

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
## T3-R2 工作台聚合根收敛

确认状态：已开发，待用户验收。

修改范围：
- [x] 将 `process.js` 主体迁入 `app/workbenches/process/process-legacy.js`，旧文件只保留兼容加载槽。
- [x] 将 `domain.js` 中仍承载的构件相关旧实现迁入 `app/workbenches/component/component-legacy.js`，旧文件只保留兼容加载槽。
- [x] 将 `entity.js` 主体迁入 `app/workbenches/entity/entity-legacy.js`，旧文件只保留兼容加载槽。
- [x] 保持普通 `<script>` 加载，不切 ES Modules。
- [x] 不改后端数据模型，不迁移文件管理、协作、预览、AI。

目标：
- [x] 旧大文件不再作为已迁移工作台的事实实现位置。
- [x] 聚合根目录成为后续拆分和小功能修改的唯一落点。
- [x] 结构测试约束旧大文件不得重新出现已迁移工作台主体函数。

测试思路：
- [x] `python -m unittest tests.test_frontend_structure`
- [x] `python tools\check_frontend_fragments.py`
- [x] 全量 `node --check app/**/*.js`
- [x] Playwright 浏览器冒烟：确认聚合根入口加载、可调用，主要工作台无 JS 错误。

## T7 Angular 一次性迁移

确认状态：已开发，待用户验收。

修改范围：
- [x] 提交旧前端聚合根基线。
- [x] 新增 Angular + TypeScript 前端工程。
- [x] 建立 BLM 文档模型与关键算法单元测试。
- [x] 建立 7 个工作台组件和路由。
- [x] 用 Angular 构建产物替换 `app/` 旧静态前端。
- [x] 后端补 SPA fallback，支持 Angular 子路由刷新。
- [x] 更新前端结构测试到 Angular 架构守卫。

验收标准：
- [x] `python -m unittest tests.test_frontend_structure`
- [x] `npm.cmd test`
- [x] `npm.cmd run build`
- [x] 浏览器冒烟：主页、工作台导航、`/process` 子路由刷新。

## T7-B Angular legacy 等价迁移层

确认状态：已开发，待用户验收。

修改范围：
- [x] 从 `4b794d3` 抽取旧前端 HTML/CSS/JS/vendor。
- [x] 新增 `frontend-angular/src/app/legacy-shell/`，用 Angular component 承载旧页面主体。
- [x] 新增 `frontend-angular/src/app/legacy-runtime/`，声明旧脚本加载顺序和启动逻辑。
- [x] 将旧运行时文件作为 Angular public assets 输出到 `app/legacy-runtime/`。
- [x] 将旧 CSS 合并为全局 `src/styles.scss`。
- [x] 将工作台路由统一指向 legacy shell，保证刷新子路由仍进入旧等价界面。

验收标准：
- [x] `npm.cmd test`
- [x] `npm.cmd run build`
- [x] `python -m unittest tests.test_frontend_structure`
- [x] HTTP 冒烟：`/`、`/process`、`/role`、`/entity`、`/component`、`/orchestration`、`/knowledge`、legacy runtime 和 vendor 资源均可访问。

后续规范化方向：
- [ ] 为旧版 Oracle 和 Angular legacy port 增加截图 diff。
- [ ] 逐步把 `legacy-runtime` 中的全局函数、inline handler、手写 DOM 拆到 Angular component/service/model。

补充验收：
- [x] `tools/e2e` Playwright 工具链可用，不迁移到根目录。
- [x] `npm.cmd run test:e2e -- tests/angular-legacy-port.spec.js`
- [x] 浏览器级验证旧 toolbar、文件菜单、打开文档后的工作台 tab、legacy 全局对象和 Angular 子路由 fallback。

## T8/T9 Angular 整洁架构地基

确认状态：已开发，待用户验收。

修改范围：
- [x] 新增 `LegacyBridge`，统一管理 legacy runtime 加载、旧全局对象访问、旧主 tab 切换。
- [x] `legacy-shell` 改为过渡壳，只调用 bridge，不直接访问 `window.App/window.S`。
- [x] 新增工作台迁移状态表，记录 `legacy | hybrid | angular`。
- [x] 新增结构测试约束 Angular 新代码边界。
- [x] 新增 4 个主工作台 Playwright smoke 场景。

验收标准：
- [x] `npm.cmd test`
- [x] `npm.cmd run build`
- [x] `python -m unittest tests.test_frontend_structure tests.test_project_layout`
- [x] `cd tools/e2e; npm.cmd run test:e2e -- tests/angular-legacy-port.spec.js`
