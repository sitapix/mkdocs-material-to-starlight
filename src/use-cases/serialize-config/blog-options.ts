/**
 * Translate Material `plugins.blog` options into a `starlight-blog` config
 * literal.
 *
 * Maps the highest-frequency Material knobs to `starlight-blog` and emits
 * a JS object literal for `starlightBlog({...})`. Empty input or no
 * recognized keys returns the empty string (caller uses bare invocation).
 *
 * Lossy: URL templates with date interpolation, archive_url_format, and
 * sort_by callables are dropped. The `plugin-blog-custom-config`
 * diagnostic points at the manual remediation.
 *
 * Mapping (Material → starlight-blog):
 *   blog_dir               → prefix (with `/posts` appended to honour
 *                                       Material's posts-subdir convention;
 *                                       see translateBlogOptions for the
 *                                       full reasoning)
 *   pagination_per_page    → postsPerPage
 *   draft / draft_on_serve → recoverDrafts
 *   authors                → authors (avatar → picture)
 *   categories_allowed     → categories (whitelist)
 *   post_excerpt_separator → excerpt.separator
 *
 * Schema: https://starlight-blog.vercel.app/getting-started/
 */

export function translateBlogOptions(
  options: Readonly<Record<string, unknown>>,
): string {
  const parts: string[] = [];

  if (typeof options['blog_dir'] === 'string' && options['blog_dir'].length > 0) {
    // Material's blog plugin treats `<blog_dir>/posts/*` as the actual
    // posts (each requires `date:` frontmatter). Files directly under
    // `<blog_dir>/` (e.g. `<blog_dir>/get-help.md`) are sibling
    // navigation pages, NOT posts. starlight-blog's `prefix:` option
    // marks every file under that directory as a post — so we need to
    // point it at `<blog_dir>/posts` to match Material's convention.
    // Without this, real-world (percona/docs-home) breaks at build
    // time with "Missing date for blog entry 'new/get-help'."
    const blogDir = options['blog_dir'].replace(/\/+$/, '');
    parts.push(`prefix: ${quote(`${blogDir}/posts`)}`);
  }
  if (typeof options['pagination_per_page'] === 'number') {
    parts.push(`postsPerPage: ${String(options['pagination_per_page'])}`);
  }
  if (options['draft'] === true || options['draft_on_serve'] === true) {
    parts.push('recoverDrafts: true');
  }
  const authorsLiteral = serializeAuthors(options['authors']);
  if (authorsLiteral !== null) {
    parts.push(`authors: ${authorsLiteral}`);
  }
  if (Array.isArray(options['categories_allowed']) && options['categories_allowed'].length > 0) {
    const list = options['categories_allowed']
      .filter((c): c is string => typeof c === 'string')
      .map(quote)
      .join(', ');
    parts.push(`categories: [${list}]`);
  }
  if (typeof options['post_excerpt_separator'] === 'string') {
    parts.push(`excerpt: { separator: ${quote(options['post_excerpt_separator'])} }`);
  }

  if (parts.length === 0) return '';
  return `{ ${parts.join(', ')} }`;
}

function serializeAuthors(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const map = raw as Record<string, unknown>;
  const entries: string[] = [];
  for (const [id, val] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
    if (val === null || typeof val !== 'object') continue;
    const author = val as Record<string, unknown>;
    const fields: string[] = [];
    if (typeof author['name'] === 'string') fields.push(`name: ${quote(author['name'])}`);
    if (typeof author['url'] === 'string') fields.push(`url: ${quote(author['url'])}`);
    // Material uses `avatar`; starlight-blog uses `picture`.
    if (typeof author['avatar'] === 'string') fields.push(`picture: ${quote(author['avatar'])}`);
    if (fields.length > 0) entries.push(`${quoteKey(id)}: { ${fields.join(', ')} }`);
  }
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : null;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function quoteKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key);
}
