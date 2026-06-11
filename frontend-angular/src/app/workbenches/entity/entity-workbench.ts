import { Component, inject } from '@angular/core';
import { DocumentStore } from '../../core/document/document-store';

@Component({
  selector: 'app-entity-workbench',
  templateUrl: './entity-workbench.html',
  styleUrl: '../../shared/layout/workbench-section.css',
})
export class EntityWorkbench {
  protected readonly document = inject(DocumentStore).document;
}
