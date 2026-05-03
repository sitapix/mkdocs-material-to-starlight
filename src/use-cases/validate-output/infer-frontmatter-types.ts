/**
 * Infer Zod types for unknown frontmatter fields by sampling actual values
 * across all source files.
 *
 * The auto-generated `docsSchema({ extend })` snippet in MIGRATION_NOTES.md
 * is more useful when each field is typed accurately than when every field
 * is `z.unknown().optional()`. We collect every value observed for each
 * named field, classify per-occurrence (string/number/boolean/date/array of
 * string/object), and emit the most-permissive Zod type that fits all
 * observations.
 *
 * Pure: takes the field names and source documents, returns a map of
 * field → Zod type string (e.g. `'z.string().optional()'`). No I/O.
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const SCALAR_LINE_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+?)\s*$/;
const BLOCK_KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*$/;
const ITEM_LINE_RE = /^[ \t]+-\s*(.*)\s*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2})?)?$/;
const INLINE_ARRAY_RE = /^\[(.*)\]$/;

type Observation = 'string' | 'number' | 'boolean' | 'date' | 'array-of-string' | 'object' | 'unknown';

export interface FrontmatterDoc {
  readonly source: string;
}

export function inferFrontmatterTypes(
  fields: ReadonlyArray<string>,
  docs: ReadonlyArray<FrontmatterDoc>,
): Record<string, string> {
  const observations = new Map<string, Set<Observation>>();
  for (const doc of docs) {
    const fm = extractFrontmatterBody(doc.source);
    if (fm === null) continue;
    const observed = scanFields(fm);
    for (const [field, types] of observed) {
      const set = observations.get(field) ?? new Set<Observation>();
      for (const t of types) set.add(t);
      observations.set(field, set);
    }
  }
  const out: Record<string, string> = {};
  for (const field of fields) {
    const types = observations.get(field) ?? new Set();
    out[field] = pickZodType(types);
  }
  return out;
}

function extractFrontmatterBody(source: string): string | null {
  const m = source.match(FRONTMATTER_RE);
  return m === null ? null : (m[1] ?? '');
}

function scanFields(fmBody: string): Map<string, Set<Observation>> {
  const out = new Map<string, Set<Observation>>();
  const lines = fmBody.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.length === 0 || line.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    if (indent !== 0) continue;
    const scalar = line.match(SCALAR_LINE_RE);
    if (scalar !== null) {
      const key = scalar[1] ?? '';
      const value = scalar[2] ?? '';
      addObservation(out, key, classifyScalar(value));
      continue;
    }
    const block = line.match(BLOCK_KEY_RE);
    if (block !== null) {
      const key = block[1] ?? '';
      // Walk subsequent indented lines.
      let j = i + 1;
      let isList = false;
      let allItemsString = true;
      while (j < lines.length) {
        const sub = lines[j] ?? '';
        if (sub.length === 0) {
          j += 1;
          continue;
        }
        const subIndent = sub.length - sub.trimStart().length;
        if (subIndent === 0) break;
        const item = sub.match(ITEM_LINE_RE);
        if (item !== null) {
          isList = true;
          const itemValue = item[1] ?? '';
          if (classifyScalar(itemValue) !== 'string') allItemsString = false;
        } else {
          // Nested object — observation is "object".
          allItemsString = false;
        }
        j += 1;
      }
      if (isList && allItemsString) addObservation(out, key, 'array-of-string');
      else addObservation(out, key, 'object');
    }
  }
  return out;
}

function classifyScalar(rawValue: string): Observation {
  const value = rawValue.trim();
  if (value.length === 0) return 'unknown';
  const inlineArr = value.match(INLINE_ARRAY_RE);
  if (inlineArr !== null) {
    const items = (inlineArr[1] ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    return items.length === 0 ? 'unknown' : 'array-of-string';
  }
  if (value === 'true' || value === 'false') return 'boolean';
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return 'number';
  if (ISO_DATE_RE.test(value.replace(/^['"]|['"]$/g, ''))) return 'date';
  return 'string';
}

function addObservation(
  out: Map<string, Set<Observation>>,
  key: string,
  obs: Observation,
): void {
  const set = out.get(key) ?? new Set<Observation>();
  set.add(obs);
  out.set(key, set);
}

function pickZodType(types: ReadonlySet<Observation>): string {
  if (types.size === 0) return 'z.unknown().optional()';
  if (types.has('object')) return 'z.unknown().optional()';
  if (types.has('array-of-string') && types.size === 1) {
    return 'z.array(z.string()).optional()';
  }
  if (types.has('array-of-string')) return 'z.unknown().optional()';
  if (types.size === 1) {
    if (types.has('boolean')) return 'z.boolean().optional()';
    if (types.has('number')) return 'z.number().optional()';
    if (types.has('date')) return 'z.coerce.date().optional()';
    if (types.has('string')) return 'z.string().optional()';
  }
  // Mixed scalar types — fall back to string (most permissive).
  if (types.has('string') || types.has('date')) return 'z.string().optional()';
  return 'z.unknown().optional()';
}
