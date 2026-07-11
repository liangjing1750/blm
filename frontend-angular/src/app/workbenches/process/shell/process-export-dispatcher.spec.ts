import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../../core/document/document.model';
import { createCurrentNodeExporter } from './process-export-dispatcher';

describe('createCurrentNodeExporter', () => {
  it('creates a NodeExporter for the selected process node', () => {
    const document = {
      meta: { domain: '订单中心' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [{
        uid: 'process-order',
        name: '订单办理',
        nodes: [{ uid: 'node-review', name: '复核订单' }],
      }],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
      serviceGroups: [],
      services: [],
      terms: [],
      dataDictionaries: [],
      rules: [],
    } satisfies BlmDocument;

    const exporter = createCurrentNodeExporter(document, {
      procId: 'process-order',
      taskId: 'node-review',
    });

    expect(exporter?.label).toBe('node-复核订单');
    expect(exporter?.getContent().title).toBe('节点：复核订单');
  });

  it('returns null when the selected node cannot be found', () => {
    const document = {
      meta: { domain: '订单中心' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [],
      entities: [],
      businessComponents: [],
      businessConstructs: [],
      taskDefinitions: [],
      serviceGroups: [],
      services: [],
      terms: [],
      dataDictionaries: [],
      rules: [],
    } satisfies BlmDocument;

    expect(createCurrentNodeExporter(document, { procId: 'missing', taskId: 'missing' })).toBeNull();
  });
});
