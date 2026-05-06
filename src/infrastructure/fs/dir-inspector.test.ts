import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNodeDirInspector } from './dir-inspector.js';

describe('createNodeDirInspector', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mts-dir-inspect-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports "missing" for a path that does not exist', async () => {
    const inspector = createNodeDirInspector();
    expect(await inspector.inspect(join(root, 'nope'))).toBe('missing');
  });

  it('reports "missing" when the path exists but is a regular file', async () => {
    const filePath = join(root, 'a.txt');
    writeFileSync(filePath, 'hi');
    const inspector = createNodeDirInspector();
    expect(await inspector.inspect(filePath)).toBe('missing');
  });

  it('reports "empty" for an empty directory', async () => {
    const dir = join(root, 'empty');
    mkdirSync(dir);
    const inspector = createNodeDirInspector();
    expect(await inspector.inspect(dir)).toBe('empty');
  });

  it('reports "non-empty" for a directory with at least one entry', async () => {
    const dir = join(root, 'with-content');
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.txt'), 'hi');
    const inspector = createNodeDirInspector();
    expect(await inspector.inspect(dir)).toBe('non-empty');
  });
});
