import { describe, expect, it } from 'vitest';
import { renameI18nPath } from './i18n-rename.js';

describe('renameI18nPath', () => {
  it('returns null for paths with no locale suffix (default locale)', () => {
    expect(renameI18nPath('page.md', ['fr', 'de'])).toBeNull();
    expect(renameI18nPath('guides/intro.md', ['fr', 'de'])).toBeNull();
  });

  it('returns null when the suffix is not a recognized locale', () => {
    expect(renameI18nPath('page.es.md', ['fr', 'de'])).toBeNull();
    expect(renameI18nPath('page.tar.md', ['fr', 'de'])).toBeNull();
  });

  it('rewrites a top-level page.fr.md to fr/page.md', () => {
    expect(renameI18nPath('page.fr.md', ['fr', 'de'])).toBe('fr/page.md');
  });

  it('rewrites a nested guide path preserving the directory tree', () => {
    expect(renameI18nPath('guides/intro.de.md', ['fr', 'de'])).toBe('de/guides/intro.md');
  });

  it('handles longer regional locale codes (zh-CN, pt-BR)', () => {
    expect(renameI18nPath('page.zh-CN.md', ['zh-CN'])).toBe('zh-CN/page.md');
    expect(renameI18nPath('docs/api.pt-BR.md', ['pt-BR'])).toBe('pt-BR/docs/api.md');
  });

  it('does not collide on filenames with multiple dots', () => {
    // `archive.tar.gz.md` — `.tar.gz` is part of the basename, not a locale.
    expect(renameI18nPath('archive.tar.gz.md', ['fr', 'de'])).toBeNull();
  });

  it('returns null for paths that do not end in .md', () => {
    expect(renameI18nPath('image.fr.png', ['fr', 'de'])).toBeNull();
  });

  it('is robust to an empty locale list (no rewrites at all)', () => {
    expect(renameI18nPath('page.fr.md', [])).toBeNull();
  });
});
