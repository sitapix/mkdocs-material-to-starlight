import { describe, expect, it } from 'vitest';
import { rewriteInternalLink } from './rewrite-links.js';
import { buildSlugMap, type SlugMap } from '../../domain/starlight/slug-map.js';

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
