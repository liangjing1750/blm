export type WorkbenchMigrationStatus = 'legacy' | 'hybrid' | 'angular';

export interface WorkbenchMigrationRecord {
  id: 'panorama' | 'process' | 'component' | 'orchestration' | 'entity' | 'knowledge' | 'role';
  label: string;
  status: WorkbenchMigrationStatus;
  owner: string;
}

export const WORKBENCH_MIGRATION_STATUS: WorkbenchMigrationRecord[] = [
  { id: 'panorama', label: '全景工作台', status: 'legacy', owner: '总负责人 / 产品经理' },
  { id: 'process', label: '流程工作台', status: 'legacy', owner: '产品经理' },
  { id: 'component', label: '构件工作台', status: 'legacy', owner: '后端研发' },
  { id: 'orchestration', label: '应用编排台', status: 'legacy', owner: '技术经理 / 前端研发' },
  { id: 'entity', label: '实体工作台', status: 'legacy', owner: '后端研发' },
  { id: 'knowledge', label: '知识工作台', status: 'hybrid', owner: '产品经理' },
  { id: 'role', label: '角色工作台', status: 'hybrid', owner: '总负责人 / 产品经理' },
];
