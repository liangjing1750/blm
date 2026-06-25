import { Component, inject } from '@angular/core';
import { DocumentStore } from '../../core/document/document-store';

@Component({
  selector: 'app-orchestration-workbench',
  templateUrl: './orchestration-workbench.html',
  styleUrl: '../../shared/layout/workbench-section.scss',
})
export class OrchestrationWorkbench {
  protected readonly document = inject(DocumentStore).document;
}
