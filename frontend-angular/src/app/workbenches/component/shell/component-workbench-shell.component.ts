import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ComponentWorkbenchComponent } from '../component-workbench';

@Component({
  selector: 'app-component-workbench-shell',
  standalone: true,
  imports: [CommonModule, ComponentWorkbenchComponent],
  templateUrl: './component-workbench-shell.component.html',
  styleUrl: './component-workbench-shell.component.scss',
})
export class ComponentWorkbenchShellComponent {}
