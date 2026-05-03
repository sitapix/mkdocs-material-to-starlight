import { describe, expect, it } from 'vitest';
import { createJsYamlDecoder } from '../../src/infrastructure/yaml/js-yaml-decoder.js';
import { parseMkdocsConfig } from '../../src/use-cases/config/parse-mkdocs.js';
import { parseNavTree } from '../../src/use-cases/config/nav-tree.js';
import { buildSlugMap } from '../../src/domain/starlight/slug-map.js';
import { compileNavigation } from '../../src/use-cases/compile-navigation/compile.js';
import { convertFile } from '../../src/use-cases/convert-file/convert.js';

/**
 * End-to-end smoke test on a tiny MkDocs Material site.
 *
 * Wires every component built so far:
 *   - js-yaml decoder            (infrastructure)
 *   - mkdocs config + nav parser (use-cases/config)
 *   - slug map                   (domain)
 *   - navigation compiler        (use-cases)
 *   - per-file converter         (use-cases/convert-file)
 *     ↳ pre-parse normalize (admonitions, content tabs)
 *     ↳ unified parse + frontmatter + gfm + directive
 *     ↳ admonition directive transformer (Material → Starlight)
 *     ↳ icon transformer (Material/FA/Octicons → Starlight icon directives)
 *     ↳ link transformer (relative .md → /slug)
 *     ↳ remark-stringify
 *
 * The only thing missing is filesystem traversal; the test supplies sources
 * inline. The next round will add the site walker that consumes a directory.
 */

const FIXTURE_MKDOCS_YAML = `
site_name: Demo Project
site_description: Demonstration site for the converter.
docs_dir: docs

theme:
  name: material

nav:
  - Home: index.md
  - Guide:
      - Introduction: guide/intro.md
  - API: api/auth.md

markdown_extensions:
  - admonition
  - pymdownx.tabbed
`;

const FIXTURE_FILES: Record<string, string> = {
  'index.md': [
    '---',
    'title: Welcome',
    '---',
    '',
    '# Demo',
    '',
    'Click :material-rocket: to launch.',
    '',
    '!!! warning "Heads up"',
    '    Be careful with [this](api/auth.md).',
    '',
    '=== "macOS"',
    '    brew install foo',
    '',
    '=== "Linux"',
    '    apt install foo',
    '',
  ].join('\n'),
  'guide/intro.md': [
    '# Introduction',
    '',
    '!!! note',
    '    See the [auth guide](../api/auth.md).',
    '',
  ].join('\n'),
  'api/auth.md': [
    '# Authentication',
    '',
    '!!! danger "Security"',
    '    Never commit tokens.',
    '',
    'See :fontawesome-brands-github: for sources.',
    '',
  ].join('\n'),
};

describe('end-to-end smoke conversion', () => {
  it('converts a tiny MkDocs site into Starlight-shaped artifacts', () => {
    const decoder = createJsYamlDecoder();
    const decoded = decoder.decode(FIXTURE_MKDOCS_YAML);
    if (!decoded.ok) throw new Error(decoded.error.message);

    const config = parseMkdocsConfig(decoded.value);
    if (!config.ok) throw new Error(config.error.message);
    expect(config.value.siteName).toBe('Demo Project');

    const navTree = parseNavTree(config.value.nav ?? []);
    if (!navTree.ok) throw new Error(navTree.error.message);

    const slugMap = buildSlugMap(Object.keys(FIXTURE_FILES));
    if (!slugMap.ok) throw new Error(slugMap.error.message);

    const sidebar = compileNavigation(navTree.value, slugMap.value);
    expect(sidebar.diagnostics).toEqual([]);
    expect(sidebar.entries).toHaveLength(3);

    const converted: Record<string, string> = {};
    const allDiagnostics: string[] = [];
    for (const [sourcePath, source] of Object.entries(FIXTURE_FILES)) {
      const result = convertFile({ source, sourcePath, slugMap: slugMap.value });
      converted[sourcePath] = result.text;
      for (const d of result.diagnostics) {
        allDiagnostics.push(`${sourcePath}: ${d.ruleId}: ${d.message}`);
      }
    }

    expect(allDiagnostics).toEqual([]);

    const indexOut = converted['index.md'] ?? '';
    expect(indexOut).toContain('title: Welcome');
    expect(indexOut).toContain(':icon[rocket]');
    expect(indexOut).toContain(':::caution');
    expect(indexOut).toContain('Heads up');
    expect(indexOut).toContain('[this](/api/auth)');
    expect(indexOut).toContain('<div class="sl-tabs">');
    expect(indexOut).toContain('data-label="macOS"');

    const guideOut = converted['guide/intro.md'] ?? '';
    expect(guideOut).toContain(':::note');
    expect(guideOut).toContain('[auth guide](/api/auth)');

    const apiOut = converted['api/auth.md'] ?? '';
    expect(apiOut).toContain(':::danger');
    expect(apiOut).toContain('Security');
    expect(apiOut).toContain(':icon[github]');
  });

  it('the site is idempotent when re-converted', () => {
    const slugMap = buildSlugMap(Object.keys(FIXTURE_FILES));
    if (!slugMap.ok) throw new Error(slugMap.error.message);

    for (const [sourcePath, source] of Object.entries(FIXTURE_FILES)) {
      const first = convertFile({ source, sourcePath, slugMap: slugMap.value });
      const second = convertFile({
        source: first.text,
        sourcePath,
        slugMap: slugMap.value,
      });
      expect(second.text).toBe(first.text);
    }
  });
});
