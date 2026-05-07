/**
 * AST plugin: ensure every output document has a `title` in its frontmatter.
 *
 * Starlight's docs schema rejects pages without `title`. MkDocs sources
 * frequently omit frontmatter (the theme falls back to the first H1), so
 * the converter synthesizes one deterministically.
 *
 * Resolution order:
 *   1. Existing frontmatter `title` (preserved verbatim).
 *   2. First H1 heading text.
 *   3. Filename stem humanized (`auth-tokens.md` → `Auth Tokens`).
 *
 * `index.md` maps to `Home` when no frontmatter or H1 supplies a title.
 *
 * Idempotent (existing `title:` passes through). Pure given the AST and
 * `sourcePath`.
 */

import type { Heading, Root, Yaml } from 'mdast';
import type { Plugin } from 'unified';
import type { Diagnostic } from '../../../domain/diagnostics/diagnostic.js';
import { createDiagnostic } from '../../../domain/diagnostics/diagnostic.js';

export interface EnsureTitleOptions {
  readonly sourcePath: string;
  /**
   * Optional collector for info diagnostics emitted when the plugin
   * mutates the body — currently only fires when the duplicate-H1 strip
   * path runs. Callers thread this through so MIGRATION_NOTES can audit
   * which files lost a body H1.
   */
  readonly diagnostics?: Diagnostic[];
}

