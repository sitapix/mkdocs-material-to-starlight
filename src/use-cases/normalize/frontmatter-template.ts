/**
 * Strip non-Starlight `template:` and `layout:` values from page frontmatter.
 *
 * Material/MkDocs allow arbitrary `template: <name>.html` references that
 * point at Jinja templates rendered at build time. Starlight's frontmatter
 * schema accepts only 'doc' (default) or 'splash'. Any other value fails
 * Starlight's content-collection schema validation.
 *
 * `layout:` is the related Material Insiders convention (also used in the
 * `microsoft/Mastering-the-Marketplace` style with values like
 * `layout: homepage`, `layout: default`). Astro's MDX integration treats
 * `layout:` in frontmatter as a module import — `layout: homepage` then
 * fails the build with `Rollup failed to resolve import "homepage"`.
 * Path-shaped values (`./MyLayout.astro`, `/layouts/foo.astro`, etc.) are
 * real Astro layout references and pass through unchanged.
 *
 * The `landing-page-splash` detection runs separately and adds back
 * `template: splash` when its heuristic fires.
 *
 * Pure: text in, text out. Idempotent.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const TEMPLATE_LINE_RE = /^template\s*:\s*(.+?)\s*$/;
const LAYOUT_LINE_RE = /^layout\s*:\s*(.+?)\s*$/;

export function normalizeFrontmatterTemplate(source: string): string {
  const match = source.match(FRONTMATTER_RE);
  if (match === null) return source;
  const fmBody = match[1] ?? '';
  const lineEnd = source.startsWith('---\r\n') ? '\r\n' : '\n';
  const lines = fmBody.split(/\r?\n/);
  const kept: string[] = [];
  let dropped = false;
  for (const line of lines) {
    const t = TEMPLATE_LINE_RE.exec(line);
    if (t !== null) {
      const value = (t[1] ?? '').replace(/^['"]|['"]$/g, '');
      if (value === 'doc' || value === 'splash') {
        kept.push(line);
      } else {
        dropped = true;
      }
      continue;
    }
    const l = LAYOUT_LINE_RE.exec(line);
    if (l !== null) {
      const value = (l[1] ?? '').replace(/^['"]|['"]$/g, '');
      // Path-shaped values are real Astro layout references — keep them.
      // Bare identifiers like `homepage`, `default`, `landing` are Material
      // Jinja template hints with no Starlight equivalent — strip.
      if (looksLikeAstroLayoutPath(value)) {
        kept.push(line);
      } else {
        dropped = true;
      }
      continue;
    }
    kept.push(line);
  }
  if (!dropped) return source;
  const newFm = kept.join(lineEnd);
  return source.replace(FRONTMATTER_RE, `---${lineEnd}${newFm}${lineEnd}---`);
}

function looksLikeAstroLayoutPath(value: string): boolean {
  // A real Astro layout is a module path: contains a directory separator OR
  // ends in a known component extension. Bare identifiers (Material Jinja
  // hints) are neither.
  if (/^\.{1,2}\//.test(value)) return true;
  if (value.startsWith('/')) return true;
  if (/\.(astro|tsx|jsx|vue|svelte)$/i.test(value)) return true;
  if (value.includes('/')) return true;
  return false;
}
