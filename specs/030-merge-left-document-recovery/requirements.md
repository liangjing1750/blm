# 需求

- 合并弹窗恢复旧版左侧文档选择能力。
- 左侧默认仍为当前打开文档，保持当前使用路径。
- 用户可以将左侧切换为任意工作区文档。
- 执行合并前检查时，`left_name` 和 `left_document` 必须来自左侧选择的文档。
- 本切片不恢复旧版左侧版本来源选择，只恢复工作区当前版本文档选择。

# 用户旅程

```gherkin
Feature: 合并左侧文档选择

Scenario: 用户选择两个非当前工作区文档执行合并前检查
  Given 用户已打开 agent.json
  And 工作区存在 agent-a.json 与 agent-b.json
  When 用户打开“合并”
  And 将左侧文档选择为 agent-a.json
  And 将右侧文档选择为 agent-b.json
  And 点击“合并前检查”
  Then 请求应使用 agent-a.json 作为 left_name
  And 请求应使用 agent-b.json 作为 right_name
```
