import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../../core/document/document.model';
import { createCurrentNodeExporter, createCurrentProcessExporter, createCurrentStageExporter, createValueStreamExporter } from './process-export-dispatcher';

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

  it('creates a ProcessExporter for the selected process', () => {
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

    const exporter = createCurrentProcessExporter(document, { procId: 'process-order' });

    expect(exporter?.label).toBe('process-订单办理');
    expect(exporter?.getContent().sections).toEqual(expect.arrayContaining([
      { type: 'heading4', text: '流程：订单办理' },
      { type: 'heading5', text: '节点：复核订单' },
    ]));
  });

  it('creates a ProcessExporter for the first process when no process id is selected', () => {
    const document = {
      meta: { domain: 'Order Center' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [{
        uid: 'process-order',
        name: 'Order Process',
        nodes: [{ uid: 'node-review', name: 'Review Order' }],
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

    const exporter = createCurrentProcessExporter(document, { procId: null });

    expect(exporter?.label).toBe('process-Order-Process');
    expect(exporter?.getContent().sections).toEqual(expect.arrayContaining([
      { type: 'heading4', text: '流程：Order Process' },
    ]));
  });

  it('creates a StageExporter for the selected stage', () => {
    const document = {
      meta: { domain: '订单中心' },
      roles: [],
      stages: [{ uid: 'stage-in', name: '入库阶段' }],
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

    const exporter = createCurrentStageExporter(document, { stageId: 'stage-in' });

    expect(exporter?.label).toBe('stage-入库阶段');
    expect(exporter?.getContent().sections).toEqual(expect.arrayContaining([
      { type: 'heading2', text: '阶段：入库阶段' },
      { type: 'image', text: '阶段视图：入库阶段', imageIndex: 0 },
    ]));
  });

  it('creates a ValueStreamExporter for the value domain view', () => {
    const document = {
      meta: { domain: '订单中心' },
      panorama: {
        columns: [{ uid: 'col-in', name: '入库', badge: '入库' }],
        lanes: [{ uid: 'lane-main', name: '主线' }],
        cells: [],
      },
      roles: [],
      stages: [{ uid: 'stage-in', name: '入库阶段', panoramaColumnUid: 'col-in', panoramaLaneUid: 'lane-main' }],
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

    const exporter = createValueStreamExporter(document);

    expect(exporter.label).toBe('value-stream');
    expect(exporter.getContent().sections).toEqual(expect.arrayContaining([
      { type: 'image', text: '价值流视图', imageIndex: 0 },
      { type: 'heading1', text: '2.价值流环节：入库' },
      { type: 'heading2', text: '2.1 阶段：入库阶段' },
    ]));
  });
});
