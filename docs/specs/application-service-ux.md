# 应用服务 UX 重设计五步法设计

## 1. 需求梳理

### 1.1 功能归属

本设计属于 Angular 应用工作台：`frontend-angular/src/app/workbenches/application/`。

应用工作台下已有两个三级 tab：

1. 应用服务
2. 应用编排

本轮只重设计“应用服务”tab 的 UX，不重做“应用编排”tab。

### 1.2 当前问题

当前应用服务页面已经有服务组、接口卡片、参数树、JSON 导入、节点引用、编排步骤摘要等能力，但页面把编辑表单直接展开在接口列表里。

这带来三个问题：

- 查看态空：服务组卡片大面积留白，接口信息没有形成稳定的信息层级。
- 编辑态挤：基础信息、请求参数、响应参数全部塞进列表卡片，参数稍多时页面很长。
- 状态语义弱：顶部有“打开编辑/关闭编辑”，但接口卡片里的编辑按钮仍然直接进入内联编辑，查看和编辑没有清晰边界。

### 1.3 本轮目标

采用“服务分组优先 + 接口卡片 + 右侧抽屉编辑”。

主页面只负责浏览、定位和进入编辑：

- 看有哪些服务组。
- 看每个服务组下有哪些接口。
- 看每个接口的关键摘要。
- 点击接口或编辑按钮进入抽屉。

抽屉负责接口和服务组的详细维护：

- 接口基础信息。
- 请求参数。
- 响应参数。
- 关联流程节点。
- 保存、取消、删除。

### 1.4 本轮不负责什么

本轮不改变 `services` 和 `serviceGroups` 数据模型。

本轮不重做应用编排算法和参数映射逻辑。

本轮不引入 OpenAPI 完整 schema 编辑器。参数树仍使用当前轻量模型：`name/type/required/note/children`。

本轮不改变流程节点里“应用服务”引用的展示逻辑。

### 1.5 验收旅程

Given 文档中有服务组和接口。

When 用户进入应用工作台的应用服务 tab。

Then 页面以服务组卡片为主，每个服务组显示接口卡片列表。

When 用户查看接口卡片。

Then 卡片显示方法、路径、接口名、请求参数数、响应参数数、编排步骤数、关联节点数。

When 用户点击接口卡片。

Then 右侧打开接口抽屉，默认按当前“打开编辑/关闭编辑”状态决定是否可编辑。

When 用户点击“打开编辑”。

Then 抽屉内字段可编辑，卡片主区域仍保持清爽浏览态。

When 用户点击“新建接口”。

Then 新建草稿接口并打开接口抽屉，默认归属第一个服务组；没有服务组时归入未分组。

## 2. 概要设计

### 2.1 信息架构

应用服务 tab 分成三层：

1. 页面工具条：搜索、新建服务组、新建接口、编辑态切换。
2. 服务组卡片：服务组名称、说明、接口数、添加接口入口。
3. 接口卡片：接口摘要和进入详情入口。

右侧抽屉是第四层，但它是临时编辑面板，不参与主页面流式布局。

### 2.2 页面主结构

```text
应用服务
  Toolbar
    搜索服务 / 接口 / 路径
    新建服务
    新建接口

  Service Group Grid/List
    Service Group Card
      Header
        服务组名称
        服务组说明
        接口数量
        添加接口
      Interface Cards
        Method
        Path
        Name
        请求参数数
        响应参数数
        编排步骤数
        节点引用数
```

服务组仍以纵向列表为主，因为服务组下有接口集合，纵向展开更利于扫描。接口卡片在服务组内可使用响应式网格。

### 2.3 抽屉结构

接口抽屉：

```text
Interface Drawer
  Header
    接口名称
    Method + Path
    关闭

  基础信息
    名称
    所属服务组
    Method
    Path
    说明

  请求参数
    参数树表格
    从 JSON 导入
    复制为 JSON
    添加参数

  响应参数
    参数树表格
    从 JSON 导入
    复制为 JSON
    添加参数

  关联流程节点
    节点标签列表

  Footer
    保存
    取消
    删除
```

服务组抽屉：

```text
Service Group Drawer
  服务名称
  服务说明
  保存
  取消
  删除
```

