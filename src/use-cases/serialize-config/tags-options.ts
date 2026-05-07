/**
 * Translate Material `plugins.tags` options into a `starlight-tags` config
 * literal.
 *
 * Maps the load-bearing Material knobs to `starlight-tags` and emits a JS
 * object literal for `starlightTags({...})`. Empty input or no recognized
 * keys returns the empty string.
 *
 * Mapping (Material → starlight-tags):
 *   tags_hierarchy           → hierarchical
 *   tags_hierarchy_separator → separator
 *   tags_allowed             → allowedTags (build fails on miss)
 *   shadow_tags              → hiddenTags
 *   listings_map             → listings
 *
 * Untranslatable: `tags_slugify_format`, pagination knobs, and
 * `listings_directive` — `starlight-tags` resolves those by convention.
 * The `plugin-tags` diagnostic points at the manual remediation.
 *
 * Schema: https://frostybee.github.io/starlight-tags/
 */

export function translateTagsOptions(options: Readonly<Record<string, unknown>>): string {
  const parts: string[] = [];

  if (options.tags_hierarchy === true) {
    parts.push('hierarchical: true');
  }
  if (typeof options.tags_hierarchy_separator === 'string') {
    parts.push(`separator: ${quote(options.tags_hierarchy_separator)}`);
  }
  if (Array.isArray(options.tags_allowed) && options.tags_allowed.length > 0) {
    const list = options.tags_allowed
      .filter((t): t is string => typeof t === 'string')
      .map(quote)
      .join(', ');
    parts.push(`allowedTags: [${list}]`);
  }
  if (Array.isArray(options.shadow_tags) && options.shadow_tags.length > 0) {
    const list = options.shadow_tags
      .filter((t): t is string => typeof t === 'string')
      .map(quote)
      .join(', ');
    parts.push(`hiddenTags: [${list}]`);
  }
  const listingsLiteral = serializeListings(options.listings_map);
  if (listingsLiteral !== null) {
    parts.push(`listings: ${listingsLiteral}`);
  }

  if (parts.length === 0) return '';
  return `{ ${parts.join(', ')} }`;
}

function serializeListings(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const map = raw as Record<string, unknown>;
  const entries: string[] = [];
  for (const [id, val] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
    if (val === null || typeof val !== 'object') continue;
    const cfg = val as Record<string, unknown>;
    const fields: string[] = [];
    if (Array.isArray(cfg.include)) {
      const inc = cfg.include
        .filter((t): t is string => typeof t === 'string')
        .map(quote)
        .join(', ');
      fields.push(`include: [${inc}]`);
    }
    if (Array.isArray(cfg.exclude)) {
      const exc = cfg.exclude
        .filter((t): t is string => typeof t === 'string')
        .map(quote)
        .join(', ');
      fields.push(`exclude: [${exc}]`);
    }
    entries.push(`${quote(id)}: { ${fields.join(', ')} }`);
  }
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : null;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
