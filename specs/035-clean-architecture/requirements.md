# Requirements — 整洁架构与代码优化

## 背景

BLM 项目经过 v1 到 v3 的迭代，核心功能已经稳定，但代码和文档层面累积了以下技术债务：

- `blm_core/` 下 5 个超大模块（storage 114KB、document 84KB、collab 82KB、merge 62KB、server 50KB）职责混杂
- 路由分发与业务逻辑耦合在 `server.py` 中，40+ 路由通过 if/elif 字符串匹配
- `docs/` 目录 29 个文本文件 + 20 张截图散放，缺乏分类和导航
- HTML 与 Markdown 混用，技能文件重复，临时文件入库
- CSS 存在 961 个疑似死样式
- 测试文件按"文件名"而非"领域"组织

## 目标

1. **文档体系重构**：按用户/开发/规格/指导原则分类，建立导航索引，统一 Markdown 格式
2. **后端模块拆分**：按职责分离超大模块，形成清晰的分层边界
3. **测试重组**：按领域和测试层级组织测试文件
4. **代码质量提升**：统一依赖注入、引入路由注册、清理死样式、自动化版本号

## 非目标

- 不改变现有 API 契约和行为
- 不修改数据模型（document schema）
- 不引入新的外部依赖
- 不影响已有工作区文档的可打开/可保存/可预览/可导出能力

## 需求

### R1: 文档体系重组

- 建立 `docs/index.md` 作为文档导航入口
- 按 `user/`（用户文档）、`dev/`（开发文档）、`specs/`（设计规格）、`steering/`（指导原则）、`refactor/`（重构资产）分类
- 将 `.html` 文档统一转为 `.md`
- 删除 `docs/skills/` 下与 `.claude/skills/` 重复的文件
- 将 `docs/tmp/` 移至 `ignore/`
- 截图按功能归类到 `docs/user/screenshots/`

### R2: 后端模块拆分

- `server.py`：路由注册与处理函数分离，按领域拆为 `routes/` 子包
- `storage.py`：按职责拆为 `storage/` 子包（workspace、document_io、history、trash、attachments、zip_bundle）
- `document.py`：模型定义、迁移逻辑、规范化逻辑分离为 `document/` 子包
- 保持所有现有 import 路径的兼容性（通过 `__init__.py` 重导出）

### R3: 测试重组

- 按 `unit/`、`integration/`、`api/` 分层组织
- 拆分超大测试文件（test_backend.py ~3000 行）

### R4: 代码质量改进

- 引入路由注册表替代 if/elif 字符串匹配
- 扩展 `model_strategy.py` 为领域模型唯一真相源
- 分批清理 CSS 死样式
- 构建脚本自动更新 `?v=` 版本号

## 验收标准

1. `docs/index.md` 能清晰导航到所有文档
2. 文档无 `.html` 格式残留
3. `docs/skills/` 和 `docs/tmp/` 已清理
4. 后端模块拆分后所有现有测试通过
5. import 路径向后兼容
6. 已有工作区文档可正常打开、保存、预览、导出
