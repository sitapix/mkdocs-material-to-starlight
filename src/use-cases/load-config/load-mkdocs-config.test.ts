import { describe, expect, it } from 'vitest';
import type { ConfigDiscoverer } from '../../domain/ports/config-discoverer.js';
import type { DirectoryReader } from '../../domain/ports/directory-reader.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { YamlDecoder } from '../../domain/ports/yaml-decoder.js';
import { err, ok } from '../../domain/result.js';
import { type LoadMkdocsConfigPorts, loadMkdocsConfig } from './load-mkdocs-config.js';

function ports(
  options: {
    files?: Readonly<Record<string, string>>;
    discovered?: ReadonlyArray<string> | 'error';
    decoded?: unknown | 'error';
    listed?: ReadonlyArray<string> | 'error';
  } = {},
): LoadMkdocsConfigPorts {
  const files = options.files ?? {};
  const fs: FileSystem = {
    async readText(path) {
      return path in files
        ? ok(files[path] ?? '')
        : err({ code: 'not-found', path, message: 'missing' });
    },
    async exists(path) {
      return path in files;
    },
    async realpath(path) {
      return ok(path);
    },
  };
  const configDiscoverer: ConfigDiscoverer = {
    async findMkdocsConfigs(root) {
      return options.discovered === 'error'
        ? err({ code: 'unknown', path: root, message: 'scan failed' })
        : ok(options.discovered ?? []);
    },
  };
  const dirReader: DirectoryReader = {
    async list(root) {
      return options.listed === 'error'
        ? err({ code: 'access-denied', path: root, message: 'denied' })
        : ok(options.listed ?? []);
    },
  };
  const yamlDecoder: YamlDecoder = {
    decode() {
      return options.decoded === 'error'
        ? err({ message: 'bad YAML', line: 3, column: 4 })
        : ok(options.decoded ?? { site_name: 'Demo' });
    },
  };
  return { fs, configDiscoverer, dirReader, yamlDecoder };
}

describe('loadMkdocsConfig', () => {
  it('loads mkdocs.yml and reports stripped Python tags', async () => {
    const result = await loadMkdocsConfig(
      { inputDir: '/project' },
      ports({
        files: {
          '/project/mkdocs.yml': 'site_name: Demo\nvalue: !!python/name:module.symbol\n',
        },
        decoded: {
          site_name: 'Demo',
          markdown_extensions: [{ meta: {} }],
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectDir).toBe('/project');
      expect(result.value.autoDiscovery).toBeNull();
      expect(result.value.config.siteName).toBe('Demo');
      expect(result.value.strippedPythonTags).toContain('module.symbol');
    }
  });

  it('falls back to mkdocs.yaml after discovering a nested project', async () => {
    const result = await loadMkdocsConfig(
      { inputDir: '/repo' },
      ports({
        files: { '/repo/website/mkdocs.yaml': 'site_name: Nested\n' },
        discovered: ['website/mkdocs.yaml'],
        decoded: { site_name: 'Nested' },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectDir).toBe('/repo/website');
      expect(result.value.autoDiscovery).toEqual({
        fromDir: '/repo',
        discoveredRelPath: 'website/mkdocs.yaml',
      });
    }
  });

  it('maps ambiguous and failed discovery to typed errors', async () => {
    const ambiguous = await loadMkdocsConfig(
      { inputDir: '/repo' },
      ports({ discovered: ['one/mkdocs.yml', 'two/mkdocs.yml'] }),
    );
    expect(ambiguous).toEqual({
      ok: false,
      error: {
        kind: 'config-ambiguous',
        searchedDir: '/repo',
        candidates: ['one/mkdocs.yml', 'two/mkdocs.yml'],
      },
    });

    await expect(
      loadMkdocsConfig({ inputDir: '/repo' }, ports({ discovered: 'error' })),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'config-not-found', searchedDir: '/repo' },
    });
  });

  it('reports a missing config when neither accepted filename can be read', async () => {
    const result = await loadMkdocsConfig(
      { inputDir: '/project' },
      ports({ files: { '/project/mkdocs.yml': 'unreadable' } }),
    );
    // The root file establishes the project, but this adapter deliberately
    // simulates it disappearing before the loader's read by overriding readText.
    const disappearing = ports({ files: { '/project/mkdocs.yml': 'present' } });
    disappearing.fs.readText = async (path) =>
      err({ code: 'not-found', path, message: 'disappeared' });
    const missing = await loadMkdocsConfig({ inputDir: '/project' }, disappearing);

    expect(result.ok).toBe(true);
    expect(missing).toEqual({
      ok: false,
      error: { kind: 'config-not-found', searchedDir: '/project' },
    });
  });

  it('maps decoder and parser failures', async () => {
    await expect(
      loadMkdocsConfig(
        { inputDir: '/project' },
        ports({ files: { '/project/mkdocs.yml': 'bad: [' }, decoded: 'error' }),
      ),
    ).resolves.toEqual({
      ok: false,
      error: { kind: 'yaml-decode-failed', message: 'bad YAML' },
    });

    const invalid = await loadMkdocsConfig(
      { inputDir: '/project' },
      ports({ files: { '/project/mkdocs.yml': 'missing site name' }, decoded: {} }),
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.kind).toBe('config-invalid');
      if (invalid.error.kind !== 'config-invalid') return;
      expect(invalid.error.message).not.toContain('INHERIT');
    }
  });

  it.each([
    ['an unreadable scan', 'error' as const, ''],
    ['no candidates', [] as const, ''],
    ['one candidate', ['template/mkdocs.yml'] as const, 'Found 1 other mkdocs config file'],
    [
      'multiple candidates',
      ['one/mkdocs.yml', 'two/mkdocs.yaml', 'notes.yml'] as const,
      'Found 2 other mkdocs config files',
    ],
  ])('enriches a missing INHERIT error with %s', async (_label, listed, expected) => {
    const result = await loadMkdocsConfig(
      { inputDir: '/project' },
      ports({
        files: { '/project/mkdocs.yml': 'INHERIT: missing.yml\n' },
        decoded: {},
        listed,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('config-invalid');
      if (result.error.kind !== 'config-invalid') return;
      expect(result.error.message).toContain('could not be read');
      if (expected) expect(result.error.message).toContain(expected);
      else expect(result.error.message).not.toContain('Found ');
    }
  });
});
