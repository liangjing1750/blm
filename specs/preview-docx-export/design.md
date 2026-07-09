# 预览导出 DOCX — 概要设计

## 1. 模块边界

```
┌─────────────────────────────────────────────┐
│              PreviewWorkbench                │
│  (Angular Component, workbenches/preview/)   │
│                                              │
│  buildOutlineItems() → 四层大纲              │
│  renderDocumentHtml() → 结构化正文 HTML       │
│  buildMarkdown() → 富化 Markdown              │
└──────────────┬──────────────────────────────┘
               │ exportDocx() / exportBundle()
               ▼
┌─────────────────────────────────────────────┐
│              API Service (core/api)           │
│  startDocxExport / exportBundle               │
└──────────────┬──────────────────────────────┘
               │ HTTP
               ▼
┌─────────────────────────────────────────────┐
│              BLM Server (blm_core/server.py)  │
│  _handle_export_docx_start                    │
│  _capture_export_graph_images                 │
└──────┬──────────────────────┬────────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐   ┌──────────────────────┐
│  markdown.py  │   │  graph_screenshot.py  │
│  导出结构化   │   │  Playwright 截图      │
│  Markdown     │   │  渲染页 → PNG         │
└──────┬───────┘   └──────────┬───────────┘
       │                      │
       ▼                      ▼
┌─────────────────────────────────────────────┐
│              docx.py                          │
│  build_docx_from_preview_markdown()           │
│  合成 Markdown + 截图 → DOCX (.zip)          │
└─────────────────────────────────────────────┘
```

## 2. 分阶段设计

### Phase 1: 预览效果对齐

#### 2.1 大纲树结构

当前 `buildOutlineItems()` 返回 `depth: 0 | 1 | 2` 的扁平列表。改为树结构枚举：

```
depth=0: 文档标题、角色、统一语言
depth=1: 价值流名称（当前匹配业务域 → 价值流线）
depth=2: 阶段名称
depth=3: 流程组名称
depth=4: 流程名称
```

实现方式：不改变 `PreviewOutlineItem` 接口，depth 从 `0 | 1 | 2` 扩展为 `0 | 1 | 2 | 3 | 4`，大纲 SCSS 新增 `.depth-3`、`.depth-4` 缩进。

#### 2.2 正文顺序

当前 `renderDocumentHtml()` 按角色→术语→阶段→流程→实体→构件→应用 顺序输出。改为：

```
1. 文档标题 + 元信息
2. 角色
3. 统一语言/术语表
4. 业务全景（按价值流组织）
   4.1 价值流 A
       4.1.1 全景矩阵图
       4.1.2 阶段 1 → 流程图
          4.1.2.1 流程组 1
             流程 1 → 流程 N
       4.1.3 阶段 2 → 流程图
          4.1.3.1 流程组 1
             流程 1 → 流程 N
   4.2 价值流 B
       ...
5. 独立流程（不属于任何价值流的流程）
6. 数据建模
7. 构件建模
8. 应用建模
```

#### 2.3 受影响文件

| 文件 | 变更 |
|------|------|
| `preview-workbench.ts` | `buildOutlineItems()` depth 扩展、正文顺序调整 |
| `preview-workbench.scss` | 新增 `.depth-3` `.depth-4` 大纲缩进 |

### Phase 2: Markdown + 截图

#### 2.4 富化 Markdown 生成

重构 `buildMarkdown()` 输出结构化 Markdown：

```markdown
# 文档标题

## 角色
| 角色 | 分组 | 说明 |
|------|------|------|

## 业务全景

### 价值流：仓单监管@杨伟

#### 阶段：入库

![阶段：入库](graph-stage-flow:stage-xxx.png)

##### 流程组：仓库信息管理

###### 流程：仓库基本信息维护

| 节点 | 角色 | 步骤 |
|------|------|------|

![流程图](graph-process-flow:process-xxx.png)
```

Markdown 使用 `######`（H6）对应到 DOCX 中成为四级标题，保证层级正确。

截图引用格式：`![标题](graph-{kind}:{id}.png)`，后端解析后替换为实际嵌入的图片。

#### 2.5 受影响文件

| 文件 | 变更 |
|------|------|
| `preview-workbench.ts` | `buildMarkdown()` 完整重写 |
| `docx.py` | `_document_xml_for_preview_export()` 按章节顺序嵌入图片 |
| `storage.py` | `build_export_docx_from_document()` 传入结构化 Markdown |

### Phase 3: DOCX 完善

#### 2.6 表格样式增强

- 表头行使用带底色的样式（`shd fill="EFF6FF"`）
- 列宽按内容自适应分配（当前所有列等宽 2400）
- 支持单元格内富文本（粗体、颜色）

#### 2.7 富文本规则样式

当前 `docx.py` 的 `_strip_inline_markdown()` 去掉了所有格式。改为：
- 解析富文本中的 `**粗体**`、`*斜体*` 等标记
- 在 WordprocessingML 中生成对应的 `w:b`、`w:i` 标记

#### 2.8 截图嵌入位置

当前截图统一追加在文档末尾的"静态图形"章节。改为：
- 解析 Markdown 中的图片引用 `![...](...)`
- 在对应段落位置嵌入图片
- 保持和预览中的阅读顺序一致

## 3. 第一阶段对外接口

保持不变（预览组件对外不暴露新接口；后端 API 路由不变）。

## 4. 风险

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 文档价值流关系复杂，分组逻辑遗漏 | 大纲层级不对 | 复用阶段视图已有的 `panoramaLaneUid`/`panoramaColumnUid` 分组 |
| 流程组归属多个阶段 | 一个流程显示在多个位置 | 去重处理，以首次出现为准 |
| Playwright 截图在无头环境超时 | DOCX 缺图 | 超时降级为文字替代 + 后端可配置超时参数 |
| docx.py 图片大小不适应 A4 | 图片溢出页边距 | 根据页面宽度缩放图片，当前有 `MAX_IMAGE_WIDTH_PX` |

## 5. 未完成/后续扩展

- **PDF 导出**：可基于 DOCX 用 LibreOffice 无头转换
- **自定义模板**：允许用户选择 DOCX 样式模板（标题字体、配色、页眉页脚）
- **增量导出**：只导出当前工作台可见内容（如仅流程视图）
