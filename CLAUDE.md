# BLM 项目开发规范

## 缓存与测试

### 静态文件缓存版本

修改 `app/` 目录下的 JS/CSS 文件后，**必须**同步更新 `app/index.html` 中的 `?v=` 版本号：

```html
<link rel="stylesheet" href="style.css?v=N">
<script src="state.js?v=N"></script>
```

所有 JS/CSS 使用**同一个版本号**，每次修改后递增。当前版本号见 `index.html`。

### 服务端代码变更

修改 `blm_core/` 下的 Python 文件后：
1. 重启 BLM 服务：`pkill -f "python blm.py" && python blm.py`
2. 前端静态文件也需同时刷新（见上条）

### 前端验证流程

每次修改后，按以下顺序验证：
1. 重启服务
2. 浏览器 **Ctrl+Shift+R**（或 Ctrl+F5）强刷，跳过缓存
3. 打开 DevTools → Network 标签，确认 JS/CSS 请求不带 `(disk cache)` 标记
4. 执行增删改查操作，确认核心功能正常

### 后端验证流程

```bash
# 验证 migrate_document 无异常
python -c "from blm_core.document import canonical_document; import json; canonical_document(json.load(open('workspace/DOCNAME/manifest.json')))"

# 验证复制、保存等 API
curl -s http://localhost:8081/api/runtime
```

### 关键原则

- 修改数据模型（如新增/删除字段）后，必须全局搜索所有 `.get("field")` 和 `["field"]` 访问点
- `app/index.html` 的 `?v=` 版本号是**手动管理**的，不会自动递增
- 服务端已设置 `Cache-Control: no-store`，但浏览器仍可能缓存静态文件
