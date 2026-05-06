/**
 * Coverage assertion for Material's "Setup" sidebar
 * (https://squidfunk.github.io/mkdocs-material/setup/).
 *
 * Each section listed in that sidebar must have a corresponding row in the
 * conversion-mapping table AND a registered diagnostic that links back to it.
 * The diagnostic is the contract that production code is allowed to emit when
 * the converter encounters that input shape — without the registry entry,
 * the production-emission test in `diagnostics/registry.test.ts` will reject
 * the emit site.
 *
 * The pairs below are pinned by featureId. Adding a new Setup section means
 * adding both halves (row + diagnostic) and listing the pair here.
 */

import { describe, expect, it } from 'vitest';
import { getMappingRow, getAllMappingRows, getTranslationDepth, type TranslationDepth } from './table.js';
import { getRegisteredRuleId } from '../diagnostics/registry.js';

const SETUP_PAIRS: ReadonlyArray<{ featureId: string; ruleId: string }> = [
  { featureId: 'theme-palette', ruleId: 'palette-translated' },
  { featureId: 'theme-fonts', ruleId: 'theme-fonts-applied' },
  { featureId: 'theme-language', ruleId: 'theme-language-applied' },
  { featureId: 'theme-logo-icons', ruleId: 'theme-logo-icons-applied' },
  { featureId: 'plugin-privacy', ruleId: 'plugin-privacy-no-equivalent' },
  { featureId: 'theme-features', ruleId: 'theme-feature-unsupported' },
  { featureId: 'plugin-search', ruleId: 'plugin-search-replaced' },
  { featureId: 'extra-analytics', ruleId: 'extra-analytics-applied' },
  { featureId: 'plugin-social', ruleId: 'plugin-social-no-equivalent' },
  { featureId: 'theme-header', ruleId: 'theme-header-applied' },
  { featureId: 'theme-footer', ruleId: 'theme-footer-applied' },
  { featureId: 'comment-system', ruleId: 'comment-system-recommendation' },
  { featureId: 'plugin-optimize', ruleId: 'plugin-optimize-subsumed' },
  { featureId: 'plugin-offline', ruleId: 'plugin-offline-no-equivalent' },
];

describe('Material Setup section coverage', () => {
  for (const { featureId, ruleId } of SETUP_PAIRS) {
    it(`has a mapping row for ${featureId}`, () => {
      expect(getMappingRow(featureId)).not.toBeNull();
    });

    it(`has a diagnostic ${ruleId} linked to ${featureId}`, () => {
      const entry = getRegisteredRuleId(ruleId);
      expect(entry).not.toBeNull();
      expect(entry?.relatedFeatureId).toBe(featureId);
    });
  }
});

/**
 * Architectural invariant: every mapping row must have a discoverable
 * translation depth. Either the row carries an explicit `translationDepth`
 * field, or `getTranslationDepth` derives one from `conversionType`. The
 * field is what `--explain` and the wizard will use to communicate
 * conversion fidelity to users; a missing depth would silently default
 * to "full" and mislead the user about lossy / manual rows.
 */
describe('Mapping table translation-depth coverage', () => {
  const VALID_DEPTHS: ReadonlySet<TranslationDepth> = new Set([
    'full',
    'lossy-named',
    'passthrough',
    'recommend-dep',
    'manual',
  ]);

  it('every row has a derivable translation depth', () => {
    for (const row of getAllMappingRows()) {
      const depth = getTranslationDepth(row);
      expect(VALID_DEPTHS.has(depth), `${row.featureId} → ${depth}`).toBe(true);
    }
  });

  it('rows with `recommended-dep` conversionType derive `recommend-dep` depth', () => {
    for (const row of getAllMappingRows()) {
      if (row.conversionType === 'recommended-dep' && row.translationDepth === undefined) {
        expect(getTranslationDepth(row)).toBe('recommend-dep');
      }
    }
  });

  it('rows with `passthrough` conversionType derive `passthrough` depth', () => {
    for (const row of getAllMappingRows()) {
      if (row.conversionType === 'passthrough' && row.translationDepth === undefined) {
        expect(getTranslationDepth(row)).toBe('passthrough');
      }
    }
  });
});
