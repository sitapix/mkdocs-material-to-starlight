import { describe, expect, it } from 'vitest';
import { parseAwesomePages } from './parse-awesome-pages.js';

describe('parseAwesomePages', () => {
  it('rejects non-object input', () => {
    const result = parseAwesomePages(null);
    expect(result.ok).toBe(false);
  });

  it('parses an empty .pages file as a no-op override', () => {
    const result = parseAwesomePages({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        title: null,
        nav: null,
        collapse: null,
        hide: false,
      });
    }
  });

  it('captures the title override', () => {
    const result = parseAwesomePages({ title: 'Getting Started' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Getting Started');
    }
  });

  it('captures the collapse and hide flags', () => {
    const result = parseAwesomePages({ collapse: true, hide: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.collapse).toBe(true);
      expect(result.value.hide).toBe(true);
    }
  });

  it('parses an explicit nav with literals, rest placeholder, and titled overrides', () => {
    const result = parseAwesomePages({
      nav: ['introduction.md', '...', { Advanced: 'advanced/' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nav).toEqual([
        { kind: 'literal', name: 'introduction.md' },
        { kind: 'rest' },
        { kind: 'titled', title: 'Advanced', name: 'advanced/' },
      ]);
    }
  });

  it('treats the legacy `arrange` key as an alias for `nav`', () => {
    const result = parseAwesomePages({ arrange: ['a.md', 'b.md'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nav).toEqual([
        { kind: 'literal', name: 'a.md' },
        { kind: 'literal', name: 'b.md' },
      ]);
    }
  });

  it('rejects nav entries that are neither string nor single-key map', () => {
    const result = parseAwesomePages({ nav: [42] });
    expect(result.ok).toBe(false);
  });
});
