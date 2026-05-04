/**
 * Per-occurrence scan helpers for three previously bulk-emitted diagnostics.
 *
 * Each function takes an array of (sourcePath, content) pairs and returns
 * per-file TaggedDiagnostic-compatible objects for inclusion in MIGRATION_NOTES.
 *
 * All functions are pure: no I/O, no side-effects.
 */

import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';

export interface TaggedDiagnosticLight {
  readonly sourcePath: string;
  readonly diagnostic: ReturnType<typeof createDiagnostic>;
}

/** Matches a `=== "Tab Label"` content-tab block opener. */
const TABS_LINK_RE = /^={3,}\s*"/m;

/** Matches a fenced code block with linenums option. */
const LINENUMS_FENCE_RE = /^```\w+[^`]*?\blinenums\b/m;

/** Matches a fenced code block whose attr-list contains `.no-copy` or
 *  `.no-select` — Material's per-block opt-outs from copy/select buttons.
 *  ExpressiveCode has no per-block disable for these so the markers are
 *  silently dropped; this scanner surfaces a diagnostic so the loss is
 *  visible. */
const NO_COPY_FENCE_RE = /^```[^`\n]*?\{[^}\n]*?\.no-copy[^}\n]*?\}/m;
const NO_SELECT_FENCE_RE = /^```[^`\n]*?\{[^}\n]*?\.no-select[^}\n]*?\}/m;

/** Matches Material's alternate LaTeX delimiters `\(...\)` and `\[...\]`,
 *  which Material recommends as a MathJax-friendly alternative to `$`/`$$`.
 *  remark-math (Starlight's math pipeline) does NOT recognize these by
 *  default. The negative lookbehind avoids false-positives on a literal
 *  backslash-escaped `\\(` or `\\[`. */
const BACKSLASH_PAREN_RE = /(?<!\\)\\\(/;
const BACKSLASH_BRACKET_RE = /(?<!\\)\\\[/;

/**
 * Scan source files for `=== "Tab"` content-tab blocks.
 * Used when `content.tabs.link` is enabled.
 */
export function scanTabsLinkOccurrences(
  files: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<TaggedDiagnosticLight> {
  const out: TaggedDiagnosticLight[] = [];
  for (const [sourcePath, content] of files) {
    if (!TABS_LINK_RE.test(content)) continue;
    out.push({
      sourcePath,
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'feature-tabs-link-occurrence',
        source: 'detect-features/scan-bulk-diagnostics',
        message: `content.tabs.link: file "${sourcePath}" contains tab blocks that will receive syncKey in the output.`,
      }),
    });
  }
  return out;
}

/**
 * Scan source files for code fences with the `linenums` option.
 * Used when `codehilite` extension is active.
 */
export function scanCodehiliteLinenumsOccurrences(
  files: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<TaggedDiagnosticLight> {
  const out: TaggedDiagnosticLight[] = [];
  for (const [sourcePath, content] of files) {
    if (!LINENUMS_FENCE_RE.test(content)) continue;
    out.push({
      sourcePath,
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'extension-codehilite-linenums-occurrence',
        source: 'detect-features/scan-bulk-diagnostics',
        message: `codehilite linenums: file "${sourcePath}" has a fenced code block with linenums option. Expressive Code renders line numbers natively.`,
      }),
    });
  }
  return out;
}

/**
 * Scan source files for fenced code blocks whose attr-list contains the
 * Material per-block opt-outs `.no-copy` or `.no-select`. ExpressiveCode (the
 * Starlight code-block renderer) does not expose a per-block toggle for the
 * copy or select buttons — they are always present. The markers are silently
 * stripped by `code-block-meta` so the fence still parses; this scanner
 * surfaces a diagnostic per file so users know the opt-out is lost.
 *
 * One diagnostic per file even if multiple fences in the same file use the
 * markers — the message lists which markers were seen so the user can grep.
 */
export function scanCodeBlockOptOuts(
  files: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<TaggedDiagnosticLight> {
  const out: TaggedDiagnosticLight[] = [];
  for (const [sourcePath, content] of files) {
    const hasNoCopy = NO_COPY_FENCE_RE.test(content);
    const hasNoSelect = NO_SELECT_FENCE_RE.test(content);
    if (!hasNoCopy && !hasNoSelect) continue;
    const markers = [
      ...(hasNoCopy ? ['.no-copy'] : []),
      ...(hasNoSelect ? ['.no-select'] : []),
    ].join(' / ');
    out.push({
      sourcePath,
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'code-block-opt-out-dropped',
        source: 'detect-features/scan-bulk-diagnostics',
        message: `Code-block opt-out marker (${markers}) found in "${sourcePath}". ExpressiveCode (Starlight's code renderer) has no per-block toggle for the copy or select buttons — they remain enabled. To hide them globally, configure ExpressiveCode plugins in astro.config.mjs (e.g., remove the copy plugin); per-block disable is not supported.`,
      }),
    });
  }
  return out;
}

