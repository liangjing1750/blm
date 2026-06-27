import { Routes } from '@angular/router';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'panorama' },
  { path: 'panorama', component: ShellComponent },
  { path: 'process', component: ShellComponent },
  { path: 'component', component: ShellComponent },
  { path: 'application', component: ShellComponent },
  { path: 'preview', component: ShellComponent },
  { path: 'orchestration', component: ShellComponent },
  { path: 'entity', component: ShellComponent },
  { path: 'knowledge', component: ShellComponent },
  { path: 'role', component: ShellComponent },
  { path: 'manual', component: ShellComponent },
  { path: 'feedback', component: ShellComponent },
  // 模块意图：刷新浏览器或旧入口写入未知路径时，仍回到 Angular 壳层，避免出现 not found 空页。
  // 关键流程：后端已把非 API 未命中文件 fallback 到 index.html，这里承接前端路由兜底。
  // 边界细节：未知路径不保留语义，统一回全景入口，具体文档状态仍由 Angular runtime 恢复。
  { path: '**', redirectTo: 'panorama' },
];
