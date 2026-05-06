import { describe, expect, it } from 'vitest';
import { serializeBiomeConfig } from './biome-config.js';

describe('serializeBiomeConfig', () => {
  it('emits a valid JSON document with a Biome schema URL', () => {
    const out = serializeBiomeConfig();
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(typeof parsed.$schema).toBe('string');
    expect(parsed.$schema).toMatch(/biomejs\.dev\/schemas\//);
  });

  it('is byte-identical on repeated calls (idempotent)', () => {
    expect(serializeBiomeConfig()).toBe(serializeBiomeConfig());
  });

  it('explicitly excludes Markdown and MDX so remark-stringify output stays canonical', () => {
    const out = serializeBiomeConfig();
    const parsed = JSON.parse(out) as { files?: { includes?: string[] } };
    const includes = parsed.files?.includes ?? [];
    expect(includes).toContain('!**/*.md');
    expect(includes).toContain('!**/*.mdx');
  });

  it('excludes generated MIGRATION_NOTES.md and build dirs', () => {
    const out = serializeBiomeConfig();
    const parsed = JSON.parse(out) as { files?: { includes?: string[] } };
    const includes = parsed.files?.includes ?? [];
    expect(includes).toContain('!MIGRATION_NOTES.md');
    expect(includes).toContain('!dist');
    expect(includes).toContain('!node_modules');
    expect(includes).toContain('!.astro');
  });

  it('enables the formatter and linter with recommended rules', () => {
    const parsed = JSON.parse(serializeBiomeConfig()) as {
      formatter?: { enabled?: boolean };
      linter?: { enabled?: boolean; rules?: { recommended?: boolean } };
    };
    expect(parsed.formatter?.enabled).toBe(true);
    expect(parsed.linter?.enabled).toBe(true);
    expect(parsed.linter?.rules?.recommended).toBe(true);
  });

  it('ends with a single trailing newline (matches other scaffold serializers)', () => {
    const out = serializeBiomeConfig();
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});
