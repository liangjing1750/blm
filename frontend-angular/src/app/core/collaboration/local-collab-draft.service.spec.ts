import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAngularRuntimeState } from '../runtime/angular-runtime';
import { LocalCollabDraftService } from './local-collab-draft.service';

describe('LocalCollabDraftService', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('blm.collab.sessionId', 'session-test');
    localStorage.setItem('blm.user.profile', JSON.stringify({ id: 'user-test', name: '测试用户' }));
    const runtime = getAngularRuntimeState();
    runtime.currentFile = '订单流程';
    runtime.readOnly = false;
    runtime.modified = false;
    runtime.runtime.supportsCollab = true;
    runtime.doc = { meta: { title: '服务端' }, processes: [] };
    runtime.collab.seq = 9;
    runtime.collab.acceptedSeq = 7;
    runtime.collab.pendingSnapshot = false;
    runtime.collab.draftBaseSeqOverride = undefined;
  });

  const createService = () => new LocalCollabDraftService({ load: vi.fn() } as any);

  it('persists drafts with the legacy doc-and-user key in localStorage fallback', async () => {
    const service = createService();
    const runtime = getAngularRuntimeState();
    runtime.doc = { meta: { title: '本地草稿' }, processes: [{ uid: 'p1' }] };

    const draft = await service.saveCurrentDraft();

    const storageKey = `blm.collab.draft.${encodeURIComponent('订单流程::user-test')}`;
    expect(draft?.key).toBe('订单流程::user-test');
    expect(draft?.baseSeq).toBe(7);
    expect(JSON.parse(localStorage.getItem(storageKey) || 'null')).toMatchObject({
      key: '订单流程::user-test',
      docName: '订单流程',
      userId: 'user-test',
      userName: '测试用户',
      sessionId: 'session-test',
      document: { meta: { title: '本地草稿' } },
    });
  });

  it('returns a recoverable draft only when it differs from the server document', async () => {
    const service = createService();
    const runtime = getAngularRuntimeState();

    runtime.doc = { meta: { title: '本地草稿' } };
    await service.saveCurrentDraft();

    const recoverable = await service.findRecoverableDraft('订单流程', { meta: { title: '服务端' } });
    expect(recoverable?.document).toEqual({ meta: { title: '本地草稿' } });

    const sameAsServer = await service.findRecoverableDraft('订单流程', { meta: { title: '本地草稿' } });
    expect(sameAsServer).toBeNull();
    expect(localStorage.getItem(`blm.collab.draft.${encodeURIComponent('订单流程::user-test')}`)).toBeNull();
  });

  it('finds and clears legacy-profile drafts after collaboration user id migration', async () => {
    const service = createService();
    localStorage.setItem('blm.user.profile', JSON.stringify({ id: 'legacy-user', name: '旧用户' }));
    localStorage.setItem('blm.collab.userId', 'current-user');
    localStorage.setItem('blm.collab.userName', '当前用户');
    const legacyKey = `blm.collab.draft.${encodeURIComponent('订单流程::legacy-user')}`;
    const currentKey = `blm.collab.draft.${encodeURIComponent('订单流程::current-user')}`;
    const legacyDraft = {
      key: '订单流程::legacy-user',
      docName: '订单流程',
      userId: 'legacy-user',
      userName: '旧用户',
      sessionId: 'session-test',
      baseSeq: 2,
      generation: 1,
      updatedAt: '2026-07-12T01:00:00.000Z',
      contentHash: '',
      document: { meta: { title: '旧 key 草稿' } },
    };
    localStorage.setItem(legacyKey, JSON.stringify(legacyDraft));
    localStorage.setItem(currentKey, JSON.stringify({ ...legacyDraft, key: '订单流程::current-user', userId: 'current-user' }));

    expect((await service.findRecoverableDraft('订单流程', { meta: { title: '服务端' } }))?.document)
      .toEqual({ meta: { title: '旧 key 草稿' } });

    await service.clearDraft('订单流程');

    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem(currentKey)).toBeNull();
  });

  it('applies a recovered draft to runtime with pending snapshot and draft base seq', async () => {
    const service = createService();

    service.applyRecoveredDraft('订单流程', {
      key: '订单流程::user-test',
      docName: '订单流程',
      userId: 'user-test',
      userName: '测试用户',
      sessionId: 'session-test',
      baseSeq: 3,
      generation: 1,
      updatedAt: '2026-07-02T01:00:00.000Z',
      contentHash: 'hash',
      document: { meta: { title: '恢复草稿', readonly: true, version_id: 'v1' } },
    });

    const runtime = getAngularRuntimeState();
    expect(runtime.currentFile).toBe('订单流程');
    expect(runtime.doc.meta).toMatchObject({ title: '恢复草稿', readonly: false });
    expect(runtime.doc.meta.version_id).toBeUndefined();
    expect(runtime.modified).toBe(true);
    expect(runtime.collab.pendingSnapshot).toBe(true);
    expect(runtime.collab.draftBaseSeqOverride).toBe(3);
  });
});
