"""
历史数据迁移：为每个流程节点创建默认应用服务

模块意图：
  遍历 workspace 中所有文档，为每个流程节点生成默认应用服务：
  {节点名称}应用服务，关联该节点的任务定义。

关键流程：
  1. 列出所有文档
  2. 逐个加载、检查是否已有 services 字段
  3. 遍历进程→节点，若节点无关联服务则创建默认服务
  4. 通过 collab snapshot 保存

边界细节：
  - 已有 services 的文档跳过
  - 节点名称为空时使用流程名_节点序号
  - 默认方法为 POST，路径为空
"""
import json
import uuid
import urllib.request
import urllib.parse

BASE_URL = 'http://localhost:8081'


def list_documents():
    resp = urllib.request.urlopen(f'{BASE_URL}/api/files')
    return json.loads(resp.read())


def load_document(name):
    encoded = urllib.parse.quote(name, safe='')
    resp = urllib.request.urlopen(f'{BASE_URL}/api/load/{encoded}')
    return json.loads(resp.read())


def save_document(name, document):
    body = json.dumps({
        'name': name,
        'document': document,
        'baseSeq': 0,
        'baseDocumentHash': '',
        'documentHash': '',
        'recoveryMode': False,
        'user': {'name': 'migration', 'id': 'migration'},
    }).encode('utf-8')
    req = urllib.request.Request(f'{BASE_URL}/api/collab/snapshot', data=body,
                                 headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


def new_uid():
    return str(uuid.uuid4()).replace('-', '')[:24]


def migrate_document(fname):
    data = load_document(fname)
    doc = data.get('document', data)

    # 已有 services 则跳过
    if 'services' in doc or 'applicationServices' in doc:
        return f'跳过（已有 services）'

    processes = doc.get('processes', [])
    services = []
    task_defs = {str(td.get('uid', td.get('id', ''))): td for td in doc.get('taskDefinitions', [])}
    migrated_count = 0

    for proc in processes:
        proc_name = str(proc.get('name', '未命名流程')).strip()
        proc_uid = str(proc.get('uid', proc.get('id', ''))).strip()
        nodes = proc.get('nodes', proc.get('tasks', []))
        for ni, node in enumerate(nodes):
            node_name = str(node.get('name', f'节点{ni + 1}')).strip()
            node_uid = str(node.get('uid', node.get('id', ''))).strip()

            td_uid = str(node.get('taskDefinitionUid', '')).strip()
            task_def = task_defs.get(td_uid) if td_uid else None
            task_name = str(task_def.get('name', '')) if task_def else ''

            service_name = f'{node_name}应用服务'
            # 避免重名
            existing = [s for s in services if s['name'] == service_name]
            if existing:
                continue

            services.append({
                'uid': new_uid(),
                'name': service_name,
                'method': 'POST',
                'path': '',
                'desc': f'由迁移脚本自动生成（{proc_name} / {node_name}）',
                'taskDefinitionUids': [td_uid] if td_uid else [],
                'nodeRefs': [node_uid] if node_uid else [],
            })
            migrated_count += 1

    if not services:
        return '无节点需要迁移'

    doc['services'] = services
    result = save_document(fname, doc)
    return f'迁移 {migrated_count} 个服务  seq={result.get("seq")}  ok={result.get("ok")}'


def main():
    files = list_documents()
    print(f'共 {len(files)} 个文档\n')
    for fname in sorted(files):
        try:
            msg = migrate_document(fname)
            print(f'  {fname}: {msg}')
        except Exception as e:
            print(f'  {fname}: 错误 - {e}')


if __name__ == '__main__':
    main()
