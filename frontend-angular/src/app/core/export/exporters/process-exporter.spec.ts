// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlmDocument, ProcessNode } from '../../document/document.model';
import { buildProcessContent, captureProcessFlowGraph, processContentBounds, ProcessExporter } from './process-exporter';

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
      meta: { domain: '' },
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

  it('does not write hierarchy prefixes into composed process and node headings', () => {
    const document = {
      meta: { domain: '' },
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
      { type: 'heading4', text: '流程：Process A' },
      { type: 'heading5', text: '节点：Node A' },
    ]));
  });
  it('omits the trigger and outcome table when both fields are blank', () => {
    const document = {
      meta: { domain: '' },
      roles: [],
      stages: [],
      stageFlowRefs: [],
      processes: [{ uid: 'process-empty', name: 'Empty Process', trigger: '  ', outcome: '', nodes: [] }],
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

    expect(content.sections.some((section) =>
      section.type === 'table'
      && section.headers?.length === 2
      && section.rows?.length === 2
      && section.rows.every((row) => !String(row[1] || '').trim()),
    )).toBe(false);
    expect(content.sections.some((section) => section.type === 'image')).toBe(true);
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

describe('processContentBounds', () => {
  it('includes shared node badges that overflow outside the node card', () => {
    const host = document.createElement('div');
    const node = document.createElement('div');
    const badge = document.createElement('span');
    host.setAttribute('data-testid', 'process-flow-canvas');
    node.setAttribute('data-testid', 'process-flow-node');
    badge.className = 'shared-badge';
    host.appendChild(node);
    node.appendChild(badge);
    Object.defineProperties(host, {
      offsetWidth: { value: 400 },
      offsetHeight: { value: 220 },
      scrollWidth: { value: 400 },
      scrollHeight: { value: 220 },
    });
    host.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 220, width: 400, height: 220 } as DOMRect);
    node.getBoundingClientRect = () => ({ left: 100, top: 80, right: 200, bottom: 140, width: 100, height: 60 } as DOMRect);
    badge.getBoundingClientRect = () => ({ left: 188, top: 62, right: 390, bottom: 78, width: 202, height: 16 } as DOMRect);

    const bounds = processContentBounds(host);

    expect(bounds?.x).toBeLessThanOrEqual(28);
    expect((bounds?.x || 0) + (bounds?.width || 0)).toBeGreaterThanOrEqual(390);
  });
});
