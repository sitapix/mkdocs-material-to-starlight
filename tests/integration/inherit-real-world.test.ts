/**
 * Regression test: INHERIT: deep-merge with overlapping keys must not crash.
 *
 * Before the fix, resolveInherits concatenated base + derived YAML strings.
 * When both files declared the same top-level key (e.g. both listed
 * pymdownx.highlight under markdown_extensions), the merged string contained
 * duplicated mapping keys and js-yaml threw "duplicated mapping key" in strict
 * mode, aborting the entire conversion.
 *
 * This reproduces the crash pattern from tiangolo/fastapi, tiangolo/typer,
 * and tiangolo/sqlmodel.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('INHERIT: real-world regression (tiangolo/* crash)', () => {
  it('converts a project with overlapping markdown_extensions in base + derived YAML', async () => {
    // Arrange: two-file MkDocs project in sibling directories where base and
    // derived both declare pymdownx.highlight with different option sets.
    // Before the fix this would produce a duplicated-key YAML that js-yaml
    // rejected at decode time, exiting with code 1 and no output.
    const rootDir = mkdtempSync(join(tmpdir(), 'mts-inherit-root-'));
    const baseDir = join(rootDir, 'base');
    const projectDir = join(rootDir, 'derived');
    const outputDir = mkdtempSync(join(tmpdir(), 'mts-inherit-out-'));
    try {
      mkdirSync(baseDir, { recursive: true });
      mkdirSync(join(projectDir, 'docs'), { recursive: true });

      // Write the base config: declares pymdownx.highlight with anchor_linenums
      writeFileSync(
        join(baseDir, 'base.yml'),
        [
          'site_name: Base Site',
          'theme:',
          '  name: material',
          '  features:',
          '    - navigation.tabs',
          'markdown_extensions:',
          '  - pymdownx.highlight:',
          '      anchor_linenums: true',
          '  - admonition',
          '',
        ].join('\n'),
      );

      // Write the derived config: also declares pymdownx.highlight with
      // line_spans — this produces the duplicate key that triggers the crash.
      writeFileSync(
        join(projectDir, 'mkdocs.yml'),
        [
          'INHERIT: ../base/base.yml',
          'site_name: Derived Site',
          'markdown_extensions:',
          '  - pymdownx.highlight:',
          '      line_spans: __span',
          '',
        ].join('\n'),
      );

      writeFileSync(join(projectDir, 'docs', 'index.md'), '# Welcome\n\nHello world.\n');

      // Act: conversion must not crash
      const result = await convertSiteFromDisk({ projectDir, outputDir });

      // Assert: successful conversion (no yaml-decode-failed error)
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Conversion failed: ${JSON.stringify(result.error)}`);
      }

      // The output file should exist and contain the title
      const indexOut = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.md'), 'utf8');
      expect(indexOut).toContain('Welcome');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
