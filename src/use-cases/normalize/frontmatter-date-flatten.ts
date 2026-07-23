/**
 * Flatten Material blog's nested `date:` frontmatter mapping to the scalar
 * shape starlight-blog understands.
 *
 * Material's blog plugin accepts either a scalar date or a mapping:
 *
 *   date:
 *     created: 2026-02-18
 *     updated: 2026-03-01
 *
 * starlight-blog's schema types `date` as a single date, so the mapping
 * form fails content-collection validation on every such post ("date:
 * Expected type 'date', received 'object'" — field-tested on squidfunk's
 * mkdocs-material docs, 2026-07-23). Rewrite:
 *
 *   - `created` → `date` (the post's publication date)
 *   - `updated` → `lastUpdated` (Starlight's built-in per-page field)
 *   - only `updated` present → it becomes `date`
 *
 * Both block and flow (`date: { created: 2026-02-18 }`) forms are handled.
 * A mapping containing keys other than `created`/`updated` is left alone —
 * the unknown-frontmatter diagnostics already point the user at it.
 * Scalar `date:` values pass through untouched. Pure and idempotent.
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const QUOTED_ISO_RE = /^(['"])(\d{4}-\d{2}-\d{2}(?:[Tt ][0-9:.+Zz-]+)?)\1$/;

export function normalizeFrontmatterDateFlatten(source: string): string {
  const match = source.match(FRONTMATTER_RE);
  if (match === null) return source;
  const fm = match[1] ?? '';
  const lines = fm.split('\n');
  const out: string[] = [];
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    const flow = line.match(/^date:\s*\{(.*)\}\s*$/);
    if (flow !== null) {
      const entries = parseFlowEntries(flow[1] ?? '');
      if (entries !== null && entries.size > 0) {
        pushFlattened(out, entries);
        changed = true;
        continue;
      }
    }

    if (/^date:\s*$/.test(line)) {
      const nested = new Map<string, string>();
      let compatible = true;
      let j = i + 1;
      while (j < lines.length) {
        const sub = lines[j] ?? '';
        if (sub.trim().length === 0) break;
        const indent = sub.length - sub.trimStart().length;
        if (indent === 0) break;
        const m = sub.trim().match(/^(created|updated)\s*:\s*(.+?)\s*$/);
        if (m === null) {
          compatible = false;
          break;
        }
        nested.set(m[1] ?? '', m[2] ?? '');
        j += 1;
      }
      if (compatible && nested.size > 0) {
        pushFlattened(out, nested);
        changed = true;
        i = j - 1;
        continue;
      }
    }

    out.push(line);
  }

  if (!changed) return source;
  return `---\n${out.join('\n')}\n---${source.slice(match[0].length)}`;
}

/** Parse `created: X, updated: Y` flow-mapping innards; null when any key
 *  is not created/updated (leave exotic mappings for the diagnostics). */
function parseFlowEntries(inner: string): Map<string, string> | null {
  const entries = new Map<string, string>();
  const parts = inner
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  for (const part of parts) {
    const m = part.match(/^(created|updated)\s*:\s*(.+?)\s*$/);
    if (m === null) return null;
    entries.set(m[1] ?? '', m[2] ?? '');
  }
  return entries;
}

function pushFlattened(out: string[], entries: ReadonlyMap<string, string>): void {
  const created = entries.get('created');
  const updated = entries.get('updated');
  const dateValue = created ?? updated;
  if (dateValue !== undefined) {
    out.push(`date: ${unquoteIsoDate(dateValue)}`);
  }
  if (created !== undefined && updated !== undefined) {
    // Starlight's `lastUpdated` frontmatter is `date | boolean` with NO
    // string coercion — the value must stay a bare YAML timestamp. (It is
    // on the converter's known-fields allowlist, so it will not be
    // re-quoted or schema-extended downstream.)
    out.push(`lastUpdated: ${unquoteIsoDate(updated)}`);
  }
}

/** `'2026-02-18'` → `2026-02-18` so YAML parses a timestamp, not a string.
 *  Non-ISO values pass through verbatim. */
function unquoteIsoDate(value: string): string {
  const m = value.match(QUOTED_ISO_RE);
  return m === null ? value : (m[2] ?? value);
}
