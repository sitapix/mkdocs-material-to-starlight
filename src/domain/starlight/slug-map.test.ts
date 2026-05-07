import { describe, expect, it } from 'vitest';
import { buildSlugMap } from './slug-map.js';

describe('buildSlugMap', () => {
  it('builds an empty map from no inputs', () => {
    const result = buildSlugMap([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(0);
    }
  });

  it('maps each source path to a slug record', () => {
    const result = buildSlugMap(['index.md', 'api/auth.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const map = result.value;
      expect(map.size).toBe(2);
      expect(map.getBySourcePath('index.md')).toEqual({
        sourcePath: 'index.md',
        slug: '',
      });
      expect(map.getBySourcePath('api/auth.md')).toEqual({
        sourcePath: 'api/auth.md',
        slug: 'api/auth',
      });
    }
  });

  it('supports reverse lookup by slug', () => {
    const result = buildSlugMap(['api/auth.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.getBySlug('api/auth')?.sourcePath).toBe('api/auth.md');
    }
  });

  it('returns undefined for unknown source paths and slugs', () => {
    const result = buildSlugMap(['index.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.getBySourcePath('missing.md')).toBeUndefined();
      expect(result.value.getBySlug('missing')).toBeUndefined();
    }
  });

  it('rejects two source paths that derive the same slug', () => {
    const result = buildSlugMap(['api/index.md', 'api.md']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/conflict/i);
      expect(result.error.message).toContain('api');
    }
  });

  it('exposes all entries in registration order', () => {
    const result = buildSlugMap(['index.md', 'api.md', 'guide/intro.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries().map((e) => e.slug)).toEqual(['', 'api', 'guide/intro']);
    }
  });

  it('applies i18n rename to slug derivation when locales are provided', () => {
    const result = buildSlugMap(['page.md', 'page.fr.md', 'guides/intro.de.md'], {
      i18nLocales: ['fr', 'de'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Default-locale file: slug unchanged.
      expect(result.value.getBySourcePath('page.md')?.slug).toBe('page');
      // French file: slug reflects the renamed path so [link](page.fr.md)
      // resolves to `/fr/page`.
      expect(result.value.getBySourcePath('page.fr.md')?.slug).toBe('fr/page');
      // German nested file.
      expect(result.value.getBySourcePath('guides/intro.de.md')?.slug).toBe('de/guides/intro');
    }
  });

  it('passes through paths whose locale suffix is not in the i18n list', () => {
    const result = buildSlugMap(['page.es.md'], { i18nLocales: ['fr', 'de'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Spanish locale wasn't configured — treat as a regular filename.
      expect(result.value.getBySourcePath('page.es.md')?.slug).toBe('page.es');
    }
  });
});
