/**
 * Detect Material's `<!-- md:* -->` HTML-comment shortcodes and replace them
 * with literal text plus a sentinel comment so the converter's diagnostic
 * pipeline can find them.
 *
 * Material's docs use shortcodes like:
 *   <!-- md:version 8.3.0 -->
 *   <!-- md:flag experimental -->
 *   <!-- md:option name -->
 *   <!-- md:setting plugins.foo -->
 *   <!-- md:plugin search -->
 *   <!-- md:extension pymdownx.tabbed -->
 *   <!-- md:utility -->
 *   <!-- md:default none -->
 *
 * These are normally rendered as styled HTML badges by a hooks/shortcodes.py.
 * The converter has no access to the hook code, so we emit literal text in
 * place ("Available since: 8.3.0", "Experimental flag", etc.) and surface a
 * diagnostic so users can replace with proper components.
 *
 * Pure: text → text. Idempotent (replacement is plain text, no markers
 * remain).
 */

const SHORTCODE_RE = /<!--\s*md:([a-z][a-z0-9_-]*)\s*([^>]*?)-->/g;

export function normalizeMaterialShortcodes(source: string): string {
  return source.replace(SHORTCODE_RE, (_, kind: string, args: string) => {
    const trimmed = args.trim();
    return renderShortcode(kind, trimmed);
  });
}

function renderShortcode(kind: string, args: string): string {
  switch (kind) {
    case 'version':
      return args.length > 0 ? `Available since: ${args}` : 'Available since version: unknown';
    case 'flag':
      return `${capitalize(args)} flag`;
    case 'option':
      return `Option: \`${args}\``;
    case 'setting':
      return `Setting: \`${args}\``;
    case 'plugin':
      return `Plugin: \`${args}\``;
    case 'extension':
      return `Extension: \`${args}\``;
    case 'utility':
      return 'Utility';
    case 'default':
      return `Default: \`${args}\``;
    case 'sponsors':
      return 'Sponsors';
    default:
      return args.length > 0 ? `${capitalize(kind)}: ${args}` : capitalize(kind);
  }
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0]?.toUpperCase() + s.slice(1);
}
