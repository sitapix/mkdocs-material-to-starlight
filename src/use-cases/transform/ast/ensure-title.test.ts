import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { ensureTitle } from './ensure-title.js';

function process(source: string, sourcePath: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(ensureTitle, { sourcePath })
    .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
    .processSync(source);
  return String(file);
}

describe('ensureTitle', () => {
  it('preserves an existing title in frontmatter', () => {
    const out = process('---\ntitle: Existing\n---\n\nbody\n', 'index.md');
    expect(out).toContain('title: Existing');
    expect(out.match(/title:/g)?.length).toBe(1);
  });

  it('synthesizes a title from the first H1 when none in frontmatter', () => {
    const out = process('# Welcome to the site\n\nbody\n', 'index.md');
    expect(out).toContain('title: Welcome to the site');
  });

  it('derives a title from the filename when no H1 and no frontmatter', () => {
    const out = process('plain body\n', 'getting-started.md');
    expect(out).toContain('title: Getting Started');
  });

  it('humanizes nested filenames using the basename', () => {
    const out = process('plain\n', 'api/auth-tokens.md');
    expect(out).toContain('title: Auth Tokens');
  });

  it('uses index.md → "Home" by convention', () => {
    const out = process('plain\n', 'index.md');
    expect(out).toContain('title: Home');
  });

  it('preserves an existing description when present alongside synthesized title', () => {
    const out = process('---\ndescription: A page.\n---\n\n# Real Title\n', 'index.md');
    expect(out).toContain('title: Real Title');
    expect(out).toContain('description: A page.');
  });

  it('quotes titles containing colons or special YAML characters', () => {
    const out = process('# Foo: bar\n', 'page.md');
    expect(out).toMatch(/title:\s+["']?Foo:\s*bar["']?/);
  });

  it('is idempotent — re-running on output does not duplicate', () => {
    const first = process('# Hello\n\nbody\n', 'page.md');
    const second = process(first, 'page.md');
    expect(second).toBe(first);
  });

  describe('duplicate body H1 stripping', () => {
    it('strips the body H1 when it matches the synthesized frontmatter title', () => {
      // Material convention: page body starts with `# Title` matching the
      // implicit page title. Starlight auto-renders frontmatter `title:` as
      // the page H1; leaving the body H1 makes the title appear twice.
      const out = process('# Welcome\n\nIntro paragraph.\n', 'page.md');
      expect(out).toContain('title: Welcome');
      expect(out).not.toMatch(/^# Welcome\b/m);
      expect(out).toContain('Intro paragraph.');
    });

    it('strips the body H1 when it matches an existing frontmatter title', () => {
      const out = process('---\ntitle: Hello\n---\n\n# Hello\n\nBody.\n', 'page.md');
      expect(out).toContain('title: Hello');
      expect(out).not.toMatch(/^# Hello\b/m);
      expect(out).toContain('Body.');
    });

    it('keeps the body H1 when it semantically differs from the frontmatter title', () => {
      // Author intent: the frontmatter title is what shows in the tab and
      // sidebar; the body H1 is a different heading they want rendered as
      // page content. Preserve it.
      const out = process(
        '---\ntitle: Real Title\n---\n\n# Different Heading\n\nBody.\n',
        'page.md',
      );
      expect(out).toContain('title: Real Title');
      expect(out).toContain('# Different Heading');
    });

    it('strips when the H1 differs from title only by case (`API` vs `Api`)', () => {
      // Real-world variation: `title: API` (frontmatter) vs `# Api` (body
      // typo or convention drift). Both render visually identical to the
      // reader; keeping the body H1 produces the duplicate users complain
      // about. Case-insensitive comparison matches the equivalence class
      // users intuitively expect.
      const out = process('---\ntitle: API\n---\n\n# Api\n\nBody.\n', 'page.md');
      expect(out).not.toMatch(/^# Api\b/m);
      expect(out).toContain('Body.');
    });

    it('strips when the H1 differs only by whitespace', () => {
      // Multi-space indent or trailing whitespace shouldn't preserve the
      // duplicate.
      const out = process('---\ntitle: Hello\n---\n\n#   Hello  \n\nBody.\n', 'page.md');
      expect(out).not.toMatch(/^#\s+Hello/m);
    });

    it('does not touch deeper headings (h2, h3, etc.) — only the lead H1', () => {
      const out = process('---\ntitle: Hello\n---\n\n## Hello Section\n\nBody.\n', 'page.md');
      expect(out).toContain('## Hello Section');
    });

    it('does not touch a body H1 that is preceded by other body content', () => {
      // If the H1 isn't the first body element, it's an in-content heading,
      // not the page-title duplicate. Leave it alone.
      const out = process('---\ntitle: Hello\n---\n\nIntro.\n\n# Hello\n', 'page.md');
      expect(out).toContain('# Hello');
    });

    it('emits a `duplicate-h1-stripped` info diagnostic when collector is supplied', () => {
      // The plugin doesn't render diagnostics on its own — callers thread
      // them through the standard collector. This test reaches around the
      // process() helper and calls the plugin directly to assert the
      // collector contract.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collected: any[] = [];
      const file = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(ensureTitle, { sourcePath: 'page.md', diagnostics: collected })
        .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
        .processSync('---\ntitle: Hello\n---\n\n# Hello\n\nBody.\n');
      expect(String(file)).not.toMatch(/^# Hello\b/m);
      expect(collected).toHaveLength(1);
      expect(collected[0]?.ruleId).toBe('duplicate-h1-stripped');
      expect(collected[0]?.severity).toBe('info');
      expect(collected[0]?.message).toContain('Hello');
    });

    it('does NOT emit the diagnostic when no stripping occurred', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collected: any[] = [];
      unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(ensureTitle, { sourcePath: 'page.md', diagnostics: collected })
        .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
        .processSync('---\ntitle: Hello\n---\n\nNo H1 here.\n');
      expect(collected).toEqual([]);
    });

    it('emits `page-stub-detected` (warning) instead of `duplicate-h1-stripped` when the strip leaves an empty body', () => {
      // Real-world case: GMS² `ms-solution-structure.md` is literally just
      // `# Solution Structure\n` — no other content. After stripping the
      // duplicate H1 the page body is empty. That's a distinct and
      // louder signal: the source page is a stub. Use a warning-level
      // diagnostic so MIGRATION_NOTES surfaces these clearly without
      // being buried in the routine info-level dedupe entries.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collected: any[] = [];
      unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(ensureTitle, { sourcePath: 'stub.md', diagnostics: collected })
        .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
        .processSync('# Solution Structure\n');
      expect(collected).toHaveLength(1);
      expect(collected[0]?.ruleId).toBe('page-stub-detected');
      expect(collected[0]?.severity).toBe('warning');
      expect(collected[0]?.message).toContain('Solution Structure');
    });

    it('emits `duplicate-h1-stripped` (info, not stub) when the body has other content beyond the H1', () => {
      // Sanity check the boundary: a body with H1 + paragraph is NOT a
      // stub. It triggers the regular info-level diagnostic.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collected: any[] = [];
      unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ['yaml'])
        .use(ensureTitle, { sourcePath: 'page.md', diagnostics: collected })
        .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
        .processSync('# Hello\n\nReal body content.\n');
      expect(collected).toHaveLength(1);
      expect(collected[0]?.ruleId).toBe('duplicate-h1-stripped');
      expect(collected[0]?.severity).toBe('info');
    });
  });

  describe('empty H1 handling', () => {
    it('falls back to the filename when the first H1 is empty', () => {
      // Real-world (AmbiqAI/soundkit/docs/index.md): the source begins
      // with bare `#` (an empty H1). Without this fallback, the synthesized
      // title is `""` and Astro's content-collection schema rejects the
      // entry: "title: Expected 'string', received 'object'" (YAML
      // interprets bare `title: ` as null → JS treats null as object).
      const out = process('#\n\nbody\n', 'soundkit-overview.md');
      expect(out).toMatch(/title: Soundkit Overview/);
      // Belt-and-suspenders: the synthesized YAML must never be a bare key.
      expect(out).not.toMatch(/^title:\s*$/m);
      expect(out).not.toMatch(/^title:\s*''$/m);
    });

    it('falls back to filename for whitespace-only H1', () => {
      const out = process('#   \n\nbody\n', 'getting-started.md');
      expect(out).toMatch(/title: Getting Started/);
    });

    it('uses Home for empty H1 in index.md', () => {
      const out = process('#\n\nbody\n', 'index.md');
      expect(out).toMatch(/title: Home/);
    });
  });
});