服务组抽屉要轻，不把接口列表搬进去。接口归属通过接口抽屉里的服务组选择维护。

### 2.4 UI 状态

新增或调整的 UI 状态：

```ts
selectedServiceId: signal<string>
serviceDrawer: signal<LegacyService | null>
serviceGroupDrawer: signal<LegacyServiceGroup | null>
editorOpen: signal<boolean>
```

现有 `editingSvcId` 可以被抽屉状态替代，或在第一轮实现中作为兼容状态继续存在，但用户可见编辑入口应转向抽屉。

`editorOpen` 继续由顶部“打开编辑/关闭编辑”控制。关闭编辑时：

- 抽屉可以打开。
- 字段只读。
- 保存、删除、添加参数等写操作按钮隐藏或禁用。

### 2.5 数据流

读模型不变：

- 服务组来自 `doc.serviceGroups`
- 接口来自 `doc.services`
- 接口归属通过 `service.serviceGroupUid`
- 请求参数来自 `service.requestParams`
- 响应参数来自 `service.responseParams`
- 编排步骤来自 `service.orchestration.steps`
- 节点引用来自 `service.nodeRefs`

写模型的数据结构不变，但新建服务组的中间态从“点击即落盘”调整为“抽屉保存后落盘”：

- 保存服务组抽屉时写入 `doc.serviceGroups`
- 新建接口写入 `doc.services`
- 编辑接口直接修改当前服务对象
- 删除服务组时，组内接口移动到未分组，沿用当前逻辑

## 3. 详细 UX 设计

### 3.1 查看态

查看态的主页面应该像目录，而不是表单。

服务组卡片显示：

- 服务组名称。
- 服务组说明，没有说明时显示轻量空提示。
- 接口数量。
- 添加接口按钮，只有编辑态打开时可用。

接口卡片显示：

- HTTP 方法。
- 接口路径。
- 接口名称。
- 请求参数数量。
- 响应参数数量。
- 编排步骤数量。
- 流程节点引用数量。

接口卡片不直接展示参数表。参数表属于抽屉详情。

### 3.2 抽屉查看态

点击接口卡片打开抽屉。

如果顶部是“关闭编辑”状态，抽屉展示只读信息：

- 基础信息以文本方式展示。
- 请求/响应参数以紧凑参数树展示。
- JSON 导入、添加参数、删除参数、保存按钮不可见。

这样用户可以查看详情，但不会误触修改。

### 3.3 抽屉编辑态

点击“打开编辑”后，抽屉进入编辑态：

- 基础信息变成表单。
- 请求参数和响应参数可增删改。
- JSON 导入和复制 JSON 可用。
- 保存、取消、删除按钮可用。

主页面不进入大面积表单状态。编辑复杂度集中在抽屉里。

### 3.4 新建接口

点击“新建接口”：

- 立即创建草稿接口。
- 如果存在服务组，默认归属第一个服务组。
- 打开接口抽屉。
- 自动进入编辑态。

如果用户取消草稿：

- 草稿接口从 `doc.services` 移除。

当前代码里已有 `draft` 接口逻辑，实现时应复用。

### 3.5 新建服务组

点击“新建服务”：

- 打开服务组抽屉。
- 自动进入编辑态。
- 保存后写入 `doc.serviceGroups`。

如果用户取消新建：

- 不写入服务组。

当前代码是点击后立即写入 `doc.serviceGroups`，实现阶段建议改为抽屉保存后写入，减少无效空服务组。

### 3.6 搜索

搜索继续匹配：

- 服务组名称。
- 服务组说明。
- 接口名称。
- 接口路径。

搜索结果仍按服务组展示。命中的服务组或含命中接口的服务组保留显示。

### 3.7 空状态

没有服务组和接口时：

```text
暂无应用服务
先新建服务组，再添加接口。
```

有服务组但组内没有接口时：

```text
暂无接口
```

未分组接口必须继续显示为“未分组接口”，避免旧文档里的接口丢失入口。

## 4. 详细模块设计

### 4.1 `ApplicationWorkbenchComponent`

职责：

