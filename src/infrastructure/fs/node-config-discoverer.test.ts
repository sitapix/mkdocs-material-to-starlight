import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNodeConfigDiscoverer } from './node-config-discoverer.js';

describe('createNodeConfigDiscoverer', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mts-discover-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeAt(relPath: string, body = 'site_name: Demo\n'): void {
    const full = join(root, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }

  it('finds mkdocs.yml at the project root', async () => {
    writeAt('mkdocs.yml');
    const discoverer = createNodeConfigDiscoverer();
    const result = await discoverer.findMkdocsConfigs(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(['mkdocs.yml']);
  });

  it('finds nested mkdocs.yml/mkdocs.yaml without entering pruned dirs', async () => {
    writeAt('website/mkdocs.yml');
    writeAt('docs-site/mkdocs.yaml');
    writeAt('node_modules/some-pkg/mkdocs.yml');
    writeAt('dist/mkdocs.yml');
    writeAt('.git/mkdocs.yml');
    const discoverer = createNodeConfigDiscoverer();
    const result = await discoverer.findMkdocsConfigs(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(['docs-site/mkdocs.yaml', 'website/mkdocs.yml']);
  });

  it('honors the maxDepth bound', async () => {
    writeAt('a/b/c/d/e/mkdocs.yml');
    const shallow = createNodeConfigDiscoverer({ maxDepth: 2 });
    const deep = createNodeConfigDiscoverer({ maxDepth: 6 });
    const r1 = await shallow.findMkdocsConfigs(root);
    const r2 = await deep.findMkdocsConfigs(root);
    expect(r1.ok && r1.value).toEqual([]);
    expect(r2.ok && r2.value).toEqual(['a/b/c/d/e/mkdocs.yml']);
  });

  it('returns a typed not-found error when the root does not exist', async () => {
    const discoverer = createNodeConfigDiscoverer();
    const result = await discoverer.findMkdocsConfigs(join(root, 'no-such-dir'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not-found');
  });
});
