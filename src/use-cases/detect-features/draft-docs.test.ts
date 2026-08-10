import { describe, expect, it } from 'vitest';
import { createDraftDocsMatcher, extractDraftDocsPatterns } from './draft-docs.js';

describe('draft_docs', () => {
  it('extracts multiline strings and ignores blank lines', () => {
    expect(
      extractDraftDocsPatterns({
        draft_docs: 'drafts/\n\n_unpublished.md\n!/keep_unpublished.md\n',
      }),
    ).toEqual(['drafts/', '_unpublished.md', '!/keep_unpublished.md']);
  });

  it('also tolerates a YAML string array', () => {
    expect(extractDraftDocsPatterns({ draft_docs: ['drafts/', '*.preview.md', 42] })).toEqual([
      'drafts/',
      '*.preview.md',
    ]);
  });

  it('matches gitignore directory, basename, anchor, and negation semantics', () => {
    const matches = createDraftDocsMatcher([
      'drafts/',
      '_unpublished.md',
      '*.preview.md',
      '!/keep.preview.md',
    ]);
    expect(matches('drafts/intro.md')).toBe(true);
    expect(matches('guide/drafts/intro.md')).toBe(true);
    expect(matches('guide/_unpublished.md')).toBe(true);
    expect(matches('guide/demo.preview.md')).toBe(true);
    expect(matches('keep.preview.md')).toBe(false);
    expect(matches('guide.md')).toBe(false);
  });

  it('returns a no-op matcher when no patterns exist', () => {
    expect(createDraftDocsMatcher([])('draft.md')).toBe(false);
  });
});
