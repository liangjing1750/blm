import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../core/document/document.model';
import { createCurrentPanoramaExporter } from './panorama-export-dispatcher';

function createDocument(): BlmDocument {
  return {
    meta: { title: '测试', domain: '仓储' },
    roles: [{ uid: 'r1', name: '仓单监管员', group: '监管', desc: '', subDomains: [] }],
    stages: [{ uid: 's1', name: '入库', panoramaLaneUid: 'l1', panoramaColumnUid: 'c1' }],
    stageFlowRefs: [],
    processes: [],
    panorama: { columns: [{ uid: 'c1', name: '列1' }], lanes: [{ uid: 'l1', name: '行1' }], cells: [] },
    entities: [],
    businessComponents: [],
    businessConstructs: [],
    taskDefinitions: [],
    serviceGroups: [],
    services: [],
    terms: [{ term: '仓单', definition: '仓库单据' }],
    dataDictionaries: [],
    rules: [],
  };
}

describe('createCurrentPanoramaExporter', () => {
  it('returns PanoramaExporter for overview tab', () => {
    const exporter = createCurrentPanoramaExporter(createDocument(), 'overview');
    expect(exporter).toBeTruthy();
    expect(exporter!.label).toBe('panorama');
  });

  it('returns RoleExporter for roles tab when roles exist', () => {
    const exporter = createCurrentPanoramaExporter(createDocument(), 'roles');
    expect(exporter).toBeTruthy();
    expect(exporter!.label).toBe('role');
  });

  it('returns null for roles tab when no roles', () => {
    const doc = { ...createDocument(), roles: [] };
    const exporter = createCurrentPanoramaExporter(doc, 'roles');
    expect(exporter).toBeNull();
  });

  it('returns term exporter for terms tab when terms exist', () => {
    const exporter = createCurrentPanoramaExporter(createDocument(), 'terms');
    expect(exporter).toBeTruthy();
    expect(exporter!.label).toBe('terms');
    const content = exporter!.getContent();
    expect(content.title).toBe('术语管理');
  });

  it('returns dictionary exporter for dictionary tab', () => {
    const doc = {
      ...createDocument(),
      dataDictionaries: [{ uid: 'dict-a', name: 'Dict A', code: 'D_A', entries: [] }],
    } as any;
    const exporter = createCurrentPanoramaExporter(doc, 'dictionary');
    expect(exporter).toBeTruthy();
    expect(exporter!.label).toBe('dictionary');
    expect(exporter!.getContent().sections).toEqual(expect.arrayContaining([
      { type: 'heading1', text: '字典管理' },
      { type: 'heading3', text: '字典：Dict A' },
    ]));
  });

  it('returns null for unsupported tabs', () => {
    expect(createCurrentPanoramaExporter(createDocument(), 'rules')).toBeNull();
  });
});
