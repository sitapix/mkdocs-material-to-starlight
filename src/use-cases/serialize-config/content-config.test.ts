import { describe, expect, it } from 'vitest';
import { serializeContentConfig } from './content-config.js';

describe('serializeContentConfig', () => {
  it('emits a valid TS module that defines the docs collection with docsLoader and docsSchema', () => {
    // Without an explicit src/content.config.ts, Astro v5 auto-generates a
    // glob-based content collection that does not match what Starlight's
    // sidebar slug resolver expects. The result is `astro build` failing
    // with "The slug X does not exist" on every entry. Emitting an explicit
    // content config wired to docsLoader fixes this.
    const out = serializeContentConfig();
    expect(out).toContain(`from 'astro:content'`);
    expect(out).toContain(`from '@astrojs/starlight/loaders'`);
    expect(out).toContain(`from '@astrojs/starlight/schema'`);
    expect(out).toContain('defineCollection');
    expect(out).toContain('docsLoader()');
    expect(out).toContain('docsSchema(');
    expect(out).toContain('docs:');
  });

  it('emits a module with `export const collections`', () => {
    const out = serializeContentConfig();
    expect(out).toContain('export const collections');
  });

  it('emits output that ends with a newline', () => {
    const out = serializeContentConfig();
    expect(out.endsWith('\n')).toBe(true);
  });
});
