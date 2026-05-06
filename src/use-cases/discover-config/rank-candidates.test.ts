import { describe, expect, it } from 'vitest';
import { rankCandidates } from './rank-candidates.js';

describe('rankCandidates', () => {
  it('returns kind:none when given an empty list', () => {
    expect(rankCandidates([])).toEqual({ kind: 'none' });
  });

  it('returns kind:none when no path matches mkdocs.yml or mkdocs.yaml', () => {
    expect(
      rankCandidates(['site_template/config.yml', 'README.md', 'docs/index.md']),
    ).toEqual({ kind: 'none' });
  });

  it('promotes a root-level mkdocs.yml ahead of any subdir match', () => {
    const result = rankCandidates([
      'website/mkdocs.yml',
      'mkdocs.yml',
      'examples/foo/mkdocs.yml',
    ]);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.primary.relPath).toBe('mkdocs.yml');
    expect(result.primary.depth).toBe(0);
    expect(result.primary.configDir).toBe('');
    expect(result.alternatives.map((c) => c.relPath)).toEqual([
      'website/mkdocs.yml',
      'examples/foo/mkdocs.yml',
    ]);
  });

  it('prunes paths inside heavyweight or build-output directories', () => {
    const result = rankCandidates([
      'node_modules/some-pkg/mkdocs.yml',
      'dist/mkdocs.yml',
      'build/mkdocs.yml',
      '_site/mkdocs.yml',
      'site/mkdocs.yml',
      'out/mkdocs.yml',
      '.git/mkdocs.yml',
      '.cache/mkdocs.yml',
      'vendor/foo/mkdocs.yml',
      'website/mkdocs.yml',
    ]);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.primary.relPath).toBe('website/mkdocs.yml');
    expect(result.alternatives).toEqual([]);
  });

  it('prefers a doc-like containing dir at the same depth', () => {
    const result = rankCandidates([
      'tools/mkdocs.yml',
      'docs/mkdocs.yml',
      'website/mkdocs.yml',
    ]);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.primary.relPath).toBe('docs/mkdocs.yml');
    expect(result.primary.reasons).toContain('doc-like dir name "docs"');
    // website is also doc-like — it should rank ahead of generic tools/
    expect(result.alternatives.map((c) => c.relPath)).toEqual([
      'website/mkdocs.yml',
      'tools/mkdocs.yml',
    ]);
  });

  it('prefers mkdocs.yml over mkdocs.yaml at the same depth + dir', () => {
    const result = rankCandidates(['docs/mkdocs.yaml', 'docs/mkdocs.yml']);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.primary.relPath).toBe('docs/mkdocs.yml');
  });

  it('treats Windows-style separators in input as POSIX (defensive)', () => {
    const result = rankCandidates(['website\\mkdocs.yml', 'mkdocs.yml']);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.primary.relPath).toBe('mkdocs.yml');
    expect(result.alternatives[0]?.configDir).toBe('website');
  });

  it('caps alternatives so the UX list stays scannable', () => {
    const many = Array.from(
      { length: 20 },
      (_, i) => `examples/p${String(i)}/mkdocs.yml`,
    );
    const result = rankCandidates(['mkdocs.yml', ...many]);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.alternatives.length).toBeLessThanOrEqual(8);
  });

  it('annotates the root case with a clear reason', () => {
    const result = rankCandidates(['mkdocs.yml']);
    expect(result.kind).toBe('found');
    if (result.kind !== 'found') return;
    expect(result.primary.reasons).toContain('at project root');
  });
});
