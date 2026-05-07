import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeDirectoryReader } from './node-directory-reader.js';

describe('createNodeDirectoryReader', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mts-dir-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list for an empty directory', async () => {
    const reader = createNodeDirectoryReader();
    const result = await reader.list(dir, ['.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('lists matching files at the top level, sorted', async () => {
    writeFileSync(join(dir, 'b.md'), '');
    writeFileSync(join(dir, 'a.md'), '');
    writeFileSync(join(dir, 'unrelated.txt'), '');
    const reader = createNodeDirectoryReader();
    const result = await reader.list(dir, ['.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['a.md', 'b.md']);
    }
  });

  it('recurses into subdirectories', async () => {
    mkdirSync(join(dir, 'api'));
    mkdirSync(join(dir, 'guide'));
    writeFileSync(join(dir, 'index.md'), '');
    writeFileSync(join(dir, 'api', 'auth.md'), '');
    writeFileSync(join(dir, 'guide', 'intro.md'), '');
    const reader = createNodeDirectoryReader();
    const result = await reader.list(dir, ['.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['api/auth.md', 'guide/intro.md', 'index.md']);
    }
  });

  it('matches multiple extensions', async () => {
    writeFileSync(join(dir, 'a.md'), '');
    writeFileSync(join(dir, 'b.mdx'), '');
    writeFileSync(join(dir, 'c.txt'), '');
    const reader = createNodeDirectoryReader();
    const result = await reader.list(dir, ['.md', '.mdx']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['a.md', 'b.mdx']);
    }
  });

  it('skips files beginning with a dot', async () => {
    writeFileSync(join(dir, '.hidden.md'), '');
    writeFileSync(join(dir, 'visible.md'), '');
    const reader = createNodeDirectoryReader();
    const result = await reader.list(dir, ['.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['visible.md']);
    }
  });

  it('skips directories starting with underscore (Starlight partial convention)', async () => {
    mkdirSync(join(dir, '_partials'));
    writeFileSync(join(dir, '_partials', 'p.md'), '');
    writeFileSync(join(dir, 'visible.md'), '');
    const reader = createNodeDirectoryReader();
    const result = await reader.list(dir, ['.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['visible.md']);
    }
  });

  it('returns a not-found error for a missing root directory', async () => {
    const reader = createNodeDirectoryReader();
    const result = await reader.list(join(dir, 'no-such-dir'), ['.md']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-found');
    }
  });
});
