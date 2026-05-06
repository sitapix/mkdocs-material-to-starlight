/**
 * Strip Material's `comments: <bool>` toggle from per-page YAML frontmatter.
 *
 * `comments: true|false` is Material's flag for activating the optional
 * Giscus widget on a page. Starlight's `docsSchema()` has no equivalent
 * field, and the converter's auto-inference (`infer-frontmatter-types.ts`)
 * picks the most-permissive type seen across the corpus — so when one page
 * has `comments: true` and another has `comments: "thread-slug"` (a custom
 * schema usage in the same project), the schema chooses `z.string()` and
 * the boolean page fails content-load with `Expected type "string", received
 * "boolean"`.
 *
 * The companion scanner `scan-material-markers.ts` already emits a
 * `comments-frontmatter-detected` info diagnostic that points users at the
 * `starlight-giscus` plugin; this normalizer drops the inert flag so the
 * site builds. Non-boolean values pass through untouched (real custom
 * field, not Material's toggle).
 *
 * Pure: text-only transform on the leading `---` block. Idempotent.
 */

// Tolerate CRLF line endings — real-world wgyhhhh repo uses them and an
// LF-only `\n---` boundary regex would silently fail to match.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
// Tolerant `comments: true|false` matcher: optional leading indent, optional
// trailing YAML inline comment (`# …`), optional trailing `\r` from CRLF.
// Anchored to a single line.
const COMMENTS_BOOL_LINE_RE = /^[ \t]*comments:[ \t]+(?:true|false)[ \t]*(?:#[^\r\n]*)?\r?$/m;

export function normalizeFrontmatterCommentsStrip(source: string): string {
  const match = source.match(FRONTMATTER_RE);
  if (match === null) return source;
  const fmBody = match[1] ?? '';
  if (!COMMENTS_BOOL_LINE_RE.test(fmBody)) return source;
  // Detect the line-ending used in the source so we round-trip it (changing
  // CRLF → LF would break tools downstream that diff against the original).
  const lineEnd = source.startsWith('---\r\n') ? '\r\n' : '\n';
  const cleanedBody = stripCommentsLine(fmBody, lineEnd);
  return source.replace(FRONTMATTER_RE, `---${lineEnd}${cleanedBody}${lineEnd}---`);
}

function stripCommentsLine(fmBody: string, lineEnd: string): string {
  const kept: string[] = [];
  // Split on either CRLF or LF so the per-line regex sees clean content
  // (a trailing `\r` would otherwise survive into the joined output).
  for (const line of fmBody.split(/\r?\n/)) {
    if (COMMENTS_BOOL_LINE_RE.test(line)) continue;
    kept.push(line);
  }
  return kept.join(lineEnd);
}
