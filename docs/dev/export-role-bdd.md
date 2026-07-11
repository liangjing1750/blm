# 角色导出 BDD 场景

## Feature: 从角色管理导出 DOCX

### Scenario A1: 金路径 — 导出角色视图 DOCX（有角色、有流程）

Given 用户已打开一个包含角色的 BLM 文档
And 用户当前在全景工作台的"角色" subtab
And 角色视图默认显示"角色范围"表格模式
And 该文档中至少有一个角色参与了流程
When 用户点击工具栏"导出 ▾" → "导出 DOCX"
Then 系统应先截图"角色范围"表格（role-summary-card）
And 系统应切换到"角色用例图"模式
And 系统应勾选"只看角色参与流程"复选框
And 系统应逐个点击角色、逐个截图用例图
And 最终下载 `role.docx` 文件
And DOCX 中应包含角色范围表格 + 角色分组 + 角色截图（范围 + 每角色用例图）

### Scenario A2: 空角色 — 文档无角色时

Given 用户已打开一个没有角色的 BLM 文档
And 用户当前在全景工作台的"角色" subtab
When 用户点击"导出 ▾"
Then "导出 DOCX" 应禁用或导出空文档并提示

### Scenario A3: 角色无流程 — 无参与流程的角色

Given 用户已打开一个包含角色但所有角色都没有参与流程的 BLM 文档
And 用户当前在全景工作台的"角色" subtab
When 用户点击"导出 ▾" → "导出 DOCX"
Then 系统应截图角色范围表格
And 用例图截图为空或显示"无流程参与"
And 导出 DOCX 不会崩溃

---

## Feature: 预览页导出 DOCX（片段组装）

### Scenario B1: 金路径 — 预览页导出全量 DOCX

Given 用户已打开一个完整的 BLM 文档（含全景、角色、阶段、流程）
And 用户当前在"预览导出" tab
When 用户点击"导出 DOCX"
Then 系统应依次收集 PanoramaExporter、RoleExporter 的 ViewContent
And 系统应合并所有视图内容为一个 DOCX
And 下载 `full-document.docx`
And DOCX 应包含"全景视图"和"角色视图"两个完整章节

### Scenario B2: 仅全景视图时导出

Given 用户已打开一个只有全景视图的 BLM 文档（无角色）
And 用户当前在"预览导出" tab
When 用户点击"导出 DOCX"
Then 系统应仅导出全景视图为 DOCX
And 不会因缺少角色 exporter 而崩溃
