import { describe, expect, it } from 'vitest';
import { preprocessMkdocsPythonTags } from './preprocess-mkdocs-python-tags.js';

describe('preprocessMkdocsPythonTags', () => {
  it('returns source unchanged when no python tags', () => {
    const src = 'site_name: Demo\ndocs_dir: docs\n';
    const { source } = preprocessMkdocsPythonTags(src);
    expect(source).toBe(src);
  });

  it('strips !!python/name: scalar value, replacing with quoted opaque marker', () => {
    const { source, stripped } = preprocessMkdocsPythonTags(
      'emoji_index: !!python/name:material.extensions.emoji.twemoji\n',
    );
    expect(source).not.toContain('!!python/name');
    expect(source).toContain("'material.extensions.emoji.twemoji'");
    expect(stripped).toContain('material.extensions.emoji.twemoji');
  });

  it('strips !!python/object/apply: with kwds block (multi-line)', () => {
    const src = [
      'slugify: !!python/object/apply:pymdownx.slugs.slugify',
      '  kwds:',
      '    case: lower',
      '',
    ].join('\n');
    const { source, stripped } = preprocessMkdocsPythonTags(src);
    expect(source).not.toContain('!!python/object/apply');
    expect(stripped.length).toBeGreaterThan(0);
  });

  it('handles fence_code_format pattern', () => {
    const { source } = preprocessMkdocsPythonTags(
      'format: !!python/name:pymdownx.superfences.fence_code_format\n',
    );
    expect(source).not.toContain('!!python/name');
    expect(source).toContain("'pymdownx.superfences.fence_code_format'");
  });

  it('idempotent: re-running on output is a no-op', () => {
    const src =
      'emoji_index: !!python/name:material.extensions.emoji.twemoji\n';
    const first = preprocessMkdocsPythonTags(src);
    const second = preprocessMkdocsPythonTags(first.source);
    expect(second.source).toBe(first.source);
    expect(second.stripped).toEqual([]);
  });

  it('returns the list of stripped tag names for diagnostics', () => {
    const src = [
      'emoji_index: !!python/name:material.extensions.emoji.twemoji',
      'emoji_generator: !!python/name:material.extensions.emoji.to_svg',
      '',
    ].join('\n');
    const { stripped } = preprocessMkdocsPythonTags(src);
    expect(stripped).toContain('material.extensions.emoji.twemoji');
    expect(stripped).toContain('material.extensions.emoji.to_svg');
  });

  it("strips !!python/name: with trailing empty-string YAML marker (fastapi regression)", () => {
    // MkDocs Material commonly emits this form, where the trailing `''` is the
    // YAML scalar-presence marker. The regex must match it, otherwise the tag
    // leaks through and downstream YAML parsing fails on the inherited config.
    const { source } = preprocessMkdocsPythonTags(
      "format: !!python/name:pymdownx.superfences.fence_code_format ''\n",
    );
    expect(source).not.toContain('!!python/name');
    expect(source).toContain("'pymdownx.superfences.fence_code_format'");
  });

  it('preserves indentation of the value', () => {
    const src = [
      'pymdownx.emoji:',
      '  emoji_index: !!python/name:material.extensions.emoji.twemoji',
      '',
    ].join('\n');
    const { source } = preprocessMkdocsPythonTags(src);
    expect(source).toContain('  emoji_index: ');
  });
});
