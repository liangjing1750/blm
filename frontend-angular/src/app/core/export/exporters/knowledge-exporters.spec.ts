import { describe, expect, it } from 'vitest';
import { BlmDocument } from '../../document/document.model';
import { buildSingleViewDocxBlob } from '../export.service';
import { DictionaryExporter, TermsExporter, buildDictionaryContent, buildTermsContent } from './knowledge-exporters';

function createDocument(): BlmDocument {
  return {
    meta: { domain: 'Warehouse' },
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
    terms: [{ uid: 'term-a', name: 'Term A', desc: 'Definition A' }],
    dataDictionaries: [{
      uid: 'dict-a',
      name: 'Dict A',
      code: 'D_A',
      entries: [{ uid: 'entry-a', code: 'A', name: 'Alpha', desc: 'Alpha desc' }],
    }],
    rules: [],
  } as any;
}

describe('TermsExporter', () => {
  it('exports terms as text table without screenshots', async () => {
    const exporter = new TermsExporter(createDocument());
    const content = exporter.getContent();

    expect(exporter.label).toBe('terms');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading1', text: '术语管理' },
      { type: 'table', headers: ['术语', '定义'], rows: [['Term A', 'Definition A']] },
    ]));
    expect(await exporter.captureAll()).toEqual([]);
    await expect(buildSingleViewDocxBlob(content, [])).resolves.toBeInstanceOf(Blob);
  });

  it('falls back to legacy language terms when standard terms are empty', () => {
    const content = buildTermsContent({
      ...createDocument(),
      terms: [],
      language: [{ uid: 'legacy-term', term: 'Legacy Term', definition: 'Legacy Definition' }],
    } as any);

    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'table', headers: ['术语', '定义'], rows: [['Legacy Term', 'Legacy Definition']] },
    ]));
  });
});

describe('DictionaryExporter', () => {
  it('exports dictionaries as text tables without screenshots', async () => {
    const exporter = new DictionaryExporter(createDocument());
    const content = exporter.getContent();

    expect(exporter.label).toBe('dictionary');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading1', text: '字典管理' },
      { type: 'heading3', text: '字典：Dict A' },
      { type: 'table', headers: ['编码', '名称', '说明'], rows: [['A', 'Alpha', 'Alpha desc']] },
    ]));
    expect(await exporter.captureAll()).toEqual([]);
    await expect(buildSingleViewDocxBlob(content, [])).resolves.toBeInstanceOf(Blob);
  });

  it('falls back to legacy dictionary fields when standard dataDictionaries are empty', () => {
    const content = buildDictionaryContent({
      ...createDocument(),
      dataDictionaries: [],
      dictionaries: [{
        uid: 'legacy-dict',
        code: 'status',
        name: 'Status',
        entries: [{ code: 'enabled', name: 'Enabled', description: 'Can use' }],
      }],
    } as any);

    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading3', text: '字典：Status' },
      { type: 'table', headers: ['编码', '名称', '说明'], rows: [['enabled', 'Enabled', 'Can use']] },
    ]));
  });
});
