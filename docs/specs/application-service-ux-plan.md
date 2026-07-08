# Application Service UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the application service tab into service-group cards, interface summary cards, and right-side drawers for viewing and editing.

**Architecture:** Keep the existing `ApplicationWorkbenchComponent` as the first implementation boundary to avoid a broad component split. Reuse the existing `services`, `serviceGroups`, parameter tree, JSON import/copy, and orchestration summary logic, but move editing state from inline interface cards into service and service-group drawers controlled by `editorOpen`.

**Tech Stack:** Angular standalone components, signals, template control flow, FormsModule, Vitest/Angular tests, existing BLM runtime document state.

---

### Task 1: Lock Service Card Browsing Behavior

**Files:**
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.spec.ts`

- [ ] **Step 1: Write the failing service-card test**

Add this test after `uses the shared workbench tab shell and keeps the editor toggle visible`:

```ts
  it('renders application services as service group cards and interface summary cards', () => {
    const runtime = getAngularRuntimeState();
    runtime.doc.services[0].requestParams = [{ name: 'orderId', type: 'String', required: true, note: '' }];
    runtime.doc.services[0].responseParams = [{ name: 'result', type: 'Object', required: false, note: '' }];
    runtime.doc.services[0].nodeRefs = ['node-submit'];
    runtime.doc.services[0].orchestration = {
      variables: [],
      steps: [{ uid: 'step-1', name: '保存订单', stepAlias: 'step1', taskDefinitionUid: 'task-1', inputMapping: [], outputMapping: [] }],
      returnMapping: [],
    };
    runtime.doc.processes = [{ uid: 'process-1', name: '订单流程', nodes: [{ uid: 'node-submit', name: '提交订单' }] }];

    fixture.detectChanges();

    const group = host.querySelector('[data-testid="service-group-card-service-group-1"]');
    expect(group?.textContent).toContain('订单服务');
    expect(group?.textContent).toContain('1 个接口');

    const card = host.querySelector('[data-testid="interface-card-svc-1"]');
    expect(card?.textContent).toContain('POST');
    expect(card?.textContent).toContain('/orders');
    expect(card?.textContent).toContain('提交订单');
    expect(card?.textContent).toContain('请求 1');
    expect(card?.textContent).toContain('响应 1');
    expect(card?.textContent).toContain('编排 1');
    expect(card?.textContent).toContain('节点 1');
    expect(host.querySelector('.svc-params-table')).toBeFalsy();
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
cd C:\Users\Administrator\Desktop\project\blm\frontend-angular
npm.cmd test
```

Expected: the new test fails because `service-group-card-*` does not exist and inline service cards still own the old layout.

- [ ] **Step 3: Implement summary helpers**

In `frontend-angular/src/app/workbenches/application/app-workbench.ts`, add these methods near `stepCount`:

```ts
  protected requestParamCount(svc: LegacyService): number {
    return this.serviceRequestParams(svc).length;
  }
  protected responseParamCount(svc: LegacyService): number {
    return this.serviceResponseParams(svc).length;
  }
  protected serviceGroupTitle(group: LegacyServiceGroup | null): string {
    return group ? group.name || this.uid(group) : '未分组接口';
  }
  protected serviceGroupDesc(group: LegacyServiceGroup | null): string {
    return group ? group.desc || '暂无服务说明' : '旧文档或未归属服务的接口会显示在这里。';
  }
```

- [ ] **Step 4: Replace the main service tab markup with summary cards**

In `frontend-angular/src/app/workbenches/application/app-workbench.html`, replace the current `@if (activeTab() === 'service')` body before the orchestration tab with:

```html
  @if (activeTab() === 'service') {
    <div class="comp-tab-body app-service-board">
      <div class="comp-toolbar app-service-toolbar">
        <input type="search" placeholder="搜索服务 / 接口 / 路径" [ngModel]="svcKeyword()" (ngModelChange)="svcKeyword.set($event)" />
        <button class="btn btn-outline btn-sm" type="button" data-testid="service-group-new" (click)="openServiceGroupDrawer()">+ 新建服务</button>
        <button class="btn btn-primary btn-sm" type="button" data-testid="service-interface-new" (click)="openNewServiceDrawer()">+ 新建接口</button>
      </div>

      <div class="svc-groups app-service-groups">
        @for (item of groupedServices(); track item.group ? uid(item.group) : '__ungrouped__') {
          <section class="svc-group app-service-group-card" [attr.data-testid]="item.group ? 'service-group-card-' + uid(item.group) : 'service-group-card-ungrouped'">
            <header class="svc-group-head app-service-group-head">
              <div>
                <strong>{{ serviceGroupTitle(item.group) }}</strong>
                <p>{{ serviceGroupDesc(item.group) }}</p>
              </div>
              <span>{{ item.services.length }} 个接口</span>
              @if (item.group) {
                <button class="btn-ghost-sm" type="button" [attr.data-testid]="'service-group-edit-' + uid(item.group)" (click)="openServiceGroupDrawer(item.group)">编辑服务</button>
                <button class="btn-ghost-sm" type="button" [attr.data-testid]="'service-group-add-interface-' + uid(item.group)" (click)="openNewServiceDrawer(uid(item.group))">+ 接口</button>
              } @else {
                <button class="btn-ghost-sm" type="button" data-testid="service-group-add-interface-ungrouped" (click)="openNewServiceDrawer('')">+ 接口</button>
              }
            </header>

            <div class="svc-cards app-interface-grid">
              @for (svc of item.services; track uid(svc)) {
                <article class="svc-card app-interface-card" [attr.data-testid]="'interface-card-' + uid(svc)" (click)="openServiceDrawer(svc)">
                  <div class="svc-head app-interface-card-head">
                    <span class="svc-method-tag" [class.GET]="svc.method==='GET'" [class.POST]="svc.method!=='GET'">{{ svc.method || 'POST' }}</span>
                    <div>
                      <strong>{{ svc.name || uid(svc) }}</strong>
                      <code>{{ svc.path || '/' }}</code>
                    </div>
                    <button class="btn-ghost-sm" type="button" [attr.data-testid]="'interface-edit-' + uid(svc)" (click)="openServiceDrawer(svc); $event.stopPropagation()">查看</button>
                  </div>
                  <div class="app-interface-meta">
                    <span>请求 {{ requestParamCount(svc) }}</span>
                    <span>响应 {{ responseParamCount(svc) }}</span>
                    <span>编排 {{ stepCount(svc) }}</span>
                    <span>节点 {{ (svc.nodeRefs || []).length }}</span>
                  </div>
                </article>
              } @empty {
                <div class="app-service-empty-inline">暂无接口</div>
              }
            </div>
          </section>
        } @empty {
          <div class="app-service-empty-state">
            <strong>暂无应用服务</strong>
            <span>先新建服务，再添加接口。</span>
            <button class="btn btn-primary btn-sm" type="button" (click)="openServiceGroupDrawer()">新建服务</button>
          </div>
        }
      </div>
    </div>
  }
```

- [ ] **Step 5: Run the test and verify it passes**

Run:

```powershell
cd C:\Users\Administrator\Desktop\project\blm\frontend-angular
npm.cmd test
```

Expected: all tests compile; the new service-card test passes after the next tasks add drawer methods referenced by the template.

### Task 2: Add Interface Drawer State and Read-Only Detail

**Files:**
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.ts`
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.html`
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.spec.ts`

- [ ] **Step 1: Write the failing drawer test**

Add this test after the service-card test:

```ts
  it('opens an interface drawer in read-only mode when editing is closed', () => {
    host.querySelector<HTMLElement>('[data-testid="interface-card-svc-1"]')?.click();
    fixture.detectChanges();

    const drawer = host.querySelector('[data-testid="service-interface-drawer"]');
    expect(drawer?.textContent).toContain('提交订单');
    expect(drawer?.textContent).toContain('/orders');
    expect(drawer?.textContent).toContain('请求参数');
    expect(drawer?.textContent).toContain('响应参数');
    expect(drawer?.querySelector('input')).toBeFalsy();
    expect(drawer?.querySelector('[data-testid="service-drawer-save"]')).toBeFalsy();
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run `npm.cmd test` from `frontend-angular`.

Expected: fails because the interface drawer does not exist.

- [ ] **Step 3: Add drawer state and methods**

In `app-workbench.ts`, add signals near `editorOpen`:

```ts
  protected readonly serviceDrawerId = signal('');
  protected readonly serviceGroupDrawer = signal<Partial<LegacyServiceGroup> | null>(null);
```

Add methods near `startEdit`:

```ts
  protected serviceDrawer(): LegacyService | null {
    const id = this.serviceDrawerId();
    return this.services().find((service) => this.uid(service) === id) || null;
  }
  protected openServiceDrawer(svc: LegacyService): void {
    this.ensureServiceShape(svc);
    this.serviceDrawerId.set(this.uid(svc));
  }
  protected closeServiceDrawer(): void {
    const svc = this.serviceDrawer();
    if (svc?.uid === 'draft') {
      this.doc().services = this.services().filter((service) => service !== svc);
      this.touch();
    }
    this.serviceDrawerId.set('');
  }
```

- [ ] **Step 4: Add the read-only drawer template**

Append this before `</section>` in `app-workbench.html`:

```html
  @if (serviceDrawer(); as svc) {
    <div class="drawer-overlay" data-testid="service-interface-drawer" (click)="closeServiceDrawer()">
      <aside class="drawer app-service-drawer" (click)="$event.stopPropagation()">
        <header class="drawer-head">
          <div>
            <h3>{{ svc.name || uid(svc) || '未命名接口' }}</h3>
            <span>{{ svc.method || 'POST' }} {{ svc.path || '/' }}</span>
          </div>
          <button class="drawer-close" type="button" (click)="closeServiceDrawer()">×</button>
        </header>
        <div class="drawer-body">
          @if (!editorOpen()) {
            <section class="drawer-section">
              <div class="drawer-section-head"><strong>基础信息</strong></div>
              <p class="drawer-read-row"><span>服务</span><strong>{{ serviceGroupTitle(serviceGroups().find(group => uid(group) === svc.serviceGroupUid) || null) }}</strong></p>
              <p class="drawer-read-row"><span>说明</span><strong>{{ svc.desc || '暂无说明' }}</strong></p>
            </section>
            <section class="drawer-section">
              <div class="drawer-section-head"><strong>请求参数</strong></div>
              @for (row of paramRows(serviceRequestParams(svc)); track row.testPath) {
                <p class="drawer-read-row" [style.padding-left.px]="row.level * 16"><span>{{ row.param.name || '未命名参数' }}</span><strong>{{ row.param.type || 'String' }}</strong></p>
              } @empty {
                <p class="muted">暂无请求参数</p>
              }
            </section>
            <section class="drawer-section">
              <div class="drawer-section-head"><strong>响应参数</strong></div>
              @for (row of paramRows(serviceResponseParams(svc)); track row.testPath) {
                <p class="drawer-read-row" [style.padding-left.px]="row.level * 16"><span>{{ row.param.name || '未命名参数' }}</span><strong>{{ row.param.type || 'String' }}</strong></p>
              } @empty {
                <p class="muted">暂无响应参数</p>
              }
            </section>
          }
        </div>
      </aside>
    </div>
  }
```

- [ ] **Step 5: Replace template expression helper if needed**

If Angular rejects `serviceGroups().find(...)` in template, add this method in TypeScript:

```ts
  protected serviceGroupFor(svc: LegacyService): LegacyServiceGroup | null {
    return this.serviceGroups().find((group) => this.uid(group) === String(svc.serviceGroupUid || '')) || null;
  }
```

Then replace the service row with:

```html
<p class="drawer-read-row"><span>服务</span><strong>{{ serviceGroupTitle(serviceGroupFor(svc)) }}</strong></p>
```

- [ ] **Step 6: Run the test and verify it passes**

Run `npm.cmd test`.

Expected: drawer test passes and no template parse errors remain.

### Task 3: Move Interface Editing Into the Drawer

**Files:**
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.ts`
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.html`
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.spec.ts`

- [ ] **Step 1: Replace the existing editing test**

Replace `polishes service editing and all add buttons mutate the model` with:

```ts
  it('creates an interface in the drawer and edits request and response params when editing is open', () => {
    host.querySelector<HTMLButtonElement>('.editor-toggle')?.click();
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="service-interface-new"]')?.click();
    fixture.detectChanges();

    const draft = getAngularRuntimeState().doc.services.find((service: any) => service.uid === 'draft');
    expect(draft).toBeTruthy();
    const drawer = host.querySelector('[data-testid="service-interface-drawer"]')!;
    expect(drawer.querySelector<HTMLInputElement>('[data-testid="service-drawer-name"]')).toBeTruthy();

    drawer.querySelector<HTMLButtonElement>('[data-testid="service-drawer-add-request-param"]')?.click();
    drawer.querySelector<HTMLButtonElement>('[data-testid="service-drawer-add-response-param"]')?.click();
    fixture.detectChanges();

    expect(draft.requestParams).toHaveLength(1);
    expect(draft.responseParams).toHaveLength(1);

    drawer.querySelector<HTMLInputElement>('[data-testid="service-drawer-name"]')!.value = '查询订单';
    drawer.querySelector<HTMLInputElement>('[data-testid="service-drawer-name"]')!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    drawer.querySelector<HTMLButtonElement>('[data-testid="service-drawer-save"]')?.click();
    fixture.detectChanges();

    expect(getAngularRuntimeState().doc.services.some((service: any) => service.name === '查询订单' && service.uid !== 'draft')).toBe(true);
    expect(host.querySelector('[data-testid="service-interface-drawer"]')).toBeFalsy();
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run `npm.cmd test`.

Expected: fails because the drawer edit form and buttons do not exist.

- [ ] **Step 3: Add service creation and save methods**

In `app-workbench.ts`, replace `createService` and `createInterface` with:

```ts
  protected createService(): void {
    this.openNewServiceDrawer(this.uid(this.serviceGroups()[0]) || '');
  }
  protected createInterface(serviceGroupUid = ''): void {
    this.openNewServiceDrawer(serviceGroupUid);
  }
  protected openNewServiceDrawer(serviceGroupUid = this.uid(this.serviceGroups()[0]) || ''): void {
    const svc: LegacyService = { uid: 'draft', name: '', serviceGroupUid, method: 'POST', path: '', desc: '', requestParams: [], responseParams: [], steps: [], parameterMappings: [], nodeRefs: [] };
    this.doc().services ||= [];
    this.doc().services.push(svc);
    this.editorOpen.set(true);
    this.openServiceDrawer(svc);
    this.touch();
  }
  protected saveServiceDrawer(svc: LegacyService): void {
    if (!svc.uid || svc.uid === 'draft') svc.uid = `interface-${Date.now()}`;
    this.ensureServiceShape(svc);
    this.serviceDrawerId.set('');
    this.touch();
  }
```

- [ ] **Step 4: Add editable drawer body**

In the drawer template, after `@if (!editorOpen()) { ... }`, add:

```html
          } @else {
            <section class="svc-edit-section svc-edit-basics">
              <div class="svc-edit-section-head"><strong>接口基础信息</strong></div>
              <div class="svc-edit-row">
                <input data-testid="service-drawer-name" [(ngModel)]="svc.name" placeholder="接口名称" class="svc-edit-name" />
                <select [(ngModel)]="svc.serviceGroupUid" data-testid="service-drawer-group">
                  <option value="">未分组</option>
                  @for (group of serviceGroups(); track uid(group)) {
                    <option [value]="uid(group)">{{ group.name }}</option>
                  }
                </select>
                <select [(ngModel)]="svc.method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select>
                <input [(ngModel)]="svc.path" placeholder="/api/..." />
              </div>
              <textarea [(ngModel)]="svc.desc" rows="2" placeholder="接口说明" class="svc-edit-note"></textarea>
            </section>

            <div class="svc-params-section">
              <div class="svc-params-head">
                <span>请求参数</span>
                <div class="svc-params-head-actions">
                  <button class="btn-ghost-sm" type="button" (click)="startImportJson('requestParams')">从 JSON 导入</button>
                  <button class="btn-ghost-sm" type="button" (click)="copyParamsAsJson(svc, 'requestParams')">复制为 JSON</button>
                  <button class="btn-ghost-sm" data-testid="service-drawer-add-request-param" type="button" (click)="addSvcParam(serviceRequestParams(svc))">+ 添加</button>
                </div>
              </div>
              <table class="svc-params-table">
                <thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th><th></th></tr></thead>
                <tbody>
                  @for (row of paramRows(serviceRequestParams(svc)); track row.testPath) {
                    <tr>
                      <td><input [style.padding-left.px]="8 + row.level * 18" [attr.data-testid]="'service-request-param-name-' + row.testPath" [(ngModel)]="row.param.name" placeholder="参数名" /></td>
                      <td><select [(ngModel)]="row.param.type"><option>String</option><option>Number</option><option>Boolean</option><option>Array</option><option>List</option><option>Map</option><option>Object</option></select></td>
                      <td class="td-cb"><input type="checkbox" [(ngModel)]="row.param.required" /></td>
                      <td><input [(ngModel)]="row.param.note" placeholder="说明" /></td>
                      <td class="svc-param-actions">
                        @if (canHaveChildren(row.param)) {
                          <button class="btn-ghost-sm" type="button" [attr.data-testid]="'service-request-param-add-child-' + row.testPath" (click)="addSvcChildParam(row.param)">+ 子项</button>
                        }
                        <button class="btn-ghost-sm danger" type="button" (click)="removeParamByPath(serviceRequestParams(svc), row.path)">×</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="svc-params-section">
              <div class="svc-params-head">
                <span>响应参数</span>
                <div class="svc-params-head-actions">
                  <button class="btn-ghost-sm" type="button" (click)="startImportJson('responseParams')">从 JSON 导入</button>
                  <button class="btn-ghost-sm" type="button" (click)="copyParamsAsJson(svc, 'responseParams')">复制为 JSON</button>
                  <button class="btn-ghost-sm" data-testid="service-drawer-add-response-param" type="button" (click)="addSvcParam(serviceResponseParams(svc))">+ 添加</button>
                </div>
              </div>
              <table class="svc-params-table">
                <thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th><th></th></tr></thead>
                <tbody>
                  @for (row of paramRows(serviceResponseParams(svc)); track row.testPath) {
                    <tr>
                      <td><input [style.padding-left.px]="8 + row.level * 18" [attr.data-testid]="'service-response-param-name-' + row.testPath" [(ngModel)]="row.param.name" placeholder="参数名" /></td>
                      <td><select [(ngModel)]="row.param.type"><option>String</option><option>Number</option><option>Boolean</option><option>Array</option><option>List</option><option>Map</option><option>Object</option></select></td>
                      <td class="td-cb"><input type="checkbox" [(ngModel)]="row.param.required" /></td>
                      <td><input [(ngModel)]="row.param.note" placeholder="说明" /></td>
                      <td class="svc-param-actions">
                        @if (canHaveChildren(row.param)) {
                          <button class="btn-ghost-sm" type="button" [attr.data-testid]="'service-response-param-add-child-' + row.testPath" (click)="addSvcChildParam(row.param)">+ 子项</button>
                        }
                        <button class="btn-ghost-sm danger" type="button" (click)="removeParamByPath(serviceResponseParams(svc), row.path)">×</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
```

Add drawer footer after `drawer-body`:

```html
        @if (editorOpen()) {
          <footer class="drawer-actions">
            <button class="btn btn-primary btn-sm" data-testid="service-drawer-save" type="button" (click)="saveServiceDrawer(svc)">保存</button>
            <button class="btn btn-outline btn-sm" type="button" (click)="closeServiceDrawer()">取消</button>
            @if (svc.uid && svc.uid !== 'draft') {
              <button class="btn btn-outline btn-sm danger" type="button" (click)="deleteService(svc); closeServiceDrawer()">删除</button>
            }
          </footer>
        }
```

- [ ] **Step 5: Run tests**

Run `npm.cmd test`.

Expected: service drawer editing test passes.

### Task 4: Move Service Group Editing Into a Drawer

**Files:**
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.ts`
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.html`
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.spec.ts`

- [ ] **Step 1: Write the failing service-group drawer test**

Add this test after the interface drawer editing test:

```ts
  it('creates a service group through a drawer without writing until save', () => {
    host.querySelector<HTMLButtonElement>('[data-testid="service-group-new"]')?.click();
    fixture.detectChanges();

    expect(getAngularRuntimeState().doc.serviceGroups).toHaveLength(1);
    const drawer = host.querySelector('[data-testid="service-group-drawer"]')!;
    const name = drawer.querySelector<HTMLInputElement>('[data-testid="service-group-drawer-name"]')!;
    name.value = '支付服务';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    drawer.querySelector<HTMLButtonElement>('[data-testid="service-group-drawer-save"]')?.click();
    fixture.detectChanges();

    expect(getAngularRuntimeState().doc.serviceGroups.some((group: any) => group.name === '支付服务')).toBe(true);
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run `npm.cmd test`.

Expected: fails because service group drawer does not exist and `createServiceGroup` writes immediately.

- [ ] **Step 3: Add service group drawer methods**

In `app-workbench.ts`, replace `createServiceGroup` with:

```ts
  protected createServiceGroup(): void {
    this.openServiceGroupDrawer();
  }
  protected openServiceGroupDrawer(group?: LegacyServiceGroup): void {
    this.editorOpen.set(true);
    this.serviceGroupDrawer.set(group ? { ...group } : { uid: '', name: '', desc: '' });
  }
  protected closeServiceGroupDrawer(): void {
    this.serviceGroupDrawer.set(null);
  }
  protected saveServiceGroupDrawer(): void {
    const draft = this.serviceGroupDrawer();
    if (!draft || !draft.name?.trim()) return;
    if (!draft.uid) {
      draft.uid = `service-group-${Date.now()}`;
      this.doc().serviceGroups ||= [];
      this.doc().serviceGroups.push(draft);
    } else {
      const existing = this.serviceGroups().find((group) => this.uid(group) === draft.uid);
      if (existing) Object.assign(existing, draft);
    }
    this.serviceGroupDrawer.set(null);
    this.touch();
  }
```

- [ ] **Step 4: Add service group drawer template**

Append before the interface drawer or after it:

```html
  @if (serviceGroupDrawer(); as group) {
    <div class="drawer-overlay" data-testid="service-group-drawer" (click)="closeServiceGroupDrawer()">
      <aside class="drawer app-service-group-drawer" (click)="$event.stopPropagation()">
        <header class="drawer-head">
          <h3>{{ group.uid ? '编辑服务' : '新建服务' }}</h3>
          <button class="drawer-close" type="button" (click)="closeServiceGroupDrawer()">×</button>
        </header>
        <div class="drawer-body">
          <label>服务名称<input data-testid="service-group-drawer-name" [(ngModel)]="group.name" placeholder="服务名称" /></label>
          <label>服务说明<textarea rows="4" [(ngModel)]="group.desc" placeholder="服务说明"></textarea></label>
        </div>
        <footer class="drawer-actions">
          <button class="btn btn-primary btn-sm" data-testid="service-group-drawer-save" type="button" (click)="saveServiceGroupDrawer()">保存</button>
          <button class="btn btn-outline btn-sm" type="button" (click)="closeServiceGroupDrawer()">取消</button>
          @if (group.uid) {
            <button class="btn btn-outline btn-sm danger" type="button" (click)="deleteServiceGroup(group as any); closeServiceGroupDrawer()">删除</button>
          }
        </footer>
      </aside>
    </div>
  }
```

If Angular rejects `group as any`, add:

```ts
  protected deleteServiceGroupFromDrawer(): void {
    const group = this.serviceGroupDrawer();
    if (!group?.uid) return;
    void this.deleteServiceGroup(group as LegacyServiceGroup);
    this.serviceGroupDrawer.set(null);
  }
```

Then call `deleteServiceGroupFromDrawer()` from the template.

- [ ] **Step 5: Run tests**

Run `npm.cmd test`.

Expected: all app-workbench service group tests pass after updating older selectors that expected inline inputs.

### Task 5: Add Drawer Styles and Final Verification

**Files:**
- Modify: `frontend-angular/src/app/workbenches/application/app-workbench.scss`
- Modify if build refreshes output: `app/index.html`, `app/main-*.js`

- [ ] **Step 1: Add focused styles**

Append these styles near the application service section:

```scss
.app-service-board { background: #f8fafc; }
.app-service-toolbar { justify-content: flex-end; }
.app-service-toolbar input { margin-right: auto; }
.app-service-groups { gap: 12px; }
.app-service-group-card { border-radius: 8px; background: #fff; }
.app-service-group-head { align-items: flex-start; background: #f8fafc; }
.app-service-group-head > div { flex: 1; min-width: 0; }
.app-interface-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
.app-interface-card { cursor: pointer; border-radius: 8px; transition: border-color .12s, box-shadow .12s; }
.app-interface-card:hover { border-color: #93c5fd; box-shadow: 0 2px 8px rgba(59,130,246,.06); }
.app-interface-card-head { justify-content: space-between; cursor: pointer; }
.app-interface-card-head > div { flex: 1; min-width: 0; }
.app-interface-card-head strong, .app-interface-card-head code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-interface-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 0 14px 12px; }
.app-interface-meta span { border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; color: #64748b; font-size: 11px; padding: 4px 6px; text-align: center; }
.app-service-empty-inline, .app-service-empty-state { color: #94a3b8; font-size: 12px; padding: 16px; }
.app-service-empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; border: 1px dashed #cbd5e1; border-radius: 8px; background: #fff; }
.drawer-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.18); z-index: 500; display: flex; justify-content: flex-end; overflow: hidden; }
.drawer { width: min(720px, 92vw); height: calc(100vh - 92px); background: #fff; box-shadow: -4px 0 24px rgba(15,23,42,.1); display: flex; flex-direction: column; }
.drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #e2e8f0; }
.drawer-head h3 { margin: 0; font-size: 15px; }
.drawer-head span { color: #64748b; font-size: 12px; }
.drawer-close { background: none; border: 0; color: #94a3b8; cursor: pointer; font-size: 18px; }
.drawer-body { flex: 1; overflow: auto; padding: 16px 20px; }
.drawer-body label { display: block; margin-bottom: 12px; font-size: 12px; color: #64748b; font-weight: 600; }
.drawer-body input, .drawer-body select, .drawer-body textarea { width: 100%; border: 1px solid #e2e8f0; border-radius: 7px; padding: 7px 10px; font: inherit; font-size: 13px; margin-top: 4px; }
.drawer-section { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
.drawer-section-head { display: flex; justify-content: space-between; margin-bottom: 8px; }
.drawer-read-row { display: flex; justify-content: space-between; gap: 12px; margin: 0; padding: 6px 0; color: #64748b; font-size: 12px; }
.drawer-read-row strong { color: #1e293b; font-weight: 600; text-align: right; }
.drawer-actions { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 20px; border-top: 1px solid #e2e8f0; }
.drawer-actions .danger { color: #ef4444; border-color: #fecaca; }
```

- [ ] **Step 2: Run tests**

Run:

```powershell
cd C:\Users\Administrator\Desktop\project\blm\frontend-angular
npm.cmd test
```

Expected: `6 passed`, all tests pass. The jsdom warning `Not implemented: Window's confirm() method` may still appear from unrelated existing tests.

- [ ] **Step 3: Run build**

Run:

```powershell
cd C:\Users\Administrator\Desktop\project\blm\frontend-angular
npm.cmd run build
```

Expected: build completes. Existing budget warnings may appear; no budget errors should remain. If `app-workbench.scss` exceeds the 13kB error budget, remove unused old inline-edit styles that no longer have template references.

- [ ] **Step 4: Inspect git diff**

Run:

```powershell
git diff --stat
git diff --check
git status --short
```

Expected: changes are limited to application workbench source/spec/styles and build output under `app/`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend-angular/src/app/workbenches/application/app-workbench.ts frontend-angular/src/app/workbenches/application/app-workbench.html frontend-angular/src/app/workbenches/application/app-workbench.scss frontend-angular/src/app/workbenches/application/app-workbench.spec.ts app/index.html app/main-*.js
git commit -m "重构应用服务卡片抽屉体验"
```

Expected: commit succeeds with a clean worktree.
