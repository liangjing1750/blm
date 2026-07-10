# 导出打磨指南

## 背景

BLM 的导出目标是"所见即所得"——导出的 DOCX/MD/ZIP 与预览效果一致。采用**分视图打磨、最后合并**的策略：每个视图（全景/阶段/流程/组件等）独立实现导出器，逐个调优，最后通过 `exportAll` 统一调度。

## 架构

```
core/export/
  export-builders.ts           ← CRC32 / buildZip / buildSimpleDocx / downloadBlob
  export.service.ts            ← ExportService（exportView / exportAll / 进度回调）
  exporters/
    view-exporter.ts           ← interface ViewExporter { label, capture(), toMarkdown() }
    panorama-exporter.ts       ← PanoramaExporter（全景视图）
    stage-exporter.ts          ← （待实现）
    process-exporter.ts        ← （待实现）
    ...
```

## 添加新视图导出器的步骤

### 1. 创建 Exporter 文件

在 `core/export/exporters/` 下新建 `xxx-exporter.ts`，实现 `ViewExporter` 接口：

```typescript
import { ViewExporter } from './view-exporter';

export class StageExporter implements ViewExporter {
  readonly label = 'stage-flow';

  toMarkdown(): string {
    // 返回该视图的结构化 Markdown
    return '# 阶段视图\n\n...';
  }

  async capture(): Promise<Uint8Array> {
    // 截图该视图的 DOM 元素
  }
}
```

### 2. 在组件中挂载导出按钮

在对应的工具栏（如"打开编辑"旁边）加"导出 ▾"下拉菜单，调用 `ExportService.exportView()`。

### 3. 注册到"导出全部"

在 `ExportService` 或组件中收集所有 exporter 实例，调用 `exportAll()`：

```typescript
await this.exportSvc.exportAll([panoExporter, stageExporter, ...], 'zip', onProgress);
```

## 截图注意事项

### 库的选择

| 库 | 原理 | 优点 | 缺点 |
|---|------|------|------|
| **dom-to-image-more** | DOM → SVG foreignObject → 光栅化 | 文本渲染精确 | SVG 复杂元素可能失败 |
| html2canvas | 手动重绘 DOM | 稳定性高，覆盖元素类型广 | 文本渲染有偏差（空格/换行） |

**当前策略**：优先 `dom-to-image-more`，失败自动降级 `html2canvas`。

### CSS zoom 问题

html2canvas 对 `CSS zoom` 属性渲染异常（文字重叠/错位）。解决方案：截图前将 zoom 重置为 1，截图后恢复。

```typescript
const zoomEl = el.closest('[data-testid="panorama-zoom-canvas"]');
if (zoomEl) zoomEl.style.zoom = '1';
// ... 截图 ...
if (zoomEl) zoomEl.style.zoom = oldZoom ?? '';
```

### overflow 裁剪

如果父容器有 `overflow: hidden` 或 `overflow: auto`，截图可能只截到可视区域。截图前设为 `overflow: visible`。

### 缩放 scale

- `scale: 2` 适合一般场景，清晰度和体积的平衡
- `scale: 1` 体积小，适合快速预览
- 过大 scale（>3）可能导致内存不足

### 动态 import

html2canvas 和 dom-to-image-more 都是 CJS 模块，在 Angular esbuild 中 `import` 可能阻塞组件加载。统一用动态 `import()`：

```typescript
const lib = (await import('html2canvas')).default;
```

## DOCX 生成注意事项

### 图片自适应页面宽度

- A4 页面宽 11906 twips，左右边距各 720 twips，内容区 = 10466 twips
- 1 twip = 635 EMU
- DOCX 中图片 `cx` = 内容区宽度 EMU，`cy` 按实际像素比例等比计算
- 从 PNG IHDR 块（字节 16-23）读取真实尺寸

### zip 打包

`buildZip()` 用 store 模式（无压缩），需要计算正确的 EOCD central directory size，否则 Microsoft Word 打开失败。

### EOCD 字段

EOCD 的 central directory size 字段必须为实际值，不能写 0。Word 严格校验此字段，WPS 忽略。

## 导出文件命名

- DOCX：`{label}.docx`
- ZIP：`{label}.zip`（内含 `{label}.md` + `{label}.png`）

## 调试技巧

1. 在浏览器控制台运行 `document.querySelector('[data-testid="panorama-overview-rich"]')` 确认元素存在
2. 截图前打印元素 `getBoundingClientRect()` 查看尺寸是否正常
3. 用 WPS 打开 DOCX 测试兼容性（Word 更严格但 WPS 方便快速验证）
4. ZIP 文件可以用任何解压工具查看内容
