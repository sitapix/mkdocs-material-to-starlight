import { describe, expect, it } from 'vitest';
import { normalizeFrontmatterHide } from './frontmatter-hide.js';

describe('normalizeFrontmatterHide', () => {
  it('returns source unchanged when no frontmatter', () => {
    expect(normalizeFrontmatterHide('# Heading\n')).toBe('# Heading\n');
  });

  it('returns source unchanged when frontmatter has no hide:', () => {
    const src = '---\ntitle: X\n---\n';
    expect(normalizeFrontmatterHide(src)).toBe(src);
  });

  it('translates hide: [toc] → tableOfContents: false', () => {
    const out = normalizeFrontmatterHide(
      '---\ntitle: X\nhide:\n  - toc\n---\n',
    );
    expect(out).toContain('tableOfContents: false');
    expect(out).not.toContain('hide:');
  });

  it('translates hide: [navigation] → template: splash', () => {
    const out = normalizeFrontmatterHide(
      '---\ntitle: X\nhide:\n  - navigation\n---\n',
    );
    expect(out).toContain('template: splash');
  });

  it('translates hide: [toc, navigation] → both', () => {
    const out = normalizeFrontmatterHide(
      '---\ntitle: X\nhide:\n  - toc\n  - navigation\n---\n',
    );
    expect(out).toContain('tableOfContents: false');
    expect(out).toContain('template: splash');
  });

  it('drops unknown hide values silently (footer has no Starlight equivalent)', () => {
    const out = normalizeFrontmatterHide(
      '---\ntitle: X\nhide:\n  - footer\n---\n',
    );
    expect(out).not.toContain('hide:');
    // No tableOfContents/template added either.
    expect(out).not.toContain('tableOfContents');
    expect(out).not.toContain('template:');
  });

  it('handles inline array form: hide: [toc, footer]', () => {
    const out = normalizeFrontmatterHide('---\ntitle: X\nhide: [toc, footer]\n---\n');
    expect(out).toContain('tableOfContents: false');
    expect(out).not.toContain('hide:');
  });

  it('idempotent', () => {
    const src = '---\ntitle: X\nhide:\n  - toc\n---\n';
    const first = normalizeFrontmatterHide(src);
    expect(normalizeFrontmatterHide(first)).toBe(first);
  });

  it('does not touch hide: that appears in body text', () => {
    const out = normalizeFrontmatterHide(
      '---\ntitle: X\n---\n\nThe `hide:` field has uses.\n',
    );
    expect(out).toContain('`hide:`');
  });
});
