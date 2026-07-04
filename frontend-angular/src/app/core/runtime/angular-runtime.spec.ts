import { beforeEach, describe, expect, it } from 'vitest';
import {
  canRedoAngularRuntimeDocument,
  canUndoAngularRuntimeDocument,
  clearAngularRuntimeUndoHistory,
  getAngularRuntimeState,
  markAngularRuntimeModified,
  redoAngularRuntimeDocument,
  replaceRuntimeDocument,
  undoAngularRuntimeDocument,
} from './angular-runtime';

describe('angular runtime undo history', () => {
  beforeEach(() => {
    replaceRuntimeDocument({
      meta: { domain: 'Undo baseline' },
      roles: [],
      stages: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
    }, 'undo-test.json');
    clearAngularRuntimeUndoHistory();
  });

  it('records bounded document snapshots at mutation boundaries and supports undo/redo', () => {
    const runtime = getAngularRuntimeState();

    runtime.doc.meta.domain = 'First edit';
    markAngularRuntimeModified();

    expect(canUndoAngularRuntimeDocument()).toBe(true);
    expect(canRedoAngularRuntimeDocument()).toBe(false);

    runtime.doc.meta.domain = 'Second edit';
    markAngularRuntimeModified();

    expect(undoAngularRuntimeDocument()).toBe(true);
    expect(runtime.doc.meta.domain).toBe('First edit');
    expect(canRedoAngularRuntimeDocument()).toBe(true);

    expect(undoAngularRuntimeDocument()).toBe(true);
    expect(runtime.doc.meta.domain).toBe('Undo baseline');
    expect(canUndoAngularRuntimeDocument()).toBe(false);

    expect(redoAngularRuntimeDocument()).toBe(true);
    expect(runtime.doc.meta.domain).toBe('First edit');
  });

  it('clears redo snapshots when a new edit happens after undo', () => {
    const runtime = getAngularRuntimeState();

    runtime.doc.meta.domain = 'First edit';
    markAngularRuntimeModified();
    runtime.doc.meta.domain = 'Second edit';
    markAngularRuntimeModified();

    expect(undoAngularRuntimeDocument()).toBe(true);
    expect(runtime.doc.meta.domain).toBe('First edit');
    expect(canRedoAngularRuntimeDocument()).toBe(true);

    runtime.doc.meta.domain = 'Branch edit';
    markAngularRuntimeModified();

    expect(canRedoAngularRuntimeDocument()).toBe(false);
  });

  it('keeps only the latest fifty undo snapshots', () => {
    const runtime = getAngularRuntimeState();

    for (let index = 1; index <= 55; index += 1) {
      runtime.doc.meta.domain = `Edit ${index}`;
      markAngularRuntimeModified();
    }

    for (let index = 0; index < 50; index += 1) {
      expect(undoAngularRuntimeDocument()).toBe(true);
    }

    expect(canUndoAngularRuntimeDocument()).toBe(false);
    expect(runtime.doc.meta.domain).toBe('Edit 5');
  });
});
