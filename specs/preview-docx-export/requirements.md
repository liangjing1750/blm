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
| 预览正文渲染 | `preview-workbench.ts` | 已完成 Phase 1 |
| 大纲构建 | `preview-workbench.ts` | 已完成 Phase 1 |
| Markdown 导出（预览） | `preview-workbench.ts` — `buildMarkdown()` | 极简，需重写 |
| 后端 Markdown 导出 | `blm_core/markdown.py` | 已有，但与预览不同步 |
| DOCX 构建器 | `blm_core/docx.py` | 纯 Python，无外部依赖 |
| 图形截图 | `blm_core/graph_screenshot.py` | 基于 Playwright，单图渲染 |
| 图形注册表 | `frontend/.../graph-export-registry.ts` | 列举所有可导出图形 |
| 导出渲染页 | `frontend/.../export-render-page.component.ts` | 单图无壳渲染页 |
| 导出资源包 | `server.py` → `build_export_bundle` | JSON+截图→zip |
| 异步 DOCX 导出 | `server.py` → `startDocxExport` | 生产链路完整 |
| 预览效果对齐 | `outlineItems()` / template | 已完成 Phase 1 |

### 2.2 现有过程图

当前预览到导出的链路：

```
预览(buildMarkdown:极简)
  └─ API startDocxExport
       └─ server 冻结文档
            ├─ markdown.py 导出 Markdown（文本格式，无图引用）
            ├─ graph_screenshot.py Playwright 截每张图
            │    └─ export-render-page 无壳渲染面
            │         └─ 真实工作台组件渲染画布
            │              └─ Playwright 截取 data-export-graph-id 元素
            └─ docx.py 合成 DOCX（图附加在末尾）
```

### 2.3 关键差距

| 差距 | 当前 | 目标 |
|------|------|------|
| Markdown 内容 | 仅名称计数 | 结构化全文，含表格、层级标题 |
| Markdown 图引用 | 无 | `![图名](graph-xxx.png)` 嵌入 |
| 截图位置 | 统一追加到 DOCX 末尾 | 嵌入到对应章节上下文 |
| 截图缩放 | 无（1800x1200 固定视口） | 大图自动缩放至合适比例 |
| 截图内容 | 只截 `data-export-graph-id` 元素 | 同上（正确） |
| 多图并发 | 串行逐张截图 | 可并行 |
| 预览→导出一致性 | 预览效果和导出不统一 | 预览 MD ≈ 导出 MD |

### 2.4 截图技术难点

#### 2.4.1 缩放问题

当前 Playwright 截图流程：
1. viewport=1800x1200, device_scale_factor=2
2. 打开 `/export/render/{jobId}?graphId={id}`
3. 等待 `__BLM_EXPORT_READY__ === true`
4. locator = `[data-export-graph-id="{id}"]`
5. locator.screenshot(type="png")

问题：大图（如全景矩阵宽 1464px、阶段流程图宽 1000+px）超过视口时，`overflow: visible` 让内容溢出，但 `locator.screenshot()` 只截视口内可见部分。

#### 2.4.2 元素截图 vs 全尺寸截图

Playwright 的 `locator.screenshot()` 默认截取元素的可视部分。要让大图完整截图，需要：

方案 A：设置足够大的 viewport
- 优点：简单直接
- 缺点：不同图形大小不同，无法统一设置；大视口截出大图

方案 B：截图后缩小样式
```css
/* 在截图画布上应用 transform: scale() */
.export-render-canvas {
  transform: scale(0.5);
  transform-origin: top left;
}
```
- 优点：统一处理所有图形
- 缺点：文字可能缩放后过小

方案 C：前端在目标元素上设置固定尺寸 + overflow:visible
- 导出渲染页的 SCSS 已有 `overflow: visible` 和 `min-width: max-content`
- 但 `element.screenshot()` 在 Playwright 中会截图元素的完整尺寸（包括溢出部分）
- 配合 `{ fullPage: true }` 或元素的 `scrollWidth`/`scrollHeight` 来处理

方案 D：前端使用 `html2canvas` 或纯 SVG 导出
- 优点：不依赖后端浏览器截图
- 缺点：引入额外依赖，SVG 导出对复杂 CSS 布局支持有限

## 3. 不做什么

- 不做 PDF 导出（后续可基于 DOCX 转换）
- 不改后端数据模型
- 不替换 Playwright 截图方案（已验证可靠）
- 不引入 html2canvas 等前端截图库（增加复杂度）
- 不依赖第三方 DOCX 库（已有纯 Python 实现）

## 4. 分阶段交付计划

### Phase 1 — 预览效果对齐 ✅（已完成）

### Phase 2 — 结构化 Markdown + 截图

2a. 重构 `buildMarkdown()` 生成完整结构化 Markdown
2b. 截图缩放策略落地
2c. 后端 Markdown + 截图 → 资源包（zip/Markdown/图片）

### Phase 3 — DOCX 完善（后续）
