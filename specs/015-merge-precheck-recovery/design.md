# 设计

## 落点

- `ApiService` 增加 `analyzeMerge` 和 `applyMerge`，保持与旧版后端路径一致。
- Shell 工具栏“合并”打开公共弹窗。
- Shell 只负责加载右侧文档、调用合并前检查、展示结果。

## 数据流

1. 用户点击“合并”。
2. 选择右侧工作区文档。
3. Shell 加载右侧文档。
4. Shell 调用 `/api/merge/analyze`，传入左右文档和名称。
5. 页面展示 summary、conflicts、validation_issues。

## 验收

当后端返回 2 个自动合并项、1 个冲突和 1 个校验问题时，弹窗展示对应数量和校验问题文案。
