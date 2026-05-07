import { describe, expect, it } from 'vitest';
import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';
import { extractRedirects } from './redirects.js';

function pluginsWith(plugin: MkdocsPlugin): ReadonlyArray<MkdocsPlugin> {
  return [plugin];
}

describe('extractRedirects', () => {
  it('returns an empty map when no redirects plugin is configured', () => {
    expect(extractRedirects([])).toEqual({});
    expect(extractRedirects([{ name: 'search', options: {} }])).toEqual({});
  });

  it('returns an empty map when the redirects plugin has no redirect_maps', () => {
    expect(extractRedirects(pluginsWith({ name: 'redirects', options: {} }))).toEqual({});
  });

  it('translates a single .md redirect mapping into Starlight slug pairs', () => {
    const out = extractRedirects(
      pluginsWith({
        name: 'redirects',
        options: { redirect_maps: { 'old/page.md': 'new/page.md' } },
      }),
    );
    expect(out).toEqual({ '/old/page': '/new/page' });
  });

  it('translates multiple mappings preserving each pair', () => {
    const out = extractRedirects(
      pluginsWith({
        name: 'redirects',
        options: {
          redirect_maps: {
            'a.md': 'b.md',
            'guides/old.md': 'guides/new.md',
          },
        },
      }),
    );
    expect(out['/a']).toBe('/b');
    expect(out['/guides/old']).toBe('/guides/new');
  });

  it('handles index.md → / translation per Starlight slug convention', () => {
    const out = extractRedirects(
      pluginsWith({
        name: 'redirects',
        options: { redirect_maps: { 'old/index.md': 'new/index.md' } },
      }),
    );
    expect(out).toEqual({ '/old': '/new' });
  });

  it('preserves an absolute or external destination URL untouched', () => {
    const out = extractRedirects(
      pluginsWith({
        name: 'redirects',
        options: { redirect_maps: { 'gone.md': 'https://elsewhere.example/page' } },
      }),
    );
    expect(out['/gone']).toBe('https://elsewhere.example/page');
  });

  it('skips redirect entries with non-string keys/values (defensive)', () => {
    const out = extractRedirects(
      pluginsWith({
        name: 'redirects',
        options: {
          redirect_maps: {
            'good.md': 'fine.md',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'broken.md': 42 as any,
          },
        },
      }),
    );
    expect(out['/good']).toBe('/fine');
    expect(out['/broken']).toBeUndefined();
  });
});
