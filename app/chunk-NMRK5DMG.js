import {
  ApplicationExporter,
  ComponentModelExporter,
  ComponentWorkbenchComponent,
  ExportService,
  FragmentAssembler,
  PanoramaExporter,
  PanoramaWorkbench,
  ValueStreamExporter,
  WaitDialogComponent,
  downloadBlob,
  sanitizeRichTextHtml
} from "./chunk-OVRKKEVJ.js";
import {
  PreviewGraphHostComponent
} from "./chunk-LSMVFJCS.js";
import {
  ApiService,
  CommonModule,
  Component,
  DomSanitizer,
  NgIf,
  NgStyle,
  computed,
  confirmRuntimeAction,
  exportGraphId,
  getAngularRuntimeState,
  inject,
  setClassMetadata,
  signal,
  ɵsetClassDebugInfo,
  ɵɵadvance,
  ɵɵattribute,
  ɵɵclassMap,
  ɵɵclassProp,
  ɵɵconditional,
  ɵɵconditionalCreate,
  ɵɵdeclareLet,
  ɵɵdefineComponent,
  ɵɵelement,
  ɵɵelementEnd,
  ɵɵelementStart,
  ɵɵgetCurrentView,
  ɵɵinterpolate1,
  ɵɵlistener,
  ɵɵnextContext,
  ɵɵproperty,
  ɵɵpureFunction0,
  ɵɵreadContextLet,
  ɵɵrepeater,
  ɵɵrepeaterCreate,
  ɵɵrepeaterTrackByIndex,
  ɵɵresetView,
  ɵɵrestoreView,
  ɵɵsanitizeHtml,
  ɵɵstoreLet,
  ɵɵtemplate,
  ɵɵtext,
  ɵɵtextInterpolate,
  ɵɵtextInterpolate1
} from "./chunk-NXZKD25Q.js";
import {
  __spreadProps,
  __spreadValues
} from "./chunk-4AJYGB4N.js";

