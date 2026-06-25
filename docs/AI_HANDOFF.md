# BLM Angular 重构交接文档

更新日期：2026-06-25

本文给接手本项目的另一个 AI 使用。目标不是重新理解全部历史，而是在开始开发前建立正确边界、方法和验证习惯。

## 1. 接手前先读

必须先读这些文件，再判断或修改代码：

- `AGENTS.md`：项目协作偏好、中文优先、注释要求、验证要求。
- `docs/steering/product.md`：产品目标和业务边界。
- `docs/steering/architecture.md`：架构长期约束，尤其是本地优先、文件驱动、数据模型边界。
- `docs/steering/quality.md`：质量目标和默认工程实践。
- `docs/angular-lost-feature-recovery.md`：Angular 迁移中已恢复和未恢复的功能清单。
- `docs/refactor/styles-classification.md`：当前全局样式迁移状态。
- `frontend-angular/src/app/`：当前 Angular 前端源码入口。
- `C:\Users\Administrator\Desktop\project\blm_old`：旧版只作为只读行为参考，不允许把旧 JS 复制回 Angular 项目。

如果任务涉及旧版视觉、交互或行为等价，必须使用：

- `C:\Users\Administrator\.codex\skills\visual-equivalence-migration\SKILL.md`

该技能代表已经确认的迁移方法：先导出旧版样式/DOM/截图证据，再实现 Angular 版本，最后用浏览器验证，而不是凭肉眼猜。

## 2. 当前项目情况

仓库路径：

- 新版 Angular 项目：`C:\Users\Administrator\Desktop\project\blm`
- 旧版参考项目：`C:\Users\Administrator\Desktop\project\blm_old`

运行端口习惯：

- 新版通常运行在 `http://0.0.0.0:8081`
- 旧版通常运行在 `http://0.0.0.0:8086`

当前前端已经是 Angular 重构版。历史上曾有旧版前端代码和过渡壳层，现阶段要求是：

- 不把旧版 `app/*.js` 或旧运行时代码重新引入 Angular 源码。
- 旧版只能作为行为、视觉、数据流参考。
- 新功能和恢复功能应落在 `frontend-angular/src/app` 下的 Angular 模块、服务和组件中。
- `app/` 是 Angular 构建产物目录，不是手写源码目录。

最近完成的方向：

- 主壳层已从 `legacy-shell` 改为 `shell`，组件为 `ShellComponent`。
- 角色管理、全景视图、归档版本、历史记录、使用手册、反馈建议、实时协作等功能已做过多轮恢复和打磨。
- `styles.scss` 已开始拆分：共享变量/按钮/弹窗/滚动框进入 `frontend-angular/src/styles/shared/`，部分工作台样式已迁回各自组件。
- 仍有大量适配器命名带 `Legacy*` 或 `*-legacy-adapter`，这些目前表示“旧数据结构适配”语义，不要机械改名；要改必须先做语义重构。

## 3. 目录结构

核心目录：

- `frontend-angular/src/app/shell/`：Angular 顶层壳层，负责工具栏、文件入口、弹窗、工作台挂载。
- `frontend-angular/src/app/core/`：核心服务、文档模型、同步、协作、壳层公共能力。
- `frontend-angular/src/app/shared/`：跨模块共享 UI 或布局能力。
- `frontend-angular/src/app/workbenches/`：各工作台功能模块。
- `frontend-angular/src/styles/shared/`：全局共享样式层，放变量、基础按钮、表单、弹窗、滚动框等真正公共样式。
- `docs/refactor/`：重构报告和样式分类。
- `specs/`：SDD 规格、任务和状态记录。
- `tools/e2e/`：端到端和视觉对比相关工具。

工作台当前主线：

- 全景工作台：全景视图、角色管理、术语管理、字典管理、规则管理。
- 流程工作台：价值流视图、阶段视图、流程视图、角色视图等流程相关视图。
- 构件工作台：构件、实体关系图、状态图等构件/实体能力。
- 预览/导出：仍是后续迁移重点之一。

## 4. 开发规范

默认沟通和提交：

- 默认中文沟通。
- Git commit message 使用中文。
- 最终说明优先写：改了什么、如何验证、剩余风险。

代码边界：

- 改动保持小而集中。
- 不主动重构无关模块。
- 不修改后端数据模型，除非用户明确同意。
- 文档模型当前以 `uid` 为主，不要为了兼容历史假设重新引入 `id` 兼容路径。
- 查询与修改分离：查询逻辑放 Query/Adapter/Service，修改逻辑集中在 Action/Service/Component 明确入口。
- 上层依赖下层，下层不要反向依赖 UI。
- UI 组件不要承载过多核心业务规则；复杂逻辑应下沉到 core 或 workbench 内部服务。

注释规范：

新增业务逻辑、适配器、复杂 UI 交互需要必要注释，按三层说明：

- 模块意图：这个模块为什么存在。
- 关键流程：数据如何流动，用户动作如何落到状态或 API。
- 边界细节：哪些兼容、同步、数据模型或交互边界不能误改。

样式规范：

- 能放组件 SCSS 的样式，不继续堆到 `styles.scss`。
- 真正公共的按钮、弹窗、输入框、滚动框，放到 `frontend-angular/src/styles/shared/`。
- 不要新增“临时全局选择器”解决局部问题。
- 视觉等价迁移时，先导出旧版样式证据，再调整尺寸、间距、字体和状态。

交互规范：

- 等待态使用公共等待弹窗，不要再出现浏览器原生 prompt/alert 或黑色 toast 大框。
- 删除、清理、覆盖等破坏性动作使用自定义确认框。
- 工具栏按钮、三级 tab、打开编辑按钮保持统一公共样式。
- 用户指出“旧版已有”的能力时，先查旧版代码和历史提交，再判断实现范围。

