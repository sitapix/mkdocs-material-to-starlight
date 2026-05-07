/**
 * Real-world config smoke test.
 *
 * For every mkdocs.yml saved in tests/fixtures/real-configs/, run the full
 * preprocess + YAML decode + parse pipeline. Each must produce a valid
 * MkdocsConfig without throwing.
 *
 * Catches YAML edge cases that synthetic tests miss: !ENV tags,
 * !!python/name: callables, !!python/object/apply: with kwds, INHERIT,
 * mixed nav shapes, free-form extras under `extra:`, etc.
 *
 * The harness only exercises the config-decode path; full conversion
 * (which requires real content) is in `real-projects-e2e.test.ts`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../src/domain/ports/file-system.js';
import { err, ok } from '../../src/domain/result.js';
import { createJsYamlDecoder } from '../../src/infrastructure/yaml/js-yaml-decoder.js';
import { resolveInherits } from '../../src/use-cases/config/inherit-config.js';
import { parseMkdocsConfig } from '../../src/use-cases/config/parse-mkdocs.js';
import { preprocessMkdocsEnvTags } from '../../src/use-cases/config/preprocess-mkdocs-env-tags.js';
import { preprocessMkdocsPythonTags } from '../../src/use-cases/config/preprocess-mkdocs-python-tags.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'real-configs');

function fixtureFs(): FileSystem {
  return {
    async readText(path) {
      try {
        return ok(readFileSync(path, 'utf8'));
      } catch (cause) {
        return err({
          code: 'not-found',
          path,
          message: cause instanceof Error ? cause.message : 'read failed',
        });
      }
    },
    async exists() {
      return false;
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

async function pipeline(filePath: string): Promise<{
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  const raw = readFileSync(filePath, 'utf8');
  const fs = fixtureFs();
  const inherited = await resolveInherits(raw, filePath, fs);
  const pythonStripped = preprocessMkdocsPythonTags(preprocessMkdocsEnvTags(inherited.source));
  const decoder = createJsYamlDecoder();
  const decoded = decoder.decode(pythonStripped.source);
  if (!decoded.ok) {
    return { ok: false, errorCode: 'yaml-decode-failed', errorMessage: decoded.error.message };
  }
  const config = parseMkdocsConfig(decoded.value);
  if (!config.ok) {
    return { ok: false, errorCode: 'config-invalid', errorMessage: config.error.message };
  }
  return { ok: true };
}

describe('real-world mkdocs.yml smoke test', () => {
  // Skip configs that are INHERIT bases (no site_name on their own; loaded
  // as a parent by another config). They're not entry-point configs.
  const INHERIT_BASES = new Set(['corpus-07-base.yml', 'corpus-19-base.yml']);
  const files = readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.yml'))
    .filter((f) => !INHERIT_BASES.has(f))
    .sort();

  it('found at least 20 real configs', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  for (const filename of files) {
    it(`parses ${filename} without throwing`, async () => {
      const result = await pipeline(join(FIXTURES, filename));
      if (!result.ok) {
        // Surface the failure with the filename so we know which to fix.
        throw new Error(`${filename}: ${result.errorCode}: ${result.errorMessage}`);
      }
      expect(result.ok).toBe(true);
    });
  }
});
