# Status

## 2026-06-11

### 本轮完成

- 根据 `docs/BLM v3版本思考.html` 建立 v3 工作台 SDD 规格。
- 明确产品定位、角色主工作台、工作台边界、实体边界、界面与表单边界、构件弱参考、应用编排主线。
- 将后续开发拆为 T1 到 T6，并标注每个任务都需要用户确认后才能开始。
- T1 已按确认范围完成最小实现：主导航改为“应用编排台”，应用编排台收敛为页面与原型引用、前端接口需求、接口后的后端任务链路，流程工作台说明补充“界面不等于表单”。
- T2 根据验收反馈完成调整：全景工作台改为一张完整业务全景图，上层战略，中层价值与业务域矩阵，下层业务能力组件；矩阵保持横向价值流、纵向业务域，左上角用“业务域 / 价值流”斜线表头；单元格展示阶段和流程数量；点击业务能力组件仅橘色高亮支撑阶段；业务能力组件按核心、通用两层展示，并在组件卡片内展示关联构件；文档信息移到文件菜单下的“属性”弹窗。
- T2-R 按目标模式完成前端工作台重构：新增 `core`、`shared`、`workbenches` 目录；全景和应用编排台已迁出独立模块；流程、构件、实体先通过 facade 隔离入口。
- T3-R 已完成进一步收敛：`workbenches/role/role-workbench.js` 集中承接角色新增、删除、分组输入、业务域过滤、摘要统计、角色管理渲染、角色视图入口、角色用例图、流程角色视图和角色视图流程分组逻辑；`domain.js`、`process.js` 不再定义角色管理和角色视图主体函数，只保留调用角色工作台的入口。

### 当前状态

- T0 规格文档已建立。
- 用户已确认 T0 可作为后续开发基线。
- 第一版实体策略已调整为：概念实体与逻辑实体先按一一对应处理。
- 已修改 T1 范围内的产品代码。
- T1 定向测试通过。
- 用户已要求提交，T1 已提交。
- T2 与 T2-R 定向测试、静态片段检查和浏览器冒烟验证通过。
- 用户已要求完成 4 个小优化后提交代码，本轮准备提交。
- `docs/BLM v3版本思考.html` 仍是未跟踪文件，是本规格的重要方案输入。

### 下一步

- 等用户验收 T3-R 角色工作台重构。
- 验收通过后，可继续在角色工作台模块内做融合视图：上方横向角色管理，下方竖向角色用例。
- T3-R 角色融合视图稳定后，再讨论 T3：流程工作台概念实体 UX。
- T3 开始前，需要再次确认修改范围、测试方式和验收标准。

### 风险与备注

- 当前方案强调少改后端模型，后续如果发现现有数据无法表达前端接口需求或任务链路，需要单独拆任务确认。
- “界面不等于表单”当前先由原型附件、页面说明和操作入口表达，不急着新增页面模型。
- 构件工作台承接流程产物采用弱参考，避免过早形成强绑定。
- 本轮重构先完成工作台入口和全景/应用编排迁移；`process.js`、`entity.js` 内部仍较大，但已通过 facade 隔离主入口，后续可在各工作台内继续收敛。
- 角色管理和角色视图主体已迁入 `workbenches/role/role-workbench.js`；后续融合视图应继续在该模块内推进，旧 `domain.js` 与 `process.js` 只保留调用点。
- 完整 `tests.test_frontend_structure` 仍有 3 个既有失败，失败点与本次 T1 改动无关；T1 定向测试已通过。

### 交接提示

- 下一位工程师先读 `docs/BLM v3版本思考.html`，再读本目录下 `requirements.md`、`design.md`、`tasks.md`。
- 不要跳过用户确认直接开发 T1。
### T3-R2 工作台聚合根收敛

- 已将 `process.js`、`domain.js`、`entity.js` 从事实实现文件降为兼容加载槽。
- 已新增 `process-legacy.js`、`component-legacy.js`、`entity-legacy.js`，把旧实现物理迁入对应聚合目录。
- 已更新 `index.html` 脚本顺序，让聚合内部实现先加载，聚合根再对外暴露入口，旧文件只保留兼容位置。
- 已补结构守卫测试：旧大文件不得重新出现已迁移工作台主体函数，聚合根文件必须存在并被加载。
- 验证已通过：`python -m unittest tests.test_frontend_structure`、`python tools\check_frontend_fragments.py`、全量 `node --check app/**/*.js`、Playwright 聚合入口冒烟。
- 剩余风险：这是“一次性物理归位 + 兼容入口”重构，尚未把各聚合内部继续拆成 queries/views/actions/model；后续小功能应在对应聚合目录内继续沉淀，不能回写旧大文件。

