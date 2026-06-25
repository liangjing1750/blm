# 任务拆分：CSS/SCSS 三级管理规范

更新日期：2026-06-25

## Task 1：创建面向开发人员的规范文档

**文件**：`docs/refactor/css-scss-tiered-spec.md`

**职责**：将设计决策写成可查阅的规范文档。
**不负责**：不包含具体代码实现。
**输入**：`specs/008-css-scss-tiered-specification/design.md`
**输出**：可供团队成员查阅的 markdown 规范文档。

**内容纲要**：
1. 三层架构说明
2. 每层可以放什么/不能放什么
3. 目录结构约定
4. 文件命名约定
5. 导入规则
6. 废弃样式清理流程
7. 检查脚本用法

**验证**：文档存在且内容完整。

---

## Task 2：拆分 shared/_base.scss

**改动文件**：
- `src/styles/shared/_variables.scss`（新建）— 纯 CSS 变量
- `src/styles/shared/_reset.scss`（新建）— reset 和基础元素
- `src/styles/shared/_scroll.scss`（新建）— 工作台滚动框
- `src/styles/shared/_base.scss`（删除）
- `src/styles.scss`（修改）— 更新 @use 列表

**职责**：将当前 `_base.scss`（58 行混合内容）拆为三个职责清晰的文件。
**不负责**：不修改变量值或样式规则。

**拆分映射**：
```
_base.scss 第 1-25 行  → _variables.scss  (CSS 变量)
_base.scss 第 27-31 行 → _reset.scss      (reset / body)
_base.scss 第 33-57 行 → _scroll.scss     (滚动框)
```

**验证**：构建通过 + 浏览器页面外观无变化。

---

## Task 3：统一 styles.scss 入口

**文件**：`src/styles.scss`

**职责**：将 `styles.scss` 改为纯 `@use` 入口文件，将仍在使用中的全局选择器规则组织为 shared/ partials。
**不负责**：不删除任何 still-used 选择器。

**步骤**：
1. 将 `styles.scss` 已有的 628 条 still-used 选择器按主题分组
2. 新建对应的 shared/ partial 文件
3. `styles.scss` 中仅保留 `@use` 指令

**分组方案**：
| 分组 | 新文件 | 内容 |
|------|--------|------|
| 壳层/工具栏 | `shared/_shell.scss` | #toolbar, .toolbar-*, .brand-mark, .logo, .file-name, .collab-status |
| 修改徽章 | `shared/_badges.scss` | .modified-badge, .modified-badge-row, .modified-badge-dot |
| 侧边栏/目录 | `shared/_sidebar.scss` | .sidebar-*, .directory-*, .doc-tree-* |
| 表格 | `shared/_tables.scss` | .data-table, .table-* |
| 工作台通用 | `shared/_workbench.scss` | .workbench-*（通用部分） |

**约束**：
- 每个新 partial 不超过 200 行，若原规则过多，优先把组件专属样式迁回组件 SCSS
- 所有迁移保持样式规则原文不变

**验证**：构建通过 + `npm.cmd test` 通过 + 浏览器关键页面无变化。

---

## Task 4：统一文件命名和格式

**职责**：将项目中所有 `.css` 文件重命名为 `.scss`，统一文件格式。
**不负责**：不改变文件内容。

**改动**：
- `src/app/app.css` → `src/app/app.scss`
- `src/app/shared/layout/workbench-section.css` → `src/app/shared/layout/workbench-section.scss`
- 更新所有引用这些文件的 TypeScript `styleUrls`

**验证**：构建通过 + 测试通过。

---

## Task 5：新增检查脚本

**文件**：`tools/check_style_tiers.py`

**职责**：自动化检测样式分层违规。
**不负责**：不自动修改文件。

**检测项**：
1. `styles.scss` 中是否包含 @use/@import 以外的新增规则
2. shared/ 文件中是否出现工作台特有选择器
3. `styles.scss` 总行数趋势（与基线对比）
4. 列出所有疑似废弃选择器供人工清理

**输出格式**：
```
[PASS] styles.scss is @use-only (no inline rules)
[WARN] shared/_shell.scss: .panorama-tab looks like workbench-specific
[INFO] styles.scss line count: 50 (baseline: 50)
[INFO] suspected-dead selectors: 961
```

**验证**：脚本可运行且输出符合预期。

---

## Task 6：第一轮废弃样式清理

**职责**：从 961 条 suspected-dead 中安全删除第一小批（≤50 条），建立清理 SOP。
**不负责**：不全量清理 961 条。

**流程**：
1. 从 CSV 取前 50 条 suspected-dead
2. grep 确认无任何 Angular 引用
3. 从 `styles.scss` 中删除
4. 构建 + 浏览器验证

**验证**：构建通过 + 关键页面无异常。
