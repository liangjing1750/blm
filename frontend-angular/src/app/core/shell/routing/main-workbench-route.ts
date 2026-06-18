import { normalizeMainWorkbenchId } from '../../runtime/angular-runtime';

const WORKBENCH_TO_PATH: Record<string, string> = {
  panoramaWorkbench: '/panorama',
  processWorkbench: '/process',
  constructWorkbench: '/component',
  orchestrationWorkbench: '/orchestration',
  entity: '/entity',
  knowledge: '/knowledge',
  role: '/role',
  preview: '/preview',
};

const PATH_TO_WORKBENCH: Record<string, string> = {
  panorama: 'panoramaWorkbench',
  process: 'processWorkbench',
  component: 'constructWorkbench',
  orchestration: 'orchestrationWorkbench',
  entity: 'entity',
  knowledge: 'knowledge',
  role: 'role',
  preview: 'preview',
};

// 模块意图：把浏览器 URL 和 Angular runtime 的主工作台 ID 统一到一个纯查询层，避免 shell、tabbar 各自硬编码映射。
export function workbenchIdFromUrl(url: string): string {
  const firstSegment = stripQueryAndHash(url).split('/').filter(Boolean)[0] || 'panorama';
  return normalizeMainWorkbenchId(PATH_TO_WORKBENCH[firstSegment] || firstSegment);
}

export function routePathFromWorkbenchId(workbenchId: string): string {
  const normalized = normalizeMainWorkbenchId(workbenchId);
  return WORKBENCH_TO_PATH[normalized] || '/panorama';
}

function stripQueryAndHash(url: string): string {
  return String(url || '').split(/[?#]/)[0] || '/';
}