### Angular 一次性迁移

- 已在提交 `4b794d3` 保存旧前端聚合根基线。
- 已新增 `frontend-angular/`，使用 Angular 21、TypeScript、Angular Router、Angular Forms 和 Vitest。
- 已建立 TypeScript 文档模型、规范化算法和单元测试，覆盖阶段流程引用、uid/id 查找、角色使用、构件支撑阶段等关键关系。
- 已建立 7 个 Angular 工作台组件：全景、流程、构件、应用编排、实体、知识、角色。
- 已将 `app/` 替换为 Angular 构建产物，旧手写 JS/CSS/workbenches/vendor 前端文件已删除。
- 已为后端静态服务增加 SPA fallback，支持刷新 `/process` 等 Angular 子路由。
- 已更新 `tests.test_frontend_structure`，新的结构守卫检查 Angular 工程、模板分离、旧前端源文件退场、Angular 构建产物和单元测试。
- 当前剩余风险：这是 Angular 架构和核心模型迁移，旧前端的大量交互细节尚未逐项功能等价迁回；后续应继续在 Angular 组件、服务和模型中补齐，而不是恢复旧 JS。

### T7-B Angular legacy 等价迁移层
- 已将上一版 Angular 新骨架调整为 legacy port：Angular 负责启动壳、路由和构建，旧界面主体由 `legacy-shell.component.html` 承载。
- 已从基线 `4b794d3` 抽取旧 `index.html` 的 body、`style.css`、`ai.css`、旧 JS 和 vendor 文件。
- 旧 CSS 合并到 `frontend-angular/src/styles.scss`，旧 JS 作为 Angular public assets 输出到 `app/legacy-runtime/`，由 `legacy-runtime.bootstrap.ts` 按旧 script 顺序加载。
- `app/` 仍只作为构建产物目录；旧手写前端源码不再直接放在 `app/` 根目录运行。
- 验证已通过：`npm.cmd test`、`npm.cmd run build`、`python -m unittest tests.test_frontend_structure`、HTTP 冒烟检查 `/`、各工作台子路由、legacy runtime 和 vendor 资源均返回 200。
- 剩余风险：本轮未完成像素级截图 diff；浏览器点击级冒烟受当前环境缺少 Playwright 包限制，暂以构建、单测、结构测试和 HTTP 资源检查兜底。

### T7-C Playwright legacy port 冒烟补充
- 已复用 `tools/e2e` 中现有 Playwright 工具链，没有迁移到项目根目录；`tests.test_project_layout` 仍约束 e2e 工具留在 `tools/e2e/`。
- 已修正 `tools/e2e/playwright.config.js`：Windows 下不再依赖缺失的 `py` launcher，统一使用 `python blm.py`；e2e workspace 改为每次运行唯一目录，避免固定目录被锁导致 `EPERM`。
- 已新增 `tools/e2e/tests/angular-legacy-port.spec.js`，覆盖 Angular legacy port 的浏览器级冒烟：旧 toolbar、文件菜单、打开文档后的工作台 tab、`window.App/window.S/window.AI`、以及 Angular 子路由刷新回旧 shell。
- 已新增 `legacy-runtime/bootstrap-init.js`，解决旧 `DOMContentLoaded` 初始化在 Angular 动态加载脚本时被错过的问题，并显式暴露 `window.S`、`window.App`、`window.AI`。
- 验证已通过：`npm.cmd run test:e2e -- tests/angular-legacy-port.spec.js`、`npm.cmd test`、`npm.cmd run build`、`python -m unittest tests.test_frontend_structure tests.test_project_layout`、后端 3 项定向测试。

### T8/T9 Angular 整洁架构地基
- 已新增 `LegacyBridge`，由 `legacy-shell` 统一通过桥接服务加载旧运行时、访问旧全局对象和执行 legacy 初始化；`legacy-shell` 本身标记为 `TRANSITION_SHELL`。
- 已新增工作台迁移状态表，当前 7 个工作台均标记为 `legacy`，作为后续 `hybrid`、`angular` 迁移记录的单一来源。
- 已补结构守卫：legacy shell 不再直接访问 `window.App/window.S`，新增 Angular 代码不得在 legacy 过渡边界外使用 `innerHTML`、`onclick=`、`document.getElementById`。
- 已补 Playwright 主工作台 smoke：创建并打开文档后，验证全景、流程、构件、应用编排 4 个主 tab 可激活且内容区域可见。
- 发现并记录现状：`constructWorkbench` 在 legacy 基线中当前渲染更接近实体设计视图，本轮不修产品行为，只用 smoke 守住可见性和入口不回退。
