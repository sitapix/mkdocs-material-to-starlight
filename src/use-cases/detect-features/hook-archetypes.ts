/**
 * Classify a Python MkDocs hook file by archetype.
 *
 * MkDocs hooks are arbitrary Python code, but real-world usage falls into
 * six recognizable archetypes (catalogued in the research bundle):
 *
 *   1. shortcode-replacement  — re.sub on `<!-- md:* -->` tokens in
 *                               on_page_markdown.
 *   2. i18n-fallback          — on_files subclasses File or filters by
 *                               language path prefix.
 *   3. title-extraction       — on_page_markdown sets page.meta["title"]
 *                               or social_options["title"].
 *   4. extension-registration — on_config appends a Markdown Extension.
 *   5. post-build-emission    — on_post_build writes files / posts to
 *                               external services.
 *   6. dynamic-content        — on_page_markdown reads YAML data and
 *                               renders templates dynamically.
 *
 * Pure: takes the source text, returns the union of detected archetypes.
 * Returns `['unknown']` when nothing matches. Pattern-based, no Python
 * parse — deliberately tolerant of stylistic variation.
 *
 * The output drives a more-specific diagnostic in MIGRATION_NOTES so users
 * see what their hook was doing and what the Astro/Starlight equivalent is.
 */

export type HookArchetype =
  | 'shortcode-replacement'
  | 'i18n-fallback'
  | 'title-extraction'
  | 'extension-registration'
  | 'post-build-emission'
  | 'dynamic-content'
  | 'unknown';

export function classifyHook(source: string): ReadonlyArray<HookArchetype> {
  if (source.trim().length === 0) return ['unknown'];
  const matches = new Set<HookArchetype>();
  if (matchesShortcode(source)) matches.add('shortcode-replacement');
  if (matchesI18nFallback(source)) matches.add('i18n-fallback');
  if (matchesTitleExtraction(source)) matches.add('title-extraction');
  if (matchesExtensionRegistration(source)) matches.add('extension-registration');
  if (matchesPostBuildEmission(source)) matches.add('post-build-emission');
  if (matchesDynamicContent(source)) matches.add('dynamic-content');
  if (matches.size === 0) return ['unknown'];
  return [...matches];
}

function matchesShortcode(src: string): boolean {
  // Accept either literal `<!-- md:` content or a Python regex source that
  // mentions `md:` after a `<!--` marker (any escaped whitespace allowed).
  return /<!--[^\n]*?md:[a-z]/i.test(src) && /re\.(sub|compile|search|match)/.test(src);
}

function matchesI18nFallback(src: string): boolean {
  return (
    /class\s+\w+File\s*\(\s*File\s*\)/.test(src) ||
    /def\s+on_files\b/.test(src) &&
      /(src_uri\.startswith|languages|locale|fallback)/.test(src)
  );
}

function matchesTitleExtraction(src: string): boolean {
  return (
    /page\.meta\[\s*['"]title['"]\s*\]\s*=/.test(src) ||
    /cards_layout_options.+title/.test(src)
  );
}

function matchesExtensionRegistration(src: string): boolean {
  return (
    /class\s+\w+\s*\(\s*Extension\s*\)/.test(src) ||
    /markdown_extensions\.append/.test(src) ||
    /md\.preprocessors\.register/.test(src)
  );
}

function matchesPostBuildEmission(src: string): boolean {
  if (!/def\s+on_post_build\b/.test(src)) return false;
  return /(open\([^)]*['"]\s*w|requests\.(post|put)|urllib|httpx|algolia|to_json)/.test(src);
}

function matchesDynamicContent(src: string): boolean {
  return (
    /yaml\.safe_load|yaml\.load/.test(src) &&
    /(render_template|jinja2|page\.url\s*==)/.test(src)
  );
}
