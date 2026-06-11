import { AfterViewInit, Component, OnDestroy, ViewEncapsulation } from '@angular/core';
import { LegacyBridge } from '../core/legacy/legacy-bridge';
import { resetLegacyRuntimeForTests } from '../legacy-runtime/legacy-runtime.bootstrap';

export const TRANSITION_SHELL = 'legacy-shell';

@Component({
  selector: 'app-legacy-shell',
  templateUrl: './legacy-shell.component.html',
  styleUrl: './legacy-shell.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class LegacyShellComponent implements AfterViewInit, OnDestroy {
  private disposed = false;

  constructor(private readonly legacyBridge: LegacyBridge) {}

  ngAfterViewInit(): void {
    void this.legacyBridge.mount().then(() => {
      if (this.disposed) {
        return;
      }
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
  }
}

export { resetLegacyRuntimeForTests };
