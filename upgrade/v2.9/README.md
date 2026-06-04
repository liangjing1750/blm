# v2.9 升级说明

## 目录结构调整

`.history/` 和 `.versions/` 从 workspace 级移到文档级目录下：

```
旧: workspace/.history/DOCNAME/
新: workspace/DOCNAME/history/

旧: workspace/.versions/DOCNAME/
新: workspace/DOCNAME/versions/
```

## 迁移步骤

```bash
# 1. 停止 BLM 服务
# 2. 试运行查看影响范围
python upgrade/v2.9/migrate_dirs.py --dry-run

# 3. 执行迁移
python upgrade/v2.9/migrate_dirs.py

# 4. 确认后手动删除 workspace/.history/ 和 workspace/.versions/
```
