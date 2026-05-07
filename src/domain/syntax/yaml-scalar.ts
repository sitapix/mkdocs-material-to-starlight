/**
 * YAML 1.2 scalar quoting helper.
 *
 * Frontmatter emitters across the converter (ensure-title, landing-page,
 * frontmatter rewrites) all need the same predicate: "does this value
 * need quoting to round-trip cleanly through YAML?". Centralising the
 * rule here keeps the answer consistent and one-fix.
 *
 * Two trigger sets:
 *   - NEEDS_QUOTING: ASCII characters that have YAML-flow meaning
 *     (`:`, `#`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, `\``,
 *     `{`, `}`, `[`, `]`). A value containing any of these would either
 *     cause a parse error (`title: {{ x }}` reads `{` as flow-mapping
 *     start) or coerce to the wrong type.
 *   - COERCED_SCALAR: bare values YAML 1.1/1.2 silently coerces to
 *     non-string types (ISO dates, numbers, bool/null markers).
 *     Real-world break (governance/.../2025-10-15.md): `title: 2025-10-15`
 *     becomes a Date object and Astro's content schema rejects the entry
 *     with "title: Expected 'string', received 'object'".
 *
 * Output uses SINGLE-quoted YAML scalars so backslashes don't trigger
 * YAML's escape-sequence parsing. Real-world break (pyodide-mkdocs-theme):
 * a heading-derived title contains MDX-escaped braces (`\{#anchor\}`) and
 * Jinja shortcodes; double-quoted YAML reads `\{` as an unknown escape
 * sequence and refuses to parse the document. Single-quoted YAML treats
 * every char literal except `'`, which we double per spec.
 *
 * Pure: text in, text out. Idempotent (already-quoted values pass through
 * untouched because the test sees the leading `'`).
 */

const NEEDS_QUOTING = /[:#&*!|>'"%@`{}[\]]/;
const COERCED_SCALAR = new RegExp(
  '^(?:' +
    String.raw`\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?` +
    String.raw`|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?` +
    '|true|false|yes|no|on|off|null|~|True|False|Yes|No|On|Off|Null|TRUE|FALSE|YES|NO|ON|OFF|NULL' +
    ')$',
);

/** Return the value as a YAML scalar that round-trips as a string. */
export function quoteYamlScalar(value: string): string {
  if (NEEDS_QUOTING.test(value) || COERCED_SCALAR.test(value)) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}
