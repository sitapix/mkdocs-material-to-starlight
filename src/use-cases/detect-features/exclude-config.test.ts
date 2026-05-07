import { describe, expect, it } from 'vitest';
import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';
import { applyExcludePatterns, extractExcludePatterns, isExcluded } from './exclude-config.js';

function plugin(name: string, options: Record<string, unknown> = {}): MkdocsPlugin {
  return { name, options };
}

describe('extractExcludePatterns', () => {
  it('returns empty arrays when no exclude plugin is present', () => {
    const out = extractExcludePatterns([plugin('search'), plugin('mike')]);
    expect(out).toEqual({ glob: [], regex: [] });
  });

  it('extracts glob and regex arrays from the exclude plugin', () => {
    const out = extractExcludePatterns([
      plugin('exclude', {
        glob: ['*.tmp', 'private/*.md'],
        regex: ['\\.draft\\.'],
      }),
    ]);
    expect(out.glob).toEqual(['*.tmp', 'private/*.md']);
    expect(out.regex).toEqual(['\\.draft\\.']);
  });

  it('ignores non-string entries in glob/regex lists', () => {
    const out = extractExcludePatterns([plugin('exclude', { glob: ['*.tmp', 42, null, '*.md'] })]);
    expect(out.glob).toEqual(['*.tmp', '*.md']);
  });

  it('returns empty when exclude options are absent', () => {
    const out = extractExcludePatterns([plugin('exclude')]);
    expect(out).toEqual({ glob: [], regex: [] });
  });
});

describe('isExcluded — glob patterns', () => {
  it('matches files with a star prefix anywhere', () => {
    const p = { glob: ['*.tmp'], regex: [] };
    expect(isExcluded('foo.tmp', p)).toBe(true);
    expect(isExcluded('dir/foo.tmp', p)).toBe(true);
    expect(isExcluded('foo.md', p)).toBe(false);
  });

  it('treats `/` as a literal in glob patterns (fnmatch behaviour)', () => {
    const p = { glob: ['private/*.md'], regex: [] };
    expect(isExcluded('private/secret.md', p)).toBe(true);
    // `*` happens to match `/` too under fnmatch — that's the documented
    // mkdocs-exclude behaviour, not a bug in the matcher.
    expect(isExcluded('private/sub/note.md', p)).toBe(true);
    expect(isExcluded('public/secret.md', p)).toBe(false);
  });

  it('supports `?` as a single-char wildcard', () => {
    const p = { glob: ['draft?.md'], regex: [] };
    expect(isExcluded('draft1.md', p)).toBe(true);
    expect(isExcluded('drafts.md', p)).toBe(true);
    expect(isExcluded('draft.md', p)).toBe(false);
    expect(isExcluded('draft12.md', p)).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    const p = { glob: ['notes.v1.md'], regex: [] };
    expect(isExcluded('notes.v1.md', p)).toBe(true);
    // A naïve `.` → `.` mapping would also match `notesxv1xmd`; verify it doesn't.
    expect(isExcluded('notesxv1xmd', p)).toBe(false);
  });
});

describe('isExcluded — regex patterns', () => {
  it('matches via JavaScript regex strings', () => {
    const p = { glob: [], regex: ['\\.draft\\.'] };
    expect(isExcluded('foo.draft.md', p)).toBe(true);
    expect(isExcluded('foo.md', p)).toBe(false);
  });

  it('silently skips invalid regex (does not throw)', () => {
    const p = { glob: [], regex: ['['] };
    expect(() => isExcluded('foo.md', p)).not.toThrow();
    expect(isExcluded('foo.md', p)).toBe(false);
  });
});

describe('applyExcludePatterns', () => {
  it('returns the input unchanged when no patterns are set', () => {
    const paths = ['a.md', 'b.md'];
    const out = applyExcludePatterns(paths, { glob: [], regex: [] });
    expect(out).toBe(paths); // same reference — fast path
  });

  it('filters out matching paths via glob', () => {
    const out = applyExcludePatterns(['a.md', 'b.tmp', 'c.md'], { glob: ['*.tmp'], regex: [] });
    expect(out).toEqual(['a.md', 'c.md']);
  });

  it('combines glob and regex matches (any match excludes)', () => {
    const out = applyExcludePatterns(['a.md', 'b.tmp', 'private/c.md', 'd.draft.md'], {
      glob: ['*.tmp', 'private/*'],
      regex: ['\\.draft\\.'],
    });
    expect(out).toEqual(['a.md']);
  });

  it('is idempotent — applying twice yields the same set', () => {
    const patterns = { glob: ['*.tmp'], regex: [] };
    const once = applyExcludePatterns(['a.md', 'b.tmp', 'c.md'], patterns);
    const twice = applyExcludePatterns(once, patterns);
    expect(twice).toEqual(once);
  });

  it('order of patterns does not affect the filtered set', () => {
    const inputs = ['a.md', 'b.tmp', 'private/c.md', 'd.draft.md'];
    const a = applyExcludePatterns(inputs, {
      glob: ['*.tmp', 'private/*'],
      regex: ['\\.draft\\.'],
    });
    const b = applyExcludePatterns(inputs, {
      glob: ['private/*', '*.tmp'],
      regex: ['\\.draft\\.'],
    });
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('preserves input order in the filtered output', () => {
    const out = applyExcludePatterns(['z.md', 'a.tmp', 'm.md', 'b.tmp', 'c.md'], {
      glob: ['*.tmp'],
      regex: [],
    });
    expect(out).toEqual(['z.md', 'm.md', 'c.md']);
  });
});

describe('isExcluded — pattern edge cases', () => {
  it('an empty glob string matches only the empty path', () => {
    const p = { glob: [''], regex: [] };
    expect(isExcluded('', p)).toBe(true);
    expect(isExcluded('foo', p)).toBe(false);
  });

  it('a literal star (no other content) matches every path including empty', () => {
    const p = { glob: ['*'], regex: [] };
    expect(isExcluded('', p)).toBe(true);
    expect(isExcluded('foo.md', p)).toBe(true);
    expect(isExcluded('a/b/c.md', p)).toBe(true);
  });

  it('escapes regex metas correctly so a literal "+" does not become a quantifier', () => {
    const p = { glob: ['v1+notes.md'], regex: [] };
    expect(isExcluded('v1+notes.md', p)).toBe(true);
    expect(isExcluded('v1notes.md', p)).toBe(false);
    expect(isExcluded('v11notes.md', p)).toBe(false);
  });

  it('escapes parentheses, braces, and brackets', () => {
    const p = { glob: ['(beta).md', '{tmp}.md', '[draft].md'], regex: [] };
    expect(isExcluded('(beta).md', p)).toBe(true);
    expect(isExcluded('{tmp}.md', p)).toBe(true);
    expect(isExcluded('[draft].md', p)).toBe(true);
    expect(isExcluded('beta.md', p)).toBe(false);
  });

  it('an empty regex matches every path (zero-length match)', () => {
    const p = { glob: [], regex: [''] };
    expect(isExcluded('', p)).toBe(true);
    expect(isExcluded('any/path.md', p)).toBe(true);
  });

  it("regex anchoring is the user's responsibility — partial matches still exclude", () => {
    const p = { glob: [], regex: ['draft'] };
    expect(isExcluded('foo-draft.md', p)).toBe(true);
    expect(isExcluded('drafty/x.md', p)).toBe(true);
    expect(isExcluded('clean.md', p)).toBe(false);
  });

  it('the empty pattern lists treat all paths as kept', () => {
    expect(isExcluded('foo.md', { glob: [], regex: [] })).toBe(false);
  });
});
