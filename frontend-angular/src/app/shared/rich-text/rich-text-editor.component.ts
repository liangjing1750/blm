import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { plainTextToStructuredRichHtml, richTextValueFromEditor, sanitizeRichTextHtml } from './rich-text-utils';

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rich-text-editor.component.html',
  styleUrl: './rich-text-editor.component.scss',
})
export class RichTextEditorComponent implements AfterViewInit, OnChanges {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() value = '';
  @Input() readonly = false;
  @Input() testIdPrefix = 'rich-text';
  @Output() readonly valueChange = new EventEmitter<string>();
  @ViewChild('editor') private readonly editorRef?: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    this.syncExternalValue(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      this.syncExternalValue(false);
    }
  }

  protected html(): string {
    return sanitizeRichTextHtml(this.value);
  }

  protected emitValue(): void {
    this.valueChange.emit(richTextValueFromEditor(this.editorRef?.nativeElement || null));
  }

  protected focusAtEnd(editor: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  protected handlePaste(event: ClipboardEvent): void {
    if (this.readonly) return;
    event.preventDefault();
    const editor = this.editorRef?.nativeElement;
    const text = event.clipboardData?.getData('text/plain') || '';
    const html = plainTextToStructuredRichHtml(text);
    document.execCommand(html ? 'insertHTML' : 'insertText', false, html || text);
    this.emitValue();
    editor?.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private savedRange: Range | null = null;

  private saveSelection(): Range | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const editor = this.editorRef?.nativeElement;
    if (!editor || !editor.contains(range.commonAncestorContainer)) return null;
    return range.cloneRange();
  }

  private restoreSelection(range: Range | null): void {
    if (!range) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  protected apply(command: 'bold' | 'ordered' | 'unordered' | 'indent' | 'outdent' | 'secondOrdered'): void {
    if (this.readonly) return;
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;
    const saved = this.saveSelection();
    editor.focus();
    if (saved) this.restoreSelection(saved);
    if (command === 'secondOrdered') {
      this.applySecondLevelOrderedList(editor);
      return;
    }
    if (command === 'indent' && this.indentListItem(editor)) {
      this.emitValue();
      return;
    }
    document.execCommand(command === 'bold'
      ? 'bold'
      : command === 'ordered'
        ? 'insertOrderedList'
        : command === 'unordered'
          ? 'insertUnorderedList'
          : command, false);
    this.emitValue();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (this.readonly) return;
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;
    const key = String(event.key || '').toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === 'b') {
        event.preventDefault();
        this.apply('bold');
        return;
      }
      if (key === '0') {
        event.preventDefault();
        this.apply('unordered');
        return;
      }
      if (key === '1') {
        event.preventDefault();
        this.apply('ordered');
        return;
      }
      if (key === '2') {
        event.preventDefault();
        this.applySecondLevelOrderedList(editor);
        return;
      }
    }
    if (key === 'tab') {
      event.preventDefault();
      if (event.shiftKey) {
        this.apply('outdent');
        return;
      }
      this.apply(this.activeListItem(editor) ? 'indent' : 'unordered');
    }
  }

  private applySecondLevelOrderedList(editor: HTMLElement): void {
    editor.focus();
    if (this.indentListItem(editor)) {
      this.emitValue();
      return;
    }
    document.execCommand('insertOrderedList', false);
    this.emitValue();
  }

  private activeListItem(editor: HTMLElement): HTMLLIElement | null {
    const selection = window.getSelection?.();
    const anchor = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode as Element
      : selection?.anchorNode?.parentElement;
    const item = anchor?.closest?.('li') as HTMLLIElement | null;
    return item && editor.contains(item) ? item : null;
  }

  private indentListItem(editor: HTMLElement): boolean {
    const item = this.activeListItem(editor);
    const previous = item?.previousElementSibling;
    if (!item || !previous || previous.tagName !== 'LI') return false;
    let nested = Array.from(previous.children).find((child) => child.tagName === 'OL');
    if (!nested) {
      nested = document.createElement('ol');
      previous.appendChild(nested);
    }
    nested.appendChild(item);
    this.focusAtEnd(item);
    return true;
  }

  private syncExternalValue(force: boolean): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) return;
    if (!force && document.activeElement === editor) return;
    const next = sanitizeRichTextHtml(this.value);
    if (editor.innerHTML !== next) editor.innerHTML = next;
  }
}
