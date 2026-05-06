import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atomicCopyFile, atomicWriteText } from './atomic-write.js';

describe('atomicWriteText', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mkdocs-atomic-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the file atomically under a fresh directory', async () => {
    const target = join(dir, 'sub', 'a.txt');
    const result = await atomicWriteText(target, 'hello');
    expect(result.ok).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('hello');
  });

  it('overwrites an existing file in place', async () => {
    const target = join(dir, 'a.txt');
    await writeFile(target, 'old', 'utf8');
    const result = await atomicWriteText(target, 'new');
    expect(result.ok).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('does not leave a temp file behind on success', async () => {
    const target = join(dir, 'a.txt');
    const result = await atomicWriteText(target, 'hello');
    expect(result.ok).toBe(true);
    const entries = await readdir(dir);
    expect(entries).toEqual(['a.txt']);
  });

  it('returns err with no partial output when the destination directory cannot be created', async () => {
    const offending = join(dir, 'blocker');
    // Create a regular file at the path we'll later treat as a directory; the
    // mkdir({recursive:true}) call below will fail with ENOTDIR.
    await writeFile(offending, 'block', 'utf8');
    const target = join(offending, 'nested', 'a.txt');
    const result = await atomicWriteText(target, 'hello');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/failed to write/);
    }
    // The blocking file is untouched and no stray tmp file was left in dir.
    expect(await readFile(offending, 'utf8')).toBe('block');
  });

  it('writes do not corrupt the destination if the target was previously written', async () => {
    const target = join(dir, 'a.txt');
    await atomicWriteText(target, 'first');
    await atomicWriteText(target, 'second');
    expect(await readFile(target, 'utf8')).toBe('second');
    const entries = await readdir(dir);
    expect(entries).toEqual(['a.txt']);
  });
});

describe('atomicCopyFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mkdocs-atomic-cp-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('copies a file to a fresh nested target', async () => {
    const source = join(dir, 'src.bin');
    await writeFile(source, 'payload', 'utf8');
    const target = join(dir, 'sub', 'dest.bin');
    const result = await atomicCopyFile(source, target);
    expect(result.ok).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('payload');
  });

  it('overwrites an existing target atomically', async () => {
    const source = join(dir, 'src.bin');
    const target = join(dir, 'dest.bin');
    await writeFile(source, 'new', 'utf8');
    await writeFile(target, 'old', 'utf8');
    const result = await atomicCopyFile(source, target);
    expect(result.ok).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('returns err and leaves no tmp file when source is missing', async () => {
    const result = await atomicCopyFile(join(dir, 'nope'), join(dir, 'dest'));
    expect(result.ok).toBe(false);
    const entries = await readdir(dir);
    expect(entries).toEqual([]);
  });
});
