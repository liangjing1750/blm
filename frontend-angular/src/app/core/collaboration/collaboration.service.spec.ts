import { CollaborationService } from './collaboration.service';
import { getAngularRuntimeState } from '../runtime/angular-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Array<(event: any) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', {});
  }

  emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

describe('CollaborationService', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as any);
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-test' } as any);
    localStorage.clear();
    sessionStorage.clear();
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'Agent';
    runtime.readOnly = false;
    runtime.modified = false;
    runtime.collab.seq = 0;
    runtime.collab.acceptedSeq = 0;
    runtime.collab.connected = false;
    runtime.collab.users = [];
    runtime.collab.pendingSnapshot = false;
    runtime.collab.hasRemoteUpdate = false;
    runtime.collab.syncing = false;
    runtime.collab.lastSyncedAt = '';
    runtime.collab.lastActivity = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('joins a document and shows online collaboration status', () => {
    const service = new CollaborationService();

    service.start('Agent');
    const socket = FakeWebSocket.instances[0];
    socket.readyState = FakeWebSocket.OPEN;
    socket.emit('open', {});
    socket.emit('message', {
      data: JSON.stringify({
        type: 'joined',
        seq: 7,
        users: [{ name: 'agent', userId: 'u1' }],
      }),
    });

    expect(JSON.parse(socket.sent[0])).toMatchObject({ type: 'join', doc: 'Agent' });
    expect(service.statusText()).toBe('协作 agent在线');
    expect(getAngularRuntimeState().collab.acceptedSeq).toBe(7);
  });

  it('marks remote updates without replacing the local document', () => {
    const service = new CollaborationService();
    const runtime = getAngularRuntimeState();
    runtime.doc = { meta: { name: 'local' } };

    service.start('Agent');
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', { data: JSON.stringify({ type: 'joined', seq: 1, users: [{ name: 'agent' }] }) });
    socket.emit('message', { data: JSON.stringify({ type: 'updated', seq: 2, user: 'other' }) });

    expect(runtime.doc).toEqual({ meta: { name: 'local' } });
    expect(runtime.collab.hasRemoteUpdate).toBe(true);
    expect(service.statusText()).toBe('协作 agent在线');
  });

  it('marks a same-document local save from another browser session as a remote update', () => {
    const service = new CollaborationService();
    const runtime = getAngularRuntimeState();
    runtime.currentFile = 'agent.json';
    sessionStorage.setItem('blm.collab.sessionId', 'current-session');

    (service as any).handleLocalDocumentSaved({
      type: 'document_saved',
      docName: 'agent.json',
      sessionId: 'other-session',
      userName: 'other',
      at: '2026-06-24T01:00:00.000Z',
    });

    expect(runtime.collab.hasRemoteUpdate).toBe(true);
    expect(runtime.collab.lastActivity).toEqual({ user: 'other', at: '2026-06-24T01:00:00.000Z' });
  });

  it('keeps current online status when start is called again for the same document', () => {
    const service = new CollaborationService();
    const runtime = getAngularRuntimeState();

    service.start('Agent');
    const socket = FakeWebSocket.instances[0];
    socket.readyState = FakeWebSocket.OPEN;
    socket.emit('message', {
      data: JSON.stringify({ type: 'joined', seq: 3, users: [{ name: 'agent' }] }),
    });

    service.start('Agent');

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(runtime.collab.connected).toBe(true);
    expect(service.statusText()).toBe('\u534f\u4f5c agent\u5728\u7ebf');
  });

});
