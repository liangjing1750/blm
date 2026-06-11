import { Component, computed, inject } from '@angular/core';
import { DocumentStore } from '../../core/document/document-store';
import { getComponentSupportedStages, getStageProcesses } from '../../core/document/document-model';

@Component({
  selector: 'app-panorama-workbench',
  templateUrl: './panorama-workbench.html',
  styleUrl: '../../shared/layout/workbench-section.css',
})
export class PanoramaWorkbench {
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
}
