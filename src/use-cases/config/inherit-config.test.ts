import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok } from '../../domain/result.js';
import { resolveInherits } from './inherit-config.js';

function memFs(files: Record<string, string>): FileSystem {
  return {
    async readText(p) {
      const v = files[p];
      if (v === undefined) return err({ code: 'not-found', path: p, message: '' });
      return ok(v);
    },
    async exists(p) {
      return Object.hasOwn(files, p);
    },
    async realpath(p) {
      return ok(p);
    },
  };
}

describe('resolveInherits', () => {
  it('returns source unchanged when no INHERIT', async () => {
    const fs = memFs({});
    const out = await resolveInherits('site_name: X\n', '/proj/mkdocs.yml', fs);
    expect(out.source).toBe('site_name: X\n');
    expect(out.included).toEqual([]);
  });

  it('inlines a single INHERIT base config', async () => {
    const fs = memFs({
      '/proj/base.yml': 'theme:\n  name: material\n',
    });
    const out = await resolveInherits(
      'INHERIT: ./base.yml\nsite_name: X\n',
      '/proj/mkdocs.yml',
      fs,
    );
    expect(out.source).not.toContain('INHERIT:');
    expect(out.source).toContain('theme:');
    expect(out.source).toContain('site_name: X');
    expect(out.included).toContain('/proj/base.yml');
  });

  it('resolves relative paths from the configFile location', async () => {
    const fs = memFs({
      '/proj/docs/en/base.yml': 'theme:\n  name: material\n',
    });
    const out = await resolveInherits(
      'INHERIT: ../en/base.yml\nsite_name: De\n',
      '/proj/docs/de/mkdocs.yml',
      fs,
    );
    expect(out.source).toContain('theme:');
    expect(out.included).toContain('/proj/docs/en/base.yml');
  });

  it('recurses through INHERIT chains', async () => {
    const fs = memFs({
      '/proj/level1.yml': 'INHERIT: ./level2.yml\nsite_url: https://x\n',
      '/proj/level2.yml': 'site_description: Demo\n',
    });
    const out = await resolveInherits(
      'INHERIT: ./level1.yml\nsite_name: X\n',
      '/proj/mkdocs.yml',
      fs,
    );
    expect(out.source).toContain('site_name: X');
    expect(out.source).toContain('site_url:');
    expect(out.source).toContain('site_description:');
    expect(out.included).toHaveLength(2);
  });

  it('returns source unchanged when INHERIT target is missing (caller surfaces diagnostic)', async () => {
    const fs = memFs({});
    const out = await resolveInherits(
      'INHERIT: ./missing.yml\nsite_name: X\n',
      '/proj/mkdocs.yml',
      fs,
    );
    expect(out.source).toContain('site_name: X');
    expect(out.missing).toContain('/proj/missing.yml');
  });

  it('idempotent: applying twice yields identical output', async () => {
    const fs = memFs({
      '/proj/base.yml': 'theme:\n  name: material\n',
    });
    const first = await resolveInherits(
      'INHERIT: ./base.yml\nsite_name: X\n',
      '/proj/mkdocs.yml',
      fs,
    );
    const second = await resolveInherits(first.source, '/proj/mkdocs.yml', fs);
    expect(second.source).toBe(first.source);
  });

  it('deep-merges nested objects; derived wins on scalar collisions', async () => {
    // Base: theme with name + features array, plugins list
    // Derived: theme with different features (array replacement), different plugins
    // Expected: theme.name kept from base; theme.features = derived array (not concat);
    // plugins = derived array (not concat)
    const base = [
      'theme:',
      '  name: material',
      '  features:',
      '    - navigation.tabs',
      'plugins:',
      '  - search',
      '',
    ].join('\n');
    const derived = [
      'INHERIT: ./base.yml',
      'theme:',
      '  features:',
      '    - content.tabs.link',
      'plugins:',
      '  - rss',
      '',
    ].join('\n');
    const fs = memFs({ '/proj/base.yml': base });
    const out = await resolveInherits(derived, '/proj/mkdocs.yml', fs);

    // Must not contain duplicate top-level keys
    expect(out.source).not.toMatch(/^theme:/gm.source.length > 1 ? /^theme:.*\ntheme:/ms : /^x$/);
    const occurrences = (out.source.match(/^theme:/gm) ?? []).length;
    expect(occurrences).toBe(1);
    const pluginsOccurrences = (out.source.match(/^plugins:/gm) ?? []).length;
    expect(pluginsOccurrences).toBe(1);

    // The merged YAML must parse without error (no duplicate mapping key)
    const yaml = await import('js-yaml');
    const parsed = yaml.load(out.source) as Record<string, unknown>;
    expect(parsed).toBeDefined();

    // theme.name comes from base
    const theme = parsed.theme as Record<string, unknown>;
    expect(theme.name).toBe('material');

    // theme.features = derived array (not concat)
    expect(theme.features).toEqual(['content.tabs.link']);

    // plugins = derived array (not concat)
    expect(parsed.plugins).toEqual(['rss']);
  });

  it('handles !ENV custom tags in inherited yaml without crashing (FastAPI/typer regression)', async () => {
    const fs = memFs({
      '/p/mkdocs.env.yml': [
        'markdown_extensions:',
        '  pymdownx.highlight:',
        '    linenums: !ENV [LINENUMS, false]',
        '',
      ].join('\n'),
      '/p/mkdocs.yml': [
        'INHERIT: ./mkdocs.env.yml',
        'site_name: T',
        'theme:',
        '  name: material',
        'markdown_extensions:',
        '  pymdownx.highlight:',
        '    line_spans: __span',
        '',
      ].join('\n'),
    });
    const result = await resolveInherits(
      await fs.readText('/p/mkdocs.yml').then((r) => (r as { value: string }).value),
      '/p/mkdocs.yml',
      fs,
    );
    // Must not produce duplicate top-level keys (which would crash the downstream yaml-decode-failed).
    const keyCount = (result.source.match(/^markdown_extensions:/gm) ?? []).length;
    expect(keyCount).toBe(1);
    expect(result.source).toMatch(/pymdownx\.highlight/);
    expect(result.source).toMatch(/line_spans/);
    // Both options should be present after deep-merge.
    expect(result.source).toMatch(/linenums/);
  });

  it('handles duplicate scalar keys without crashing (FastAPI/typer regression)', async () => {
    // Both base and derived list pymdownx.highlight but with different sub-options.
    // The merged result must parse without "duplicated mapping key" and
    // deep-merge the option objects so both anchor_linenums and line_spans survive.
    const base = [
      'markdown_extensions:',
      '  - pymdownx.highlight:',
      '      anchor_linenums: true',
      '',
    ].join('\n');
    const derived = [
      'INHERIT: ./base.yml',
      'markdown_extensions:',
      '  - pymdownx.highlight:',
      '      line_spans: __span',
      '',
    ].join('\n');
    const fs = memFs({ '/proj/base.yml': base });
    const out = await resolveInherits(derived, '/proj/mkdocs.yml', fs);

    // Must parse without error
    const yaml = await import('js-yaml');
    expect(() => {
      yaml.load(out.source);
    }).not.toThrow();

    // Only ONE markdown_extensions key at the top level
    const keyCount = (out.source.match(/^markdown_extensions:/gm) ?? []).length;
    expect(keyCount).toBe(1);
  });
});
