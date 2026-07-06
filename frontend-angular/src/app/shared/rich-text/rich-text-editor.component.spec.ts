import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RichTextEditorComponent } from './rich-text-editor.component';

describe('RichTextEditorComponent', () => {
  function createRichText(value: string, readonly = true): ComponentFixture<RichTextEditorComponent> {
    const fixture = TestBed.createComponent(RichTextEditorComponent);
    fixture.componentInstance.value = value;
    fixture.componentInstance.readonly = readonly;
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RichTextEditorComponent],
    }).compileComponents();
  });

  it('keeps list indentation compact for narrow cards in readonly and editing modes', () => {
    const readonlyFixture = createRichText('<ul><li>界面选择展示哪个平面图</li><li>查询服务返回列表</li></ul>', true);
    const editingFixture = createRichText('<ol><li>检查不通过</li><li>检查通过</li></ol>', false);

    const readonlyList = readonlyFixture.nativeElement.querySelector('.node-rich-content ul') as HTMLElement;
    const editingList = editingFixture.nativeElement.querySelector('.node-rich-content ol') as HTMLElement;
    const readonlyStyle = getComputedStyle(readonlyList);
    const editingStyle = getComputedStyle(editingList);

    expect(parseFloat(readonlyStyle.marginLeft)).toBeLessThanOrEqual(12);
    expect(parseFloat(readonlyStyle.paddingLeft)).toBeLessThanOrEqual(14);
    expect(parseFloat(editingStyle.marginLeft)).toBeLessThanOrEqual(12);
    expect(parseFloat(editingStyle.paddingLeft)).toBeLessThanOrEqual(14);
  });
});
