# Tasks — 整洁架构与代码优化

## 阶段一：文档体系重构（当前）

- [ ] T1: 创建 `docs/index.md` 文档导航索引
- [ ] T2: 创建 `docs/user/` 并迁移用户文档
  - [ ] T2.1: 迁移 `BLM用户手册.md` → `user/manual.md`
  - [ ] T2.2: 转换 `BLM使用工作流建议.html` → `user/workflow.md`
  - [ ] T2.3: 迁移 `BLM协作与弱网排障指南.md` → `user/collaboration.md`
  - [ ] T2.4: 迁移 `BLM多人协作合并比对.md` → `user/merge-comparison.md`
  - [ ] T2.5: 迁移 `screenshots/` → `user/screenshots/`
- [ ] T3: 创建 `docs/dev/` 并迁移开发文档
  - [ ] T3.1: 迁移 `BLM设计文档.md` → `dev/design.md`
  - [ ] T3.2: 迁移 `业务模型设计.md` → `dev/data-model.md`
  - [ ] T3.3: 迁移 `业务建模思考.md` → `dev/business-modeling.md`
  - [ ] T3.4: 迁移 `BLM测试用例.md` → `dev/testing.md`
  - [ ] T3.5: 迁移 `BLM服务端文件夹说明.md` → `dev/server-layout.md`
  - [ ] T3.6: 转换 `BLM v3版本思考.html` → `dev/v3-thinking.md`
  - [ ] T3.7: 迁移 `angular-lost-feature-recovery.md` → `dev/angular-recovery.md`
  - [ ] T3.8: 迁移 `AI_HANDOFF.md` → `dev/ai-handoff.md`
  - [ ] T3.9: 迁移 `release/` → `dev/release-notes/`
- [ ] T4: 创建 `docs/specs/` 并迁移设计规格
  - [ ] T4.1: 迁移 `superpowers/specs/2026-07-02-component-workbench-tabs-design.md`
  - [ ] T4.2: 迁移 `superpowers/specs/2026-07-02-application-service-ux-design.md`
  - [ ] T4.3: 迁移 `superpowers/plans/2026-07-02-application-service-ux.md`
- [ ] T5: 清理冗余
  - [ ] T5.1: 删除 `docs/skills/`（与 `.claude/skills/` 重复）
  - [ ] T5.2: 移动 `docs/tmp/` → `ignore/tmp-docs/`
  - [ ] T5.3: 删除 `docs/superpowers/` 空目录
  - [ ] T5.4: 删除 `docs/release/` 空目录
  - [ ] T5.5: 删除旧位置的散落文件
- [ ] T6: 同步更新 `server.py` 中 `/api/docs/` 路径
- [ ] T7: 验证 — 确保所有文档可通过 `/api/docs/` 访问

## 阶段二：后端模块拆分

- [ ] T8: 拆分 `document.py` → `document/` 子包
- [ ] T9: 拆分 `storage.py` → `storage/` 子包
- [ ] T10: 拆分 `server.py` → `server.py` + `routes/` 子包
- [ ] T11: 每次拆分后运行全量测试确认无回归

## 阶段三：测试重组

- [ ] T12: 创建 `tests/unit/`、`tests/integration/`、`tests/api/` 目录
- [ ] T13: 按领域拆分 `test_backend.py`
- [ ] T14: 按领域拆分 `test_collab.py`
- [ ] T15: 按领域拆分 `test_merge_and_storage.py`

## 阶段四：代码质量改进

- [ ] T16: 第 1 批 CSS 死样式清理
- [ ] T17: 第 2 批 CSS 死样式清理（global_shell）
- [ ] T18: 第 3 批 CSS 死样式清理（交叉验证）
- [ ] T19: 构建脚本自动更新 `?v=` 版本号
- [ ] T20: 扩展 `model_strategy.py` 领域模型定义
