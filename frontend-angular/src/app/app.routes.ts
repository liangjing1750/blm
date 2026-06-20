import { Routes } from '@angular/router';
import { LegacyShellComponent } from './legacy-shell/legacy-shell.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'panorama' },
  { path: 'panorama', component: LegacyShellComponent },
  { path: 'process', component: LegacyShellComponent },
  { path: 'component', component: LegacyShellComponent },
  { path: 'preview', component: LegacyShellComponent },
  { path: 'orchestration', component: LegacyShellComponent },
  { path: 'entity', component: LegacyShellComponent },
  { path: 'knowledge', component: LegacyShellComponent },
  { path: 'role', component: LegacyShellComponent },
  { path: 'manual', component: LegacyShellComponent },
  { path: 'feedback', component: LegacyShellComponent },
  // 模块意图：刷新浏览器或旧入口写入未知路径时，仍回到 Angular 壳层，避免出现 not found 空页。
  // 关键流程：后端已把非 API 未命中文件 fallback 到 index.html，这里承接前端路由兜底。
  // 边界细节：未知路径不保留语义，统一回全景入口，具体文档状态仍由 legacy runtime 恢复。
  { path: '**', redirectTo: 'panorama' },
];
