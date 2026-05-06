import { describe, expect, it } from 'vitest';
import { ok, err } from '../../domain/result.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { ConfigDiscoverer } from '../../domain/ports/config-discoverer.js';
import { resolveProjectDir } from './resolve-project-dir.js';

function makeFs(presentPaths: ReadonlyArray<string>): FileSystem {
  const set = new Set(presentPaths);
  return {
    async readText(path) {
      if (set.has(path)) return ok('site_name: Demo\n');
      return err({ code: 'not-found', path, message: 'not found' });
    },
    async exists(path) {
      return set.has(path);
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

function makeDiscoverer(rels: ReadonlyArray<string>): ConfigDiscoverer {
  return {
    async findMkdocsConfigs() {
      return ok(rels);
    },
  };
}

describe('resolveProjectDir', () => {
  it('returns the input dir untouched when its mkdocs.yml exists', async () => {
    const fs = makeFs(['/proj/mkdocs.yml']);
    const discoverer = makeDiscoverer(['mkdocs.yml']);
    const result = await resolveProjectDir('/proj', fs, discoverer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.projectDir).toBe('/proj');
    expect(result.value.autoDiscovery).toBeNull();
  });

  it('redirects to a single discovered subdir when root mkdocs.yml is missing', async () => {
    const fs = makeFs(['/repo/website/mkdocs.yml']);
    const discoverer = makeDiscoverer(['website/mkdocs.yml']);
    const result = await resolveProjectDir('/repo', fs, discoverer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.projectDir).toBe('/repo/website');
    expect(result.value.autoDiscovery).toEqual({
      fromDir: '/repo',
      discoveredRelPath: 'website/mkdocs.yml',
    });
  });

  it('returns an ambiguous error with candidates when multiple are found', async () => {
    const fs = makeFs([]);
    const discoverer = makeDiscoverer([
      'website/mkdocs.yml',
      'docs-site/mkdocs.yml',
      'examples/foo/mkdocs.yml',
    ]);
    const result = await resolveProjectDir('/repo', fs, discoverer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('ambiguous');
    if (result.error.kind !== 'ambiguous') return;
    expect(result.error.candidates).toEqual([
      'website/mkdocs.yml',
      'docs-site/mkdocs.yml',
      'examples/foo/mkdocs.yml',
    ]);
  });

  it('returns no-config-anywhere when discovery finds zero candidates', async () => {
    const fs = makeFs([]);
    const discoverer = makeDiscoverer([]);
    const result = await resolveProjectDir('/repo', fs, discoverer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('no-config-anywhere');
  });

  it('uses POSIX joining so the discovered relPath stays portable', async () => {
    const fs = makeFs([]);
    const discoverer = makeDiscoverer(['packages/foo/website/mkdocs.yml']);
    const result = await resolveProjectDir('/repo', fs, discoverer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.projectDir).toBe('/repo/packages/foo/website');
  });
});
