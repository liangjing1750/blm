import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlmDocument, ProcessNode } from '../../document/document.model';
import { buildProcessContent, captureProcessFlowGraph, ProcessExporter } from './process-exporter';

vi.mock('dom-to-image-more', () => ({
  default: {
    toPng: vi.fn(async (el: HTMLElement) => {
      const marker = el.getAttribute('data-marker') || 'unknown';
      return `data:image/png;base64,${btoa(marker)}`;
    }),
  },
}));

describe('buildProcessContent', () => {
  it('exports a process heading, flow image, and all node sections by reusing node content', () => {
    const nodeA: ProcessNode = { uid: 'node-a', name: '提交申请', role: '申请人' };
    const nodeB: ProcessNode = { uid: 'node-b', name: '审批申请', role: '审批人' };
    const document = {
      meta: { domain: '订单中心' },
      roles: [
        { uid: 'role-a', name: '申请人' },
        { uid: 'role-b', name: '审批人' },
      ],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-apply', name: '申请流程', trigger: '用户提交', outcome: '完成审批', nodes: [nodeA, nodeB] }],
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

    const content = buildProcessContent(document, document.processes[0]);

    expect(content.title).toBe('流程：申请流程');
    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading4', text: '流程：申请流程' },
      { type: 'table', headers: ['字段', '内容'], rows: [
        ['触发', '用户提交'],
        ['预期', '完成审批'],
      ] },
      { type: 'image', text: '流程图：申请流程', imageIndex: 0 },
      { type: 'heading5', text: '节点：提交申请' },
      { type: 'heading5', text: '节点：审批申请' },
    ]));
  });

  it('exposes a ProcessExporter label based on the process name', async () => {
    const document = {
      meta: {},
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-apply', name: '申请流程', nodes: [] }],
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

    const exporter = new ProcessExporter(document, document.processes[0]);

    expect(exporter.label).toBe('process-申请流程');
    expect(exporter.getContent().title).toBe('流程：申请流程');
    expect(await exporter.captureAll()).toHaveLength(1);
  });

  it('prefixes composed process and node headings when a hierarchy prefix is provided', () => {
    const document = {
      meta: {},
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-a', name: 'Process A', nodes: [{ uid: 'node-a', name: 'Node A' }] }],
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

    const content = buildProcessContent(document, document.processes[0], { headingPrefix: '2.1.1.1' });

    expect(content.sections).toEqual(expect.arrayContaining([
      { type: 'heading4', text: '2.1.1.1 流程：Process A' },
      { type: 'heading5', text: '2.1.1.1.1 节点：Node A' },
    ]));
  });
});

describe('captureProcessFlowGraph', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not fall back to the visible current-process canvas when a requested export graph is missing', async () => {
    const currentCanvas = document.createElement('div');
    currentCanvas.setAttribute('data-testid', 'process-flow-canvas');
    currentCanvas.setAttribute('data-marker', 'current-process');
    Object.defineProperties(currentCanvas, {
      offsetWidth: { value: 320 },
      offsetHeight: { value: 240 },
      scrollWidth: { value: 320 },
      scrollHeight: { value: 240 },
    });
    document.body.appendChild(currentCanvas);

    const bytes = await captureProcessFlowGraph('process-flow:target-process');

    expect(new TextDecoder().decode(bytes)).toBe('');
  });

  it('captures the exact requested export graph when it is present', async () => {
    const currentCanvas = document.createElement('div');
    currentCanvas.setAttribute('data-testid', 'process-flow-canvas');
    currentCanvas.setAttribute('data-marker', 'current-process');
    const targetCanvas = document.createElement('div');
    targetCanvas.setAttribute('data-testid', 'process-flow-canvas');
    targetCanvas.setAttribute('data-export-graph-id', 'process-flow:target-process');
    targetCanvas.setAttribute('data-marker', 'target-process');
    for (const el of [currentCanvas, targetCanvas]) {
      Object.defineProperties(el, {
        offsetWidth: { value: 320 },
        offsetHeight: { value: 240 },
        scrollWidth: { value: 320 },
        scrollHeight: { value: 240 },
      });
      document.body.appendChild(el);
    }

    const bytes = await captureProcessFlowGraph('process-flow:target-process');

    expect(new TextDecoder().decode(bytes)).toBe('target-process');
  });
});
