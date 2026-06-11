import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { LegacyShellComponent } from './legacy-shell/legacy-shell.component';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, LegacyShellComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the legacy BLM toolbar through the Angular shell', () => {
    const fixture = TestBed.createComponent(LegacyShellComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#toolbar')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="toolbar-new-button"]')?.textContent).toContain('新建');
  });
});
