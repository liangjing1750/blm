import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api/api.service';
import { emitRuntimeRefresh, replaceRuntimeDocument, getAngularRuntimeState } from '../core/runtime/angular-runtime';
import { ExportGraphDescriptor, listExportGraphs } from '../core/export/graph-export-registry';
import { PreviewGraphHostComponent } from '../workbenches/preview/preview-graph-host.component';

declare global {
  interface Window {
    __BLM_EXPORT_READY__?: boolean;
    __BLM_EXPORT_GRAPHS__?: ExportGraphDescriptor[];
  }
}

@Component({
  selector: 'app-export-render-page',
  standalone: true,
  imports: [
    CommonModule,
    PreviewGraphHostComponent,
  ],
  templateUrl: './export-render-page.component.html',
  styleUrl: './export-render-page.component.scss',
})
export class ExportRenderPageComponent implements OnInit, AfterViewChecked {
  private readonly runtime = getAngularRuntimeState();
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly graphId = signal('');
  protected readonly graphs = signal<ExportGraphDescriptor[]>([]);
  protected readonly activeGraph = computed(() => this.graphs().find((graph) => graph.id === this.graphId()) || null);

  constructor(private readonly route: ActivatedRoute, private readonly api: ApiService) {}

  async ngOnInit(): Promise<void> {
    // 模块意图：导出页是给 Playwright 使用的无壳渲染面，不参与用户编辑态，也不写回文档。
    // 关键流程：读取后台冻结的 job 文档，按 graphId 设置 runtime 选择态，然后复用真实工作台组件渲染完整画布。
    // 边界细节：ready 信号只表示 DOM 中目标导出画布已出现；截图尺寸和超时仍由后端 Playwright 控制。
    window.__BLM_EXPORT_READY__ = false;
    window.__BLM_EXPORT_GRAPHS__ = [];
    const jobId = String(this.route.snapshot.paramMap.get('jobId') || '').trim();
    const requestedGraphId = String(this.route.snapshot.queryParamMap.get('graphId') || '').trim();
    this.graphId.set(requestedGraphId);
    try {
      const payload = await this.api.exportRenderDocument(jobId);
      replaceRuntimeDocument(payload.document || {}, payload.name || '');
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

  ngAfterViewChecked(): void {
    this.markReadyWhenGraphRendered();
  }

  protected targetIdForGraph(): string {
    const graph = this.activeGraph();
    if (!graph) return '';
    if (graph.kind === 'stage-flow') return graph.params['stageId'] || '';
    if (graph.kind === 'process-flow') return graph.params['processId'] || '';
    if (graph.kind === 'entity-state') return graph.params['entityId'] || '';
    return '';
  }

  private applyGraphRuntime(graph: ExportGraphDescriptor): void {
    this.runtime.ui['mainTab'] = 'preview';
    this.runtime.ui['stageEditorCollapsed'] = true;
    if (graph.kind === 'stage-panorama') {
      this.runtime.ui['processWorkbenchView'] = 'stage';
      this.runtime.ui['stageViewMode'] = 'panorama';
    } else if (graph.kind === 'stage-flow') {
      this.runtime.ui['processWorkbenchView'] = 'stage';
      this.runtime.ui['stageViewMode'] = 'detail';
      this.runtime.ui['stageId'] = graph.params['stageId'] || '';
    } else if (graph.kind === 'process-flow') {
      this.runtime.ui['processWorkbenchView'] = 'flow';
      this.runtime.ui['procId'] = graph.params['processId'] || '';
    } else if (graph.kind === 'entity-state') {
      this.runtime.ui['entityId'] = graph.params['entityId'] || '';
    }
    emitRuntimeRefresh();
  }

  private markReadyWhenGraphRendered(): void {
    if (this.loading() || this.error() || window.__BLM_EXPORT_READY__) return;
    const graph = this.activeGraph();
    if (!graph) {
      window.__BLM_EXPORT_READY__ = true;
      return;
    }
    const target = document.querySelector<HTMLElement>(graph.selector);
    if (target && target.getBoundingClientRect().width > 0 && target.getBoundingClientRect().height > 0) {
      window.__BLM_EXPORT_READY__ = true;
    }
  }
}
