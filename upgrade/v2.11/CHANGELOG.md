# v2.11 变更记录

## 业务流程功能

### 流程迁移至其它阶段
- 右键菜单支持流程迁移，三级联下拉选择目标阶段
- 当前所属阶段蓝色标记

### 复制流程 / 实体
- 右键菜单支持复制流程和实体
- 复制实体自动复制构件归属和关系连线
- 构件引用用 uid 匹配

### 阶段视图拖曳
- 流程可拖曳到分组框内，不受 detail 模式限制
- 自动清理无效的 stageFlowRef

### 任务参数定义增强
- 参数类型支持"列表"，列表类型可配置子字段
- 参数行新增快捷操作按钮：插入（＋）、上移（↑）、下移（↓）
- 参数定义弹窗只能通过"关闭"/"取消"/"保存"关闭，点击外部不再关闭

## 界面优化

### 任务定义对话框
- 字段顺序调整：任务名称 → 任务类型 → 业务组件 → 业务构件
- 任务调用契约与技术承接位置互换
- "说明"改为"详细设计"，textarea 替换为富文本编辑器
- 富文本工具栏仅聚焦时显示，提供快捷键提示（Ctrl+B/0/1/2, Tab）
- 参数表头：中文名称 / 类型 / 必填 / 英文名称 / 说明/示例
- "保存参数"按钮改为"保存"

### 业务域界面
- "管理任务定义"→"管理任务"，"去定义新任务"→"定义新任务"
- "定义新任务"按钮移至工具栏（"管理任务"旁），与复用框解耦
- "加入节点"→"复用任务"
- "清理空白未引用"→"删除未被使用的任务"，移除"清理未引用"按钮
- 提示语简化
- 任务编辑按钮："编辑"→"查看/编辑"

### 节点任务编排
- 删除无法正常输入的搜索框

### 冲突检测窗口
- 修复 CSS 优先级导致窗口被限制为 360px 的问题

### 表单界面
- 删除按钮（✕）不再被挤到第二行，与复制按钮同行
- 表单卡片和分组头均修复

### 侧边栏
- 任务定义支持点击跳转，跨 tab 自动切到业务域

### 关系图
- 点击空白处取消选中实体

## 数据架构

### Id→Uid 全量迁移
- 删除 `hydrateDocumentForUi` 中的 Uid→Id 临时同步块
- 所有 JS 文件统一使用 Uid 后缀字段（constructUid, businessComponentUid 等）
- 规范化函数输出键名统一为 Uid
- 归属判断函数改为纯 uid 匹配，去除名称回退
- `defineModelUidAliasDeep` 别名安全网保留

### businessRules 防重复
- `getNodeBusinessRules` 按 uid 去重
- 停用 `syncTaskBusinessRulesNote` 自动拼接
- CMC 文档清理：196,962 条规则 → 357 条

### ZIP 压缩归档
- `list_history` / `load_history` 支持 `history/archive.zip` 读取
- `list_submits` / `load_submit` 支持 `collab/submits/archive.zip` 读取
- 压缩脚本：保留最近 100 条，其余入 archive.zip
- 全 workspace 实测：190MB → 70MB（压缩比 63%）

## 工具脚本

`upgrade/v2.11/` 目录下：

| 脚本 | 用途 |
|------|------|
| `repair_workspace.py` | 全量修复（businessRules去重 / rules_note清理 / TD-xxx迁移） |
| `compact_workspace.py` | 归档压缩（保留 100 条，其余入 ZIP） |
| `verify_repair.py` | 修复结果验证 |
| `audit_workspace_duplication.py` | 全量审计重复数据 |
| `clean_workspace_duplication.py` | 批量清理重复 |
| `audit_id_uid_mismatch.py` | Id→Uid 字段名不匹配审计 |
| `audit_alias_dependency.py` | 别名依赖审计 |

## 回归测试

- `test_merge_does_not_duplicate_business_rules`
- `test_canonical_document_preserves_stage_name_after_inline_edit`
- `test_canonical_document_normalizes_stage_flow_ref_process_uid`
- `test_canonical_document_does_not_revert_stage_id_on_new_process`
