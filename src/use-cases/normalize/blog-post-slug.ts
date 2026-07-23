/**
 * Re-prefix an authored `slug:` frontmatter value on a blog post so it stays
 * inside starlight-blog's route namespace.
 *
 * Material's blog plugin reads a post's `slug:` as the URL TAIL — the final
 * segment under the blog's date-based path. Starlight reads frontmatter
 * `slug:` as the page's ABSOLUTE root slug. Passing the value through
 * verbatim therefore tears the post out of the `<blogDir>/posts` prefix the
 * emitted `starlightBlog({ prefix })` config owns, and the build crashes
 * with "Failed to get blog configuration for entry '<slug>'" (field-tested
 * on squidfunk's mkdocs-material docs, whose posts author slugs like
 * `mkdocs-2.0`, 2026-07-23).
 *
 * Rewrite `slug: <value>` → `slug: <prefix>/<value>` for files under the
 * posts directory. Values already carrying the prefix pass through
 * (idempotent). Pure.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

export interface BlogPostSlugResult {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function normalizeBlogPostSlug(source: string, prefix: string): BlogPostSlugResult {
  const match = source.match(FRONTMATTER_RE);
  if (match === null) return { text: source, diagnostics: [] };
  const fm = match[1] ?? '';
  const lines = fm.split('\n');
  const diagnostics: Diagnostic[] = [];
  let changed = false;

  const rewritten = lines.map((line, idx) => {
    const m = line.match(/^slug\s*:\s*(.+?)\s*$/);
    if (m === null) return line;
    const raw = m[1] ?? '';
    const quote = raw.startsWith("'") || raw.startsWith('"') ? raw[0] : null;
    const inner = quote !== null ? raw.slice(1, -1) : raw;
    if (inner.length === 0 || inner === prefix || inner.startsWith(`${prefix}/`)) {
      return line;
    }
    changed = true;
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'blog-post-slug-prefixed',
        source: 'normalize/blog-post-slug',
        place: { line: idx + 2, column: 1 },
        message: `Blog post frontmatter \`slug: ${inner}\` rewritten to \`slug: ${prefix}/${inner}\`. Material reads a post slug as the URL tail under the blog's path; Starlight reads it as the page's absolute slug, which would move the post outside starlight-blog's \`${prefix}\` prefix and break the build. Note the final URL differs from Material's date-based post URL — add a redirect if inbound links must keep working.`,
      }),
    );
    const newValue = `${prefix}/${inner}`;
    return quote !== null ? `slug: ${quote}${newValue}${quote}` : `slug: ${newValue}`;
  });

  if (!changed) return { text: source, diagnostics: [] };
  return {
    text: `---\n${rewritten.join('\n')}\n---${source.slice(match[0].length)}`,
    diagnostics,
  };
}
