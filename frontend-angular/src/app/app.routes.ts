import { Routes } from '@angular/router';
import { LegacyShellComponent } from './legacy-shell/legacy-shell.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'panorama' },
  { path: 'panorama', component: LegacyShellComponent },
  { path: 'process', component: LegacyShellComponent },
  { path: 'component', component: LegacyShellComponent },
  { path: 'orchestration', component: LegacyShellComponent },
  { path: 'entity', component: LegacyShellComponent },
  { path: 'knowledge', component: LegacyShellComponent },
  { path: 'role', component: LegacyShellComponent },
];
