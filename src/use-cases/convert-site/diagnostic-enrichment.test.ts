import { describe, expect, it } from 'vitest';
import { enrichMissingDocsDirMessage } from './diagnostic-enrichment.js';

const BASE = 'directory-read-failed: directory not found: /repo/docs';

describe('enrichMissingDocsDirMessage', () => {
  it('passes through when there are no plugins and no layout hints', () => {
    expect(enrichMissingDocsDirMessage(BASE, [])).toBe(BASE);
  });

  it('names the gen-files plugin when present', () => {
    const out = enrichMissingDocsDirMessage(BASE, [{ name: 'gen-files' }]);
    expect(out).toContain('`gen-files`');
    expect(out).toContain('mkdocs build');
  });

  it('falls back to a generic plugin hint when no known generator is listed', () => {
    const out = enrichMissingDocsDirMessage(BASE, [{ name: 'search' }]);
    expect(out).toContain('lists 1 plugin');
    expect(out).toContain('`search`');
  });

  it('suggests `docs_dir: .` when markdown files sit next to mkdocs.yml', () => {
    // Real-world (jondot/awesome-react-native, Riverside-Software/pct-mkdocs):
    // legacy MkDocs sites where the docs live alongside mkdocs.yml without
    // an explicit `docs_dir: .`. Modern MkDocs defaults `docs_dir` to
    // `docs`, which doesn't exist on disk, so the converter errors out.
    // The hint must tell the user the exact one-line config edit to make.
    const out = enrichMissingDocsDirMessage(BASE, [], {
      configDirHasMarkdown: true,
      configDirRelative: '.',
      configuredDocsDir: 'docs',
    });
    expect(out).toContain('docs_dir');
    expect(out).toContain('.');
    expect(out).toMatch(/add.*`docs_dir: \.`|set.*`docs_dir: \.`/i);
  });

  it('suggests the right relative path when mkdocs.yml is in a subdirectory', () => {
    // yetone_olo / smarie_python-parsyfiles shape: mkdocs.yml is in
    // `docs/`, sources are next to it. From the project root the path
    // is still `.` (relative to the config), so the hint is identical.
    const out = enrichMissingDocsDirMessage(BASE, [], {
      configDirHasMarkdown: true,
      configDirRelative: 'docs',
      configuredDocsDir: 'docs',
    });
    expect(out).toContain('`docs_dir: .`');
  });

  it('mentions both the generator-plugin path AND the layout hint when both apply', () => {
    // Defensive: a project might have both a gen-files plugin AND
    // markdown next to mkdocs.yml (e.g. plugin generates extra pages on
    // top of the existing tree). Show the most actionable hint first
    // (layout, since the user can fix it in one config line) but keep
    // the plugin context.
    const out = enrichMissingDocsDirMessage(BASE, [{ name: 'gen-files' }], {
      configDirHasMarkdown: true,
      configDirRelative: '.',
      configuredDocsDir: 'docs',
    });
    expect(out).toContain('`docs_dir: .`');
    expect(out).toContain('gen-files');
  });

  it('does not suggest `docs_dir: .` when the configured dir is already `.`', () => {
    // If the user already wrote `docs_dir: .` and *still* fails, the
    // hint would be wrong/redundant. Suppress it.
    const out = enrichMissingDocsDirMessage(BASE, [], {
      configDirHasMarkdown: true,
      configDirRelative: '.',
      configuredDocsDir: '.',
    });
    expect(out).not.toContain('docs_dir: .');
  });
});
