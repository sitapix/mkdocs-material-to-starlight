import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../../domain/diagnostics/diagnostic.js';
import { buildSlugMap, type SlugMap } from '../../../domain/starlight/slug-map.js';
import { transformLinkNodes } from './links.js';

function fixtureMap(paths: ReadonlyArray<string>): SlugMap {
  const result = buildSlugMap(paths);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

interface ProcessOutput {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

function process(source: string, fromSourcePath: string, slugMap: SlugMap): ProcessOutput {
  const diagnostics: Diagnostic[] = [];
  const file = unified()
    .use(remarkParse)
    .use(transformLinkNodes, { fromSourcePath, slugMap, diagnostics })
    .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
    .processSync(source);
  return { text: String(file), diagnostics };
}

describe('transformLinkNodes', () => {
  const map = fixtureMap(['index.md', 'api/auth.md', 'guide/intro.md']);

  it('rewrites a relative .md link to its Starlight slug', () => {
    const out = process('[Auth](auth.md)\n', 'api/index.md', map);
    expect(out.text).toContain('[Auth](/api/auth)');
    expect(out.diagnostics).toEqual([]);
  });

  it('rewrites a parent-relative link', () => {
    const out = process('[Intro](../guide/intro.md)\n', 'api/auth.md', map);
    expect(out.text).toContain('[Intro](/guide/intro)');
  });

  it('preserves a fragment on a rewritten link', () => {
    const out = process('[Tokens](auth.md#tokens)\n', 'api/index.md', map);
    expect(out.text).toContain('[Tokens](/api/auth#tokens)');
  });

  it('passes external URLs through untouched', () => {
    const out = process('[Site](https://example.com/)\n', 'index.md', map);
    expect(out.text).toContain('[Site](https://example.com/)');
  });

  it('rewrites a relative asset path to a public-rooted absolute URL', () => {
    // After conversion the asset lives at `public/images/diagram.png`,
    // served at `/images/diagram.png`. The original markdown link
    // `images/diagram.png` would resolve against `src/content/docs/`
    // and break.
    const out = process('![Diagram](images/diagram.png)\n', 'index.md', map);
    expect(out.text).toContain('![Diagram](/images/diagram.png)');
    expect(out.diagnostics).toEqual([]);
  });

  it('rewrites a parent-relative asset path against the source file', () => {
    const out = process('![Diagram](../images/diagram.png)\n', 'api/auth.md', map);
    expect(out.text).toContain('![Diagram](/images/diagram.png)');
  });

  it('passes already-absolute asset paths through unchanged', () => {
    const out = process('![Diagram](/images/diagram.png)\n', 'index.md', map);
    expect(out.text).toContain('![Diagram](/images/diagram.png)');
  });

  it('emits a broken-link diagnostic and strips the link wrapper to plain text', () => {
    const out = process('[Missing](missing.md)\n', 'index.md', map);
    // The link wrapper is stripped so the build doesn't fail at runtime
    // (starlight-links-validator would otherwise reject the page). The label
    // text remains as inline content; the diagnostic captures the lost target.
    expect(out.text).toContain('Missing');
    expect(out.text).not.toContain('[Missing](missing.md)');
    expect(out.diagnostics).toHaveLength(1);
    const diag = out.diagnostics[0];
    expect(diag?.ruleId).toBe('broken-link');
    expect(diag?.message).toContain('missing.md');
  });

  it('rewrites image source paths the same way as link hrefs', () => {
    const out = process('![Auth](auth.md)\n', 'api/index.md', map);
    expect(out.text).toContain('![Auth](/api/auth)');
  });

  it('is idempotent on already-rewritten links', () => {
    const first = process('[Auth](auth.md)\n', 'api/index.md', map);
    const second = process(first.text, 'api/index.md', map);
    expect(second.text).toBe(first.text);
    expect(second.diagnostics).toEqual([]);
  });
});
