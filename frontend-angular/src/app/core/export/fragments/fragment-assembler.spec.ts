import { describe, expect, it } from 'vitest';
import { FragmentAssembler } from './fragment-assembler';
import { ViewContent } from '../exporters/view-exporter';

describe('FragmentAssembler', () => {
  it('remaps image indexes when multiple exported fragments are merged', () => {
    const assembler = new FragmentAssembler();
    const intro: ViewContent = {
      title: 'Intro',
      sections: [
        { type: 'heading1', text: '1.Intro' },
        { type: 'image', text: 'Panorama', imageIndex: 0 },
        { type: 'image', text: 'Role', imageIndex: 1 },
      ],
    };
    const valueStream: ViewContent = {
      title: 'Value Stream',
      sections: [
        { type: 'image', text: 'Value Stream', imageIndex: 0 },
        { type: 'heading1', text: '2.Value Stream' },
        { type: 'image', text: 'Stage', imageIndex: 1 },
      ],
    };

    const merged = assembler.mergeContents(
      [intro, valueStream],
      [[new Uint8Array([1]), new Uint8Array([2])], [new Uint8Array([3]), new Uint8Array([4])]],
    );

    expect(merged.screenshots).toHaveLength(4);
    expect(merged.content.sections.filter((section) => section.type === 'image')).toEqual([
      { type: 'image', text: 'Panorama', imageIndex: 0 },
      { type: 'image', text: 'Role', imageIndex: 1 },
      { type: 'image', text: 'Value Stream', imageIndex: 2 },
      { type: 'image', text: 'Stage', imageIndex: 3 },
    ]);
    expect(assembler.assembleAllMarkdown([intro, valueStream], [[new Uint8Array([1]), new Uint8Array([2])], [new Uint8Array([3]), new Uint8Array([4])]]))
      .toContain('screenshot-4.png');
  });
});
