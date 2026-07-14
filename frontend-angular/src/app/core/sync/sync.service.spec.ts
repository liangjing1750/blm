import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../api/api.service';
import { CollaborationService } from '../collaboration/collaboration.service';
import { LocalCollabDraftService } from '../collaboration/local-collab-draft.service';
import { DocumentStore } from '../document/document-store';
import { getAngularRuntimeState } from '../runtime/angular-runtime';
import { SyncConflictError, SyncService } from './sync.service';

describe('SyncService', () => {
  let api: { collabSnapshot: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> };
  let collaboration: {
    beginSync: ReturnType<typeof vi.fn>;
    finishSync: ReturnType<typeof vi.fn>;
    failSync: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
    announceDocumentSaved: ReturnType<typeof vi.fn>;
  };
  let localDrafts: { clearDraft: ReturnType<typeof vi.fn>; saveCurrentDraft: ReturnType<typeof vi.fn> };
  let documentStore: { load: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { collabSnapshot: vi.fn(), load: vi.fn() };
    collaboration = {
      beginSync: vi.fn(),
      finishSync: vi.fn(),
      failSync: vi.fn(),
      currentUser: vi.fn(() => ({ name: 'tester' })),
      announceDocumentSaved: vi.fn(),
    };
    localDrafts = { clearDraft: vi.fn(), saveCurrentDraft: vi.fn() };
    documentStore = { load: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        SyncService,
        { provide: ApiService, useValue: api },
        { provide: CollaborationService, useValue: collaboration },
        { provide: LocalCollabDraftService, useValue: localDrafts },
        { provide: DocumentStore, useValue: documentStore },
      ],
    });

    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'sync-conflict.json';
    runtime.doc = { roles: [{ uid: 'role-local', name: 'local role' }] };
    runtime.modified = true;
    runtime.readOnly = false;
    runtime.collab.acceptedSeq = 1;
    runtime.collab.seq = 1;
    runtime.collab.pendingSnapshot = true;
    runtime.collab.hasRemoteUpdate = true;
    runtime.collab.serverDocumentHash = 'base-hash';
    runtime.collab.lastError = '';
  });

  it('keeps the local document and raises conflict when snapshot merge returns conflicts', async () => {
    api.collabSnapshot.mockResolvedValue({
      conflicts: [{ id: 'c1', path: 'roles.role-a.name' }],
      merged_document: { roles: [{ uid: 'role-remote', name: 'remote role' }] },
    });
    const service = TestBed.inject(SyncService);

    await expect(service.syncNow()).rejects.toBeInstanceOf(SyncConflictError);

    const runtime = getAngularRuntimeState();
    expect(runtime.doc.roles[0].uid).toBe('role-local');
    expect(runtime.collab.pendingSnapshot).toBe(true);
    expect(runtime.collab.hasRemoteUpdate).toBe(true);
    expect(runtime.collab.lastError).toBe('');
    expect(collaboration.failSync).not.toHaveBeenCalled();
    expect(documentStore.load).not.toHaveBeenCalled();
  });

  it('rejects read-only version synchronization before posting a snapshot', async () => {
    const runtime = getAngularRuntimeState();
    runtime.readOnly = true;
    runtime.doc = { meta: { readonly: true }, roles: [{ uid: 'readonly-role', name: 'readonly role' }] };
    const service = TestBed.inject(SyncService);

    await expect(service.syncNow()).rejects.toThrow('readonly documents cannot be synchronized');

    expect(api.collabSnapshot).not.toHaveBeenCalled();
    expect(collaboration.beginSync).not.toHaveBeenCalled();
    expect(collaboration.failSync).not.toHaveBeenCalled();
    expect(documentStore.load).not.toHaveBeenCalled();
  });
});
