import { describe, expect, it } from 'vitest';
import { buildSlugMap } from '../../src/domain/starlight/slug-map.js';
import { createJsYamlDecoder } from '../../src/infrastructure/yaml/js-yaml-decoder.js';
import { compileNavigation } from '../../src/use-cases/compile-navigation/compile.js';
import { parseNavTree } from '../../src/use-cases/config/nav-tree.js';
import { parseMkdocsConfig } from '../../src/use-cases/config/parse-mkdocs.js';

/**
 * End-to-end test of the *pure* config pipeline:
 *
 *   YAML text
 *     → js-yaml decoder       (infrastructure/yaml)
 *     → parseMkdocsConfig     (use-cases/config)
 *     → parseNavTree          (use-cases/config)
 *     → buildSlugMap          (domain/starlight)
 *     → compileNavigation     (use-cases/compile-navigation)
 *
 * No file system, no network — only the YAML adapter and pure functions.
 * This is the highest-level test that does not yet need AST processing.
 */

const FIXTURE_YAML = `
site_name: My Project
site_description: A demonstration site.
site_url: https://example.com/
docs_dir: docs
use_directory_urls: true
edit_uri: edit/main/docs/

theme:
  name: material
  palette:
    primary: indigo

nav:
  - Home: index.md
  - Guide:
      - Introduction: guide/intro.md
      - Setup: guide/setup.md
  - API:
      - api/auth.md
      - api/users.md
  - NASA: https://www.nasa.gov/

markdown_extensions:
  - admonition
  - pymdownx.superfences
  - pymdownx.tabbed:
      alternate_style: true
`;

const SOURCE_PATHS = [
  'index.md',
  'guide/intro.md',
  'guide/setup.md',
  'api/auth.md',
  'api/users.md',
];

describe('config pipeline integration', () => {
  it('runs the full pure pipeline end-to-end', () => {
    const decoder = createJsYamlDecoder();

    const decoded = decoder.decode(FIXTURE_YAML);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error(decoded.error.message);
    }

    const config = parseMkdocsConfig(decoded.value);
    expect(config.ok).toBe(true);
    if (!config.ok) {
      throw new Error(config.error.message);
    }
    expect(config.value.siteName).toBe('My Project');
    expect(config.value.theme?.name).toBe('material');
    expect(config.value.markdownExtensions).toHaveLength(3);

    const nav = parseNavTree(config.value.nav ?? []);
    expect(nav.ok).toBe(true);
    if (!nav.ok) {
      throw new Error(nav.error.message);
    }

    const slugMap = buildSlugMap(SOURCE_PATHS);
    expect(slugMap.ok).toBe(true);
    if (!slugMap.ok) {
      throw new Error(slugMap.error.message);
    }

    const sidebar = compileNavigation(nav.value, slugMap.value);
    expect(sidebar.diagnostics).toEqual([]);

    expect(sidebar.entries).toEqual([
      { kind: 'slug', slug: '', label: 'Home' },
      {
        kind: 'group',
        label: 'Guide',
        items: [
          { kind: 'slug', slug: 'guide/intro', label: 'Introduction' },
          { kind: 'slug', slug: 'guide/setup', label: 'Setup' },
        ],
      },
      {
        kind: 'group',
        label: 'API',
        items: [
          { kind: 'slug', slug: 'api/auth' },
          { kind: 'slug', slug: 'api/users' },
        ],
      },
      { kind: 'link', label: 'NASA', href: 'https://www.nasa.gov/' },
    ]);
  });

  it('emits a diagnostic and drops the entry when nav references a missing file', () => {
    // Diagnostic-first contract (CLAUDE.md): a missing nav target must not
    // abort the conversion. The entry is dropped from the sidebar and the
    // missing path is reported via a `nav-missing-target` diagnostic so the
    // rest of the pipeline can still run.
    const yaml = 'site_name: X\nnav:\n  - missing.md\n';
    const decoder = createJsYamlDecoder();
    const decoded = decoder.decode(yaml);
    if (!decoded.ok) throw new Error(decoded.error.message);
    const config = parseMkdocsConfig(decoded.value);
    if (!config.ok) throw new Error(config.error.message);
    const nav = parseNavTree(config.value.nav ?? []);
    if (!nav.ok) throw new Error(nav.error.message);
    const slugMap = buildSlugMap([]);
    if (!slugMap.ok) throw new Error(slugMap.error.message);

    const sidebar = compileNavigation(nav.value, slugMap.value);
    expect(sidebar.entries).toEqual([]);
    expect(sidebar.diagnostics).toHaveLength(1);
    expect(sidebar.diagnostics[0]?.ruleId).toBe('nav-missing-target');
    expect(sidebar.diagnostics[0]?.message).toContain('missing.md');
  });
});
