/**
 * Re-quote `title:` and `description:` in source frontmatter when the
 * unquoted value would be coerced to a non-string by the YAML loader.
 *
 * YAML 1.1 (Astro's content-loader uses js-yaml) parses `title: 2025-10-15`
 * as a `Date`, and Starlight's docs schema then rejects it: "title:
 * Expected type 'string', received 'object'." The page never renders.
 *
 * Wrap these shapes in single quotes:
 *   - ISO-8601 dates (`2025-10-15`)
 *   - YAML timestamps (`2025-10-15T10:00:00Z`)
 *   - Bare numbers (`42`, `3.14`, `1.0e10`)
 *   - Booleans (`true`, `false`, `yes`, `no`, `on`, `off`)
 *   - Null markers (`null`, `~`)
 *
 * Values already in `'…'`, `"…"`, or a block scalar (`|` / `>`) pass
 * through. Pure and idempotent.
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
// Fields we ALWAYS want as strings (Starlight's schema requires it). Wrap
// regardless of value shape.
const STRING_FIELDS: ReadonlyArray<string> = ['title', 'description', 'tagline', 'sidebar_label'];

// Fields whose name is conventionally date-typed in Material/MkDocs
// frontmatter but whose value users routinely write unquoted. Without
// quoting, every page parses these as Date objects; the auto-extended
// Zod schema may pick `z.string()` (when other pages have string-shaped
// values mixed in) and reject the Date at runtime. Wrapping these the
// same way as title fields keeps the schema unambiguously string-typed.
//
// Real-world break (shenweiyan/Digital-Garden): `updated: 2025-09-19`
// in `flinks/index.md` got read as Date; auto-extended schema expected
// string; site never loads.
const DATE_LIKE_FIELDS: ReadonlyArray<string> = [
  'date',
  'created',
  'updated',
  'modified',
  'published',
];

const COERCE_FIELDS: ReadonlyArray<string> = [...STRING_FIELDS, ...DATE_LIKE_FIELDS];
// Recognise YAML scalars that DON'T render as a string when left bare.
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?$/;
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const BOOL_NULL_RE =
  /^(?:true|false|yes|no|on|off|null|~|True|False|Yes|No|On|Off|Null|TRUE|FALSE|YES|NO|ON|OFF|NULL)$/;

export function normalizeFrontmatterTitleCoercion(source: string): string {
  const match = source.match(FRONTMATTER_RE);
  if (match === null) return source;
  const fmOriginal = match[1] ?? '';
  const fmRewritten = fmOriginal.split('\n').map(rewriteLine).join('\n');
  if (fmRewritten === fmOriginal) return source;
  return `---\n${fmRewritten}\n---${source.slice(match[0].length)}`;
}

function rewriteLine(line: string): string {
  // Match `<field>: <value>` at top-level only (no leading whitespace —
  // nested mapping fields are out of scope; Starlight's schema doesn't read
  // a date-shaped nested key as a top-level title).
  const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
  if (m === null) return line;
  const field = m[1] ?? '';
  const rawValue = m[2] ?? '';
  if (!COERCE_FIELDS.includes(field)) return line;
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) return line;
  // Already quoted or block-scalar: leave alone.
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) return line;
  if (trimmed.startsWith('|') || trimmed.startsWith('>')) return line;
  // Will the value coerce to a non-string?
  if (!isCoerced(trimmed)) return line;
  // Wrap in single quotes, escaping any embedded single quote per YAML 1.2
  // (double the quote: `it's` → `'it''s'`).
  const escaped = trimmed.replace(/'/g, "''");
  return `${field}: '${escaped}'`;
}

function isCoerced(value: string): boolean {
  return (
    ISO_DATE_RE.test(value) ||
    NUMBER_RE.test(value) ||
    BOOL_NULL_RE.test(value) ||
    needsQuotingForYaml(value)
  );
}

/**
 * True when the bare YAML scalar would crash the parser. Real-world
 * (ETCBC/bhsa): `title: \`book\`` has a leading backtick js-yaml rejects
 * with "bad indentation of a mapping entry". Other triggers: leading `{`
 * (flow-mapping start), leading `[` (flow-sequence start), leading `&` /
 * `*` (anchors / aliases), leading `!` (tag), and any value containing
 * `: ` (mapping separator) or `#` (comment) at problematic positions.
 */
function needsQuotingForYaml(value: string): boolean {
  if (value.length === 0) return false;
  const first = value[0] ?? '';
  // Leading characters that YAML treats as structural openers.
  if ('`{[&*!|>%@'.includes(first)) return true;
  // Mid-value `: ` (mapping separator) or ` #` (comment) is a parse hazard
  // outside of quoted strings. Real-world (Data-Wise/atlas hero action):
  // `text: :material-play-circle: View all demos` — the leading `:` plus
  // an inner `: ` together make YAML choke.
  if (/:\s/.test(value)) return true;
  // Backtick anywhere in the bare scalar trips js-yaml.
  if (value.includes('`')) return true;
  return false;
}
