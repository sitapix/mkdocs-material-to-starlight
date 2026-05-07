import { describe, expect, it } from 'vitest';
import { rewriteReadmePaths } from './rename-readme.js';

describe('rewriteReadmePaths', () => {
  it('renames a top-level README.md to index.md', () => {
    const out = rewriteReadmePaths(['README.md', 'about.md']);
    expect(out.paths).toEqual(['index.md', 'about.md']);
    expect(out.diskByEmit.get('index.md')).toBe('README.md');
  });

  it('renames a nested directory README.md to index.md', () => {
    const out = rewriteReadmePaths(['guide/README.md', 'guide/setup.md']);
    expect(out.paths).toEqual(['guide/index.md', 'guide/setup.md']);
    expect(out.diskByEmit.get('guide/index.md')).toBe('guide/README.md');
  });

  it('skips renaming when an index.md sibling already exists', () => {
    // Both files exist on disk: prefer index.md, drop README.md from the
    // emit list so we don't overwrite or duplicate.
    const out = rewriteReadmePaths(['guide/index.md', 'guide/README.md', 'guide/setup.md']);
    expect(out.paths).toEqual(['guide/index.md', 'guide/setup.md']);
    expect(out.diskByEmit.get('guide/index.md')).toBe('guide/index.md');
    expect(out.dropped).toEqual(['guide/README.md']);
  });

  it('handles README.mdx and renames to index.mdx', () => {
    const out = rewriteReadmePaths(['guide/README.mdx']);
    expect(out.paths).toEqual(['guide/index.mdx']);
    expect(out.diskByEmit.get('guide/index.mdx')).toBe('guide/README.mdx');
  });

  it('preserves files that are not README and not in conflict', () => {
    const input = ['index.md', 'about.md', 'api/auth.md'];
    const out = rewriteReadmePaths(input);
    expect(out.paths).toEqual(input);
    expect(out.dropped).toEqual([]);
  });

  it('case-sensitive: only `README.md` matches, not `readme.md`', () => {
    // MkDocs treats README/readme/Readme equivalently on case-insensitive
    // filesystems, but POSIX-style git always uses `README.md` literally,
    // so case-sensitive matching catches the canonical form without false
    // positives.
    const out = rewriteReadmePaths(['readme.md', 'guide/README.md']);
    expect(out.paths).toEqual(['readme.md', 'guide/index.md']);
  });

  it('idempotent: running twice yields the same result', () => {
    const once = rewriteReadmePaths(['guide/README.md']);
    const twice = rewriteReadmePaths(once.paths);
    expect(twice.paths).toEqual(once.paths);
  });

  describe('dot-in-filename slugification', () => {
    it('rewrites a file with dots in the basename to a dashed name', () => {
      // Astro slug derivation strips/mangles dots in filenames (treats them
      // as extensions). `asp.net-core.md` ends up at a different slug than
      // the converter's sidebar references. Normalize to `asp-net-core.md`.
      const out = rewriteReadmePaths(['getting-started/asp.net-core.md']);
      expect(out.paths).toEqual(['getting-started/asp-net-core.md']);
      expect(out.diskByEmit.get('getting-started/asp-net-core.md')).toBe(
        'getting-started/asp.net-core.md',
      );
    });

    it('does not rename when dots are only in directory names', () => {
      // `next.js/intro.md` — the dot is in a directory; Astro handles dirs
      // fine. Only the basename matters for the slug-derivation bug.
      const out = rewriteReadmePaths(['next.js/intro.md']);
      expect(out.paths).toEqual(['next.js/intro.md']);
    });

    it('combines README rename with dot-slugify when both apply', () => {
      const out = rewriteReadmePaths(['v1.0/README.md']);
      expect(out.paths).toEqual(['v1.0/index.md']);
    });

    it('handles multiple dots in basename', () => {
      const out = rewriteReadmePaths(['guide/foo.bar.baz.md']);
      expect(out.paths).toEqual(['guide/foo-bar-baz.md']);
    });

    it('preserves the .md / .mdx extension during slugification', () => {
      const out = rewriteReadmePaths(['guide/foo.bar.mdx']);
      expect(out.paths).toEqual(['guide/foo-bar.mdx']);
    });
  });

  describe('section-index slug conflicts (X.md vs X/index.md)', () => {
    it('drops X/index.md when X.md exists at the same level', () => {
      // Real-world AWS Powertools pattern: `core/metrics.md` is the
      // substantive content, `core/metrics/index.md` is a thin
      // section-index shim that snippet-includes the sibling. Both
      // derive slug `core/metrics`. Prefer the substantive `.md` and
      // drop the index shim.
      const out = rewriteReadmePaths([
        'core/metrics.md',
        'core/metrics/index.md',
        'core/metrics/datadog.md',
      ]);
      expect(out.paths).toContain('core/metrics.md');
      expect(out.paths).not.toContain('core/metrics/index.md');
      expect(out.paths).toContain('core/metrics/datadog.md');
      expect(out.dropped).toContain('core/metrics/index.md');
    });

    it('drops X/README.md when X.md exists (after README → index rename)', () => {
      // README would have been renamed to index.md by step 1; the
      // X.md-vs-X/index.md conflict-drop catches it during the same
      // pass.
      const out = rewriteReadmePaths(['core/metrics.md', 'core/metrics/README.md']);
      expect(out.paths).toContain('core/metrics.md');
      expect(out.paths).not.toContain('core/metrics/index.md');
      expect(out.paths).not.toContain('core/metrics/README.md');
      expect(out.dropped).toContain('core/metrics/README.md');
    });

    it('keeps X/index.md when there is no sibling X.md', () => {
      // No conflict — index.md is the section landing on its own.
      const out = rewriteReadmePaths(['core/metrics/index.md', 'core/metrics/datadog.md']);
      expect(out.paths).toContain('core/metrics/index.md');
    });

    it('drops the conflict even when X is at top level', () => {
      const out = rewriteReadmePaths(['guide.md', 'guide/index.md']);
      expect(out.paths).toContain('guide.md');
      expect(out.paths).not.toContain('guide/index.md');
    });

    it('does not confuse partially-overlapping prefixes', () => {
      // `core/metrics-extra.md` is NOT a sibling of `core/metrics/...`.
      // Only the EXACT prefix match should trigger the conflict drop.
      const out = rewriteReadmePaths(['core/metrics-extra.md', 'core/metrics/index.md']);
      expect(out.paths).toContain('core/metrics-extra.md');
      expect(out.paths).toContain('core/metrics/index.md');
    });

    it('drops `dataset/index.md` when sibling `Dataset.md` differs only by case', () => {
      // Real-world break (japila-books/spark-sql-internals): Astro
      // lowercases slugs, so `Dataset.md` and `dataset/index.md` both
      // derive slug `dataset` and `buildSlugMap` errors. The case-folded
      // sibling check must catch this even when the case doesn't match
      // exactly.
      const out = rewriteReadmePaths(['Dataset.md', 'dataset/index.md', 'dataset/encoder.md']);
      expect(out.paths).toContain('Dataset.md');
      expect(out.paths).not.toContain('dataset/index.md');
      expect(out.dropped).toContain('dataset/index.md');
      // The other sibling page is unaffected.
      expect(out.paths).toContain('dataset/encoder.md');
    });

    it('drops `Foo/index.md` when sibling `foo.md` is the lowercase variant', () => {
      // Symmetric case: the index.md side has the uppercase directory,
      // the named sibling is lowercase. Slug collision still applies.
      const out = rewriteReadmePaths(['foo.md', 'Foo/index.md']);
      expect(out.paths).toContain('foo.md');
      expect(out.paths).not.toContain('Foo/index.md');
      expect(out.dropped).toContain('Foo/index.md');
    });
  });
});
