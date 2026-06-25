# CSS/SCSS 三级管理规范

更新日期：2026-06-25

BLM Angular 项目样式分为三层：项目级（Tier 1）、模块级（Tier 2）、组件级（Tier 3）。每一层有明确的职责边界和命名约定。

## 目录

1. [三层架构](#三层架构)
2. [Tier 1 — 项目级](#tier-1--项目级)
3. [Tier 2 — 模块级](#tier-2--模块级)
4. [Tier 3 — 组件级](#tier-3--组件级)
5. [导入与依赖规则](#导入与依赖规则)
6. [命名约定](#命名约定)
7. [废弃样式清理流程](#废弃样式清理流程)
8. [检查工具](#检查工具)

## 三层架构

```
┌──────────────────────────────────────────────────┐
│  Tier 1 — 项目级 (Project)                        │
│  src/styles/                                      │
│  入口：styles.scss  @use './styles/shared/...'     │
│  内容：CSS 变量 · Reset · 全局基础组件样式          │
│  边界：不允许出现工作台特有选择器                    │
│  评审：新增项目级样式需 code review 确认             │
├──────────────────────────────────────────────────┤
│  Tier 2 — 模块级 (Module)                         │
│  src/app/{module}/                                │
│  内容：壳层布局 · 工作台共享组件 · 模块内公共样式    │
│  边界：不跨模块引用                                │
├──────────────────────────────────────────────────┤
│  Tier 3 — 组件级 (Component)                      │
│  与 .ts / .html 同目录                            │
│  内容：单个组件的全部样式                           │
│  边界：不向外暴露选择器供其他组件使用                │
│  默认：新增样式一律先放组件级                       │
└──────────────────────────────────────────────────┘
```

## Tier 1 — 项目级

**目录**：`frontend-angular/src/styles/`

**可以放：**
- CSS 自定义属性（`:root` 变量）
- Reset / normalize
- 全局基础元素样式
- 跨模块复用的 UI 基础类（按钮、弹窗、表单、滚动框）
- 壳层全局布局（toolbar）

**不能放：**
- 任何工作台特有的类名
- 组件内部布局细节
- 仅被单个模块使用的选择器

**目录结构：**
```
src/styles/
├── shared/
│   ├── _variables.scss   # CSS 变量
│   ├── _reset.scss       # reset / 基础元素
│   ├── _scroll.scss      # 工作台通用滚动框
│   ├── _buttons.scss     # 按钮体系
│   ├── _forms.scss       # 表单体系
│   └── _modals.scss      # 弹窗体系
└── styles.scss           # 唯一全局入口
```

**约束：**
- `styles.scss` 自身应尽量只包含 `@use` 指令
- shared/ 每个文件目标不超过 100 行
- 新增 shared/ 文件需要评审说明跨模块复用理由

## Tier 2 — 模块级

**目录**：`frontend-angular/src/app/{module}/`

**可以放：**
- 模块内多个组件共享的布局、变量、mixin
- 壳层公共 UI（sidebar、tab-bar 等子组件共享样式）
- 工作台内跨视图复用的样式

**不能放：**
- 跨模块的选择器
- 全局元素覆盖

**文件约定：**
```
src/app/shell/
├── shell-layout.scss         # 壳层布局（多子组件共用时使用）
├── shell.component.scss      # ShellComponent 专属
└── ...

src/app/workbenches/process/
├── process-shared.scss       # 流程工作台内共享
├── flow/
│   └── process-flow-workbench.component.scss
└── ...
```

**约束：**
- 模块级样式通过 Angular 组件 `styleUrls` 引入
- 不通过 `styles.scss` 全局加载模块级样式
- 模块级文件命名以模块名为前缀

## Tier 3 — 组件级

**目录**：与 `.ts` / `.html` 同目录

**可以放：**
- 该组件的全部样式

**不能放：**
- 其他组件通过类名依赖的选择器（应提升到 Tier 2 或 Tier 1）
- `::ng-deep` 跨组件穿透（覆盖第三方库除外）

**文件约定：**
```
my-feature.component.ts
my-feature.component.html
my-feature.component.scss   # 组件专属样式
```

**约束：**
- 默认使用 Angular `ViewEncapsulation.Emulated`
- 组件样式文件超过 200 行时，检查是否混入了公共样式
- 子样式文件命名为 `<component>-<facet>.scss`

## 导入与依赖规则

```
Tier 1 ──@use──> Tier 1 (shared/*)
Tier 2 ──@use──> Tier 1 (仅 _variables.scss，通过 CSS 变量继承)
Tier 3 ──不导入──> 任何外部样式（通过 CSS 变量继承 Tier 1）
```

- 使用 `@use` 而非 `@import`（Sass 新模块系统）
- Tier 2/Tier 3 不应重复加载 Tier 1 的完整样式
- CSS 自定义属性天然可穿透所有层级，无需额外导入

## 命名约定

### 文件命名

| 层级 | 模式 | 示例 |
|------|------|------|
| Tier 1 shared | `_<feature>.scss`（Sass partial） | `_buttons.scss` |
| Tier 2 模块级 | `<module>-<purpose>.scss` | `process-shared.scss` |
| Tier 3 组件级 | `<name>.component.scss` | `shell.component.scss` |
| Tier 3 子样式 | `<name>-<facet>.scss` | `node-view-v3-cards.scss` |

### 选择器命名

- 项目级：短横线命名，如 `.btn-primary`、`.modal-footer`
- 模块/组件级：模块前缀或 BEM 风格
- 避免 ID 选择器（`#toolbar` 等历史遗留除外，逐步迁移）

### 文件格式

- 全部使用 `.scss`
- 不再新增 `.css` 文件

## 废弃样式清理流程

```
suspected-dead (当前 ~961 条)
  │
  ├─ 工具检查：选择器是否被 Angular 模板/TS/SCSS 引用？
  │
  ├─ 未引用 + 无渲染证据 → confirmed-dead → 小批删除（≤50条/次）
  │
  ├─ 未引用 + 壳层/弹窗/文档渲染相关 → global-shell（保留观察）
  │
  └─ 已确认引用 → 更正分类为 still-used
```

每次清理步骤：
1. 选择 ≤50 条 suspected-dead 选择器
2. `grep` 全项目确认无引用
3. 从 `styles.scss` 删除
4. `npm.cmd run build`
5. 浏览器验证关键页面
6. 更新 `styles-classification.csv`

## 检查工具

运行样式分层检查：
```powershell
python tools/check_style_tiers.py
```

检查项：
1. `styles.scss` 是否仅包含 `@use` 指令
2. shared/ 中是否混入工作台选择器
3. `styles.scss` 行数趋势
4. 疑似废弃选择器计数和清单
