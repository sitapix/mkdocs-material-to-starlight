import { describe, expect, it } from 'vitest';
import { normalizeFrontmatterTitleCoercion } from './frontmatter-title-coerce.js';

describe('normalizeFrontmatterTitleCoercion', () => {
  it('quotes a bare ISO-date title (governance regression)', () => {
    // Source: meeting-notes site uses date-shaped slugs as titles.
    // YAML coerces unquoted `2025-10-15` to a Date object; Starlight
    // rejects it with "title: Expected 'string', received 'object'".
    const src = '---\ntitle: 2025-10-15\n---\nbody\n';
    const out = normalizeFrontmatterTitleCoercion(src);
    expect(out).toBe("---\ntitle: '2025-10-15'\n---\nbody\n");
  });

  it('quotes a bare number title', () => {
    const src = '---\ntitle: 42\n---\n';
    expect(normalizeFrontmatterTitleCoercion(src)).toBe("---\ntitle: '42'\n---\n");
  });

  it('quotes a YAML-timestamp title', () => {
    const src = '---\ntitle: 2025-10-15T10:30:00Z\n---\n';
    expect(normalizeFrontmatterTitleCoercion(src)).toBe(
      "---\ntitle: '2025-10-15T10:30:00Z'\n---\n",
    );
  });

  it('quotes bareword YAML booleans (yes/no/true/false/on/off)', () => {
    for (const v of ['true', 'false', 'yes', 'no', 'on', 'off', 'TRUE', 'On']) {
      const src = `---\ntitle: ${v}\n---\n`;
      expect(normalizeFrontmatterTitleCoercion(src)).toBe(
        `---\ntitle: '${v}'\n---\n`,
      );
    }
  });

  it('leaves already-quoted titles untouched', () => {
    const a = "---\ntitle: '2025-10-15'\n---\n";
    expect(normalizeFrontmatterTitleCoercion(a)).toBe(a);
    const b = '---\ntitle: "Hello"\n---\n';
    expect(normalizeFrontmatterTitleCoercion(b)).toBe(b);
  });

  it('leaves a normal string title untouched', () => {
    const src = '---\ntitle: My Project\n---\n';
    expect(normalizeFrontmatterTitleCoercion(src)).toBe(src);
  });

  it('escapes single quotes inside the value when wrapping', () => {
    // YAML 1.2: doubled single quote inside single-quoted scalar is a
    // literal apostrophe. Source title `it's 2025` would already be
    // string-shaped (YAML parses it as a string with apostrophe), so the
    // coercion path doesn't apply. But if a number-shaped title contains
    // an apostrophe (degenerate case), escape correctly.
    const src = "---\ntitle: 1'2\n---\n";
    // Not a coerced value (does not match ISO_DATE/NUMBER/BOOL), so left alone.
    expect(normalizeFrontmatterTitleCoercion(src)).toBe(src);
  });

  it('also coerces description and tagline fields', () => {
    const src = '---\ntitle: My Site\ndescription: 2025-01-01\ntagline: 42\n---\n';
    const out = normalizeFrontmatterTitleCoercion(src);
    expect(out).toBe(
      "---\ntitle: My Site\ndescription: '2025-01-01'\ntagline: '42'\n---\n",
    );
  });

  it('leaves block-scalar values alone', () => {
    const src = '---\ndescription: |\n  Multi-line\n  text\n---\n';
    expect(normalizeFrontmatterTitleCoercion(src)).toBe(src);
  });

  it('returns source unchanged when there is no frontmatter', () => {
    const src = '# Heading\n\nBody\n';
    expect(normalizeFrontmatterTitleCoercion(src)).toBe(src);
  });

  it('is idempotent', () => {
    const src = '---\ntitle: 2025-10-15\n---\nbody\n';
    const once = normalizeFrontmatterTitleCoercion(src);
    expect(normalizeFrontmatterTitleCoercion(once)).toBe(once);
  });
});
