import { describe, expect, it } from 'vitest';
import { markFrontmatterDraft } from './frontmatter-draft.js';

describe('markFrontmatterDraft', () => {
  it('creates frontmatter when the source has none', () => {
    expect(markFrontmatterDraft('# Preview\n')).toBe('---\ndraft: true\n---\n\n# Preview\n');
  });

  it('adds draft to existing frontmatter and is idempotent', () => {
    const once = markFrontmatterDraft('---\ntitle: Preview\n---\n\nBody\n');
    expect(once).toContain('---\ndraft: true\ntitle: Preview\n---');
    expect(markFrontmatterDraft(once)).toBe(once);
  });

  it('overrides an existing false value for a path matched by draft_docs', () => {
    expect(markFrontmatterDraft('---\ntitle: Preview\ndraft: false\n---\n')).toContain(
      'draft: true',
    );
  });

  it('preserves CRLF newlines', () => {
    expect(markFrontmatterDraft('---\r\ntitle: Preview\r\n---\r\n')).toContain(
      '---\r\ndraft: true\r\ntitle:',
    );
  });
});
