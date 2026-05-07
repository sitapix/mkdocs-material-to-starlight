import { describe, expect, it } from 'vitest';
import { buildSlugMap, type SlugMap } from '../../domain/starlight/slug-map.js';
import { rewriteInternalLink } from './rewrite-links.js';

function fixture(paths: ReadonlyArray<string>): SlugMap {
  const result = buildSlugMap(paths);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe('rewriteInternalLink', () => {
  const map = fixture(['index.md', 'api/auth.md', 'guide/intro.md']);

  it('passes external URLs through untouched', () => {
    const result = rewriteInternalLink({
      href: 'https://example.com/',
      fromSourcePath: 'index.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'external', href: 'https://example.com/' });
    }
  });

  it('passes mailto: links through untouched', () => {
    const result = rewriteInternalLink({
      href: 'mailto:foo@example.com',
      fromSourcePath: 'index.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'external', href: 'mailto:foo@example.com' });
    }
  });

  it('passes fragment-only links through unchanged', () => {
    const result = rewriteInternalLink({
      href: '#authentication',
      fromSourcePath: 'api/auth.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'fragment', href: '#authentication' });
    }
  });

  it('rewrites a sibling .md link to the destination slug', () => {
    const result = rewriteInternalLink({
      href: 'auth.md',
      fromSourcePath: 'api/index.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'internal', href: '/api/auth' });
    }
  });

  it('rewrites a parent-relative .md link', () => {
    const result = rewriteInternalLink({
      href: '../guide/intro.md',
      fromSourcePath: 'api/auth.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'internal', href: '/guide/intro' });
    }
  });

  it('preserves a fragment on a rewritten link', () => {
    const result = rewriteInternalLink({
      href: 'auth.md#tokens',
      fromSourcePath: 'api/index.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'internal', href: '/api/auth#tokens' });
    }
  });

  it('rewrites a link to index.md as the slug root', () => {
    const result = rewriteInternalLink({
      href: '../index.md',
      fromSourcePath: 'api/auth.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'internal', href: '/' });
    }
  });

  it('reports a broken link when the target is not in the slug map', () => {
    const result = rewriteInternalLink({
      href: 'missing.md',
      fromSourcePath: 'index.md',
      slugMap: map,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('broken-link');
      expect(result.error.target).toBe('missing.md');
    }
  });

  it('rewrites a sibling relative asset path to a public-rooted absolute URL', () => {
    // `images/diagram.png` from `index.md` → asset will be copied to
    // `public/images/diagram.png` and served at `/images/diagram.png`.
    // Without rewriting, the markdown stays as `images/diagram.png` which
    // resolves against `src/content/docs/images/diagram.png` (does not exist).
    const result = rewriteInternalLink({
      href: 'images/diagram.png',
      fromSourcePath: 'index.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'asset', href: '/images/diagram.png' });
    }
  });

  it('rewrites a parent-relative asset path against the source file', () => {
    // From `api/auth.md`, `../images/diagram.png` resolves to source-relative
    // `images/diagram.png`, copied to `public/images/diagram.png`, served at
    // `/images/diagram.png`.
    const result = rewriteInternalLink({
      href: '../images/diagram.png',
      fromSourcePath: 'api/auth.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'asset', href: '/images/diagram.png' });
    }
  });

  it('preserves a fragment on a rewritten asset URL', () => {
    // SVG fragments (`#viewBox`) and similar — rare but valid.
    const result = rewriteInternalLink({
      href: 'images/sprite.svg#icon',
      fromSourcePath: 'index.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'asset', href: '/images/sprite.svg#icon' });
    }
  });

  it('passes an already-absolute asset path through unchanged', () => {
    // The author may have already written `/images/x.png` — Astro serves it
    // from `public/`. Don't double-prefix.
    const result = rewriteInternalLink({
      href: '/images/diagram.png',
      fromSourcePath: 'index.md',
      slugMap: map,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ kind: 'asset', href: '/images/diagram.png' });
    }
  });

  it('resolves a percent-encoded space in a relative .md link', () => {
    // Markdown link hrefs use HTTP-style percent-encoding; the slug map is
    // keyed by literal filesystem paths. Decode per-segment before lookup.
    const wikiMap = fixture(['Tränke/Großer Heiltrank/index.md']);
    const result = rewriteInternalLink({
      href: 'Großer%20Heiltrank/index.md',
      fromSourcePath: 'Tränke/index.md',
      slugMap: wikiMap,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('internal');
    }
  });

  it('resolves percent-encoded UTF-8 path segments', () => {
    // %C3%A4 = ä, %C3%B6 = ö — common in non-English wikis.
    const wikiMap = fixture(['personen/München/Janette Landgraf/index.md']);
    const result = rewriteInternalLink({
      href: '../personen/M%C3%BCnchen/Janette%20Landgraf/index.md',
      fromSourcePath: 'gegenstaende/index.md',
      slugMap: wikiMap,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('internal');
    }
  });

  it('tolerates a malformed percent-sequence by falling back to the raw segment', () => {
    // `%E0` alone is not valid UTF-8; decodeURIComponent throws. We must not
    // throw — fall back to the raw segment so the lookup proceeds and (likely)
    // emits a clean broken-link diagnostic instead of crashing the file.
    const wikiMap = fixture(['guide/intro.md']);
    const result = rewriteInternalLink({
      href: 'bad%E0name.md',
      fromSourcePath: 'guide/intro.md',
      slugMap: wikiMap,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('broken-link');
    }
  });

  it('is idempotent on asset paths — rewriting the rewritten URL is a no-op', () => {
    // `convert(convert(x)) === convert(x)` invariant. Feed the output back in.
    const first = rewriteInternalLink({
      href: 'images/diagram.png',
      fromSourcePath: 'index.md',
      slugMap: map,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = rewriteInternalLink({
      href: first.value.href,
      fromSourcePath: 'index.md',
      slugMap: map,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value).toEqual(first.value);
    }
  });
});
