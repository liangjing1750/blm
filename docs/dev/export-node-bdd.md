# 节点导出 BDD 场景

## Feature: 节点内容作为流程/阶段导出的基础片段

### Scenario A1: 金路径 — 导出完整节点内容

Given 一个流程节点关联了角色、办理步骤、表单材料和办理规则
When 系统调用 `buildNodeContent(document, node, { process })`
Then 返回的 `ViewContent` 标题应为 `节点：{节点名称}`
And 内容应包含所属流程概览表
And 内容应按节点视图的 4 个办理内容输出
And 第一个办理内容是"办理角色"表
And 第二个办理内容是"办理步骤"表
And 第三个办理内容是"办理材料"表
And 第四个办理内容是"办理规则"表

### Scenario A2: 文本型片段 — 不产生截图

Given 一个节点需要被流程导出或阶段导出复用
When 系统创建 `NodeExporter`
Then `getContent()` 返回节点结构化内容
And `captureAll()` 返回空数组
And ZIP 导出只包含 Markdown，不包含空 PNG

### Scenario A4: DOCX 文件类型 — 不被浏览器识别为普通 ZIP

Given 用户在"节点视图"点击"导出 DOCX"
When 系统调用 `ExportService.exportView(nodeExporter, 'docx')`
Then 下载文件名应为 `node-*.docx`
And Blob MIME 应为 `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
And 不应走 ZIP 导出分支

### Scenario A3: 引用缺失 — 不阻断导出

Given 节点引用的角色、实体、服务或任务定义在文档中缺失
When 系统构建节点导出内容
Then 导出应使用可读 fallback 文案
And 不应抛出异常
