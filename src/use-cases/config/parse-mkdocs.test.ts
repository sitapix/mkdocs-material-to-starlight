import { describe, expect, it } from 'vitest';
import { parseMkdocsConfig } from './parse-mkdocs.js';

describe('parseMkdocsConfig', () => {
  it('rejects a non-object input', () => {
    const result = parseMkdocsConfig(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/object/i);
    }
  });

  it('rejects a missing site_name', () => {
    const result = parseMkdocsConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/site_name/);
    }
  });

  it('parses minimal valid input', () => {
    const result = parseMkdocsConfig({ site_name: 'My Docs' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.siteName).toBe('My Docs');
      expect(result.value.docsDir).toBe('docs');
      expect(result.value.useDirectoryUrls).toBe(true);
      expect(result.value.nav).toBeNull();
      expect(result.value.plugins).toEqual([]);
      expect(result.value.markdownExtensions).toEqual([]);
    }
  });

  it('preserves overrides for docs_dir and use_directory_urls', () => {
    const result = parseMkdocsConfig({
      site_name: 'X',
      docs_dir: 'documentation',
      use_directory_urls: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.docsDir).toBe('documentation');
      expect(result.value.useDirectoryUrls).toBe(false);
    }
  });

  it('captures site_url, site_description, repo_url, and edit_uri', () => {
    const result = parseMkdocsConfig({
      site_name: 'X',
      site_description: 'A description.',
      site_url: 'https://example.com/',
      repo_url: 'https://github.com/me/repo',
      edit_uri: 'edit/main/docs/',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.siteDescription).toBe('A description.');
      expect(result.value.siteUrl).toBe('https://example.com/');
      expect(result.value.repoUrl).toBe('https://github.com/me/repo');
      expect(result.value.editUri).toBe('edit/main/docs/');
    }
  });

  it('parses theme with options', () => {
    const result = parseMkdocsConfig({
      site_name: 'X',
      theme: { name: 'material', palette: { primary: 'indigo' } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.theme).toEqual({
        name: 'material',
        options: { palette: { primary: 'indigo' } },
      });
    }
  });

  it('parses plugins as bare names and as { name: options } maps', () => {
    const result = parseMkdocsConfig({
      site_name: 'X',
      plugins: ['search', { 'awesome-pages': { collapse_single_pages: true } }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.plugins).toEqual([
        { name: 'search', options: {} },
        { name: 'awesome-pages', options: { collapse_single_pages: true } },
      ]);
    }
  });

  it('parses markdown_extensions list', () => {
    const result = parseMkdocsConfig({
      site_name: 'X',
      markdown_extensions: [
        'admonition',
        { 'pymdownx.tabbed': { alternate_style: true } },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.markdownExtensions).toEqual([
        { name: 'admonition', options: {} },
        { name: 'pymdownx.tabbed', options: { alternate_style: true } },
      ]);
    }
  });

  it('preserves nav as raw entries (parseNavTree handles structure separately)', () => {
    const navYaml = ['index.md', { Guide: ['a.md', 'b.md'] }];
    const result = parseMkdocsConfig({ site_name: 'X', nav: navYaml });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nav).not.toBeNull();
    }
  });

  it('moves unknown top-level keys into extras', () => {
    const result = parseMkdocsConfig({
      site_name: 'X',
      not_a_known_field: { a: 1 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.extras).toEqual({ not_a_known_field: { a: 1 } });
    }
  });
});
