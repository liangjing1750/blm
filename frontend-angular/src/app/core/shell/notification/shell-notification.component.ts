import { Component, Input } from '@angular/core';

export type ShellNotificationKind = 'success' | 'info' | 'warning' | 'error';

@Component({
  selector: 'app-shell-notification',
  templateUrl: './shell-notification.component.html',
  styleUrl: './shell-notification.component.scss',
})
export class ShellNotificationComponent {
  // Module intent: reusable non-blocking feedback for short shell actions.
  // Key flow: shell callers pass message and kind; the component owns placement, tone, and accessible status markup.
  // Boundary detail: lifecycle timing stays outside so this component remains presentational like WaitDialogComponent.
  @Input() message = '';
  @Input() kind: ShellNotificationKind = 'info';
}
