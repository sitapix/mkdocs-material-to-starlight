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
const JSX_TAG_RE = /<([A-Z][A-Za-z0-9]*)\b/g;
const FRONTMATTER_EXPR_RE = /\{\s*frontmatter\.[A-Za-z_]/;
const FENCED_CODE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;

export type MdxExtension = 'md' | 'mdx';
export type MdxReason = 'import-statement' | 'jsx-component' | 'frontmatter-expression';

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
    if (name.length > 0) seen.add(name);
  }
  return [...seen].sort();
}

export function starlightBuiltins(): ReadonlySet<string> {
  return STARLIGHT_BUILTINS;
}
