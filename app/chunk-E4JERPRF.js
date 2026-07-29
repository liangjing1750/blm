import {
  ActivatedRoute
} from "./chunk-UBXFVDYW.js";
import {
  PreviewGraphHostComponent
} from "./chunk-LSMVFJCS.js";
import {
  ApiService,
  CommonModule,
  Component,
  computed,
  emitRuntimeRefresh,
  getAngularRuntimeState,
  listExportGraphs,
  replaceRuntimeDocument,
  setClassMetadata,
  signal,
  ɵsetClassDebugInfo,
  ɵɵadvance,
  ɵɵattribute,
  ɵɵconditional,
  ɵɵconditionalCreate,
  ɵɵdefineComponent,
  ɵɵdirectiveInject,
  ɵɵelement,
  ɵɵelementEnd,
  ɵɵelementStart,
  ɵɵnextContext,
  ɵɵproperty,
  ɵɵtext,
  ɵɵtextInterpolate
} from "./chunk-NXZKD25Q.js";
import "./chunk-4AJYGB4N.js";

// src/app/export/export-render-page.component.ts
function ExportRenderPageComponent_Conditional_1_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 1);
    \u0275\u0275text(1, "\u6B63\u5728\u51C6\u5907\u5BFC\u51FA\u56FE\u5F62...");
    \u0275\u0275elementEnd();
  }
}
function ExportRenderPageComponent_Conditional_2_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 2);
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const ctx_r0 = \u0275\u0275nextContext();
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r0.error());
  }
}
function ExportRenderPageComponent_Conditional_3_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "section", 3);
    \u0275\u0275element(1, "app-preview-graph-host", 4);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const graph_r2 = ctx;
    const ctx_r0 = \u0275\u0275nextContext();
    \u0275\u0275attribute("data-export-active-graph", graph_r2.id);
    \u0275\u0275advance();
    \u0275\u0275property("kind", graph_r2.kind)("targetId", ctx_r0.targetIdForGraph())("exportGraphId", graph_r2.id);
  }
}
function ExportRenderPageComponent_Conditional_4_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 1);
    \u0275\u0275text(1, "\u5F53\u524D\u6587\u6863\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u56FE\u5F62\u3002");
    \u0275\u0275elementEnd();
  }
}
var ExportRenderPageComponent = class _ExportRenderPageComponent {
  route;
  api;
  runtime = getAngularRuntimeState();
  loading = signal(true, ...ngDevMode ? [{ debugName: "loading" }] : (
    /* istanbul ignore next */
    []
  ));
  error = signal("", ...ngDevMode ? [{ debugName: "error" }] : (
    /* istanbul ignore next */
    []
  ));
  graphId = signal("", ...ngDevMode ? [{ debugName: "graphId" }] : (
    /* istanbul ignore next */
    []
  ));
  graphs = signal([], ...ngDevMode ? [{ debugName: "graphs" }] : (
    /* istanbul ignore next */
    []
  ));
  activeGraph = computed(() => this.graphs().find((graph) => graph.id === this.graphId()) || null, ...ngDevMode ? [{ debugName: "activeGraph" }] : (
    /* istanbul ignore next */
    []
  ));
  constructor(route, api) {
    this.route = route;
    this.api = api;
  }
  async ngOnInit() {
    window.__BLM_EXPORT_READY__ = false;
    window.__BLM_EXPORT_GRAPHS__ = [];
    const jobId = String(this.route.snapshot.paramMap.get("jobId") || "").trim();
    const requestedGraphId = String(this.route.snapshot.queryParamMap.get("graphId") || "").trim();
    this.graphId.set(requestedGraphId);
    try {
      const payload = await this.api.exportRenderDocument(jobId);
      replaceRuntimeDocument(payload.document || {}, payload.name || "");
      this.runtime.readOnly = true;
      const nextGraphs = listExportGraphs(this.runtime.doc);
      this.graphs.set(nextGraphs);
      window.__BLM_EXPORT_GRAPHS__ = nextGraphs;
      const graph = nextGraphs.find((item) => item.id === requestedGraphId) || nextGraphs[0] || null;
      if (graph) {
        this.graphId.set(graph.id);
        this.applyGraphRuntime(graph);
      }
      this.loading.set(false);
      setTimeout(() => this.markReadyWhenGraphRendered(), 0);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      this.loading.set(false);
    }
  }
  ngAfterViewChecked() {
    this.markReadyWhenGraphRendered();
  }
  targetIdForGraph() {
    const graph = this.activeGraph();
    if (!graph)
      return "";
    if (graph.kind === "stage-flow")
      return graph.params["stageId"] || "";
    if (graph.kind === "process-flow")
      return graph.params["processId"] || "";
    if (graph.kind === "entity-state")
      return graph.params["entityId"] || "";
    return "";
  }
  applyGraphRuntime(graph) {
    this.runtime.ui["mainTab"] = "preview";
    this.runtime.ui["stageEditorCollapsed"] = true;
    if (graph.kind === "stage-panorama") {
      this.runtime.ui["processWorkbenchView"] = "stage";
      this.runtime.ui["stageViewMode"] = "panorama";
    } else if (graph.kind === "stage-flow") {
      this.runtime.ui["processWorkbenchView"] = "stage";
      this.runtime.ui["stageViewMode"] = "detail";
      this.runtime.ui["stageId"] = graph.params["stageId"] || "";
    } else if (graph.kind === "process-flow") {
      this.runtime.ui["processWorkbenchView"] = "flow";
      this.runtime.ui["procId"] = graph.params["processId"] || "";
    } else if (graph.kind === "entity-state") {
      this.runtime.ui["entityId"] = graph.params["entityId"] || "";
    }
    emitRuntimeRefresh();
  }
  markReadyWhenGraphRendered() {
    if (this.loading() || this.error() || window.__BLM_EXPORT_READY__)
      return;
    const graph = this.activeGraph();
    if (!graph) {
      window.__BLM_EXPORT_READY__ = true;
      return;
    }
    const target = document.querySelector(graph.selector);
    if (target && target.getBoundingClientRect().width > 0 && target.getBoundingClientRect().height > 0) {
      window.__BLM_EXPORT_READY__ = true;
    }
  }
  static \u0275fac = function ExportRenderPageComponent_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _ExportRenderPageComponent)(\u0275\u0275directiveInject(ActivatedRoute), \u0275\u0275directiveInject(ApiService));
  };
  static \u0275cmp = /* @__PURE__ */ \u0275\u0275defineComponent({ type: _ExportRenderPageComponent, selectors: [["app-export-render-page"]], decls: 5, vars: 1, consts: [[1, "export-render-page"], [1, "export-render-state"], [1, "export-render-state", "export-render-error"], [1, "export-render-canvas"], [3, "kind", "targetId", "exportGraphId"]], template: function ExportRenderPageComponent_Template(rf, ctx) {
    if (rf & 1) {
      \u0275\u0275elementStart(0, "main", 0);
      \u0275\u0275conditionalCreate(1, ExportRenderPageComponent_Conditional_1_Template, 2, 0, "div", 1)(2, ExportRenderPageComponent_Conditional_2_Template, 2, 1, "div", 2)(3, ExportRenderPageComponent_Conditional_3_Template, 2, 4, "section", 3)(4, ExportRenderPageComponent_Conditional_4_Template, 2, 0, "div", 1);
      \u0275\u0275elementEnd();
    }
    if (rf & 2) {
      let tmp_0_0;
      \u0275\u0275advance();
      \u0275\u0275conditional(ctx.loading() ? 1 : ctx.error() ? 2 : (tmp_0_0 = ctx.activeGraph()) ? 3 : 4, tmp_0_0);
    }
  }, dependencies: [
    CommonModule,
    PreviewGraphHostComponent
  ], styles: ['\n[_nghost-%COMP%] {\n  display: block;\n  min-height: 100vh;\n  background: #ffffff;\n  color: #0f172a;\n  font-family:\n    Arial,\n    "Microsoft YaHei",\n    sans-serif;\n}\n.export-render-page[_ngcontent-%COMP%] {\n  min-width: max-content;\n  min-height: 100vh;\n  padding: 24px;\n  background: #ffffff;\n}\n.export-render-canvas[_ngcontent-%COMP%] {\n  display: inline-block;\n  min-width: max-content;\n  background: #ffffff;\n}\n.export-render-state[_ngcontent-%COMP%] {\n  padding: 24px;\n  color: #475569;\n  font-size: 14px;\n}\n.export-render-error[_ngcontent-%COMP%] {\n  color: #b91c1c;\n}\n[_nghost-%COMP%]     .process-flow-topbar, \n[_nghost-%COMP%]     .process-flow-side-tools, \n[_nghost-%COMP%]     .entity-design-toolbar, \n[_nghost-%COMP%]     .stage-flow-canvas-tools, \n[_nghost-%COMP%]     .stage-flow-board-add, \n[_nghost-%COMP%]     .stage-flow-link-remove, \n[_nghost-%COMP%]     .flow-connect-box, \n[_nghost-%COMP%]     .flow-node-edit-icon, \n[_nghost-%COMP%]     .flow-gateway-edit-icon, \n[_nghost-%COMP%]     .process-attachment-drawer {\n  display: none !important;\n}\n[_nghost-%COMP%]     .process-flow-frame, \n[_nghost-%COMP%]     .stage-card, \n[_nghost-%COMP%]     .entity-design {\n  border: 0 !important;\n  box-shadow: none !important;\n  background: #ffffff !important;\n}\n[_nghost-%COMP%]     .process-flow-body, \n[_nghost-%COMP%]     .process-flow-canvas-shell, \n[_nghost-%COMP%]     .stage-main-shell, \n[_nghost-%COMP%]     .stage-flow-guide, \n[_nghost-%COMP%]     .value-stream-scroll, \n[_nghost-%COMP%]     .entity-design-canvas-shell {\n  overflow: visible !important;\n  max-height: none !important;\n}\n[_nghost-%COMP%]     [data-export-graph-id] {\n  background-color: #ffffff;\n}\n/*# sourceMappingURL=export-render-page.component.css.map */'] });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ExportRenderPageComponent, [{
    type: Component,
    args: [{ selector: "app-export-render-page", standalone: true, imports: [
      CommonModule,
      PreviewGraphHostComponent
    ], template: '<main class="export-render-page">\n  @if (loading()) {\n    <div class="export-render-state">\u6B63\u5728\u51C6\u5907\u5BFC\u51FA\u56FE\u5F62...</div>\n  } @else if (error()) {\n    <div class="export-render-state export-render-error">{{ error() }}</div>\n  } @else if (activeGraph(); as graph) {\n    <section class="export-render-canvas" [attr.data-export-active-graph]="graph.id">\n      <app-preview-graph-host\n        [kind]="graph.kind"\n        [targetId]="targetIdForGraph()"\n        [exportGraphId]="graph.id"\n      ></app-preview-graph-host>\n    </section>\n  } @else {\n    <div class="export-render-state">\u5F53\u524D\u6587\u6863\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u56FE\u5F62\u3002</div>\n  }\n</main>\n', styles: ['/* src/app/export/export-render-page.component.scss */\n:host {\n  display: block;\n  min-height: 100vh;\n  background: #ffffff;\n  color: #0f172a;\n  font-family:\n    Arial,\n    "Microsoft YaHei",\n    sans-serif;\n}\n.export-render-page {\n  min-width: max-content;\n  min-height: 100vh;\n  padding: 24px;\n  background: #ffffff;\n}\n.export-render-canvas {\n  display: inline-block;\n  min-width: max-content;\n  background: #ffffff;\n}\n.export-render-state {\n  padding: 24px;\n  color: #475569;\n  font-size: 14px;\n}\n.export-render-error {\n  color: #b91c1c;\n}\n:host ::ng-deep .process-flow-topbar,\n:host ::ng-deep .process-flow-side-tools,\n:host ::ng-deep .entity-design-toolbar,\n:host ::ng-deep .stage-flow-canvas-tools,\n:host ::ng-deep .stage-flow-board-add,\n:host ::ng-deep .stage-flow-link-remove,\n:host ::ng-deep .flow-connect-box,\n:host ::ng-deep .flow-node-edit-icon,\n:host ::ng-deep .flow-gateway-edit-icon,\n:host ::ng-deep .process-attachment-drawer {\n  display: none !important;\n}\n:host ::ng-deep .process-flow-frame,\n:host ::ng-deep .stage-card,\n:host ::ng-deep .entity-design {\n  border: 0 !important;\n  box-shadow: none !important;\n  background: #ffffff !important;\n}\n:host ::ng-deep .process-flow-body,\n:host ::ng-deep .process-flow-canvas-shell,\n:host ::ng-deep .stage-main-shell,\n:host ::ng-deep .stage-flow-guide,\n:host ::ng-deep .value-stream-scroll,\n:host ::ng-deep .entity-design-canvas-shell {\n  overflow: visible !important;\n  max-height: none !important;\n}\n:host ::ng-deep [data-export-graph-id] {\n  background-color: #ffffff;\n}\n/*# sourceMappingURL=export-render-page.component.css.map */\n'] }]
  }], () => [{ type: ActivatedRoute }, { type: ApiService }], null);
})();
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && \u0275setClassDebugInfo(ExportRenderPageComponent, { className: "ExportRenderPageComponent", filePath: "src/app/export/export-render-page.component.ts", lineNumber: 26 });
})();
export {
  ExportRenderPageComponent
};
//# sourceMappingURL=chunk-E4JERPRF.js.map
