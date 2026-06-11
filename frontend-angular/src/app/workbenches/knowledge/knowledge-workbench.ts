import { Component, inject } from '@angular/core';
import { DocumentStore } from '../../core/document/document-store';

@Component({
  selector: 'app-knowledge-workbench',
  templateUrl: './knowledge-workbench.html',
  styleUrl: '../../shared/layout/workbench-section.css',
})
export class KnowledgeWorkbench {
  protected readonly document = inject(DocumentStore).document;
}
