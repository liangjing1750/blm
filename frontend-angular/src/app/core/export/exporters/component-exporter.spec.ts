import { BlmDocument } from '../../document/document.model';
import { buildComponentModelContent } from './component-exporter';

describe('buildComponentModelContent', () => {
  it('exports component, construct, task, and entity headings in the agreed hierarchy', () => {
    const content = buildComponentModelContent(docFixture());

    expect(content.title).toBe('组件模型');
    expect(content.sections.map((section) => `${section.type}:${section.text || ''}`)).toEqual(expect.arrayContaining([
      'heading1:组件模型',
      'heading2:组件：仓储组件',
      'heading3:构件：仓单构件',
      'heading4:任务：查询仓单',
      'heading5:任务基本信息',
      'heading5:任务参数契约',
      'heading5:任务技术实现',
      'heading4:实体：仓单',
      'heading5:实体基本信息',
      'heading5:实体字段信息',
      'heading5:实体关系',
      'heading5:实体状态',
      'heading2:组件：结算组件',
      'heading3:构件：结算构件',
      'heading2:组件：未归属组件',
      'heading3:构件：未挂组件构件',
    ]));
  });

  it('keeps tasks and entities under the same construct without nesting them under each other', () => {
    const content = buildComponentModelContent(docFixture());
    const taskHeadingIndex = content.sections.findIndex((section) => section.type === 'heading4' && section.text === '任务：查询仓单');
    const entityHeadingIndex = content.sections.findIndex((section) => section.type === 'heading4' && section.text === '实体：仓单');
    const nextConstructIndex = content.sections.findIndex((section, index) => index > taskHeadingIndex && section.type === 'heading3');

    expect(taskHeadingIndex).toBeGreaterThan(-1);
    expect(entityHeadingIndex).toBeGreaterThan(taskHeadingIndex);
    expect(entityHeadingIndex).toBeLessThan(nextConstructIndex);

    const taskBasicTable = content.sections[taskHeadingIndex + 2];
    const inputTable = content.sections[taskHeadingIndex + 4];
    const entityBasicTable = content.sections[entityHeadingIndex + 2];
    const fieldTable = content.sections[entityHeadingIndex + 4];
    expect(taskBasicTable.rows).toContainEqual(['任务名称', '查询仓单']);
    expect(taskBasicTable.rows).toContainEqual(['类型', '查询']);
    expect(inputTable.headers?.[0]).toBe('输入参数');
    expect(inputTable.rows?.[0]).toContain('仓单编号');
    const implementationTable = content.sections[taskHeadingIndex + 7];
    expect(implementationTable.richTextColumns).toEqual([1]);
    expect(implementationTable.rows?.[2][1]).toContain('<strong>创建</strong>');
    expect(entityBasicTable.rows).toContainEqual(['实体名称', '仓单']);
    expect(entityBasicTable.rows).toContainEqual(['字段数量', '2']);
    expect(fieldTable.rows?.[0]).toContain('仓单编号');
    expect(fieldTable.rows?.[0]).toContain('字符');
  });

  it('adds relation and state image sections when graph ids are provided', () => {
    const content = buildComponentModelContent(docFixture(), {
      overview: 'component-export-overview',
      components: {
        'component-storage': 'component-export-component-component-storage',
        'component-settle': 'component-export-component-component-settle',
      },
      constructs: {
        'construct-receipt': 'component-export-construct-construct-receipt',
        'construct-settle': 'component-export-construct-construct-settle',
        'construct-free': 'component-export-construct-construct-free',
      },
      relations: {
        'construct-receipt': 'component-export-relation-construct-receipt',
        'construct-settle': 'component-export-relation-construct-settle',
        'construct-free': 'component-export-relation-construct-free',
      },
      states: { 'entity-receipt': 'component-export-state-entity-receipt' },
    });

    const images = content.sections.filter((section) => section.type === 'image');
    expect(images.map((section) => section.text)).toEqual([
      '组件地图',
      '组件地图：仓储组件',
      '构件截图：仓单构件',
      '实体关系图：仓单',
      '实体状态图：仓单',
      '组件地图：结算组件',
      '构件截图：结算构件',
      '实体关系图：结算单',
      '构件截图：未挂组件构件',
    ]);
    expect(images.map((section) => section.imageIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

function docFixture(): BlmDocument {
  return {
    meta: { domain: '测试' },
    roles: [],
    stages: [],
    stageFlowRefs: [],
    processes: [],
    entities: [
      {
        uid: 'entity-receipt',
        name: '仓单',
        fields: [
          { uid: 'field-code', name: '仓单编号', type: 'String' },
          { uid: 'field-status', name: '状态', type: 'Enum' },
        ],
        businessConstructUid: 'construct-receipt',
      } as any,
      { uid: 'entity-settle', name: '结算单', fields: [], businessConstructUids: ['construct-settle'] } as any,
    ],
    businessComponents: [
      { uid: 'component-storage', name: '仓储组件', kind: 'core', entityUids: [], taskDefinitionUids: [], constructUids: ['construct-receipt'] } as any,
      { uid: 'component-settle', name: '结算组件', kind: 'generic', entityUids: [], taskDefinitionUids: [] },
    ],
    businessConstructs: [
      { uid: 'construct-receipt', name: '仓单构件', businessComponentUid: 'component-storage' },
      { uid: 'construct-settle', name: '结算构件', businessComponentUid: 'component-settle' },
      { uid: 'construct-free', name: '未挂组件构件' },
    ],
    taskDefinitions: [
      {
        uid: 'task-query',
        name: '查询仓单',
        type: 'Query',
        target: '已实现',
        address: '/receipts',
        constructUid: 'construct-receipt',
        note: '<p><strong>创建</strong>仓单并校验状态</p><ul><li>记录审计日志</li></ul>',
        parameters: {
          inputs: [{ name: '仓单编号', type: 'String' }],
          outputs: [{ name: '仓单', type: 'Receipt' }],
        },
      },
      { uid: 'task-settle', name: '生成结算', type: 'Command', constructUid: 'construct-settle', parameters: { inputs: [], outputs: [] } },
    ],
    serviceGroups: [],
    services: [],
    terms: [],
    dataDictionaries: [],
    rules: [],
  };
}
