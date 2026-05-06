import { describe, expect, it } from 'vitest';
import { translateTagsOptions } from './tags-options.js';

describe('translateTagsOptions', () => {
  it('returns empty string when no recognizable Material options are present', () => {
    expect(translateTagsOptions({})).toBe('');
    expect(translateTagsOptions({ unknown_key: 'x' })).toBe('');
  });

  it('translates tags_hierarchy true into hierarchical mode', () => {
    const out = translateTagsOptions({
      tags_hierarchy: true,
      tags_hierarchy_separator: '/',
    });
    expect(out).toContain('hierarchical: true');
    expect(out).toContain("separator: '/'");
  });

  it('translates tags_allowed into an allowlist of tag IDs', () => {
    const out = translateTagsOptions({ tags_allowed: ['python', 'rust'] });
    expect(out).toContain('allowedTags:');
    expect(out).toContain("'python'");
    expect(out).toContain("'rust'");
  });

  it('translates shadow_tags into hidden-tags array', () => {
    const out = translateTagsOptions({ shadow_tags: ['_internal', '_draft'] });
    expect(out).toContain('hiddenTags:');
    expect(out).toContain("'_internal'");
  });

  it('translates listings_map into listings comment block', () => {
    const out = translateTagsOptions({
      listings_map: {
        'python-tutorials': { include: ['python', 'tutorial'] },
      },
    });
    expect(out).toContain('listings:');
    expect(out).toContain("'python-tutorials'");
  });

  it('emits a single JS object literal', () => {
    const out = translateTagsOptions({
      tags_hierarchy: true,
      shadow_tags: ['_x'],
    });
    expect(out.startsWith('{')).toBe(true);
    expect(out.endsWith('}')).toBe(true);
  });

  it('idempotent', () => {
    const opts = { tags_hierarchy: true, tags_allowed: ['a'] };
    expect(translateTagsOptions(opts)).toBe(translateTagsOptions(opts));
  });
});
