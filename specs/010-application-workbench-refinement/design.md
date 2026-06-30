# Design

## 模型设计

### 服务分组

顶层新增：

```ts
serviceGroups?: Array<{
  uid: string;
  name: string;
  desc?: string;
}>;
```

现有 `services[]` 继续表示“接口”。接口通过 `serviceGroupUid?: string` 弱引用所属服务分组。

设计取舍：
- `serviceGroups[]` 只是接口聚合，不承诺运行时部署语义。
- 接口归属放在接口自身，避免在分组中维护重复 `interfaceUids`。
- 删除分组时，不删除接口，只把接口归入未分组，避免误删业务设计资产。

### 嵌套参数

接口参数继续使用轻量树：

```ts
interface ServiceParam {
  name: string;
  type: string;
  required: boolean;
  note: string;
  children?: ServiceParam[];
}
```

设计取舍：
- `Object`、`Array`、`List`、`Map` 可以拥有 `children`。
- 第一版不区分完整 JSON Schema、Array item schema、Map value schema，统一用 `children` 表达下级字段。
- 变量路径中 `Array/List` 使用 `items[].productCode` 这样的形式表达元素路径。

## UI 设计

### 应用服务 Tab

结构：

```text
服务分组
  接口 POST /api/...
  接口 GET /api/...
未分组接口
  接口 ...
```

本轮补齐可用性：
- 服务分组可直接修改名称和说明。
- 服务分组可折叠 / 展开。
- 服务分组可删除；删除后组内接口进入未分组。
- 可在某个服务分组下直接新建接口，新接口默认归属该分组。
- 接口编辑态可重新选择所属服务分组。

### 参数树

参数表保留树形行：

```text
reservation Object
  warehouseUid String
  items Array
    productCode String
    quantity Number
```

每行支持名称、类型、必填、说明、删除；`Object/Array/List/Map` 支持添加子参数。

### 应用编排 Tab

布局：

```text
顶部：接口选择
左侧：步骤列表 + 添加任务
右侧：选中步骤详情 + 参数变量池 + 输入映射 + 输出绑定 + 返回映射
```

本轮补齐可用性：
- 输入映射、输出绑定、返回映射以 `select` 下拉选择为主。
- 变量池由接口请求参数和前序任务输入/输出累积而来。
- 对第三个任务而言，来源可选：接口请求变量、前两个任务的输入变量、前两个任务的输出变量。
- 嵌套参数会展开成可选择路径，例如：
  - `request.reservation.warehouseUid`
  - `request.reservation.items[].productCode`
  - `step.checkItems.output.itemCheckResult.passed`

## 文件影响

- `frontend-angular/src/app/workbenches/application/app-workbench.ts`
- `frontend-angular/src/app/workbenches/application/app-workbench.html`
- `frontend-angular/src/app/workbenches/application/app-workbench.scss`
- `frontend-angular/src/app/app.spec.ts`
- `specs/010-application-workbench-refinement/requirements.md`
- `specs/010-application-workbench-refinement/design.md`
- `specs/010-application-workbench-refinement/tasks.md`
- `specs/010-application-workbench-refinement/status.md`

## 验证

- BDD 场景先写入 `requirements.md`。
- TDD 先补失败组件测试：
  - 服务分组和组内接口维护。
  - 嵌套变量下拉选择。
- 定向回归：`npm.cmd test -- --watch=false --include src/app/app.spec.ts`。
- 全量回归：`npm.cmd test -- --watch=false`。
- 构建验证：`npm.cmd run build`。
