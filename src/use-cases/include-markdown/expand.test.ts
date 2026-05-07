import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok } from '../../domain/result.js';
import { expandIncludeMarkdown } from './expand.js';

function memFs(files: Record<string, string>): FileSystem {
  return {
    async readText(path) {
      const value = files[path];
      if (value === undefined) {
        return err({ code: 'not-found', path, message: `${path} not found` });
      }
      return ok(value);
    },
    async exists(path) {
      return Object.hasOwn(files, path);
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

describe('expandIncludeMarkdown', () => {
  it('returns the source unchanged when there are no include directives', async () => {
    const fs = memFs({});
    const out = await expandIncludeMarkdown({
      source: '# Hello\n\nNo includes here.\n',
      docsDir: '/docs',
      fs,
    });
    expect(out.text).toBe('# Hello\n\nNo includes here.\n');
    expect(out.diagnostics).toEqual([]);
  });

  it('expands a simple {% include "path" %} directive', async () => {
    const fs = memFs({ '/docs/shared.md': 'shared body' });
    const out = await expandIncludeMarkdown({
      source: 'before\n{% include "shared.md" %}\nafter\n',
      docsDir: '/docs',
      fs,
    });
    expect(out.text).toBe('before\nshared body\nafter\n');
    expect(out.diagnostics).toEqual([]);
  });

  it('expands {% include-markdown "path" %} the same way as {% include %}', async () => {
    const fs = memFs({ '/docs/shared.md': 'shared body' });
    const out = await expandIncludeMarkdown({
      source: '{% include-markdown "shared.md" %}',
      docsDir: '/docs',
      fs,
    });
    expect(out.text).toBe('shared body');
  });

  it('extracts content between start= and end= markers (include-markdown only)', async () => {
    const body = ['pre', '<!--start-->', 'pulled', '<!--end-->', 'post'].join('\n');
    const fs = memFs({ '/docs/snip.md': body });
    const out = await expandIncludeMarkdown({
      source: '{% include-markdown "snip.md" start="<!--start-->" end="<!--end-->" %}',
      docsDir: '/docs',
      fs,
    });
    expect(out.text).toContain('pulled');
    expect(out.text).not.toContain('pre');
    expect(out.text).not.toContain('post');
  });

  it('emits plugin-include-markdown-marker-not-found when start= marker is absent', async () => {
    const fs = memFs({ '/docs/snip.md': 'just body, no marker\n' });
    const out = await expandIncludeMarkdown({
      source: '{% include-markdown "snip.md" start="<!--missing-->" %}',
      docsDir: '/docs',
      fs,
    });
    expect(
      out.diagnostics.some((d) => d.ruleId === 'plugin-include-markdown-marker-not-found'),
    ).toBe(true);
  });

  it('emits plugin-include-markdown-not-found when the file is missing', async () => {
    const fs = memFs({});
    const out = await expandIncludeMarkdown({
      source: '{% include "missing.md" %}\n',
      docsDir: '/docs',
      fs,
    });
    expect(out.diagnostics.some((d) => d.ruleId === 'plugin-include-markdown-not-found')).toBe(
      true,
    );
    // Marker should be left in place so the source stays inspectable.
    expect(out.text).toContain('{% include "missing.md" %}');
  });

  it('emits plugin-include-markdown-unsupported-option for heading-offset and dedent', async () => {
    const fs = memFs({ '/docs/x.md': 'body' });
    const out = await expandIncludeMarkdown({
      source: '{% include-markdown "x.md" heading-offset=2 dedent=true %}',
      docsDir: '/docs',
      fs,
    });
    const ruleIds = out.diagnostics.map((d) => d.ruleId);
    expect(ruleIds).toContain('plugin-include-markdown-unsupported-option');
    // File content still expanded despite ignored options.
    expect(out.text).toContain('body');
  });

  it('handles multi-line directive blocks (Jinja-style multi-line {% ... %})', async () => {
    const fs = memFs({ '/docs/shared.md': 'shared body' });
    const source = ['before', '{%', '  include-markdown "shared.md"', '%}', 'after'].join('\n');
    const out = await expandIncludeMarkdown({ source, docsDir: '/docs', fs });
    expect(out.text).toContain('shared body');
    expect(out.text).not.toContain('include-markdown');
  });

  it('expands nested includes (recursion)', async () => {
    const fs = memFs({
      '/docs/a.md': '{% include "b.md" %}',
      '/docs/b.md': 'leaf',
    });
    const out = await expandIncludeMarkdown({
      source: '{% include "a.md" %}',
      docsDir: '/docs',
      fs,
    });
    expect(out.text).toBe('leaf');
  });

  it('breaks cycles with a depth-exceeded diagnostic, leaving partial source intact', async () => {
    const fs = memFs({
      '/docs/a.md': '{% include "b.md" %}',
      '/docs/b.md': '{% include "a.md" %}',
    });
    const out = await expandIncludeMarkdown({
      source: '{% include "a.md" %}',
      docsDir: '/docs',
      fs,
    });
    // Should not infinite loop and should emit a diagnostic.
    expect(out.diagnostics.length).toBeGreaterThan(0);
  });

  it('idempotency: running the expander twice on the output is a no-op', async () => {
    const fs = memFs({ '/docs/shared.md': 'shared body' });
    const first = await expandIncludeMarkdown({
      source: '{% include "shared.md" %}',
      docsDir: '/docs',
      fs,
    });
    const second = await expandIncludeMarkdown({
      source: first.text,
      docsDir: '/docs',
      fs,
    });
    expect(second.text).toBe(first.text);
    expect(second.diagnostics).toEqual([]);
  });

  it('expands multiple directives in one source', async () => {
    const fs = memFs({
      '/docs/a.md': 'AAA',
      '/docs/b.md': 'BBB',
    });
    const out = await expandIncludeMarkdown({
      source: '{% include "a.md" %}\n---\n{% include "b.md" %}',
      docsDir: '/docs',
      fs,
    });
    expect(out.text).toBe('AAA\n---\nBBB');
  });
});