- 管理应用服务和应用编排 tab。
- 管理编辑态开关。
- 管理服务组卡片和接口卡片投影。
- 管理接口抽屉和服务组抽屉状态。
- 复用现有参数树、JSON 导入和复制逻辑。

不负责：

- 不负责应用编排算法重写。
- 不负责流程节点引用编辑的全流程设计。
- 不负责 OpenAPI schema 生成。

### 4.2 建议方法

```ts
openServiceDrawer(service: LegacyService): void
openNewServiceDrawer(serviceGroupUid?: string): void
closeServiceDrawer(): void
saveServiceDrawer(): void
deleteServiceFromDrawer(): Promise<void>

openServiceGroupDrawer(group?: LegacyServiceGroup): void
closeServiceGroupDrawer(): void
saveServiceGroupDrawer(): void
deleteServiceGroupFromDrawer(): Promise<void>

requestParamCount(service: LegacyService): number
responseParamCount(service: LegacyService): number
serviceCardMeta(service: LegacyService): string
```

### 4.3 模板调整

第一轮可以仍在 `app-workbench.html` 内完成，不立即拆子组件。

但模板需要按区域分区：

- 应用服务工具条。
- 服务组卡片列表。
- 接口卡片。
- 接口抽屉。
- 服务组抽屉。
- JSON 导入弹窗。

如果实现后模板继续膨胀，下一轮再拆：

- `ApplicationServiceCardsComponent`
- `ApplicationServiceDrawerComponent`
- `ApplicationServiceGroupDrawerComponent`

### 4.4 样式调整

继续使用：

`frontend-angular/src/app/workbenches/application/app-workbench.scss`

新增或调整样式分区：

- `.app-service-board`
- `.app-service-group-card`
- `.app-interface-grid`
- `.app-interface-card`
- `.app-interface-meta`
- `.app-service-drawer`
- `.app-service-group-drawer`
- `.app-param-tree`

视觉原则：

- 主页面不出现大块 input。
- 卡片圆角控制在 8px 左右。
- 抽屉宽度可复用实体/构件抽屉的可拖拽逻辑，但第一轮不强制。
- 参数表密度要高于卡片区，但只出现在抽屉里。

## 5. 用例、测试和验收

### 5.1 组件测试

需要覆盖：

1. 应用服务 tab 渲染服务组卡片和接口卡片。
2. 服务组卡片显示接口数量。
3. 接口卡片显示方法、路径、请求参数数、响应参数数、编排步骤数、节点引用数。
4. 主页面查看态不出现参数编辑表格。
5. 点击接口卡片打开接口抽屉。
6. 关闭编辑状态下，抽屉字段只读或写操作按钮不可用。
7. 点击打开编辑后，抽屉允许编辑接口基础信息和参数。
8. 新建接口打开抽屉，生成草稿，取消后草稿移除。
9. 新建服务打开服务组抽屉，保存后写入 `serviceGroups`。
10. 删除服务组后，组内接口移动到未分组。
11. 搜索接口路径时，只显示命中的接口所在服务组。
12. 未分组接口继续显示。

### 5.2 浏览器验证

实现后需要验证：

- 进入应用工作台。
- 查看应用服务卡片总览。
- 打开接口抽屉。
- 切换“打开编辑/关闭编辑”。
- 新建接口并保存。
- 新建服务组并保存。
- 删除服务组，确认接口移动到未分组。
- 切到应用编排，确认原入口不受影响。

### 5.3 构建验证

实现后运行：

```powershell
cd C:\Users\Administrator\Desktop\project\blm\frontend-angular
npm.cmd test
npm.cmd run build
```

构建会刷新根目录 `app/` 产物，提交前需要检查并一并提交。

### 5.4 风险

当前应用工作台模板已经较长。第一轮如果继续在单文件内完成，速度快但模板会更重；如果直接拆组件，改动面会变大。建议第一轮先在当前组件内完成 UX 转向，第二轮再按稳定边界拆组件。

当前“新建服务”会立即写入服务组。改为抽屉保存后写入，会改变中间态行为，但用户体验更可控。测试需要覆盖取消不落盘。

顶部“打开编辑/关闭编辑”需要和抽屉状态形成一致语义。关闭编辑时允许查看抽屉，但不允许写操作。
