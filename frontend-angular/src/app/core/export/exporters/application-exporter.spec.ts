import { BlmDocument } from '../../document/document.model';
import { buildApplicationContent } from './application-exporter';

describe('buildApplicationContent', () => {
  it('exports services, interfaces, parameter tables, and orchestration details in the agreed hierarchy', () => {
    const content = buildApplicationContent(createDocument());

    expect(content.sections.map((section) => `${section.type}:${section.text || ''}`)).toEqual(expect.arrayContaining([
      'heading1:应用服务',
      'heading2:服务：仓单应用服务',
      'heading3:接口：创建仓单',
      'heading4:接口基本信息',
      'heading4:接口请求参数',
      'heading4:接口响应参数',
      'heading4:编排逻辑',
      'heading5:步骤1：执行创建',
      'heading3:接口：查询仓单',
    ]));

    const requestHeadingIndex = content.sections.findIndex((section) => section.type === 'heading4' && section.text === '接口请求参数');
    const requestTable = content.sections[requestHeadingIndex + 1];
    expect(requestTable.headers).toEqual(['参数', '类型', '必填', '说明']);
    expect(requestTable.columnWidths).toEqual([30, 16, 10, 44]);
    expect(requestTable.rows?.[0]).toEqual(['仓单编号', 'string', '必填', '业务编号']);

    const mappingHeadingIndex = content.sections.findIndex((section) => section.type === 'heading5' && section.text === '步骤1：执行创建');
    const mappingTable = content.sections[mappingHeadingIndex + 1];
    expect(mappingTable.headers).toEqual(['类型', '来源', '目标', '说明']);
    expect(mappingTable.columnWidths).toEqual([12, 36, 36, 16]);
    expect(mappingTable.rows).toContainEqual(['输入映射', 'request.仓单编号', 'input.仓单编号', '']);
    expect(mappingTable.rows).toContainEqual(['输出映射', 'output.结果', 'response.结果', '']);
  });
});

function createDocument(): BlmDocument {
  return {
    meta: { domain: '测试' },
    roles: [],
    stages: [],
    stageFlowRefs: [],
    processes: [],
    entities: [],
    businessComponents: [],
    businessConstructs: [],
    taskDefinitions: [{ uid: 'task-create', name: '创建仓单任务' }],
    serviceGroups: [{ uid: 'group-receipt', name: '仓单应用服务' }],
    services: [
      {
        uid: 'service-create',
        name: '创建仓单',
        serviceGroupUid: 'group-receipt',
        method: 'POST',
        path: '/receipts',
        desc: '创建仓单',
        requestParams: [{ name: '仓单编号', type: 'String', required: true, note: '业务编号' }],
        responseParams: [{ name: '结果', type: 'String', required: true, note: '' }],
        orchestration: {
          variables: [],
          steps: [{
            uid: 'step-create',
            name: '执行创建',
            stepAlias: 'create',
            taskDefinitionUid: 'task-create',
            inputMapping: [{ source: 'request.仓单编号', target: 'input.仓单编号' }],
            outputMapping: [{ source: 'output.结果', target: 'response.结果' }],
            order: 1,
          }],
          returnMapping: [],
        },
      },
      {
        uid: 'service-query',
        name: '查询仓单',
        serviceGroupUid: 'group-receipt',
        method: 'GET',
        path: '/receipts/{id}',
        requestParams: [],
        responseParams: [],
      },
    ],
    terms: [],
    dataDictionaries: [],
    rules: [],
  };
}
