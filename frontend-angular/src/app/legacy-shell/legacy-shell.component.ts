import { AfterViewInit, Component, OnDestroy, ViewEncapsulation } from '@angular/core';
import { loadLegacyRuntime, resetLegacyRuntimeForTests } from '../legacy-runtime/legacy-runtime.bootstrap';

@Component({
  selector: 'app-legacy-shell',
  templateUrl: './legacy-shell.component.html',
  styleUrl: './legacy-shell.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class LegacyShellComponent implements AfterViewInit, OnDestroy {
  private disposed = false;

  ngAfterViewInit(): void {
    void loadLegacyRuntime().then(() => {
      if (this.disposed) {
        return;
      }
      const legacyApp = (window as unknown as { App?: { init?: () => void } }).App;
      legacyApp?.init?.();
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
  }
}

export { resetLegacyRuntimeForTests };
