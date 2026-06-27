# BLM 数据术语表

生成日期：2026-06-27
来源：扫描所有工作区文档的实际字段名

## 顶层字段

| 字段 | 说明 |
|------|------|
| `meta` | 文档元信息 |
| `roles` | 角色列表 |
| `stages` | 业务阶段 |
| `stageFlowRefs` | 阶段-流程关联 |
| `stageFlowLinks` | 阶段流程连线 |
| `processes` | 业务流程 |
| `entities` | 逻辑实体 |
| `businessComponents` | 业务组件 |
| `businessConstructs` | 业务构件 |
| `taskDefinitions` | 任务定义 |
| `services` | 应用服务（迁移后新增） |
| `terms` | 术语 |
| `rules` | 顶层规则 |
| `language` | 字典 |
| `panorama` | 全景视图配置 |

## businessComponents[]

| 字段 | 说明 |
|------|------|
| `uid` | 唯一标识 |
| `id` | 旧版标识 |
| `name` | 组件名称 |
| `kind` | core / generic |
| `note` | 描述 |
| `entityUids` | 关联实体uid列表 |
| `taskDefinitionUids` | 关联任务定义uid列表 |
| `constructUids` | 关联构件uid列表 |

## businessConstructs[]

| 字段 | 说明 |
|------|------|
| `uid` | 唯一标识 |
| `name` | 构件名称 |
| `businessComponentUid` | 所属组件uid |

## taskDefinitions[]

| 字段 | 说明 |
|------|------|
| `uid` | 唯一标识 |
| `name` | 任务名称 |
| `type` | Query / Service / Process |
| `target` | 实现标识 |
| `address` | 地址 |
| `parameters` | { inputs, outputs } 参数定义 |
| `note` | 描述 |
| `constructUid` | 所属构件uid |
| `businessComponentUid` | 所属组件uid |
| `entityUids` | 关联实体uid列表 |

## entities[]

| 字段 | 说明 |
|------|------|
| `uid` | 唯一标识 |
| `name` | 实体名称 |
| `fields` | 字段列表 |
| `businessConstructUid` | 所属构件uid |

## services[]

| 字段 | 说明 |
|------|------|
| `uid` | 唯一标识 |
| `name` | 服务名称 |
| `method` | GET / POST / PUT / DELETE |
| `path` | 路径 |
| `desc` | 描述 |
| `taskDefinitionUids` | 关联任务定义uid列表 |
| `nodeRefs` | 关联流程节点uid列表 |

## processes[].nodes[]

| 字段 | 说明 |
|------|------|
| `uid` | 唯一标识 |
| `name` | 节点名称 |
| `roleIds` | 角色id列表 |
| `role_id` | 旧版角色id |
| `taskDefinitionUid` | 关联任务定义uid |
| `forms` | 表单列表 |
| `businessRules` | 业务规则列表 |
| `entity_ops` | 实体操作列表 |

## 命名约定

- 关联其他模型用 `{model}Uid`（单数）或 `{model}Uids`（复数列表）
- 例外：旧版 `businessConstructUid` 既是构件关联实体也是实体关联构件
- `constructUid` 和 `businessConstructUid` 语义相同，首选 `constructUid`
