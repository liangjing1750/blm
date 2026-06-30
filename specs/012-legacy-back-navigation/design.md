# 设计

返回历史属于 Shell 导航能力，不属于具体业务工作台。

## 落点

- `core/runtime/angular-runtime.ts`：维护 Angular 运行时导航快照栈。
- `core/shell/tab-bar/shell-tab-bar-legacy-adapter.ts`：优先兼容旧 runtime 函数；没有旧函数时使用 Angular runtime。
- `core/shell/tab-bar/shell-tab-bar.component.ts`：点击返回后同步地址栏。

## 快照字段

本切片只记录发布前最需要的定位字段：

- `mainTab`
- `procId`
- `taskId`
- `entityId`

## 验收

从全景工作台切到流程工作台后，返回按钮启用；点击返回后恢复全景工作台，并把地址栏同步为 `/panorama`。
