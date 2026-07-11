# 导出打磨指南

## 背景

BLM 的导出目标是"所见即所得"——导出的 DOCX/MD 与预览效果一致。采用**分视图打磨、最后合并**的策略：每个视图（全景/阶段/流程/角色/实体等）独立实现导出器，逐个调优，最后通过组装器合并为完整文档。

**关键决策：前端主导导出。** 除附件下载需后端外，文档生成与图片截图都在浏览器内完成，利用已有渲染代码和 DOM 截图能力。

## 第三方库调研

### DOCX 生成：`docx`（dolanmiu/docx）

| 指标 | 数据 |
|------|------|
| 协议 | MIT |
| 版本 | v9.7.1（2025 仍在活跃发版） |
| 周下载 | ~1340 万 |
| GitHub | 5.8K stars，97 contributors，2367 commits |
| 维护者 | dolanmiu（Bloomberg Tech Lead），8 年持续维护 |
| 浏览器 | 原生支持，Packer.toBlob() 直接出 Blob |
| 类型 | 全 TypeScript 声明式 API |

```typescript
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from 'docx';

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ text: "第一章", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [
          new TextRun("普通文本"),
          new TextRun({ text: "粗体", bold: true }),
          new TextRun({ text: "斜体", italics: true }),
        ],
      }),
      new ImageRun({ data: pngBytes, transformation: { width: 500, height: 300 } }),
    ],
  }],
});
const blob = await Packer.toBlob(doc);
```

**中文注意**：docx 库默认字体是 Calibri，中文需在样式中指定东亚字体，否则 Word 中文字体显示为宋体。

### MD 生成：自建 `md-fragment.ts`

**调研结论**：`build-md` v0.4.5 存在 CJK 表格逐字符分裂的 bug，`ts-markdown` 同样对中文支持不完善。最终方案是**自建轻量 Markdown Builder**（`md-fragment.ts`），核心逻辑只有 ~80 行：

- CJK 宽度感知的表列对齐（中文字符计 2 宽度）
- 支持 `heading1-3` / `paragraph` / `list` / `table` / `image`
- 零依赖，完全可控

## 架构

```
core/export/
├── export.service.ts            ← 编排器（exportView / exportAll / 进度）
├── export-builders.ts           ← 底层工具（CRC32 / buildZip / downloadBlob / readPngSize）
├── exporters/
│   ├── view-exporter.ts         ← interface ViewExporter + ViewContent / ViewSection
│   ├── panorama-exporter.ts     ← 全景视图 ✅
│   ├── role-exporter.ts         ← 角色视图（范围 + 用例图）✅
│   ├── node-exporter.ts         ← 节点内容片段（文本型基础导出）✅
│   ├── stage-exporter.ts        ← （待实现）
│   └── process-exporter.ts      ← （待实现）
├── fragments/
│   ├── docx-fragment.ts         ← 基于 docx 库的 DOCX 片段构建器
│   ├── md-fragment.ts           ← 自建 CJK 感知 MD Builder
│   └── fragment-assembler.ts    ← 片段汇总器（ExportService 内部使用）
```

### ViewExporter 接口（新）

```typescript
interface ViewExporter {
  readonly label: string;
  capture(): Promise<Uint8Array>;

  /** 返回该视图的结构化内容，供 DOCX 和 MD 两个通道消费 */
  getContent(): ViewContent;
}

interface ViewContent {
  title: string;
  sections: ViewSection[];
}

interface ViewSection {
  type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'list' | 'table';
  text?: string;
  rows?: string[][];    // table 用
  items?: string[];     // list 用
}
```

### 双通道处理

```
ViewContent
    ├──→ buildDocxFragment(content, [screenshots]) →
    │       docx 库 Document + Packer.toBlob() → .docx
    │
    └──→ buildMarkdown(content) →
            自建 Builder → .md 字符串（图片引用标记）
```

### ExportService 统一入口

