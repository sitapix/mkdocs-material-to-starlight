/**
 * The conversion mapping table — the single declarative source of truth for
 * what every Material for MkDocs feature converts into on the Starlight side.
 *
 * Each row describes ONE input shape (a marker pattern, a CSS class, a
 * fenced block, etc.) and ONE output target (a directive, an HTML element,
 * a JSX component, or a passthrough). The set of rows is what the converter
 * promises to handle; everything else is a documented gap surfaced via
 * diagnostic.
 *
 * This module is pure data. Behavior (matching, transformation) lives in the
 * normalizers (`src/use-cases/normalize/*`) and AST plugins
 * (`src/use-cases/transform/ast/*`). Each row's `featureId` is also the
 * `ruleId` for any diagnostic the converter emits about that feature, giving
 * users a single grep target ("show me everything related to admonitions").
 *
 * The table is also the data backing the `--explain` CLI mode: given a user's
 * `mkdocs.yml`, the converter reports exactly which rows will fire and what
 * they will produce.
 */

type FileExtension = 'md' | 'mdx' | 'mdoc';
type ConversionType =
  | 'passthrough'
  | 'text-pre-parse'
  | 'ast-transform'
  | 'recommended-dep';
type Risk = 'low' | 'medium' | 'high';

/**
 * How completely the converter translates this feature.
 *
 *   `full`         — semantic equivalent emitted; user sees the same UX.
 *   `lossy-named`  — emitted with documented losses (e.g., float layout
 *                    dropped on inline admonitions). Diagnostic names the
 *                    loss; user can opt into manual remediation.
 *   `passthrough`  — no emit needed; CommonMark / Astro / Starlight defaults
 *                    already handle it.
 *   `recommend-dep` — auto-installs a Starlight community plugin or Astro
 *                    integration; UX is equivalent post-install.
 *   `manual`       — flagged via diagnostic only; user must hand-port.
 */
export type TranslationDepth =
  | 'full'
  | 'lossy-named'
  | 'passthrough'
  | 'recommend-dep'
  | 'manual';

export interface MappingRow {
  /** Stable identifier; used as ruleId for diagnostics and as filter key. */
  readonly featureId: string;
  /** Human-readable description of the Material input shape. */
  readonly materialInput: string;
  /** Required PyMdown / Python-Markdown extensions for the input to occur. */
  readonly requiredExtensions: ReadonlyArray<string>;
  /** Human-readable description of the Starlight output. */
  readonly starlightOutput: string;
  /** Output file extension required for this transform's emit. */
  readonly fileExt: FileExtension;
  /** Conversion mechanism. */
  readonly conversionType: ConversionType;
  /** Migration risk when this row fires. */
  readonly risk: Risk;
  /**
   * Depth of translation this row provides. Optional for back-compat with
   * existing rows; new rows should specify it. When absent, callers default
   * to deriving depth from `conversionType` (`recommended-dep` →
   * 'recommend-dep'; `passthrough` → 'passthrough'; rest → 'full').
   */
  readonly translationDepth?: TranslationDepth;
}

/**
 * Derive a TranslationDepth for any row, using the explicit `translationDepth`
 * field when set and falling back to a sensible default per `conversionType`.
 */
export function getTranslationDepth(row: MappingRow): TranslationDepth {
  if (row.translationDepth !== undefined) return row.translationDepth;
  if (row.conversionType === 'recommended-dep') return 'recommend-dep';
  if (row.conversionType === 'passthrough') return 'passthrough';
  return 'full';
}

export function getMappingRow(featureId: string): MappingRow | null {
  return TABLE.find((row) => row.featureId === featureId) ?? null;
}

export function getAllMappingRows(): ReadonlyArray<MappingRow> {
  return TABLE;
}

