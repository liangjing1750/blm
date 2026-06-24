# styles.scss classification

Generated: 2026-06-24T14:56:42.110Z

Scope: frontend-angular/src/styles.scss after shared-style extraction and first component-style migration.

## Summary

| category | meaning | count |
|---|---|---:|
| still-used | selector token is referenced by Angular templates, TS, or component styles | 1004 |
| legacy-compat-selector | no direct Angular component hit, but selector belongs to global shell/modal/old compatibility surface | 165 |
| suspected-dead | no direct hit and no compatibility hint; requires visual/regression check before deletion | 1108 |

Full list: docs/refactor/styles-classification.csv

## Still Used

- count: 1004

| line | selector | evidence |
|---:|---|---|
| 1 | `#toolbar` | frontend-angular/src/app/app.spec.ts; frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 11 | `.toolbar-left` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 12 | `.toolbar-right` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 13 | `.brand-mark` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 22 | `.logo` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 24 | `.product-version` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 32 | `.file-name` | frontend-angular/src/app/app.spec.ts; frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 34 | `.modified-badge` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html |
| 48 | `.modified-badge-row` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html |
| 58 | `.modified-badge-row.local` | frontend-angular/src/app/app.spec.ts; frontend-angular/src/app/core/collaboration/collaboration.service.spec.ts; frontend-angular/src/app/core/collaboration/collaboration.service.ts |
| 63 | `.modified-badge-row.remote` | frontend-angular/src/app/app.spec.ts; frontend-angular/src/app/core/collaboration/collaboration.service.spec.ts; frontend-angular/src/app/core/shell/history/history-dialog.component.html |
| 68 | `.modified-badge-dot` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html |
| 75 | `.modified-badge.syncing` | frontend-angular/src/app/app.spec.ts; frontend-angular/src/app/core/collaboration/collaboration.service.spec.ts; frontend-angular/src/app/core/collaboration/collaboration.service.ts |
| 78 | `.collab-status` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 92 | `.collab-status:hover` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 95 | `.collab-status[data-users]::after` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 118 | `.collab-status[data-users]:hover::after` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 122 | `.collab-status.connected` | frontend-angular/src/app/core/collaboration/collaboration.service.spec.ts; frontend-angular/src/app/core/collaboration/collaboration.service.ts; frontend-angular/src/app/core/runtime/angular-runtime.ts |
| 127 | `.collab-status.offline` | frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |
| 152 | `.user-account-button.empty` | frontend-angular/src/app/core/shell/sidebar/sidebar-directory.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.html; frontend-angular/src/app/legacy-shell/legacy-shell.component.scss |

## Legacy Compatibility Selectors

- count: 165

| line | selector | evidence |
|---:|---|---|
| 157 | `.user-modal-shell` | - |
| 167 | `.collab-diagnostics-content` | - |
| 173 | `.collab-diagnostic-grid` | - |
| 178 | `.collab-diagnostic-grid > div` | - |
| 185 | `.collab-diagnostic-grid span` | - |
| 192 | `.collab-diagnostic-grid strong` | - |
| 200 | `.collab-diagnostic-grid > div:first-child` | - |
| 203 | `.collab-diagnostic-error` | - |
| 210 | `.collab-diagnostic-error span` | - |
| 216 | `.collab-diagnostic-error strong` | - |
| 222 | `.collab-diagnostic-section h4` | - |
| 227 | `.collab-diagnostic-users` | - |
| 232 | `.collab-diagnostic-user` | - |
| 244 | `.collab-diagnostic-user strong` | - |
| 250 | `.collab-diagnostic-user span` | - |
| 253 | `.collab-diagnostic-raw` | - |
| 258 | `.collab-diagnostic-raw summary` | - |
| 265 | `.collab-diagnostic-raw pre` | - |
| 276 | `.collab-diagnostic-grid` | - |
| 279 | `.collab-diagnostic-grid > div:first-child` | - |

## Suspected Dead Selectors

- count: 1108

| line | selector | evidence |
|---:|---|---|
| 132 | `.user-account-button` | - |
| 147 | `.user-account-button:hover` | - |
| 283 | `.user-form-field` | - |
| 288 | `.user-form-field span` | - |
| 293 | `.user-form-field input` | - |
| 299 | `.user-session-note` | - |
| 417 | `.readonly-alert` | - |
| 429 | `.readonly-alert strong` | - |
| 450 | `.locator-menu` | - |
| 460 | `.locator-menu button` | - |
| 472 | `.locator-menu button:hover` | - |
| 653 | `.editable-id` | - |
| 658 | `.editable-id:hover` | - |
| 659 | `.id-edit-input` | - |
| 723 | `.live-diagram-wrap` | - |
| 774 | `.data-state-select-inline` | - |
| 783 | `.data-state-select-label` | - |
| 787 | `.data-state-select-inline select` | - |
| 801 | `.data-state-zoom-controls` | - |
| 806 | `.data-state-zoom-reset` | - |

## Migration Notes

- Shared layer exists under `frontend-angular/src/styles/shared/` for base variables, scroll frame, form controls, buttons, and modal shells.
- Manual and feedback component-owned global styles have been removed from `styles.scss`; their component SCSS files are now the local source of truth.
- `.manual-shell` rules remain global because they target the outer shell, not the manual component subtree.
- Large process-flow and process-node workbench blocks remain in `styles.scss`; direct migration was verified to exceed Angular component style budgets, so they need subview-level splitting before migration.