```typescript
class ExportService {
  /** 单个视图 → 1 个文件 */
  exportView(exporter: ViewExporter, format: 'docx' | 'zip'): Promise<void>;

  /** 全部视图合并 → 1 个汇总文件 */
  exportAll(exporters: ViewExporter[], format: 'docx' | 'md', onProgress?): Promise<void>;
}
```

- `exportView` 调 `getContent()` + `capture()` → 单视图输出
- `exportAll` 遍历收集所有视图 → `FragmentAssembler.assembleAllDocx()` → 单文件输出
- `FragmentAssembler` 是 ExportService 内部工具，外部只跟 ExportService 打交道

## "预览导出"的片段组装流程

"预览导出"（全部导出）按预定义顺序执行：

```typescript
// 1. 按定义顺序收集视图内容
const contents = [
  panoramaExporter.getContent(),     // 全景视图
  stageExporter.getContent(),        // 阶段视图（逐阶段）
  processExporter.getContent(),      // 流程视图（逐流程）
  entityExporter.getContent(),       // 数据建模
  roleExporter.getContent(),         // 角色
];

// 2. 收集截图
const screenshots = await Promise.all(
  exporters.map(ex => ex.capture())
);

// 3. 汇总 → 单个文件
const docxBlob = await assembler.assembleAll(contents, 'docx');
downloadBlob(docxBlob, 'full-document.docx');
```

## 导出按钮位置（踩坑记录）

⚠️ **不要在每个视图组件内部加导出按钮。** 导出按钮应统一放在父级工作台的工具栏（`proc-view-actions` / `role-head-actions`），根据当前激活的 subtab 动态派发到不同 exporter。

### 正确做法

父级工作台（`panorama-workbench`）维护一个导出菜单，切换不同 subtab 时改变导出行为：

```typescript
private async runExport(fmt: 'docx' | 'zip'): Promise<void> {
  const tab = this.activeTab();
  if (tab === 'overview') {
    await this.exportSvc.exportSingle(new PanoramaExporter(), fmt);
  } else if (tab === 'roles') {
    await this.exportSvc.exportSingle(new RoleExporter(), fmt);
  }
}
```

### 错误做法

❌ 在 `role-workbench` 组件里加导出按钮 → 导致父工作台和子组件各有一个"导出"，出现重复按钮。

## 导出选项隔离（踩坑记录）

⚠️ **一个导出操作只输出一个文件。** "导出 DOCX"只产生 `.docx`，"导出 MD"只产生 `.md` 或 `.zip`。

```typescript
// ❌ 错误：点击"导出 DOCX"同时下载了 docx 和 zip
downloadBlob(docx, 'role.docx');
downloadBlob(zip, 'role-all.zip');

// ✅ 正确：只输出一个文件
downloadBlob(docx, 'role.docx');
```

## 添加新视图导出器的步骤

### 节点导出的特殊定位

节点导出不是截图型视图，而是流程、阶段和全局导出的**基础文本片段**。

- `NodeExporter` / `buildNodeContent()` 只负责把单个流程节点转成 `ViewContent`
- 节点片段采用类似预览页的表格化结构，包含所属流程概览，以及"办理角色 / 办理步骤 / 办理材料 / 办理规则"4 个办理内容
- `captureAll()` 返回空数组，不生成截图
- 流程导出应组合“流程图截图 + 多个节点内容片段”
- 阶段导出应组合“阶段图截图 + 多个流程导出片段”
- 节点导出当前不单独放按钮，避免三级视图入口过早膨胀

这个边界的目的：先稳定底层结构化文本契约，后续流程/阶段 exporter 只做组合，不在各自内部重复拼节点字段。

### 1. 创建 Exporter

在 `core/export/exporters/` 下新建 `xxx-exporter.ts`，实现 `ViewExporter` 接口：

