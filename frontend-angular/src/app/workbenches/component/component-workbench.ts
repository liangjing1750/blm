import { Component, inject } from '@angular/core';
import { DocumentStore } from '../../core/document/document-store';
import { getComponentSupportedStages } from '../../core/document/document-model';
import { BusinessComponent } from '../../core/document/document.model';

@Component({
  selector: 'app-component-workbench',
  templateUrl: './component-workbench.html',
  styleUrl: '../../shared/layout/workbench-section.css',
})
export class ComponentWorkbench {
  private readonly documentStore = inject(DocumentStore);
  protected readonly document = this.documentStore.document;

  protected supportedStages(component: BusinessComponent): string {
    const names = getComponentSupportedStages(this.document(), component).map((stage) => stage.name);
    return names.length ? names.join('、') : '待承接';
  }
}
