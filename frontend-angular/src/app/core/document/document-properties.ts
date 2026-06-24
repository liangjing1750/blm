export interface DocumentPropertiesForm {
  name: string;
  author: string;
  date: string;
  space: string;
  tags: string;
}

const EMPTY_PROPERTIES: DocumentPropertiesForm = {
  name: '',
  author: '',
  date: '',
  space: '',
  tags: '',
};

function stringifyProperty(value: unknown): string {
  return String(value || '').trim();
}

function stringifyTags(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => stringifyProperty(item)).filter(Boolean).join('，');
  return stringifyProperty(value);
}

// 模块意图：集中恢复旧版“属性”弹窗的文档 meta 映射，避免壳层模板散落字段规则。
export function readDocumentProperties(document: any, currentFile = ''): DocumentPropertiesForm {
  const meta = document?.meta || {};
  return {
    ...EMPTY_PROPERTIES,
    name: stringifyProperty(meta.domain || meta.title || currentFile),
    author: stringifyProperty(meta.author),
    date: stringifyProperty(meta.date),
    space: stringifyProperty(meta.space),
    tags: stringifyTags(meta.tags),
  };
}

export function validateDocumentProperties(form: DocumentPropertiesForm): string {
  return form.name.trim() ? '' : '请填写文档名称。';
}

export function applyDocumentProperties(document: any, form: DocumentPropertiesForm): void {
  document.meta ||= {};
  const name = form.name.trim();

  // 关键流程：沿用旧版字段名写回 meta；同步仍由现有保存链路处理，不扩展后端模型。
  document.meta.domain = name;
  document.meta.title = name;
  document.meta.author = form.author.trim();
  document.meta.date = form.date.trim();
  document.meta.space = form.space.trim();
  document.meta.tags = form.tags.trim();
}
