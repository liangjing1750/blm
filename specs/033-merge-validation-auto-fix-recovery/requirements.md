# 033 合并校验自动修复恢复 - 需求

## 需求梳理

本轮恢复旧版合并校验问题中的“可自动修复”入口，属于旧版功能复刻。为了控制风险，先恢复一个代表性自动修复类型：`stageFlowRefs.<id>` 失效时，用户可以在合并分析区点击“删除引用”，系统从合并结果草稿中移除该引用及相关连线，并重新调用文档校验接口刷新结果。

旧版行为依据：

- `getMergeValidationFix(issue)` 会把 `stageFlowRefs.*` 识别为自动修复项。
- `applyMergeValidationFixToDocument()` 会删除对应 `stageFlowRefs`，并删除 `stageFlowLinks` 中引用该 ref 的连线。
- `applyMergeValidationFix()` 会调用文档校验接口，并用返回的 `document` 与 `validation_issues` 刷新合并分析结果。

## 用户旅程

```gherkin
Feature: 合并校验自动修复

Scenario: 用户删除失效的阶段流程引用
  Given 合并前检查返回一个 stageFlowRefs 失效校验项
  And 合并结果草稿中包含该引用及相关连线
  When 用户点击“删除引用”
  Then 系统应提交修复后的合并结果草稿到文档校验接口
  And 合并分析区应使用校验接口返回的新问题列表刷新
```

## 边界

- 本轮只恢复 `stageFlowRefs.<id>` 自动修复，不一次性覆盖所有旧版修复类型。
- 不改变服务端合并算法。
- 不在点击修复时保存工作区文档，只更新合并弹窗中的 `merged_document` 草稿。
