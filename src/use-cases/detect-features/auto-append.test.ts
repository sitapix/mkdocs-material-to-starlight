import { describe, expect, it } from 'vitest';
import { extractAutoAppend } from './auto-append.js';
import type { MkdocsMarkdownExtension } from '../../domain/config/mkdocs-config.js';

function ext(name: string, options: Record<string, unknown> = {}): MkdocsMarkdownExtension {
  return { name, options };
}

describe('extractAutoAppend', () => {
  it('returns an empty list when no markdown extensions are configured', () => {
    expect(extractAutoAppend([])).toEqual([]);
  });

  it('returns an empty list when pymdownx.snippets has no auto_append', () => {
    expect(extractAutoAppend([ext('pymdownx.snippets')])).toEqual([]);
  });

  it('returns the auto_append paths from pymdownx.snippets options', () => {
    expect(
      extractAutoAppend([
        ext('pymdownx.snippets', {
          auto_append: ['includes/abbreviations.md', 'includes/glossary.md'],
        }),
      ]),
    ).toEqual(['includes/abbreviations.md', 'includes/glossary.md']);
  });

  it('ignores other extensions and only reads from pymdownx.snippets', () => {
    expect(
      extractAutoAppend([
        ext('admonition'),
        ext('pymdownx.superfences'),
        ext('pymdownx.snippets', { auto_append: ['x.md'] }),
        ext('attr_list'),
      ]),
    ).toEqual(['x.md']);
  });

  it('skips non-string entries defensively', () => {
    expect(
      extractAutoAppend([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ext('pymdownx.snippets', { auto_append: ['ok.md', 42, null] as any }),
      ]),
    ).toEqual(['ok.md']);
  });

  it('returns empty list when auto_append is set but not an array', () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extractAutoAppend([ext('pymdownx.snippets', { auto_append: 'x.md' as any })]),
    ).toEqual([]);
  });
});
