import { Injectable, computed, signal } from '@angular/core';
import { SAMPLE_DOCUMENT } from './sample-document';
import { BlmDocument } from './document.model';
import { normalizeDocument } from './document-model';
import { getAngularRuntimeState, markAngularRuntimeModified, replaceRuntimeDocument } from '../runtime/angular-runtime';

@Injectable({ providedIn: 'root' })
export class DocumentStore {
  private readonly documentState = signal<BlmDocument>(normalizeDocument(getAngularRuntimeState().doc || SAMPLE_DOCUMENT));

  readonly document = computed(() => this.documentState());
  readonly currentFile = computed(() => getAngularRuntimeState().currentFile);
  readonly modified = computed(() => getAngularRuntimeState().modified);

  replace(document: Partial<BlmDocument>): void {
    const normalized = normalizeDocument(document);
    replaceRuntimeDocument(normalized, getAngularRuntimeState().currentFile);
    this.documentState.set(normalized);
  }

  load(document: Partial<BlmDocument>, fileName: string): void {
    const normalized = normalizeDocument(document);
    replaceRuntimeDocument(normalized, fileName);
    this.documentState.set(normalized);
  }

  markModified(): void {
    markAngularRuntimeModified();
    this.documentState.set(normalizeDocument(getAngularRuntimeState().doc));
  }
}