// src/app/workbenches/preview/preview-workbench.ts
var _c0 = () => [];
var _forTrack0 = ($index, $item) => $item.id;
var _forTrack1 = ($index, $item) => $item.label;
function _forTrack2($index, $item) {
  return this.identityOf($item, "export-stage-" + $index);
}
function _forTrack3($index, $item) {
  return this.identityOf($item, "export-process-" + $index);
}
function PreviewWorkbench_Conditional_12_Conditional_5_Template(rf, ctx) {
  if (rf & 1) {
    const _r1 = \u0275\u0275getCurrentView();
    \u0275\u0275elementStart(0, "button", 22);
    \u0275\u0275listener("click", function PreviewWorkbench_Conditional_12_Conditional_5_Template_button_click_0_listener() {
      \u0275\u0275restoreView(_r1);
      const ctx_r1 = \u0275\u0275nextContext(2);
      return \u0275\u0275resetView(ctx_r1.expandAll());
    });
    \u0275\u0275text(1, "\u5C55\u5F00\u5168\u90E8");
    \u0275\u0275elementEnd();
  }
}
function PreviewWorkbench_Conditional_12_For_8_Conditional_5_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "span", 26);
    \u0275\u0275text(1, "\u25BE");
    \u0275\u0275elementEnd();
  }
}
function PreviewWorkbench_Conditional_12_For_8_Template(rf, ctx) {
  if (rf & 1) {
    const _r3 = \u0275\u0275getCurrentView();
    \u0275\u0275elementStart(0, "button", 23);
    \u0275\u0275listener("click", function PreviewWorkbench_Conditional_12_For_8_Template_button_click_0_listener() {
      const item_r4 = \u0275\u0275restoreView(_r3).$implicit;
      const ctx_r1 = \u0275\u0275nextContext(2);
      return \u0275\u0275resetView(ctx_r1.handleOutlineClick(item_r4));
    });
    \u0275\u0275elementStart(1, "span", 24);
    \u0275\u0275text(2);
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(3, "span", 25);
    \u0275\u0275text(4);
    \u0275\u0275elementEnd();
    \u0275\u0275conditionalCreate(5, PreviewWorkbench_Conditional_12_For_8_Conditional_5_Template, 2, 0, "span", 26);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const item_r4 = ctx.$implicit;
    const ctx_r1 = \u0275\u0275nextContext(2);
    \u0275\u0275classMap(\u0275\u0275interpolate1("preview-outline-link depth-", item_r4.depth));
    \u0275\u0275classProp("is-collapsible", item_r4.depth <= 1)("is-collapsed", ctx_r1.isOutlineCollapsed(item_r4));
    \u0275\u0275attribute("data-oid", item_r4.id);
    \u0275\u0275advance(2);
    \u0275\u0275textInterpolate(item_r4.number);
    \u0275\u0275advance(2);
    \u0275\u0275textInterpolate(item_r4.label);
    \u0275\u0275advance();
    \u0275\u0275conditional(item_r4.depth <= 1 ? 5 : -1);
  }
}
function PreviewWorkbench_Conditional_12_For_15_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div")(1, "span");
    \u0275\u0275text(2);
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(3, "strong");
    \u0275\u0275text(4);
    \u0275\u0275elementEnd()();
  }
  if (rf & 2) {
    const card_r5 = ctx.$implicit;
    \u0275\u0275classMap(\u0275\u0275interpolate1("preview-summary-card tone-", card_r5.tone));
    \u0275\u0275advance(2);
    \u0275\u0275textInterpolate(card_r5.label);
    \u0275\u0275advance(2);
    \u0275\u0275textInterpolate(card_r5.value);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_2_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "h2");
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const entry_r6 = \u0275\u0275nextContext().$implicit;
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r1.headingDisplayText(section_r7, entry_r6.id));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_3_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "h3");
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const entry_r6 = \u0275\u0275nextContext().$implicit;
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r1.headingDisplayText(section_r7, entry_r6.id));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_4_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "h4");
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const entry_r6 = \u0275\u0275nextContext().$implicit;
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r1.headingDisplayText(section_r7, entry_r6.id));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_5_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "h5");
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const entry_r6 = \u0275\u0275nextContext().$implicit;
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r1.headingDisplayText(section_r7, entry_r6.id));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_6_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "h6");
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const entry_r6 = \u0275\u0275nextContext().$implicit;
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r1.headingDisplayText(section_r7, entry_r6.id));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_7_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 31);
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const entry_r6 = \u0275\u0275nextContext().$implicit;
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r1.headingDisplayText(section_r7, entry_r6.id));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_8_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 32);
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const entry_r6 = \u0275\u0275nextContext().$implicit;
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r1.headingDisplayText(section_r7, entry_r6.id));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_9_Conditional_0_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "p");
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    \u0275\u0275nextContext(2);
    const section_r7 = \u0275\u0275readContextLet(0);
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(section_r7.text);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_9_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275conditionalCreate(0, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_9_Conditional_0_Template, 2, 1, "p");
  }
  if (rf & 2) {
    \u0275\u0275nextContext();
    const section_r7 = \u0275\u0275readContextLet(0);
    \u0275\u0275conditional(section_r7.text ? 0 : -1);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_10_For_2_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "li");
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const item_r8 = ctx.$implicit;
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(item_r8);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_10_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "ul");
    \u0275\u0275repeaterCreate(1, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_10_For_2_Template, 2, 1, "li", null, \u0275\u0275repeaterTrackByIndex);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    \u0275\u0275nextContext();
    const section_r7 = \u0275\u0275readContextLet(0);
    \u0275\u0275advance();
    \u0275\u0275repeater(section_r7.items || \u0275\u0275pureFunction0(0, _c0));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_3_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "col", 34);
  }
  if (rf & 2) {
    const $index_r9 = ctx.$index;
    \u0275\u0275nextContext(2);
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275property("ngStyle", ctx_r1.tableColumnStyle(section_r7, $index_r9));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_7_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "th");
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const header_r10 = ctx.$implicit;
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(header_r10);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_10_For_2_Conditional_1_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "span", 19);
  }
  if (rf & 2) {
    const cell_r11 = \u0275\u0275nextContext().$implicit;
    const ctx_r1 = \u0275\u0275nextContext(7);
    \u0275\u0275property("innerHTML", ctx_r1.richText(cell_r11), \u0275\u0275sanitizeHtml);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_10_For_2_Conditional_2_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275text(0);
  }
  if (rf & 2) {
    const cell_r11 = \u0275\u0275nextContext().$implicit;
    \u0275\u0275textInterpolate1(" ", cell_r11, " ");
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_10_For_2_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "td");
    \u0275\u0275conditionalCreate(1, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_10_For_2_Conditional_1_Template, 1, 1, "span", 19)(2, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_10_For_2_Conditional_2_Template, 1, 1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const $index_r12 = ctx.$index;
    \u0275\u0275nextContext(3);
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance();
    \u0275\u0275conditional(ctx_r1.isRichTextColumn(section_r7, $index_r12) ? 1 : 2);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_10_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "tr");
    \u0275\u0275repeaterCreate(1, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_10_For_2_Template, 3, 1, "td", null, \u0275\u0275repeaterTrackByIndex);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const row_r13 = ctx.$implicit;
    \u0275\u0275advance();
    \u0275\u0275repeater(row_r13);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "table")(1, "colgroup");
    \u0275\u0275repeaterCreate(2, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_3_Template, 1, 1, "col", 34, \u0275\u0275repeaterTrackByIndex);
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(4, "thead")(5, "tr");
    \u0275\u0275repeaterCreate(6, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_7_Template, 2, 1, "th", null, \u0275\u0275repeaterTrackByIndex);
    \u0275\u0275elementEnd()();
    \u0275\u0275elementStart(8, "tbody");
    \u0275\u0275repeaterCreate(9, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_For_10_Template, 3, 0, "tr", null, \u0275\u0275repeaterTrackByIndex);
    \u0275\u0275elementEnd()();
  }
  if (rf & 2) {
    \u0275\u0275nextContext();
    const section_r7 = \u0275\u0275readContextLet(0);
    \u0275\u0275advance(2);
    \u0275\u0275repeater(section_r7.headers || \u0275\u0275pureFunction0(0, _c0));
    \u0275\u0275advance(4);
    \u0275\u0275repeater(section_r7.headers || \u0275\u0275pureFunction0(1, _c0));
    \u0275\u0275advance(3);
    \u0275\u0275repeater(section_r7.rows || \u0275\u0275pureFunction0(2, _c0));
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_12_Conditional_0_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-preview-graph-host", 35);
  }
  if (rf & 2) {
    const graph_r14 = ctx;
    \u0275\u0275property("kind", graph_r14.kind)("targetId", graph_r14.targetId)("exportGraphId", graph_r14.graphId);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_12_Conditional_1_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 36)(1, "div", 37);
    \u0275\u0275text(2);
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(3, "div", 38);
    \u0275\u0275element(4, "span")(5, "span")(6, "span");
    \u0275\u0275elementEnd()();
  }
  if (rf & 2) {
    \u0275\u0275nextContext(2);
    const section_r7 = \u0275\u0275readContextLet(0);
    \u0275\u0275advance(2);
    \u0275\u0275textInterpolate(section_r7.text || "\u7ED3\u6784\u56FE");
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_12_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275conditionalCreate(0, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_12_Conditional_0_Template, 1, 3, "app-preview-graph-host", 35)(1, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_12_Conditional_1_Template, 7, 1, "div", 36);
  }
  if (rf & 2) {
    let tmp_24_0;
    \u0275\u0275nextContext();
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275conditional((tmp_24_0 = ctx_r1.previewImageGraph(section_r7)) ? 0 : 1, tmp_24_0);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_13_Conditional_9_Template(rf, ctx) {
  if (rf & 1) {
    const _r15 = \u0275\u0275getCurrentView();
    \u0275\u0275elementStart(0, "button", 42);
    \u0275\u0275listener("click", function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_13_Conditional_9_Template_button_click_0_listener() {
      \u0275\u0275restoreView(_r15);
      \u0275\u0275nextContext(2);
      const section_r7 = \u0275\u0275readContextLet(0);
      const ctx_r1 = \u0275\u0275nextContext(4);
      return \u0275\u0275resetView(ctx_r1.previewAttachment(section_r7));
    });
    \u0275\u0275text(1, "\u9884\u89C8");
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(2, "button", 42);
    \u0275\u0275listener("click", function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_13_Conditional_9_Template_button_click_2_listener() {
      \u0275\u0275restoreView(_r15);
      \u0275\u0275nextContext(2);
      const section_r7 = \u0275\u0275readContextLet(0);
      const ctx_r1 = \u0275\u0275nextContext(4);
      return \u0275\u0275resetView(ctx_r1.downloadAttachment(section_r7));
    });
    \u0275\u0275text(3, "\u4E0B\u8F7D");
    \u0275\u0275elementEnd();
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_13_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 33)(1, "div", 39);
    \u0275\u0275text(2, "\u{1F4CE}");
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(3, "div", 40)(4, "strong");
    \u0275\u0275text(5);
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(6, "span");
    \u0275\u0275text(7);
    \u0275\u0275elementEnd()();
    \u0275\u0275elementStart(8, "div", 41);
    \u0275\u0275conditionalCreate(9, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_13_Conditional_9_Template, 4, 0);
    \u0275\u0275elementEnd()();
  }
  if (rf & 2) {
    let tmp_24_0;
    let tmp_25_0;
    \u0275\u0275nextContext();
    const section_r7 = \u0275\u0275readContextLet(0);
    const ctx_r1 = \u0275\u0275nextContext(4);
    \u0275\u0275advance(5);
    \u0275\u0275textInterpolate(((tmp_24_0 = ctx_r1.attachmentFor(section_r7)) == null ? null : tmp_24_0.name) || section_r7.text || "\u9644\u4EF6");
    \u0275\u0275advance(2);
    \u0275\u0275textInterpolate(((tmp_25_0 = ctx_r1.attachmentFor(section_r7)) == null ? null : tmp_25_0.path) || ctx_r1.attachmentName(section_r7));
    \u0275\u0275advance(2);
    \u0275\u0275conditional(ctx_r1.attachmentFor(section_r7) ? 9 : -1);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275declareLet(0);
    \u0275\u0275elementStart(1, "div", 30);
    \u0275\u0275conditionalCreate(2, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_2_Template, 2, 1, "h2")(3, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_3_Template, 2, 1, "h3")(4, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_4_Template, 2, 1, "h4")(5, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_5_Template, 2, 1, "h5")(6, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_6_Template, 2, 1, "h6")(7, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_7_Template, 2, 1, "div", 31)(8, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_8_Template, 2, 1, "div", 32)(9, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_9_Template, 1, 1)(10, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_10_Template, 3, 1, "ul")(11, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_11_Template, 11, 3, "table")(12, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_12_Template, 2, 1)(13, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Case_13_Template, 10, 3, "div", 33);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    let tmp_25_0;
    const entry_r6 = ctx.$implicit;
    const ctx_r1 = \u0275\u0275nextContext(4);
    const section_r16 = \u0275\u0275storeLet(entry_r6.section);
    \u0275\u0275advance();
    \u0275\u0275classMap(ctx_r1.sectionCssClass(section_r16));
    \u0275\u0275property("id", entry_r6.id);
    \u0275\u0275advance();
    \u0275\u0275conditional((tmp_25_0 = section_r16.type) === "heading1" ? 2 : tmp_25_0 === "heading2" ? 3 : tmp_25_0 === "heading3" ? 4 : tmp_25_0 === "heading4" ? 5 : tmp_25_0 === "heading5" ? 6 : tmp_25_0 === "heading6" ? 7 : tmp_25_0 === "heading7" ? 8 : tmp_25_0 === "paragraph" ? 9 : tmp_25_0 === "list" ? 10 : tmp_25_0 === "table" ? 11 : tmp_25_0 === "image" ? 12 : tmp_25_0 === "attachment" ? 13 : -1);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_0_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "section", 27);
    \u0275\u0275repeaterCreate(1, PreviewWorkbench_Conditional_12_For_17_Conditional_0_For_2_Template, 14, 5, "div", 29, _forTrack0);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const group_r17 = \u0275\u0275nextContext().$implicit;
    \u0275\u0275property("id", group_r17.id);
    \u0275\u0275advance();
    \u0275\u0275repeater(group_r17.sections);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Conditional_1_Template(rf, ctx) {
  if (rf & 1) {
    const _r18 = \u0275\u0275getCurrentView();
    \u0275\u0275elementStart(0, "button", 43);
    \u0275\u0275listener("click", function PreviewWorkbench_Conditional_12_For_17_Conditional_1_Template_button_click_0_listener() {
      \u0275\u0275restoreView(_r18);
      const group_r17 = \u0275\u0275nextContext().$implicit;
      const ctx_r1 = \u0275\u0275nextContext(2);
      return \u0275\u0275resetView(ctx_r1.showPreviewSection(group_r17.id));
    });
    \u0275\u0275elementStart(1, "span");
    \u0275\u0275text(2);
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(3, "strong");
    \u0275\u0275text(4, "\u52A0\u8F7D\u672C\u7AE0");
    \u0275\u0275elementEnd()();
  }
  if (rf & 2) {
    const group_r17 = \u0275\u0275nextContext().$implicit;
    \u0275\u0275advance(2);
    \u0275\u0275textInterpolate(group_r17.title);
  }
}
function PreviewWorkbench_Conditional_12_For_17_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275conditionalCreate(0, PreviewWorkbench_Conditional_12_For_17_Conditional_0_Template, 3, 1, "section", 27)(1, PreviewWorkbench_Conditional_12_For_17_Conditional_1_Template, 5, 1, "button", 28);
  }
  if (rf & 2) {
    const group_r17 = ctx.$implicit;
    const ctx_r1 = \u0275\u0275nextContext(2);
    \u0275\u0275conditional(ctx_r1.isPreviewSectionVisible(group_r17.id) ? 0 : 1);
  }
}
function PreviewWorkbench_Conditional_12_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 7)(1, "aside", 11)(2, "div", 12)(3, "span", 13);
    \u0275\u0275text(4, "\u5BFC\u51FA\u76EE\u5F55");
    \u0275\u0275elementEnd();
    \u0275\u0275conditionalCreate(5, PreviewWorkbench_Conditional_12_Conditional_5_Template, 2, 0, "button", 14);
    \u0275\u0275elementEnd();
    \u0275\u0275elementStart(6, "div", 15);
    \u0275\u0275repeaterCreate(7, PreviewWorkbench_Conditional_12_For_8_Template, 6, 11, "button", 16, _forTrack0);
    \u0275\u0275elementEnd()();
    \u0275\u0275elementStart(9, "div", 17)(10, "h1", 18);
    \u0275\u0275text(11);
    \u0275\u0275elementEnd();
    \u0275\u0275element(12, "div", 19);
    \u0275\u0275elementStart(13, "div", 20);
    \u0275\u0275repeaterCreate(14, PreviewWorkbench_Conditional_12_For_15_Template, 5, 5, "div", 21, _forTrack1);
    \u0275\u0275elementEnd();
    \u0275\u0275repeaterCreate(16, PreviewWorkbench_Conditional_12_For_17_Template, 2, 1, null, null, _forTrack0);
    \u0275\u0275elementEnd()();
  }
  if (rf & 2) {
    const ctx_r1 = \u0275\u0275nextContext();
    \u0275\u0275advance(5);
    \u0275\u0275conditional(ctx_r1.collapsedOutlineIds().size ? 5 : -1);
    \u0275\u0275advance(2);
    \u0275\u0275repeater(ctx_r1.visibleOutlineItems());
    \u0275\u0275advance(4);
    \u0275\u0275textInterpolate(ctx_r1.title());
    \u0275\u0275advance();
    \u0275\u0275property("innerHTML", ctx_r1.metaHtml(), \u0275\u0275sanitizeHtml);
    \u0275\u0275advance(2);
    \u0275\u0275repeater(ctx_r1.summaryCards());
    \u0275\u0275advance(2);
    \u0275\u0275repeater(ctx_r1.previewGroups());
  }
}
function PreviewWorkbench_Conditional_13_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "pre", 8);
    \u0275\u0275text(1);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const ctx_r1 = \u0275\u0275nextContext();
    \u0275\u0275advance();
    \u0275\u0275textInterpolate(ctx_r1.markdown());
  }
}
function PreviewWorkbench_app_wait_dialog_14_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-wait-dialog", 44);
  }
  if (rf & 2) {
    const wait_r19 = ctx.ngIf;
    \u0275\u0275property("title", wait_r19.title)("description", wait_r19.description)("progress", wait_r19.progress ?? -1)("remainingSeconds", wait_r19.remainingSeconds ?? 0);
  }
}
function PreviewWorkbench_Conditional_15_For_4_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-preview-graph-host", 46);
  }
  if (rf & 2) {
    const stage_r20 = ctx.$implicit;
    const \u0275$index_209_r21 = ctx.$index;
    const ctx_r1 = \u0275\u0275nextContext(2);
    \u0275\u0275property("targetId", ctx_r1.identityOf(stage_r20, "stage-" + (\u0275$index_209_r21 + 1)))("exportGraphId", ctx_r1.stageGraphId("stage-flow", stage_r20, \u0275$index_209_r21));
  }
}
function PreviewWorkbench_Conditional_15_For_6_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275element(0, "app-preview-graph-host", 47);
  }
  if (rf & 2) {
    const process_r22 = ctx.$implicit;
    const \u0275$index_212_r23 = ctx.$index;
    const ctx_r1 = \u0275\u0275nextContext(2);
    \u0275\u0275property("targetId", ctx_r1.identityOf(process_r22, "process-" + (\u0275$index_212_r23 + 1)))("exportGraphId", ctx_r1.processGraphId(process_r22, \u0275$index_212_r23));
  }
}
function PreviewWorkbench_Conditional_15_Template(rf, ctx) {
  if (rf & 1) {
    \u0275\u0275elementStart(0, "div", 10);
    \u0275\u0275element(1, "app-panorama-workbench")(2, "app-preview-graph-host", 45);
    \u0275\u0275repeaterCreate(3, PreviewWorkbench_Conditional_15_For_4_Template, 1, 2, "app-preview-graph-host", 46, _forTrack2, true);
    \u0275\u0275repeaterCreate(5, PreviewWorkbench_Conditional_15_For_6_Template, 1, 2, "app-preview-graph-host", 47, _forTrack3, true);
    \u0275\u0275element(7, "app-component-workbench", 48);
    \u0275\u0275elementEnd();
  }
  if (rf & 2) {
    const ctx_r1 = \u0275\u0275nextContext();
    \u0275\u0275advance(2);
    \u0275\u0275property("exportGraphId", ctx_r1.stageGraphId("stage-panorama"));
    \u0275\u0275advance();
    \u0275\u0275repeater(ctx_r1.stages());
    \u0275\u0275advance(2);
    \u0275\u0275repeater(ctx_r1.processes());
    \u0275\u0275advance(2);
    \u0275\u0275property("exportOnly", true);
  }
}
var PreviewWorkbench = class _PreviewWorkbench {
  // 模块意图：复刻旧版预览页的阅读式框架，同时保持 Angular 运行时和导出链路的单向依赖。
  // 关键流程：左侧大纲由文档结构生成，右侧正文直接渲染为阅读 HTML，原文 MD 与导出复用同一份 Markdown。
  // 边界细节：正文 HTML 由本组件统一转义字段后生成，再放行旧版懒加载所需的 data-* 标记。
  api = inject(ApiService);
  sanitizer = inject(DomSanitizer);
  exportSvc = inject(ExportService);
  assembler = new FragmentAssembler();
  runtime = getAngularRuntimeState();
  exportWait = signal(null, ...ngDevMode ? [{ debugName: "exportWait" }] : (
    /* istanbul ignore next */
    []
  ));
  exportCaptureReady = signal(false, ...ngDevMode ? [{ debugName: "exportCaptureReady" }] : (
    /* istanbul ignore next */
    []
  ));
  showRaw = signal(false, ...ngDevMode ? [{ debugName: "showRaw" }] : (
    /* istanbul ignore next */
    []
  ));
  collapsedOutlineIds = signal(/* @__PURE__ */ new Set(), ...ngDevMode ? [{ debugName: "collapsedOutlineIds" }] : (
    /* istanbul ignore next */
    []
  ));
  visibleSectionIds = signal(/* @__PURE__ */ new Set(), ...ngDevMode ? [{ debugName: "visibleSectionIds" }] : (
    /* istanbul ignore next */
    []
  ));
  title = computed(() => this.runtime.doc?.meta?.title || this.runtime.doc?.meta?.domain || this.runtime.currentFile || "\u672A\u547D\u540D\u6587\u6863", ...ngDevMode ? [{ debugName: "title" }] : (
    /* istanbul ignore next */
    []
  ));
  previewContent = computed(() => this.buildPreviewContent(), ...ngDevMode ? [{ debugName: "previewContent" }] : (
    /* istanbul ignore next */
    []
  ));
  previewGroups = computed(() => this.groupPreviewSections(this.previewContent().sections), ...ngDevMode ? [{ debugName: "previewGroups" }] : (
    /* istanbul ignore next */
    []
  ));
  markdown = computed(() => this.assembler.exportOneMarkdown(this.previewContent()), ...ngDevMode ? [{ debugName: "markdown" }] : (
    /* istanbul ignore next */
    []
  ));
  metaHtml = computed(() => this.trustedHtml(this.renderMeta(this.runtime.doc?.meta || {})), ...ngDevMode ? [{ debugName: "metaHtml" }] : (
    /* istanbul ignore next */
    []
  ));
  outlineItems = computed(() => this.buildOutlineItems(), ...ngDevMode ? [{ debugName: "outlineItems" }] : (
    /* istanbul ignore next */
    []
  ));
  outlineNumberMap = computed(() => new Map(this.outlineItems().map((item) => [item.id, item.number])), ...ngDevMode ? [{ debugName: "outlineNumberMap" }] : (
    /* istanbul ignore next */
    []
  ));
  visibleOutlineItems = computed(() => this.buildVisibleOutlineItems(), ...ngDevMode ? [{ debugName: "visibleOutlineItems" }] : (
    /* istanbul ignore next */
    []
  ));
  summaryCards = computed(() => [
    { label: "\u4EF7\u503C\u6D41\u73AF\u8282", value: this.valueStreamLanes().length, tone: "blue" },
    { label: "\u9636\u6BB5", value: this.stages().length, tone: "green" },
    { label: "\u6D41\u7A0B", value: this.processes().length, tone: "cyan" },
    { label: "\u6784\u4EF6/\u63A5\u53E3", value: this.constructs().length + this.services().length, tone: "amber" }
  ], ...ngDevMode ? [{ debugName: "summaryCards" }] : (
    /* istanbul ignore next */
    []
  ));
  /** 根据大纲条目 ID 获取序号，正文标题使用 */
  outlineNumber(id) {
    return this.outlineNumberMap().get(id) || "";
  }
  /** 流程组在 outline 中的 anchor ID，与 buildOutlineItems 保持一致 */
  groupAnchorId(stage, groupName) {
    const stageId = this.identityOf(stage, `stage-${this.stages().indexOf(stage)}`);
    return `preview-group-${stageId}-${groupName}`;
  }
  /** 流程在 outline 中的 anchor ID，与 buildOutlineItems 保持一致 */
  procAnchorId(stage, process) {
    const stageId = this.identityOf(stage, `stage-${this.stages().indexOf(stage)}`);
    return this.anchorId("proc", this.identityOf(process, `${stageId}-${process.flowGroup || "proc"}`));
  }
  toggleRaw() {
    this.showRaw.update((value) => !value);
  }
  /** 展开全部折叠 */
  expandAll() {
    this.collapsedOutlineIds.set(/* @__PURE__ */ new Set());
  }
  expandAllSections() {
    this.visibleSectionIds.set(new Set(this.previewGroups().map((group) => group.id)));
  }
  /** 切换大纲条目折叠/展开，depth 0/1 可折叠（对应 2 级折叠） */
  toggleOutline(item) {
    if (item.depth > 1)
      return;
    this.collapsedOutlineIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(item.id))
        next.delete(item.id);
      else
        next.add(item.id);
      return next;
    });
  }
  isOutlineCollapsed(item) {
    if (item.depth > 1)
      return false;
    return this.collapsedOutlineIds().has(item.id);
  }
  /** 点击大纲：跳转正文 + depth 0/1 折叠切换 */
  handleOutlineClick(item) {
    this.ensurePreviewSectionVisible(item);
    window.setTimeout(() => this.jumpTo(item.id), 0);
    if (item.depth <= 1)
      this.toggleOutline(item);
  }
  isPreviewSectionVisible(sectionId) {
    const visible = this.visibleSectionIds();
    if (visible.size === 0)
      return this.previewGroups()[0]?.id === sectionId;
    return visible.has(sectionId);
  }
  showPreviewSection(sectionId) {
    this.visibleSectionIds.update((ids) => {
      const next = new Set(ids);
      next.add(sectionId);
      return next;
    });
  }
  previewSectionLabel(sectionId) {
    const group = this.previewGroups().find((candidate) => candidate.id === sectionId);
    if (group)
      return group.title;
    const item = this.outlineItems().find((candidate) => candidate.id === sectionId);
    return item ? `${item.number} ${item.label}` : "\u7AE0\u8282\u5185\u5BB9";
  }
  sectionCssClass(section) {
    return `pv-export-section pv-export-${section.type}`;
  }
  sectionHeadingTag(section) {
    const level = Number(section.type.replace("heading", ""));
    return `h${Math.max(2, Math.min(6, level + 1))}`;
  }
  isHeadingSection(section) {
    return /^heading[1-7]$/.test(section.type);
  }
  isRichTextColumn(section, columnIndex) {
    return new Set(section.richTextColumns || []).has(columnIndex);
  }
  tableColumnStyle(section, columnIndex) {
    const widths = section.columnWidths || [];
    return widths[columnIndex] ? { width: `${widths[columnIndex]}%` } : {};
  }
  attachmentName(section) {
    const attachment = this.previewContent().attachments?.find((item) => item.id === section.attachmentId);
    return attachment?.path || attachment?.name || section.text || "\u9644\u4EF6";
  }
  previewImageGraph(section) {
    const kind = this.previewImageKind(section);
    if (!kind)
      return null;
    return {
      kind,
      targetId: this.previewImageTargetId(section),
      graphId: this.previewImageGraphId(section)
    };
  }
  previewImageKind(section) {
    const text = String(section.text || "");
    if (text.includes("\u5168\u666F\u89C6\u56FE") || text.includes("\u4EF7\u503C\u6D41\u89C6\u56FE"))
      return "stage-panorama";
    if (text.includes("\u9636\u6BB5\u89C6\u56FE"))
      return "stage-flow";
    if (text.includes("\u6D41\u7A0B\u56FE"))
      return "process-flow";
    if (text.includes("\u5B9E\u4F53\u5173\u7CFB\u56FE"))
      return "entity-relation";
    if (text.includes("\u5B9E\u4F53\u72B6\u6001\u56FE"))
      return "entity-state";
    return "";
  }
  previewImageTargetId(section) {
    const text = String(section.text || "");
    if (text.includes("\u9636\u6BB5\u89C6\u56FE")) {
      const name = text.split("\uFF1A").pop()?.trim() || "";
      const stage = this.stages().find((item) => this.displayName(item, "") === name);
      return stage ? this.identityOf(stage, "") : "";
    }
    if (text.includes("\u6D41\u7A0B\u56FE")) {
      const name = text.split("\uFF1A").pop()?.trim() || "";
      const process = this.processes().find((item) => this.displayName(item, "") === name);
      return process ? this.identityOf(process, "") : "";
    }
    if (text.includes("\u5B9E\u4F53\u72B6\u6001\u56FE")) {
      const name = text.split("\uFF1A").pop()?.trim() || "";
      const entity = this.entities().find((item) => this.displayName(item, "") === name);
      return entity ? this.identityOf(entity, "") : "";
    }
    return "";
  }
  previewImageGraphId(section) {
    const kind = this.previewImageKind(section);
    const targetId = this.previewImageTargetId(section);
    if (kind === "stage-panorama")
      return exportGraphId("stage-panorama");
    if (kind === "stage-flow")
      return exportGraphId("stage-flow", targetId);
    if (kind === "process-flow")
      return exportGraphId("process-flow", targetId);
    if (kind === "entity-relation")
      return exportGraphId("entity-relation");
    if (kind === "entity-state")
      return exportGraphId("entity-state", targetId);
    return "";
  }
  headingNumber(text) {
    const match = String(text || "").trim().match(/^(\d+(?:\.\d+)*)[.\s]/);
    return match?.[1] || "";
  }
  headingLabel(text) {
    return String(text || "").trim().replace(/^\d+(?:\.\d+)*[.\s]+/, "");
  }
  jumpTo(anchorId) {
    const el = document.getElementById(anchorId);
    if (el)
      el.scrollIntoView({ behavior: "instant", block: "start" });
  }
  ensurePreviewSectionVisible(item) {
    const group = this.previewGroups().find((candidate) => candidate.id === item.id || candidate.sections.some((entry) => entry.id === item.id));
    if (group)
      this.showPreviewSection(group.id);
  }
  buildPreviewContent() {
    const doc = this.runtime.doc;
    const contents = [
      new PanoramaExporter(doc, this.runtime.currentFile || "").getContent(),
      new ValueStreamExporter(doc).getContent(),
      new ComponentModelExporter(doc, this.componentGraphIds()).getContent(),
      new ApplicationExporter(doc).getContent()
    ];
    return this.embedAttachmentCardsNearOwners(this.assembler.mergeContents(contents, []).content);
  }
  groupPreviewSections(sections) {
    const groups = [];
    let current = null;
    sections.forEach((section, index) => {
      const sectionId = this.sectionAnchorId(section, index);
      if (section.type === "heading1" || !current) {
        current = {
          id: sectionId,
          title: section.text || `\u7AE0\u8282${groups.length + 1}`,
          sections: []
        };
        groups.push(current);
      }
      current.sections.push({ id: sectionId, section });
    });
    return groups;
  }
  sectionAnchorId(section, index) {
    return this.anchorId("section", `${index}-${section.type}-${section.text || ""}`);
  }
  headingDisplayText(section, id) {
    const number = this.outlineNumber(id);
    const label = this.headingLabel(section.text || "");
    return number ? `${number} ${label}` : label;
  }
  attachmentFor(section) {
    return this.previewContent().attachments?.find((item) => item.id === section.attachmentId) || null;
  }
  previewAttachment(section) {
    const attachment = this.attachmentFor(section);
    if (!attachment)
      return;
    const url = URL.createObjectURL(this.attachmentBlob(attachment));
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  downloadAttachment(section) {
    const attachment = this.attachmentFor(section);
    if (!attachment)
      return;
    downloadBlob(this.attachmentBlob(attachment), attachment.name || "attachment");
  }
  attachmentBlob(attachment) {
    const buffer = new ArrayBuffer(attachment.data.byteLength);
    new Uint8Array(buffer).set(attachment.data);
    return new Blob([buffer], { type: attachment.contentType || "application/octet-stream" });
  }
  moveAttachmentChapterToEnd(content) {
    const firstAttachmentHeading = content.sections.findIndex((section) => section.type === "heading1" && this.headingLabel(section.text || "") === "\u9644\u4EF6");
    if (firstAttachmentHeading < 0)
      return content;
    const nextHeading = content.sections.findIndex((section, index) => index > firstAttachmentHeading && section.type === "heading1");
    const end = nextHeading < 0 ? content.sections.length : nextHeading;
    const attachmentSections = content.sections.slice(firstAttachmentHeading, end);
    const otherSections = [
      ...content.sections.slice(0, firstAttachmentHeading),
      ...content.sections.slice(end)
    ];
    return __spreadProps(__spreadValues({}, content), {
      sections: [
        ...otherSections.filter((section, index, list) => !(section.type === "paragraph" && !section.text && (index === 0 || index === list.length - 1))),
        { type: "paragraph", text: "" },
        ...attachmentSections
      ]
    });
  }
  // 模块意图：预览页更适合在流程/节点上下文里看到附件，集中“附件”章节只保留给导出包组织文件。
  // 关键流程：解析附件章节里的阶段/流程/附件元数据，删除集中章节，再把附件卡片插入对应流程或节点标题之后。
  // 边界细节：附件卡片不是 heading，不进入大纲；如果找不到匹配标题，则回退到文末，避免附件入口丢失。
  embedAttachmentCardsNearOwners(content) {
    const attachmentChapter = this.extractAttachmentChapter(content.sections);
    if (!attachmentChapter)
      return content;
    const { sections: remainingSections, embeds } = attachmentChapter;
    if (!embeds.length)
      return __spreadProps(__spreadValues({}, content), { sections: remainingSections });
    const inserted = /* @__PURE__ */ new Set();
    const nextSections = [];
    let currentProcessName = "";
    for (const section of remainingSections) {
      nextSections.push(section);
      if (section.type === "heading4" && this.headingLabel(section.text || "").startsWith("\u6D41\u7A0B\uFF1A")) {
        currentProcessName = this.headingLabel(section.text || "").replace(/^流程：/, "").trim();
        this.pushMatchingAttachmentEmbeds(nextSections, embeds, inserted, currentProcessName, "");
      } else if (section.type === "heading5" && this.headingLabel(section.text || "").startsWith("\u8282\u70B9\uFF1A")) {
        const nodeName = this.headingLabel(section.text || "").replace(/^节点：/, "").trim();
        this.pushMatchingAttachmentEmbeds(nextSections, embeds, inserted, currentProcessName, nodeName);
      } else if (section.type === "heading1" || section.type === "heading2" || section.type === "heading3") {
        if (section.type !== "heading3")
          currentProcessName = "";
      }
    }
    const leftovers = embeds.filter((embed) => !inserted.has(embed.section)).map((embed) => embed.section);
    return __spreadProps(__spreadValues({}, content), {
      sections: leftovers.length ? [...nextSections, { type: "paragraph", text: "" }, ...leftovers] : nextSections
    });
  }
  extractAttachmentChapter(sections) {
    const start = sections.findIndex((section) => section.type === "heading1" && this.headingLabel(section.text || "") === "\u9644\u4EF6");
    if (start < 0)
      return null;
    const next = sections.findIndex((section, index) => index > start && section.type === "heading1");
    const end = next < 0 ? sections.length : next;
    const chapter = sections.slice(start, end);
    const remaining = [
      ...sections.slice(0, start),
      ...sections.slice(end)
    ].filter((section, index, list) => !(section.type === "paragraph" && !section.text && (index === 0 || index === list.length - 1)));
    const embeds = [];
    let processName = "";
    let meta = {};
    for (const section of chapter) {
      const label = this.headingLabel(section.text || "");
      if (section.type === "heading3" && label.startsWith("\u6D41\u7A0B\uFF1A")) {
        processName = label.replace(/^流程：/, "").trim();
        meta = {};
      } else if (section.type === "heading4") {
        meta = {};
      } else if (section.type === "table") {
        meta = Object.fromEntries((section.rows || []).map((row) => [String(row[0] || ""), String(row[1] || "")]));
      } else if (section.type === "attachment") {
        embeds.push({
          processName,
          nodeName: meta["\u6240\u5C5E\u8282\u70B9"] === "-" ? "" : meta["\u6240\u5C5E\u8282\u70B9"] || "",
          scope: meta["\u6240\u5C5E\u5C42\u7EA7"] || "",
          section
        });
      }
    }
    return { sections: remaining, embeds };
  }
  pushMatchingAttachmentEmbeds(target, embeds, inserted, processName, nodeName) {
    const isNode = Boolean(nodeName);
    for (const embed of embeds) {
      if (inserted.has(embed.section))
        continue;
      if (embed.processName !== processName)
        continue;
      if (isNode) {
        if (embed.scope !== "\u8282\u70B9\u9644\u4EF6" || embed.nodeName !== nodeName)
          continue;
      } else if (embed.scope !== "\u6D41\u7A0B\u9644\u4EF6") {
        continue;
      }
      target.push(embed.section);
      inserted.add(embed.section);
    }
  }
  // ── 附件辅助方法 ──
  /** 构建附件 API URL。prototypeFiles 可能为 {uid, versionUid} 精简格式或 {uid, name, versions:[...]} 完整格式 */
  attachmentUrl(pf) {
    const docName = this.runtime.currentFile || "";
    const uid = pf?.uid || "";
    const versionUid = pf?.versionUid || pf?.versions?.[0]?.uid || "";
    if (!docName || !uid || !versionUid)
      return "";
    return `/api/attachment/${encodeURIComponent(docName)}/${encodeURIComponent(uid)}/${encodeURIComponent(versionUid)}`;
  }
  attachmentContentType(pf) {
    return String(pf?.versions?.[0]?.contentType || "");
  }
  isImageAttachment(pf) {
    return this.attachmentContentType(pf).startsWith("image/");
  }
  isHtmlAttachment(pf) {
    const ct = this.attachmentContentType(pf).toLowerCase();
    return ct.includes("html");
  }
  /** 附件显示名，精简格式无 name 时用 uid 最后 8 位 */
  attachmentLabel(pf) {
    return pf?.name?.trim() || (pf?.uid ? pf.uid.slice(-8) : "\u672A\u547D\u540D\u9644\u4EF6");
  }
  /** 是否有节点级附件 */
  hasNodeAttachments(process) {
    return this.asArray(process?.nodes || process?.tasks).some((n) => this.asArray(n?.prototypeFiles).length > 0);
  }
  /** 遍历所有流程，找出有关联附件的流程 */
  processesWithAttachments() {
    return this.processes().filter((p) => {
      if (this.asArray(p?.prototypeFiles).length)
        return true;
      return this.asArray(p?.nodes || p?.tasks).some((n) => this.asArray(n?.prototypeFiles).length > 0);
    });
  }
  roles() {
    return this.asArray(this.runtime.doc?.roles);
  }
  terms() {
    const doc = this.runtime.doc || {};
    return this.asArray(doc.terms || doc.language);
  }
  stages() {
    return this.asArray(this.runtime.doc?.stages);
  }
  // 模块意图：从 panorama.columns 提取价值流线（仓单监管@杨伟），用于大纲和正文的价值流分组。
  // 关键流程：列是价值流（仓单监管、交割服务机构监管），行是业务域（交割智慧监管平台）。
  valueStreamLanes() {
    const doc = this.runtime.doc || {};
    const columns = this.asArray(doc.panorama?.columns).map((item, index) => ({
      id: String(item.uid || item.id || `col-${index + 1}`),
      name: String(item.name || item.title || item.id || `\u4EF7\u503C\u6D41${index + 1}`)
    }));
    if (columns.length)
      return columns;
    const ids = Array.from(new Set(this.stages().map((s) => String(s.panoramaColumnUid || s.columnUid || "")).filter(Boolean)));
    return ids.length ? ids.map((id) => ({ id, name: id })) : [];
  }
  // 模块意图：根据价值流 columnUid 过滤阶段。
  stagesInLane(laneId) {
    return this.stages().filter((s) => {
      const colUid = String(s.panoramaColumnUid || s.columnUid || "").trim();
      return colUid ? colUid === laneId : false;
    });
  }
  processes() {
    return this.asArray(this.runtime.doc?.processes);
  }
  /** 返回阶段下的流程分组（含空字符串键的无组流程），模板直接遍历 */
  stageProcessGroups(stage) {
    const doc = this.runtime.doc || {};
    const groups = /* @__PURE__ */ new Map();
    this.stageProcessRefs(stage, doc).forEach((ref) => {
      const process = this.findProcessByRef(ref, doc) || ref;
      const group = String(process?.flowGroup || "").trim();
      const key = group || "__ungrouped__";
      if (!groups.has(key))
        groups.set(key, []);
      groups.get(key).push(process);
    });
    const result = [];
    const ungrouped = groups.get("__ungrouped__");
    if (ungrouped)
      result.push({ name: "", processes: ungrouped });
    groups.forEach((procs, key) => {
      if (key !== "__ungrouped__")
        result.push({ name: key, processes: procs });
    });
    return result;
  }
  /** 未被任何构件引用的独立实体 */
  orphanEntities() {
    const constructs = this.constructs();
    const linked = /* @__PURE__ */ new Set();
    constructs.forEach((c) => this.constructEntities(c).forEach((e) => linked.add(this.identityOf(e, ""))));
    return this.entities().filter((e) => !linked.has(this.identityOf(e, "")));
  }
  /** 未被任何构件引用的独立任务 */
  orphanTasks() {
    const constructs = this.constructs();
    const linked = /* @__PURE__ */ new Set();
    constructs.forEach((c) => this.constructTasks(c).forEach((t) => linked.add(this.identityOf(t, ""))));
    return this.taskDefinitions().filter((t) => !linked.has(this.identityOf(t, "")));
  }
  /** 未被任何阶段引用的独立流程 */
  orphanProcesses() {
    const doc = this.runtime.doc || {};
    const stages = this.stages();
    const refd = /* @__PURE__ */ new Set();
    stages.forEach((stage) => {
      this.stageProcessRefs(stage, doc).forEach((ref) => {
        const p = this.findProcessByRef(ref, doc);
        if (p)
          refd.add(this.identityOf(p, ""));
      });
    });
    return this.processes().filter((p) => !refd.has(this.identityOf(p, "")));
  }
  entities() {
    return this.asArray(this.runtime.doc?.entities);
  }
  components() {
    return this.asArray(this.runtime.doc?.businessComponents);
  }
  constructs() {
    return this.asArray(this.runtime.doc?.businessConstructs);
  }
  taskDefinitions() {
    return this.asArray(this.runtime.doc?.taskDefinitions);
  }
  services() {
    const doc = this.runtime.doc || {};
    const a = this.asArray(doc.applicationServices);
    if (a.length)
      return a;
    const b = this.asArray(doc.appServices);
    if (b.length)
      return b;
    return this.asArray(doc.services);
  }
  /** 服务组 */
  serviceGroups() {
    return this.asArray(this.runtime.doc?.serviceGroups);
  }
  /** 按服务组 uid 过滤接口 */
  servicesByGroup(groupUid) {
    return this.services().filter((s) => s.serviceGroupUid === groupUid);
  }
  /** 格式化参数为JSON文本 */
  formatParams(params) {
    if (!Array.isArray(params) || !params.length)
      return "";
    try {
      return JSON.stringify(params, null, 2);
    } catch {
      return String(params);
    }
  }
  interfaces() {
    return this.asArray(this.runtime.doc?.applicationInterfaces || this.runtime.doc?.appInterfaces);
  }
  processAnchor(process, index) {
    return this.anchorId("proc", this.identityOf(process, `process-${index + 1}`));
  }
  stageAnchor(stage, index) {
    return this.anchorId("stage", this.identityOf(stage, `stage-${index + 1}`));
  }
  entityAnchor(entity, index) {
    return this.anchorId("entity", this.identityOf(entity, `entity-${index + 1}`));
  }
  stageGraphId(kind, stage, index = 0) {
    if (kind === "stage-panorama")
      return exportGraphId(kind);
    const suffix = stage ? this.identityOf(stage, `stage-${index + 1}`) : "panorama";
    return exportGraphId(kind, suffix);
  }
  processGraphId(process, index) {
    return exportGraphId("process-flow", this.identityOf(process, `process-${index + 1}`));
  }
  entityGraphId(kind, entity, index = 0) {
    const suffix = entity ? this.identityOf(entity, `entity-${index + 1}`) : "overview";
    return exportGraphId(kind, kind === "entity-relation" ? "" : suffix);
  }
  processNodes(process) {
    return this.asArray(process?.nodes || process?.tasks || process?.steps);
  }
  richText(value) {
    return this.trustedHtml(this.richTextCell(value));
  }
  fieldRows(entity) {
    return this.asArray(entity?.fields);
  }
  componentKindLabel(component) {
    const value = String(component?.kind || component?.type || "").toLowerCase();
    if (value.includes("core") || value.includes("\u6838\u5FC3"))
      return "\u6838\u5FC3\u7EC4\u4EF6";
    if (value.includes("common") || value.includes("\u901A\u7528"))
      return "\u901A\u7528\u7EC4\u4EF6";
    return component?.kind || component?.type || "\u4E1A\u52A1\u7EC4\u4EF6";
  }
  componentNameById(uid) {
    const key = String(uid || "");
    const item = this.components().find((component) => this.identityOf(component, "") === key || component.uid === key || component.id === key);
    return item ? this.displayName(item, "\u672A\u547D\u540D\u7EC4\u4EF6") : key || "-";
  }
  constructNameById(uid) {
    const key = String(uid || "");
    const item = this.constructs().find((construct) => this.identityOf(construct, "") === key || construct.uid === key || construct.id === key);
    return item ? this.displayName(item, "\u672A\u547D\u540D\u6784\u4EF6") : key || "-";
  }
  constructEntities(construct) {
    const ids = new Set(this.asArray(construct?.entityUids || construct?.entities).map((item) => typeof item === "string" ? item : this.identityOf(item, "")));
    return this.entities().filter((entity) => ids.has(this.identityOf(entity, "")) || entity.businessConstructUid === construct.uid || entity.constructUid === construct.uid);
  }
  constructTasks(construct) {
    const ids = new Set(this.asArray(construct?.taskUids || construct?.tasks).map((item) => typeof item === "string" ? item : this.identityOf(item, "")));
    return this.taskDefinitions().filter((task) => ids.has(this.identityOf(task, "")) || task.businessConstructUid === construct.uid || task.constructUid === construct.uid);
  }
  constructEntityNames(construct) {
    return this.constructEntities(construct).map((entity) => this.displayName(entity, "\u672A\u547D\u540D\u5B9E\u4F53")).join("\u3001") || "-";
  }
  constructTaskNames(construct) {
    return this.constructTasks(construct).map((task) => this.displayName(task, "\u672A\u547D\u540D\u4EFB\u52A1")).join("\u3001") || "-";
  }
  applicationInterfaceRows(service) {
    const serviceId = service ? this.identityOf(service, "") : "";
    return this.interfaces().filter((item) => !serviceId || item.serviceUid === serviceId || item.serviceId === serviceId || item.applicationServiceUid === serviceId);
  }
  /** 当前文档版本号（seq） */
  currentVersion() {
    return String(this.runtime.collab?.seq || this.runtime.collab?.acceptedSeq || "").trim();
  }
  /** 通用导出前检查：远端有更新时提示同步 */
  async confirmExport() {
    if (!this.runtime.currentFile)
      return false;
    const latest = Number(this.runtime.collab?.seq || 0);
    const base = Number(this.runtime.collab?.acceptedSeq || 0);
    const hasRemote = latest > base;
    if (hasRemote) {
      const doSync = await confirmRuntimeAction("\u68C0\u67E5\u5F53\u524D\u7248\u672C\u4E0E\u8FDC\u7AEF\u7248\u672C\u4E0D\u4E00\u81F4\uFF0C\u662F\u5426\u7ACB\u5373\u540C\u6B65\uFF1F\u5426\u5219\u5F71\u54CD\u9884\u89C8\u6548\u679C", { title: "\u540C\u6B65\u786E\u8BA4", confirmLabel: "\u7ACB\u5373\u540C\u6B65", cancelLabel: "\u76F4\u63A5\u5BFC\u51FA" });
      if (doSync) {
        await this.api.save(this.runtime.currentFile, this.runtime.doc || {}, { saveMessage: "\u5BFC\u51FA\u524D\u540C\u6B65" });
      }
    }
    return true;
  }
  async exportJson() {
    if (!this.runtime.currentFile)
      return;
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(this.runtime.doc || {}, null, 2));
    downloadBlob(new Blob([data], { type: "application/json" }), `${this.baseFileName()}.json`);
  }
  async exportMarkdown() {
    return this.exportPreviewDocument("md");
  }
  async exportDocx() {
    return this.exportPreviewDocument("docx");
  }
  async exportPreviewDocument(format) {
    if (!await this.confirmExport())
      return;
    const doc = this.runtime.doc;
    if (!doc)
      return;
    this.exportWait.set({ title: "\u6B63\u5728\u51C6\u5907\u9884\u89C8\u5BFC\u51FA", description: "\u6B63\u5728\u6E32\u67D3\u5168\u666F\u4E0E\u4EF7\u503C\u6D41\u622A\u56FE\u533A\u57DF", progress: 5 });
    this.exportCaptureReady.set(true);
    await this.waitForPreviewExportGraphs();
    try {
      const exporters = [
        new PanoramaExporter(doc),
        new ValueStreamExporter(doc),
        new ComponentModelExporter(doc, this.componentGraphIds()),
        new ApplicationExporter(doc)
      ];
      await this.exportSvc.exportAll(exporters, format, (progress) => this.updateExportProgress(progress));
      this.exportWait.set({ title: "\u5B8C\u6210", description: "", progress: 100 });
    } catch (e) {
      this.exportWait.set({ title: "\u5BFC\u51FA\u5931\u8D25", description: e instanceof Error ? e.message : String(e), progress: 0 });
    } finally {
      this.exportCaptureReady.set(false);
      await new Promise((resolve) => setTimeout(resolve, 300));
      this.exportWait.set(null);
    }
  }
  updateExportProgress(progress) {
    const ratio = progress.total > 0 ? progress.current / progress.total : 0;
    this.exportWait.set({
      title: `\u6B63\u5728\u5BFC\u51FA ${progress.label}`,
      description: this.exportPhaseText(progress),
      progress: Math.min(99, Math.max(8, Math.round(8 + ratio * 86)))
    });
  }
  exportPhaseText(progress) {
    if (progress.phase === "content")
      return "\u6B63\u5728\u51C6\u5907\u5185\u5BB9";
    if (progress.phase === "capture")
      return `\u6B63\u5728\u622A\u56FE ${progress.current}/${progress.total}`;
    if (progress.phase === "assemble")
      return "\u6B63\u5728\u751F\u6210\u6587\u4EF6";
    if (progress.phase === "download")
      return "\u6B63\u5728\u4E0B\u8F7D";
    return "\u6B63\u5728\u5BFC\u51FA";
  }
  async waitForPreviewExportGraphs() {
    const graphIds = [
      exportGraphId("stage-panorama"),
      ...this.stages().map((stage, index) => this.stageGraphId("stage-flow", stage, index)),
      ...this.processes().map((process, index) => this.processGraphId(process, index)),
      ...this.componentExportGraphIds()
    ];
    const selectors = [
      '[data-testid="panorama-overview-rich"]',
      ...graphIds.map((id) => `[data-export-graph-id="${String(id).replace(/"/g, '\\"')}"]`)
    ];
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ready = selectors.every((selector) => {
        const el = document.querySelector(selector);
        if (!el)
          return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (ready)
        return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  componentGraphIds() {
    return {
      overview: "component-export-overview",
      components: Object.fromEntries(this.components().map((component) => {
        const id = this.identityOf(component, "");
        return [id, `component-export-component-${id}`];
      })),
      constructs: Object.fromEntries(this.constructs().map((construct) => {
        const id = this.identityOf(construct, "");
        return [id, `component-export-construct-${id}`];
      })),
      relations: Object.fromEntries(this.constructs().map((construct) => {
        const id = this.identityOf(construct, "");
        return [id, `component-export-relation-${id}`];
      })),
      states: Object.fromEntries(this.entities().map((entity) => {
        const id = this.identityOf(entity, "");
        return [id, `component-export-state-${id}`];
      }))
    };
  }
  componentExportGraphIds() {
    const ids = this.componentGraphIds();
    return [
      ids.overview,
      ...Object.values(ids.components || {}),
      ...Object.values(ids.constructs || {}),
      ...Object.values(ids.relations || {}),
      ...Object.values(ids.states || {})
    ].filter((id) => Boolean(id));
  }
  buildOutlineItems() {
    const counters = [0, 0, 0, 0, 0, 0, 0];
    return this.previewGroups().flatMap((group) => group.sections).filter(({ section }) => this.isHeadingSection(section)).map(({ section, id }) => {
      const level = Number(section.type.replace("heading", ""));
      const depth = Math.max(0, Math.min(6, level - 1));
      counters[depth] += 1;
      for (let index = depth + 1; index < counters.length; index += 1)
        counters[index] = 0;
      const number = counters.slice(0, depth + 1).filter((value) => value > 0).join(".");
      return {
        id,
        label: this.headingLabel(section.text || ""),
        depth,
        number
      };
    });
  }
  buildVisibleOutlineItems() {
    const collapsed = this.collapsedOutlineIds();
    const items = this.outlineItems();
    if (!collapsed.size)
      return items;
    const hiddenDepthStack = [];
    const visible = [];
    for (const item of items) {
      while (hiddenDepthStack.length && item.depth <= hiddenDepthStack[hiddenDepthStack.length - 1]) {
        hiddenDepthStack.pop();
      }
      if (hiddenDepthStack.length)
        continue;
      visible.push(item);
      if (item.depth <= 1 && collapsed.has(item.id))
        hiddenDepthStack.push(item.depth);
    }
    return visible;
  }
  /** 按流程组整理阶段下的流程引用，返回 Map<groupName, processes[]> */
  groupRefsByFlowGroup(stage) {
    const groups = /* @__PURE__ */ new Map();
    const doc = this.runtime.doc || {};
    this.stageProcessRefs(stage, doc).forEach((ref) => {
      const process = this.findProcessByRef(ref, doc) || ref;
      const group = String(process?.flowGroup || "").trim();
      const key = group || "__ungrouped__";
      if (!groups.has(key))
        groups.set(key, []);
      groups.get(key).push(process);
    });
    const ungrouped = groups.get("__ungrouped__");
    if (ungrouped) {
      groups.delete("__ungrouped__");
      groups.set("", ungrouped);
    }
    return groups;
  }
  renderMeta(meta) {
    const parts = [];
    if (meta.domain)
      parts.push(`<strong>\u4E1A\u52A1\u57DF</strong>: ${this.esc(meta.domain)}`);
    if (meta.author)
      parts.push(`<strong>\u4F5C\u8005</strong>: ${this.esc(meta.author)}`);
    if (meta.date)
      parts.push(`<strong>\u65E5\u671F</strong>: ${this.esc(meta.date)}`);
    return parts.length ? `<p class="pv-meta">${parts.join(" | ")}</p>` : "";
  }
  stageProcessRefs(stage, doc) {
    const refs = this.asArray(doc.stageFlowRefs).filter((ref) => this.matchesStage(stage, ref));
    if (refs.length)
      return refs;
    return this.asArray(doc.processes).filter((process) => this.matchesStage(stage, process)).map((process) => ({ uid: this.identityOf(process, ""), processUid: process.uid, processId: process.id }));
  }
  matchesStage(stage, item) {
    const stageIds = [stage?.uid, stage?.id].filter(Boolean).map(String);
    const itemStageIds = [item?.stageUid, item?.stageId, item?.businessStageUid, item?.businessStageId].filter(Boolean).map(String);
    return stageIds.length > 0 && itemStageIds.some((id) => stageIds.includes(id));
  }
  findProcessByRef(ref, doc) {
    const ids = [ref?.processUid, ref?.processId, ref?.uid, ref?.id].filter(Boolean).map(String);
    return this.asArray(doc.processes).find((process) => ids.includes(String(process.uid || "")) || ids.includes(String(process.id || "")));
  }
  /** 构建结构化 Markdown，与预览大纲和正文顺序一致，含表格和图形引用 */
  buildMarkdown() {
    const doc = this.runtime.doc || {};
    const L = (line = "") => lines.push(line);
    const lines = [];
    const stages = this.stages();
    const processes = this.processes();
    L(`# ${this.title()}`);
    L();
    if (stages.length || this.asArray(doc.roles).length || this.asArray(doc.terms || doc.language).length) {
      L(`## ${this.outlineNumber("preview-intro")} \u5F15\u8A00`);
      L();
      if (stages.length) {
        L(`### ${this.outlineNumber("preview-stage-panorama")} \u5168\u666F\u89C6\u56FE`);
        L();
        L(`![\u5168\u666F\u89C6\u56FE](${exportGraphId("stage-panorama")}.png)`);
        L();
      }
      if (this.asArray(doc.roles).length) {
        L("### \u89D2\u8272");
        L("| \u89D2\u8272 | \u5206\u7EC4 | \u8BF4\u660E | \u6240\u5C5E\u4E1A\u52A1\u7EC4\u4EF6 |");
        L("|------|------|------|--------------|");
        this.asArray(doc.roles).forEach((role) => {
          L(`| ${this.mdEscape(role.name || role.id || "")} | ${this.mdEscape(role.group || "")} | ${this.mdEscape(role.desc || role.description || "")} | ${this.mdEscape(this.asArray(role.subDomains).join("\u3001"))} |`);
        });
        L();
      }
      if (this.asArray(doc.terms || doc.language).length) {
        L("### \u7EDF\u4E00\u8BED\u8A00/\u672F\u8BED\u8868");
        L("| \u672F\u8BED | \u5B9A\u4E49 |");
        L("|------|------|");
        this.asArray(doc.terms || doc.language).forEach((item) => {
          L(`| ${this.mdEscape(item.term || item.name || "")} | ${this.mdEscape(item.definition || item.desc || "")} |`);
        });
        L();
      }
    }
    if (stages.length) {
      const lanes = this.valueStreamLanes();
      if (lanes.length) {
        lanes.forEach((lane) => {
          const laneStages = this.stagesInLane(lane.id);
          if (!laneStages.length)
            return;
          L(`## ${this.outlineNumber(`preview-lane-${lane.id}`)} ${lane.name}`);
          L();
          laneStages.forEach((stage, si) => {
            const stageAnchor = this.stageAnchor(stage, si);
            L(`### ${this.outlineNumber(stageAnchor)} \u9636\u6BB5\uFF1A${this.displayName(stage, "\u672A\u547D\u540D\u4E1A\u52A1\u9636\u6BB5")}`);
            L();
            const stageGraphId = this.stageGraphId("stage-flow", stage, si);
            L(`![\u9636\u6BB5\uFF1A${this.displayName(stage, "\u672A\u547D\u540D\u4E1A\u52A1\u9636\u6BB5")}](${stageGraphId}.png)`);
            L();
            const groups = this.stageProcessGroups(stage);
            groups.forEach((group) => {
              group.processes.forEach((process, pi) => {
                const procAnchor = this.procAnchorId(stage, process);
                if (group.name) {
                  const groupAnchor = this.groupAnchorId(stage, group.name);
                  L(`#### ${this.outlineNumber(groupAnchor)} \u6D41\u7A0B\u7EC4\uFF1A${group.name}`);
                  L();
                }
                L(`##### ${this.outlineNumber(procAnchor)} ${this.displayName(process, "\u672A\u547D\u540D\u6D41\u7A0B")}`);
                L();
                const procGraphId = this.processGraphId(process, pi);
                L(`![\u6D41\u7A0B\u56FE\uFF1A${this.displayName(process, "\u672A\u547D\u540D\u6D41\u7A0B")}](${procGraphId}.png)`);
                L();
                if (process.trigger || process.outcome) {
                  L(`**\u89E6\u53D1**\uFF1A${this.mdEscape(process.trigger || "\u2014")} \u2192 **\u9884\u671F\u7ED3\u679C**\uFF1A${this.mdEscape(process.outcome || "\u2014")}`);
                  L();
                }
                const nodes = this.processNodes(process);
                if (nodes.length) {
                  nodes.forEach((node, ni) => {
                    L(`##### \u6D41\u7A0B\u8282\u70B9\uFF1A${this.displayName(node, `\u672A\u547D\u540D\u8282\u70B9 ${ni + 1}`)}`);
                    L();
                    if (node.description) {
                      L(`${this.mdRichText(node.description)}`);
                      L();
                    }
                    const steps = this.asArray(node.userSteps || node.steps);
                    if (steps.length) {
                      L("**\u529E\u7406\u6B65\u9AA4**");
                      L("| # | \u64CD\u4F5C\u6B65\u9AA4 | \u7C7B\u578B | \u6761\u4EF6/\u5907\u6CE8 |");
                      L("|---|----------|------|----------|");
                      steps.forEach((step, si2) => {
                        L(`| ${si2 + 1} | ${this.mdEscape(step.name || "")} | ${this.mdEscape(step.type || "")} | ${this.mdRichText(step.note || "")} |`);
                      });
                      L();
                    }
                    const forms = this.asArray(node.forms);
                    if (forms.length) {
                      L("**\u529E\u7406\u8868\u5355**");
                      forms.forEach((form) => {
                        L(`- **${form.name || "\u672A\u547D\u540D\u8868\u5355"}**${form.purpose ? ` \u7528\u9014\uFF1A${form.purpose}` : ""}`);
                        this.asArray(form.sections).forEach((sec) => {
                          if (this.asArray(sec.fields).length) {
                            L("  | \u5B57\u6BB5 | \u7C7B\u578B | \u5FC5\u586B | \u9009\u9879 |");
                            L("  |------|------|------|------|");
                            this.asArray(sec.fields).forEach((fld) => {
                              L(`  | ${this.mdEscape(fld.name || "")} | ${this.mdEscape(fld.type || "")} | ${fld.required ? "\u2713" : ""} | ${this.mdEscape(this.asArray(fld.options).join("\u3001"))} |`);
                            });
                          }
                        });
                      });
                      L();
                    }
                    const procFiles = this.asArray(process?.prototypeFiles);
                    const nodeFiles = this.asArray(node?.prototypeFiles);
                    if (procFiles.length || nodeFiles.length) {
                      L("**\u529E\u7406\u9644\u4EF6**");
                      [...procFiles, ...nodeFiles].forEach((pf) => {
                        L(`- ${this.attachmentLabel(pf)}`);
                      });
                      L();
                    }
                    const rules = this.normalizedBusinessRules(node);
                    if (rules.length) {
                      L("**\u529E\u7406\u89C4\u5219**");
                      L("| \u89C4\u5219\u540D\u79F0 | \u89C4\u5219\u5185\u5BB9 |");
                      L("|----------|----------|");
                      rules.forEach((rule) => {
                        L(`| ${this.mdEscape(rule.name)} | ${this.mdRichText(rule.content)} |`);
                      });
                      L();
                    }
                  });
                } else {
                  L("*\u6682\u65E0\u6D41\u7A0B\u8282\u70B9*");
                  L();
                }
              });
            });
          });
        });
      }
    }
    const orphans = this.orphanProcesses();
    if (orphans.length) {
      L(`## ${this.outlineNumber("preview-processes")} \u6D41\u7A0B\u89C6\u56FE`);
      L();
      orphans.forEach((process, index) => {
        L(`### ${this.processAnchor(process, index)} ${this.displayName(process, "\u672A\u547D\u540D\u6D41\u7A0B")}`);
        L();
      });
    }
    const hasComponents = this.asArray(doc.entities).length || this.asArray(doc.businessComponents).length || this.asArray(doc.businessConstructs).length || this.asArray(doc.taskDefinitions).length;
    if (hasComponents) {
      L(`## ${this.outlineNumber("preview-components")} \u7EC4\u4EF6\u5EFA\u6A21`);
      L();
      if (this.asArray(doc.businessComponents).length) {
        L(`### ${this.outlineNumber("preview-business-components")} \u4E1A\u52A1\u7EC4\u4EF6`);
        L("| \u7EC4\u4EF6 | \u7C7B\u578B | \u8BF4\u660E |");
        L("|------|------|------|");
        this.asArray(doc.businessComponents).forEach((c) => {
          L(`| ${this.mdEscape(c.name || "")} | ${this.mdEscape(c.kind || "")} | ${this.mdEscape(c.desc || c.note || "")} |`);
        });
        L();
      }
      const constructs = this.asArray(doc.businessConstructs);
      constructs.forEach((c) => {
        const cAnchor = `preview-construct-${this.identityOf(c, "")}`;
        L(`### ${this.outlineNumber(cAnchor)} \u6784\u4EF6\uFF1A${this.displayName(c, "\u672A\u547D\u540D\u6784\u4EF6")}`);
        L();
        const entities = this.constructEntities(c);
        if (entities.length) {
          L("**\u5B9E\u4F53**");
          entities.forEach((e) => {
            const eAnchor = this.anchorId("entity", this.identityOf(e, ""));
            L(`- **${this.outlineNumber(eAnchor)} \u5B9E\u4F53\uFF1A${this.displayName(e, "\u672A\u547D\u540D\u5B9E\u4F53")}**`);
            if (e.note)
              L(`  ${this.mdEscape(e.note)}`);
            if (this.asArray(e.fields).length) {
              L("  | \u5B57\u6BB5 | \u7C7B\u578B | \u4E3B\u952E | \u8BF4\u660E |");
              L("  |------|------|------|------|");
              this.asArray(e.fields).forEach((f) => {
                L(`  | ${this.mdEscape(f.name || "")} | ${this.mdEscape(f.type || "")} | ${f.is_key || f.isKey ? "\u2713" : ""} | ${this.mdEscape(f.note || f.desc || "")} |`);
              });
            }
          });
          L();
        }
        const tasks = this.constructTasks(c);
        if (tasks.length) {
          L("**\u4EFB\u52A1**");
          tasks.forEach((t) => {
            const tAnchor = this.anchorId("task", this.identityOf(t, ""));
            L(`- **${this.outlineNumber(tAnchor)} \u4EFB\u52A1\uFF1A${this.displayName(t, "\u672A\u547D\u540D\u4EFB\u52A1")}** \u5730\u5740\uFF1A${this.mdEscape(t.address || "\u2014")} \u76EE\u6807\uFF1A${this.mdEscape(t.target || "\u2014")}`);
          });
          L();
        }
      });
      const orphanEntities = this.orphanEntities();
      if (orphanEntities.length) {
        L(`### ${this.outlineNumber("preview-entity-overview")} \u5B9E\u4F53\u5173\u7CFB\u56FE`);
        L();
        L(`![\u5B9E\u4F53\u5173\u7CFB\u56FE](${exportGraphId("entity-relation")}.png)`);
        L();
      }
      const orphanTasks = this.orphanTasks();
      if (orphanTasks.length) {
        L(`### ${this.outlineNumber("preview-task-definitions")} \u4EFB\u52A1\u5B9A\u4E49`);
        L("| \u4EFB\u52A1 | \u6784\u4EF6 | \u5730\u5740 | \u76EE\u6807 | \u53C2\u6570 |");
        L("|------|------|------|------|------|");
        orphanTasks.forEach((t) => {
          L(`| ${this.mdEscape(t.name || "")} | ${this.mdEscape(this.constructNameById(t.constructUid || t.businessConstructUid || ""))} | ${this.mdEscape(t.address || "")} | ${this.mdEscape(t.target || "")} | ${this.taskParameterSummary(t.parameters)} |`);
        });
        L();
      }
    }
    const svcGroups = this.serviceGroups();
    if (this.services().length || svcGroups.length) {
      L(`## ${this.outlineNumber("preview-applications")} \u5E94\u7528\u670D\u52A1`);
      L();
      if (svcGroups.length) {
        svcGroups.forEach((g) => {
          const groupSvcs = this.servicesByGroup(g.uid);
          if (!groupSvcs.length)
            return;
          L(`### ${this.outlineNumber(`preview-app-svc-${g.uid}`)} ${g.name || "\u672A\u547D\u540D\u670D\u52A1\u7EC4"}`);
          L("| \u63A5\u53E3\u540D\u79F0 | \u65B9\u6CD5 | \u8DEF\u5F84 | \u8BF7\u6C42\u53C2\u6570 | \u54CD\u5E94\u53C2\u6570 |");
          L("|----------|------|------|----------|----------|");
          groupSvcs.forEach((svc) => {
            L(`| ${this.mdEscape(svc.name || "")} | \`${svc.method || ""}\` | \`${svc.path || svc.url || ""}\` | ${svc.rawRequest ? "```" + svc.rawRequest + "```" : "\u2014"} | ${svc.rawResponse ? "```" + svc.rawResponse + "```" : "\u2014"} |`);
          });
          L();
        });
      }
    }
    return `${lines.join("\n")}
`;
  }
  /** Markdown 转义（表格单元格内安全） */
  mdEscape(value) {
    return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\r/g, "");
  }
  /** 富文本转纯文本（去 HTML 标签，用于 Markdown） */
  mdRichText(value) {
    const html = String(value ?? "");
    return this.mdEscape(html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
  }
  richTextCell(value) {
    return `<div class="rich-text-rendered pv-rich-text">${this.previewRichTextHtml(value)}</div>`;
  }
  normalizedBusinessRules(node) {
    return this.asArray(node.businessRules).map((rule, index) => typeof rule === "string" ? { name: `\u89C4\u5219${index + 1}`, content: rule } : { name: String(rule?.name || "").trim(), content: String(rule?.content || rule?.description || rule?.note || "").trim() }).filter((rule) => rule.name || rule.content);
  }
  taskParameterSummary(parameters) {
    const inputs = this.asArray(parameters?.inputs).length;
    const outputs = this.asArray(parameters?.outputs).length;
    return `\u5165\u53C2 ${inputs} \xB7 \u51FA\u53C2 ${outputs}`;
  }
  previewRichTextHtml(value) {
    return sanitizeRichTextHtml(value);
  }
  downloadBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
  anchorId(prefix, value) {
    const safe = String(value || "").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "") || "section";
    return `preview-${prefix}-${safe}`;
  }
  baseFileName() {
    return String(this.runtime.currentFile || this.title() || "blm-document").replace(/\.json$/i, "") || "blm-document";
  }
  displayName(item, fallback) {
    return String(item?.name || "").trim() || fallback;
  }
  identityOf(item, fallback) {
    return String(item?.uid || item?.id || fallback);
  }
  asArray(value) {
    return Array.isArray(value) ? value : [];
  }
  trustedHtml(html) {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
  esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  static \u0275fac = function PreviewWorkbench_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _PreviewWorkbench)();
  };
  static \u0275cmp = /* @__PURE__ */ \u0275\u0275defineComponent({ type: _PreviewWorkbench, selectors: [["app-preview-workbench"]], decls: 16, vars: 7, consts: [["data-testid", "preview-workbench", 1, "preview-workbench", "preview-wrap"], [1, "preview-topbar"], ["type", "button", "data-testid", "preview-export-json", 1, "btn", "btn-outline", "btn-sm", 3, "click", "disabled"], ["type", "button", "data-testid", "preview-export-markdown", 1, "btn", "btn-outline", "btn-sm", 3, "click", "disabled"], ["type", "button", "data-testid", "preview-export-docx", 1, "btn", "btn-outline", "btn-sm", 3, "click", "disabled"], ["type", "button", "data-testid", "preview-expand-all-sections", 1, "btn", "btn-ghost-sm", 3, "click"], ["id", "preview-raw-toggle", "type", "button", 1, "btn", "btn-ghost-sm", 2, "margin-left", "auto", 3, "click"], ["id", "preview-body", 1, "preview-body"], ["id", "preview-raw", "data-testid", "preview-raw", 1, "preview-md"], [3, "title", "description", "progress", "remainingSeconds", 4, "ngIf"], ["aria-hidden", "true", 1, "preview-export-hidden-host"], ["id", "preview-outline", "data-testid", "preview-outline", 1, "preview-outline"], [1, "preview-outline-head"], [1, "preview-outline-title"], ["type", "button", 1, "preview-outline-expand-all"], [1, "preview-outline-list"], ["type", "button", 3, "class", "is-collapsible", "is-collapsed"], ["id", "preview-rendered", "data-testid", "preview-rendered", 1, "preview-rendered", "pv-content"], ["id", "preview-top"], [3, "innerHTML"], ["data-testid", "preview-summary-grid", 1, "preview-summary-grid"], [3, "class"], ["type", "button", 1, "preview-outline-expand-all", 3, "click"], ["type", "button", 3, "click"], [1, "outline-number"], [1, "outline-label"], [1, "outline-toggle"], [1, "pv-section", "pv-export-group", 3, "id"], ["type", "button", 1, "preview-section-placeholder"], [3, "class", "id"], [3, "id"], [1, "pv-heading-minor"], [1, "pv-heading-form"], [1, "pv-export-attachment-card"], [3, "ngStyle"], [3, "kind", "targetId", "exportGraphId"], [1, "pv-generated-figure"], [1, "pv-generated-figure-title"], [1, "pv-generated-figure-body"], [1, "pv-export-attachment-icon"], [1, "pv-export-attachment-body"], [1, "pv-export-attachment-actions"], ["type", "button", 1, "btn", "btn-ghost", "btn-sm", 3, "click"], ["type", "button", 1, "preview-section-placeholder", 3, "click"], [3, "title", "description", "progress", "remainingSeconds"], ["kind", "stage-panorama", 3, "exportGraphId"], ["kind", "stage-flow", 3, "targetId", "exportGraphId"], ["kind", "process-flow", 3, "targetId", "exportGraphId"], [3, "exportOnly"]], template: function PreviewWorkbench_Template(rf, ctx) {
    if (rf & 1) {
      \u0275\u0275elementStart(0, "section", 0)(1, "div", 1)(2, "button", 2);
      \u0275\u0275listener("click", function PreviewWorkbench_Template_button_click_2_listener() {
        return ctx.exportJson();
      });
      \u0275\u0275text(3, "\u5BFC\u51FA JSON");
      \u0275\u0275elementEnd();
      \u0275\u0275elementStart(4, "button", 3);
      \u0275\u0275listener("click", function PreviewWorkbench_Template_button_click_4_listener() {
        return ctx.exportMarkdown();
      });
      \u0275\u0275text(5, "\u5BFC\u51FA MD");
      \u0275\u0275elementEnd();
      \u0275\u0275elementStart(6, "button", 4);
      \u0275\u0275listener("click", function PreviewWorkbench_Template_button_click_6_listener() {
        return ctx.exportDocx();
      });
      \u0275\u0275text(7, "\u5BFC\u51FA DOCX");
      \u0275\u0275elementEnd();
      \u0275\u0275elementStart(8, "button", 5);
      \u0275\u0275listener("click", function PreviewWorkbench_Template_button_click_8_listener() {
        return ctx.expandAllSections();
      });
      \u0275\u0275text(9, "\u5C55\u5F00\u5168\u90E8\u7AE0\u8282");
      \u0275\u0275elementEnd();
      \u0275\u0275elementStart(10, "button", 6);
      \u0275\u0275listener("click", function PreviewWorkbench_Template_button_click_10_listener() {
        return ctx.toggleRaw();
      });
      \u0275\u0275text(11);
      \u0275\u0275elementEnd()();
      \u0275\u0275conditionalCreate(12, PreviewWorkbench_Conditional_12_Template, 18, 3, "div", 7)(13, PreviewWorkbench_Conditional_13_Template, 2, 1, "pre", 8);
      \u0275\u0275template(14, PreviewWorkbench_app_wait_dialog_14_Template, 1, 4, "app-wait-dialog", 9);
      \u0275\u0275conditionalCreate(15, PreviewWorkbench_Conditional_15_Template, 8, 2, "div", 10);
      \u0275\u0275elementEnd();
    }
    if (rf & 2) {
      \u0275\u0275advance(2);
      \u0275\u0275property("disabled", !ctx.runtime.currentFile);
      \u0275\u0275advance(2);
      \u0275\u0275property("disabled", !ctx.runtime.currentFile);
      \u0275\u0275advance(2);
      \u0275\u0275property("disabled", !ctx.runtime.currentFile || !!ctx.exportWait());
      \u0275\u0275advance(5);
      \u0275\u0275textInterpolate1(" ", ctx.showRaw() ? "\u663E\u793A\u6E32\u67D3\u9884\u89C8" : "\u663E\u793A\u539F\u6587 MD", " ");
      \u0275\u0275advance();
      \u0275\u0275conditional(!ctx.showRaw() ? 12 : 13);
      \u0275\u0275advance(2);
      \u0275\u0275property("ngIf", ctx.exportWait());
      \u0275\u0275advance();
      \u0275\u0275conditional(ctx.exportCaptureReady() ? 15 : -1);
    }
  }, dependencies: [CommonModule, NgIf, NgStyle, WaitDialogComponent, PreviewGraphHostComponent, PanoramaWorkbench, ComponentWorkbenchComponent], styles: ["\n[_nghost-%COMP%] {\n  display: flex;\n  flex: 1 1 auto;\n  min-height: 0;\n  height: 100%;\n}\n.preview-wrap[_ngcontent-%COMP%] {\n  display: flex;\n  flex: 1 1 auto;\n  min-height: 0;\n  height: 100%;\n  flex-direction: column;\n  background: #eef3f8;\n}\n.preview-topbar[_ngcontent-%COMP%] {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 10px 16px;\n  border-bottom: 1px solid #dbe5f0;\n  background: #fff;\n  flex: 0 0 auto;\n}\n.preview-body[_ngcontent-%COMP%] {\n  display: grid;\n  grid-template-columns: 240px minmax(0, 1fr);\n  gap: 12px;\n  min-height: 0;\n  flex: 1 1 auto;\n  padding: 12px 16px 16px;\n}\n.preview-outline[_ngcontent-%COMP%] {\n  min-height: 0;\n  overflow: auto;\n  border: 1px solid #dbe5f0;\n  border-radius: 10px;\n  background: #fff;\n  padding: 12px;\n}\n.preview-outline-head[_ngcontent-%COMP%] {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 8px;\n}\n.preview-outline-title[_ngcontent-%COMP%] {\n  font-size: 13px;\n  font-weight: 800;\n  color: #1e293b;\n}\n.preview-outline-expand-all[_ngcontent-%COMP%] {\n  border: 1px solid #bfdbfe;\n  border-radius: 999px;\n  background: #eff6ff;\n  color: #1d4ed8;\n  font-size: 11px;\n  padding: 2px 10px;\n  cursor: pointer;\n}\n.preview-outline-list[_ngcontent-%COMP%] {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.preview-outline-link[_ngcontent-%COMP%] {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  border: 0;\n  background: transparent;\n  color: #475569;\n  text-align: left;\n  border-radius: 6px;\n  padding: 5px 8px;\n  font-size: 12px;\n  cursor: pointer;\n  width: 100%;\n}\n.preview-outline-link[_ngcontent-%COMP%]:hover {\n  background: #eff6ff;\n  color: #1d4ed8;\n}\n.preview-outline-link.is-collapsible[_ngcontent-%COMP%] {\n  font-weight: 700;\n}\n.preview-outline-link.is-collapsed[_ngcontent-%COMP%]    > .outline-toggle[_ngcontent-%COMP%] {\n  transform: rotate(-90deg);\n}\n.outline-number[_ngcontent-%COMP%] {\n  flex: 0 0 auto;\n  min-width: 18px;\n  color: #94a3b8;\n  font-size: 11px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n}\n.outline-label[_ngcontent-%COMP%] {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.outline-toggle[_ngcontent-%COMP%] {\n  flex: 0 0 auto;\n  font-size: 10px;\n  color: #94a3b8;\n  transition: transform 0.15s ease;\n}\n.preview-outline-link.depth-1[_ngcontent-%COMP%] {\n  padding-left: 20px;\n}\n.preview-outline-link.depth-2[_ngcontent-%COMP%] {\n  padding-left: 36px;\n}\n.preview-outline-link.depth-3[_ngcontent-%COMP%] {\n  padding-left: 52px;\n  font-size: 11px;\n  color: #64748b;\n}\n.preview-outline-link.depth-4[_ngcontent-%COMP%] {\n  padding-left: 68px;\n  font-size: 11px;\n  color: #64748b;\n}\n.preview-outline-link.depth-5[_ngcontent-%COMP%] {\n  padding-left: 84px;\n  font-size: 11px;\n  color: #64748b;\n}\n.preview-outline-link.depth-6[_ngcontent-%COMP%] {\n  padding-left: 100px;\n  font-size: 11px;\n  color: #64748b;\n}\n.preview-rendered[_ngcontent-%COMP%] {\n  min-height: 0;\n  overflow: auto;\n  border: 1px solid #dbe5f0;\n  border-radius: 12px;\n  background: #fff;\n  padding: 22px 26px 48px;\n  color: #0f172a;\n}\n.preview-rendered[_ngcontent-%COMP%]   h1[_ngcontent-%COMP%] {\n  margin: 0 0 12px;\n  font-size: 26px;\n}\n.preview-summary-grid[_ngcontent-%COMP%] {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 10px;\n  margin: 14px 0 18px;\n}\n.preview-summary-card[_ngcontent-%COMP%] {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  min-height: 58px;\n  border: 1px solid #dbe5f0;\n  border-radius: 8px;\n  padding: 10px 12px;\n  background: #f8fafc;\n}\n.preview-summary-card[_ngcontent-%COMP%]   span[_ngcontent-%COMP%] {\n  color: #475569;\n  font-size: 12px;\n  font-weight: 700;\n}\n.preview-summary-card[_ngcontent-%COMP%]   strong[_ngcontent-%COMP%] {\n  color: #0f172a;\n  font-size: 24px;\n  font-variant-numeric: tabular-nums;\n}\n.preview-summary-card.tone-blue[_ngcontent-%COMP%] {\n  border-color: #bfdbfe;\n  background: #eff6ff;\n}\n.preview-summary-card.tone-green[_ngcontent-%COMP%] {\n  border-color: #bbf7d0;\n  background: #f0fdf4;\n}\n.preview-summary-card.tone-amber[_ngcontent-%COMP%] {\n  border-color: #fde68a;\n  background: #fffbeb;\n}\n.preview-summary-card.tone-cyan[_ngcontent-%COMP%] {\n  border-color: #a5f3fc;\n  background: #ecfeff;\n}\n.preview-section-placeholder[_ngcontent-%COMP%] {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 16px;\n  width: 100%;\n  margin: 10px 0;\n  border: 1px dashed #bfdbfe;\n  border-radius: 8px;\n  padding: 14px 16px;\n  background: #f8fafc;\n  color: #1e293b;\n  text-align: left;\n  cursor: pointer;\n}\n.preview-section-placeholder[_ngcontent-%COMP%]:hover {\n  border-color: #60a5fa;\n  background: #eff6ff;\n}\n.preview-section-placeholder[_ngcontent-%COMP%]   span[_ngcontent-%COMP%] {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 14px;\n  font-weight: 800;\n}\n.preview-section-placeholder[_ngcontent-%COMP%]   strong[_ngcontent-%COMP%] {\n  flex: 0 0 auto;\n  border: 1px solid #bfdbfe;\n  border-radius: 999px;\n  background: #fff;\n  color: #1d4ed8;\n  padding: 4px 10px;\n  font-size: 12px;\n}\n.preview-rendered[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%] {\n  margin: 28px 0 14px;\n  padding-bottom: 8px;\n  border-bottom: 2px solid #dbeafe;\n  color: #1d4ed8;\n  font-size: 20px;\n}\n.preview-rendered[_ngcontent-%COMP%]   h3[_ngcontent-%COMP%] {\n  margin: 0 0 10px;\n  font-size: 16px;\n  color: #1e293b;\n}\n.preview-rendered[_ngcontent-%COMP%]   h4[_ngcontent-%COMP%] {\n  margin: 0 0 8px;\n  font-size: 14px;\n}\n.preview-rendered[_ngcontent-%COMP%]   table[_ngcontent-%COMP%] {\n  width: 100%;\n  border-collapse: collapse;\n  margin: 10px 0 16px;\n  font-size: 12px;\n}\n.preview-rendered[_ngcontent-%COMP%]   th[_ngcontent-%COMP%], \n.preview-rendered[_ngcontent-%COMP%]   td[_ngcontent-%COMP%] {\n  border: 1px solid #dbe5f0;\n  padding: 8px 10px;\n  vertical-align: top;\n}\n.preview-rendered[_ngcontent-%COMP%]   th[_ngcontent-%COMP%] {\n  background: #f1f5f9;\n  color: #475569;\n  font-weight: 800;\n}\n.pv-section[_ngcontent-%COMP%], \n.pv-subsection[_ngcontent-%COMP%] {\n  scroll-margin-top: 16px;\n}\n.pv-meta[_ngcontent-%COMP%], \n.pv-note[_ngcontent-%COMP%] {\n  color: #64748b;\n  font-size: 12px;\n}\n.pv-graph-card[_ngcontent-%COMP%], \n.pv-task-detail[_ngcontent-%COMP%], \n.pv-component-card[_ngcontent-%COMP%] {\n  border: 1px solid #dbe5f0;\n  border-radius: 10px;\n  background: #fbfdff;\n  padding: 14px;\n  margin: 12px 0;\n}\n.pv-graph-card[_ngcontent-%COMP%]   app-process-stage-workbench[_ngcontent-%COMP%], \n.pv-graph-card[_ngcontent-%COMP%]   app-process-flow-workbench[_ngcontent-%COMP%], \n.pv-graph-card[_ngcontent-%COMP%]   app-entity-design-workbench[_ngcontent-%COMP%], \n.pv-graph-card[_ngcontent-%COMP%]   app-preview-graph-host[_ngcontent-%COMP%], \n.pv-export-image[_ngcontent-%COMP%]   app-preview-graph-host[_ngcontent-%COMP%], \n.pv-graph-placeholder[_ngcontent-%COMP%] {\n  display: block;\n  height: auto;\n  min-height: 560px;\n  overflow: visible;\n  border: 1px solid #dbe5f0;\n  border-radius: 8px;\n  background: #fff;\n}\n.pv-export-image[_ngcontent-%COMP%]   app-preview-graph-host[_ngcontent-%COMP%]:has(app-process-stage-workbench), \n.pv-export-image[_ngcontent-%COMP%]   app-preview-graph-host[_ngcontent-%COMP%]:has(app-process-flow-workbench) {\n  min-height: 720px;\n}\n.pv-export-image[_ngcontent-%COMP%]   app-preview-graph-host[_ngcontent-%COMP%]   app-process-stage-workbench[_ngcontent-%COMP%], \n.pv-export-image[_ngcontent-%COMP%]   app-preview-graph-host[_ngcontent-%COMP%]   app-process-flow-workbench[_ngcontent-%COMP%] {\n  min-height: 720px;\n}\n.pv-generated-figure[_ngcontent-%COMP%] {\n  display: grid;\n  gap: 12px;\n  min-height: 260px;\n  border: 1px solid #dbe5f0;\n  border-radius: 8px;\n  padding: 18px;\n  background:\n    linear-gradient(\n      90deg,\n      rgba(219, 229, 240, 0.55) 1px,\n      transparent 1px),\n    linear-gradient(\n      180deg,\n      rgba(219, 229, 240, 0.55) 1px,\n      transparent 1px),\n    #ffffff;\n  background-size: 28px 28px;\n}\n.pv-generated-figure-title[_ngcontent-%COMP%] {\n  align-self: start;\n  width: max-content;\n  max-width: 100%;\n  border: 1px solid #bfdbfe;\n  border-radius: 999px;\n  background: #eff6ff;\n  color: #1d4ed8;\n  padding: 5px 12px;\n  font-size: 12px;\n  font-weight: 800;\n}\n.pv-generated-figure-body[_ngcontent-%COMP%] {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  align-items: center;\n  gap: 18px;\n}\n.pv-generated-figure-body[_ngcontent-%COMP%]   span[_ngcontent-%COMP%] {\n  display: block;\n  height: 76px;\n  border: 1px solid #cbd5e1;\n  border-radius: 8px;\n  background:\n    linear-gradient(\n      180deg,\n      #f8fafc,\n      #eef6ff);\n  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);\n}\n.pv-value-stream-section[_ngcontent-%COMP%] {\n  margin: 18px 0 8px;\n}\n.pv-value-stream-title[_ngcontent-%COMP%] {\n  margin: 16px 0 8px;\n  padding: 4px 10px;\n  border-left: 4px solid #3b82f6;\n  background: #f8fafc;\n  border-radius: 0 8px 8px 0;\n  font-size: 15px;\n  color: #1e40af;\n}\n.pv-graph-placeholder[_ngcontent-%COMP%] {\n  display: grid;\n  place-items: center;\n  color: #64748b;\n  font-size: 13px;\n  background:\n    linear-gradient(\n      180deg,\n      #ffffff,\n      #f8fafc);\n}\n.pv-component-grid[_ngcontent-%COMP%] {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 10px;\n}\n.pv-export-attachment-card[_ngcontent-%COMP%] {\n  display: grid;\n  grid-template-columns: 34px minmax(0, 1fr) auto;\n  gap: 10px;\n  align-items: center;\n  margin: 10px 0 14px;\n  border: 1px solid #d7e4f3;\n  border-left: 4px solid #10b981;\n  border-radius: 8px;\n  padding: 12px;\n  background:\n    linear-gradient(\n      90deg,\n      rgba(236, 253, 245, 0.75),\n      #fff 46%);\n}\n.pv-export-attachment-icon[_ngcontent-%COMP%] {\n  display: grid;\n  place-items: center;\n  width: 32px;\n  height: 32px;\n  border: 1px solid #a7f3d0;\n  border-radius: 8px;\n  background: #ecfdf5;\n}\n.pv-export-attachment-body[_ngcontent-%COMP%] {\n  display: grid;\n  gap: 3px;\n  min-width: 0;\n}\n.pv-export-attachment-body[_ngcontent-%COMP%]   strong[_ngcontent-%COMP%], \n.pv-export-attachment-body[_ngcontent-%COMP%]   span[_ngcontent-%COMP%] {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.pv-export-attachment-body[_ngcontent-%COMP%]   strong[_ngcontent-%COMP%] {\n  color: #0f172a;\n  font-size: 13px;\n  font-weight: 800;\n}\n.pv-export-attachment-body[_ngcontent-%COMP%]   span[_ngcontent-%COMP%] {\n  color: #64748b;\n  font-size: 12px;\n}\n.pv-export-attachment-actions[_ngcontent-%COMP%] {\n  display: flex;\n  gap: 6px;\n  justify-content: flex-end;\n}\n.pv-component-head[_ngcontent-%COMP%] {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n}\n.pv-component-head[_ngcontent-%COMP%]   span[_ngcontent-%COMP%] {\n  border: 1px solid #bfdbfe;\n  border-radius: 999px;\n  color: #1d4ed8;\n  background: #eff6ff;\n  padding: 2px 8px;\n  font-size: 11px;\n  font-weight: 800;\n}\n.preview-md[_ngcontent-%COMP%] {\n  flex: 1 1 auto;\n  min-height: 0;\n  margin: 12px 16px 16px;\n  padding: 18px;\n  overflow: auto;\n  border: 1px solid #dbe5f0;\n  border-radius: 10px;\n  background: #fff;\n}\n.pv-center[_ngcontent-%COMP%] {\n  text-align: center;\n}\n.preview-export-hidden-host[_ngcontent-%COMP%] {\n  position: fixed;\n  left: -24000px;\n  top: 0;\n  width: 1440px;\n  min-height: 900px;\n  overflow: visible;\n  background: #fff;\n  pointer-events: none;\n  z-index: -1;\n}\n.preview-export-hidden-host[_ngcontent-%COMP%]   app-panorama-workbench[_ngcontent-%COMP%], \n.preview-export-hidden-host[_ngcontent-%COMP%]   app-preview-graph-host[_ngcontent-%COMP%], \n.preview-export-hidden-host[_ngcontent-%COMP%]   app-component-workbench[_ngcontent-%COMP%] {\n  display: block;\n  width: 1440px;\n  min-height: 720px;\n  background: #fff;\n}\n/*# sourceMappingURL=preview-workbench.css.map */"] });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(PreviewWorkbench, [{
    type: Component,
    args: [{ selector: "app-preview-workbench", standalone: true, imports: [CommonModule, WaitDialogComponent, PreviewGraphHostComponent, PanoramaWorkbench, ComponentWorkbenchComponent], template: `<section class="preview-workbench preview-wrap" data-testid="preview-workbench">
  <div class="preview-topbar">
    <button class="btn btn-outline btn-sm" type="button" data-testid="preview-export-json" [disabled]="!runtime.currentFile" (click)="exportJson()">\u5BFC\u51FA JSON</button>
    <button class="btn btn-outline btn-sm" type="button" data-testid="preview-export-markdown" [disabled]="!runtime.currentFile" (click)="exportMarkdown()">\u5BFC\u51FA MD</button>
    <button class="btn btn-outline btn-sm" type="button" data-testid="preview-export-docx" [disabled]="!runtime.currentFile || !!exportWait()" (click)="exportDocx()">\u5BFC\u51FA DOCX</button>
    <button class="btn btn-ghost-sm" type="button" data-testid="preview-expand-all-sections" (click)="expandAllSections()">\u5C55\u5F00\u5168\u90E8\u7AE0\u8282</button>
    <button id="preview-raw-toggle" class="btn btn-ghost-sm" type="button" style="margin-left:auto" (click)="toggleRaw()">
      {{ showRaw() ? '\u663E\u793A\u6E32\u67D3\u9884\u89C8' : '\u663E\u793A\u539F\u6587 MD' }}
    </button>
  </div>

  @if (!showRaw()) {
    <div id="preview-body" class="preview-body">
      <aside id="preview-outline" class="preview-outline" data-testid="preview-outline">
        <div class="preview-outline-head">
          <span class="preview-outline-title">\u5BFC\u51FA\u76EE\u5F55</span>
          @if (collapsedOutlineIds().size) {
            <button class="preview-outline-expand-all" type="button" (click)="expandAll()">\u5C55\u5F00\u5168\u90E8</button>
          }
        </div>
        <div class="preview-outline-list">
          @for (item of visibleOutlineItems(); track item.id) {
            <button
              class="preview-outline-link depth-{{ item.depth }}"
              [class.is-collapsible]="item.depth <= 1"
              [class.is-collapsed]="isOutlineCollapsed(item)"
              type="button"
              [attr.data-oid]="item.id"
              (click)="handleOutlineClick(item)"
            >
              <span class="outline-number">{{ item.number }}</span>
              <span class="outline-label">{{ item.label }}</span>
              @if (item.depth <= 1) {
                <span class="outline-toggle">\u25BE</span>
              }
            </button>
          }
        </div>
      </aside>

      <div id="preview-rendered" class="preview-rendered pv-content" data-testid="preview-rendered">
        <h1 id="preview-top">{{ title() }}</h1>
        <div [innerHTML]="metaHtml()"></div>
        <div class="preview-summary-grid" data-testid="preview-summary-grid">
          @for (card of summaryCards(); track card.label) {
            <div class="preview-summary-card tone-{{ card.tone }}">
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
            </div>
          }
        </div>

        @for (group of previewGroups(); track group.id) {
          @if (isPreviewSectionVisible(group.id)) {
            <section class="pv-section pv-export-group" [id]="group.id">
              @for (entry of group.sections; track entry.id) {
                @let section = entry.section;
                <div [class]="sectionCssClass(section)" [id]="entry.id">
                  @switch (section.type) {
                    @case ('heading1') { <h2>{{ headingDisplayText(section, entry.id) }}</h2> }
                    @case ('heading2') { <h3>{{ headingDisplayText(section, entry.id) }}</h3> }
                    @case ('heading3') { <h4>{{ headingDisplayText(section, entry.id) }}</h4> }
                    @case ('heading4') { <h5>{{ headingDisplayText(section, entry.id) }}</h5> }
                    @case ('heading5') { <h6>{{ headingDisplayText(section, entry.id) }}</h6> }
                    @case ('heading6') { <div class="pv-heading-minor">{{ headingDisplayText(section, entry.id) }}</div> }
                    @case ('heading7') { <div class="pv-heading-form">{{ headingDisplayText(section, entry.id) }}</div> }
                    @case ('paragraph') {
                      @if (section.text) { <p>{{ section.text }}</p> }
                    }
                    @case ('list') {
                      <ul>
                        @for (item of section.items || []; track $index) {
                          <li>{{ item }}</li>
                        }
                      </ul>
                    }
                    @case ('table') {
                      <table>
                        <colgroup>
                          @for (header of section.headers || []; track $index) {
                            <col [ngStyle]="tableColumnStyle(section, $index)" />
                          }
                        </colgroup>
                        <thead>
                          <tr>
                            @for (header of section.headers || []; track $index) {
                              <th>{{ header }}</th>
                            }
                          </tr>
                        </thead>
                        <tbody>
                          @for (row of section.rows || []; track $index) {
                            <tr>
                              @for (cell of row; track $index) {
                                <td>
                                  @if (isRichTextColumn(section, $index)) {
                                    <span [innerHTML]="richText(cell)"></span>
                                  } @else {
                                    {{ cell }}
                                  }
                                </td>
                              }
                            </tr>
                          }
                        </tbody>
                      </table>
                    }
                    @case ('image') {
                      @if (previewImageGraph(section); as graph) {
                        <app-preview-graph-host
                          [kind]="graph.kind"
                          [targetId]="graph.targetId"
                          [exportGraphId]="graph.graphId"
                        ></app-preview-graph-host>
                      } @else {
                        <div class="pv-generated-figure">
                          <div class="pv-generated-figure-title">{{ section.text || '\u7ED3\u6784\u56FE' }}</div>
                          <div class="pv-generated-figure-body">
                            <span></span><span></span><span></span>
                          </div>
                        </div>
                      }
                    }
                    @case ('attachment') {
                      <div class="pv-export-attachment-card">
                        <div class="pv-export-attachment-icon">\u{1F4CE}</div>
                        <div class="pv-export-attachment-body">
                          <strong>{{ attachmentFor(section)?.name || section.text || '\u9644\u4EF6' }}</strong>
                          <span>{{ attachmentFor(section)?.path || attachmentName(section) }}</span>
                        </div>
                        <div class="pv-export-attachment-actions">
                          @if (attachmentFor(section)) {
                            <button type="button" class="btn btn-ghost btn-sm" (click)="previewAttachment(section)">\u9884\u89C8</button>
                            <button type="button" class="btn btn-ghost btn-sm" (click)="downloadAttachment(section)">\u4E0B\u8F7D</button>
                          }
                        </div>
                      </div>
                    }
                  }
                </div>
              }
            </section>
          } @else {
            <button class="preview-section-placeholder" type="button" (click)="showPreviewSection(group.id)">
              <span>{{ group.title }}</span>
              <strong>\u52A0\u8F7D\u672C\u7AE0</strong>
            </button>
          }
        }
      </div>
    </div>
  } @else {
    <pre id="preview-raw" class="preview-md" data-testid="preview-raw">{{ markdown() }}</pre>
  }

  <app-wait-dialog
    *ngIf="exportWait() as wait"
    [title]="wait.title"
    [description]="wait.description"
    [progress]="wait.progress ?? -1"
    [remainingSeconds]="wait.remainingSeconds ?? 0"
  ></app-wait-dialog>

  @if (exportCaptureReady()) {
    <div class="preview-export-hidden-host" aria-hidden="true">
      <app-panorama-workbench />
      <app-preview-graph-host kind="stage-panorama" [exportGraphId]="stageGraphId('stage-panorama')"></app-preview-graph-host>
      @for (stage of stages(); track identityOf(stage, 'export-stage-' + $index); let i = $index) {
        <app-preview-graph-host kind="stage-flow" [targetId]="identityOf(stage, 'stage-' + (i + 1))" [exportGraphId]="stageGraphId('stage-flow', stage, i)"></app-preview-graph-host>
      }
      @for (process of processes(); track identityOf(process, 'export-process-' + $index); let i = $index) {
        <app-preview-graph-host kind="process-flow" [targetId]="identityOf(process, 'process-' + (i + 1))" [exportGraphId]="processGraphId(process, i)"></app-preview-graph-host>
      }
      <app-component-workbench [exportOnly]="true"></app-component-workbench>
    </div>
  }
</section>
`, styles: ["/* src/app/workbenches/preview/preview-workbench.scss */\n:host {\n  display: flex;\n  flex: 1 1 auto;\n  min-height: 0;\n  height: 100%;\n}\n.preview-wrap {\n  display: flex;\n  flex: 1 1 auto;\n  min-height: 0;\n  height: 100%;\n  flex-direction: column;\n  background: #eef3f8;\n}\n.preview-topbar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 10px 16px;\n  border-bottom: 1px solid #dbe5f0;\n  background: #fff;\n  flex: 0 0 auto;\n}\n.preview-body {\n  display: grid;\n  grid-template-columns: 240px minmax(0, 1fr);\n  gap: 12px;\n  min-height: 0;\n  flex: 1 1 auto;\n  padding: 12px 16px 16px;\n}\n.preview-outline {\n  min-height: 0;\n  overflow: auto;\n  border: 1px solid #dbe5f0;\n  border-radius: 10px;\n  background: #fff;\n  padding: 12px;\n}\n.preview-outline-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 8px;\n}\n.preview-outline-title {\n  font-size: 13px;\n  font-weight: 800;\n  color: #1e293b;\n}\n.preview-outline-expand-all {\n  border: 1px solid #bfdbfe;\n  border-radius: 999px;\n  background: #eff6ff;\n  color: #1d4ed8;\n  font-size: 11px;\n  padding: 2px 10px;\n  cursor: pointer;\n}\n.preview-outline-list {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.preview-outline-link {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  border: 0;\n  background: transparent;\n  color: #475569;\n  text-align: left;\n  border-radius: 6px;\n  padding: 5px 8px;\n  font-size: 12px;\n  cursor: pointer;\n  width: 100%;\n}\n.preview-outline-link:hover {\n  background: #eff6ff;\n  color: #1d4ed8;\n}\n.preview-outline-link.is-collapsible {\n  font-weight: 700;\n}\n.preview-outline-link.is-collapsed > .outline-toggle {\n  transform: rotate(-90deg);\n}\n.outline-number {\n  flex: 0 0 auto;\n  min-width: 18px;\n  color: #94a3b8;\n  font-size: 11px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n}\n.outline-label {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.outline-toggle {\n  flex: 0 0 auto;\n  font-size: 10px;\n  color: #94a3b8;\n  transition: transform 0.15s ease;\n}\n.preview-outline-link.depth-1 {\n  padding-left: 20px;\n}\n.preview-outline-link.depth-2 {\n  padding-left: 36px;\n}\n.preview-outline-link.depth-3 {\n  padding-left: 52px;\n  font-size: 11px;\n  color: #64748b;\n}\n.preview-outline-link.depth-4 {\n  padding-left: 68px;\n  font-size: 11px;\n  color: #64748b;\n}\n.preview-outline-link.depth-5 {\n  padding-left: 84px;\n  font-size: 11px;\n  color: #64748b;\n}\n.preview-outline-link.depth-6 {\n  padding-left: 100px;\n  font-size: 11px;\n  color: #64748b;\n}\n.preview-rendered {\n  min-height: 0;\n  overflow: auto;\n  border: 1px solid #dbe5f0;\n  border-radius: 12px;\n  background: #fff;\n  padding: 22px 26px 48px;\n  color: #0f172a;\n}\n.preview-rendered h1 {\n  margin: 0 0 12px;\n  font-size: 26px;\n}\n.preview-summary-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 10px;\n  margin: 14px 0 18px;\n}\n.preview-summary-card {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  min-height: 58px;\n  border: 1px solid #dbe5f0;\n  border-radius: 8px;\n  padding: 10px 12px;\n  background: #f8fafc;\n}\n.preview-summary-card span {\n  color: #475569;\n  font-size: 12px;\n  font-weight: 700;\n}\n.preview-summary-card strong {\n  color: #0f172a;\n  font-size: 24px;\n  font-variant-numeric: tabular-nums;\n}\n.preview-summary-card.tone-blue {\n  border-color: #bfdbfe;\n  background: #eff6ff;\n}\n.preview-summary-card.tone-green {\n  border-color: #bbf7d0;\n  background: #f0fdf4;\n}\n.preview-summary-card.tone-amber {\n  border-color: #fde68a;\n  background: #fffbeb;\n}\n.preview-summary-card.tone-cyan {\n  border-color: #a5f3fc;\n  background: #ecfeff;\n}\n.preview-section-placeholder {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 16px;\n  width: 100%;\n  margin: 10px 0;\n  border: 1px dashed #bfdbfe;\n  border-radius: 8px;\n  padding: 14px 16px;\n  background: #f8fafc;\n  color: #1e293b;\n  text-align: left;\n  cursor: pointer;\n}\n.preview-section-placeholder:hover {\n  border-color: #60a5fa;\n  background: #eff6ff;\n}\n.preview-section-placeholder span {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 14px;\n  font-weight: 800;\n}\n.preview-section-placeholder strong {\n  flex: 0 0 auto;\n  border: 1px solid #bfdbfe;\n  border-radius: 999px;\n  background: #fff;\n  color: #1d4ed8;\n  padding: 4px 10px;\n  font-size: 12px;\n}\n.preview-rendered h2 {\n  margin: 28px 0 14px;\n  padding-bottom: 8px;\n  border-bottom: 2px solid #dbeafe;\n  color: #1d4ed8;\n  font-size: 20px;\n}\n.preview-rendered h3 {\n  margin: 0 0 10px;\n  font-size: 16px;\n  color: #1e293b;\n}\n.preview-rendered h4 {\n  margin: 0 0 8px;\n  font-size: 14px;\n}\n.preview-rendered table {\n  width: 100%;\n  border-collapse: collapse;\n  margin: 10px 0 16px;\n  font-size: 12px;\n}\n.preview-rendered th,\n.preview-rendered td {\n  border: 1px solid #dbe5f0;\n  padding: 8px 10px;\n  vertical-align: top;\n}\n.preview-rendered th {\n  background: #f1f5f9;\n  color: #475569;\n  font-weight: 800;\n}\n.pv-section,\n.pv-subsection {\n  scroll-margin-top: 16px;\n}\n.pv-meta,\n.pv-note {\n  color: #64748b;\n  font-size: 12px;\n}\n.pv-graph-card,\n.pv-task-detail,\n.pv-component-card {\n  border: 1px solid #dbe5f0;\n  border-radius: 10px;\n  background: #fbfdff;\n  padding: 14px;\n  margin: 12px 0;\n}\n.pv-graph-card app-process-stage-workbench,\n.pv-graph-card app-process-flow-workbench,\n.pv-graph-card app-entity-design-workbench,\n.pv-graph-card app-preview-graph-host,\n.pv-export-image app-preview-graph-host,\n.pv-graph-placeholder {\n  display: block;\n  height: auto;\n  min-height: 560px;\n  overflow: visible;\n  border: 1px solid #dbe5f0;\n  border-radius: 8px;\n  background: #fff;\n}\n.pv-export-image app-preview-graph-host:has(app-process-stage-workbench),\n.pv-export-image app-preview-graph-host:has(app-process-flow-workbench) {\n  min-height: 720px;\n}\n.pv-export-image app-preview-graph-host app-process-stage-workbench,\n.pv-export-image app-preview-graph-host app-process-flow-workbench {\n  min-height: 720px;\n}\n.pv-generated-figure {\n  display: grid;\n  gap: 12px;\n  min-height: 260px;\n  border: 1px solid #dbe5f0;\n  border-radius: 8px;\n  padding: 18px;\n  background:\n    linear-gradient(\n      90deg,\n      rgba(219, 229, 240, 0.55) 1px,\n      transparent 1px),\n    linear-gradient(\n      180deg,\n      rgba(219, 229, 240, 0.55) 1px,\n      transparent 1px),\n    #ffffff;\n  background-size: 28px 28px;\n}\n.pv-generated-figure-title {\n  align-self: start;\n  width: max-content;\n  max-width: 100%;\n  border: 1px solid #bfdbfe;\n  border-radius: 999px;\n  background: #eff6ff;\n  color: #1d4ed8;\n  padding: 5px 12px;\n  font-size: 12px;\n  font-weight: 800;\n}\n.pv-generated-figure-body {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  align-items: center;\n  gap: 18px;\n}\n.pv-generated-figure-body span {\n  display: block;\n  height: 76px;\n  border: 1px solid #cbd5e1;\n  border-radius: 8px;\n  background:\n    linear-gradient(\n      180deg,\n      #f8fafc,\n      #eef6ff);\n  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);\n}\n.pv-value-stream-section {\n  margin: 18px 0 8px;\n}\n.pv-value-stream-title {\n  margin: 16px 0 8px;\n  padding: 4px 10px;\n  border-left: 4px solid #3b82f6;\n  background: #f8fafc;\n  border-radius: 0 8px 8px 0;\n  font-size: 15px;\n  color: #1e40af;\n}\n.pv-graph-placeholder {\n  display: grid;\n  place-items: center;\n  color: #64748b;\n  font-size: 13px;\n  background:\n    linear-gradient(\n      180deg,\n      #ffffff,\n      #f8fafc);\n}\n.pv-component-grid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 10px;\n}\n.pv-export-attachment-card {\n  display: grid;\n  grid-template-columns: 34px minmax(0, 1fr) auto;\n  gap: 10px;\n  align-items: center;\n  margin: 10px 0 14px;\n  border: 1px solid #d7e4f3;\n  border-left: 4px solid #10b981;\n  border-radius: 8px;\n  padding: 12px;\n  background:\n    linear-gradient(\n      90deg,\n      rgba(236, 253, 245, 0.75),\n      #fff 46%);\n}\n.pv-export-attachment-icon {\n  display: grid;\n  place-items: center;\n  width: 32px;\n  height: 32px;\n  border: 1px solid #a7f3d0;\n  border-radius: 8px;\n  background: #ecfdf5;\n}\n.pv-export-attachment-body {\n  display: grid;\n  gap: 3px;\n  min-width: 0;\n}\n.pv-export-attachment-body strong,\n.pv-export-attachment-body span {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.pv-export-attachment-body strong {\n  color: #0f172a;\n  font-size: 13px;\n  font-weight: 800;\n}\n.pv-export-attachment-body span {\n  color: #64748b;\n  font-size: 12px;\n}\n.pv-export-attachment-actions {\n  display: flex;\n  gap: 6px;\n  justify-content: flex-end;\n}\n.pv-component-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n}\n.pv-component-head span {\n  border: 1px solid #bfdbfe;\n  border-radius: 999px;\n  color: #1d4ed8;\n  background: #eff6ff;\n  padding: 2px 8px;\n  font-size: 11px;\n  font-weight: 800;\n}\n.preview-md {\n  flex: 1 1 auto;\n  min-height: 0;\n  margin: 12px 16px 16px;\n  padding: 18px;\n  overflow: auto;\n  border: 1px solid #dbe5f0;\n  border-radius: 10px;\n  background: #fff;\n}\n.pv-center {\n  text-align: center;\n}\n.preview-export-hidden-host {\n  position: fixed;\n  left: -24000px;\n  top: 0;\n  width: 1440px;\n  min-height: 900px;\n  overflow: visible;\n  background: #fff;\n  pointer-events: none;\n  z-index: -1;\n}\n.preview-export-hidden-host app-panorama-workbench,\n.preview-export-hidden-host app-preview-graph-host,\n.preview-export-hidden-host app-component-workbench {\n  display: block;\n  width: 1440px;\n  min-height: 720px;\n  background: #fff;\n}\n/*# sourceMappingURL=preview-workbench.css.map */\n"] }]
  }], null, null);
})();
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && \u0275setClassDebugInfo(PreviewWorkbench, { className: "PreviewWorkbench", filePath: "src/app/workbenches/preview/preview-workbench.ts", lineNumber: 60 });
})();
export {
  PreviewWorkbench
};
//# sourceMappingURL=chunk-NMRK5DMG.js.map
