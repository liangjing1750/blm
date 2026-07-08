# BLM 文档导航

欢迎查阅 BLM（Business Language Modeling）文档。本目录按读者角色和用途分类组织。

## 用户文档（`user/`）

面向 BLM 使用者：产品经理、业务架构师、流程编排者、前后端研发。

| 文档 | 说明 |
|------|------|
| [用户手册](user/manual.md) | BLM 完整操作指南：建模、保存、导出、合并 |
| [工作流建议](user/workflow.md) | 团队推广 BLM 的推荐工作流程和角色分工 |
| [协作与排障](user/collaboration.md) | 多人协作配置、弱网环境排障指南 |
| [合并比对](user/merge-comparison.md) | 多人协作保存流程、三路合并规则 |

## 开发文档（`dev/`）

面向 BLM 维护者和贡献者。

| 文档 | 说明 |
|------|------|
| [设计文档](dev/design.md) | 产品边界、模块职责、数据模型、合并策略 |
| [数据模型](dev/data-model.md) | 六层建模体系：价值流→业务域→阶段→流程→节点→步骤 |
| [业务建模思考](dev/business-modeling.md) | 业务建模方法论：迭代校准、流程分析、建模深度 |
| [测试用例](dev/testing.md) | Python 单元测试、浏览器 E2E 测试、核心回归用例 |
| [服务端目录说明](dev/server-layout.md) | workspace/ 目录结构和文件约定 |
| [v3 版本思考](dev/v3-thinking.md) | v3 产品定位、角色定义、工作台设计、落地顺序 |
| [Angular 迁移恢复](dev/angular-recovery.md) | Angular 迁移中丢失功能的恢复跟踪 |
| [AI 交接文档](dev/ai-handoff.md) | AI 开发者上手指南：项目状态、开发规范、验证流程 |
| [发布记录 2026-05-11](dev/release-notes/20260511.md) | 实体状态图、预览增强、对比/合并优化 |
| [发布记录 2026-05-13](dev/release-notes/20260513.md) | 阶段视图预览、附件存储优化、后端健壮性修复 |

## 指导原则（`steering/`）

长期有效的架构、产品、质量约束。

| 文档 | 说明 |
|------|------|
| [架构原则](steering/architecture.md) | 本地优先、文件驱动、向前兼容、业务概念优先 |
| [产品原则](steering/product.md) | 目标用户、成功标准 |
| [质量原则](steering/quality.md) | 旧文档兼容率、回归通过率、工程实践 |

## 设计规格（`specs/`）

近期功能的设计规格与执行计划。

| 文档 | 说明 |
|------|------|
| [构件工作台 Tab 拆分](specs/component-workbench-tabs.md) | 构件工作台四 Tab 设计 |
| [应用服务 UX 设计](specs/application-service-ux.md) | 服务组卡片 + 接口卡片 + 抽屉编辑 |
| [应用服务 UX 执行计划](specs/application-service-ux-plan.md) | 5 步实现任务 |

## 重构资产（`refactor/`）

样式重构过程中的分析数据。

| 文档 | 说明 |
|------|------|
| [CSS/SCSS 三层规范](refactor/css-tiered-spec.md) | 项目级/模块级/组件级样式管理规范 |
| [数据术语表](refactor/data-terminology.md) | 工作区文档字段名扫描结果 |
| [样式分类汇总](refactor/styles-classification.md) | styles.scss 分类：在用/全局/疑似死样式 |

## 相关资源

- [项目 README](../README.md) — 产品介绍、快速开始、JSON Schema
- [AGENTS.md](../AGENTS.md) — AI 编码约定
- [specs/](../specs/) — 34 个历史 spec 包（需求+设计+任务+状态）
