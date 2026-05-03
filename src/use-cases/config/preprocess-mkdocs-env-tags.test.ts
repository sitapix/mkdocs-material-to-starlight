import { describe, expect, it } from 'vitest';
import { preprocessMkdocsEnvTags } from './preprocess-mkdocs-env-tags.js';

describe('preprocessMkdocsEnvTags', () => {
  it('passes through YAML with no !ENV tags', () => {
    const input = 'site_name: My Docs\ndocs_dir: docs\n';
    expect(preprocessMkdocsEnvTags(input)).toBe(input);
  });

  it('substitutes `!ENV [VAR, default]` (sequence form) with the trailing default', () => {
    // mkdocs's env-var plugin returns `default` when the var is unset. At
    // conversion time we always pick the default; matches the static value
    // the converter should reason about. Substituting before js-yaml sees
    // the source sidesteps the parser limitation around explicit tags on
    // complex mapping keys.
    const input = 'docs_dir: !ENV [BUILD_DOCS_DIR, "docs"]\n';
    expect(preprocessMkdocsEnvTags(input)).toBe('docs_dir: "docs"\n');
  });

  it('substitutes `!ENV [VAR1, VAR2, default]` with the trailing element', () => {
    const input = 'title: !ENV [PROD_TITLE, STAGING_TITLE, "My Site"]\n';
    expect(preprocessMkdocsEnvTags(input)).toBe('title: "My Site"\n');
  });

  it('substitutes `!ENV VAR` (scalar form) with a quoted string of the var name', () => {
    // The scalar form has no default. Substituting the var name as a
    // literal string keeps the YAML parseable and gives the converter a
    // recognizable opaque marker that survives downstream.
    const input = 'site_url: !ENV SITE_URL\n';
    expect(preprocessMkdocsEnvTags(input)).toBe('site_url: "SITE_URL"\n');
  });

  it('substitutes `!ENV` used as a mapping key (the privacyguides case)', () => {
    // Real-world regression from privacyguides.org — js-yaml chokes on
    // explicit tags as mapping keys with sequence values. Substituting
    // the default first turns this into vanilla YAML.
    const input = '- !ENV [NAV_HOME, "Home"]: "index.md"\n';
    expect(preprocessMkdocsEnvTags(input)).toBe('- "Home": "index.md"\n');
  });

  it('substitutes a nested !ENV value (inside a mapping value)', () => {
    const input = [
      'extra:',
      '  context: !ENV [BUILD_CONTEXT, "production"]',
      '  offline: !ENV [BUILD_OFFLINE, false]',
      '',
    ].join('\n');
    expect(preprocessMkdocsEnvTags(input)).toBe(
      [
        'extra:',
        '  context: "production"',
        '  offline: false',
        '',
      ].join('\n'),
    );
  });

  it('handles a `false` default literally (not as a string)', () => {
    const input = 'flag: !ENV [BUILD_FLAG, false]\n';
    expect(preprocessMkdocsEnvTags(input)).toBe('flag: false\n');
  });

  it('handles a numeric default literally', () => {
    const input = 'limit: !ENV [BUILD_LIMIT, 42]\n';
    expect(preprocessMkdocsEnvTags(input)).toBe('limit: 42\n');
  });

  it('does not substitute inside a YAML comment', () => {
    // Comments are not processed — mkdocs does not interpret them, neither
    // should the substitution.
    const input = '# example: !ENV [VAR, "default"]\nreal: value\n';
    expect(preprocessMkdocsEnvTags(input)).toBe(input);
  });

  it('does not substitute inside a single-quoted string literal', () => {
    // A literal `!ENV [...]` inside a quoted string must NOT be touched —
    // it's a string, not a tagged value.
    const input = "label: '!ENV [foo, bar]'\n";
    expect(preprocessMkdocsEnvTags(input)).toBe(input);
  });

  it('is idempotent — running it twice produces the same output as once', () => {
    const input = [
      'docs_dir: !ENV [BUILD_DOCS_DIR, "docs"]',
      'flag: !ENV [BUILD_FLAG, false]',
      '',
    ].join('\n');
    const once = preprocessMkdocsEnvTags(input);
    const twice = preprocessMkdocsEnvTags(once);
    expect(twice).toBe(once);
  });
});
