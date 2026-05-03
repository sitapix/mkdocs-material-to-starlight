import { describe, expect, it } from 'vitest';
import { serializeSidebar } from './sidebar.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';

describe('serializeSidebar', () => {
  it('serializes an empty list to []', () => {
    expect(serializeSidebar([])).toBe('[]');
  });

  it('serializes a slug entry without a label as a string shorthand', () => {
    const entries: ReadonlyArray<SidebarEntry> = [{ kind: 'slug', slug: 'index' }];
    expect(serializeSidebar(entries)).toBe(`[\n  'index',\n]`);
  });

  it('serializes a slug entry with a label as an object', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      { kind: 'slug', slug: 'api/auth', label: 'API' },
    ];
    expect(serializeSidebar(entries)).toBe(
      `[\n  { slug: 'api/auth', label: 'API' },\n]`,
    );
  });

  it('serializes an empty-slug entry (root index) as a link to "/"', () => {
    // Real-world regression: Starlight rejects `{ slug: '' }` at build time
    // with "The slug '' does not exist" — even though `convertFile` happily
    // produces `index.md` whose slug is empty. Emitting a `{ link: '/' }`
    // form sidesteps the slug resolver entirely and is documented in
    // Starlight's sidebar configuration.
    const withLabel: ReadonlyArray<SidebarEntry> = [
      { kind: 'slug', slug: '', label: 'Introduction' },
    ];
    expect(serializeSidebar(withLabel)).toBe(
      `[\n  { label: 'Introduction', link: '/' },\n]`,
    );
  });

  it('serializes an empty-slug entry without a label as a bare link to "/"', () => {
    const withoutLabel: ReadonlyArray<SidebarEntry> = [{ kind: 'slug', slug: '' }];
    expect(serializeSidebar(withoutLabel)).toBe(`[\n  { link: '/' },\n]`);
  });

  it('serializes a link entry as { label, link }', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      { kind: 'link', label: 'NASA', href: 'https://www.nasa.gov/' },
    ];
    expect(serializeSidebar(entries)).toBe(
      `[\n  { label: 'NASA', link: 'https://www.nasa.gov/' },\n]`,
    );
  });

  it('serializes a manual group recursively', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      {
        kind: 'group',
        label: 'Guide',
        items: [{ kind: 'slug', slug: 'guide/intro' }],
      },
    ];
    const out = serializeSidebar(entries);
    expect(out).toContain(`label: 'Guide'`);
    expect(out).toContain(`items: [`);
    expect(out).toContain(`'guide/intro'`);
  });

  it('serializes an autogenerate group with directory', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      { kind: 'auto', label: 'Reference', directory: 'reference' },
    ];
    const out = serializeSidebar(entries);
    expect(out).toContain(`label: 'Reference'`);
    expect(out).toContain(`autogenerate: { directory: 'reference' }`);
  });

  it('escapes single quotes inside string values', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      { kind: 'link', label: "It's me", href: 'https://example.com/' },
    ];
    expect(serializeSidebar(entries)).toContain(`label: 'It\\'s me'`);
  });

  it('serializes deeply nested groups in a stable order', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      {
        kind: 'group',
        label: 'Top',
        items: [
          { kind: 'slug', slug: 'a' },
          {
            kind: 'group',
            label: 'Inner',
            items: [{ kind: 'slug', slug: 'inner/page' }],
          },
        ],
      },
    ];
    const out = serializeSidebar(entries);
    const aPos = out.indexOf(`'a'`);
    const innerPos = out.indexOf(`'Inner'`);
    expect(aPos).toBeGreaterThan(-1);
    expect(innerPos).toBeGreaterThan(aPos);
  });
});
