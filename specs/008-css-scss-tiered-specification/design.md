# 概要设计：CSS/SCSS 三级管理规范

更新日期：2026-06-25

## 1. 模块归属

```
基础设施 / 跨工作台
```

本规范不是 UI 功能模块，而是作用于整个 `frontend-angular/src/` 的样式工程约定。

## 2. 三层架构

```
┌──────────────────────────────────────────────────┐
│  Tier 1 — 项目级 (Project)                        │
│  src/styles/                                      │
│  入口：styles.scss  @use './styles/shared/...'     │
│  内容：CSS 变量 · Reset · 全局基础组件样式          │
│  边界：不允许出现工作台特有选择器                    │
│  评审：新增项目级样式需要 code review 确认          │
├──────────────────────────────────────────────────┤
│  Tier 2 — 模块级 (Module)                         │
│  src/app/{module}/                                │
│  内容：shell 布局 · 工作台共享组件 · 模块内公共样式  │
│  边界：不跨模块引用                                │
│  示例：shell/shell-layout.scss                     │
│        workbenches/process/process-shared.scss     │
├──────────────────────────────────────────────────┤
│  Tier 3 — 组件级 (Component)                      │
│  与 .ts / .html 同目录                            │
│  内容：单个组件的全部样式                           │
│  边界：不向外暴露选择器供其他组件使用                │
│  默认：新增样式一律先放组件级                       │
└──────────────────────────────────────────────────┘
```

## 3. 各级职责

### 3.1 Tier 1 — 项目级 `src/styles/`

**可以放：**
- CSS 自定义属性（`:root` 变量）
- Reset / normalize
- 全局基础元素样式（`body`, `*`, `input`, `button` 基类）
- 跨模块复用的 UI 基础类（`.btn`, `.modal`, `.form-grid`, `.workbench-scroll-frame`）
- 壳层全局布局（`#toolbar`）— 因为 toolbar 是 AppComponent 的一部分

**不能放：**
- 任何工作台特有的类名（如 `.panorama-*`, `.process-flow-*`）
- 组件内部布局细节
- 仅被单个模块使用的选择器

**目录结构：**
```
src/styles/
├── shared/
│   ├── _variables.scss   # 仅 CSS 变量（从 _base.scss 拆出）
│   ├── _reset.scss       # reset / 基础元素
│   ├── _scroll.scss      # 滚动框（从 _base.scss 拆出）
│   ├── _buttons.scss     # 按钮体系
│   ├── _forms.scss       # 表单体系
│   └── _modals.scss      # 弹窗体系
└── styles.scss           # 唯一全局入口，仅包含 @use 指令
```

**约束：**
- `styles.scss` 自身不应包含任何选择器规则，只做 `@use` 导入
- shared/ 每个文件不超过 100 行（目标）
- 新增 shared/ 文件需要评审

### 3.2 Tier 2 — 模块级

**可以放：**
- 模块内多个组件共享的布局、变量、mixin
- 壳层公共 UI（sidebar、tab-bar、toolbar 子组件共享样式）
- 工作台内跨视图复用的样式（如 `process-flow-*` 系列）

**不能放：**
- 跨模块的选择器
- 全局元素覆盖

**文件约定：**
```
src/app/shell/
├── shell-layout.scss         # 壳层布局（若多个 shell 子组件共用）
├── shell.component.scss      # ShellComponent 专属
└── ...

src/app/workbenches/process/
├── process-shared.scss       # 流程工作台内共享
├── flow/
│   └── process-flow-workbench.component.scss
└── ...
```

**约束：**
- 模块级样式文件通过 Angular 组件的 `styleUrls` 或 `@use` 引入
- 不通过 `styles.scss` 全局加载模块级样式
- 模块级文件命名以模块名为前缀（如 `process-`, `panorama-`）

### 3.3 Tier 3 — 组件级

**可以放：**
- 该组件的全部样式

**不能放：**
- 其他组件通过类名依赖的选择器（应提升到 Tier 2 或 Tier 1）
- `::ng-deep` 跨组件穿透（除非是确有必要覆盖第三方库）

**文件约定：**
```
my-feature.component.ts
my-feature.component.html
my-feature.component.scss   # 组件专属样式
```

**约束：**
- 默认使用 Angular `ViewEncapsulation.Emulated`（或不设置，即默认）
- 当组件样式文件超过 200 行时，考虑拆分或检查是否混入了公共样式

## 4. 导入与依赖规则

```
Tier 1 ──@use──> Tier 1 (shared/*)
Tier 2 ──@use──> Tier 1 (仅 _variables.scss)
Tier 3 ──不导入──> 任何外部样式（通过 CSS 变量继承 Tier 1）
```

- Tier 2 通过 `@use '../styles/shared/variables'` 引用变量
- Tier 3 组件通过 CSS 自定义属性继承项目级变量，**不需要** `@use` 导入
- Tier 2/Tier 3 **不**通过 `@import` 引用 Tier 1 的完整样式（避免重复打包）

## 5. 命名约定

### 5.1 文件命名

| 层级 | 命名 | 示例 |
|------|------|------|
| Tier 1 shared | `_<feature>.scss`（Sass partial） | `_buttons.scss` |
| Tier 2 模块级 | `<module>-<purpose>.scss` | `process-shared.scss` |
| Tier 3 组件级 | `<component-name>.component.scss` | `shell.component.scss` |
| Tier 3 子样式 | `<component-name>-<facet>.scss` | `node-view-v3-cards.scss` |

### 5.2 选择器命名

- 项目级：短横线命名，如 `.btn-primary`, `.modal-footer`
- 模块级/组件级：沿用 BEM 风格或 `模块前缀-元素` 约定
- 不使用 ID 选择器（除 `#toolbar` 等壳层历史遗留）

### 5.3 文件格式

- 全部使用 `.scss`，不再新增 `.css` 文件
- 现有 `.css` 文件逐步迁移为 `.scss`

## 6. 废弃样式清理流程

```
suspected-dead (961 条)
  │
  ├──→ 工具自动检查：选择器是否被 Angular 模板/TS/SCSS 引用
  │
  ├──→ 未引用 + 无全局渲染证据 → 标记为 confirmed-dead
  │
  ├──→ 未引用 + 属于壳层/弹窗/文档渲染 → 标记为 global-shell（保留观察）
  │
  └──→ 删除 confirmed-dead → 构建 → 浏览器关键页面冒烟
```

清理原则：
- 每次删除不超过 50 条选择器（小批安全删除）
- 每次删除后跑 `npm.cmd run build` + 浏览器验证
- 删除后更新 `styles-classification.csv`

## 7. 验证策略

| 验证层 | 手段 | 频率 |
|--------|------|------|
| 文件级 | 检查脚本统计全局样式行数和分类 | 每次 PR |
| 构建 | `npm.cmd run build` exit code 0 | 每次改动 |
| 测试 | `npm.cmd test -- --watch=false` | 每次改动 |
| 浏览器 | 关键页面截图对比 | 删除废弃样式后 |
| 结构 | `python tools/check_frontend_fragments.py` | 必要时 |

## 8. 主入口

- 开发人员查阅：`docs/refactor/css-scss-tiered-spec.md`（将生成）
- 检查脚本：`tools/check_style_tiers.py`（将新增）
- 样式分类报告：`docs/refactor/styles-classification.csv`（已有）
