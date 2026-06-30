# 设计

## 模块归属

- `frontend-angular/src/app/shell/shell.component.ts`
- `frontend-angular/src/app/shell/shell.component.html`
- `frontend-angular/src/app/app.spec.ts`

## 概要设计

- 保留壳层比对弹窗入口，不新增后端接口。
- 新增左侧状态：`compareLeftName`、`compareLeftSource`、`compareLeftVersionId`、`compareLeftVersions`。
- 左侧文档名默认等于当前打开文档；本轮不开放左侧文档下拉，先恢复左侧“来源”而不是重做双侧文档选择器。
- 抽出通用加载函数，按 `current/version/history/submit` 统一加载左侧和右侧文档。
- 抽出通用来源选项刷新函数，避免右侧已有逻辑继续分叉。

## 边界

- 不修改文档 JSON 模型。
- 不复制旧版 `app.js` 的 HTML 字符串和状态机。
- 不改比对结果展示结构；完整旧版差异报表另起切片。
