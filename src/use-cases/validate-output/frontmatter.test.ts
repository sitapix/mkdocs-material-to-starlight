import { describe, expect, it } from 'vitest';
import { validateFrontmatter } from './frontmatter.js';

describe('validateFrontmatter', () => {
  it('returns no diagnostics for a file with only Starlight-recognized fields', () => {
    const source = '---\ntitle: Welcome\ndescription: Demo.\n---\n\nBody.\n';
    expect(validateFrontmatter(source)).toEqual([]);
  });

  it('returns no diagnostics for a file with no frontmatter', () => {
    expect(validateFrontmatter('# No frontmatter here.\n')).toEqual([]);
  });

  it('flags an unknown top-level field with a warning', () => {
    const source = '---\ntitle: X\ntags:\n  - api\n  - auth\n---\nBody\n';
    const diagnostics = validateFrontmatter(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('unknown-frontmatter-field');
    expect(diagnostics[0]?.message).toContain('"tags"');
    expect(diagnostics[0]?.severity).toBe('warning');
  });

  it('says the schema is auto-extended (not "build will fail")', () => {
    // Once the converter started auto-extending src/content.config.ts with
    // inferred Zod types for every unknown frontmatter field, the old
    // "build will fail" wording became misleading.
    const source = '---\ntitle: X\ntags: [a]\n---\n';
    const diagnostics = validateFrontmatter(source);
    expect(diagnostics[0]?.message).not.toContain('build will fail');
    expect(diagnostics[0]?.message.toLowerCase()).toMatch(
      /auto-extend|auto extended|content\.config\.ts/,
    );
  });

  it('flags multiple unknown fields independently', () => {
    const source = '---\ntitle: X\ntags: [a]\nauthors: [bob]\nfoo: 1\n---\n';
    const diagnostics = validateFrontmatter(source);
    const ids = diagnostics.map((d) => d.message);
    expect(ids.some((m) => m.includes('"tags"'))).toBe(true);
    expect(ids.some((m) => m.includes('"authors"'))).toBe(true);
    expect(ids.some((m) => m.includes('"foo"'))).toBe(true);
  });

  it('does not flag indented (nested) keys — only top-level', () => {
    const source = ['---', 'title: X', 'sidebar:', '  label: Custom', '  order: 1', '---', ''].join(
      '\n',
    );
    expect(validateFrontmatter(source)).toEqual([]);
  });

  it('records a 1-based line number for the offending field', () => {
    const source = '---\ntitle: X\nbogus: nope\n---\n';
    const diagnostics = validateFrontmatter(source);
    expect(diagnostics[0]?.place?.line).toBe(3);
  });

  it('flags a file that is missing the required `title` field', () => {
    const source = '---\ndescription: D\n---\n\nBody.\n';
    const diagnostics = validateFrontmatter(source);
    expect(diagnostics.some((d) => d.ruleId === 'missing-required-title')).toBe(true);
  });

  it('does not flag missing title when there is no frontmatter at all', () => {
    // Files without frontmatter are handled upstream by ensure-title.
    expect(validateFrontmatter('# Bare heading\n').length).toBe(0);
  });

  it('recognizes every documented Starlight frontmatter field', () => {
    const source = [
      '---',
      'title: X',
      'description: D',
      'slug: x',
      'editUrl: false',
      'head: []',
      'tableOfContents: false',
      'template: doc',
      'hero: {}',
      'banner: {}',
      'lastUpdated: false',
      'prev: false',
      'next: false',
      'pagefind: true',
      'draft: false',
      'sidebar:',
      '  label: X',
      '---',
    ].join('\n');
    expect(validateFrontmatter(source)).toEqual([]);
  });
});
