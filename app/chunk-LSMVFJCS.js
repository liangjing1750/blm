import {
  CommonModule,
  Component,
  EntityDesignWorkbenchComponent,
  Input,
  ProcessFlowWorkbenchComponent,
  ProcessStageWorkbenchComponent,
  setClassMetadata,
  ɵsetClassDebugInfo,
  ɵɵconditional,
  ɵɵconditionalCreate,
  ɵɵdefineComponent,
  ɵɵelement,
  ɵɵnextContext,
  ɵɵproperty
} from "./chunk-NXZKD25Q.js";

// src/app/workbenches/preview/preview-graph-host.component.ts
function PreviewGraphHostComponent_Conditional_0_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-process-stage-workbench", 0);
  }
  if (rf & 2) {
    const ctx_r0 = \u0275\u0275nextContext();
    \u0275\u0275property("exportGraphId", ctx_r0.exportGraphId);
  }
}
function PreviewGraphHostComponent_Conditional_1_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-process-stage-workbench", 1);
  }
  if (rf & 2) {
    const ctx_r0 = \u0275\u0275nextContext();
    \u0275\u0275property("previewStageId", ctx_r0.targetId)("exportGraphId", ctx_r0.exportGraphId);
  }
}
function PreviewGraphHostComponent_Conditional_2_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-process-flow-workbench", 2);
  }
  if (rf & 2) {
    const ctx_r0 = \u0275\u0275nextContext();
    \u0275\u0275property("editing", false)("previewProcessId", ctx_r0.targetId)("exportGraphId", ctx_r0.exportGraphId);
  }
}
function PreviewGraphHostComponent_Conditional_3_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-entity-design-workbench", 3);
  }
  if (rf & 2) {
    const ctx_r0 = \u0275\u0275nextContext();
    \u0275\u0275property("editing", false)("showEditorToggle", false)("exportGraphId", ctx_r0.exportGraphId);
  }
}
function PreviewGraphHostComponent_Conditional_4_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-entity-design-workbench", 4);
  }
  if (rf & 2) {
    const ctx_r0 = \u0275\u0275nextContext();
    \u0275\u0275property("editing", false)("showEditorToggle", false)("initialEntityId", ctx_r0.targetId)("exportGraphId", ctx_r0.exportGraphId);
  }
}
var PreviewGraphHostComponent = class _PreviewGraphHostComponent {
  // 模块意图：把预览页的真实图形组件隔离到可延迟加载的宿主中，避免主预览组件直接拖入重型工作台依赖。
  // 关键流程：预览正文只声明图形类型、目标 id 和导出图形 id；宿主进入视口后再加载真实工作台组件。
  // 边界细节：宿主只读渲染，不写回文档；编辑态和工具栏入口由各工作台自己的 preview/export 输入约束。
  kind = "process-flow";
  targetId = "";
  exportGraphId = "";
  static \u0275fac = function PreviewGraphHostComponent_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _PreviewGraphHostComponent)();
  };
  static \u0275cmp = /* @__PURE__ */ \u0275\u0275defineComponent({ type: _PreviewGraphHostComponent, selectors: [["app-preview-graph-host"]], inputs: { kind: "kind", targetId: "targetId", exportGraphId: "exportGraphId" }, decls: 5, vars: 1, consts: [["previewMode", "panorama", 3, "exportGraphId"], ["previewMode", "detail", 3, "previewStageId", "exportGraphId"], [3, "editing", "previewProcessId", "exportGraphId"], ["initialView", "relation", 3, "editing", "showEditorToggle", "exportGraphId"], ["initialView", "state", 3, "editing", "showEditorToggle", "initialEntityId", "exportGraphId"]], template: function PreviewGraphHostComponent_Template(rf, ctx) {
    if (rf & 1) {
      \u0275\u0275conditionalCreate(0, PreviewGraphHostComponent_Conditional_0_Template, 1, 1, "app-process-stage-workbench", 0)(1, PreviewGraphHostComponent_Conditional_1_Template, 1, 2, "app-process-stage-workbench", 1)(2, PreviewGraphHostComponent_Conditional_2_Template, 1, 3, "app-process-flow-workbench", 2)(3, PreviewGraphHostComponent_Conditional_3_Template, 1, 3, "app-entity-design-workbench", 3)(4, PreviewGraphHostComponent_Conditional_4_Template, 1, 4, "app-entity-design-workbench", 4);
    }
    if (rf & 2) {
      \u0275\u0275conditional(ctx.kind === "stage-panorama" ? 0 : ctx.kind === "stage-flow" ? 1 : ctx.kind === "process-flow" ? 2 : ctx.kind === "entity-relation" ? 3 : ctx.kind === "entity-state" ? 4 : -1);
    }
  }, dependencies: [
    CommonModule,
    ProcessStageWorkbenchComponent,
    ProcessFlowWorkbenchComponent,
    EntityDesignWorkbenchComponent
  ], styles: ["\n[_nghost-%COMP%] {\n  display: block;\n  min-height: inherit;\n  overflow: visible;\n  background: #fff;\n}\n[_nghost-%COMP%]   app-process-stage-workbench[_ngcontent-%COMP%], \n[_nghost-%COMP%]   app-process-flow-workbench[_ngcontent-%COMP%], \n[_nghost-%COMP%]   app-entity-design-workbench[_ngcontent-%COMP%] {\n  display: block;\n  min-height: inherit;\n  overflow: visible;\n}\n/*# sourceMappingURL=preview-graph-host.component.css.map */"] });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(PreviewGraphHostComponent, [{
    type: Component,
    args: [{ selector: "app-preview-graph-host", standalone: true, imports: [
      CommonModule,
      ProcessStageWorkbenchComponent,
      ProcessFlowWorkbenchComponent,
      EntityDesignWorkbenchComponent
    ], template: `
    @if (kind === 'stage-panorama') {
      <app-process-stage-workbench previewMode="panorama" [exportGraphId]="exportGraphId"></app-process-stage-workbench>
    } @else if (kind === 'stage-flow') {
      <app-process-stage-workbench previewMode="detail" [previewStageId]="targetId" [exportGraphId]="exportGraphId"></app-process-stage-workbench>
    } @else if (kind === 'process-flow') {
      <app-process-flow-workbench [editing]="false" [previewProcessId]="targetId" [exportGraphId]="exportGraphId"></app-process-flow-workbench>
    } @else if (kind === 'entity-relation') {
      <app-entity-design-workbench [editing]="false" [showEditorToggle]="false" initialView="relation" [exportGraphId]="exportGraphId"></app-entity-design-workbench>
    } @else if (kind === 'entity-state') {
      <app-entity-design-workbench [editing]="false" [showEditorToggle]="false" initialView="state" [initialEntityId]="targetId" [exportGraphId]="exportGraphId"></app-entity-design-workbench>
    }
  `, styles: ["/* angular:styles/component:css;8adf1d0339b56af9edaca9930114a0666c36d91e37695be86ff6a263d488cf59;C:/Users/Administrator/Desktop/project/blm/frontend-angular/src/app/workbenches/preview/preview-graph-host.component.ts */\n:host {\n  display: block;\n  min-height: inherit;\n  overflow: visible;\n  background: #fff;\n}\n:host app-process-stage-workbench,\n:host app-process-flow-workbench,\n:host app-entity-design-workbench {\n  display: block;\n  min-height: inherit;\n  overflow: visible;\n}\n/*# sourceMappingURL=preview-graph-host.component.css.map */\n"] }]
  }], null, { kind: [{
    type: Input,
    args: [{ required: true }]
  }], targetId: [{
    type: Input
  }], exportGraphId: [{
    type: Input
  }] });
})();
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && \u0275setClassDebugInfo(PreviewGraphHostComponent, { className: "PreviewGraphHostComponent", filePath: "src/app/workbenches/preview/preview-graph-host.component.ts", lineNumber: 48 });
})();

export {
  PreviewGraphHostComponent
};
//# sourceMappingURL=chunk-LSMVFJCS.js.map
