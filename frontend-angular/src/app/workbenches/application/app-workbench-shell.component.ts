import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ApplicationWorkbenchComponent } from './app-workbench';

@Component({
  selector: 'app-application-workbench-shell',
  standalone: true,
  imports: [CommonModule, ApplicationWorkbenchComponent],
  template: '<app-application-workbench />',
})
export class ApplicationWorkbenchShellComponent {}
