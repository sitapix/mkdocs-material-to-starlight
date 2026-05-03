import { describe, expect, it } from 'vitest';
import { mapAdmonitionToAside } from './admonition-mapping.js';
import type { AdmonitionType } from '../../domain/syntax/admonition-type.js';

describe('mapAdmonitionToAside', () => {
  it('maps each Material type to a Starlight aside descriptor', () => {
    expect(mapAdmonitionToAside('note')).toEqual({ asideType: 'note' });
    expect(mapAdmonitionToAside('tip')).toEqual({ asideType: 'tip' });
    expect(mapAdmonitionToAside('warning')).toEqual({ asideType: 'caution' });
    expect(mapAdmonitionToAside('failure')).toEqual({ asideType: 'danger' });
    expect(mapAdmonitionToAside('danger')).toEqual({ asideType: 'danger' });
  });

  it('attaches an icon hint for Material types that have no direct Starlight type', () => {
    expect(mapAdmonitionToAside('info')).toEqual({
      asideType: 'note',
      iconHint: 'information',
    });
    expect(mapAdmonitionToAside('success')).toEqual({
      asideType: 'tip',
      iconHint: 'approve-check',
    });
    expect(mapAdmonitionToAside('abstract')).toEqual({
      asideType: 'note',
      iconHint: 'document',
    });
    expect(mapAdmonitionToAside('question')).toEqual({
      asideType: 'note',
      iconHint: 'comment-alt',
    });
    expect(mapAdmonitionToAside('bug')).toEqual({
      asideType: 'danger',
      iconHint: 'bars',
    });
    expect(mapAdmonitionToAside('example')).toEqual({
      asideType: 'note',
      iconHint: 'puzzle',
    });
  });

  it('routes "quote" to a renderAsBlockquote signal rather than an aside', () => {
    expect(mapAdmonitionToAside('quote')).toEqual({ renderAsBlockquote: true });
  });

  it('is total over the AdmonitionType union — every input has a defined output', () => {
    const all: ReadonlyArray<AdmonitionType> = [
      'note',
      'abstract',
      'info',
      'tip',
      'success',
      'question',
      'warning',
      'failure',
      'danger',
      'bug',
      'example',
      'quote',
    ];
    for (const t of all) {
      const result = mapAdmonitionToAside(t);
      expect(result).toBeTypeOf('object');
      expect(result).not.toBeNull();
    }
  });
});
