import { describe, expect, it } from 'vitest';
import { detectExtraWarnings } from './extra-warnings.js';

describe('detectExtraWarnings', () => {
  it('returns no diagnostics when extras is empty', () => {
    expect(detectExtraWarnings({})).toHaveLength(0);
  });

  it('emits a consent warning when extra.consent is set', () => {
    const diags = detectExtraWarnings({
      extra: { consent: { title: 'Cookies', description: 'We use cookies.' } },
    });
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('extra-consent-no-equivalent');
    expect(diags[0]?.severity).toBe('warning');
  });

  it('emits a status info diagnostic when extra.status is set', () => {
    const diags = detectExtraWarnings({
      extra: { status: { new: 'Recently added', deprecated: 'Will be removed' } },
    });
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('extra-status-no-equivalent');
    expect(diags[0]?.severity).toBe('info');
  });

  it('emits an info diagnostic when extra.annotate (custom annotation selectors) is set', () => {
    const diags = detectExtraWarnings({
      extra: { annotate: { json: ['.s2'] } },
    });
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('extra-annotate-no-equivalent');
    expect(diags[0]?.severity).toBe('info');
    expect(diags[0]?.message).toContain('annotate');
    expect(diags[0]?.message).toContain('json');
  });

  it('emits both diagnostics when both consent and status are set', () => {
    const diags = detectExtraWarnings({
      extra: {
        consent: { title: 'Cookies' },
        status: { new: 'New' },
      },
    });
    expect(diags).toHaveLength(2);
    const ids = diags.map((d) => d.ruleId).sort();
    expect(ids).toEqual(['extra-consent-no-equivalent', 'extra-status-no-equivalent']);
  });

  it('also accepts extras directly without an extra: wrapper key', () => {
    // Some test fixtures pass the inner `extra` dict directly (mirroring how
    // extra-alternate.ts handles both shapes).
    const diags = detectExtraWarnings({ consent: { title: 'X' } });
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('extra-consent-no-equivalent');
  });

  it('ignores non-object consent / status values', () => {
    expect(detectExtraWarnings({ extra: { consent: false } })).toHaveLength(0);
    expect(detectExtraWarnings({ extra: { status: null } })).toHaveLength(0);
  });

  it('mentions starlight-recommended fallbacks in the messages', () => {
    const consent = detectExtraWarnings({ extra: { consent: { title: 'X' } } });
    const status = detectExtraWarnings({ extra: { status: { new: 'X' } } });
    expect(consent[0]?.message).toMatch(/cookie|consent/i);
    expect(status[0]?.message).toMatch(/Badge|frontmatter/i);
  });

  describe('analytics provider fallbacks', () => {
    it('recommends starlight-plausible when provider=plausible', () => {
      const diags = detectExtraWarnings({
        extra: {
          analytics: { provider: 'plausible', domain: 'example.com' },
        },
      });
      expect(diags).toHaveLength(1);
      expect(diags[0]?.ruleId).toBe('extra-analytics-provider-recommended');
      expect(diags[0]?.message).toMatch(/starlight-plausible/);
    });

    it('recommends starlight-gtm when provider=tag-manager', () => {
      // Material's `tag-manager` is the GTM provider key in some setups;
      // also accept `gtm` as a synonym.
      const diags = detectExtraWarnings({
        extra: {
          analytics: { provider: 'tag-manager', property: 'GTM-XXXXXX' },
        },
      });
      expect(diags).toHaveLength(1);
      expect(diags[0]?.message).toMatch(/starlight-gtm/);
    });

    it('emits a generic warning for custom analytics providers', () => {
      const diags = detectExtraWarnings({
        extra: { analytics: { provider: 'custom' } },
      });
      expect(diags).toHaveLength(1);
      expect(diags[0]?.severity).toBe('warning');
      expect(diags[0]?.message).toMatch(/manual|head/i);
    });

    it('does not emit a recommendation when provider=google (already handled)', () => {
      const diags = detectExtraWarnings({
        extra: { analytics: { provider: 'google', property: 'G-X' } },
      });
      expect(diags).toHaveLength(0);
    });
  });

  describe('extra.tags alias map', () => {
    it('emits an info diagnostic when extra.tags maps tag-names to identifiers', () => {
      const diags = detectExtraWarnings({
        extra: { tags: { HTML5: 'html', JavaScript: 'js' } },
      });
      const tagDiag = diags.find((d) => d.ruleId === 'extra-tags-alias-map');
      expect(tagDiag).toBeDefined();
      expect(tagDiag?.severity).toBe('info');
      expect(tagDiag?.message).toMatch(/starlight-tags/);
    });

    it('does not emit when extra.tags is absent', () => {
      const diags = detectExtraWarnings({ extra: {} });
      expect(diags.find((d) => d.ruleId === 'extra-tags-alias-map')).toBeUndefined();
    });

    it('does not emit when extra.tags is non-object (e.g. true)', () => {
      const diags = detectExtraWarnings({ extra: { tags: true } });
      expect(diags.find((d) => d.ruleId === 'extra-tags-alias-map')).toBeUndefined();
    });
  });

  describe('sortable tables (tablesort) detection', () => {
    it('emits an info diagnostic when extra_javascript references tablesort', () => {
      const diags = detectExtraWarnings({
        extra_javascript: ['https://unpkg.com/tablesort@5.3.0/dist/tablesort.min.js'],
      });
      const tsDiag = diags.find((d) => d.ruleId === 'tablesort-detected');
      expect(tsDiag).toBeDefined();
      expect(tsDiag?.severity).toBe('info');
      expect(tsDiag?.message).toMatch(/sortable|tablesort/i);
    });

    it('also detects tablesort referenced as a relative path', () => {
      const diags = detectExtraWarnings({
        extra_javascript: ['javascripts/tablesort.js', 'analytics.js'],
      });
      const tsDiag = diags.find((d) => d.ruleId === 'tablesort-detected');
      expect(tsDiag).toBeDefined();
    });

    it('does not emit when no tablesort reference is present', () => {
      const diags = detectExtraWarnings({
        extra_javascript: ['analytics.js'],
      });
      expect(diags.find((d) => d.ruleId === 'tablesort-detected')).toBeUndefined();
    });

    it('also handles the object form of extra_javascript entries', () => {
      const diags = detectExtraWarnings({
        extra_javascript: [{ path: 'js/tablesort.min.js', type: 'module' }],
      });
      const tsDiag = diags.find((d) => d.ruleId === 'tablesort-detected');
      expect(tsDiag).toBeDefined();
    });
  });

  describe('extra.version metadata (default + alias)', () => {
    it('emits info when extra.version.default is set', () => {
      const diags = detectExtraWarnings({
        extra: { version: { provider: 'mike', default: 'latest' } },
      });
      const d = diags.find((x) => x.ruleId === 'extra-version-metadata');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('info');
      expect(d?.message).toMatch(/latest/);
      expect(d?.message).toMatch(/starlight-versions/i);
    });

    it('emits info when extra.version.alias is set', () => {
      const diags = detectExtraWarnings({
        extra: { version: { provider: 'mike', alias: true } },
      });
      const d = diags.find((x) => x.ruleId === 'extra-version-metadata');
      expect(d).toBeDefined();
      expect(d?.message).toMatch(/alias/);
    });

    it('does not emit when only provider is set with no default/alias', () => {
      const diags = detectExtraWarnings({
        extra: { version: { provider: 'mike' } },
      });
      expect(diags.find((x) => x.ruleId === 'extra-version-metadata')).toBeUndefined();
    });

    it('does not emit when extra.version is absent', () => {
      const diags = detectExtraWarnings({ extra: {} });
      expect(diags.find((x) => x.ruleId === 'extra-version-metadata')).toBeUndefined();
    });
  });
});
