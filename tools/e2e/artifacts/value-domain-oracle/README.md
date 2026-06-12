# 价值流与业务域视觉 Oracle

这个目录用于保存 `价值流与业务域` 视图的可复现视觉采集结果。

## 使用方式

在 `tools/e2e` 下运行：

```powershell
npm.cmd run capture:value-domain
```

脚本会：

- 启动临时后端服务，或复用 `BLM_VISUAL_BASE_URL` 指向的现有服务。
- 创建一份固定样本文档。
- 进入 `全景工作台 -> 价值流与业务域`。
- 输出查看态、编辑态、弹窗态截图。
- 输出对应的 computed styles JSON。

## 常用参数

```powershell
$env:BLM_VISUAL_LABEL='angular-current'
$env:BLM_VISUAL_TARGET='panorama'
$env:BLM_VISUAL_STATE='both'
$env:BLM_VISUAL_WIDTH='1512'
$env:BLM_VISUAL_HEIGHT='800'
npm.cmd run capture:value-domain
```

如果要采集旧版页面，可以先用旧版本代码启动服务，然后指定：

```powershell
$env:BLM_VISUAL_BASE_URL='http://127.0.0.1:8899'
$env:BLM_VISUAL_LABEL='legacy-oracle'
$env:BLM_VISUAL_TARGET='process'
npm.cmd run capture:value-domain
```

也可以让脚本直接从旧版 worktree 启动服务：

```powershell
$env:BLM_VISUAL_LABEL='legacy-oracle'
$env:BLM_VISUAL_TARGET='process'
$env:BLM_VISUAL_SERVER_CWD='C:\Users\Administrator\Desktop\project\blm\tools\e2e\.tmp\legacy-oracle-worktree'
npm.cmd run capture:value-domain
```

## 输出内容

每次采集会生成一个子目录，包含：

- `view.png` / `view.full.png`
- `edit.png` / `edit.full.png`
- `dialog.png` / `dialog.full.png`
- `*.styles.json`
- `manifest.json`

后续视觉复刻优先对比 `*.styles.json` 中的字体、颜色、边框、间距和尺寸，再用截图确认整体观感。

## 对比两次采集

先分别采集旧版和新版，例如：

```powershell
$env:BLM_VISUAL_LABEL='legacy-oracle'
npm.cmd run capture:value-domain

$env:BLM_VISUAL_LABEL='angular-current'
npm.cmd run capture:value-domain
```

然后运行：

```powershell
npm.cmd run compare:value-domain -- artifacts/value-domain-oracle/legacy-oracle artifacts/value-domain-oracle/angular-current
```

输出会写到新版目录下：

```text
compare-against-legacy-oracle.json
```

报告会列出每个状态、每类元素的尺寸差异和 computed style 差异。优先处理：

- `fontSize`
- `fontWeight`
- `color`
- `backgroundColor`
- `border`
- `borderRadius`
- `padding`
- `width / height`
- `gridTemplateColumns`