/**
 * Scan source files for Material's alternate LaTeX delimiters `\(...\)`
 * (inline) and `\[...\]` (block). Material's docs recommend these as a
 * MathJax-friendly alternative to `$`/`$$`, but remark-math (the math
 * pipeline auto-wired into emitted Starlight projects) does not recognize
 * them by default.
 *
 * One diagnostic per file even if the file uses both forms — the message
 * lists the markers seen so the user can grep.
 */
export function scanLatexDelimiters(
  files: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<TaggedDiagnosticLight> {
  const out: TaggedDiagnosticLight[] = [];
  for (const [sourcePath, content] of files) {
    const hasParen = BACKSLASH_PAREN_RE.test(content);
    const hasBracket = BACKSLASH_BRACKET_RE.test(content);
    if (!hasParen && !hasBracket) continue;
    const markers = [
      ...(hasParen ? ['\\(...\\)'] : []),
      ...(hasBracket ? ['\\[...\\]'] : []),
    ].join(' / ');
    out.push({
      sourcePath,
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'latex-delimiter-unsupported',
        source: 'detect-features/scan-bulk-diagnostics',
        message: `LaTeX delimiter (${markers}) found in "${sourcePath}". remark-math (the Starlight-default math pipeline) only recognizes $...$ and $$...$$. The marker will pass through verbatim and render as a literal backslash. Either rewrite to dollar delimiters in source, or configure a custom remark plugin in astro.config.mjs to recognize backslash delimiters (e.g., a Pandoc-flavored math plugin).`,
      }),
    });
  }
  return out;
}

/**
 * Scan an `extra_javascript` path list for runtime math-rendering scripts
 * (MathJax, KaTeX). Material loads these at runtime to render `$`/`\(` as
 * formulas in the browser; the converter replaces this with build-time
 * `remark-math` + `rehype-katex` and the runtime script becomes obsolete
 * (and may even conflict with KaTeX HTML produced by rehype). The scanner
 * surfaces a diagnostic per matched path so the user knows the script is
 * being copied through but should be removed.
 */
export function scanMathScripts(
  paths: ReadonlyArray<string>,
): ReadonlyArray<TaggedDiagnosticLight> {
  const out: TaggedDiagnosticLight[] = [];
  for (const path of paths) {
    const lower = path.toLowerCase();
    const isMathJax = /\bmathjax\b/.test(lower);
    const isKatex = /\bkatex\b/.test(lower);
    if (!isMathJax && !isKatex) continue;
    const which = isMathJax ? 'MathJax' : 'KaTeX';
    out.push({
      sourcePath: path,
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'math-runtime-script-superseded',
        source: 'detect-features/scan-bulk-diagnostics',
        message: `extra_javascript entry "${path}" looks like a ${which} runtime configuration. Astro renders math at build time via remark-math + rehype-katex (auto-wired when pymdownx.arithmatex is detected), so this script is now redundant and may conflict with the rehype output. Remove the entry from astro.config.mjs head[] after confirming math still renders.`,
      }),
    });
  }
  return out;
}

/**
 * Emit a diagnostic for each `.meta.yml` file detected in the docs directory.
 * Used when the Material `meta` plugin is active.
 */
export function scanMetaYmlFiles(
  metaFiles: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<TaggedDiagnosticLight> {
  return metaFiles.map(([sourcePath, content]) => ({
    sourcePath,
    diagnostic: createDiagnostic({
      severity: 'warning',
      ruleId: 'plugin-meta-config-detected',
      source: 'detect-features/scan-bulk-diagnostics',
      message: `meta plugin: .meta.yml found at "${sourcePath}". Frontmatter keys: ${summarizeYamlKeys(content)}. Inline these into each affected page.`,
    }),
  }));
}

/**
 * Extract top-level YAML key names from content for a brief summary.
 * Does not parse YAML — just looks for leading `key:` patterns.
 */
function summarizeYamlKeys(content: string): string {
  const keys: string[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
    if (m !== null) keys.push(m[1] ?? '');
  }
  return keys.length === 0 ? '(none)' : keys.join(', ');
}
