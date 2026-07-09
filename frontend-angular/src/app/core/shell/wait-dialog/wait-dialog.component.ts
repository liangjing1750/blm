import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-wait-dialog',
  templateUrl: './wait-dialog.component.html',
  styleUrl: './wait-dialog.component.scss',
})
export class WaitDialogComponent {
  // Module intent: reusable modal wait indicator for operations that need to block the current overlay.
  // Key flow: callers provide title, description, and optional progress (0-100) with remaining seconds.
  @Input() title = '';
  @Input() description = '';
  @Input() progress = -1;       // 0-100, -1 = indeterminate
  @Input() remainingSeconds = 0;
}
