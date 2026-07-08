# Design — 整洁架构与代码优化

## 1. 文档体系设计

### 1.1 目标结构

```
docs/
├── index.md                        # 文档导航索引
├── user/                           # 用户文档
│   ├── manual.md                   #   用户手册（← BLM用户手册.md）
│   ├── workflow.md                 #   工作流建议（← BLM使用工作流建议.html）
│   ├── collaboration.md            #   协作与排障（← BLM协作与弱网排障指南.md）
│   ├── merge-comparison.md         #   多人协作合并比对（← BLM多人协作合并比对.md）
│   └── screenshots/                #   截图
├── dev/                            # 开发文档
│   ├── design.md                   #   设计文档（← BLM设计文档.md）
│   ├── data-model.md               #   数据模型（← 业务模型设计.md）
│   ├── business-modeling.md        #   业务建模思考（← 业务建模思考.md）
│   ├── testing.md                  #   测试用例（← BLM测试用例.md）
│   ├── server-layout.md            #   服务端目录说明（← BLM服务端文件夹说明.md）
│   ├── v3-thinking.md              #   v3 版本思考（← BLM v3版本思考.html）
│   ├── angular-recovery.md         #   Angular 迁移恢复（← angular-lost-feature-recovery.md）
│   ├── ai-handoff.md               #   AI 交接文档（← AI_HANDOFF.md）
│   └── release-notes/              #   发布记录
│       ├── 20260511.md
│       └── 20260513.md
├── steering/                       # 指导原则（保持不变）
│   ├── architecture.md
│   ├── product.md
│   └── quality.md
├── specs/                          # 设计规格
│   ├── component-workbench-tabs.md
│   ├── application-service-ux.md
│   └── application-service-ux-plan.md
└── refactor/                       # 重构资产（保持不变）
    ├── css-tiered-spec.md
    ├── data-terminology.md
    ├── dead-css-scan.json
    ├── styles-classification.csv
    └── styles-classification.md
```

### 1.2 迁移策略

- 使用 `git mv` 移动文件以保留 Git 历史
- HTML 文件提取正文内容，转为 Markdown，原文件删除
- 旧文件位置不留存根

---

## 2. 后端模块拆分设计

### 2.1 server.py 拆分

当前 `server.py`（50KB）承担 HTTP 服务启动 + 40+ 路由处理 + 请求日志 + 响应压缩。

**拆分方案：**

```
blm_core/
├── server.py                      # HTTP 服务启动、静态文件、路由注册表
├── routes/
│   ├── __init__.py                # 路由注册表 ROUTES
│   ├── documents.py               # /api/files, /api/load, /api/save, /api/new, /api/rename, /api/copy, /api/delete
│   ├── history.py                 # /api/history, /api/versions
│   ├── trash.py                   # /api/trash
│   ├── collab_routes.py           # /api/collab/*
│   ├── merge_routes.py            # /api/merge/*
│   ├── export_routes.py           # /api/export*, /api/export-jobs/*
│   ├── feedback_routes.py         # /api/feedback*
│   ├── attachment_routes.py       # /api/attachment*
│   ├── docs_routes.py             # /api/docs*
│   └── agent_routes.py            # /api/agent/*
```

**路由注册模式（替代 if/elif）：**

```python
# routes/__init__.py
ROUTES = [
    ("GET",  "/api/files",              documents.handle_list),
    ("GET",  "/api/files/meta",         documents.handle_meta),
    ("GET",  "/api/load/",              documents.handle_load),        # prefix match
    ("POST", "/api/save/",              documents.handle_save),
    ("POST", "/api/new",                documents.handle_new),
    ("POST", "/api/rename",             documents.handle_rename),
    # ...
]
```

`server.py` 中遍历 `ROUTES` 进行前缀/精确匹配，找到后调用对应 handler。

### 2.2 storage.py 拆分

当前 `storage.py`（114KB）承担文件 I/O + 文档包目录管理 + 快照/版本/回收站/附件 + ZIP 打包。

**拆分方案：**

```
blm_core/
├── storage/
│   ├── __init__.py                # 统一导出 WorkspaceStorage
│   ├── workspace.py               # 工作区扫描、创建、校验
│   ├── document_io.py             # JSON 读写、保存/加载、revision 管理
│   ├── history.py                 # 自动快照、命名版本
│   ├── trash.py                   # 回收站增删查改
│   ├── attachments.py             # 附件上传、索引、下载
│   └── zip_bundle.py              # ZIP 打包/解包
```

`blm_core/storage/__init__.py` 重导出 `WorkspaceStorage` 类，保持向后兼容。

### 2.3 document.py 拆分

当前 `document.py`（84KB）承担模型定义 + 迁移逻辑 + 规范化 + 校验。

**拆分方案：**

```
blm_core/
├── document/
│   ├── __init__.py                # 统一导出 canonical_document, migrate_document 等
│   ├── model.py                   # 文档结构定义、字段常量
│   ├── migrate.py                 # 版本迁移（v1→v2→v3→v4），每个版本独立函数
│   ├── canonical.py               # 规范化、去重、UID 生成
│   └── validate.py                # 校验逻辑
```

### 2.4 拆分原则

- **每次只拆一个模块**，拆完跑全量测试确认无回归
- **`__init__.py` 重导出**保持旧 import 路径有效
- **不在拆分过程中重构业务逻辑**，仅调整文件边界
- 拆分顺序：document → storage → server → collab → merge

---

## 3. 测试重组设计

### 3.1 目标结构

```
tests/
├── unit/                           # 纯单元测试
│   ├── test_document_migrate.py
│   ├── test_document_canonical.py
│   ├── test_merge_engine.py
│   └── test_model_strategy.py
├── integration/                    # 集成测试（依赖文件系统）
│   ├── test_storage.py
│   ├── test_collab.py
│   ├── test_collab_full_scene.py
│   └── fixtures/
├── api/                            # API 级测试
│   ├── test_backend_documents.py
│   ├── test_backend_merge.py
│   └── test_backend_export.py
├── test_feedback.py
├── test_docs.py
├── test_project_layout.py
├── test_runtime_config.py
└── test_uid_unification.py
```

---

## 4. 代码质量改进设计

### 4.1 CSS 死样式清理

根据 `docs/refactor/dead-css-scan.json` 的结果，分 3 批清理：

1. **第 1 批**：确认死样式（不在任何 Angular 模板中出现且不在全局 shell 中的选择器）
2. **第 2 批**：`global_shell` 类中的样式，逐个人工确认
3. **第 3 批**：交叉验证，确保清理后无视觉回归

### 4.2 版本号自动化

在 `rebuild.bat` 或构建流程中增加自动更新 `?v=` 的逻辑：

```bash
# 以当前 git commit 短 hash 作为版本号
V=$(git rev-parse --short HEAD)
sed -i "s/\?v=[^\"']*/\?v=$V/g" app/index.html
```

---

## 5. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 模块拆分导致 import 错误 | `__init__.py` 重导出 + 全量测试覆盖 |
| 文档移动导致 `/api/docs/` 路由失效 | 同步更新 `server.py` 中文档查找路径 |
| HTML→MD 转换丢失格式 | 保留 HTML 中的重要结构（表格、列表），用 Markdown 等效表达 |
| CSS 清理导致样式丢失 | 分批清理 + 每批视觉回归验证 |