```typescript
import { ViewExporter, ViewContent, ViewSection } from './view-exporter';

export class StageExporter implements ViewExporter {
  readonly label = 'stage-flow';

  getContent(): ViewContent {
    // 从文档数据中提取结构化数据，而非拼字符串
    return {
      title: '阶段视图',
      sections: [
        { type: 'heading1', text: '阶段视图' },
        { type: 'paragraph', text: '描述文本' },
        { type: 'table', headers: ['阶段', '流程'], rows: [...] },
      ],
    };
  }

  async capture(): Promise<Uint8Array> {
    // 截图该视图的 DOM 元素
  }
}
```

### 2. 注册到父级工作台

在父级工作台的导出菜单按 `activeTab` 分发。

### 3. 注册到"导出全部"

```typescript
await this.exportSvc.exportAll([panoExporter, stageExporter, ...], 'docx', onProgress);
```

## 截图注意事项

### 库的选择

| 库 | 原理 | 优点 | 缺点 |
|---|------|------|------|
| **dom-to-image-more** | DOM → SVG foreignObject → 光栅化 | 文本渲染精确 | SVG 复杂元素可能失败 |
| html2canvas | 手动重绘 DOM | 稳定性高 | 文本渲染有偏差 |

**当前策略**：优先 `dom-to-image-more`，失败自动降级 `html2canvas`。

### CSS zoom 问题

html2canvas 对 `CSS zoom` 属性渲染异常。截图前将 zoom 重置为 1，截图后恢复。

### overflow 裁剪

如果父容器有 `overflow: hidden` / `auto`，截图前设为 `overflow: visible`。

### 缩放 scale

- `scale: 2` 适合一般场景
- `scale: 1` 体积小，适合快速预览
- 过大 scale（>3）可能导致内存不足

### 动态 import

html2canvas 和 dom-to-image-more 都是 CJS 模块，统一用动态 `import()` 避免阻塞：

```typescript
const lib = (await import('dom-to-image-more')).default;
```

## 复杂导出流程（多截图 + 进度条）

对于需要截多张图的视图，使用**进度回调模式**：

```typescript
export async function exportRoleDocx(
  onProgress?: (pct: number, msg: string) => void,
): Promise<void> {
  onProgress?.(5, '正在截图角色范围…');
  const png1 = await captureScreenshot('[data-testid="..."]');
  for (const item of items) {
    onProgress?.(pct, `正在截图 (${done}/${total})…`);
    const png = await captureScreenshot('[data-testid="..."]');
    results.push(png);
  }
  onProgress?.(100, '下载中…');
  // 使用 fragment 构建器生成最终文件
  const blob = DocxFragment.build(content, results);
  downloadBlob(blob, 'output.docx');
}
```

### 交互类截图（踩坑记录）

对于需要切换状态再截图的场景：

```typescript
// 1. 切换到目标模式
await switchMode('[data-testid="mode-toggle"]', 'target-testid');
// 2. 逐个处理
for (const btn of roleBtns) {
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(300);   // 等 Angular 渲染
  toggle.dispatchEvent(new MouseEvent('change', { bubbles: true }));
  await sleep(400);
  const png = await captureScreenshot('[data-testid="target-area"]');
  toggle.dispatchEvent(new MouseEvent('change', { bubbles: true }));
}
```

注意：
- 使用 `dispatchEvent(new MouseEvent(...))` 触发 Angular 事件处理
- 每次交互后需要 `await sleep(300-500ms)` 等待 DOM 更新
- 截图后记得恢复状态

## 导出文件命名

- 单视图：`{label}.docx` / `{label}.md`
- 全量汇总：`full-document.docx` / `full-document.md`

## 调试技巧

1. 浏览器控制台运行 `document.querySelector('[data-testid="..."]')` 确认元素存在
2. 截图前打印元素 `getBoundingClientRect()` 查看尺寸
3. 用 WPS 打开 DOCX 测试兼容性（Word 更严格但 WPS 方便）
4. MD 文件直接浏览器打开或 VS Code 预览
5. docx 库的 `Packer.toBlob()` 出错时检查 ImageRun 的 `transformation` 是否与图片比例匹配