const NEEDS_QUOTING = /[:#&*!|>'"%@`{}[\]]/;
// YAML 1.1/1.2 coerces these unquoted scalars to non-string types. Real-
// world break (governance/.../2025-10-15.md): the source has no
// frontmatter; we synthesize one with `title: <basename>` = `2025-10-15`.
// YAML reads that as a Date object. Starlight's content schema then rejects
// the entry: "title: Expected 'string', received 'object'".
const COERCED_SCALAR = new RegExp(
  '^(?:' +
    // ISO-8601 date / timestamp
    String.raw`\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?` +
    // Number (int, float, scientific)
    String.raw`|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?` +
    // Bool / null markers (any case)
    '|true|false|yes|no|on|off|null|~|True|False|Yes|No|On|Off|Null|TRUE|FALSE|YES|NO|ON|OFF|NULL' +
    ')$',
);

export const ensureTitle: Plugin<[EnsureTitleOptions], Root> = (options) => {
  return (tree) => {
    const existingYaml = findYamlNode(tree);
    const existingTitle =
      existingYaml === null ? null : extractFrontmatterTitle(existingYaml.value);
    let resolvedTitle: string;
    if (existingTitle !== null) {
      resolvedTitle = existingTitle;
    } else {
      const synthesized = deriveTitle(tree, options.sourcePath);
      resolvedTitle = synthesized;
      if (existingYaml === null) {
        tree.children.unshift({
          type: 'yaml',
          value: `title: ${quoteIfNeeded(synthesized)}`,
        });
      } else {
        existingYaml.value = prependTitle(existingYaml.value, synthesized);
      }
    }
    // Strip the body's first H1 if it matches the resolved title.
    //
    // Material's convention starts every page body with `# Page Title`
    // matching the implicit Material header. Starlight auto-renders the
    // frontmatter `title:` as the page H1, so leaving the body H1
    // produces a visible duplicate.
    //
    // Comparison: whitespace-normalized AND case-insensitive. The
    // case-insensitive choice handles real-world variation like
    // `title: API` vs body `# Api` — the visual duplicate users complain
    // about — without forcing them to keep titles letter-perfect across
    // two sources of truth. Authors who genuinely want a different body
    // H1 should write a different *word*, not a different case.
    //
    // When stripping happens, an info diagnostic is appended to
    // `options.diagnostics` (when supplied) naming the original H1 text
    // so MIGRATION_NOTES.md gives users a grep target.
    stripDuplicateH1(tree, resolvedTitle, options);
  };
};

function extractFrontmatterTitle(yamlSource: string): string | null {
  // Match a top-level `title:` line, stripping surrounding quotes.
  const m = /^title\s*:\s*(.+?)\s*$/m.exec(yamlSource);
  if (m === null) return null;
  const raw = m[1] ?? '';
  return raw.replace(/^['"]|['"]$/g, '').trim();
}

function stripDuplicateH1(tree: Root, title: string, options: EnsureTitleOptions): void {
  const titleNorm = normalizeForCompare(title);
  for (let i = 0; i < tree.children.length; i += 1) {
    const child = tree.children[i];
    if (child === undefined) continue;
    if (child.type === 'yaml') continue;
    // First non-yaml child must be the H1 to count as the page's lead
    // heading. If it's a paragraph, table, or anything else, the page
    // doesn't have the duplicate-H1 problem.
    if (child.type !== 'heading') return;
    const heading = child as Heading;
    if (heading.depth !== 1) return;
    const headingText = extractHeadingText(heading);
    if (normalizeForCompare(headingText) !== titleNorm) return;
    // Detect "the H1 is the ENTIRE body" before mutating — every
    // remaining non-yaml sibling counts as real content. If there is
    // none, the page was a stub and the strip leaves an empty body;
    // promote the diagnostic to warning + a different ruleId so users
    // see the louder signal in MIGRATION_NOTES.
    const isStub = isOnlyChildBody(tree, i);
    tree.children.splice(i, 1);
    if (options.diagnostics !== undefined) {
      options.diagnostics.push(
        isStub
          ? createDiagnostic({
              severity: 'warning',
              ruleId: 'page-stub-detected',
              source: 'transform/ensure-title',
              message:
                `Page body is empty after stripping the duplicate H1 "${headingText}". ` +
                `The source file contained only this heading and no other content — ` +
                `it was a stub in the original Material/MkDocs site too (Material would ` +
                `have rendered just the heading on its own). Starlight renders the ` +
                `frontmatter \`title:\` as the page heading, so the page now displays ` +
                `the title with no body. Either add real body content to the source ` +
                `before re-running the converter, remove the page from the sidebar, ` +
                `or accept the stub.`,
            })
          : createDiagnostic({
              severity: 'info',
              ruleId: 'duplicate-h1-stripped',
              source: 'transform/ensure-title',
              message:
                `Body H1 "${headingText}" was stripped because it duplicates the frontmatter ` +
                `\`title:\` ("${title}"). Starlight auto-renders the frontmatter title as the ` +
                `page heading; keeping the body H1 would render the title twice. The body's ` +
                `original heading text is preserved here for audit; nothing else in the body ` +
                `was touched.`,
            }),
      );
    }
    return;
  }
}

/** Return true when removing children[index] would leave the document
 *  with no non-yaml content. Used to distinguish a true stub page from
 *  a real page with a duplicate lead heading. */
function isOnlyChildBody(tree: Root, index: number): boolean {
  for (let i = 0; i < tree.children.length; i += 1) {
    if (i === index) continue;
    const child = tree.children[i];
    if (child === undefined) continue;
    if (child.type === 'yaml') continue;
    return false;
  }
  return true;
}

/**
 * Normalize a string for duplicate-H1 comparison: collapse internal
 * whitespace, trim ends, lowercase. Captures the equivalence class users
 * intuitively expect (`API` ≡ `Api` ≡ `api`, `Foo Bar` ≡ `Foo  Bar`).
 */
function normalizeForCompare(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function findYamlNode(tree: Root): Yaml | null {
  const first = tree.children[0];
  return first !== undefined && first.type === 'yaml' ? first : null;
}

function deriveTitle(tree: Root, sourcePath: string): string {
  const headingTitle = findFirstH1Text(tree);
  if (headingTitle !== null) {
    return headingTitle;
  }
  return humanizeFilename(sourcePath);
}

function findFirstH1Text(tree: Root): string | null {
  for (const child of tree.children) {
    if (child.type !== 'heading') {
      continue;
    }
    const heading = child as Heading;
    if (heading.depth !== 1) {
      continue;
    }
    const text = extractHeadingText(heading);
    // Treat an empty or whitespace-only `# ` as "no usable H1" so the
    // caller falls through to the filename-based title. Real-world break
    // (AmbiqAI/soundkit/docs/index.md): bare `#` produced `title: ` (an
    // unquoted empty value), which YAML parses as `null` and Astro's
    // content schema rejects with "Expected 'string', received 'object'".
    if (text.trim().length === 0) {
      continue;
    }
    return text;
  }
  return null;
}

function extractHeadingText(heading: Heading): string {
  const parts: string[] = [];
  for (const child of heading.children) {
    if (child.type === 'text') {
      parts.push(child.value);
    } else if ('value' in child && typeof child.value === 'string') {
      parts.push(child.value);
    } else if ('children' in child && Array.isArray(child.children)) {
      for (const grand of child.children) {
        if (grand.type === 'text') {
          parts.push(grand.value);
        }
      }
    }
  }
  return parts.join('').trim();
}

function humanizeFilename(sourcePath: string): string {
  const parts = sourcePath.split(/[/\\]/);
  const filename = parts[parts.length - 1] ?? '';
  const stem = filename.replace(/\.(md|mdx)$/i, '');
  if (stem === 'index') {
    return 'Home';
  }
  return stem
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function quoteIfNeeded(title: string): string {
  if (NEEDS_QUOTING.test(title) || COERCED_SCALAR.test(title)) {
    // Use SINGLE-quoted YAML scalars so backslashes don't trigger YAML's
    // escape-sequence parsing. Real-world break (pyodide-mkdocs-theme):
    // a heading-derived title contains MDX-escaped braces (`\{#anchor\}`)
    // and Jinja shortcodes; double-quoted YAML reads `\{` as an unknown
    // escape sequence and refuses to parse the document. Single-quoted
    // YAML treats every char literal except `'`, which we double per spec.
    const escaped = title.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  return title;
}

function prependTitle(yamlSource: string, title: string): string {
  return `title: ${quoteIfNeeded(title)}\n${yamlSource}`;
}
