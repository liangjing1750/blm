import { Component, computed, inject, signal } from '@angular/core';
import { DocumentStore } from '../../core/document/document-store';
import { getComponentSupportedStages, getStageProcesses } from '../../core/document/document-model';

type PanoramaSubtab = 'overview' | 'valueDomain' | 'components';

interface PanoramaSubtabItem {
  id: PanoramaSubtab;
  label: string;
}

@Component({
  selector: 'app-panorama-workbench',
  templateUrl: './panorama-workbench.html',
  styleUrl: '../../shared/layout/workbench-section.css',
})
export class PanoramaWorkbench {
  // 模块意图：全景工作台恢复旧版“总览 / 价值与业务域 / 业务组件”的二级入口。
  protected readonly tabs: PanoramaSubtabItem[] = [
    { id: 'overview', label: '全景视图' },
    { id: 'valueDomain', label: '价值与业务域' },
    { id: 'components', label: '业务组件' },
  ];
  protected readonly activeTab = signal<PanoramaSubtab>('overview');
  private readonly documentStore = inject(DocumentStore);
  protected readonly document = this.documentStore.document;
  protected readonly componentRows = computed(() => {
    const document = this.document();
    return document.businessComponents.map((component) => ({
      component,
      stages: getComponentSupportedStages(document, component),
    }));
  });

  protected stageProcessCount(stageUid: string): number {
    return getStageProcesses(this.document(), stageUid).length;
  }

  protected switchTab(tabId: PanoramaSubtab): void {
    this.activeTab.set(tabId);
  }
}
