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

  it('every production-emitted (ruleId, severity) pair matches the registry', () => {
    // Drift between the registry and the emission sites is a real bug:
    // `snippet-cycle` was registered as 'error' but emitted as 'warning',
    // so the CLI report severity disagreed with the documented severity.
    // Scan src/ for `createDiagnostic({ ... })` blocks, extract both fields,
    // and assert each pair matches the registry.
    const srcDir = join(process.cwd(), 'src');
    const files = collectTsFiles(srcDir);
    const blockRe = /createDiagnostic\(\s*\{([\s\S]*?)\}\s*\)/g;
    const ruleRe = /\bruleId\s*:\s*['"]([^'"]+)['"]/;
    const sevRe = /\bseverity\s*:\s*['"](info|warning|error)['"]/;

    const mismatches: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(blockRe)) {
        const body = m[1] ?? '';
        const rule = body.match(ruleRe)?.[1];
        const sev = body.match(sevRe)?.[1];
        if (rule === undefined || sev === undefined) continue;
        const entry = getRegisteredRuleId(rule);
        if (entry === null) continue; // covered by the registration test above
        if (entry.severity !== sev) {
          mismatches.push(
            `${file}: ruleId "${rule}" emitted as "${sev}" but registered as "${entry.severity}"`,
          );
        }
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
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

  it('every `createDiagnostic` ruleId is a literal, ternary-of-literals, or const-table forward', () => {
    // Two registry-related risks the literal-coverage test does NOT catch:
    //   1. Shorthand `{ ruleId, … }` — value comes from a runtime variable
    //   2. Constructed strings — template literals with interpolation,
    //      string concatenation, function-call return values
    //
    // Allowed value shapes (statically provable):
    //   - String literal: `ruleId: 'broken-link'`
    //   - Ternary of literals: `cond ? 'a' : 'b'` (both branches static)
    //   - Const-table forward: `spec.ruleId` / `entry.ruleId` — the
    //     literal lives in a spec table and IS picked up by the
    //     literal-coverage test above.
    //
    // Anything else is a hard fail — even if it happens to resolve to a
    // registered ID at runtime, the static guarantee evaporates.
    const srcDir = join(process.cwd(), 'src');
    const files = collectTsFiles(srcDir);
    const blockRe = /createDiagnostic\(\s*\{([\s\S]*?)\}\s*\)/g;
    const shorthandRuleRe = /(^|[\s,{])ruleId(\s*[,}])/;
    const literalRe = /^['"][^'"]+['"]$/;
    const ternaryOfLiteralsRe =
      /^[^?]+\?\s*['"][^'"]+['"]\s*:\s*['"][^'"]+['"]$/;
    const constTableForwardRe = /^[A-Za-z_][\w]*\.ruleId$/;

    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(blockRe)) {
        const body = m[1] ?? '';
        if (shorthandRuleRe.test(body)) {
          offenders.push(`${file}: shorthand \`{ ruleId }\` — use \`ruleId: 'literal'\``);
          continue;
        }
        const value = extractRuleIdValue(body);
        if (value === null) continue; // no ruleId field in this block
        const collapsed = value.replace(/\s+/g, ' ').trim();
        if (literalRe.test(collapsed)) continue;
        if (ternaryOfLiteralsRe.test(collapsed)) continue;
        if (constTableForwardRe.test(collapsed)) continue;
        offenders.push(`${file}: ruleId \`${collapsed}\` — must be a string literal, ternary of literals, or const-table forward`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

/**
 * Extract the right-hand side of `ruleId: …` up to the next top-level
 * comma or end-of-block, accounting for nested parens/brackets/braces and
 * for strings (so a `,` inside a quoted message field can't terminate
 * a ternary by accident).
 */
function extractRuleIdValue(body: string): string | null {
  const start = body.search(/\bruleId\s*:\s*/);
  if (start === -1) return null;
  const colon = body.indexOf(':', start);
  let i = colon + 1;
  while (i < body.length && /\s/.test(body[i] ?? '')) i += 1;
  const valueStart = i;
  let depth = 0;
  let inString: string | null = null;
  while (i < body.length) {
    const ch = body[i] ?? '';
    if (inString !== null) {
      if (ch === inString && body[i - 1] !== '\\') inString = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      break;
    }
    i += 1;
  }
  return body.slice(valueStart, i);
}
