# 预览导出 DOCX 结构化需求

## 1. 背景与目标

BLM 工具需要导出结构化的 DOCX 文档，作为产品需求资料和审计备份。

**终局目标**：把全景工作台和流程工作台的内容，以结构化文本 + 截图的形式导出为 DOCX，且文本效果与预览基本一致。

**结构化含义**：流程模型本质是树状的，天然适合多级标题：

```
价值流环节（H1）
  └─ 阶段（H2）
       ├─ 流程组（H3）
       │    └─ 流程（H4）
       └─ 流程（H4，无组时）
```

**截图含义**：BLM 的图形交互是动态 HTML/JS，DOCX 只支持静态图片，因此需把全景矩阵、阶段流程、流程节点图等以截图方式嵌入。

## 2. 现状分析

### 2.1 已有资产

| 资产 | 路径 | 状态 |
|------|------|------|
| 预览正文渲染 | `preview-workbench.ts` — `renderDocumentHtml()` | 已有，正文顺序和大纲需优化 |
| 大纲构建 | `preview-workbench.ts` — `buildOutlineItems()` | 仅有 depth 0/1/2，缺结构化层次 |
| Markdown 导出 | `preview-workbench.ts` — `buildMarkdown()` | 极简，只列出名称和计数 |
| 后端 Markdown 导出 | `blm_core/markdown.py` | 命令行/API 导出用，文档模型较完整 |
| DOCX 构建器 | `blm_core/docx.py` | 纯 Python，无外部依赖，支持 Markdown→DOCX |
| 图形截图 | `blm_core/graph_screenshot.py` | 基于 Playwright，截图导出渲染页 |
| 图形注册表 | `graph-export-registry.ts` | 列举所有可导出图形描述符 |
| 预览图形宿主 | `preview-graph-host.component.ts` | 延迟加载各工作台图形组件 |
| 导出资源包 | `server.py` → `build_export_bundle` | JSON + 截图 → zip |
| 异步 DOCX 导出 | `server.py` → `startDocxExport` + 轮询 | 生产链路完整 |

### 2.2 现有流程图

当前预览到导出的数据流：

```
预览正文 (Angular renderDocumentHtml)
  ├─ 大纲 (outlineItems: depth 0/1/2)
  ├─ 正文 HTML → 浏览器内预览
  ├─ Markdown (buildMarkdown: 极简)
  └─ DOCX 导出按钮
       └─ API startDocxExport
            └─ server 冻结文档
                 ├─ markdown.py 导出 Markdown
                 ├─ Playwright 截图图形
                 └─ docx.py 合成 DOCX

导出资源包按钮
  └─ API export-bundle
       └─ server 冻结文档
            ├─ Playwright 截图图形
            └─ zip(JSON + PNG)
```

### 2.3 关键差距

| 差距 | 当前 | 目标 |
|------|------|------|
| 大纲层级 | depth 0/1/2 扁平 | 价值流→阶段→流程组→流程 四层树 |
| 正文顺序 | 按文档数组顺序（阶段/流程/实体...） | 按价值流/业务域组织，结构化输出 |
| 图形截图位置 | 单独归类到"静态图形"章节 | 嵌入到正文对应上下文（阶段、流程旁） |
| 表格渲染 | 表格在 DOCX 中还原 | 保持预览一致的表格样式 |
| 富文本规则 | 规则内容在 DOCX 中丢失格式 | 规则内容保留粗体/列表/颜色 |
| Markdown 富化 | buildMarkdown() 只有名称列表 | 完整结构化 Markdown，含表格和图形引用 |
| 导出前预览 | 预览和导出是两套渲染 | 预览看到的 ≈ 导出得到的 |

## 3. 不做什么

- 不做实时 WYSIWYG DOCX 编辑
- 不做 PDF 导出（后续可基于 DOCX 转换）
- 不改后端数据模型
- 不重构现有预览正文 Angular 模板（只调整 `renderDocumentHtml()` 逻辑）
- 不依赖第三方 DOCX 库（已有纯 Python 实现）
- 不替换 Playwright 截图方案

## 4. 分阶段交付计划

### Phase 1 — 预览效果对齐
优化预览正文顺序和大纲层级，保证预览阶段的阅读体验和结构化表达正确。

**核心变更**：
- 重构 `buildOutlineItems()` 为四层树结构（价值流→阶段→流程组→流程）
- 重构 `renderDocumentHtml()` 按价值流/阶段组织内容
- 在阶段下方按流程组分组的流程列表
- 更新预览 SCSS 保持大纲可读性

**验收**：打开任一文档，预览大纲显示正确的树形结构；正文按价值流→阶段→流程组→流程顺序排列。

### Phase 2 — Markdown + 截图
输出富化的 Markdown（等价于预览效果）和多张嵌入图形引用。

**核心变更**：
- 重构 `buildMarkdown()` 生成结构化 Markdown（含表格、层级标题）
- Markdown 中嵌入截图占位引用 `![图形名称](graph-xxx.png)`
- 后端 `build_export_docx_from_document` 把 Markdown 和截图合并为 DOCX

**验收**：导出 Markdown，用任意 Markdown 编辑器打开，效果与预览基本一致。

### Phase 3 — DOCX 完善
把 Markdown + 截图完整翻译为 DOCX，表格、文本样式、图形位置正确。

**核心变更**：
- 丰富 `docx.py` 的表格样式（带颜色的表头、列宽分配）
- 支持富文本规则内容的样式保留
- 图形截图嵌入到对应章节位置（而非末尾附录）
- 优化页面布局（A4、页边距、标题字体）

**验收**：导出 DOCX，用 Word/WPS 打开，文本表格图形与预览一致。
