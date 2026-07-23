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
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const INLINE_ARRAY_RE = /^\[(.*)\]$/;

type Observation =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array-of-string'
  | 'object'
  | 'unknown';

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
    const items = splitFlowItems(inlineArr[1] ?? '');
    return items.length === 0 ? 'unknown' : 'array-of-string';
  }
  // YAML 1.2 recognises `true|True|TRUE|false|False|FALSE` as boolean —
  // any of these will be parsed as a JS boolean by the downstream YAML
  // loader, so we must classify them as `boolean` here even though the
  // raw text looks like a capitalised string. Real-world (jujimeizuo/note):
  // sources use `comment: True`, `nostatistics: True` etc.; classifying
  // those as `string` produced a `z.string()` schema that then rejected
  // the boolean value at content-load time.
  if (/^(?:true|True|TRUE|false|False|FALSE)$/.test(value)) return 'boolean';
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return 'number';
  if (ISO_DATE_RE.test(value.replace(/^['"]|['"]$/g, ''))) return 'date';
  return 'string';
}

/**
 * Split flow-sequence innards on commas OUTSIDE quotes. A naive
 * `split(',')` shreds quoted items containing commas
 * (`tags: ['a, b', 'c']` → three items instead of two).
 */
function splitFlowItems(inner: string): string[] {
  const items: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      const trimmed = current.trim();
      if (trimmed.length > 0) items.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail.length > 0) items.push(tail);
  return items;
}

function addObservation(out: Map<string, Set<Observation>>, key: string, obs: Observation): void {
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
  // Mixed scalar types — date + string collapses to string (date is a
  // string subset; coercing surprises users who expect raw strings).
  // Bool/number + string emits a union so each observed shape passes
  // schema validation. Real-world (jujimeizuo/note): the same field name
  // (`changelog`, `comment`, `nostatistics`) is used as a boolean toggle
  // on some pages and as a string elsewhere; a `z.string()` fallback
  // rejects the boolean pages with "Expected 'string', received 'boolean'".
  const hasString = types.has('string') || types.has('date');
  const hasBool = types.has('boolean');
  const hasNum = types.has('number');
  const members: string[] = [];
  if (hasString) members.push('z.string()');
  if (hasBool) members.push('z.boolean()');
  if (hasNum) members.push('z.number()');
  if (members.length === 0) return 'z.unknown().optional()';
  if (members.length === 1) return `${members[0]}.optional()`;
  return `z.union([${members.join(', ')}]).optional()`;
}
