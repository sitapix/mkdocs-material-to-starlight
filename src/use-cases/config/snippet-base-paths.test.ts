import { describe, expect, it } from 'vitest';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import { extractSnippetBasePaths } from './snippet-base-paths.js';

function configWith(extOptions: Readonly<Record<string, unknown>> | null): MkdocsConfig {
  return {
    siteName: 'x',
    docsDir: 'docs',
    useDirectoryUrls: false,
    copyright: null,
    repoName: null,
    siteUrl: null,
    siteDescription: null,
    repoUrl: null,
    editUri: null,
    nav: null,
    plugins: [],
    theme: null,
    markdownExtensions:
      extOptions === null ? [] : [{ name: 'pymdownx.snippets', options: extOptions }],
    extras: {},
  };
}

describe('extractSnippetBasePaths', () => {
  it('returns the empty array when pymdownx.snippets is not configured', () => {
    expect(extractSnippetBasePaths(configWith(null))).toEqual([]);
  });

  it('returns the configured base_path list when present', () => {
    const config = configWith({ base_path: ['.', 'docs/source/src/'] });
    expect(extractSnippetBasePaths(config)).toEqual(['.', 'docs/source/src/']);
  });

  it('coerces a single-string base_path into a one-element list', () => {
    const config = configWith({ base_path: 'snippets/' });
    expect(extractSnippetBasePaths(config)).toEqual(['snippets/']);
  });

  it('falls back to ["docs"] when pymdownx.snippets is configured without a base_path', () => {
    // Material's default for pymdownx.snippets when no base_path is given is
    // the project root, but in MkDocs sites the docs/ folder is the most
    // useful starting point and matches what users almost always need.
    const config = configWith({});
    expect(extractSnippetBasePaths(config)).toEqual(['docs']);
  });

  it('skips non-string entries in a base_path array', () => {
    const config = configWith({ base_path: ['docs', 42, null, 'src'] });
    expect(extractSnippetBasePaths(config)).toEqual(['docs', 'src']);
  });

  it('falls back to ["docs"] when base_path is an unexpected type', () => {
    const config = configWith({ base_path: 42 });
    expect(extractSnippetBasePaths(config)).toEqual(['docs']);
  });
});
