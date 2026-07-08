# Fix: 用户身份修复

## 需求

1. 左上角工具栏显示当前用户名，可点击修改
2. 未设置时显示"未设置用户"（橙色高亮），而非 "agent"
3. 历史提交记录显示正确的用户名
4. 兼容旧版 `blm.user.profile` 存储格式

## 根因

- `CollaborationService.loadProfile()` 第 281 行：`localStorage.getItem(nameKey) || 'agent'`
- Angular Shell 无用户设置 UI
- 新旧 localStorage 键不互通：旧版用 `blm.user.profile`（JSON），新版用 `blm.collab.userName`（string）

## 概要设计

| 模块 | 改动 |
|------|------|
| `collaboration.service.ts` | 增加 `setUserName()`、旧数据迁移、名称规范化 |
| `shell.component.ts` | 增加 `'user-settings'` Modal、用户按钮逻辑 |
| `shell.component.html` | 工具栏用户按钮 + 用户设置弹窗 |
| `shell.component.scss` | 用户按钮样式（复用旧版 CSS） |

## 涉及文件

1. `frontend-angular/src/app/core/collaboration/collaboration.service.ts`
2. `frontend-angular/src/app/shell/shell.component.ts`
3. `frontend-angular/src/app/shell/shell.component.html`
4. `frontend-angular/src/app/shell/shell.component.scss`