## 5. 必跑验证

在 `frontend-angular/` 下：

```powershell
npm.cmd test -- --watch=false
npm.cmd run build
```

已知情况：

- `npm.cmd test -- --watch=false` 是当前可靠测试命令。
- `npm.cmd test -- --run` 不适用。
- `npm.cmd run build` 当前可能有 bundle 或 component style budget 警告；只要 exit code 为 0，构建通过。
- 构建会更新根目录 `app/` 产物，提交前需要检查 `git status --short`。

结构或端到端相关任务还应视情况运行：

```powershell
python -m unittest tests.test_frontend_structure
python tools\check_frontend_fragments.py
```

涉及视觉或旧版等价时：

- 对新版和旧版都跑浏览器截图或脚本导出。
- 对比 DOM、计算样式、关键尺寸、滚动条、弹窗层级、按钮位置。
- 不要只凭截图局部感觉改。

## 6. 视觉等价迁移方法

当任务是“复刻旧版”“参考旧版”“对齐旧版比例/样式/UX”时，按这个顺序：

1. 明确功能范围：旧版有哪些入口、状态、按钮、快捷键、空态、加载态、错误态。
2. 在 `blm_old` 中找旧版源码和样式，不只看截图。
3. 使用脚本导出旧版关键元素：
   - 文本、DOM 层级、class。
   - computed style。
   - bounding box。
   - 滚动容器和 z-index。
   - 交互前后状态。
4. 在 Angular 里找到对应模块，优先复用现有公共组件。
5. 实现后跑新版导出，对比差异。
6. 用浏览器手动或脚本验证真实用户旅程。

常见踩坑：

- 弹窗比例容易过大，需对照旧版宽高和内容密度。
- 目录抽屉的折叠按钮、滚动条、右侧内容自适应容易出错。
- 切换工作台不应触发协作重连提示。
- 远端修改、本地未提交、协作在线状态的含义不能混淆。
- 旧版有些代码已经废弃，必须找当前实际运行路径，而不是搜到一个名字就照抄。

## 7. 当前重点风险

样式债务：

- `frontend-angular/src/styles.scss` 仍有全局规则。
- `docs/refactor/styles-classification.md` 最近统计：
  - still-used：628
  - global-shell-or-rendered-content：213
  - suspected-dead：961
- 后续目标可以继续把“仍使用项”归零，但要逐步迁移，不能一次性删除。

命名债务：

- 仍存在 `Legacy*` 和 `*-legacy-adapter`。
- 这些不是壳层旧代码残留，而是当前对旧数据结构/旧行为路径的适配命名。
- 若要清理，先做语义拆分：哪些是“数据适配”、哪些是“运行时过渡”、哪些已无意义。

功能债务：

- 预览/导出仍需要页面级迁移。
- 比对、合并仍需要单独功能迁移。
- 构件工作台还有若干旧版能力未完全等价。
- 字典管理等涉及数据模型的能力需要先确认模型边界。

协作同步风险：

- 立即同步、远端修改提示、本地未提交提示、版本号显示、只读版本打开等是高风险链路。
- 并发场景必须双窗口验证。
- 用户非常关注“另一个窗口是否能看到最新修改”，不能只测单窗口保存。

## 8. 接手准备动作

另一个 AI 在正式开发前建议按顺序做：

1. 确认工作区干净：

```powershell
git status --short
git log --oneline -8
```

2. 确认前端可验证：

```powershell
cd C:\Users\Administrator\Desktop\project\blm\frontend-angular
npm.cmd test -- --watch=false
npm.cmd run build
```

3. 如果任务涉及旧版等价，启动或确认两个版本：

- 新版：`http://0.0.0.0:8081`
- 旧版：`http://0.0.0.0:8086`

4. 先读本次任务相关的 Angular 组件和旧版对应实现。

5. 写下小范围计划：

- 要改哪个模块。
- 旧版证据是什么。
- 新版验证旅程是什么。
- 不碰哪些边界。

6. 修改后再跑测试/构建/浏览器验证。

7. 提交前检查：

```powershell
git diff --stat
git diff --cached --stat
git status --short
```

## 9. 给接手 AI 的工作方式提醒

- 不要急着给方案，先读代码和旧版证据。
- 用户经常通过截图指出视觉和 UX 差距，需要把截图转成可验证的尺寸、状态、滚动和层级问题。
- 如果用户说“这个之前实现过”，先查历史提交和当前 Angular 代码，不要重新发明。
- 如果发现旧版和新版数据模型不一致，先说明差异，不要自行改后端模型。
- 如果要做大改动，先建立或更新 `specs/` 下的 SDD 文档。
- 每次提交前必须验证；不能验证时要明确说明原因。

## 10. 推荐交接提示词

可以把下面这段直接发给另一个 AI：

```text
你接手 C:\Users\Administrator\Desktop\project\blm 的 BLM Angular 重构项目。
请先阅读 docs/AI_HANDOFF.md、AGENTS.md、docs/steering/product.md、docs/steering/architecture.md、docs/steering/quality.md。
如果任务涉及旧版功能或视觉等价，必须使用 C:\Users\Administrator\.codex\skills\visual-equivalence-migration\SKILL.md，并只把 C:\Users\Administrator\Desktop\project\blm_old 作为只读参考。
不要把旧版 JS 引回 Angular 源码；新功能应落在 frontend-angular/src/app 下。
开始前先运行 git status --short，确认工作区状态；实现后至少运行 npm.cmd test -- --watch=false 和 npm.cmd run build。
默认中文沟通，提交信息用中文。
```
