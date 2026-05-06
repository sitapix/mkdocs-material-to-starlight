/**
 * Promote Material `<!-- md:* -->` HTML-comment shortcodes to Starlight
 * `<Badge>` JSX. Sample mappings:
 *
 *   <!-- md:version 8.3.0 -->     → <Badge text="Since 8.3.0" variant="note" />
 *   <!-- md:flag experimental --> → <Badge text="Experimental" variant="caution" />
 *   <!-- md:flag deprecated -->   → <Badge text="Deprecated" variant="danger" />
 *   <!-- md:flag required -->     → <Badge text="Required" variant="caution" />
 *   <!-- md:option name -->       → <Badge text="Option: name" variant="note" />
 *   <!-- md:setting foo -->       → <Badge text="Setting: foo" variant="note" />
 *   <!-- md:plugin search -->     → <Badge text="Plugin: search" variant="note" />
 *   <!-- md:default 'value' -->   → <Badge text="Default: value" variant="default" />
 *   <!-- md:sponsors -->          → <Badge text="Sponsors" variant="tip" />
 *
 * `<Badge>` is a Starlight built-in; mdx-detection promotes the file to
 * `.mdx` and injects the import.
 *
 * Pure and idempotent (the regex matches only `<!-- md:* -->`).
 */

const SHORTCODE_RE = /<!--\s*md:([a-z][a-z0-9_-]*)\s*([^>]*?)-->/g;

type BadgeVariant = 'default' | 'note' | 'tip' | 'caution' | 'danger' | 'success';

export function normalizeMaterialShortcodes(source: string): string {
  return source.replace(SHORTCODE_RE, (_, kind: string, args: string) => {
    const trimmed = args.trim();
    return renderBadge(kind, trimmed);
  });
}

function renderBadge(kind: string, args: string): string {
  const { text, variant } = badgeFor(kind, args);
  return `<Badge text=${jsxAttr(text)} variant="${variant}" />`;
}

function badgeFor(kind: string, args: string): { text: string; variant: BadgeVariant } {
  switch (kind) {
    case 'version':
      return {
        text: args.length > 0 ? `Since ${stripVersionPrefix(args)}` : 'Since unknown',
        variant: classifyVersion(args),
      };
    case 'flag':
      return { text: capitalize(args || 'Flag'), variant: classifyFlag(args) };
    case 'option':
      return { text: `Option: ${args}`, variant: 'note' };
    case 'setting':
      return { text: `Setting: ${args}`, variant: 'note' };
    case 'plugin':
      return { text: `Plugin: ${args}`, variant: 'note' };
    case 'extension':
      return { text: `Extension: ${args}`, variant: 'note' };
    case 'utility':
      return { text: 'Utility', variant: 'note' };
    case 'default':
      return { text: defaultText(args), variant: 'default' };
    case 'sponsors':
      return { text: 'Sponsors', variant: 'tip' };
    default:
      return {
        text: args.length > 0 ? `${capitalize(kind)}: ${args}` : capitalize(kind),
        variant: 'note',
      };
  }
}

function classifyVersion(args: string): BadgeVariant {
  if (args.startsWith('insiders')) return 'tip';
  if (args.startsWith('stable')) return 'success';
  return 'note';
}

function classifyFlag(args: string): BadgeVariant {
  if (args === 'deprecated') return 'danger';
  if (args === 'required' || args === 'experimental') return 'caution';
  return 'note';
}

function defaultText(args: string): string {
  if (args.length === 0) return 'Default';
  if (args === 'none') return 'No default';
  // Strip surrounding quotes commonly seen in Material docs (`'foo'` → `foo`).
  const stripped = args.replace(/^['"]|['"]$/g, '');
  return `Default: ${stripped}`;
}

function stripVersionPrefix(args: string): string {
  // `stable-1.2` → `1.2`; `insiders-4.10.0` → `4.10.0`; `1.2` → `1.2`.
  return args.replace(/^(stable|insiders)-/, '');
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0]?.toUpperCase() + s.slice(1);
}

/**
 * Format a string as a JSX attribute value. Prefer double quotes; fall back
 * to single quotes (or curly-brace expression) if the string contains them.
 */
function jsxAttr(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  // Both quote types present — emit as a JS expression with backticks.
  return `{\`${value.replace(/`/g, '\\`')}\`}`;
}
