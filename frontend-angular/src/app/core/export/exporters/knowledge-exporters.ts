import { BlmDocument } from '../../document/document.model';
import { ViewContent, ViewExporter, ViewSection } from './view-exporter';

export class TermsExporter implements ViewExporter {
  readonly label = 'terms';

  constructor(private readonly document: BlmDocument) {}

  toMarkdown(): string { return '# 术语管理\n\n'; }
  getContent(): ViewContent { return buildTermsContent(this.document, { headingType: 'heading1' }); }
  async capture(): Promise<Uint8Array> { return new Uint8Array(); }
  async captureAll(): Promise<Uint8Array[]> { return []; }
}

export class DictionaryExporter implements ViewExporter {
  readonly label = 'dictionary';

  constructor(private readonly document: BlmDocument) {}

  toMarkdown(): string { return '# 字典管理\n\n'; }
  getContent(): ViewContent { return buildDictionaryContent(this.document, { headingType: 'heading1' }); }
  async capture(): Promise<Uint8Array> { return new Uint8Array(); }
  async captureAll(): Promise<Uint8Array[]> { return []; }
}

export function buildTermsContent(
  document: BlmDocument,
  options: { headingType?: 'heading1' | 'heading2' } = {},
): ViewContent {
  const terms = resolveTerms(document);
  const sections: ViewSection[] = [
    { type: options.headingType || 'heading1', text: '术语管理' },
    {
      type: 'table',
      headers: ['术语', '定义'],
      rows: terms.length
        ? terms.map((item: any) => [
          item.term || item.name || '',
          item.definition || item.desc || '',
        ])
        : [['未配置', '']],
    },
  ];
  return { title: '术语管理', sections };
}

export function buildDictionaryContent(
  document: BlmDocument,
  options: { headingType?: 'heading1' | 'heading2' } = {},
): ViewContent {
  const dictionaries = resolveDictionaries(document);
  const sections: ViewSection[] = [
    { type: options.headingType || 'heading1', text: '字典管理' },
  ];

  if (!dictionaries.length) {
    sections.push({
      type: 'table',
      headers: ['字典', '编码', '说明'],
      rows: [['未配置', '', '']],
    });
    return { title: '字典管理', sections };
  }

  dictionaries.forEach((dictionary: any, index) => {
    const name = dictionary.name || dictionary.code || dictionary.uid || `字典${index + 1}`;
    sections.push({ type: 'heading3', text: `字典：${name}` });
    sections.push({
      type: 'table',
      headers: ['编码', '名称', '说明'],
      rows: (dictionary.entries || []).length
        ? dictionary.entries.map((entry: any) => [
          entry.code || '',
          entry.name || '',
          entry.desc || entry.description || '',
        ])
        : [['未配置', '', '']],
    });
  });

  return { title: '字典管理', sections };
}

function resolveTerms(document: BlmDocument): any[] {
  const doc = document as any;
  const terms = Array.isArray(doc.terms) ? doc.terms : [];
  if (terms.some(isUsefulTerm)) return terms;
  const language = Array.isArray(doc.language) ? doc.language : [];
  return language.filter((item: any) => isUsefulTerm(item) && !isDictionaryLike(item));
}

function resolveDictionaries(document: BlmDocument): any[] {
  const doc = document as any;
  const standard = Array.isArray(doc.dataDictionaries) ? doc.dataDictionaries : [];
  if (standard.some(isUsefulDictionary)) return standard;
  for (const field of ['dictionaries', 'data_dictionaries', 'dataDictionary']) {
    const value = doc[field];
    if (Array.isArray(value) && value.some(isUsefulDictionary)) return value;
  }
  const language = Array.isArray(doc.language) ? doc.language : [];
  return language.filter(isDictionaryLike);
}

function isUsefulTerm(item: any): boolean {
  return Boolean(String(item?.name || item?.term || item?.desc || item?.definition || '').trim());
}

function isUsefulDictionary(item: any): boolean {
  return Boolean(String(item?.name || item?.code || item?.desc || '').trim() || (Array.isArray(item?.entries) && item.entries.length));
}

function isDictionaryLike(item: any): boolean {
  return Boolean(Array.isArray(item?.entries) || item?.code || item?.values || item?.items);
}
