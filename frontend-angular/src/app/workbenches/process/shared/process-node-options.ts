export interface ProcessNodeOption {
  value: string;
  label: string;
}

export const PROCESS_STEP_TYPES: ProcessNodeOption[] = [
  { value: 'Click', label: '点击' },
  { value: 'Query', label: '查询' },
  { value: 'Check', label: '校验' },
  { value: 'Fill', label: '填写' },
  { value: 'Select', label: '选择' },
  { value: 'Compute', label: '计算' },
  { value: 'Mutate', label: '变更' },
  { value: 'Display', label: '显示' },
  { value: '__other__', label: '其它...' },
];

export const PROCESS_FORM_FIELD_TYPES: ProcessNodeOption[] = [
  { value: 'Text', label: '输入框' },
  { value: 'Select', label: '下拉选择' },
  { value: 'Date', label: '日期' },
  { value: 'Number', label: '数字' },
  { value: 'File', label: '附件' },
  { value: 'Readonly', label: '只读展示' },
  { value: 'Note', label: '说明文本' },
];

export function processStepTypeLabel(value: unknown): string {
  return optionLabel(PROCESS_STEP_TYPES, value);
}

export function processFormFieldTypeLabel(value: unknown): string {
  return optionLabel(PROCESS_FORM_FIELD_TYPES, value);
}

function optionLabel(options: ProcessNodeOption[], value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const option = options.find((item) => item.value.toLowerCase() === raw.toLowerCase());
  return option?.label || raw;
}
