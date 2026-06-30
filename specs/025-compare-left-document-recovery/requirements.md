# 需求

- 比对弹窗左侧恢复旧版“选择工作区文档”的能力。
- 左侧默认仍选中当前打开文档，保持现有使用路径。
- 用户切换左侧文档后，应清空左侧版本选择并按当前左侧来源刷新候选记录。
- 执行比对时，左侧当前版本应从所选左侧文档加载，而不是始终使用运行时当前文档。
- 本切片不重做旧版完整比对报表，只补文档选择与加载语义。

# 用户旅程

```gherkin
Feature: 比对左侧文档选择

Scenario: 用户选择两个工作区文档的当前版本进行比对
  Given 用户已打开 agent.json
  And 工作区还存在 agent-a.json 与 agent-b.json
  When 用户打开“比对”
  And 将左侧文档切换为 agent-a.json
  And 将右侧文档切换为 agent-b.json
  And 点击“开始比对”
  Then 系统应分别加载 agent-a.json 和 agent-b.json
  And 比对结果应展示两个所选文档的差异
```
