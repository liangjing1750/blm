# 预览导出 DOCX — 执行任务

## Phase 2a：结构化 Markdown

### 任务 2a.1：重写 buildMarkdown()

**文件**：`preview-workbench.ts`

**内容**：
- 复用 `outlineItems()` 的序号和层级结构
- 每个大纲条目输出对应 Markdown 标题 `#` `##` `###` `####` `#####`
- 标题格式 `序号 名称`（同预览大纲）
- 表格使用标准 Markdown 表格语法
- 图形引用 `![描述](graph-{kind}:{id}.png)`

**验证**：`exportMarkdown()` 导出的 .md 文件用 Markdown 编辑器打开，效果与预览一致。

### 任务 2a.2：导出按钮调用

**文件**：`preview-workbench.ts`

**内容**：
- `exportMarkdown()` 调用 `this.buildMarkdown()` 下载完整 MD
- 或增加新入口 `exportStructuredMarkdown()`

**验证**：点击导出 Markdown，下载内容为结构化文档。

## Phase 2b：截图优化

### 任务 2b.1：动态 viewport

**文件**：`graph_screenshot.py`

**内容**：
- 渲染后获取元素 `bounding_box()`
- 根据元素实际尺寸设置视口
- 添加 padding

**验证**：生成的全景矩阵 PNG 包含所有列，不被截断。

### 任务 2b.2：大图降级

**文件**：`graph_screenshot.py`

**内容**：
- 超 3840px 的图缩放 0.5 倍渲染
- 设置最大视口限制
- 超时降级

**验证**：超大文档截图不崩，输出可用图片。

## Phase 2c：打包

### 任务 2c.1：Markdown 图引用替换

**文件**：`storage.py` `build_export_bundle_from_document()`

**内容**：
- 生成结构化 Markdown
- Markdown 中的 `![](graph-xxx.png)` 替换为 `![](images/graph-xxx.png)`
- 截图文件放在 `images/` 目录
- 打包为 zip

**验证**：导出 zip 解压后在 images/ 找到对应图片，Markdown 引用路径正确。

### 任务 2c.2：导出进度

**文件**：`server.py`

**内容**：
- 多图导出时更新 job progress
- 前端显示导出进度

**验证**：95 张图导出时有进度反馈。

## 当前状态

| 任务 | 状态 | 优先级 |
|------|------|--------|
| 2a.1 buildMarkdown() 重写 | 未开始 | P0 |
| 2a.2 导出按钮 | 未开始 | P0 |
| 2b.1 动态 viewport | 未开始 | P0 |
| 2b.2 大图降级 | 未开始 | P1 |
| 2c.1 Markdown 图引用打包 | 未开始 | P1 |
| 2c.2 导出进度 | 未开始 | P2 |
