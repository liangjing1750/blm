import { Component, inject } from '@angular/core';
import { DocumentStore } from '../../core/document/document-store';
import { getStageProcesses } from '../../core/document/document-model';

@Component({
  selector: 'app-process-workbench',
  templateUrl: './process-workbench.html',
  styleUrl: '../../shared/layout/workbench-section.scss',
})
export class ProcessWorkbench {
  private readonly documentStore = inject(DocumentStore);
  protected readonly document = this.documentStore.document;

  protected processesForStage(stageUid: string) {
    return getStageProcesses(this.document(), stageUid);
  }
}
