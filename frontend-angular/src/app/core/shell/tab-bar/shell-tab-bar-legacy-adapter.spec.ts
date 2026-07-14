import { describe, expect, it, beforeEach } from 'vitest';
import { getAngularRuntimeState, replaceRuntimeDocument, switchAngularMainTab } from '../../runtime/angular-runtime';
import { createShellTabBarLegacyAdapter } from './shell-tab-bar-legacy-adapter';

describe('shell tab bar legacy adapter navigation', () => {
  beforeEach(() => {
    replaceRuntimeDocument({
      meta: { domain: 'Tab bar navigation' },
      roles: [],
      stages: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
    }, 'tabbar-test.json');
    const runtime = getAngularRuntimeState();
    runtime.ui['mainTab'] = 'panoramaWorkbench';
    runtime.ui['navHistory'] = [];
    runtime.ui['procId'] = null;
    runtime.ui['taskId'] = null;
  });

  it('does not overwrite utility workbench state when resolving the highlighted tab', () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['mainTab'] = 'processWorkbench';
    runtime.ui['procId'] = 'process-1';

    switchAngularMainTab('manual');
    const adapter = createShellTabBarLegacyAdapter();

    expect(adapter.activeTabId()).toBe('panoramaWorkbench');
    expect(runtime.ui['mainTab']).toBe('manual');
  });

  it('uses utility return semantics for the top back button on utility workbenches', () => {
    const runtime = getAngularRuntimeState();
    runtime.ui['mainTab'] = 'processWorkbench';
    runtime.ui['procId'] = 'process-1';

    switchAngularMainTab('manual');
    switchAngularMainTab('feedback');
    const adapter = createShellTabBarLegacyAdapter();

    expect(adapter.goBack()).toBe('processWorkbench');
    expect(runtime.ui['mainTab']).toBe('processWorkbench');
    expect(runtime.ui['procId']).toBe('process-1');
  });
});
