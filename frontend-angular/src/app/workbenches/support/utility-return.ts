import { Router } from '@angular/router';
import { goBackAngularUtilityWorkbench } from '../../core/runtime/angular-runtime';
import { routePathFromWorkbenchId } from '../../core/shell/routing/main-workbench-route';

export function requestUtilityReturn(router: Router): void {
  const target = goBackAngularUtilityWorkbench('panoramaWorkbench');
  void router.navigateByUrl(routePathFromWorkbenchId(target));
}
