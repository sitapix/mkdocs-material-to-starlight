/**
 * Decide whether a converted source file needs the `.mdx` extension.
 *
 * Pure: takes the source string, returns `{ extension, reasons,
 * usedComponents }`. No I/O. Used by the per-file converter to choose the
 * output filename and the import-injector to add Starlight built-ins.
 *
 * Promotion rules (any one triggers `.mdx`):
 *   1. A line starts with `import ... from`. ESM imports require MDX.
 *   2. A PascalCase JSX tag appears outside fenced code / inline code.
 *   3. A `{frontmatter.x}` style expression appears in body text.
 *
 * The detector strips fenced code blocks and inline code spans before
 * scanning so legitimate examples (`Use \`<Component>\`` or fenced HTML
 * snippets) don't trigger spurious promotion.
 */

const STARLIGHT_BUILTINS: ReadonlySet<string> = new Set([
  'Aside',
  'Badge',
  'Card',
  'CardGrid',
  'Code',
  'FileTree',
  'Icon',
  'LinkButton',
  'LinkCard',
  'Steps',
  'Tabs',
  'TabItem',
]);

const IMPORT_RE = /^[ \t]*import\s+[^\n]+\bfrom\s+['"][^'"]+['"]/m;
// Match a JSX-shaped opening or self-closing tag. The name must be PascalCase
// and contain only JSX-identifier-legal characters (no hyphens — those would
// be invalid JSX), and the tag must terminate cleanly with `>` or `/>`. This
// rejects prose placeholders like `<EXTERNAL-IP>:8080` and `<NAME>` that the
// MDX parser would treat as broken component references.
const JSX_TAG_RE = /<([A-Z][A-Za-z0-9]*)(\s[^<>]*?)?(\/?)>/g;
const FRONTMATTER_EXPR_RE = /\{\s*frontmatter\.[A-Za-z_]/;
const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;

type MdxExtension = 'md' | 'mdx';
type MdxReason = 'import-statement' | 'jsx-component' | 'frontmatter-expression';

export interface MdxDecision {
  readonly extension: MdxExtension;
  readonly reasons: ReadonlyArray<MdxReason>;
  readonly usedComponents: ReadonlyArray<string>;
}

export function detectMdxNeeds(source: string): MdxDecision {
  const stripped = stripCode(source);
  const reasons = new Set<MdxReason>();
  if (IMPORT_RE.test(stripped)) reasons.add('import-statement');
  if (FRONTMATTER_EXPR_RE.test(stripped)) reasons.add('frontmatter-expression');
  const usedComponents = collectComponents(stripped);
  if (usedComponents.length > 0) reasons.add('jsx-component');
  const extension: MdxExtension = reasons.size > 0 ? 'mdx' : 'md';
  return {
    extension,
    reasons: [...reasons].sort(),
    usedComponents,
  };
}

function stripCode(source: string): string {
  return source.replace(FENCED_CODE_RE, '').replace(INLINE_CODE_RE, '');
}

function collectComponents(stripped: string): ReadonlyArray<string> {
  const seen = new Set<string>();
  for (const match of stripped.matchAll(JSX_TAG_RE)) {
    const name = match[1] ?? '';
    if (name.length === 0) continue;
    const selfClosing = match[3] === '/';
    if (selfClosing) {
      seen.add(name);
      continue;
    }
    // Open tag without `/>` — only counts as JSX use if a matching closing
    // tag exists. Otherwise it's prose like `<NAME>` and would crash MDX.
    if (hasClosingTag(stripped, name)) {
      seen.add(name);
    }
  }
  return [...seen].sort();
}

function hasClosingTag(stripped: string, name: string): boolean {
  return new RegExp(`</${escapeRegex(name)}\\s*>`).test(stripped);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function starlightBuiltins(): ReadonlySet<string> {
  return STARLIGHT_BUILTINS;
}
