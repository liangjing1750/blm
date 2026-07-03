import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, FeedbackDocument } from '../../../core/api/api.service';
import { FeedbackWorkbenchComponent } from './feedback-workbench.component';

describe('FeedbackWorkbenchComponent', () => {
  let fixture: ComponentFixture<FeedbackWorkbenchComponent>;
  let host: HTMLElement;
  let api: {
    feedback: ReturnType<typeof vi.fn>;
    saveFeedback: ReturnType<typeof vi.fn>;
    uploadFeedbackAttachment: ReturnType<typeof vi.fn>;
    feedbackAttachmentUrl: ReturnType<typeof vi.fn>;
  };

  const initialDoc: FeedbackDocument = {
    items: [{
      uid: 'fb-1',
      title: '发送失败',
      category: '体验改进',
      status: '待处理',
      author: 'agent',
      createdAt: '2026-07-03T09:00:00',
      messages: [],
    }],
  };
  const firstItem = initialDoc.items![0];

  async function waitForPendingAttachment(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await fixture.whenStable();
      fixture.detectChanges();
      if (host.querySelector('[data-testid="feedback-pending-attachment"]')) return;
    }
  }

  beforeEach(async () => {
    api = {
      feedback: vi.fn().mockResolvedValue(structuredClone(initialDoc)),
      saveFeedback: vi.fn().mockImplementation(async (payload: any) => {
        if (payload.action === 'reply') {
          return {
            items: [{
              ...firstItem,
              messages: [{ uid: 'msg-1', floor: 1, author: 'agent', content: payload.data.reply }],
            }],
          };
        }
        return structuredClone(initialDoc);
      }),
      uploadFeedbackAttachment: vi.fn().mockResolvedValue({
        items: [{
          ...firstItem,
          messages: [{
            uid: 'msg-1',
            floor: 1,
            author: 'agent',
            content: '补充截图',
            attachments: [{ uid: 'att-1', filename: 'clipboard-image.png', contentType: 'image/png', size: 4 }],
          }],
        }],
      }),
      feedbackAttachmentUrl: vi.fn().mockReturnValue('/api/feedback/attachment/fb-1/att-1'),
    };

    await TestBed.configureTestingModule({
      imports: [FeedbackWorkbenchComponent],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedbackWorkbenchComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('sends replies with the legacy feedback payload shape', async () => {
    const textarea = host.querySelector<HTMLTextAreaElement>('[data-testid="feedback-reply-textarea"]')!;
    textarea.value = '补充截图';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="feedback-send-reply"]')?.click();
    await fixture.whenStable();

    expect(api.saveFeedback).toHaveBeenCalledWith(expect.objectContaining({
      action: 'reply',
      uid: 'fb-1',
      data: { reply: '补充截图', status: '' },
    }));
  });

  it('queues pasted image attachments and uploads them after the reply is sent', async () => {
    const file = new File(['fake'], 'clipboard-image.png', { type: 'image/png' });
    const item = { kind: 'file', getAsFile: () => file };
    const event = new Event('paste', { bubbles: true });
    Object.defineProperty(event, 'clipboardData', { value: { items: [item] } });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    const composer = host.querySelector<HTMLElement>('[data-testid="feedback-reply-composer"]')!;
    composer.dispatchEvent(event);
    await waitForPendingAttachment();

    expect(preventDefault).toHaveBeenCalled();
    expect(host.querySelector('[data-testid="feedback-pending-attachment"]')?.textContent).toContain('clipboard-image.png');

    const textarea = host.querySelector<HTMLTextAreaElement>('[data-testid="feedback-reply-textarea"]')!;
    textarea.value = '补充截图';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    host.querySelector<HTMLButtonElement>('[data-testid="feedback-send-reply"]')?.click();
    await fixture.whenStable();

    expect(api.uploadFeedbackAttachment).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'fb-1',
      messageUid: 'msg-1',
      filename: 'clipboard-image.png',
      contentType: 'image/png',
      dataBase64: expect.any(String),
    }));
  });
});
