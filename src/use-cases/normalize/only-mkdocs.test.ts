import { describe, expect, it } from 'vitest';
import { normalizeOnlyMkdocs } from './only-mkdocs.js';

describe('normalizeOnlyMkdocs', () => {
  it('returns source unchanged when no markers', () => {
    expect(normalizeOnlyMkdocs('Plain text\n')).toBe('Plain text\n');
  });

  it('strips only-mkdocs marker pair, keeping wrapped content', () => {
    const out = normalizeOnlyMkdocs(
      '<!-- only-mkdocs -->\n\nDocs-only content.\n\n<!-- /only-mkdocs -->\n',
    );
    expect(out).toContain('Docs-only content.');
    expect(out).not.toContain('only-mkdocs');
  });

  it('drops content wrapped in only-pypi markers', () => {
    const out = normalizeOnlyMkdocs(
      'before\n<!-- only-pypi -->\npypi only\n<!-- /only-pypi -->\nafter\n',
    );
    expect(out).not.toContain('pypi only');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('handles both pairs in same document', () => {
    const out = normalizeOnlyMkdocs(
      [
        '<!-- only-mkdocs -->',
        'docs content',
        '<!-- /only-mkdocs -->',
        '<!-- only-pypi -->',
        'pypi content',
        '<!-- /only-pypi -->',
        '',
      ].join('\n'),
    );
    expect(out).toContain('docs content');
    expect(out).not.toContain('pypi content');
  });

  it('idempotent', () => {
    const src = '<!-- only-mkdocs -->\nx\n<!-- /only-mkdocs -->\n';
    const first = normalizeOnlyMkdocs(src);
    expect(normalizeOnlyMkdocs(first)).toBe(first);
  });
});
