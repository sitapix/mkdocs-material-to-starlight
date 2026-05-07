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

/**
 * Layout context for the missing-docs-dir error. Supplied by the caller
 * when it has already inspected the project: whether the directory that
 * holds `mkdocs.yml` itself contains markdown, plus the configured
 * `docs_dir` value. With this info the enricher can suggest the exact
 * one-line config fix (`docs_dir: .`) for legacy MkDocs sites whose docs
 * sit alongside the config without an explicit `docs_dir`.
 */
export interface LegacyLayoutHint {
  readonly configDirHasMarkdown: boolean;
  readonly configDirRelative: string;
  readonly configuredDocsDir: string;
}

export function enrichMissingDocsDirMessage(
  baseMessage: string,
  plugins: ReadonlyArray<{ readonly name: string }>,
  layout?: LegacyLayoutHint,
): string {
  const lines: string[] = [baseMessage];

  // Show the layout hint first when it applies — it's the most
  // actionable: a single one-line edit to mkdocs.yml unblocks the
  // conversion. Real-world sources: jondot/awesome-react-native,
  // Riverside-Software/pct-mkdocs (legacy mkdocs.yml at root with docs
  // alongside it); yetone/olo, smarie/python-parsyfiles (mkdocs.yml in
  // a `docs/` subdirectory with sources next to it).
  if (
    layout?.configDirHasMarkdown &&
    layout.configuredDocsDir !== '.' &&
    layout.configuredDocsDir !== ''
  ) {
    const where =
      layout.configDirRelative === '.' || layout.configDirRelative === ''
        ? 'next to your `mkdocs.yml` (project root)'
        : `next to your \`mkdocs.yml\` in \`${layout.configDirRelative}/\``;
    lines.push(
      `hint: your markdown lives ${where}, but \`docs_dir\` points at ` +
        `\`${layout.configuredDocsDir}\` (which doesn't exist). ` +
        `Add \`docs_dir: .\` to your \`mkdocs.yml\` so the converter ` +
        `reads the config directory itself, then re-run.`,
    );
  }

  const generators = plugins
    .map((p) => p.name)
    .filter((n): n is (typeof DOCS_GENERATING_PLUGINS)[number] =>
      (DOCS_GENERATING_PLUGINS as ReadonlyArray<string>).includes(n),
    );
  if (generators.length > 0) {
    const list = generators.map((n) => `\`${n}\``).join(', ');
    lines.push(
      `hint: mkdocs.yml lists the ${list} plugin, which generates docs/ at ` +
        `build time. Run \`mkdocs build\` (or the plugin's generator script) ` +
        `first, then point this converter at the materialised docs/ tree.`,
    );
  } else if (lines.length === 1 && plugins.length > 0) {
    // Only show the generic plugin fallback when we have no other hint —
    // otherwise it adds noise without changing the recommended action.
    const detected = plugins.map((p) => `\`${p.name}\``).join(', ');
    lines.push(
      `hint: mkdocs.yml lists ${plugins.length} plugin(s) (${detected}). ` +
        `One of them may generate the docs/ tree at build time. Try running ` +
        `\`mkdocs build\` first to materialise the tree, then point this ` +
        `converter at the resulting directory.`,
    );
  }

  return lines.join('\n');
}
