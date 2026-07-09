# 预览导出 DOCX — 概要设计（Phase 2）

## 1. 终局架构

```
预览效果对齐（Phase 1，已完成）
  │
  ▼
结构化 Markdown 生成 ←──┐
  │  buildMarkdown()     │ 同一份 Markdown 被两个管道消费
  │  含 ![](graph-xxx.png)│
  │                      │
  ├──→ 导出资源包        │
  │     *.md + *.png     │
  │     (zip)            │
  │                      │
  └──→ DOCX 导出 (Phase 3)
        docx.py 解析 Markdown
        截图嵌入对应段落
```

## 2. Phase 2a：结构化 Markdown

### 2.1 生成位置

`buildMarkdown()` 在 `preview-workbench.ts` 中。当前极其简单，需重写。

### 2.2 输出结构

与预览大纲一致的多级标题结构：

```markdown
# 文档标题

## 1 引言

### 1.1 全景视图

![全景视图](graph-stage-panorama.png)

### 1.2 角色

| 角色 | 分组 | 说明 |
|------|------|------|

## 2 仓单监管@杨伟

### 2.1 阶段 · 入库

![阶段：入库](graph-stage-flow:stage-xxx.png)

#### 2.1.1 流程组 · 入库预约

##### 2.1.1.1 入库预约

![流程图：入库预约](graph-process-flow:process-xxx.png)

**触发** → **预期结果**

#### 流程节点: 节点名

**办理步骤** | **办理表单** | **办理附件** | **办理规则**

（表格等完整结构化内容）

## N 附录

### N.1 流程名

附件卡片（下载链接）
```

### 2.3 关键要求

- 表格使用标准 Markdown 表格语法 `| ... | ... |`
- 图形引用格式 `![描述](graph-{kind}:{id}.png)`
- 层级限制 4 级（`#` `##` `###` `####` `#####`）
- 标题带序号，与预览大纲一致
- 公式/代码块暂不需要

### 2.4 受影响文件

| 文件 | 变更 |
|------|------|
| `preview-workbench.ts` `buildMarkdown()` | 完整重写，输出结构化 Markdown |
| `preview-workbench.ts` | 新增 `exportStructuredMarkdown()` 按钮调用 |

## 3. Phase 2b：截图缩放策略

### 3.1 当前状态

```python
# graph_screenshot.py 核心逻辑
page = browser.new_page(viewport={"width": 1800, "height": 1200}, device_scale_factor=2)
page.goto(url)
page.wait_for_function("window.__BLM_EXPORT_READY__ === true")
locator = page.locator(graph.selector).first
payload = locator.screenshot(type="png")
```

问题：viewport 固定 1800×1200，大图（全景矩阵 1464px 宽 + 多个阶段宽度）可能被截断或缩放不当。

### 3.2 缩放方案：动态 viewport + 元素全尺寸截图

Playwright 的 `locator.screenshot()` 支持截取元素的完整内容尺寸（包括 `overflow: visible` 溢出的部分），前提是：

1. 元素的父容器不设固定尺寸限制
2. 元素的 `overflow` 不是 `hidden`/`scroll`

当前导出渲染页的 SCSS 已满足这些条件（`overflow: visible`, `max-height: none`）。

**改进方案**：

```python
# 1. 打开页面
page.goto(url, wait_until="networkidle")

# 2. 等待 ready
page.wait_for_function("window.__BLM_EXPORT_READY__ === true")

# 3. 获取元素的完整尺寸
locator = page.locator(graph.selector).first
box = locator.bounding_box()  # 返回 {x, y, width, height}

# 4. 根据元素尺寸动态设置视口（加 padding）
padding = 40
viewport_width = min(3840, max(800, int(box["width"]) + padding * 2))
viewport_height = min(3840, max(600, int(box["height"]) + padding * 2))
page.set_viewport_size({"width": viewport_width, "height": viewport_height})

# 5. 截图
payload = locator.screenshot(type="png")
```

**优点**：每张图获得合适尺寸的截图，不缩放、不裁剪、不浪费像素。

**DPR 策略**：`device_scale_factor=1` 即可（屏幕像素非必需）。截图后再根据目标 DOCX/Markdown 图片宽度缩放。

### 3.3 缩放策略决策树

```
渲染元素 → 获取 bounding_box
       │
       ├── box.width > 3840 或 box.height > 3840
       │    └── 设置 viewport=3840x3840，scale=0.5
       │         Page.screenshot(full_page=true)
       │         图片宽度 = 3840 × scale
       │
       ├── 800 < box.width < 3840
       │    └── 动态 viewport，no scaling
       │
       └── box.width < 800
            └── viewport=min 800x600
```

### 3.4 备选：CSS transform scale

如果 Playwright 的 `bounding_box()` 对大图返回 0 或异常：

```python
# 在页面上执行缩放，使元素完整可见
page.evaluate("""
  () => {
    const el = document.querySelector('[data-export-graph-id="..."]');
    const parent = el.closest('.export-render-canvas');
    if (!el || !parent) return;
    const maxW = window.innerWidth - 40;
    const scale = Math.min(1, maxW / (el.scrollWidth || el.offsetWidth));
    if (scale < 1) {
      parent.style.transform = `scale(${scale})`;
      parent.style.transformOrigin = 'top left';
    }
  }
""")
```

但此方式会导致 `bounding_box()` 返回缩放后的尺寸，截图分辨率降低。不如动态 viewport 方案。

## 4. Phase 2c：Markdown + 截图整合

### 4.1 导出资源包（zip）

```python
def build_export_bundle(name: str, graph_images: list[DocxImage]) -> tuple[str, bytes]:
    # 1. 生成结构化 Markdown
    markdown = build_structured_markdown(document)
    
    # 2. 打包
    zip:
      - document.md          # 结构化 Markdown
      - images/
          - graph-stage-panorama.png
          - graph-stage-flow:xxx.png
          - graph-process-flow:xxx.png
          ...
      - manifest.json        # 文档 JSON
    
    # Markdown 中的 ![](...) 引用指向 images/ 目录
    # 替换：![](graph-stage-panorama.png) → ![](images/graph-stage-panorama.png)
```

### 4.2 DOCX 导出（Phase 3）

```python
def build_docx(markdown: str, graph_images: list[DocxImage]) -> bytes:
    # docx.py 解析 Markdown 中的 ![](graph-xxx.png)
    # 在对应段落位置嵌入图片
    # 图片缩放至 A4 页面宽度
```

## 5. 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Playwright bounding_box() 返回 0 | 截图失败 | 降级为全页截图 + 裁剪 |
| 大图 memory 溢出 | 浏览器崩溃 | 限制 max viewport 3840，超限降级 |
| buildMarkdown() 与预览不一致 | 导出 ≠ 预期 | 复用 outlineItems() 的序号和结构 |
| 截图时间过长（95 张图） | 用户等待久 | 异步队列 + 进度提示 |
