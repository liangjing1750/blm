import { Component, inject } from '@angular/core';
import { DocumentStore } from '../../core/document/document-store';
import { getRoleUsage } from '../../core/document/document-model';
import { Role } from '../../core/document/document.model';

@Component({
  selector: 'app-role-workbench',
  templateUrl: './role-workbench.html',
  styleUrl: '../../shared/layout/workbench-section.css',
})
export class RoleWorkbench {
  private readonly documentStore = inject(DocumentStore);
  protected readonly document = this.documentStore.document;

  protected usageCount(role: Role): number {
    return getRoleUsage(this.document(), role.uid).length;
  }
}
