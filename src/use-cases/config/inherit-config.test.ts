import { describe, expect, it } from 'vitest';
import { resolveInherits } from './inherit-config.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { ok, err } from '../../domain/result.js';

function memFs(files: Record<string, string>): FileSystem {
  return {
    async readText(p) {
      const v = files[p];
      if (v === undefined) return err({ code: 'not-found', path: p, message: '' });
      return ok(v);
    },
    async exists(p) {
      return Object.prototype.hasOwnProperty.call(files, p);
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
});