const TABLE: ReadonlyArray<MappingRow> = [
  {
    featureId: 'admonition-block',
    materialInput: '!!! type "Title" — twelve admonition types via the legacy syntax',
    requiredExtensions: ['admonition'],
    starlightOutput: ':::type[Title] — Starlight aside directive (`<Aside>` for the four matching types)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'admonition-collapsible',
    materialInput: '??? type / ???+ type — collapsible admonitions (open/closed)',
    requiredExtensions: ['admonition', 'pymdownx.details'],
    starlightOutput: '<details><summary> HTML pair, preserving open/closed polarity',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'blocks-admonition',
    materialInput: '/// type | Title — pymdownx.blocks.admonition fenced syntax',
    requiredExtensions: ['pymdownx.blocks.admonition'],
    starlightOutput: ':::type[Title] aside directive (same as legacy form)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'blocks-tab',
    materialInput: '/// tab | Title — pymdownx.blocks.tab fenced tab group',
    requiredExtensions: ['pymdownx.blocks.tab'],
    starlightOutput: '::::tabs / :::tab[Title] — directive form consumed by tab AST transform',
    fileExt: 'mdx',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'blocks-details',
    materialInput: '/// details | Title — pymdownx.blocks.details collapsible',
    requiredExtensions: ['pymdownx.blocks.details'],
    starlightOutput: '<details><summary> HTML via the admonition pipeline',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'content-tabs',
    materialInput: '=== "Title" — legacy content-tab syntax',
    requiredExtensions: ['pymdownx.tabbed', 'pymdownx.superfences'],
    starlightOutput: '<Tabs> / <TabItem label="Title"> — Starlight tabs',
    fileExt: 'mdx',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'snippets',
    materialInput: '--8<-- "file.md[:start[:end]]" — file inclusion',
    requiredExtensions: ['pymdownx.snippets'],
    starlightOutput: 'inline-expanded body, line-range and section markers honored',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'footnotes',
    materialInput: '[^id] reference and [^id]: definition',
    requiredExtensions: ['footnotes'],
    starlightOutput: 'passthrough via remark-gfm — identical syntax',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'tables',
    materialInput: 'GFM pipe tables with column-alignment markers',
    requiredExtensions: ['tables'],
    starlightOutput: 'passthrough via remark-gfm',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'task-lists',
    materialInput: '- [ ] / - [x] task list items',
    requiredExtensions: ['pymdownx.tasklist'],
    starlightOutput: 'passthrough via remark-gfm',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'definition-lists',
    materialInput: 'Term \\n :   Definition',
    requiredExtensions: ['def_list'],
    starlightOutput: '<dl><dt><dd> inline HTML',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'abbreviations',
    materialInput: '*[ABBR]: definition — collected and stripped',
    requiredExtensions: ['abbr'],
    starlightOutput: 'every term occurrence wrapped with <abbr title="...">',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'buttons',
    materialInput: '[label](url){ .md-button[ .md-button--primary] }',
    requiredExtensions: ['attr_list'],
    starlightOutput: '`<LinkButton href="url" variant="secondary|primary">label</LinkButton>` Starlight built-in component; file promoted to `.mdx`. Inline icon shortcodes (e.g. `:material-rocket:`) are extracted into the `icon=` prop when they resolve to a Starlight built-in icon.',
    fileExt: 'mdx',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'inline-mark',
    materialInput: '==text== — PyMdown mark',
    requiredExtensions: ['pymdownx.mark'],
    starlightOutput: '<mark>text</mark> inline HTML',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'inline-sub',
    materialInput: 'H~2~O — PyMdown tilde subscript',
    requiredExtensions: ['pymdownx.tilde'],
    starlightOutput: 'H<sub>2</sub>O inline HTML (text-level pre-parse avoids the strikethrough clash)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'inline-sup',
    materialInput: '2^10^ — PyMdown caret superscript',
    requiredExtensions: ['pymdownx.caret'],
    starlightOutput: '2<sup>10</sup> inline HTML',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'keys',
    materialInput: '++ctrl+alt+del++ — PyMdown keyboard chord',
    requiredExtensions: ['pymdownx.keys'],
    starlightOutput: '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd> per-key splitting; `key_map` (custom key index) and `camel_case` PyMdown options are dropped',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'critic-markup',
    materialInput: '{++ ++} {-- --} {== ==} {~~ ~> ~~} {>> <<} — Critic Markup',
    requiredExtensions: ['pymdownx.critic'],
    starlightOutput: '<ins> / <del> / <mark> / <del>+<ins> / <span class="critic-comment"> inline HTML',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'grids-cards',
    materialInput: '<div class="grid cards" markdown> + Markdown list (with --- as title/body separator)',
    requiredExtensions: ['attr_list', 'md_in_html'],
    starlightOutput: '<CardGrid><Card title="..." icon="..."> JSX',
    fileExt: 'mdx',
    conversionType: 'ast-transform',
    risk: 'high',
  },
  {
    featureId: 'icons',
    materialInput: ':material-foo: / :fontawesome-...: / :octicons-...: / :simple-...: shortcodes',
    requiredExtensions: ['pymdownx.emoji', 'attr_list'],
    starlightOutput: '<Icon name="..."> with fallback chain → npm-package SVG → diagnostic placeholder. Material has 10K+ icons; Starlight\'s built-in set is ~250 — unmapped icons emit `icon-unmapped` diagnostic',
    fileExt: 'mdx',
    conversionType: 'ast-transform',
    risk: 'high',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'links-internal',
    materialInput: 'relative .md / .html links to other source files',
    requiredExtensions: [],
    starlightOutput: 'rewritten to Starlight slug paths from the slug map',
    fileExt: 'md',
    conversionType: 'ast-transform',
    risk: 'medium',
  },
  {
    featureId: 'math',
    materialInput: '$$...$$ block math, $...$ inline math',
    requiredExtensions: ['pymdownx.arithmatex'],
    starlightOutput: 'passthrough; recommend remark-math + rehype-katex in astro.config.mjs',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'mermaid',
    materialInput: '```mermaid fenced block',
    requiredExtensions: ['pymdownx.superfences'],
    starlightOutput: 'passthrough; recommend astro-mermaid or rehype-mermaid in astro.config.mjs',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'plugin-glightbox',
    materialInput: 'mkdocs.yml plugins: [glightbox] (image lightbox plugin)',
    requiredExtensions: [],
    starlightOutput: 'starlight-image-zoom Starlight plugin auto-wired in astro.config.mjs',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'plugin-mike',
    materialInput: 'mkdocs.yml plugins: [mike] (versioning plugin)',
    requiredExtensions: [],
    starlightOutput: 'starlight-versions Starlight plugin auto-wired (versions list left as a stub); starlight-changelogs companion package added to package.json deps so users can publish release notes alongside the version switcher',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'annotations',
    materialInput: '(N) markers + { .annotate } + trailing ordered list — Material annotations',
    requiredExtensions: ['attr_list', 'md_in_html', 'pymdownx.superfences'],
    starlightOutput: 'rewritten as footnote refs/defs ([^anno-block-N]); remark-gfm renders the popovers',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'high',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'code-annotations',
    materialInput: '``` { .lang .annotate }` fence with (N)! markers in body + trailing ordered list',
    requiredExtensions: ['attr_list', 'pymdownx.superfences', 'pymdownx.highlight'],
    starlightOutput:
      'fence info string stripped of `.annotate`; (N)! markers downgraded to (N); trailing list left as a regular legend (popover UX is lost — diagnostic surfaces it)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'high',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'magiclink',
    materialInput: '#N / user/repo#N / @user shortcuts (pymdownx.magiclink)',
    requiredExtensions: ['pymdownx.magiclink'],
    starlightOutput:
      'rewritten to full Markdown links using mkdocs.yml repo_url (provider-aware: github → /issues, gitlab → /-/issues, bitbucket → /issues)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'blocks-caption',
    materialInput: '/// caption /// (pymdownx.blocks.caption) following an image',
    requiredExtensions: ['pymdownx.blocks.caption'],
    starlightOutput:
      'standalone <figcaption>body</figcaption> HTML; users wrap the preceding image in <figure> manually (Phase-1)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'blocks-define',
    materialInput: '/// define /// (pymdownx.blocks.definition) wrapping term/: definition pairs',
    requiredExtensions: ['pymdownx.blocks.definition', 'def_list'],
    starlightOutput:
      'wrapper stripped; inner term/: definition syntax handled by normalizeDefinitionLists into <dl> HTML',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'images',
    materialInput:
      '![alt](url){ align=left|right width="N" loading=lazy } and #only-light/#only-dark URL fragments',
    requiredExtensions: ['attr_list'],
    starlightOutput:
      'raw <img> HTML preserving align (as md-align-* class), width, loading; #only-light/dark hash promoted to class for CSS-driven theme swap (Astro\'s image-pipeline optimization is bypassed for the swap variants)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'smartsymbols',
    materialInput:
      '(c) (r) (tm) +/- =/= c/o --> <-- <--> 1/2 1/4 3/4 etc. (pymdownx.smartsymbols)',
    requiredExtensions: ['pymdownx.smartsymbols'],
    starlightOutput: 'replaced with the corresponding Unicode glyphs (©, ®, ™, ±, ≠, ℅, →, ←, ↔, ½, ¼, ¾, …)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'icon-tooltip',
    materialInput: ':icon:{ title="..." } — attr_list title attached to an icon shortcode',
    requiredExtensions: ['attr_list', 'pymdownx.emoji'],
    starlightOutput: ':icon[name]{label="..."} — directive label promoted from the title attribute',
    fileExt: 'md',
    conversionType: 'ast-transform',
    risk: 'low',
  },
  {
    featureId: 'admonition-type-option',
    materialInput: '/// admonition | Title \\n    type: warning — option-block override of the directive type',
    requiredExtensions: ['pymdownx.blocks.admonition'],
    starlightOutput: 'effective directive name resolved from the type: option (e.g., :::caution); options block is stripped',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'plugin-blog',
    materialInput: 'Material `blog` plugin in mkdocs.yml',
    requiredExtensions: [],
    starlightOutput: 'starlight-blog community plugin added to package.json + astro.config.mjs',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
  },
  {
    featureId: 'plugin-tags',
    materialInput: 'Material `tags` plugin in mkdocs.yml',
    requiredExtensions: [],
    starlightOutput: 'starlight-tags community plugin added to package.json + astro.config.mjs',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
  },
  {
    featureId: 'blocks-html',
    materialInput: '/// html | tag[class=cls] /// (pymdownx.blocks.html) raw-HTML wrapper',
    requiredExtensions: ['pymdownx.blocks.html'],
    starlightOutput:
      'bare form: body emitted as raw HTML; `tag[class=cls]` form: wraps body in <tag class="cls">…</tag>',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'plugin-redirects',
    materialInput: 'mkdocs-redirects plugin with redirect_maps in mkdocs.yml',
    requiredExtensions: [],
    starlightOutput:
      'top-level `redirects: { ... }` block in astro.config.mjs; .md suffix stripped, /index collapsed, external URLs preserved',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'plugin-last-updated',
    materialInput: 'mkdocs-git-revision-date-localized plugin in mkdocs.yml',
    requiredExtensions: [],
    starlightOutput: 'Starlight `lastUpdated: true` config flag (built-in, reads git history)',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'plugin-i18n-rename',
    materialInput: 'mkdocs-static-i18n filename suffix layout (page.fr.md, guides/intro.de.md)',
    requiredExtensions: [],
    starlightOutput:
      'Starlight directory-prefix i18n layout (fr/page.md, de/guides/intro.md); locale codes preserved including regional variants (zh-CN, pt-BR)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'snippets-auto-append',
    materialInput: 'pymdownx.snippets.auto_append in markdown_extensions (site-wide glossary file list)',
    requiredExtensions: ['pymdownx.snippets'],
    starlightOutput:
      'auto-append content read once and concatenated to every source body before snippet expansion (mirrors Material runtime behavior)',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'plugin-rss',
    materialInput: 'mkdocs-rss-plugin in mkdocs.yml (per-page RSS/Atom feed)',
    requiredExtensions: [],
    starlightOutput:
      '@astrojs/rss dependency + src/pages/rss.xml.ts endpoint scaffold using getCollection("docs"); site, title, description sourced from mkdocs.yml',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'theme-palette',
    materialInput:
      'mkdocs.yml `theme.palette` — primary, accent, scheme (default|slate), optional `media:` toggle entries for light/dark pairs',
    requiredExtensions: [],
    starlightOutput:
      'src/styles/custom.css emitted with `--sl-color-accent[-low|-high]` and `--sl-color-bg` overrides mapped from the Material color name; wired via `customCss: ["./src/styles/custom.css"]` in astro.config.mjs',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
  },
  {
    featureId: 'theme-fonts',
    materialInput: 'mkdocs.yml `theme.font.text` and `theme.font.code` (Google Fonts family names)',
    requiredExtensions: [],
    starlightOutput:
      '@fontsource-variable/<family> dependency added to package.json + `@import` in src/styles/custom.css; `--sl-font` and `--sl-font-mono` overrides set to the imported family',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'theme-language',
    materialInput: 'mkdocs.yml `theme.language` (UI string locale, e.g. `de`, `fr`, `ja`)',
    requiredExtensions: [],
    starlightOutput:
      'starlight `defaultLocale` + `locales: { root: { label, lang } }` in astro.config.mjs (Starlight ships UI translations for the same locale set as Material)',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'theme-logo-icons',
    materialInput:
      'mkdocs.yml `theme.logo`, `theme.favicon`, and `theme.icon.{logo,repo,edit,view,admonition,tag,previous,next}` keys',
    starlightOutput:
      'logo asset copied into src/assets/ and wired as `logo: { src, alt }`; favicon copied into public/ and linked via `head: [{ tag: "link", attrs: { rel: "icon", href: "..." } }]`; `theme.icon.repo` mapped to `social: [{ icon }]`; remaining `theme.icon.*` keys (admonition, tag, previous, next, edit, view) are dropped with a diagnostic — Starlight has no equivalent first-party override surface, but `starlight-plugin-icons` provides PARTIAL coverage (sidebar, codeblock, and filetree icon customization). Admonition / page-action icon overrides remain unmapped and require component overrides.',
    requiredExtensions: [],
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'plugin-privacy',
    materialInput:
      'mkdocs.yml `plugins: privacy` (Material privacy plugin — fetches and inlines external assets at build time, including Google Fonts and external images)',
    requiredExtensions: [],
    starlightOutput:
      'no automatic conversion — Astro has no equivalent build-time external-asset rewriter; diagnostic surfaces the manual remediation path (use @fontsource for fonts, copy external images into src/assets/, or write an integration that mirrors privacy-plugin behavior)',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'manual',
  },
  {
    featureId: 'theme-features',
    materialInput:
      'mkdocs.yml `theme.features` list — navigation.tabs, navigation.sections, navigation.expand, navigation.path, navigation.indexes, navigation.tracking, navigation.instant, navigation.prune, navigation.top, toc.integrate, toc.follow, header.autohide, content.tabs.link, content.code.copy, content.action.edit, content.action.view, search.suggest, search.highlight, search.share, announce.dismiss',
    requiredExtensions: [],
    starlightOutput:
      'per-feature mapping: navigation.indexes → starlight `pagefind` + group index pages (no-op, on by default); navigation.instant → no-op (Astro view transitions handle this via `<ClientRouter />`); content.action.edit → starlight `editLink: { baseUrl }`; content.action.view → `starlight-page-actions` (auto-installed); announce.dismiss → `starlight-announcement` (auto-installed); navigation.tabs → top-level sidebar groups (Starlight default); toc.integrate, toc.follow, header.autohide, navigation.prune → diagnostic-only (no Starlight equivalent); search.* → replaced by Pagefind defaults',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'plugin-search',
    materialInput: 'mkdocs.yml `plugins: search` (default Material/MkDocs Lunr-based search)',
    requiredExtensions: [],
    starlightOutput:
      'no-op — Starlight ships Pagefind-based search built-in. lunr-specific `search.lang`, `search.separator`, `search.pipeline` options are dropped with a diagnostic; users wanting custom tokenization configure Pagefind via the starlight `pagefind` config key',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'extra-analytics',
    materialInput:
      'mkdocs.yml `extra.analytics: { provider: google, property: G-XXX }` (also matrono, custom providers; optional `feedback:` block)',
    requiredExtensions: [],
    starlightOutput:
      '@astrojs/partytown dependency + a `<script type="text/partytown">` Google Analytics snippet injected via starlight `head: [...]` config; `extra.analytics.feedback` (Was-this-page-helpful widget) is dropped with a diagnostic — no equivalent in Starlight',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'plugin-social',
    materialInput:
      'mkdocs.yml `plugins: social` (Material social-cards plugin — generates Open Graph card PNGs at build using Pillow + Cairo)',
    requiredExtensions: [],
    starlightOutput:
      'no automatic conversion — recommended dep `astro-og-canvas` (or `@astrojs/og`) added to package.json with a stub `src/pages/og/[...slug].png.ts` endpoint; per-card layout, fonts, and color overrides are not auto-mapped from the Material `social.cards_layout_options` block',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'high',
  },
  {
    featureId: 'theme-header',
    materialInput:
      'mkdocs.yml header surface — `extra.announce` (or overrides/main.html announcement bar), `repo_url` + `repo_name` + `edit_uri`, `theme.features: [announce.dismiss, header.autohide]`',
    requiredExtensions: [],
    starlightOutput:
      'announcement → starlight `banner: { content }`; repo_url/repo_name → `social: [{ icon: "github" | "gitlab" | "bitbucket", label, href }]`; edit_uri → `editLink: { baseUrl }`; announce.dismiss → `starlight-announcement` (auto-installed); header.autohide has no Starlight equivalent (diagnostic)',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'theme-footer',
    materialInput:
      'mkdocs.yml `extra.social: [...]`, `extra.generator`, `copyright`, `extra.consent` (cookie consent block)',
    requiredExtensions: [],
    starlightOutput:
      'extra.social → starlight `social: [...]` (icon mapped per platform); `copyright` → custom `Footer.astro` component override under src/components/overrides/; `extra.generator: false` → no-op (Astro never emits a generator footer); `extra.consent` is dropped with a diagnostic — no Starlight equivalent, recommend a community plugin or manual cookie banner',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'comment-system',
    materialInput:
      'Material partial override (overrides/main.html or overrides/partials/comments.html) embedding Giscus, Disqus, or Utterances script tags — not a single config knob',
    requiredExtensions: [],
    starlightOutput:
      'no automatic conversion — recommendation surfaced as a diagnostic to install `starlight-giscus` (or write a `Comments.astro` component override); the partial-override HTML itself is left in the project for manual porting',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'manual',
  },
  {
    featureId: 'plugin-optimize',
    materialInput:
      'mkdocs.yml `plugins: optimize` (Material optimize plugin — minifies HTML/CSS/JS and recompresses images at build)',
    requiredExtensions: [],
    starlightOutput:
      'no-op — Astro\'s build pipeline already minifies HTML/CSS/JS, fingerprints assets, and supports image optimization via `astro:assets`. Diagnostic confirms the plugin was detected and replaced by built-ins; per-asset `optimize.cache_dir` and concurrency knobs are dropped',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'plugin-offline',
    materialInput: 'mkdocs.yml `plugins: offline` (Material offline-bundle plugin — single-file site for filesystem viewing)',
    requiredExtensions: [],
    starlightOutput:
      'no automatic conversion — Astro has no equivalent file:// bundler. Diagnostic recommends a manual remediation: build with `astro build`, then either ship the `dist/` directory verbatim or wrap it in a service worker via `@vite-pwa/astro` for offline PWA delivery',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'manual',
  },
  {
    featureId: 'expressive-code-theme',
    materialInput:
      '`markdown_extensions: pymdownx.highlight` with a `pygments_style:` value (monokai, dracula, nord, solarized-dark, material, github-dark, …). Sibling options: linenums, anchor_linenums, line_spans, line_anchors, noclasses, use_pygments.',
    requiredExtensions: ['pymdownx.highlight'],
    starlightOutput:
      'starlight `expressiveCode: { themes: [light, dark] }` populated from a curated Pygments→Shiki theme pair (e.g. monokai → [github-light, monokai], solarized-dark → [solarized-light, solarized-dark]). Unknown styles fall back to [github-light, github-dark] with a diagnostic. linenums/anchor_linenums/line_spans/line_anchors/noclasses/use_pygments are dropped (no per-config equivalent in ExpressiveCode).',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
  },
  {
    featureId: 'package-managers-tabs',
    materialInput:
      'pymdownx.tabbed tab group where all tabs are labeled with package manager names (npm, yarn, pnpm, bun — any subset ≥2)',
    requiredExtensions: ['pymdownx.tabbed'],
    starlightOutput:
      '`<PackageManagers pkg="...">` component from `starlight-package-managers`; pkg value extracted from the install command in the npm tab body',
    fileExt: 'mdx',
    conversionType: 'ast-transform',
    risk: 'medium',
  },
  {
    featureId: 'plugin-swagger-ui',
    materialInput:
      'mkdocs.yml `plugins: mkdocs-swagger-ui-tag` (renders Swagger/OpenAPI specs via the `<swagger-ui>` custom element in Markdown)',
    requiredExtensions: [],
    starlightOutput:
      '`starlight-openapi` Starlight plugin auto-wired in astro.config.mjs; each `<swagger-ui>` tag must be manually replaced with the appropriate Starlight Openapi route or component',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'lossy-named',
  },
  {
    featureId: 'code-fence-filetree',
    materialInput:
      'A fenced code block (text or unspecified language) with ≥3 lines, ≥2 containing box-drawing chars (├/└/│), and a directory-name first line (ends with `/`)',
    requiredExtensions: [],
    starlightOutput:
      '`<FileTree>` Starlight built-in component wrapping a nested unordered Markdown list; file promoted to `.mdx`',
    fileExt: 'mdx',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'ordered-list-steps',
    materialInput:
      'A top-level ordered list with ≥3 multi-line items preceded by a tutorial-style heading (containing "step", "tutorial", "guide", "getting started", or starting with a verb like Setup/Install/Create/Build)',
    requiredExtensions: [],
    starlightOutput:
      '`<Steps>` Starlight built-in component wrapping the ordered list; file promoted to `.mdx`',
    fileExt: 'mdx',
    conversionType: 'ast-transform',
    risk: 'medium',
  },
  {
    featureId: 'grid-cards-linkcard',
    materialInput:
      'A `<div class="grid cards">` card whose body is either a single bare Markdown link (`- [Title](href)`) or a bare link followed by a single plain-prose paragraph — a navigation card with optional description',
    requiredExtensions: ['attr_list', 'md_in_html'],
    starlightOutput:
      '`<LinkCard title="Title" href="/slug">` (or `<LinkCard title=… href=… description="…">` when a plain paragraph follows the link) Starlight built-in component; file promoted to `.mdx`',
    fileExt: 'mdx',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'landing-page-splash',
    materialInput:
      'Project root `index.md` with hero image (top-level `![logo]()` or `<img>`), CTA buttons (`.md-button` links), and/or a `<div class="grid cards">` feature grid — a Material "landing page" pattern',
    requiredExtensions: ['attr_list', 'md_in_html'],
    starlightOutput:
      'frontmatter rewritten to `template: splash` + `hero: { title, tagline, image, actions }` block; page body kept below the hero for the feature grid; Starlight splash template renders the hero above body content automatically',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'high',
  },
  {
    featureId: 'fancylists',
    materialInput:
      'Roman (`i. ii. iii.`, `I. II.`) and alpha (`a. b.`, `A.  B.`) ordered list markers from `pymdownx.fancylists`',
    requiredExtensions: ['pymdownx.fancylists'],
    starlightOutput:
      'raw `<ol type="i|I|a|A">` HTML block with `<li>` items; remark-parse would otherwise re-number every marker as decimal',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
  {
    featureId: 'wikilinks',
    materialInput: '`[[Page Name]]` Python-Markdown wikilink syntax',
    requiredExtensions: ['wikilinks'],
    starlightOutput:
      'rewritten to `[Page Name](/page-name/)` with slug derived from lowercase + dash-separated label normalization',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'smarty',
    materialInput:
      'Python-Markdown `smarty` extension (ASCII smart quotes, em/en dashes, ellipsis)',
    requiredExtensions: ['smarty'],
    starlightOutput:
      'recommend `remark-smartypants` in `markdown.remarkPlugins` of `astro.config.mjs`; defaults match `smarty` substitutions',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'progressbar',
    materialInput:
      '`[=85% "85%"]` / `[=1/2 "Half"]` syntax from `pymdownx.progressbar`',
    requiredExtensions: ['pymdownx.progressbar'],
    starlightOutput:
      'raw `<progress value="N" max="100">label</progress>` HTML element; Material `.progress-bar` / `.progress-label` CSS classes are not preserved',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'medium',
  },
  {
    featureId: 'quotes-callouts',
    materialInput:
      '`pymdownx.quotes` with `callouts: true` — `> [!note]`, `> [!tip] Title`, `> [!danger]-` (collapsible) syntax',
    requiredExtensions: ['pymdownx.quotes'],
    starlightOutput:
      'routed through `scan-github-alerts` (case-insensitive); `starlight-github-alerts` plugin auto-installed and renders the callouts as Starlight asides at build time',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'pymdownx-extra',
    materialInput:
      '`pymdownx.extra` meta-bundle (aliases betterem, superfences, footnotes, attr_list, def_list, tables, abbr, md_in_html)',
    requiredExtensions: ['pymdownx.extra'],
    starlightOutput:
      'no-op — every component extension is already covered individually. Bespoke nested options (`pymdownx.extra: { footnotes: { BACKLINK_TEXT } }`) are dropped',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'betterem',
    materialInput:
      '`pymdownx.betterem` (smart-emphasis: `smart_enable: all`/`asterisk`/`underscore`/`none`)',
    requiredExtensions: ['pymdownx.betterem'],
    starlightOutput:
      'no-op — remark-parse uses CommonMark emphasis rules; intra-word emphasis is parsed differently. Spot-check prose with `_underscore_` mid-word.',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'b64',
    materialInput: '`pymdownx.b64` — base64-inline image references',
    requiredExtensions: ['pymdownx.b64'],
    starlightOutput:
      'no-op — Astro\'s asset pipeline (`astro:assets`) handles image bundling via the build graph rather than data: URLs',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'plugin-minify',
    materialInput: '`mkdocs-minify-plugin` (HTML/CSS/JS minification at build)',
    requiredExtensions: [],
    starlightOutput:
      'no-op — Astro/Vite minify HTML/CSS/JS by default in production builds. Plugin\'s `minify_html_options` etc. are dropped',
    fileExt: 'md',
    conversionType: 'passthrough',
    risk: 'low',
  },
  {
    featureId: 'plugin-glossary',
    materialInput: '`mkdocs-glossary-plugin` (hover-tooltip glossary terms)',
    requiredExtensions: [],
    starlightOutput:
      'recommend the converter\'s `abbr` handling (`*[TERM]: definition`) for plain-text definitions, or a custom MDX `<Glossary>` component for richer tooltips',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'medium',
  },
  {
    featureId: 'plugin-video',
    materialInput: '`mkdocs-video` (`![type:video](url)` syntax)',
    requiredExtensions: [],
    starlightOutput:
      'recommend native MDX `<video>` elements or `starlight-videos` plugin (course-style video components)',
    fileExt: 'mdx',
    conversionType: 'recommended-dep',
    risk: 'medium',
  },
  {
    featureId: 'plugin-puml',
    materialInput: '`mkdocs-puml` / `plantuml-markdown` (PlantUML diagrams via `@startuml...@enduml`)',
    requiredExtensions: [],
    starlightOutput:
      'recommend `astro-plantuml` integration; the same `@startuml...@enduml` fenced syntax is supported',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'plugin-encryptcontent',
    materialInput: '`mkdocs-encryptcontent-plugin` (per-page password encryption)',
    requiredExtensions: [],
    starlightOutput:
      'no automatic conversion — Astro outputs static HTML with no client-side decryption layer. Recommend a deployment-level auth gate (Cloudflare Access, Netlify password) or removing protected content from the public site',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'manual',
  },
  {
    featureId: 'plugin-charts',
    materialInput: '`mkdocs-charts-plugin` (Vega-Lite block syntax)',
    requiredExtensions: [],
    starlightOutput:
      'no first-class equivalent — recommend a custom MDX `<VegaChart>` component using vega-embed, or pre-render charts to SVG/PNG ahead of conversion',
    fileExt: 'mdx',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'manual',
  },
  {
    featureId: 'plugin-monorepo',
    materialInput:
      '`mkdocs-monorepo-plugin` (multiple sub-docs trees stitched into one site at MkDocs build time)',
    requiredExtensions: [],
    starlightOutput:
      'no automatic conversion — the plugin\'s build-time fetch is not replicated. Source-side placeholder pages render with their stub text only. Recommended migration: clone external content locally before conversion, OR replace placeholder pages with links to the external docs sites, OR use Astro content collections + a custom loader',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'manual',
  },
  {
    featureId: 'plugin-multirepo',
    materialInput:
      '`mkdocs-multirepo-plugin` (similar to monorepo but with arbitrary repo→subdir mappings)',
    requiredExtensions: [],
    starlightOutput:
      'same as `plugin-monorepo` — no automatic conversion; placeholder pages must be fetched, removed, or replaced manually',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'manual',
  },
  {
    featureId: 'plugin-markdownextradata',
    materialInput:
      '`mkdocs-markdownextradata-plugin` (`{{ var }}` Jinja-style variable interpolation from `extra.*`)',
    requiredExtensions: [],
    starlightOutput:
      'no automatic conversion — bare `{{ }}` conflicts with MDX expressions. Recommend Astro `import.meta.env.PUBLIC_*` env vars in MDX',
    fileExt: 'mdx',
    conversionType: 'recommended-dep',
    risk: 'high',
    translationDepth: 'manual',
  },
  {
    featureId: 'badge-component',
    materialInput:
      'Material `.md-tag` chips, blog/tags tag pills, or any inline label rendered with a colored chip-style background',
    requiredExtensions: ['attr_list'],
    starlightOutput:
      '`<Badge text="..." variant="note|tip|caution|danger|success|default" size="small|medium|large" />` Starlight built-in component; file promoted to `.mdx`',
    fileExt: 'mdx',
    conversionType: 'ast-transform',
    risk: 'medium',
  },
  {
    featureId: 'heading-badges',
    materialInput:
      'ATX heading with attr_list class flagged as a badge marker (e.g., `## Title { .badge }`, `### Beta { .new }`) — detected by `scan-heading-badges`',
    requiredExtensions: ['attr_list'],
    starlightOutput:
      '`starlight-heading-badges` community plugin auto-wired in astro.config.mjs; the heading\'s `{ .class }` is preserved as a badge marker the plugin renders into a `<Badge>` next to the heading text',
    fileExt: 'md',
    conversionType: 'recommended-dep',
    risk: 'low',
  },
  {
    featureId: 'code-fence-copy-flag',
    materialInput:
      '` ```python { .python .copy } ` / ` ```python { .python .no-copy } ` — Material per-block copy-button toggle',
    requiredExtensions: ['attr_list', 'pymdownx.highlight', 'pymdownx.superfences'],
    starlightOutput:
      'attr_list stripped during normalization; Expressive Code shows a copy button by default (no per-block disable). For `.no-copy`, recommend `frame="none"` per-block or `expressiveCode.frames.showCopyToClipboardButton: false` globally',
    fileExt: 'md',
    conversionType: 'text-pre-parse',
    risk: 'low',
  },
];
