import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { EntityDesignWorkbenchComponent } from '../component/entity-design/entity-design-workbench.component';
import { ProcessFlowWorkbenchComponent } from '../process/flow/process-flow-workbench.component';
import { ProcessStageWorkbenchComponent } from '../process/stage/process-stage-workbench.component';

export type PreviewGraphKind = 'stage-panorama' | 'stage-flow' | 'process-flow' | 'entity-relation' | 'entity-state';

@Component({
  selector: 'app-preview-graph-host',
  standalone: true,
  imports: [
    CommonModule,
    ProcessStageWorkbenchComponent,
    ProcessFlowWorkbenchComponent,
    EntityDesignWorkbenchComponent,
  ],
  template: `
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
  `,
  styles: [`
    :host {
      display: block;
      min-height: inherit;
      overflow: visible;
      background: #fff;
    }

    :host app-process-stage-workbench,
    :host app-process-flow-workbench,
    :host app-entity-design-workbench {
      display: block;
      min-height: inherit;
      overflow: visible;
    }
  `],
})
export class PreviewGraphHostComponent {
  // 模块意图：把预览页的真实图形组件隔离到可延迟加载的宿主中，避免主预览组件直接拖入重型工作台依赖。
  // 关键流程：预览正文只声明图形类型、目标 id 和导出图形 id；宿主进入视口后再加载真实工作台组件。
  // 边界细节：宿主只读渲染，不写回文档；编辑态和工具栏入口由各工作台自己的 preview/export 输入约束。
  @Input({ required: true }) kind: PreviewGraphKind = 'process-flow';
  @Input() targetId = '';
  @Input() exportGraphId = '';
}
