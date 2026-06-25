# 状态：CSS/SCSS 统一规范

更新日期：2026-06-25

## 当前状态：规范已建立，废弃样式已清理，效果显著

## 本轮完成

### 1. 规范文档
- `docs/refactor/css-scss-tiered-spec.md` — 三级管理规范

### 2. shared/ 拆分
- `_base.scss` → `_variables.scss` + `_reset.scss` + `_scroll.scss`

### 3. 文件格式统一
- `.css` → `.scss`，所有 6 个 TS 引用已更新

### 4. 静态死代码扫描
- `tools/scan_dead_css.py` — 构建项目词索引，逐规则判定生死
- 输出 `docs/refactor/dead-css-scan.json`

### 5. 废弃样式批量删除（核心成果）
- `tools/purge_dead_css.py` — 扫描+删除一体化工具

### 6. 效果对比

| 指标 | 删除前 | 删除后 | 降幅 |
|------|--------|--------|------|
| styles.scss 行数 | 9,911 | 3,660 | **-63%** |
| styles.scss 文件大小 | 222 kB | 83 kB | **-63%** |
| styles.css (构建产物) raw | 187 kB | 71 kB | **-62%** |
| styles.css (构建产物) transfer | 27 kB | 12 kB | **-54%** |
| 总构建包 raw | 1.01 MB | 895 kB | **-12%** |
| 总构建包 transfer | 194 kB | 180 kB | -7% |
| 删除规则数 | — | 1,177 | — |
| 残留规则 (still-used) | — | ~579 | — |

### 7. 验证结果
- `npm.cmd test -- --watch=false`: 4 files, 38 tests, all passed
- `npm.cmd run build`: exit code 0
- `curl http://localhost:8081/`: 200 OK，页面正常渲染
- `check_style_tiers.py`: 内联规则从 8231 降至 2937

## 工具链

| 工具 | 用途 |
|------|------|
| `tools/scan_dead_css.py` | 扫描 styles.scss，逐规则判定生死 |
| `tools/purge_dead_css.py` | 扫描+删除一体化 |
| `tools/check_style_tiers.py` | 检查分层合规性 |

## 下一步

1. 将 579 条 still-used 全局规则按主题拆分到 shared/ partials
2. 更新 CSI classification CSV 反映最新状态
3. 组件 SCSS 瘦身（7 个文件超 4 kB budget）
4. 可选：将 purge 脚本集成到 CI

## 剩余风险

- `styles.scss` 仍有 2937 行内联规则（从 8231 大幅下降但仍需组织）
- CSV 分类数据需要重新生成（当前数据过期）
- `styles.scss.bak` 备份文件不应提交到 git
- 浏览器视觉验证需用户手动完成（Chrome 扩展未连接）
- 部分动态类名可能通过 TS 字符串拼接使用，扫描器无法检测
