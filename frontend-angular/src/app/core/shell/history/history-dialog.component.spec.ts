import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryDialogComponent } from './history-dialog.component';

describe('HistoryDialogComponent', () => {
  let fixture: ComponentFixture<HistoryDialogComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoryDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryDialogComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  it('shows the remote history submitter from lightweight snapshot metadata', () => {
    fixture.componentRef.setInput('activeTab', 'remote');
    fixture.componentRef.setInput('historyRows', [{
      id: '20260714120000',
      message: '更新至 v8',
      user: '张三',
      timestamp_label: '2026-07-14 12:00:00',
    }]);
    fixture.detectChanges();

    expect(host.textContent).toContain('更新至 v8');
    expect(host.textContent).toContain('提交者：张三');
  });
});
