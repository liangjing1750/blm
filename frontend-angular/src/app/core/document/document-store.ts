import { Injectable, computed, signal } from '@angular/core';
import { SAMPLE_DOCUMENT } from './sample-document';
import { BlmDocument } from './document.model';
import { normalizeDocument } from './document-model';

@Injectable({ providedIn: 'root' })
export class DocumentStore {
  private readonly documentState = signal<BlmDocument>(normalizeDocument(SAMPLE_DOCUMENT));

  readonly document = computed(() => this.documentState());

  replace(document: Partial<BlmDocument>): void {
    this.documentState.set(normalizeDocument(document));
  }
}
