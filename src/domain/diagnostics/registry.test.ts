import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  getAllRegisteredRuleIds,
  isRegisteredRuleId,
  getRegisteredRuleId,
} from './registry.js';

function collectTsFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      collectTsFiles(abs, files);
      continue;
    }
    if (abs.endsWith('.ts') && !abs.endsWith('.test.ts')) {
      files.push(abs);
    }
  }
  return files;
}

describe('diagnostic registry', () => {
  it('returns false for an unregistered ruleId', () => {
    expect(isRegisteredRuleId('not-a-real-rule')).toBe(false);
  });

  it('returns true for known production ruleIds', () => {
    expect(isRegisteredRuleId('broken-link')).toBe(true);
    expect(isRegisteredRuleId('icon-unmapped')).toBe(true);
    expect(isRegisteredRuleId('snippet-cycle')).toBe(true);
    expect(isRegisteredRuleId('unknown-frontmatter-field')).toBe(true);
  });

  it('returns the full entry for a registered ruleId', () => {
    const entry = getRegisteredRuleId('broken-link');
    expect(entry).not.toBeNull();
    expect(entry?.severity).toBe('warning');
    expect(entry?.description.length).toBeGreaterThan(0);
    expect(entry?.fix.length).toBeGreaterThan(0);
  });

  it('every entry has non-empty id, description, and fix', () => {
    for (const entry of getAllRegisteredRuleIds()) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.fix.length).toBeGreaterThan(0);
    }
  });

  it('every entry id is unique', () => {
    const ids = getAllRegisteredRuleIds().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every relatedFeatureId, when set, must reference a real conversion-mapping row', async () => {
    const { getMappingRow } = await import('../conversion-mapping/table.js');
    for (const entry of getAllRegisteredRuleIds()) {
      if (entry.relatedFeatureId !== undefined) {
        expect(getMappingRow(entry.relatedFeatureId)).not.toBeNull();
      }
    }
  });

  it('every production-emitted ruleId in the source tree is registered', () => {
    // Scan src/ for `ruleId: '...'` literals and verify each is in the
    // registry. Test files (.test.ts) are excluded because they construct
    // synthetic diagnostics that don't represent real emissions.
    const srcDir = join(process.cwd(), 'src');
    const files = collectTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const pattern = /ruleId:\s*['"]([^'"]+)['"]/g;
    const emitted = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const matches = text.matchAll(pattern);
      for (const m of matches) {
        emitted.add(m[1] ?? '');
      }
    }

    for (const id of emitted) {
      expect(
        isRegisteredRuleId(id),
        `ruleId "${id}" is emitted in production code but not registered in domain/diagnostics/registry.ts`,
      ).toBe(true);
    }
  });
});
