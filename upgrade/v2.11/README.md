# v2.11 升级说明

## 数据修复

运行 `repair_workspace.py` 修复 workspace 下所有文档的三层数据（manifest / submits / history）。

### 修复内容

1. **businessRules 按 uid 去重** — 防御协作合并导致的规则累积重复
2. **rules_note 过期清理** — 删除 >1KB 且与实际规则不匹配的衍生字符串
3. **TD-xxx → uid 迁移** — 修正 orchestrationTasks 中未更新的旧格式任务定义引用
4. **forms / userSteps / orchestrationTasks 按 uid 去重**

### 用法

```bash
# 预览（不修改文件）
python upgrade/v2.11/repair_workspace.py

# 执行修复
python upgrade/v2.11/repair_workspace.py --apply
```

### 代码变更

- `app/state.js`: `getNodeBusinessRules` 加 uid 去重防护
- `app/process.js`: `syncTaskBusinessRulesNote` 停用（rules_note 不再自动拼接）
- `tests/test_backend.py`: 新增 `test_merge_does_not_duplicate_business_rules`

### 工具脚本

- `tools/audit_workspace_duplication.py` — 全量审计重复数据
- `tools/clean_workspace_duplication.py` — 批量清理重复
- `tools/audit_id_uid_mismatch.py` — Id→Uid 字段名不匹配审计
- `tools/audit_alias_dependency.py` — 别名依赖审计
