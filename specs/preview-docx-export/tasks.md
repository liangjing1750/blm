# 预览导出 DOCX — 执行任务

## Phase 1: 预览效果对齐

### 任务 1.1：重构大纲树深度

**文件**：`preview-workbench.ts`

**改动**：
- `depth` 类型从 `0 | 1 | 2` 扩展为 `0 | 1 | 2 | 3 | 4`
- `buildOutlineItems()` 按价值流→阶段→流程组→流程 生成四级大纲
- 流程组识别：根据 `process.flowGroup` 分组，空分组的流程直接挂在阶段下（depth=3）

**验证**：预览大纲显示正确的树形缩进。

### 任务 1.2：大纲 SCSS 缩进

**文件**：`preview-workbench.scss`

**改动**：
- 新增 `.depth-3`（padding-left: 46px）
- 新增 `.depth-4`（padding-left: 60px）

### 任务 1.3：重构正文渲染顺序

**文件**：`preview-workbench.ts`

**改动**：
- `renderDocumentHtml()` 中的业务全景区域按价值流组织
- 每个价值流下按阶段排列，阶段下按流程组/流程排列
- 使用 `renderValueStreamSection()` 新方法

### 任务 1.4：全景大纲匹配价值流层次

**改动**：
- 从文档的 `panorama.lanes` 获取价值流列表
- 每个价值流作为一级大纲项
- 价值流下的阶段作为二级

## Phase 2: Markdown + 截图

### 任务 2.1：结构化 Markdown 生成

**文件**：`preview-workbench.ts`

**改动**：
- `buildMarkdown()` 输出完整结构化 Markdown
- 包含表格（角色、术语、节点步骤、规则）
- 包含图形引用 `![...](graph-xxx.png)`
- 层级：`#` 标题 → `##` 价值流 → `###` 阶段 → `####` 流程组 → `#####` 流程

### 任务 2.2：后端 Markdown 导出增强

**文件**：`markdown.py`

**改动**：
- 按价值流→阶段→流程组→流程 输出 Markdown
- 对齐前端 `buildMarkdown()` 的输出格式
- 保留表格的列对齐

### 任务 2.3：截图嵌入位置映射

**文件**：`docx.py`

**改动**：
- 解析 Markdown 中的 `![](graph-xxx.png)` 引用
- 在对应段落位置嵌入图片，而非末尾附录
- 移除"静态图形"单独章节

## Phase 3: DOCX 完善

### 任务 3.1：表格样式增强

**文件**：`docx.py`

**改动**：
- 表头行背景色
- 列宽按内容分配
- 单元格内粗体支持

### 任务 3.2：富文本规则保留

**文件**：`docx.py`

**改动**：
- 解析富文本标记 `**bold**` `*italic*`
- 生成对应的 WordprocessingML 格式

### 任务 3.3：图片缩放适配

**文件**：`docx.py`

**改动**：
- 根据 A4 页面宽度缩放图片
- 支持图片居中
- 添加图片标题

## 当前状态

| 阶段 | 任务 | 状态 |
|------|------|------|
| Phase 1 | 1.1 大纲重构 | 未开始 |
| Phase 1 | 1.2 大纲 SCSS | 未开始 |
| Phase 1 | 1.3 正文渲染顺序 | 未开始 |
| Phase 1 | 1.4 价值流层次 | 未开始 |
| Phase 2 | 2.1 Markdown 生成 | 未开始 |
| Phase 2 | 2.2 后端增强 | 未开始 |
| Phase 2 | 2.3 截图嵌入 | 未开始 |
| Phase 3 | 3.1 表格样式 | 未开始 |
| Phase 3 | 3.2 富文本规则 | 未开始 |
| Phase 3 | 3.3 图片缩放 | 未开始 |
