import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-wait-dialog',
  templateUrl: './wait-dialog.component.html',
  styleUrl: './wait-dialog.component.scss',
})
export class WaitDialogComponent {
  // Module intent: reusable modal wait indicator for operations that need to block the current overlay.
  // Key flow: callers provide only content; sizing, spinner, and progress affordance stay consistent.
  // Boundary detail: this component has no side effects and does not know which operation is running.
  @Input() title = '';
  @Input() description = '';
}
