import { beforeEach, describe, expect, it } from 'vitest';
import {
  canRedoAngularRuntimeDocument,
  canUndoAngularRuntimeDocument,
  clearAngularRuntimeUndoHistory,
  canGoBackAngularNavigation,
  getAngularRuntimeState,
  goBackAngularNavigation,
  markAngularRuntimeModified,
  recordAngularNavigationBoundary,
  redoAngularRuntimeDocument,
  replaceRuntimeDocument,
  switchAngularMainTab,
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

  it('restores the workbench location captured with undo and redo document snapshots', () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['mainTab'] = 'processWorkbench';
    runtime.ui['procView'] = 'node';
    runtime.ui['procId'] = 'process-1';
    runtime.ui['taskId'] = 'node-1';

    runtime.doc.meta.domain = 'Node view edit';
    markAngularRuntimeModified();

    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.ui['applicationWorkbenchTab'] = 'service';
    runtime.doc.meta.domain = 'Application view edit';
    markAngularRuntimeModified();

    expect(undoAngularRuntimeDocument()).toBe(true);
    expect(runtime.doc.meta.domain).toBe('Node view edit');
    expect(runtime.ui['mainTab']).toBe('processWorkbench');
    expect(runtime.ui['procView']).toBe('node');
    expect(runtime.ui['procId']).toBe('process-1');
    expect(runtime.ui['taskId']).toBe('node-1');

    expect(redoAngularRuntimeDocument()).toBe(true);
    expect(runtime.doc.meta.domain).toBe('Application view edit');
    expect(runtime.ui['mainTab']).toBe('applicationWorkbench');
    expect(runtime.ui['applicationWorkbenchTab']).toBe('service');
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

  it('returns from component entity definition to the business component map before main workbench history', () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['mainTab'] = 'constructWorkbench';
    runtime.ui['componentWorkbenchTab'] = 'entity';
    runtime.ui['componentWorkbenchReturnTab'] = 'businessComponent';

    expect(canGoBackAngularNavigation()).toBe(true);
    expect(goBackAngularNavigation()).toBe('constructWorkbench');
    expect(runtime.ui['mainTab']).toBe('constructWorkbench');
    expect(runtime.ui['componentWorkbenchTab']).toBe('businessComponent');
    expect(runtime.ui['componentWorkbenchReturnTab']).toBe('');
  });

  it('restores construct workbench tab and selection when returning from another workbench', () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['mainTab'] = 'constructWorkbench';
    runtime.ui['componentWorkbenchTab'] = 'businessConstruct';
    runtime.ui['componentWorkbenchConstructId'] = 'construct-1';
    runtime.ui['taskDefinitionId'] = 'task-1';

    switchAngularMainTab('applicationWorkbench');
    runtime.ui['componentWorkbenchTab'] = 'businessComponent';
    runtime.ui['componentWorkbenchConstructId'] = '';
    runtime.ui['taskDefinitionId'] = '';

    expect(canGoBackAngularNavigation()).toBe(true);
    expect(goBackAngularNavigation()).toBe('constructWorkbench');
    expect(runtime.ui['componentWorkbenchTab']).toBe('businessConstruct');
    expect(runtime.ui['componentWorkbenchConstructId']).toBe('construct-1');
    expect(runtime.ui['taskDefinitionId']).toBe('task-1');
  });

  it('restores process third-level view and selected node when returning inside the same workbench', () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['mainTab'] = 'processWorkbench';
    runtime.ui['procView'] = 'node';
    runtime.ui['processWorkbenchView'] = 'node';
    runtime.ui['procId'] = 'process-1';
    runtime.ui['taskId'] = 'task-1';

    recordAngularNavigationBoundary();
    runtime.ui['procView'] = 'flow';
    runtime.ui['processWorkbenchView'] = 'flow';
    runtime.ui['taskId'] = null;

    expect(canGoBackAngularNavigation()).toBe(true);
    expect(goBackAngularNavigation()).toBe('processWorkbench');
    expect(runtime.ui['procView']).toBe('node');
    expect(runtime.ui['processWorkbenchView']).toBe('node');
    expect(runtime.ui['procId']).toBe('process-1');
    expect(runtime.ui['taskId']).toBe('task-1');
  });

  it('restores application workbench tab and interface selection when returning from another workbench', () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['mainTab'] = 'applicationWorkbench';
    runtime.ui['applicationWorkbenchTab'] = 'orchestration';
    runtime.ui['applicationServiceGroupUid'] = 'group-1';
    runtime.ui['applicationServiceUid'] = 'service-1';
    runtime.ui['applicationOrchestrationServiceUid'] = 'service-2';
    runtime.ui['applicationOrchestrationStepUid'] = 'step-1';

    switchAngularMainTab('constructWorkbench');
    runtime.ui['applicationWorkbenchTab'] = 'service';
    runtime.ui['applicationServiceGroupUid'] = '__all__';
    runtime.ui['applicationServiceUid'] = '';
    runtime.ui['applicationOrchestrationServiceUid'] = '';
    runtime.ui['applicationOrchestrationStepUid'] = '';

    expect(goBackAngularNavigation()).toBe('applicationWorkbench');
    expect(runtime.ui['applicationWorkbenchTab']).toBe('orchestration');
    expect(runtime.ui['applicationServiceGroupUid']).toBe('group-1');
    expect(runtime.ui['applicationServiceUid']).toBe('service-1');
    expect(runtime.ui['applicationOrchestrationServiceUid']).toBe('service-2');
    expect(runtime.ui['applicationOrchestrationStepUid']).toBe('step-1');
  });
});
