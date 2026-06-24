import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { BlmDocument, BusinessComponent, Stage } from '../../core/document/document.model';
import { DocumentStore } from '../../core/document/document-store';
import { getComponentSupportedStages, getStageProcesses } from '../../core/document/document-model';
import { ValueDomainCell, ValueDomainColumn, ValueDomainLane, getValueDomainColumnUid, getValueDomainLaneUid } from '../../core/document/value-domain-model';
import { KnowledgeWorkbenchComponent } from '../knowledge/knowledge-workbench';
import { RoleWorkbenchComponent } from '../role/role-workbench';

type PanoramaSubtab = 'overview' | 'roles' | 'terms' | 'dictionary' | 'rules';

interface PanoramaSubtabItem {
  id: PanoramaSubtab;
  label: string;
}

interface PanoramaDocument extends BlmDocument {
  panorama?: {
    columns?: ValueDomainColumn[];
    lanes?: ValueDomainLane[];
    cells?: ValueDomainCell[];
  };
}

@Component({
  selector: 'app-panorama-workbench',
  imports: [CommonModule, KnowledgeWorkbenchComponent, RoleWorkbenchComponent],
  templateUrl: './panorama-workbench.html',
  styleUrls: ['../../shared/layout/workbench-section.css', './panorama-workbench.scss'],
})
export class PanoramaWorkbench {
  // 模块意图：全景工作台是跨模型入口，只编排“视图投影”和已迁移子工作台，不在这里承接具体编辑命令。
  protected readonly tabs: PanoramaSubtabItem[] = [
    { id: 'overview', label: '全景视图' },
    { id: 'roles', label: '角色管理' },
    { id: 'terms', label: '术语管理' },
    { id: 'dictionary', label: '字典管理' },
    { id: 'rules', label: '规则管理' },
  ];
  protected readonly activeTab = signal<PanoramaSubtab>('overview');
  protected readonly manualZoom = signal<number | null>(null);
  protected readonly viewportSize = signal(this.readViewportSize());
  private readonly documentStore = inject(DocumentStore);
  protected readonly document = this.documentStore.document;
  protected readonly panoramaModel = computed(() => {
    const document = this.document() as PanoramaDocument;
    return {
      columns: this.withFallback(document.panorama?.columns, {
        uid: 'default-column',
        name: '价值流',
        badge: '价值链',
        scope: '从业务目标到流程落地',
      }),
      lanes: this.withFallback(document.panorama?.lanes, {
        uid: 'default-lane',
        name: '业务域',
        badge: '业务域',
        note: '按业务责任组织阶段',
      }),
      cells: document.panorama?.cells || [],
    };
  });
  protected readonly componentRows = computed(() => {
    const document = this.document();
    return document.businessComponents.map((component) => ({
      component,
      stages: getComponentSupportedStages(document, component),
    }));
  });
  protected readonly coreComponentRows = computed(() =>
    this.componentRows().filter((row) => this.componentKind(row.component) !== 'generic'),
  );
  protected readonly genericComponentRows = computed(() =>
    this.componentRows().filter((row) => this.componentKind(row.component) === 'generic'),
  );
  protected readonly gridTemplateColumns = computed(() => {
    const columnTracks = this.panoramaModel().columns.map(() => 'minmax(168px, 1fr)').join(' ');
    // 关键流程：总览只读矩阵按已有全景 CSS 组织布局，避免再次退化成普通列表。
    return `140px ${columnTracks}`;
  });
  protected readonly fitZoom = computed(() => {
    const model = this.panoramaModel();
    const viewport = this.viewportSize();
    const columns = Math.max(1, model.columns.length);
    const lanes = Math.max(1, model.lanes.length);
    const componentRows = Math.max(this.coreComponentRows().length, this.genericComponentRows().length);
    const estimatedWidth = Math.max(920, 140 + columns * 188 + 72);
    const estimatedMatrixHeight = 82 + lanes * 88;
    const estimatedCapabilityHeight = 44 + Math.max(1, Math.ceil(componentRows / 4)) * 84;
    const estimatedHeight = 96 + estimatedMatrixHeight + estimatedCapabilityHeight;
    const availableWidth = Math.max(640, viewport.width - 560);
    const availableHeight = Math.max(420, viewport.height - 188);
    const scale = Math.min(1, availableWidth / estimatedWidth, availableHeight / estimatedHeight);
    return this.clampZoom(Math.floor(scale * 100) / 100);
  });
  protected readonly zoomValue = computed(() => this.manualZoom() ?? this.fitZoom());
  protected readonly zoomPercent = computed(() => Math.round(this.zoomValue() * 100));

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.viewportSize.set(this.readViewportSize());
  }

  protected stageProcessCount(stageUid: string): number {
    return getStageProcesses(this.document(), stageUid).length;
  }

  protected switchTab(tabId: PanoramaSubtab): void {
    this.activeTab.set(tabId);
  }

  protected zoom(delta: number): void {
    const next = this.clampZoom(Math.round((this.zoomValue() + delta) * 100) / 100);
    this.manualZoom.set(next);
  }

  protected resetZoom(): void {
    this.manualZoom.set(null);
  }

  protected onOverviewWheel(event: WheelEvent): void {
    if (!event.ctrlKey) return;
    event.preventDefault();
    this.zoom(event.deltaY < 0 ? 0.08 : -0.08);
  }

  protected cell(laneId: string, columnId: string): ValueDomainCell | null {
    return this.panoramaModel().cells.find((item) => this.cellLaneId(item) === laneId && this.cellColumnId(item) === columnId) || null;
  }

  protected cellStages(laneId: string, columnId: string): Stage[] {
    return this.document().stages.filter((stage) => stage.panoramaLaneUid === laneId && stage.panoramaColumnUid === columnId);
  }

  protected columnUid(column: ValueDomainColumn): string {
    return getValueDomainColumnUid(column);
  }

  protected laneUid(lane: ValueDomainLane): string {
    return getValueDomainLaneUid(lane);
  }

  protected componentKindLabel(component: BusinessComponent): string {
    return this.componentKind(component) === 'generic' ? '通用组件' : '核心组件';
  }

  protected componentStageText(stages: Stage[]): string {
    return stages.length ? stages.map((stage) => stage.name).join('、') : '待承接';
  }

  // 边界细节：总览必须是查询投影，缺失矩阵结构时只给 UI fallback，不写回文档模型。
  private withFallback<T>(items: T[] | null | undefined, fallback: T): T[] {
    return items?.length ? items : [fallback];
  }

  private cellLaneId(cell: ValueDomainCell): string {
    return String(cell.laneUid || '').trim();
  }

  private cellColumnId(cell: ValueDomainCell): string {
    return String(cell.columnUid || '').trim();
  }

  private componentKind(component: BusinessComponent): 'core' | 'generic' {
    const kind = String(component.kind || '').trim();
    return kind === 'generic' || kind === 'common' ? 'generic' : 'core';
  }

  private clampZoom(value: number): number {
    return Math.max(0.55, Math.min(1.35, value));
  }

  private readViewportSize(): { width: number; height: number } {
    if (typeof window === 'undefined') return { width: 1440, height: 900 };
    return { width: window.innerWidth || 1440, height: window.innerHeight || 900 };
  }
}
