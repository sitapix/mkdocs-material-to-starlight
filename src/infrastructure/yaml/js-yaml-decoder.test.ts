import { describe, expect, it } from 'vitest';
import { createJsYamlDecoder } from './js-yaml-decoder.js';

describe('createJsYamlDecoder', () => {
  const decoder = createJsYamlDecoder();

  it('decodes a simple mapping into a plain object', () => {
    const result = decoder.decode('site_name: My Docs\ndocs_dir: documentation\n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ site_name: 'My Docs', docs_dir: 'documentation' });
    }
  });

  it('decodes a nested structure including lists', () => {
    const yaml = [
      'nav:',
      '  - index.md',
      '  - Guide:',
      '      - guide/intro.md',
      '      - guide/setup.md',
      '',
    ].join('\n');
    const result = decoder.decode(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        nav: [
          'index.md',
          { Guide: ['guide/intro.md', 'guide/setup.md'] },
        ],
      });
    }
  });

  it('decodes an empty document as null', () => {
    const result = decoder.decode('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('returns a typed error for malformed YAML', () => {
    const result = decoder.decode('this: is\n  : broken: indentation\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('tolerates duplicate mapping keys (last value wins, matching PyYAML/MkDocs)', () => {
    // Real regression: khomesh24/docs has two `palette:` keys in mkdocs.yml.
    // PyYAML (and therefore MkDocs) silently keeps the last one. js-yaml is
    // strict by default. Match MkDocs behavior so the converter can run on
    // any config MkDocs would build.
    const source = 'theme:\n  palette:\n    - scheme: default\n  palette:\n    - scheme: slate\n';
    const result = decoder.decode(source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const obj = result.value as { theme: { palette: Array<{ scheme: string }> } };
      // Last `palette:` block wins — matches PyYAML semantics.
      expect(obj.theme.palette).toEqual([{ scheme: 'slate' }]);
    }
  });

  it('still rejects genuinely malformed YAML even with duplicate-key tolerance', () => {
    // The duplicate-key escape hatch must not swallow other parse errors.
    const result = decoder.decode('value: [unterminated\n');
    expect(result.ok).toBe(false);
  });

  it('rejects YAML with custom tags by default (safe-load semantics)', () => {
    const result = decoder.decode('value: !!js/function "function () { return 1; }"\n');
    expect(result.ok).toBe(false);
  });

  it('tolerates !!python/name tags by decoding them as opaque string markers', () => {
    // Real-world regression from fastapi/typer mkdocs.yml: pymdownx.superfences
    // uses `format: !!python/name:pymdownx.superfences.fence_code_format` to
    // reference a Python callable. Without tolerance, the entire conversion
    // aborts. The marker doesn't need to be the actual callable — it's only
    // used at MkDocs runtime, not during conversion.
    const result = decoder.decode(
      'format: !!python/name:pymdownx.superfences.fence_code_format\n',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        format: 'pymdownx.superfences.fence_code_format',
      });
    }
  });

  it('tolerates !!python/object/apply tags by decoding them as opaque markers', () => {
    // Used by pymdownx.arithmatex with mhchem and similar plugins.
    const result = decoder.decode(
      'fn: !!python/object/apply:foo.bar.make_thing\n  - 42\n',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The opaque marker preserves the dotted name; arguments are dropped.
      // Conversion code never invokes it, so this lossy mapping is acceptable.
      expect(result.value).toMatchObject({ fn: expect.stringContaining('foo.bar.make_thing') });
    }
  });

  it('still rejects !!js/function even when python tags are tolerated', () => {
    // Security regression guard: opening up python/* must not also open up
    // js/function (which can execute arbitrary JavaScript via js-yaml).
    const result = decoder.decode(
      'value: !!js/function "function () { return 1; }"\n',
    );
    expect(result.ok).toBe(false);
  });

  it('tolerates the !ENV scalar form (single env-var name)', () => {
    // mkdocs env-var plugin: `!ENV VAR_NAME` reads the env var at MkDocs run.
    // At conversion time we don't have the runtime env; preserve the var name
    // as an opaque marker so the surrounding config still parses.
    const result = decoder.decode('site_url: !ENV SITE_URL\n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ site_url: 'SITE_URL' });
    }
  });

  it('tolerates the !ENV sequence form by returning the trailing default value', () => {
    // `!ENV [VAR, default]` — mkdocs falls back to the last element when the
    // var is unset. At conversion time we always pick the default; that is
    // the right approximation for static analysis.
    const result = decoder.decode('flag: !ENV [CI, false]\n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ flag: false });
    }
  });

  it('tolerates !ENV sequence with multiple var names (mkdocs tries each in order)', () => {
    // `!ENV [VAR1, VAR2, default]` — last element is the default.
    const result = decoder.decode("title: !ENV [PROD_TITLE, STAGING_TITLE, 'My Site']\n");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: 'My Site' });
    }
  });

  it('decodes the python-tag inside a complex nested mkdocs config', () => {
    // The real shape from typer's mkdocs.yml: the python tag lives inside a
    // mapping that's part of a list item.
    const yaml = [
      'markdown_extensions:',
      '  - pymdownx.superfences:',
      '      custom_fences:',
      '        - name: mermaid',
      '          class: mermaid',
      '          format: !!python/name:pymdownx.superfences.fence_code_format',
      '',
    ].join('\n');
    const result = decoder.decode(yaml);
    expect(result.ok).toBe(true);
  });
});
