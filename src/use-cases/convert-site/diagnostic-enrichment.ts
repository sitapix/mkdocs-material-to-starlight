/**
 * Pure helpers that translate raw diagnostic data into enriched, user-facing
 * forms. Lives in `use-cases/` because both helpers are domain logic that
 * doesn't belong to the wiring shell — they are reused by tests and remain
 * pure (no I/O, no global state).
 */

const UNKNOWN_FRONTMATTER_FIELD_NAME_RE = /frontmatter field "([^"]+)"/;

/**
 * Pull every distinct field name out of `unknown-frontmatter-field`
 * diagnostics. The `validate-output/frontmatter.ts` emitter formats the
 * message as: `frontmatter field "FIELD" is not in Starlight's docsSchema…`
 * The returned list is sorted for stable downstream consumption (sidebar
 * config, MIGRATION_NOTES.md output).
 */
export function collectUnknownFrontmatterFieldNames(
  diagnostics: ReadonlyArray<{
    readonly diagnostic: { readonly ruleId: string; readonly message: string };
  }>,
): ReadonlyArray<string> {
  const fields = new Set<string>();
  for (const tagged of diagnostics) {
    if (tagged.diagnostic.ruleId !== 'unknown-frontmatter-field') continue;
    const match = tagged.diagnostic.message.match(UNKNOWN_FRONTMATTER_FIELD_NAME_RE);
    if (match !== null && match[1] !== undefined) fields.add(match[1]);
  }
  return [...fields].sort();
}

// MkDocs plugins that materialise the docs/ tree at build time. When the
// converter sees a missing docs/ but mkdocs.yml lists one of these, the user
// is almost certainly trying to convert a generator-driven site. Tell them
// what to do instead of returning a bare "directory not found".
const DOCS_GENERATING_PLUGINS = ['gen-files', 'monorepo', 'macros'] as const;

export function enrichMissingDocsDirMessage(
  baseMessage: string,
  plugins: ReadonlyArray<{ readonly name: string }>,
): string {
  const generators = plugins
    .map((p) => p.name)
    .filter((n): n is (typeof DOCS_GENERATING_PLUGINS)[number] =>
      (DOCS_GENERATING_PLUGINS as ReadonlyArray<string>).includes(n),
    );
  if (generators.length > 0) {
    const list = generators.map((n) => `\`${n}\``).join(', ');
    return (
      `${baseMessage}\n` +
      `hint: mkdocs.yml lists the ${list} plugin, which generates docs/ at ` +
      `build time. Run \`mkdocs build\` (or the plugin's generator script) ` +
      `first, then point this converter at the materialised docs/ tree.`
    );
  }
  // Generic fallback for the long tail of CI-only generators (custom
  // plugins, repo-private content pipelines). Tell the user the most
  // likely cause and what to do — the absence of a recognised generator
  // doesn't mean the site isn't generator-driven, just that we couldn't
  // name the specific plugin.
  if (plugins.length > 0) {
    const detected = plugins.map((p) => `\`${p.name}\``).join(', ');
    return (
      `${baseMessage}\n` +
      `hint: mkdocs.yml lists ${plugins.length} plugin(s) (${detected}). ` +
      `One of them may generate the docs/ tree at build time. Try running ` +
      `\`mkdocs build\` first to materialise the tree, then point this ` +
      `converter at the resulting directory.`
    );
  }
  return baseMessage;
}
