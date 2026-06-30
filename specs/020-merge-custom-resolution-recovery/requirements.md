# 需求梳理

## 背景

旧版合并冲突裁决支持 `custom` 自定义值。Angular 目前已经支持 `left`、`right`、`keep_both`，但当后端返回 `resolution_options: ["left", "right", "custom"]` 时，用户还不能输入自定义值。

## 本轮范围

- 合并冲突项出现 `custom` 选项时显示“自定义值”输入框。
- 用户选择 custom 并输入值后，调用 `/api/merge/apply` 时传递 `{ choice: "custom", custom_value }`。
- apply 成功后沿用现有保存并打开合并文档流程。

## 暂不负责

- 自定义值 JSON 类型编辑器。
- 三方合并 base 文档选择。
- 校验问题自动修复。
