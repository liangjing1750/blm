import { describe, expect, it } from 'vitest';
import { buildSidebarLocatorLink } from './sidebar-locator';

describe('buildSidebarLocatorLink', () => {
  it.each([
    [{ type: 'value-stream', id: 'vs-1' }, { tab: 'process', view: 'valueDomain', valueStream: 'vs-1' }],
    [{ type: 'stage', id: 'stage-1' }, { tab: 'process', view: 'stage', stage: 'stage-1' }],
    [{ type: 'flow-group', id: 'group-1', parentId: 'stage-1' }, { tab: 'process', view: 'stage', stage: 'stage-1', group: 'group-1' }],
    [{ type: 'process', id: 'proc-1' }, { tab: 'process', view: 'flow', proc: 'proc-1' }],
    [{ type: 'node', id: 'node-1', parentId: 'proc-1' }, { tab: 'process', view: 'flow', proc: 'proc-1', task: 'node-1' }],
    [{ type: 'construct', id: 'construct-1', rootId: 'component-1' }, { tab: 'component', view: 'construct', component: 'component-1', construct: 'construct-1' }],
    [{ type: 'entity', id: 'entity-1', parentId: 'construct-1', rootId: 'component-1' }, { tab: 'component', view: 'entity', component: 'component-1', construct: 'construct-1', entity: 'entity-1' }],
    [{ type: 'task', id: 'task-1', parentId: 'construct-1', rootId: 'component-1' }, { tab: 'component', view: 'task', component: 'component-1', construct: 'construct-1', task: 'task-1' }],
    [{ type: 'application-interface', id: 'api-1', parentId: 'service-1' }, { tab: 'application', view: 'interface', service: 'service-1', interface: 'api-1' }],
    [{ type: 'dictionary-item', id: 'item-1', parentId: 'dict-1' }, { tab: 'panorama', view: 'dictionary', dictionary: 'dict-1', item: 'item-1' }],
  ] as const)('maps %s', (target, params) => {
    expect(buildSidebarLocatorLink(target as any)?.params).toEqual(params);
  });

  it('rejects targets without required parent identifiers', () => {
    expect(buildSidebarLocatorLink({ type: 'node', id: 'node-1' })).toBeNull();
    expect(buildSidebarLocatorLink({ type: 'entity', id: 'entity-1', rootId: 'component-1' })).toBeNull();
  });
});
