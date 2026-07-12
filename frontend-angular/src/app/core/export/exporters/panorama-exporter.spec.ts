import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../document/document.model';
import { PanoramaExporter } from './panorama-exporter';

function createDocument(): BlmDocument {
  return {
    meta: { title: '测试文档', domain: '仓储', author: '测试员' },
    roles: [],
    stages: [
      { uid: 's1', name: '入库阶段', panoramaLaneUid: 'l1', panoramaColumnUid: 'c1', subDomain: '入库' },
      { uid: 's2', name: '出库阶段', panoramaLaneUid: 'l1', panoramaColumnUid: 'c2', subDomain: '出库' },
    ],
    stageFlowRefs: [],
    processes: [],
    panorama: {
      columns: [{ uid: 'c1', name: '仓单监管' }, { uid: 'c2', name: '交割服务机构监管' }],
      lanes: [{ uid: 'l1', name: '交割智慧监管平台' }],
      cells: [],
    },
    businessComponents: [
      { uid: 'comp1', name: '仓单组件', kind: 'core', businessConstructIds: ['bc1', 'bc2'] },
    ],
    businessConstructs: [],
    taskDefinitions: [],
    entities: [],
    serviceGroups: [],
    services: [],
    terms: [],
    dataDictionaries: [],
    rules: [],
  };
}

describe('PanoramaExporter', () => {
  it('uses static label "panorama"', () => {
    const exporter = new PanoramaExporter(createDocument());
    expect(exporter.label).toBe('panorama');
  });

  it('builds content with heading, matrix table, stages, components, and image placeholder', () => {
    const exporter = new PanoramaExporter(createDocument());
    const content = exporter.getContent();

    expect(content.title).toBe('引言');
    expect(content.sections.length).toBeGreaterThan(3);

    // 标题
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading1', text: '1.引言' },
      { type: 'heading2', text: '1.1 全景视图' },
    ]));

    const image = content.sections.find((s) => s.type === 'image');
    expect(image).toEqual({ type: 'image', text: '全景视图', imageIndex: 0 });
  });

  it('does not crash when document has no panorama config', () => {
    const doc = { ...createDocument(), panorama: undefined };
    const exporter = new PanoramaExporter(doc);
    const content = exporter.getContent();
    expect(content.sections.length).toBeGreaterThan(0);
  });

  it('does not crash with empty stages and components', () => {
    const doc = {
      ...createDocument(),
      stages: [],
      businessComponents: [],
      panorama: { columns: [], lanes: [], cells: [] },
    };
    const exporter = new PanoramaExporter(doc);
    const content = exporter.getContent();
    expect(content.title).toBe('引言');
    expect(content.sections.some((s) => s.type === 'image')).toBe(true);
  });

  it('builds chapter 1 introduction with overview, roles, terms, and dictionaries', () => {
    const doc = {
      ...createDocument(),
      roles: [{ uid: 'role-a', name: 'Role A', group: 'Group A', desc: 'Desc A' }],
      terms: [{ name: 'Term A', desc: 'Definition A' }],
      dataDictionaries: [{
        uid: 'dict-a',
        name: 'Dict A',
        code: 'D_A',
        entries: [{ uid: 'entry-a', code: 'A', name: 'Alpha', desc: 'Alpha desc' }],
      }],
    } as any;
    const content = new PanoramaExporter(doc).getContent();

    expect(content.title).toBe('引言');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading1', text: '1.引言' },
      { type: 'heading2', text: '1.1 全景视图' },
      { type: 'image', text: '全景视图', imageIndex: 0 },
      { type: 'heading2', text: '1.2 角色管理' },
      { type: 'heading3', text: '角色用例图：Role A' },
      { type: 'image', text: '角色用例图：Role A', imageIndex: 1 },
      { type: 'heading2', text: '1.3 术语管理' },
      { type: 'heading2', text: '1.4 字典管理' },
      { type: 'heading3', text: '字典：Dict A' },
    ]));
  });
});
