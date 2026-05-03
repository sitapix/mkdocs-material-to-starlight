import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNodeFileSystem } from './node-file-system.js';

describe('createNodeFileSystem', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mts-fs-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('readText returns the file content for an existing file', async () => {
    const file = join(dir, 'hello.txt');
    writeFileSync(file, 'Hello, World!');
    const fs = createNodeFileSystem();
    const result = await fs.readText(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('Hello, World!');
    }
  });

  it('readText returns a not-found error for a missing file', async () => {
    const fs = createNodeFileSystem();
    const result = await fs.readText(join(dir, 'missing.txt'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not-found');
      expect(result.error.path).toContain('missing.txt');
    }
  });

  it('exists returns true for a present file and false for an absent one', async () => {
    const file = join(dir, 'present.txt');
    writeFileSync(file, '');
    const fs = createNodeFileSystem();
    expect(await fs.exists(file)).toBe(true);
    expect(await fs.exists(join(dir, 'absent.txt'))).toBe(false);
  });

  it('readText preserves UTF-8 content exactly', async () => {
    const file = join(dir, 'utf.txt');
    const content = 'café — 日本語 — 🚀';
    writeFileSync(file, content);
    const fs = createNodeFileSystem();
    const result = await fs.readText(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(content);
    }
  });

  it('readText reports access-denied when path is a directory', async () => {
    mkdirSync(join(dir, 'subdir'));
    const fs = createNodeFileSystem();
    const result = await fs.readText(join(dir, 'subdir'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['access-denied', 'unknown']).toContain(result.error.code);
    }
  });
});
